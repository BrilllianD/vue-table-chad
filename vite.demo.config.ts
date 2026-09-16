import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { highlight } from './scripts/vite-plugin-highlight.ts'

export default defineConfig({
  root: fileURLToPath(new URL('./demo', import.meta.url)),
  /*
   * `/` unless the deploy says otherwise. `pnpm demo` serves the root of its
   * own dev server, and `demo/inline.mjs` inlines the assets into one file with
   * no host under it at all — a prefix would be wrong for both. Only
   * `pnpm build:site` sets this, to the subpath GitHub Pages serves the demo
   * from.
   */
  base: process.env.DEMO_BASE ?? '/',
  // `highlight` declares `enforce: 'pre'` so it claims `.vue?highlight` ids
  // before the Vue plugin tries to compile them as components.
  plugins: [highlight(), vue()],
  resolve: {
    // An array, not an object: order matters. The stylesheet subpath must be
    // matched before the bare package name, or the bare alias rewrites
    // `@brillliand/vue-table-chad/style.css` to `src/index.ts/style.css`.
    alias: [
      { find: '@brillliand/vue-table-chad/style.css', replacement: fileURLToPath(new URL('./src/components/preset/table.css', import.meta.url)) },
      { find: '@brillliand/vue-table-chad/locales', replacement: fileURLToPath(new URL('./src/locales/index.ts', import.meta.url)) },
      { find: '@brillliand/vue-table-chad', replacement: fileURLToPath(new URL('./src/index.ts', import.meta.url)) },
      { find: '@', replacement: fileURLToPath(new URL('./src', import.meta.url)) },
      { find: '@fixtures', replacement: fileURLToPath(new URL('./bench/fixtures.ts', import.meta.url)) },
      { find: '@docs', replacement: fileURLToPath(new URL('./docs/nav.ts', import.meta.url)) },
    ],
  },
  // 5174 so the demo and the playground can run side by side.
  server: { port: 5174, open: false },
})
