# Theme presets

Thirty colour palettes ship as stylesheets. Each is opt-in: nothing imports them, so a palette you
do not use costs you nothing.

```ts
import '@brillliand/vue-table-chad/style.css'
import '@brillliand/vue-table-chad/themes/dracula.css'
```

```html
<html data-vtc-theme="dracula">
```

That is the whole API. The attribute's value is the file's basename, and `themePresets` is the same
list in TypeScript if you are building a picker:

```ts
import { themePresets, type ThemePreset } from '@brillliand/vue-table-chad'
```

## A palette is nine colours

A preset sets nine custom properties and no others:

`--vtc-bg`, `--vtc-header-bg`, `--vtc-text`, `--vtc-text-muted`, `--vtc-border`,
`--vtc-border-strong`, `--vtc-accent`, `--vtc-accent-contrast`, `--vtc-danger`.

Everything else colour-valued in the theme is `color-mix`-derived from those: the header label
colour, every hover and cursor wash, the selected-row tint, the loading scrim, striping, the focus
ring and every border colour. So a palette follows through the whole table without listing any of
it — and a preset that *did* restate a derived value would be pinning something meant to move.
[`styling.md`](styling.md) has the full token list and the derivations.

## Where the attribute goes

Put it on `<html>` (or `<body>`). The filter popover and the column drag ghost teleport to
`<body>`, so they are not descendants of the table once they are open — an attribute inside the
table's own subtree themes the table and leaves its popovers on the default palette.

`data-vtc-theme` is read from an ancestor **and** on the element, so
`<div data-vtc-theme="nord">` around one table works when a page shows several palettes at once;
the trade is that that table's popovers fall back, since nothing above `<body>` said Nord.

It is a separate attribute from the `theme` prop's `data-theme`, whose values are only `light`,
`dark` and `system`. A preset wins over both the `prefers-color-scheme` default and `data-theme`,
by specificity rather than by import order — so a *light* preset stays light on a machine in dark
mode.

## Overriding one

A preset is a stylesheet, so anything inline beats it. `defineTheme` is the way to put a brand
accent on top of a palette:

```vue
<DataTable :style="defineTheme({ accent: '#ff8c00' })" />
```

## The palettes

| Name |
| --- |
| `ayu-dark` |
| `ayu-light` |
| `ayu-mirage` |
| `catppuccin-frappe` |
| `catppuccin-latte` |
| `catppuccin-macchiato` |
| `catppuccin-mocha` |
| `dracula` |
| `everforest-dark` |
| `everforest-light` |
| `github-dark` |
| `github-light` |
| `gruvbox-dark` |
| `gruvbox-light` |
| `kanagawa-dragon` |
| `kanagawa-lotus` |
| `kanagawa-wave` |
| `material` |
| `monokai` |
| `monokai-pro` |
| `nightfox` |
| `nord` |
| `one-dark` |
| `one-light` |
| `rose-pine` |
| `rose-pine-dawn` |
| `rose-pine-moon` |
| `solarized-dark` |
| `solarized-light` |
| `tokyo-night` |

Each file names, in a comment, which of its upstream's roles it drew from. Where a palette's own
colour could not carry text — an accent too light to ink a filled button, a comment colour under
3:1 on its own background — the file says so and what it used instead. `tests/themePresets.spec.ts`
holds every palette to those floors.

---

Live: the **Themes** tab of `pnpm demo` (`#themes`). Back to the [docs index](/).
