import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitepress'
import { docPages } from '../nav'

const sections = ['Start here', 'Data', 'Features', 'Presentation', 'Going further'] as const

export default defineConfig({
  title: 'vue-table-chad',
  description: 'Composable headless table primitives for Vue 3',
  srcExclude: ['.vitepress/examples/*.vue'],
  themeConfig: {
    search: { provider: 'local' },
    sidebar: sections.map((text) => ({
      text,
      items: docPages
        .filter((p) => p.section === text)
        .map((p) => ({ text: p.title, link: `/${p.file.replace(/\.md$/, '')}` })),
    })),
    nav: [{ text: 'Demo', link: '/demo/' }],
    socialLinks: [{ icon: 'bitbucket', link: 'https://bitbucket.org/BrilllianD/vue-table-chad' }],
  },
  vite: {
    resolve: {
      alias: {
        '@brillliand/vue-table-chad': fileURLToPath(new URL('../../src/index.ts', import.meta.url)),
        '@': fileURLToPath(new URL('../../src', import.meta.url)),
        '@fixtures': fileURLToPath(new URL('../../bench/fixtures.ts', import.meta.url)),
      },
    },
  },
})
