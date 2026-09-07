# Column layout

<script setup>
import Example from './.vitepress/examples/column-layout.vue'
</script>

<Demo :is="Example" />

<<< @/.vitepress/examples/column-layout.vue

Visibility, ordering, resizing and pinning all live in `useColumns` and are driven from
`ColumnVisibilityMenu` — its panel leads with **Show all** and **Reset layout**, above the
per-column checkboxes — or programmatically:

```ts
const columns = useColumns(defs, { … })
columns.toggleVisibility('email')
columns.moveColumn('salary', 0)
columns.moveColumnTo('salary', 'name', 'after')   // what a drop describes
columns.setPinned('name', 'left')
columns.setPinned('name', false)   // explicitly unpinned, even if the def says pinned: 'left'
columns.clearPinned('name')        // forget the override; the def's pin applies again
columns.setWidth('email', 320)
columns.resetLayout()
```

`ColumnDef.pinned` is a *default*, not a lock: `setPinned(id, false)` records an explicit
"unpinned" that outranks it, and `clearPinned` (or `resetLayout`) hands control back to the def.

Sticky offsets for pinned columns are recomputed from live widths, so resizing a pinned column
shifts the ones pinned after it.

## Sizing

Four answers, in this order:

```ts
{ id: 'city' }                    // measured from what it holds
{ id: 'name', width: 200 }        // exactly 200px
{ id: 'notes', flex: true }       // whatever the other columns leave over
columns.setWidth('city', 300)     // a resize outranks all three
```

A column declaring no `width` is measured once from the rendered table and
clamped into `[minWidth ?? 60, maxWidth ?? 160]` — so an id column narrows to its
digits while a free-text one stops at the cap and truncates. What the clipped
text ends with is `--vtc-truncation-marker`, two dots by default — Firefox is
the only engine that implements a custom `text-overflow` string, so the rest
draw the usual `…` there. The ceiling is
`useColumns`' `defaultWidth`, which is also the width a column falls back to
where nothing can be measured: a server render, a test, the frame before the
first layout.

- The measurement reads the first render that has rows, and **does not run
  again** on scroll, paging, filtering or sorting — a width that depended on
  which rows were on screen would change under the reader. `tableRef.remeasureColumns()`
  asks for a new answer after swapping the dataset for one whose cells are a
  different size.
- Measured widths are **not persisted** and are not what `resetWidth` clears.
  Resetting a resized column lands back on its measured width; `storageFields`
  still governs the widths a *user* dragged.
- `minWidth` and `maxWidth` are the knobs. `maxWidth: 400` lets one column run
  wider than the rest; `minWidth: 120` keeps a short column from collapsing to
  its header.

Without a `flex` column the table is exactly as wide as its columns and the space
to the right stays empty; with several they share it equally. `flex` is ignored
on a pinned column and warns, because a sticky offset is the sum of the widths
before it and a column with no width of its own cannot be summed. Resizing a flex
column fixes it at a number until `resetWidth` hands it back to the leftover.

`.vt-table[data-fill]` is the styling hook for the fill case, and
`ColumnDef.resizable: false` opts a column out of being dragged at all.

## Remembering the layout

One prop persists the layout — visibility, order, widths and pins — to `localStorage` and
restores it on the next visit:

```vue
<DataTable :columns="columns" :source="source" storage-key="employees:layout" />

<!-- let widths follow the viewport instead of the user -->
<DataTable
  :columns="columns"
  :source="source"
  storage-key="employees:layout"
  :storage-fields="['hidden', 'order', 'pinned']"
/>
```

Same thing from the composable, where a bare string is shorthand for `{ key }`:

```ts
const columns = useColumns(defs, { storage: 'employees:layout' })
const columns = useColumns(defs, {
  storage: { key: 'employees:layout', fields: ['hidden', 'order'], storage: sessionStorage },
})

columns.clearStored()   // forget the saved entry, keep the live layout
```

- All four parts of the layout are saved by default. Narrow it with `fields` when something is
  per-screen rather than per-user — widths are the usual candidate.
- A saved layout wins over `initialLayout`, field by field — `initialLayout` remains the first-visit
  default for anything not saved.
- Both are read once at setup, so changing `storage-key` on a mounted table does nothing; `:key`
  the table if you need to switch saved views.
- Corrupt, foreign or partially-malformed JSON is discarded rather than thrown; unavailable storage
  (SSR, private mode, quota) degrades to an in-memory layout.
- Ids that no longer exist in `columns` are kept in the saved entry, since `useColumns` ignores
  unresolvable ids anyway — a column that comes back later keeps its place.

The pieces are exported for hand-rolled cases (a "saved views" dropdown, syncing to a server):
`readColumnLayout`, `writeColumnLayout`, `clearColumnLayout`, `sanitizeColumnLayout`.

## Drag to reorder

Header cells are drag sources out of the box. `useColumnDnd` owns the interaction; `TableRoot`
wires it into the context, `TableHeaderCell` reports hits from its own box, and `ColumnDragGhost`
renders the label that follows the pointer.

```vue
<DataTable :columns="columns" :source="source" @update:column-order="save" />
<DataTable :columns="columns" :source="source" :reorderable="false" />   <!-- off -->
```

Per column: `{ id: 'actions', reorderable: false }`.

- A press only becomes a drag after 4px, so clicking a header still sorts it — and the `click`
  that follows a real drag is swallowed, so a drop never sorts.
- Dropping on a pinned column adopts that column's pin side; otherwise the reorder would be
  invisible, since pinned columns are hoisted to the edges regardless of order.
- Hidden columns keep their place: a drop is stored as "before/after *this column*", not as an
  index into the visible list.
- Keyboard equivalent: `Alt` + `←`/`→` on a focused header. `Esc` cancels a drag in flight.
- `@update:column-order` fires for every order change, dragged or not — persist it and feed it
  back through `initialLayout.order`.

Styling hooks: `[data-reorderable]`, `[data-dragging]` and `[data-drop='before'|'after']` on the
`<th>`, plus `.vt-drag-ghost`.

---

Live: the **Column layout** tab of `pnpm demo` (`#columns`). Back to the [docs index](/).
