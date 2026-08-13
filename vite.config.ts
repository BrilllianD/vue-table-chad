import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import dts from 'vite-plugin-dts'

export default defineConfig({
  plugins: [
    vue(),
    dts({ tsconfigPath: './tsconfig.build.json', rollupTypes: false }),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    lib: {
      entry: fileURLToPath(new URL('./src/index.ts', import.meta.url)),
      name: 'VueTable',
      fileName: 'vue-table',
      formats: ['es'],
    },
    rollupOptions: {
      external: ['vue'],
      output: { globals: { vue: 'Vue' }, assetFileNames: 'vue-table.[ext]' },
    },
  },
})
