/**
 * Folds the built demo into one self-contained HTML file.
 *
 * The demo is a docs site with nowhere to live yet — there is no repository and
 * no host until Phase 3 wires one up. A single file can be published as an
 * Artifact in the meantime, which needs everything inlined: the Artifact CSP
 * blocks requests to any external host, script and stylesheet alike.
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

const js = files.find((name) => name.endsWith('.js'))
const css = files.find((name) => name.endsWith('.css'))
if (!js || !css) throw new Error('demo/dist/assets is missing a build — run pnpm build:demo first')

const script = readFileSync(join(assets, js), 'utf8')
const styles = readFileSync(join(assets, css), 'utf8')

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
<title>vue-table</title>
<style>${themeShim}${styles}</style>
<div id="app"></div>
<script type="module">${script}<\/script>
`

const out = join(dist, 'standalone.html')
writeFileSync(out, html)

const kb = (n) => `${(n / 1024).toFixed(0)} kB`
console.log(`${out}  ${kb(html.length)}  (js ${kb(script.length)}, css ${kb(styles.length)})`)
