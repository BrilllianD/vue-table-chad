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
import { shallowRef } from 'vue'
import { DataTable, useLocalDataSource, useTableState, type ColumnDef } from '@sandbox/vue-table'

const rows = shallowRef(people)

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

### Hold rows in a `shallowRef`

`shallowRef`, not `ref`, and it is the single highest-leverage line in that example.

`ref(people)` deep-proxies the array *and* every object in it. Filtering, sorting, grouping and
aggregating then read each cell through a Proxy trap — once per row per column per pass, which at
10k rows and ten columns is 100 000 trap hits for one keystroke. A `shallowRef` proxies the array
reference alone and hands the pipeline the raw objects.

You give up nothing the table uses. It never mutates a row, and it re-runs whenever the ref is
*reassigned*:

```ts
rows.value = [...rows.value, newPerson]   // seen
rows.value.push(newPerson)                // not seen — call source.refresh()
```

`source.refresh()` exists for exactly that case: mutate the array in place, then say so.

If rows are large and you never reassign individual ones, `markRaw` on each row opts them out of
reactivity permanently, which also stops a cell slot from accidentally making one reactive later.

## The two contracts

Everything hangs off these. Learn them and the rest follows.

### `QueryState` — what to show

```ts
interface QueryState {
  sort: SortRule[]                      // ordered array = multi-sort
  filters: Record<string, ColumnFilter>
  groupBy: string[]                     // only when grouping is delegated — see below
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
  groupCounts?(groupBy: string[]): Map<string, number>       // only if it holds every row
  groupAggregates?(groupBy: string[]): Map<string, ...>     // likewise
  readonly remote: boolean   // lets the UI say facets come from the server
}
```

`useLocalDataSource` and `useServerDataSource` both satisfy it, so swapping one for the other
changes nothing above. `playground/src/examples/` has the same table both ways — the only
difference is the two lines that build the source.

## Local data

```ts
const source = useLocalDataSource(rows, columns, state.query, { debounceMs: 150 })
```

The pipeline is filter → sort → slice, each stage its own computed, so paging redoes neither of
the first two and changing the sort does not redo the filter.

`debounceMs` (default `150`) coalesces the **global search only**. Every keystroke otherwise
re-filters and re-sorts the whole dataset synchronously on the input event — around 22ms of
blocked main thread per character at 10k rows. A filter checkbox or a header click is one
deliberate act and always lands at once; a delay there reads as a broken table rather than a
smooth one. Clearing the box is instant too, since emptying it can only ever widen the result.

`QueryState` is unaffected: it records every keystroke as it happens, so a URL or a store mirroring
the query stays truthful while only the filtering lags. Pass `0` to switch the debounce off
entirely — the right choice for small datasets and for tests that assert on the next line.

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

## Grouping rows

```vue
<DataTable :columns="columns" :source="source" :initial-group-by="['department']" />
```

Or from the toolbar's **Group by** menu, which is on by default (`:show-group-menu="false"` to
drop it). Pick a second column to nest inside the first — `groupBy` is an ordered array, exactly
like `sort`.

Group headers are collapsible, count their rows, and name the blank bucket rather than rendering
an empty band:

```
▾ DEPARTMENT  Engineering  2
    Ada Lovelace      120,000
    Grace Hopper      145,000
▸ DEPARTMENT  Research     2
▾ DEPARTMENT  Blank        1
    Barbara Liskov    150,000
```

Per column:

```ts
{
  id: 'hiredAt',
  type: 'date',
  groupable: true,                                  // default; false to keep it out of the menu
  groupValue: (row) => row.hiredAt?.slice(0, 7),    // group by month, not by day
  groupLabel: (value) => `Hired ${value}`,          // header text for the band
}
```

`groupValue` defaults to the cell run through `toFilterValue`, so `null`, `undefined` and `''`
land in one bucket rather than three. Define `groupLabel` whenever you define `groupValue` —
`format` is deliberately skipped then, since it describes a cell and the bucket is no longer one.

### Who does the grouping — `groupMode`

```vue
<DataTable :columns="columns" :source="source" group-mode="client" />   <!-- the default -->
<DataTable :columns="columns" :source="source" group-mode="server" />
```

**`'client'` (default) — group the loaded data.** The table bands the rows the source already
returned. Nothing enters `QueryState`, so no refetch is triggered and a server never hears about
it; `query.groupBy` stays empty however you group. Bands are gathered client-side, so a group is
whole *within the page* even when the rows arrived interleaved, and its count is the rows you can
see. A group larger than the page shows the part that is loaded, and the rest appears on later
pages under their own header.

**`'server'` — put it in the request.** The grouping goes into `QueryState.groupBy`, and the data
source performs it:

- `useServerDataSource` includes it in the request, refetches when it changes, and your fetcher
  receives `query.groupBy`.
- `useLocalDataSource` sorts the whole dataset by it.

Groups then stay whole *across* pages, and counts describe the entire group rather than the visible
slice. Grouping also resets to page 1, since it decides which rows land on which page.

The prop is bound through on every change, so it governs a `state` you built yourself too. Leave it
unset and the state keeps whatever it was constructed with — `useTableState({ groupMode: 'server' })`.

Two mechanics behind that split:

- **The grouped columns sort first.** `groupedSort(sort, groupBy)` prepends them to the sort rules,
  which is what makes a group contiguous. The local source applies it in `'server'` mode; a server
  fetcher should apply the same helper (it is exported) or sort by `query.groupBy` before
  `query.sort`. In `'client'` mode the table applies `groupSortRules` to the page instead — the
  grouped keys *only*, so the order inside a band is left exactly as the source produced it and a
  server's own collation is never fought client-side.
- **Counts follow the mode.** `groupCounts` is optional on `DataSource` and implemented by
  `useLocalDataSource`. It is consulted only in `'server'` mode, where the source ordered the whole
  set; in `'client'` mode a band counts the rows it actually holds, so the number never contradicts
  what is on screen. Either way it reaches the header as `group.totalCount`, with `group.count`
  always describing the loaded rows.

### Aggregates

A column declares what its group rows should show, and the value lands under that column:

```ts
{ id: 'salary', header: 'Salary', type: 'number',
  aggregate: 'sum',
  aggregateFormat: (r) => money.format(Number(r.value)) },

{ id: 'rating', header: 'Rating', type: 'number', aggregate: 'avg' },

{ id: 'hiredAt', header: 'Hired', type: 'date', aggregate: 'min' },
```

```
▾ DEPARTMENT Engineering  2 │         │ $265,000 │ 4.4 ★ │
    Ada Lovelace           │ Canada  │ $120,000 │ 4.1 ★ │
    Grace Hopper           │ USA     │ $145,000 │ 4.7 ★ │
▾ DEPARTMENT Research     2 │         │ $130,000 │ 3.9 ★ │
```

`sum` and `avg` coerce cells through `toNumber` and **skip whatever will not coerce** — a
`null` salary is not a zero, so it changes neither the total nor the average's denominator
(`result.sampleCount` is what the mean was divided by). A group with nothing aggregable reports
`null`, not `0`.

`min` and `max` use the column's comparator — its own `comparator` if it has one, otherwise the
one its `type` implies — and report the winning cell's **own value**, so a date column yields a
date rather than a timestamp. They also carry the row they came from, which is why they need no
`aggregateFormat`: `format` can render them in context. A sum has no row to hand `format`, so a
column that needs its totals dressed up declares `aggregateFormat` instead.

The group row splits into cells only as far as it must: the label spans everything up to the
first aggregated column, and columns after it get a cell each. **Declare no aggregates and the
group row is the plain single-cell banner it has always been.**

### Whole-table totals

```vue
<DataTable :columns="columns" :source="source" show-footer footer-label="All staff" />
```

Off by default — declaring an aggregate should not add a row nobody asked for. The `<tfoot>`
uses the same per-column declarations, works with grouping switched off, and sticks to the
bottom of the scroll box when you give it a height. The label yields its cell to a first column
that aggregates something of its own.

### Where the numbers come from

Same rule as the group counts, for the same reason:

- **`groupMode: 'client'`** — a band aggregates the rows loaded under it. What you see is what
  was added up.
- **`groupMode: 'server'`** — figures come from `DataSource.groupAggregates`, so a group split
  across a page boundary still totals its whole self. `useLocalDataSource` implements it; a
  server source that does not falls back to the loaded rows.

Pure functions underneath, usable with no component at all: `aggregateValue`, `aggregateRow`,
`aggregateGroups` (keyed like `RowGroup.key`, with the whole set under `ROOT_GROUP_KEY`), and
`formatAggregate`.

### Headless

`useRowGrouping` owns the collapse state and the flattening, and `TableRoot` exposes both:

```vue
<TableRoot v-slot="{ displayRows, grouping }" :columns="columns" :source="source">
  <tbody>
    <template v-for="item in displayRows">
      <TableGroupRow v-if="item.kind === 'group'" :key="item.group.key" :group="item.group" />
      <tr v-else :key="item.row.id"><!-- your cells --></tr>
    </template>
  </tbody>
</TableRoot>
```

`useRowGrouping` also gathers the rows it is handed into bands (`orderedRows`), which is what makes
`'client'` mode work — pass it the active `sort` so the bands come out the way the grouped column is
sorted. `grouping.toggle(key)`, `grouping.collapseAll()` and `grouping.expandAll()` drive collapse;
`collapsedByDefault` (`:groups-collapsed` on the preset) flips the starting state, and applies to
groups that only appear later — after a filter change, or on page 4 — rather than only to the ones
visible at mount.

Below that sit the pure functions, usable with no component at all: `groupedSort`,
`groupSortRules`, `flattenGroups`, `countGroups`, `groupValueOf`, `groupPathKey`.

Styling hooks: `.vt-group-row[data-depth][data-collapsed]`, `.vt-group-cell`, `.vt-group-toggle`,
`.vt-group-label`, `.vt-group-count`, plus `--vt-bg-group` and `--vt-group-indent-step`.

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

### Rules and row striping

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

Row striping is off by default — both stripes inherit `--vt-bg`, so setting one is enough:

```css
.vt-datatable {
  --vt-bg-row-even: #f4f6f9;   /* zebra: odd rows keep --vt-bg */
}
```

### Hover, selection, and how cell backgrounds stack

A cell's background is a **stack**, not a single colour. `background-color` is the opaque base —
the table background or the row's stripe — and every state above it is a `background-image` layer
painted over it, topmost first:

```
cell hover  ┐ topmost
selected    │
row hover   │
column tint ┘ bottom
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

### Per-column background

`background` and `headerBackground` on the column def, because *which column* is not something a
stylesheet should have to know:

```ts
{ id: 'salary', header: 'Salary', background: 'rgb(249 115 22 / 0.14)' }
```

The value reaches the cell as the `--vt-column-bg` custom property and is painted as the bottom
layer of the stack above — never as an inline `background`, which would outrank every state rule
and leave hover and selection dead in that column. Use an alpha below 1 and the column reads as a
tint over whatever the row is doing; use an opaque colour and the column wins outright.

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

### Remembering the layout

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

Row virtualization, tree rows (parent/child hierarchies, as opposed to the value-based grouping
above), editable cells, and pivoting. Aggregation covers `sum`/`avg`/`min`/`max` and no custom
reducer. The core is structured so virtualization slots in at the rendering layer without touching
the pipeline — `filteredRows` on the local source is the hook for it.
