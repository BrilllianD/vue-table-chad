import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
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
    ],
  },
  test: {
    environment: 'happy-dom',
    globals: true,
    include: ['tests/**/*.spec.ts'],
    benchmark: {
      include: ['bench/**/*.bench.ts'],
    },
  },
})
