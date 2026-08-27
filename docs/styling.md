# Styling

<script setup>
import Example from './.vitepress/examples/styling.vue'
</script>

<Demo :is="Example" />

<<< @/.vitepress/examples/styling.vue

Primitives ship **no CSS** — they emit class names and `data-*` attributes only:

```css
.vt-th[data-sorted='asc']   { … }
.vt-th[data-pinned='left']  { … }
.vt-tr[data-selected]       { … }
```

`DataTable` imports the default theme itself. If you use only primitives and still want that theme:

```ts
import '@brillliand/vue-table-chad/style.css'
```

Retheme by overriding the CSS variables on `.vt-datatable` (`--vt-accent`, `--vt-border`,
`--vt-bg-header`, `--vt-row-height`, …). Dark mode follows `prefers-color-scheme`.

> The stylesheet is intentionally not imported from the package barrel: `sideEffects` marks JS
> modules side-effect-free, so a bare CSS import there gets tree-shaken away and consumers silently
> get an unstyled table.

## Rules and row striping

Three widths, each independently zeroable — all three at `0` is a table with no rules at all:

```css
.vt-datatable {
  --vt-body-border-width: 1px;            /* rules between rows */
  --vt-body-border-vertical-width: 0px;   /* rules between columns; off by default */
  --vt-outer-border-width: 1px;           /* the frame around the scroll box */
  --vt-header-border-width: 1px;          /* the header underline, kept separate  */
  --vt-body-border-color: var(--vt-border);
}
```

The header underline is its own variable on purpose: a borderless body usually still wants the
header separated from the rows.

## Band rules

Where a [header band](column-groups.md)'s run of columns ends, a vertical rule is drawn the full
height of the table — through every header row, the body and the footer — so a band reads as a
region rather than as a caption floating above one:

```css
.vt-datatable {
  --vt-band-border-width: 1px;
  --vt-band-border-color: var(--vt-border);
}
```

**On by default**, unlike `--vt-body-border-vertical-width`. It can afford to be: the attribute
that triggers it is emitted only where a boundary actually falls, so a table declaring no bands
never sees it. `0px` turns it off — with a unit, since a bare `0` is not a length and an invalid
value takes the whole `border-right` with it.

Each edge carries the nesting depth of the band that stops there, `0` being the outermost, which
is the hook for weighting one boundary heavier than another:

```css
.vt-datatable .vt-th[data-band-edge='0'],
.vt-datatable .vt-td[data-band-edge='0'] { --vt-band-border-width: 2px; }
```

One band can also differ from the rest without a stylesheet knowing which — see
[Styling a band](column-groups.md#styling-a-band).

Row striping is off by default — both stripes inherit `--vt-bg`, so setting one is enough:

```css
.vt-datatable {
  --vt-bg-row-even: #f4f6f9;   /* zebra: odd rows keep --vt-bg */
}
```

## Hover, selection, and how cell backgrounds stack

A cell's background is a **stack**, not a single colour. `background-color` is the opaque base —
the table background or the row's stripe — and every state above it is a `background-image` layer
painted over it, topmost first:

```
cell hover    ┐ topmost   the pointer, and the most specific of the three
selected      │
row hover     ┘
cursor row    ┐           the keyboard: persistent, and under everything the
cursor column ┘           pointer is doing right now
column tint   ─ bottom    static, declared by the column itself
────────────── background-color: stripe / --vt-bg
```

That is what lets any of them carry an alpha channel: a translucent layer blends with what is
underneath instead of replacing it, so a tinted column still shows the stripes through it and a
selected row still shows the tint. Each state fills its own layer variable, so none of them
compete on specificity. Keep the *base* opaque, though — pinned cells are sticky, and rows scroll
underneath them.

**Hover is a brightness delta.** Rather than a colour that has to be re-picked for every palette,
hover is a percentage of the text colour washed over the row — which darkens a light theme and
lightens a dark one from the same number:

```css
.vt-datatable {
  --vt-hover-delta: 6%;        /* the row under the pointer */
  --vt-cell-hover-delta: 0%;   /* just the cell under it, stacked on top; off at 0 */
}
```

Both are clamped to 0–100% for you. Worth knowing if you compute a colour of your own for any of
these variables: `color-mix()` rejects a percentage outside that range, and an invalid value does
**not** degrade gracefully — it invalidates the layer, which invalidates the whole
`background-image` declaration and takes every other layer with it. Clamp before you interpolate:

```ts
const tint = (color: string, pct: number) =>
  `color-mix(in srgb, ${color} ${Math.min(Math.max(pct, 0), 100)}%, transparent)`
```

Name a colour instead if you'd rather — the delta only feeds the default:

```css
--vt-bg-hover: rgb(37 99 235 / 0.1);
--vt-bg-cell-hover: rgb(37 99 235 / 0.16);
--vt-bg-selected: color-mix(in srgb, var(--vt-accent) 16%, transparent);   /* the shipped default */
```

An opaque value works too; it simply hides the layers below it. Either way the two mechanisms are
exclusive per variable — set the colour and the delta stops being consulted, since the delta exists
only to derive that colour. `--vt-hover-delta: 0%` turns row hover off altogether.

**Hover outlines** are separate from the fills, and off by default:

```css
.vt-datatable {
  --vt-hover-border-width: 0px;                    /* row: a rule top and bottom */
  --vt-hover-border-color: var(--vt-accent);
  --vt-cell-hover-border-width: 0px;               /* cell: all four edges */
  --vt-cell-hover-border-color: var(--vt-accent);
}
```

The row draws top and bottom only — every cell draws both edges, so they join into two rules
spanning the row; a full ring per cell would draw the internal verticals and turn a hovered row
into a row of boxes. The cell gets the full ring.

Both are inset `box-shadow`s, not borders: a border that appears on hover changes the cell's size
and shoves the table around under the pointer. They compose through `--vt-shadow-*` variables for
the same reason the fills do — `box-shadow` is a single property, and writing one directly would
wipe out the edge shadow that separates a pinned column from what scrolls beneath it.

Give the widths a unit. `0` alone is not a length once it goes through the `calc()` that mirrors
the top edge to the bottom, and an invalid value takes the whole `box-shadow` with it.

## The cell cursor

With [`cellCursor`](keyboard.md) on, the focused cell gets a ring and a faint crosshair runs down
its column and across its row — the header cell of that column included.

```css
.vt-datatable {
  --vt-cursor-row-delta: 4%;                       /* the crosshair, same idiom as hover */
  --vt-cursor-column-delta: 4%;
  --vt-cursor-border-width: 2px;                   /* the ring: all four edges */
  --vt-cursor-border-color: var(--vt-accent);
  --vt-cursor-idle-border-color: var(--vt-border-strong);
}
```

The two tints are deltas for the reason hover is — one number that reads in both themes — and are
clamped for you like the others. The ring is not a delta: it is a focus indicator, so it is
`--vt-accent` and has to hold contrast against whatever the row underneath happens to be doing.

Three things about it are deliberate:

- **The ring is on by default**, unlike the hover outlines. A focus indicator you have to switch on
  is not a focus indicator. Set either delta to `0` to keep the ring and drop that arm of the
  crosshair.
- **The cursor cell has no fill layer of its own.** It sits in both the cursor row and the cursor
  column, so it takes both washes and comes out the darkest cell on screen without a third layer
  being declared for it.
- **The ring goes grey while the grid does not hold focus** (`--vt-cursor-idle-border-color`), so a
  position the table merely remembers never looks like a live one. The cell counts as holding focus
  while an editor inside it has the caret.

The cursor's layers sit *above* the static per-column background and *below* hover and selection.
Above, because `--vt-column-bg` is a colour you name and is usually opaque — a crosshair painted
under it would be invisible in exactly the columns it is hardest to keep your place in. Below,
because hover and selection are the user's own doing, and an ambient cursor must not argue with the
feedback someone is actively generating.

One more variable belongs to the cursor rather than to the palette. Focusing a cell scrolls it into
view, and the browser's idea of "in view" knows nothing about a sticky header, so the body's
`scroll-margin-top` has to say how much of the top is already spoken for:

```css
.vt-scroll { --vt-header-rows: 1; }   /* the preset writes this from headerRows.length */
```

Only override it if you are assembling a header of your own from primitives.

## Per-column background

`background` and `headerBackground` on the column def, because *which column* is not something a
stylesheet should have to know:

```ts
{ id: 'salary', header: 'Salary', background: 'rgb(249 115 22 / 0.14)' }
```

The value reaches the cell as the `--vt-column-bg` custom property and is painted as the bottom
layer of the stack above — never as an inline `background`, which would outrank every state rule
and leave hover and selection dead in that column. Use an alpha below 1 and the column reads as a
tint over whatever the row is doing; use an opaque colour and the column wins outright.

---

Live: the **Theming** tab of `pnpm demo` (`#theming`), and **Header bands** for the band rules. Back to the [docs index](/).
