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
      // Two entries, not one: `locales/` is strings and imports no runtime
      // value from `core/`, so keeping it out of the main chunk means a
      // consumer who imports no locale ships none — rather than trusting every
      // downstream bundler to shake four frozen objects back out.
      entry: {
        'vue-table-chad': fileURLToPath(new URL('./src/index.ts', import.meta.url)),
        locales: fileURLToPath(new URL('./src/locales/index.ts', import.meta.url)),
      },
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
