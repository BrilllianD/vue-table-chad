import DefaultTheme from 'vitepress/theme'
import type { Theme } from 'vitepress'
import Demo from './Demo.vue'

// After the default theme, not before: a side-effect CSS import lands in the
// bundle where it is written, so this is what puts the nav rules after
// VitePress's own rather than under them.
import './custom.css'

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('Demo', Demo)
  },
} satisfies Theme
