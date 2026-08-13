# vue-table

Composable table building blocks for Vue 3 — sorting, Excel-style filters, pagination, row
selection and column layout, over **local arrays or server endpoints, interchangeably**.

Deliberately **not** a god component. Three layers, each usable on its own:

| Layer | What it is | Use when |
| --- | --- | --- |
| `core/` | Composables + pure functions. No components. | You want the logic and none of the markup. |
| `primitives/` | Headless components. Slots, `data-*` attributes, no CSS. | You want your own markup. |
| `preset/` | `DataTable` + a stylesheet, assembled from the primitives. | You want a table right now. |

`DataTable` owns no logic of its own — every capability it has comes from a primitive or a
composable, and every region is a slot. When it stops fitting, drop one layer down and rebuild it
differently. Nothing is hidden behind it.

## Requirements

Node **24** (`.nvmrc` is committed — run `nvm use`), pnpm, Vue 3.5+.

```bash
nvm use          # Node 24; pnpm crashes on Node 20 here
pnpm install
pnpm dev         # playground at http://localhost:5173
pnpm demo        # full feature demo at http://localhost:5174
pnpm test        # 160 tests
pnpm typecheck
pnpm build       # library -> dist/
```

`pnpm dev` is four short examples. `pnpm demo` is the exhaustive one — every export, one view
per feature area, each listing the API it uses. See [`demo/README.md`](demo/README.md).

## Quick start

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { DataTable, useLocalDataSource, useTableState, type ColumnDef } from '@sandbox/vue-table'

const rows = ref(people)

const columns: ColumnDef<Person>[] = [
  { id: 'name', header: 'Name', type: 'text', pinned: 'left' },
  { id: 'department', header: 'Department', type: 'enum' },
  { id: 'salary', header: 'Salary', type: 'number', align: 'right',
    format: (v) => (v == null ? '—' : `$${Number(v).toLocaleString()}`) },
  { id: 'hiredAt', header: 'Hired', type: 'date' },
]

const state = useTableState({ pageSize: 25 })
const source = useLocalDataSource(rows, columns, state.query)
</script>

<template>
  <DataTable :columns="columns" :source="source" :state="state" selectable>
    <template #cell:name="{ row }"><a :href="`/people/${row.id}`">{{ row.name }}</a></template>
  </DataTable>
</template>
```

`type` is what makes filters and sorting behave: it picks the comparator and decides which
operators the filter panel offers (`contains` for text, `between` for numbers, `before`/`after`
for dates).

Rows are identified by `row.id`. Pass `getRowId` when they are keyed by something else — it drives
selection *and* the render keys, so editing a row patches it in place instead of replacing it.

## The two contracts

Everything hangs off these. Learn them and the rest follows.

### `QueryState` — what to show

```ts
interface QueryState {
  sort: SortRule[]                      // ordered array = multi-sort
  filters: Record<string, ColumnFilter>
  page: number                          // 1-based
  pageSize: number
  globalSearch: string
}
```

Plain JSON, always. That is why it drops straight into a URL, a Pinia store, or a request body.

### `DataSource` — where rows come from

```ts
interface DataSource<TRow> {
  rows: Ref<TRow[]>      // current page only
  total: Ref<number>     // total after filtering
  loading: Ref<boolean>
  error: Ref<unknown>
  refresh(): void
  facets(columnId: string): Promise<FacetValue[]>
  readonly remote: boolean   // lets the UI say facets come from the server
}
```

`useLocalDataSource` and `useServerDataSource` both satisfy it, so swapping one for the other
changes nothing above. `playground/src/examples/` has the same table both ways — the only
difference is the two lines that build the source.

## Server data

```ts
const source = useServerDataSource(
  ({ query, signal }) =>
    fetch(`/api/people?${new URLSearchParams({ q: JSON.stringify(query) })}`, { signal })
      .then((r) => r.json()),          // -> { rows, total }
  state.query,
  {
    debounceMs: 300,
    fetchFacets: (columnId, { query, signal }) =>
      fetch(`/api/people/facets?column=${columnId}&q=${encodeURIComponent(JSON.stringify(query))}`,
        { signal }).then((r) => r.json()),
  },
)
```

What it handles for you:

- **Debouncing** filter/search/sort changes, but **never** paging — clicking "next page" is instant.
- **Race conditions** — a slow earlier response can never overwrite a fast later one (monotonic
  request ids + `AbortController`). There is an explicit test for this.
- **`keepPreviousData`** so the table does not blank out between pages.
- **Facet scoping** — the column's own filter is stripped before the facet request, so its checklist
  keeps offering the values you just unchecked.

## Excel-style filters

Two modes per column, matching Excel's two halves:

```ts
// The checkbox list. include: null means "no filter".
{ kind: 'values', include: ['Engineering', 'Research'], includeBlanks: false }

// The "Text/Number/Date Filters…" submenu.
{ kind: 'conditions', op: 'and', rules: [{ operator: 'between', value: 100, value2: 200 }] }
```

Behaviours worth knowing, because they are easy to get wrong:

- **Blanks are their own bucket.** `null`, `undefined` and `''` all collapse to one "(Blanks)" row,
  and ticking specific values excludes blanks unless `includeBlanks: true`. "(Select All)" covers
  the blanks row too.
- **Facets ignore the column's own filter** but honour every other column's. Otherwise unchecking a
  value would erase the option you just unchecked and you could never restore it.
- **Incomplete rules are ignored.** A half-typed `between` keeps every row rather than blanking the
  table mid-keystroke.
- **Dates compare by calendar day**, and bare `YYYY-MM-DD` strings parse as *local* midnight —
  `Date.parse` treats them as UTC, which shifts the day for anyone west of Greenwich.
- **A filter that matches everything is not a filter.** No-op entries are pruned out of
  `QueryState`, and neither the header funnel nor the chip row lights up for one.

The filter panel is teleported to `<body>` and positioned from its trigger, so no ancestor's
`overflow` can clip it. Pass `:teleport="false"` to `ColumnFilterPopover` if you are placing it
yourself.

The global search box covers every `filterable` column. Set `searchable: false` on a column to keep
its filter panel but drop it from search hits.

## Selection

```ts
const source = /* … */
<DataTable :columns="columns" :source="source" selectable @update:selection="ids = $event" />
```

Single or multiple (`selectable="single"`), shift-click ranges, a tri-state header checkbox, and
selection that survives paging. `selectable` is reactive — switch it on, off, or between modes at
runtime and the table follows without remounting.

For server data, "select all 12,384 matching" cannot be an id list, so it is modelled as a
predicate instead:

```ts
{ mode: 'all-matching', excluded: [17, 204] }
```

`DataTable` offers this escalation only once the visible page is fully checked.

## Composing your own

The `TableRoot` slot hands you everything; the markup is yours. This renders cards, not a table,
using the same sort triggers, filter popovers and pager as the preset:

```vue
<TableRoot v-slot="{ rows, selection, total }" :columns="columns" :source="source" selectable>
  <SortTrigger column-id="salary" label="Salary" />
  <ColumnFilterPopover column-id="department" type="enum" />

  <article v-for="row in rows" :key="row.id" @click="selection.toggle(row)">
    {{ row.name }}
  </article>

  <TablePagination />
</TableRoot>
```

Every primitive also takes explicit props that override the injected context, so it works with no
`TableRoot` at all:

```vue
<!-- a standalone pager for any list -->
<TablePagination :page="page" :page-size="20" :total="count" @update:page="page = $event" />
```

See `playground/src/examples/ComposedCustom.vue` for the full version.

## Hoisting state (URL, store)

Pass a ref and the table stops owning its state — it reads and writes yours:

```ts
const external = ref<QueryState>(readFromUrl())
const state = useTableState({ state: external })

watch(external, (q) => history.replaceState(null, '', `#q=${encodeURIComponent(JSON.stringify(q))}`),
  { deep: true })
```

Mirroring is synchronous both ways, so reading `external.value` right after `state.setPage(3)`
gives you page 3. Live example: `playground/src/examples/UrlSyncedState.vue`.

## Styling

Primitives ship **no CSS** — they emit class names and `data-*` attributes only:

```css
.vt-th[data-sorted='asc']   { … }
.vt-th[data-pinned='left']  { … }
.vt-tr[data-selected]       { … }
```

`DataTable` imports the default theme itself. If you use only primitives and still want that theme:

```ts
import '@sandbox/vue-table/style.css'
```

Retheme by overriding the CSS variables on `.vt-datatable` (`--vt-accent`, `--vt-border`,
`--vt-bg-header`, `--vt-row-height`, …). Dark mode follows `prefers-color-scheme`.

> The stylesheet is intentionally not imported from the package barrel: `sideEffects` marks JS
> modules side-effect-free, so a bare CSS import there gets tree-shaken away and consumers silently
> get an unstyled table.

## Column layout

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

### Drag to reorder

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

## Not included

Row virtualization, grouping/tree rows, editable cells, and column-level aggregation. The core is
structured so virtualization slots in at the rendering layer without touching the pipeline —
`filteredRows` on the local source is the hook for it.
