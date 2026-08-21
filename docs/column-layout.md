# Column layout

Visibility, ordering, resizing and pinning all live in `useColumns` and are driven from
`ColumnVisibilityMenu`, or programmatically:

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

Live: the **Column layout** tab of `pnpm demo` (`#columns`). Back to the [docs index](../README.md#docs).
