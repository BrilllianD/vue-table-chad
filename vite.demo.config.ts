import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  root: fileURLToPath(new URL('./demo', import.meta.url)),
  plugins: [vue()],
  resolve: {
    alias: {
      '@sandbox/vue-table': fileURLToPath(new URL('./src/index.ts', import.meta.url)),
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@fixtures': fileURLToPath(new URL('./bench/fixtures.ts', import.meta.url)),
    },
  },
  // 5174 so the demo and the playground can run side by side.
  server: { port: 5174, open: false },
})
