import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The prose is split across a landing README and eight `docs/` pages, which
 * means it is now held together by about forty relative links. Documentation
 * rots; links rot faster, and silently — nothing in a build ever follows one.
 *
 * So they are followed here. Same shape as `tests/apiReference.spec.ts`: prove
 * the scan found something first, then diff.
 */
const ROOT = resolve(process.cwd())
const SKIP = new Set(['node_modules', 'dist', '.git', '.idea', 'coverage'])

function markdownFiles(dir = ROOT): string[] {
  const found: string[] = []
  for (const entry of readdirSync(dir)) {
    if (SKIP.has(entry)) continue
    if (entry === 'DOC_PLAN.md') continue // working plan, not shipped documentation
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) found.push(...markdownFiles(path))
    else if (entry.endsWith('.md')) found.push(path)
  }
  return found
}

interface Link {
  file: string
  line: number
  target: string
}

/**
 * Every relative link, from both `[text](target)` and `[label]: target`.
 *
 * Fenced code blocks are skipped: a README that shows a markdown example, or
 * any snippet containing brackets followed by parentheses, would otherwise
 * produce link-shaped matches that point nowhere by design.
 */
function relativeLinks(): Link[] {
  const links: Link[] = []
  for (const file of markdownFiles()) {
    let fenced = false
    readFileSync(file, 'utf8').split('\n').forEach((text, index) => {
      if (/^\s*```/.test(text)) fenced = !fenced
      if (fenced) return
      const matches = [...text.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g), ...text.matchAll(/^\[[^\]]+\]:\s*(\S+)/g)]
      for (const match of matches) {
        const target = match[1]!
        if (/^(https?:|mailto:|#)/.test(target)) continue
        // `/demo/` is the one site-absolute target here, and it resolves to no
        // file on purpose: the demo is a separate Vite build served under the
        // docs, not a VitePress page — see `.vitepress/config.ts`. Exempted by
        // name rather than by pattern, so a mistyped `/page` still fails.
        if (target === '/demo/') continue
        links.push({ file, line: index + 1, target })
      }
    })
  }
  return links
}

describe('docs links', () => {
  const files = markdownFiles()
  const links = relativeLinks()
  const show = (file: string) => relative(ROOT, file)

  it('found a plausible set of docs to check', () => {
    // Guards the walk and the pattern together: a wrong glob or a regex that
    // matched nothing would make every assertion below vacuously true.
    expect(files.length, 'markdown files found').toBeGreaterThanOrEqual(12)
    expect(links.length, 'relative links found').toBeGreaterThanOrEqual(20)
  })

  it('resolves every relative link', () => {
    const broken = links
      .filter(({ file, target }) => !existsSync(resolve(dirname(file), target.split('#')[0]!)))
      .map(({ file, line, target }) => `${show(file)}:${line} -> ${target}`)
    expect(broken, 'links pointing at files that do not exist').toEqual([])
  })

  it('links every docs page from the README', () => {
    // A page nothing points at is a page nobody reads. This is what stops the
    // split from quietly leaving one behind.
    const readme = readFileSync(resolve(ROOT, 'README.md'), 'utf8')
    const orphans = readdirSync(resolve(ROOT, 'docs'))
      .filter((name) => name.endsWith('.md'))
      .filter((name) => name !== 'index.md') // VitePress site home, not a topic page
      .filter((name) => !readme.includes(`docs/${name}`))
    expect(orphans, 'docs/ pages the README never links to').toEqual([])
  })

  it('imports only names the library exports', () => {
    /*
     * The examples are the first thing anyone copies, and P3-1 renames the
     * package across every one of them. This is what makes that rename — or
     * any export that gets dropped — fail loudly instead of shipping snippets
     * that cannot run.
     */
    const exported = new Set<string>()
    const index = readFileSync(resolve(ROOT, 'src/index.ts'), 'utf8')
    for (const block of index.matchAll(/export\s*(?:type)?\s*\{([^}]*)\}/g)) {
      for (const raw of block[1]!.split(',')) {
        const entry = raw.trim().replace(/^type\s+/, '')
        if (!entry) continue
        const aliased = entry.match(/\bas\s+(\w+)/)
        exported.add(aliased ? aliased[1]! : entry.split(/\s/)[0]!)
      }
    }
    expect(exported.size, 'names parsed out of src/index.ts').toBeGreaterThan(100)

    const unknown: string[] = []
    for (const file of files) {
      readFileSync(file, 'utf8').split('\n').forEach((text, index) => {
        const match = text.match(/^\s*import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+'@brillliand\/vue-table-chad'/)
        if (!match) return
        for (const raw of match[1]!.split(',')) {
          const name = raw.trim().replace(/^type\s+/, '').split(/\s/)[0]
          if (name && !exported.has(name)) unknown.push(`${show(file)}:${index + 1} -> ${name}`)
        }
      })
    }
    expect(unknown, 'names imported in docs that src/index.ts does not export').toEqual([])
  })
})
