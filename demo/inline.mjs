/**
 * Folds the built demo into one self-contained HTML file.
 *
 * The demo is a docs site with no real host yet: the remote is Bitbucket, and
 * P3-9 is what wires up a proper host for it alongside the VitePress docs
 * site. Until then, a single file can be published as an Artifact, which
 * needs everything inlined: the Artifact CSP blocks requests to any external
 * host, script and stylesheet alike.
 *
 *   pnpm build:demo && node demo/inline.mjs   ->  demo/dist/standalone.html
 *
 * The output is body content only. The Artifact host supplies the doctype,
 * <head> and <body> around it, so emitting our own would nest a document
 * inside a document.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const dist = new URL('./dist/', import.meta.url).pathname
const assets = join(dist, 'assets')
const files = readdirSync(assets)

/*
 * Exactly one of each, asserted rather than assumed.
 *
 * Taking the first match would quietly inline one arbitrary chunk and drop the
 * rest the moment the demo gains a dynamic `import()` or Vite splits a vendor
 * bundle — producing a standalone file that throws at load, with nothing here
 * having complained. Inlining several would mean ordering them correctly and
 * resolving the imports between them, which is a real change; failing loudly
 * is the honest placeholder until it is needed.
 */
const js = files.filter((name) => name.endsWith('.js'))
const css = files.filter((name) => name.endsWith('.css'))
if (js.length === 0 || css.length === 0) {
  throw new Error('demo/dist/assets is missing a build — run pnpm build:demo first')
}
if (js.length > 1 || css.length > 1) {
  throw new Error(
    `demo/dist/assets holds ${js.length} scripts and ${css.length} stylesheets; this script ` +
      'inlines one of each. A code-split demo needs it taught to inline them all, in order.',
  )
}

/*
 * `</script>` anywhere in the bundle would end the tag early and leave the
 * browser parsing the rest of it as markup. Escaping the slash keeps the string
 * identical to JavaScript while hiding it from the HTML parser.
 *
 * This currently replaces nothing, and is kept anyway. The demo really does
 * carry the sequence — a `<script setup>` code sample shown to the reader —
 * but esbuild emits it into the bundle already escaped, so it arrives here as
 * `<\/script>`. That is the emitter's courtesy rather than a guarantee we
 * hold, and the failure it prevents is a blank page with nothing in this script
 * having complained.
 */
const script = readFileSync(join(assets, js[0]), 'utf8').replace(/<\/script/gi, '<\\/script')
const styles = readFileSync(join(assets, css[0]), 'utf8')

/*
 * The one thing the shell adds on its own.
 *
 * The demo paints itself with the `Canvas` and `CanvasText` system colours,
 * which follow `prefers-color-scheme` and nothing else. An Artifact viewer who
 * has explicitly chosen a theme gets `data-theme` stamped on the root instead,
 * and system colours cannot see it — so a viewer on a dark OS who picked light
 * would get the wrong ground. Mapping the stamp onto `color-scheme` makes the
 * system colours resolve the way the viewer asked, without touching a single
 * one of the demo's own rules.
 */
const themeShim = `
:root[data-theme="light"] { color-scheme: light; }
:root[data-theme="dark"] { color-scheme: dark; }
`

/*
 * Emitted before anything else. The demo's markup carries real non-ASCII —
 * pagination chevrons, em dashes, the star a rating renders — and a host that
 * served this file without a charset would decode it as Latin-1 and print
 * mojibake. A declaration this early is caught by the parser's pre-scan.
 */
const html = `<meta charset="utf-8">
<title>vue-table-chad</title>
<style>${themeShim}${styles}</style>
<div id="app"></div>
<script type="module">${script}<\/script>
`

const out = join(dist, 'standalone.html')
writeFileSync(out, html)

const kb = (n) => `${(n / 1024).toFixed(0)} kB`
console.log(`${out}  ${kb(html.length)}  (js ${kb(script.length)}, css ${kb(styles.length)})`)
