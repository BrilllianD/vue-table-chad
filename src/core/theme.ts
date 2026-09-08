/**
 * A theme, authored in TypeScript instead of as a string of CSS.
 *
 * `core/`, not `components/`: it imports nothing, touches no DOM and knows
 * about the preset only through the names it emits.
 */

/**
 * Every token a theme can set, in camelCase.
 *
 * The list is data rather than an interface's keys so it can be enumerated at
 * runtime — `tests/theme.spec.ts` reads it against the stylesheet and fails if
 * either side grows a token the other has not heard of. `Theme` is derived
 * from it, so the two cannot disagree.
 *
 * Order follows `styles/scales.css` and then `styles/tokens.css`, which is
 * also the order `docs/styling.md` introduces them in.
 */
const THEME_TOKENS = [
  // Scales — the values the design uses at all.
  'space1',
  'space2',
  'space3',
  'space4',
  'space5',
  'space6',
  'space7',
  'space8',
  'radiusXs',
  'radiusSm',
  'radiusMd',
  'radiusLg',
  'radiusPill',
  'radiusCircle',
  'fontSize3xs',
  'fontSize2xs',
  'fontSizeXs',
  'fontSizeSm',
  'fontSizeMd',
  'weightNormal',
  'weightBold',
  'stroke1',
  'stroke2',
  'zPinned',
  'zSticky',
  'zStickyPinned',
  'zDrop',
  'zOverlay',
  'zPopover',
  'zGhost',
  'elevationPopover',
  'elevationGhost',
  'durationFast',
  'durationSpin',
  'durationSpinReduced',
  'opacityMuted',
  'opacityDisabled',
  'opacityDragging',
  'opacityBusy',
  'focusWidth',

  // Palette.
  'bg',
  'text',
  'textMuted',
  'accent',
  'accentContrast',
  'focusColor',
  'danger',
  'border',
  'borderStrong',

  // Surfaces.
  'headerBg',
  'headerText',
  'footerBg',
  'groupBg',
  'rowOddBg',
  'rowEvenBg',
  'rowSelectedBg',
  'loadingScrim',

  // Hover and the cell cursor.
  'rowHoverDelta',
  'rowHoverBg',
  'rowHoverBorderWidth',
  'rowHoverBorderColor',
  'cellHoverDelta',
  'cellHoverBg',
  'cellHoverBorderWidth',
  'cellHoverBorderColor',
  'columnHoverDelta',
  'columnHoverBg',
  'cursorRowDelta',
  'cursorColumnDelta',
  'cursorRowBg',
  'cursorColumnBg',
  'cursorBorderWidth',
  'cursorBorderColor',
  'cursorIdleBorderColor',

  // Rules.
  'bodyBorderWidth',
  'bodyBorderVerticalWidth',
  'bodyBorderColor',
  'headerBorderWidth',
  'headerBorderColor',
  'headerGroupBorderWidth',
  'headerGroupBorderColor',
  'bandBorderWidth',
  'bandBorderColor',
  'outerBorderWidth',
  'outerBorderColor',
  'pinBorderWidth',
  'pinBorderColor',
  'rowStateBorderWidth',
  'rowStateBorderColor',
  'rowStateErrorBorderColor',

  // Metrics.
  'radius',
  'rowHeight',
  'cellPaddingX',
  'groupIndentStep',
  'font',
  'truncationMarker',
] as const

/** One token's name, in the camelCase form a `Theme` uses. */
export type ThemeToken = (typeof THEME_TOKENS)[number]

/**
 * A theme: any subset of the preset's tokens, camelCased.
 *
 * Every field is optional, and an absent one is not emitted at all — so a
 * theme sets what it means to change and leaves the rest to the stylesheet,
 * including the light/dark switch. Numbers pass through verbatim, which is
 * right for the unitless tokens (`zPopover`, `weightBold`, `opacityBusy`) and
 * wrong for every length: a width needs its unit, because `0` alone is not a
 * length once it reaches the `calc()` the hover outlines are built from.
 */
export type Theme = Partial<Record<ThemeToken, string | number>>

/**
 * `rowHoverBg` → `--vtc-row-hover-bg`.
 *
 * A conversion rather than a lookup table, so adding a token means adding one
 * line to `THEME_TOKENS` and nothing else. Digits start their own segment,
 * which is what turns `space1` into `space-1` and `fontSize3xs` into
 * `font-size-3xs`.
 */
function customProperty(token: string): string {
  const kebab = token
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/([a-zA-Z])(\d)/g, '$1-$2')
    .toLowerCase()
  return `--vtc-${kebab}`
}

/** Every token's custom-property name, keyed by its camelCase form. */
export const themeProperties: Readonly<Record<ThemeToken, string>> = Object.freeze(
  Object.fromEntries(THEME_TOKENS.map((token) => [token, customProperty(token)])),
) as Record<ThemeToken, string>

/**
 * Turns a `Theme` into the custom properties that carry it, ready to bind.
 *
 * ```vue
 * <DataTable :style="defineTheme({ accent: '#7c3aed', radius: '10px' })" … />
 * ```
 *
 * A style binding rather than a stylesheet because of where the tokens are
 * declared: they live on `.vt-datatable` itself, so a value set on an ancestor
 * never reaches them and a rule elsewhere has to win on specificity. An inline
 * property lands on the right element and beats the stylesheet without
 * `!important`.
 *
 * The return value is a plain object, so it composes — spread two themes
 * together, or merge one over `defineTheme(base)`.
 */
export function defineTheme(theme: Theme): Record<string, string> {
  const style: Record<string, string> = {}
  for (const token of THEME_TOKENS) {
    const value = theme[token]
    // `undefined` is "leave it to the stylesheet". An empty string is not the
    // same thing — it is a declaration with no value, which invalidates the
    // property — so only `undefined` is skipped.
    if (value === undefined) continue
    style[themeProperties[token]] = String(value)
  }
  return style
}
