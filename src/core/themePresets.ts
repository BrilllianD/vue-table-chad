/**
 * The names of the palettes shipped as stylesheets, and the type behind them.
 *
 * `core/`, not `components/`: this is a list of strings. It imports nothing,
 * and in particular it does not import the stylesheets — a preset costs a
 * consumer nothing until they import its file themselves.
 */

/**
 * Every palette shipped under `@brillliand/vue-table-chad/themes/`.
 *
 * A name is the file's basename and the value of the `data-vtc-theme`
 * attribute that selects it, both at once:
 *
 * ```ts
 * import '@brillliand/vue-table-chad/themes/dracula.css'
 * ```
 * ```html
 * <html data-vtc-theme="dracula">
 * ```
 *
 * The attribute is read on any ancestor, so `<html>` themes the popovers that
 * teleport to `<body>` as well. `tests/themePresets.spec.ts` fails if this list
 * and the directory disagree, so importing a name from here cannot 404.
 */
export const themePresets = [
  'ayu-dark',
  'ayu-light',
  'ayu-mirage',
  'catppuccin-frappe',
  'catppuccin-latte',
  'catppuccin-macchiato',
  'catppuccin-mocha',
  'dracula',
  'everforest-dark',
  'everforest-light',
  'github-dark',
  'github-light',
  'gruvbox-dark',
  'gruvbox-light',
  'kanagawa-dragon',
  'kanagawa-lotus',
  'kanagawa-wave',
  'material',
  'monokai',
  'monokai-pro',
  'nightfox',
  'nord',
  'one-dark',
  'one-light',
  'rose-pine',
  'rose-pine-dawn',
  'rose-pine-moon',
  'solarized-dark',
  'solarized-light',
  'tokyo-night',
] as const

/** One shipped palette's name — the file's basename, and the attribute value. */
export type ThemePreset = (typeof themePresets)[number]
