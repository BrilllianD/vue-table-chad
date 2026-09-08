/**
 * One control descriptor per theme token, so the Theming view can offer every
 * `--vtc-*` variable rather than the dozen a hand-written panel had room for.
 *
 * Typed as `Record<ThemeToken, TokenControl>`, which is the point: a token
 * added to `THEME_TOKENS` and not to this file is a type error here rather
 * than a variable that quietly has no control. The reverse — a control for a
 * token that does not exist — is a type error too.
 *
 * The *values* are not repeated here. Every control seeds itself from the
 * table's own computed style, so this file never has to be kept in sync with
 * `styles/tokens.css`; it only says how each token is best edited.
 */
import type { ThemeToken } from '@brillliand/vue-table-chad'

/**
 * How a token is edited.
 *
 * `text` is the honest answer for anything whose value is an expression rather
 * than a quantity — a `color-mix()`, a `box-shadow`, the `font` shorthand. A
 * colour input cannot hold one, and pretending otherwise would silently round
 * the value to a hex the first time the control is touched.
 */
export type ControlKind = 'color' | 'length' | 'number' | 'percent' | 'text'

export interface TokenControl {
  group: string
  kind: ControlKind
  hint: string
  min?: number
  max?: number
  step?: number
  /** Appended to a `length` value, and shown beside a `number`. */
  unit?: string
}

const space = (hint: string): TokenControl => ({
  group: 'Space scale',
  kind: 'length',
  unit: 'px',
  min: 0,
  max: 48,
  hint,
})

const radius = (hint: string): TokenControl => ({
  group: 'Radius scale',
  kind: 'length',
  unit: 'px',
  min: 0,
  max: 32,
  hint,
})

const fontSize = (hint: string): TokenControl => ({
  group: 'Type scale',
  kind: 'length',
  unit: 'px',
  min: 6,
  max: 28,
  hint,
})

const zIndex = (hint: string): TokenControl => ({
  group: 'Layers',
  kind: 'number',
  min: 0,
  max: 100,
  step: 1,
  hint,
})

const opacity = (hint: string): TokenControl => ({
  group: 'Opacity scale',
  kind: 'number',
  min: 0,
  max: 1,
  step: 0.05,
  hint,
})

const colour = (group: string, hint: string): TokenControl => ({ group, kind: 'color', hint })

const width = (group: string, hint: string, max = 6): TokenControl => ({
  group,
  kind: 'length',
  unit: 'px',
  min: 0,
  max,
  hint,
})

const delta = (group: string, hint: string): TokenControl => ({
  group,
  kind: 'percent',
  min: 0,
  max: 40,
  hint,
})

/** Every token, and how to edit it. */
export const TOKEN_CONTROLS: Record<ThemeToken, TokenControl> = {
  /* ------------------------------------------------------------- scales */
  space1: space('the tightest gap in the preset'),
  space2: space('icon padding'),
  space3: space('control padding'),
  space4: space('the gap between the table and its toolbar'),
  space5: space('cell padding, before the token derives from it'),
  space6: space('panel padding'),
  space7: space('group indent, before the token derives from it'),
  space8: space('the widest gap in the preset'),

  radiusXs: radius('checkboxes and swatches'),
  radiusSm: radius('chips, inputs and menu items'),
  radiusMd: radius('the table frame, before --vtc-radius derives from it'),
  radiusLg: radius('popovers and panels'),
  radiusPill: { group: 'Radius scale', kind: 'text', hint: 'fully rounded ends — a length, not a ratio' },
  radiusCircle: { group: 'Radius scale', kind: 'text', hint: 'a percentage, so it stays circular at any size' },

  fontSize3xs: fontSize('the band-depth badge'),
  fontSize2xs: fontSize('counts and secondary labels'),
  fontSizeXs: fontSize('menu and chip text'),
  fontSizeSm: fontSize('control text'),
  fontSizeMd: fontSize('body text, which --vtc-font is built from'),

  weightNormal: { group: 'Type scale', kind: 'number', min: 100, max: 900, step: 100, hint: 'body text' },
  weightBold: { group: 'Type scale', kind: 'number', min: 100, max: 900, step: 100, hint: 'headers and emphasis' },

  stroke1: width('Stroke scale', 'every hairline rule and border', 8),
  stroke2: width('Stroke scale', 'focus rings and the cursor ring', 8),

  zPinned: zIndex('a pinned column, over the columns it scrolls past'),
  zSticky: zIndex('a stuck header row'),
  zStickyPinned: zIndex('both at once — the corner cell'),
  zDrop: zIndex('the column drop indicator'),
  zOverlay: zIndex('the loading scrim'),
  zPopover: zIndex('filter panels and menus'),
  zGhost: zIndex('the column being dragged, over everything'),

  elevationPopover: { group: 'Elevation', kind: 'text', hint: 'panels and menus — a full box-shadow' },
  elevationGhost: { group: 'Elevation', kind: 'text', hint: 'the drag ghost — a full box-shadow' },

  durationFast: { group: 'Motion', kind: 'length', unit: 'ms', min: 0, max: 600, step: 10, hint: 'every hover and focus transition' },
  durationSpin: { group: 'Motion', kind: 'text', hint: 'one turn of the loading spinner' },
  durationSpinReduced: { group: 'Motion', kind: 'text', hint: 'the same, under prefers-reduced-motion' },

  opacityMuted: opacity('secondary text and disabled hints'),
  opacityDisabled: opacity('a control that cannot be used'),
  opacityDragging: opacity('the column left behind while dragging'),
  opacityBusy: opacity('a row waiting on a save'),

  focusWidth: width('Focus', 'the focus ring, everywhere one is drawn', 8),

  /* ------------------------------------------------------------ palette */
  bg: colour('Palette', 'the table itself'),
  text: colour('Palette', 'body text, and what every hover delta is a wash of'),
  textMuted: colour('Palette', 'counts, hints and secondary labels'),
  accent: colour('Palette', 'selection, focus and the cursor ring'),
  accentContrast: colour('Palette', 'text on top of the accent'),
  focusColor: colour('Palette', 'the focus ring — the accent unless you split them'),
  danger: colour('Palette', 'validation errors and failed saves'),
  border: colour('Palette', 'ordinary rules'),
  borderStrong: colour('Palette', 'panel edges and the header underline'),

  /* ----------------------------------------------------------- surfaces */
  headerBg: colour('Surfaces', 'the header row'),
  headerText: colour('Surfaces', 'header labels and the drag ghost — --vtc-text-muted by default'),
  footerBg: colour('Surfaces', 'the aggregate row'),
  groupBg: colour('Surfaces', 'a group header row'),
  rowOddBg: colour('Surfaces', 'odd rows — equal to --vtc-bg means no stripes'),
  rowEvenBg: colour('Surfaces', 'even rows'),
  rowSelectedBg: { group: 'Surfaces', kind: 'text', hint: 'translucent, so stripes read through it' },
  loadingScrim: { group: 'Surfaces', kind: 'text', hint: 'the wash over a table mid-fetch' },

  /* --------------------------------------------------- hover and cursor */
  rowHoverDelta: delta('Hover', 'the row under the pointer'),
  rowHoverBg: { group: 'Hover', kind: 'text', hint: 'set this to name a colour instead of a delta' },
  rowHoverBorderWidth: width('Hover', 'the row outline, top and bottom'),
  rowHoverBorderColor: colour('Hover', 'that outline'),
  cellHoverDelta: delta('Hover', 'the single cell under the pointer, header and footer included'),
  cellHoverBg: { group: 'Hover', kind: 'text', hint: 'the same escape hatch, per cell' },
  cellHoverBorderWidth: width('Hover', 'the cell outline, all four edges'),
  cellHoverBorderColor: colour('Hover', 'that outline'),
  columnHoverDelta: delta('Hover', "the whole column under the pointer, header included"),
  columnHoverBg: { group: 'Hover', kind: 'text', hint: 'names that column tint outright' },

  cursorRowDelta: delta('Cell cursor', "the cursor's row arm"),
  cursorColumnDelta: delta('Cell cursor', "the cursor's column arm"),
  cursorRowBg: { group: 'Cell cursor', kind: 'text', hint: 'names the row arm outright' },
  cursorColumnBg: { group: 'Cell cursor', kind: 'text', hint: 'names the column arm outright' },
  cursorBorderWidth: width('Cell cursor', 'the ring on the focused cell'),
  cursorBorderColor: colour('Cell cursor', 'that ring, while the grid holds focus'),
  cursorIdleBorderColor: colour('Cell cursor', 'and once it does not'),

  /* -------------------------------------------------------------- rules */
  bodyBorderWidth: width('Rules', 'between rows'),
  bodyBorderVerticalWidth: width('Rules', 'between columns — off by default'),
  bodyBorderColor: colour('Rules', 'both body rules'),
  headerBorderWidth: width('Rules', 'the header underline'),
  headerBorderColor: colour('Rules', 'that underline'),
  headerGroupBorderWidth: width('Rules', 'between header rows, when bands add some'),
  headerGroupBorderColor: colour('Rules', 'that rule'),
  bandBorderWidth: width('Rules', "where a band's columns end"),
  bandBorderColor: colour('Rules', 'that rule'),
  outerBorderWidth: width('Rules', 'the frame around the scroll box'),
  outerBorderColor: colour('Rules', 'that frame'),
  pinBorderWidth: width('Rules', "a pinned column's separator"),
  pinBorderColor: colour('Rules', 'that separator'),
  rowStateBorderWidth: width('Rules', 'the stripe on a row being edited'),
  rowStateBorderColor: colour('Rules', 'that stripe'),
  rowStateErrorBorderColor: colour('Rules', 'and on a row whose save failed'),

  /* ------------------------------------------------------------ metrics */
  radius: { group: 'Metrics', kind: 'length', unit: 'px', min: 0, max: 24, hint: 'the table frame' },
  rowHeight: { group: 'Metrics', kind: 'length', unit: 'px', min: 20, max: 72, hint: 'every body row' },
  cellPaddingX: { group: 'Metrics', kind: 'length', unit: 'px', min: 0, max: 32, hint: 'cell padding, left and right' },
  groupIndentStep: { group: 'Metrics', kind: 'length', unit: 'px', min: 0, max: 48, hint: 'per level of grouping' },
  font: { group: 'Metrics', kind: 'text', hint: 'the whole font shorthand — size, line height and family' },
  truncationMarker: { group: 'Metrics', kind: 'text', hint: 'what a clipped cell ends with — Firefox only, others keep the ellipsis glyph' },
}

/**
 * The tokens the curated panels above already own.
 *
 * They are listed rather than flagged in the record because the split is a
 * property of the view's layout, not of the token: the full list below covers
 * everything else, so nothing is offered twice and nothing is missing.
 */
export const FEATURED_TOKENS: readonly ThemeToken[] = [
  'accent',
  'bg',
  'headerBg',
  'headerText',
  'rowSelectedBg',
  'rowOddBg',
  'rowEvenBg',
  'text',
  'border',
  'radius',
  'rowHeight',
  'font',
  'bodyBorderWidth',
  'bodyBorderVerticalWidth',
  'outerBorderWidth',
  'rowHoverDelta',
  'cellHoverDelta',
  'columnHoverDelta',
  'rowHoverBg',
  'cellHoverBg',
  'rowHoverBorderWidth',
  'rowHoverBorderColor',
  'cellHoverBorderWidth',
  'cellHoverBorderColor',
]

/** Everything else, in the order `THEME_TOKENS` declares it, grouped for display. */
export const TOKEN_GROUPS: { label: string; tokens: ThemeToken[] }[] = (() => {
  const featured = new Set(FEATURED_TOKENS)
  const groups: { label: string; tokens: ThemeToken[] }[] = []
  for (const [token, control] of Object.entries(TOKEN_CONTROLS) as [ThemeToken, TokenControl][]) {
    if (featured.has(token)) continue
    const last = groups[groups.length - 1]
    if (last && last.label === control.group) last.tokens.push(token)
    else groups.push({ label: control.group, tokens: [token] })
  }
  return groups
})()
