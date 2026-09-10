/**
 * Copies the palette stylesheets into `dist/themes/`.
 *
 * Vite's library build only emits CSS that something imports, and nothing
 * imports these on purpose: a preset is opt-in, so folding it into
 * `vue-table-chad.css` would ship thirty palettes to every consumer to give
 * one of them the one they asked for. They are plain files with no build step
 * of their own, so copying them is the whole job.
 */
import { copyFileSync, mkdirSync, readdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const from = resolve(root, 'src/components/preset/styles/themes')
const to = resolve(root, 'dist/themes')

mkdirSync(to, { recursive: true })

const files = readdirSync(from).filter((name) => name.endsWith('.css'))
// An empty copy would leave `exports['./themes/*.css']` pointing at nothing,
// and the failure would surface as a consumer's unresolved import instead.
if (files.length === 0) {
  console.error('copy-themes: no stylesheets in src/components/preset/styles/themes')
  process.exit(1)
}

for (const name of files) copyFileSync(resolve(from, name), resolve(to, name))

console.log(`copy-themes: ${files.length} palettes -> dist/themes/`)
