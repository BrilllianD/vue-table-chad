# src/components/preset

`DataTable` and `table.css`, assembled from the primitives. **The preset owns the theme** — this is
the only layer allowed a stylesheet, and the only one allowed to read the DOM.

What a *consumer* needs is in [`docs/styling.md`](../../../docs/styling.md) (the two-tier scale/token
scheme, the subject-first naming rule, the leading-underscore convention) and
[`docs/column-layout.md`](../../../docs/column-layout.md) (measure-once, the
`[minWidth ?? 60, maxWidth ?? 160]` clamp, `flex`). What follows is the part only someone editing
this directory needs.

## The stylesheet

`DataTable.vue` imports `table.css` itself — the entry file, which is now just an ordered list of
`@import`s over `preset/styles/*`, `scales.css` and `tokens.css` first.

- **Partitions are contiguous slices and stay that way.** Four pairs of rules are separated by
  source order alone, because both sides have identical specificity and the later one is meant to
  win: the column separator against the band edge, `:nth-child` striping against `[data-parity]`
  striping, `[data-row-state]` against `[data-row-state='error']`, and `[data-reorderable]`'s `grab`
  against `[data-sortable]`'s `pointer`. All four sit inside one partition, so the hazard is
  splitting a file rather than reordering the list. The pinned-cell
  z-index ladder is **not** order-dependent — specificity separates all three tiers.
- **No partition writes `background-image` or `box-shadow` wholesale.** Both stacks are composed from
  `--_vtc-` slots in `grid.css`, and a direct write outranks the composition and erases every slot at
  once.

**`tests/presetStyles.spec.ts` enforces both hazards against the stylesheet source**, since jsdom
does not apply CSS and nothing else in the suite would notice: no rule matching cells may write
`background-image` or `box-shadow` directly, every `--_vtc-` slot that is filled must be reset on
`.vt-th, .vt-td`, and only `scales.css` and `tokens.css` may declare a public `--vtc-` token.

`src/index.ts` deliberately does *not* import the stylesheet, because `sideEffects: ["**/*.css"]`
would let a bare CSS import there be tree-shaken away, silently shipping an unstyled table.

## Theme plumbing

- Both tiers land on `.vt-datatable, .vt-portal`, so either is overridable from one place. Nothing
  goes in a scale to round out a ramp — every entry was a literal repeated in the partitions, because
  a scale nobody reaches for is a scale that drifts. Adding a `--_vtc-` name is free; promoting one to
  `--vtc-` is an API change, and means a line in `src/core/theme.ts` too.
- The font size lives in `--vtc-font-size-md`, not `--vtc-text-md`, because `--vtc-text` is the
  foreground colour and the two families would read as one.
- **`DataTable` forwards `$attrs` onto `.vt-datatable` by hand** (`inheritAttrs: false`). `TableRoot`
  renders a slot and nothing else, so the component's root is a fragment and Vue drops fallthrough
  attributes silently — a `:style` on `<DataTable>` had no effect at all, which is the binding
  `defineTheme` exists to produce. `.vt-datatable` is also the only element they could usefully
  reach, since that is where every token is declared.
- **The truncation marker is Firefox-only, and that was the choice.** `--vtc-truncation-marker`
  defaults to `'..'`, applied behind `@supports (text-overflow: '..')` — Chrome and Safari reject the
  string form and keep the `…` the `ellipsis` keyword paints. The guard cannot be dropped for a
  second declaration: a `var()` substituting to a rejected value is invalid at computed-value time,
  which resets the property to `clip` rather than falling back. Getting `..` in Chrome means leaving
  `text-overflow` behind entirely — a `::after` marker revealed by a scroll-driven overflow test, or
  JavaScript measuring and slicing each cell. Both were considered and declined: the first needs a
  background matching the composed `--_vtc-layer-*` stack, the second is per-cell layout reads on
  every render. Reopen only with the browser support changed.
- **Dark is reached two ways and the blocks cannot be shared.** The media query excludes
  `[data-theme='light']`; the attribute form sits outside it, and after it. The attribute is read on
  the element itself, never on an ancestor — CSS cannot say "and nothing above said light", so an
  ancestor form costs a second copy of both palettes, and the teleported case it would have covered is
  covered by the `theme` prop reaching `.vt-portal` instead.
- **A palette preset is nine literals, and `styles/themes/` is the third partition.** Everything else
  colour-valued derives from `--vtc-bg`, `--vtc-header-bg`, `--vtc-text`, `--vtc-text-muted`,
  `--vtc-border`, `--vtc-border-strong`, `--vtc-accent`, `--vtc-accent-contrast` and `--vtc-danger`,
  so a preset that restated a derived token would pin something meant to move — the mistake the
  demo's hand-copied palettes made. `tests/presetStyles.spec.ts` cannot see the directory;
  `tests/themePresets.spec.ts` holds it to the nine, to both selector forms, and to contrast floors,
  which is the check that caught five palettes whose own accent carries no foreground.
- **`data-vtc-theme` is a separate attribute from `data-theme`, and is read from an ancestor.** The
  prop's value space is closed and `tokens.css` is written around it, so a third value there would
  leave the dark media query applying underneath a named palette. The ancestor form is what reaches
  `.vt-portal` — the popovers teleport to `<body>`, so only `<html>` covers a table and its popovers
  at once — and the attribute is repeated in the selector to clear (0,3,0), because the plain
  ancestor form ties with the dark blocks at (0,2,0) and the winner would depend on the consumer's
  import order.

## Column widths

`.vt-table` sizes to `max-content` under `table-layout: fixed`, which is exactly the sum of the
columns; `width: 100%` used to hand the surplus back to the browser, which shares it over every
column and made a declared `width: 120` a ratio rather than a size. A column takes that surplus by
asking — `ColumnDef.flex` resolves to no width at all and renders as a bare `<col>`, which is what
fixed layout gives the leftover to, and `TableGrid` emits `data-fill` to say one exists.

- **`flex` is a boolean, not an `fr`.** Weights would mean re-implementing column layout in
  JavaScript; equal shares are what the browser does for free. It is refused on a pinned column,
  checked at read time because a pin can arrive through `setPinned`.
- The measured clamp's `defaultWidth` does two jobs on purpose: 160 is both the fallback where
  nothing can be measured and the ceiling a measurement may reach, so no column comes out wider than
  the flat 160 it used to be.
- **The probe lives here** (`useAutoColumnWidth.ts`) because it reads the DOM, which `core/` may not,
  and because it depends on the preset's `[data-measuring]` rules, which a primitive may not.
- **Each id is measured once**, and never on scroll or a page turn: a width that depended on which
  window was on screen would move under the reader. `remeasureColumns()` is the way to ask again.
- **The `width > 0` discard is load-bearing.** jsdom applies no layout, so every rect is zero, so
  nothing is written and the suite keeps seeing the declared fallback.
  `tests/columnAutoWidth.spec.ts` asserts that directly — if it ever fails, the several hundred
  assertions resting on 160 are the next thing to go.
