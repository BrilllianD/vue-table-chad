import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { highlight } from './scripts/vite-plugin-highlight.ts'

export default defineConfig({
  root: fileURLToPath(new URL('./demo', import.meta.url)),
  // `highlight` declares `enforce: 'pre'` so it claims `.vue?highlight` ids
  // before the Vue plugin tries to compile them as components.
  plugins: [highlight(), vue()],
  resolve: {
    alias: {
      '@brillliand/vue-table-chad': fileURLToPath(new URL('./src/index.ts', import.meta.url)),
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@fixtures': fileURLToPath(new URL('./bench/fixtures.ts', import.meta.url)),
      '@docs': fileURLToPath(new URL('./docs/nav.ts', import.meta.url)),
    },
  },
  // 5174 so the demo and the playground can run side by side.
  server: { port: 5174, open: false },
})
