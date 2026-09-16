import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitepress'
import { docPages } from '../nav'

const sections = ['Start here', 'Data', 'Features', 'Presentation', 'Going further'] as const

export default defineConfig({
  title: 'vue-table-chad',
  description: 'Composable headless table primitives for Vue 3',
  /*
   * `/` unless the deploy says otherwise, so `pnpm docs:dev` and
   * `pnpm docs:preview` keep working unprefixed. `pnpm build:site` sets it to
   * `/vue-table-chad/`, the subpath a GitHub project site is served from;
   * VitePress rewrites every internal link and asset URL with it, which is why
   * the `](/)` footers on the pages need no edit.
   */
  base: process.env.DOCS_BASE ?? '/',
  srcExclude: ['.vitepress/examples/*.vue'],
  themeConfig: {
    search: { provider: 'local' },
    sidebar: sections.map((text) => ({
      text,
      items: docPages
        .filter((p) => p.section === text)
        .map((p) => ({ text: p.title, link: `/${p.file.replace(/\.md$/, '')}` })),
    })),
    /*
     * `target` on purpose, and `_self` rather than `_blank`: the demo is a
     * separate Vite build sitting under the docs, not a VitePress page, and
     * VitePress's router intercepts same-origin clicks and renders its own 404
     * for any href it has no page for. Its click handler bails on any link
     * carrying a `target` attribute, which is what turns this back into an
     * ordinary navigation — in the same tab, as before.
     */
    nav: [{ text: 'Demo', link: '/demo/', target: '_self' }],
    socialLinks: [{ icon: 'github', link: 'https://github.com/BrilllianD/vue-table-chad' }],
  },
  vite: {
    resolve: {
      // An array, not an object: order matters. Both subpaths must be matched
      // before the bare package name, or the bare alias rewrites
      // `@brillliand/vue-table-chad/style.css` to `src/index.ts/style.css`.
      // `@fixtures` stays for `docs/examples/AddressesTable.vue` alone; the
      // live examples under `.vitepress/examples/` import nothing but `vue`
      // and the package, so a reader can paste one whole.
      alias: [
        { find: '@brillliand/vue-table-chad/style.css', replacement: fileURLToPath(new URL('../../src/components/preset/table.css', import.meta.url)) },
        { find: '@brillliand/vue-table-chad/locales', replacement: fileURLToPath(new URL('../../src/locales/index.ts', import.meta.url)) },
        { find: '@brillliand/vue-table-chad', replacement: fileURLToPath(new URL('../../src/index.ts', import.meta.url)) },
        { find: '@', replacement: fileURLToPath(new URL('../../src', import.meta.url)) },
        { find: '@fixtures', replacement: fileURLToPath(new URL('../../bench/fixtures.ts', import.meta.url)) },
      ],
    },
  },
})
