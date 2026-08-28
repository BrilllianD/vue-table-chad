import { readFileSync, readdirSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The demo shows each view's docs example rather than a copy of it, and this is
 * what keeps that true — see `demo/src/examples.ts`. Four ways the two
 * directories can drift apart, each failing with the offender's name rather
 * than a bare boolean, in the style of `tests/apiSurface.spec.ts`.
 *
 * `examples.ts` is read as text rather than imported: its `?highlight` imports
 * are served by a Vite plugin that only runs in the demo's build, so importing
 * the module here would need the plugin, and the plugin would need a
 * highlighter — to check a table of strings.
 */
const ROOT = resolve(import.meta.dirname, '..')
const EXAMPLES_DIR = resolve(ROOT, 'docs/.vitepress/examples')
const EXAMPLES_TS = resolve(ROOT, 'demo/src/examples.ts')
const APP_VUE = resolve(ROOT, 'demo/src/App.vue')
const DOCS = resolve(ROOT, 'docs')

const examplesSource = readFileSync(EXAMPLES_TS, 'utf8')

interface TabEntry {
  tab: string
  files: string[]
  why: string | undefined
}

/** The `examplesByTab` literal, as the data it declares. */
function tabEntries(): TabEntry[] {
  const start = examplesSource.indexOf('export const examplesByTab')
  const end = examplesSource.indexOf('\n}\n', start)
  const body = examplesSource.slice(start, end)

  // No entry body contains a `}`, so the first one closes it — which is what
  // lets one pattern read both the one-line entries and the wrapped ones.
  return [...body.matchAll(/\n\s{2}'?([\w-]+)'?:\s*\{([^}]*)\}/g)].map((match) => {
    const [, tab, entry] = match as unknown as [string, string, string]
    return {
      tab,
      files: [...entry.matchAll(/'([^']+\.vue)'/g)].map((m) => m[1]!),
      why: /why:\s*'((?:[^'\\]|\\.)*)'/.exec(entry)?.[1],
    }
  })
}

/**
 * Tab ids as `App.vue` declares them.
 *
 * Bounded by the `satisfies` that closes the literal rather than by the first
 * `]`: the `layers` array below it has `id` fields too, and reading past the
 * end would report `preset` and `primitives` as tabs with no example.
 */
function tabIds(): string[] {
  const text = readFileSync(APP_VUE, 'utf8')
  const start = text.indexOf('const tabs')
  const source = text.slice(start, text.indexOf('] satisfies', start))
  return [...source.matchAll(/\{\s*id:\s*'([^']+)'/g)].map((m) => m[1]!)
}

function exampleFilesOnDisk(): string[] {
  return readdirSync(EXAMPLES_DIR).filter((name) => name.endsWith('.vue'))
}

describe('demo examples', () => {
  it('has an entry for every demo tab', () => {
    const known = new Set(tabEntries().map((entry) => entry.tab))
    const missing = tabIds().filter((id) => !known.has(id))
    expect(missing, 'tabs in demo/src/App.vue with no entry in demo/src/examples.ts').toEqual([])
  })

  it('names only example files that exist on disk', () => {
    const onDisk = new Set(exampleFilesOnDisk())
    const missing = tabEntries()
      .flatMap((entry) => entry.files.map((file) => ({ tab: entry.tab, file })))
      .filter(({ file }) => !onDisk.has(file))
      .map(({ tab, file }) => `${tab}: ${file}`)
    expect(missing, 'files named in demo/src/examples.ts with nothing under docs/.vitepress/examples/').toEqual([])
  })

  it('makes every tab without an example say why', () => {
    const silent = tabEntries()
      .filter((entry) => entry.files.length === 0 && !entry.why?.trim())
      .map((entry) => entry.tab)
    expect(silent, 'tabs opting out of a source panel with no `why` to show instead').toEqual([])
  })

  /*
   * The direction that catches an example written and then forgotten. The
   * point of reusing the docs directory is that everything in it is a file
   * that runs somewhere a reader can see it.
   */
  it('leaves no example file unreferenced', () => {
    const shown = new Set(tabEntries().flatMap((entry) => entry.files))
    const docsText = readdirSync(DOCS)
      .filter((name) => name.endsWith('.md'))
      .map((name) => readFileSync(resolve(DOCS, name), 'utf8'))
      .join('\n')

    const orphans = exampleFilesOnDisk().filter(
      (file) => !shown.has(file) && !docsText.includes(`examples/${file}`),
    )
    expect(
      orphans,
      `files under ${relative(ROOT, EXAMPLES_DIR)} shown by no demo tab and mounted by no docs page`,
    ).toEqual([])
  })
})
