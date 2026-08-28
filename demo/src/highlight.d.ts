/**
 * `?highlight` imports are served by `scripts/vite-plugin-highlight.ts`, which
 * reads the file and returns its source twice: once as Shiki's markup, once as
 * the plain text the Copy button writes to the clipboard.
 */
declare module '*?highlight' {
  const example: { html: string; code: string }
  export default example
}
