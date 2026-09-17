import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { docPages } from '../docs/nav.ts'
import { generate, TARGETS } from '../scripts/generate-docs-index.ts'

/**
 * `docs/nav.ts` is the single source of truth for the page list — see
 * `DOC_PLAN.md`. This is what keeps it that way: the README table and both
 * getting-started indexes are generated from it (`pnpm docs:index`), and this
 * spec fails loudly, naming the offender, whenever any of the things that
 * have to agree with it stop agreeing.
 *
 * Modeled on `tests/apiSurface.spec.ts`: name the offender, never just assert
 * a boolean.
 */

const ROOT = resolve(import.meta.dirname, '..')
const DOCS = resolve(ROOT, 'docs')

/** `docs/index.md` (the VitePress home) and `docs/examples/**` are not topic pages. */
function topicPageFiles(): string[] {
  return readdirSync(DOCS)
    .filter((name) => name.endsWith('.md'))
    .filter((name) => name !== 'index.md')
}

describe('docs index', () => {
  it('lists every docs/*.md topic page in docPages', () => {
    const known = new Set(docPages.map((p) => p.file))
    const orphans = topicPageFiles().filter((file) => !known.has(file))
    expect(orphans, 'docs/*.md pages missing from docPages').toEqual([])
  })

  it('names only files that exist on disk', () => {
    const missing = docPages.filter((p) => !existsSync(resolve(DOCS, p.file))).map((p) => p.file)
    expect(missing, 'docPages entries with no file on disk').toEqual([])
  })

  it('has committed index tables regenerated from docs/nav.ts', () => {
    const drifted = TARGETS.filter((t) => {
      const before = readFileSync(t.path, 'utf8')
      return generate(t.path, t.kind, t.render) !== before
    }).map((t) => relative(ROOT, t.path))
    expect(drifted, 'out of date with docs/nav.ts — run `pnpm docs:index`').toEqual([])
  })

  it('matches every demoTabs entry to a real tab id in demo/src/App.vue', () => {
    const text = readFileSync(resolve(ROOT, 'demo/src/App.vue'), 'utf8')
    const start = text.indexOf('const tabs')
    const end = text.indexOf('\n]', start)
    const tabsSource = text.slice(start, end)
    const known = new Set([...tabsSource.matchAll(/\{\s*id:\s*'([^']+)'/g)].map((m) => m[1]!))

    const bad: string[] = []
    for (const page of docPages) {
      for (const tab of page.demoTabs) {
        if (!known.has(tab)) bad.push(`${page.file}: unknown tab id '${tab}'`)
      }
    }
    expect(bad, 'demoTabs entries with no matching tab in demo/src/App.vue').toEqual([])
  })

  it('ends every page with the standard docs-index footer', () => {
    const missing = docPages
      .filter((p) => {
        const text = readFileSync(resolve(DOCS, p.file), 'utf8')
        return !/^Live: .*Back to the \[docs index\]\(\/\)\.$/m.test(text)
      })
      .map((p) => p.file)
    expect(missing, 'pages missing the "Live: … Back to the [docs index](/)." footer').toEqual([])
  })

  it('resolves every relative .md link under docs/** and in README.md', () => {
    const files = [resolve(ROOT, 'README.md'), ...walkMarkdown(DOCS)]
    const broken: string[] = []

    for (const file of files) {
      let fenced = false
      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, index) => {
          if (/^\s*```/.test(line)) fenced = !fenced
          if (fenced) return
          for (const match of line.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
            const target = match[1]!
            if (/^(https?:|mailto:|#)/.test(target)) continue
            // `/demo/` is the one site-absolute target here, and it resolves to
            // no file on purpose: the demo is a separate Vite build served
            // under the docs, not a VitePress page — see `.vitepress/config.ts`.
            // Exempted by name rather than by pattern, so a mistyped `/page`
            // still fails.
            if (target === '/demo/') continue
            const clean = target.split('#')[0]!
            if (!clean) continue
            if (!existsSync(resolve(dirname(file), clean))) {
              broken.push(`${relative(ROOT, file)}:${index + 1} -> ${target}`)
            }
          }
        })
    }
    expect(broken, 'relative .md links pointing at files that do not exist').toEqual([])
  })
})

function walkMarkdown(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walkMarkdown(full, out)
    else if (entry.endsWith('.md')) out.push(full)
  }
  return out
}
