import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The source imports `table.css` from `DataTable.vue`, but the shipped JS does
 * not: the lib build extracts the CSS to `dist/vue-table-chad.css`
 * (`exports['./style.css']`) and keeps no import. Prose written from the
 * source ("`DataTable` imports its stylesheet itself, the line is redundant")
 * is therefore wrong for a consumer, who gets an unstyled table when they
 * drop the import. This guard fails when any of those texts claims it again.
 */
const ROOT = resolve(process.cwd())
const IMPORT_LINE = "import '@brillliand/vue-table-chad/style.css'"

const docsPages = readdirSync(join(ROOT, 'docs'))
  .filter((name) => name.endsWith('.md'))
  .map((name) => `docs/${name}`)

const SOURCES = [
  ...docsPages,
  'src/index.ts',
  'src/components/preset/DataTable.vue',
  'demo/src/views/ThemingView.vue',
]

const FALSE_CLAIMS = [
  /imports (it|`table\.css`|the default theme) itself/i,
  /redundant when you use the preset/i,
  /styled out of the box/i,
]

const read = (file: string): string => readFileSync(join(ROOT, file), 'utf8')

describe('stylesheet docs', () => {
  it('scans the docs pages and the three source files', () => {
    expect(docsPages.length).toBeGreaterThan(5)
    expect(SOURCES).toContain('src/index.ts')
  })

  it.each(SOURCES)('%s does not claim DataTable loads its stylesheet itself', (file) => {
    const text = read(file)
    for (const claim of FALSE_CLAIMS) {
      expect(text.match(claim)?.[0], `${file} matches ${claim}`).toBeUndefined()
    }
  })

  it.each(['docs/getting-started.md', 'docs/getting-started-js.md', 'docs/styling.md'])(
    '%s shows the style.css import',
    (file) => {
      expect(read(file), file).toContain(IMPORT_LINE)
    },
  )
})
