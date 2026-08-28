import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import dts from 'vite-plugin-dts'

export default defineConfig({
  plugins: [
    vue(),
    dts({ tsconfigPath: './tsconfig.build.json', rollupTypes: true }),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    lib: {
      entry: fileURLToPath(new URL('./src/index.ts', import.meta.url)),
      fileName: 'vue-table-chad',
      // ESM only, deliberately — see package.json's exports map. `name` and
      // `output.globals` were the UMD/IIFE half of this config and did nothing
      // under `formats: ['es']`.
      formats: ['es'],
    },
    rollupOptions: {
      external: ['vue'],
      output: { assetFileNames: 'vue-table-chad.[ext]' },
    },
  },
})
