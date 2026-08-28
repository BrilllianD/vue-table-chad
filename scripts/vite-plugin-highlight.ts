import { readFile } from 'node:fs/promises'
import type { Plugin } from 'vite'
import { createHighlighter, type Highlighter } from 'shiki'

/**
 * `import example from './x.vue?highlight'` -> `{ html, code }`, highlighted at
 * build time.
 *
 * The demo shows the source of the docs examples, and those are real `.vue`
 * files that the docs site mounts and `pnpm typecheck` covers. Showing them
 * means turning a file into markup; doing that here rather than in the browser
 * is what keeps Shiki — a few hundred kB of grammars and themes — out of the
 * bundle entirely. `demo/inline.mjs` asserts the built demo is exactly one
 * script and one stylesheet, and a runtime highlighter would split it.
 *
 * Two details that are load-bearing:
 *
 * - `enforce: 'pre'`, so `@vitejs/plugin-vue` never sees a `.vue?highlight` id
 *   and tries to compile it as a component.
 * - both `html` *and* `code` are emitted. The Copy button needs the source, not
 *   the spans, and re-deriving it from the markup in the browser would mean
 *   parsing HTML to get back a file we already had.
 */

/** Everything after this suffix is ours; a bare `.vue` import is untouched. */
const SUFFIX = '?highlight'

/**
 * The id `resolveId` hands back, with the real path as a query parameter.
 *
 * It cannot be `<path>.vue?highlight`, which is the obvious shape and the wrong
 * one: `@vitejs/plugin-vue` decides what to compile from the id with its query
 * *stripped*, so any id whose path ends in `.vue` is compiled as a component no
 * matter what the query says — `enforce: 'pre'` orders the hooks, it does not
 * hide the id. Moving the path into the query leaves a virtual id ending in
 * neither `.vue` nor anything else a plugin claims. The leading NUL is
 * Rollup's convention for exactly that.
 */
const VIRTUAL = '\0highlight?file='

/**
 * Dual themes rather than one.
 *
 * Shiki emits `--shiki-light` / `--shiki-dark` custom properties per token
 * instead of two copies of the markup, so one panel recolours under
 * `prefers-color-scheme` with no JavaScript and no second render. This is what
 * VitePress itself does, which is also why the demo and the docs site end up
 * looking identical.
 */
const THEMES = { light: 'github-light', dark: 'github-dark' } as const

export function highlight(): Plugin {
  // Created lazily and reused: loading the grammars and themes is the
  // expensive part, and there is one of each for however many examples.
  let ready: Promise<Highlighter> | undefined

  function highlighter(): Promise<Highlighter> {
    ready ??= createHighlighter({
      langs: ['vue'],
      themes: [THEMES.light, THEMES.dark],
    })
    return ready
  }

  return {
    name: 'vue-table-chad:highlight',
    enforce: 'pre',

    /*
     * Resolved here rather than left to Vite's own resolver, which would strip
     * the query and hand the `.vue` file to the Vue plugin. The path is
     * resolved relative to the importer and then folded into a virtual id, so
     * it stays ours all the way to `load`.
     */
    async resolveId(source, importer) {
      if (!source.endsWith(SUFFIX)) return null
      const resolved = await this.resolve(source.slice(0, -SUFFIX.length), importer, {
        skipSelf: true,
      })
      return resolved ? `${VIRTUAL}${resolved.id}` : null
    },

    async load(id) {
      if (!id.startsWith(VIRTUAL)) return null
      const file = id.slice(VIRTUAL.length)
      // Trimmed: a file's trailing newline is invisible in an editor and an
      // empty numbered line in a panel.
      const code = (await readFile(file, 'utf8')).trimEnd()
      /*
       * `defaultColor: false` is what makes the dual themes usable rather than
       * decorative. With a default colour Shiki writes the light value as an
       * inline `color:` and the dark one as a custom property — and an inline
       * style beats a stylesheet, so the dark rule in `styles.css` would never
       * win. Turning it off emits both as `--shiki-light` / `--shiki-dark` and
       * leaves the choice to CSS, which is the only place that knows the
       * reader's colour scheme.
       */
      const html = (await highlighter()).codeToHtml(code, {
        lang: 'vue',
        themes: THEMES,
        defaultColor: false,
      })

      // Editing an example hot-reloads the demo. Without this the module has
      // no file dependency Vite can see — the id is synthetic.
      this.addWatchFile(file)

      return `export default ${JSON.stringify({ html, code })}`
    },
  }
}
