# Using vue-table-chad in another project

<script setup>
import Example from './.vitepress/examples/getting-started.vue'
</script>

<Demo :is="Example" />

<<< @/.vitepress/examples/getting-started.vue

Installing it, the row type it insists on, and the three ways to build a table with it. Every
snippet on this page was type-checked against the built package rather than against `src/` — the
difference matters, because a consumer gets the generated `.d.ts`, not the source.

> **Not using TypeScript?** [Using vue-table-chad from plain JavaScript](getting-started-js.md) is the
> same ground without it — and the constraint in §"The row type constraint" below, the one real
> friction point here, does not exist there at all.

## Install

The package is released as a tarball, not published to npm (see [`TASKS.md`](https://bitbucket.org/BrilllianD/vue-table-chad/src/main/TASKS.md)), and `dist/` is
gitignored, so a git dependency would install an empty package. Build the tarball and install that:

```bash
# in this repo
nvm use            # Node 24
pnpm install
make pack          # build + size check + npm pack -> brillliand-vue-table-chad-0.3.2.tgz
```

```bash
# in your project
pnpm add file:../vue-table-chad/brillliand-vue-table-chad-0.3.2.tgz
```

`files: ["dist"]` means the tarball is `dist/` plus `README.md` and `LICENSE` — eight files, no
source: one JS bundle with its rolled-up `vue-table-chad.d.ts`, one stylesheet, and the `locales`
entry point with declarations of its own. Rebuild and re-pack after every change; `pnpm add` on the
same path again picks it up.

For live development against both at once, a workspace link is less friction:

```bash
pnpm add link:../vue-table-chad     # resolves through package.json exports -> dist/
```

Still `dist/`, so still `pnpm build` between changes. To skip the build entirely, alias the source
in your bundler the way this repo's own demo does (`vite.demo.config.ts`):

```ts
resolve: {
  alias: {
    '@brillliand/vue-table-chad': fileURLToPath(new URL('../vue-table-chad/src/index.ts', import.meta.url)),
  },
}
```

That path compiles the library's `.vue` files in *your* build, so your Vite needs
`@vitejs/plugin-vue` (it does anyway) and your `tsconfig` needs to not exclude the directory.

### Requirements

Vue **3.5+**, declared as a peer dependency — the library brings no runtime dependency of its own.
TypeScript is optional but is most of the value: the column definitions are where the types earn
their keep.

### Packaging

ESM only — there is no `main` and no CJS build. Vue 3.5 plus Node 24 makes a CJS consumer largely
theoretical, and a second output format is a cost paid on every release; `attw --profile esm-only`
is the check that reflects the gap as deliberate rather than a failure.

The stylesheet is a subpath export, `@brillliand/vue-table-chad/style.css`, not bundled into the JS
entry — so importing the library never pulls in CSS you did not ask for, and a core-only or
primitives-only consumer stays at zero.

Type declarations are rolled up into one file (`rollupTypes: true`). The per-file emit would
re-export through extensionless relative specifiers like `'./components/primitives/TableRoot.vue'`,
which TypeScript cannot follow under `node16`/`nodenext` resolution — a consumer set to `nodenext`
would see every accessor parameter degrade silently to `any` while their own build stayed green.
Rolling up leaves no relative specifier in the shipped types, so that failure mode cannot happen.

## The row type constraint

**Every component constrains `TRow extends Record<string, unknown>`. A plain `interface` does not
satisfy it.**

This is a TypeScript rule, not a library choice: an object-literal *type alias* gets an implicit
index signature and an `interface` does not. So this fails to compile —

```ts
interface Person { id: number; name: string }   // ✗ TS2322 on <DataTable :columns="columns">
```

— and either of these works:

```ts
type Person = { id: number; name: string }                        // ✓ implicit index signature
interface Person extends Record<string, unknown> { id: number }   // ✓ opt in explicitly
```

The failure is loud but the message is long, and it blames `accessor` and `source` rather than the
declaration that actually caused it. `bench/fixtures.ts` uses the second form; a `type` alias is
usually the lighter fix.

The **core composables are unconstrained** — `useTable`, `useLocalDataSource`, `useRowEditing`,
`useRowSelection` and `useCellCursor` all take a bare `interface` happily. Only the components
require the index signature, because a component's props have to be assignable through Vue's own
generic machinery.

## The shortest working table

```vue
<script setup lang="ts">
import { shallowRef } from 'vue'
import {
  DataTable,
  useLocalDataSource,
  useTableState,
  type ColumnDef,
} from '@brillliand/vue-table-chad'
import '@brillliand/vue-table-chad/style.css'

type Person = {
  id: number
  name: string
  department: string
  salary: number
  hiredAt: string
}

// Your rows. Three inline ones here; a fetch that assigns `rows.value` later
// works the same, and the table shows its empty message until it lands.
const rows = shallowRef<Person[]>([
  { id: 1, name: 'Ada Lovelace', department: 'Engineering', salary: 120_000, hiredAt: '2019-03-04' },
  { id: 2, name: 'Grace Hopper', department: 'Engineering', salary: 145_000, hiredAt: '2017-08-15' },
  { id: 3, name: 'Barbara Liskov', department: 'Research', salary: 150_000, hiredAt: '2021-01-11' },
])

const columns: ColumnDef<Person>[] = [
  { id: 'name', header: 'Name', type: 'text', pinned: 'left' },
  { id: 'department', header: 'Department', type: 'enum', options: ['Engineering', 'Research'] },
  {
    id: 'salary',
    header: 'Salary',
    type: 'number',
    align: 'right',
    aggregate: 'sum',
    format: (v) => (v == null ? '—' : `$${Number(v).toLocaleString()}`),
  },
  { id: 'hiredAt', header: 'Hired', type: 'date' },
]

const state = useTableState({ pageSize: 25 })
const source = useLocalDataSource(rows, columns, state.query)
</script>

<template>
  <DataTable :columns="columns" :source="source" :state="state" selectable show-footer>
    <template #cell:name="{ row }">
      <a :href="`/people/${row.id}`">{{ row.name }}</a>
    </template>
  </DataTable>
</template>
```

Four things are load-bearing there:

- **`shallowRef`, not `ref`.** A plain `ref` deep-proxies every row object, so each cell read in the
  filter, sort, group and aggregate passes goes through a Proxy trap. Worth 1.6–1.9× on filter and
  sort — the README's [quick start](https://bitbucket.org/BrilllianD/vue-table-chad/src/main/README.md) has the numbers.
- **`type` decides behaviour**, not just formatting: it picks the comparator and it decides which
  operators the filter panel offers (`contains` for text, `between` for numbers, `before`/`after`
  for dates).
- **`columns` is a plain array**, defined outside any `computed`, so its identity is stable. Build
  it in a `computed` only if it genuinely changes.
- **The stylesheet is a separate import.** `DataTable` imports it itself, so this line is redundant
  when you use the preset — but it is not tree-shaken away and it is what a primitives-only table
  needs. Importing it twice costs nothing.

Rows are identified by `row.id`. Pass `getRowId` when they are keyed by something else — it drives
selection, editing drafts, the cursor position *and* the render keys.

## `DataTable` props

The preset owns no logic; every prop here is forwarded to a composable or a primitive.

| Prop | Type | Default | What it does |
| --- | --- | --- | --- |
| `columns` | `ColumnDef<TRow>[]` | — | Required. |
| `source` | `DataSource<TRow>` | — | Required. Local or server, indistinguishable from here. |
| `state` | `TableState` | builds one | Pass one to hoist the query into a URL or store. |
| `selectable` | `boolean \| 'single' \| 'multiple'` | `false` | `true` means multiple. |
| `getRowId` | `(row) => RowId` | `row.id` | Identity for selection, drafts, cursor and render keys. |
| `isRowSelectable` | `(row) => boolean` | all | Greys out the checkbox for rows it refuses. |
| `rowClickSelect` | `boolean` | `false` | Shift- and Ctrl/Cmd-click on the row itself, not only on its checkbox. An unmodified click still never changes the selection, so `@row-click` keeps working. |
| `selectionState` | `SelectionState` | table-owned | `v-model:selection-state` — the whole selection, for a caller that wants to seed, store or restore it. See [Selection](selection.md#owning-the-selection-yourself). |
| `columnGroups` | `ColumnGroupDef[]` | — | Header bands. Optional even when columns declare `group`. |
| `initialLayout` | `Partial<ColumnLayoutState>` | — | Read once at setup. |
| `storageKey` | `string` | — | Remembers the column layout in `localStorage`. |
| `storageFields` | `ColumnLayoutField[]` | all four | Which of visibility/order/width/pin to remember. |
| `pageSize` | `number` | `10` | Ignored when `state` is supplied — that state is the authority. |
| `virtual` | `boolean` | `false` | Every row as one continuous scroll, only the visible ones in the DOM. Mutually exclusive with paging: the page size becomes the whole result set and no pager is rendered. |
| `rowHeight` | `number` | `38` | Row height in CSS px. Read only in `virtual` mode, where it also becomes `--vtc-row-height` — change the prop, never the token. |
| `overscan` | `number` | `4` | Rows kept rendered beyond each edge of the viewport. |
| `measureRows` | `boolean` | `false` | Measure each rendered row instead of trusting `rowHeight`, for a virtual body whose rows are not all one height. Costs one forced layout per update, on the rows in the window. |
| `endThreshold` | `number` | `0` | How many rows before the end of a virtual window `endReached` fires. Larger fires earlier, which a slow request wants; `0` waits for the last row. |
| `reorderable` | `boolean` | `true` | Drag headers to reorder. |
| `initialGroupBy` | `string[]` | `[]` | Outermost level first. |
| `groupMode` | `'client' \| 'server'` | `'client'` | See [Grouping](grouping.md). |
| `groupsCollapsed` | `boolean` | `false` | Every band folded on first render. |
| `blankGroupLabel` | `string` | `'Blank'` | Header for the no-value bucket. |
| `showFooter` | `boolean` | `false` | Aggregates every loaded row using the columns' `aggregate`. |
| `footerLabel` | `string` | `'Total'` | Text in the footer's leading cell. |
| `showToolbar` / `showSearch` / `showColumnsMenu` / `showGroupMenu` / `showPagination` | `boolean` | `true` | Regions on or off. |
| `showExport` | `boolean` | `false` | The toolbar's export button. Off by default unlike the other `show*`: those turn on a read-only control, this one writes a file to the reader's disk. See [Local, server and infinite data](data-sources.md#exporting-the-result-set). |
| `exportFilename` | `string` | `'table.csv'` | Name of the downloaded file, extension included. |
| `exportFetchAll` | `() => Promise<TRow[]>` | — | Fetches every row for the export over a server or infinite source. Without it a remote export holds the current page and warns. Ignored on a local source. |
| `columnRules` | `boolean` | unset | Vertical rules between every pair of columns. Unset emits nothing, so a stylesheet setting `--vtc-body-border-vertical-width` still governs. |
| `bandRules` | `boolean` | unset | The rule where a band's columns end. Needs `columnGroups`; unset emits nothing and `--vtc-band-border-width` governs. |
| `stickyHeader` | `boolean` | `true` | |
| `theme` | `'light' \| 'dark' \| 'system'` | `'system'` | Which palette to paint. `'system'` emits nothing and follows `prefers-color-scheme`; the other two write `data-theme`, on the teleported popover and drag ghost as well. See [Styling](styling.md#picking-a-palette). |
| `emptyMessage` / `loadingMessage` | `string` | see below | `'No Data'` / `'Loading…'` |
| `labels` | `Partial<TableLabels>` | English | Wording for every string the table renders, `aria-label`s included. Four locales ship — see [Labels and i18n](labels.md). `emptyMessage`, `loadingMessage` and `footerLabel` win over it where both are given. |
| `editing` | `UseRowEditing<TRow>` | — | A session from `useRowEditing`. Absent means read-only. |
| `cellCursor` | `boolean` | `false` | Off means off: no `role="grid"`, no `tabindex`, no cursor attributes. |
| `initialCursor` | `CellPosition` | first cell | |
| `autofocusCursor` | `boolean` | `false` | Take the caret on load. Only for pages where the table is the point. |

Events: `update:query(query)`, `update:selection(ids)`, `update:selectionState(state)`,
`update:selectedRows(rows)`, `update:columnOrder(order)`, `rowClick(row, event)`, `rowSaved(row)`,
`rowSaveError(row, error)`, `endReached()`, `export(payload)`.

`export` fires *before* the download, carrying the serialised text; `preventDefault()` on the
payload cancels it, for a consumer who would rather POST the text or name the file from the query.

Two of the others are gated on being listened for. `update:selectedRows` resolves the selected rows
across the whole filtered set, which is a walk over the dataset, so a table that never binds it
pays nothing. `endReached` is what a virtual table wires to an infinite source's `loadMore` — see
[Virtual rows](virtualization.md).

## `DataTable` slots

| Slot | Props | Replaces |
| --- | --- | --- |
| `cell:<columnId>` | `row`, `column`, `value`, `text` | One column's cell content. |
| `editor:<columnId>` | editor props, plus `row`, `column` | That column's edit control. |
| `toolbar` | `state`, `selection`, `total` | The whole toolbar row. |
| `headerGroup` | band props | A header band's cell. |
| `group` | `group`, `columnLabel`, … | A group header row. |
| `groupAggregate` | `text`, … | One aggregate inside a group header. |
| `rowActions` | `row`, `state`, `editing` | The trailing cell in row-edit mode. |
| `footer` | footer props | The footer row. |
| `empty` | — | The "no rows" message. |
| `error` | `error`, `refresh` | The load-failure row, Retry button included. |
| `loading` | — | The spinner pill. |
| `pagination` | `state`, `total` | The pager. |

`cell:<id>` and `editor:<id>` carry a column id in the name, so there is no fixed list — the preset
forwards whatever you passed, which is what keeps its own fallbacks (plain cell text, the default
group header) working for the columns you did not override.

## What a template ref exposes

Three things, for code that would rather not wire a slot or an event:

| Member | What it is |
| --- | --- |
| `selection` | The `UseRowSelection` behind the checkboxes, or `undefined` when `selectable` is off. |
| `getSelectedRows()` | The selected rows themselves, resolved across pages where the source holds them all. A function, not a computed: resolving is a walk, and a function makes that a cost you ask for when you want the answer. |
| `remeasureColumns()` | Measure the undeclared column widths again, for a caller that swapped the dataset for one whose cells are a different size. Widths a user dragged are untouched. |

```vue
<script setup lang="ts">
import { useTemplateRef } from 'vue'
import { DataTable } from '@brillliand/vue-table-chad'
// `Person`, `rows`, `columns` and `source` as in the table above.

// `DataTable` is a generic component, so `InstanceType<typeof DataTable>` is
// the way to name what the ref holds; `ComponentPublicInstance` would lose the
// exposed members.
const table = useTemplateRef<InstanceType<typeof DataTable>>('table')

function submit() {
  console.log(table.value?.selection?.count.value, table.value?.getSelectedRows())
}

function swapDataset(next: Person[]) {
  rows.value = next
  table.value?.remeasureColumns()
}
</script>

<template>
  <DataTable ref="table" :columns="columns" :source="source" selectable />
</template>
```

The live example on [Selection](selection.md) reads `getSelectedRows()` through exactly this ref.

## Server data instead of local

Swapping the source is the only change. Nothing above it — the columns, the state, the component,
the slots — knows which one it was handed:

```ts
const source = useServerDataSource(
  ({ query, signal }) =>
    fetch(`/api/people?q=${encodeURIComponent(JSON.stringify(query))}`, { signal })
      .then((r) => r.json()),          // -> { rows, total }
  state.query,
  {
    debounceMs: 300,
    fetchFacets: (columnId, { query, signal }) =>
      fetch(`/api/people/facets?column=${columnId}`, { signal }).then((r) => r.json()),
  },
)
```

`query` reaches your fetcher as a plain JSON snapshot, detached from Vue's reactivity, so it is safe
to hold. Out-of-order responses, aborting, `keepPreviousData` and facet scoping are handled — see
[Local and server data](data-sources.md).

`groupCounts` and `groupAggregates` are optional on `DataSource` because only a source holding every
row can answer them. A local source always can; a server one degrades to per-page counts unless you
implement them.

## Editable rows

The session is built separately and passed in, because it carries four callbacks the table has no
opinion about:

```ts
// `api` is your HTTP client. `save` resolves once the server holds the row and
// rejects when it refused; `source`, `columns` and `rows` are the ones above.
const editing = useRowEditing(source, columns, {
  mode: 'cell',                                   // or 'row' — one Save for the whole row
  validate: (next) => (next.salary > 0 ? null : { salary: 'Must be positive' }),
  save: (change) => api.patch(change.id, change.patch),
  // A local source holds *your* array and cannot see a change you have not made:
  apply: (next) => { rows.value = replaceRowIn(rows.value, next, (r) => r.id) },
})
```

```vue
<DataTable :columns="columns" :source="source" :editing="editing" cell-cursor />
```

`apply` defaults to `source.refresh()`, which is right for a server source and wrong for a local
one — hence `replaceRowIn`. Reject from `save` with an object carrying `fields` to put messages on
particular cells. Editing never touches the data pipeline until a save *succeeds*.

A column whose options are too many to send declares `asyncOptions` instead of `options`, and the
cell gets a dropdown that fetches them a portion at a time as it is scrolled or searched:

```ts
// `api` again stands for your HTTP client; each call returns `{ items, total }`.
const managers = useAsyncOptions(
  async ({ search, loaded, signal }) => {
    const body = await api.managers({ q: search, offset: loaded, limit: 25, signal })
    return { options: body.items.map((m) => ({ value: m.id, label: m.name })), total: body.total }
  },
  // Labels the ids the rows already hold — one request for the whole page.
  { resolveOptions: (ids, { signal }) => api.managersByIds(ids, signal) },
)
// { id: 'managerId', header: 'Manager', editable: true, asyncOptions: managers }
```

The request carries `page`, `loaded` and `cursor` together, so an offset, a page-number or a cursor
endpoint all fit without the library naming a protocol. See
[Editing](editing.md#a-list-too-long-to-send) for what a *closed* cell shows, which is the part
worth reading before you use it.

## Building your own table

`DataTable` is one caller of `TableRoot`, not a privileged one. Two levels below it:

### 1. `TableRoot` — your markup, its wiring

The default slot hands you everything, and the primitives inside find their state by injection, so
they need no props:

```vue
<script setup lang="ts">
import { shallowRef } from 'vue'
import {
  TableRoot, SortTrigger, ColumnFilterPopover, TablePagination,
  useLocalDataSource, useTableState, type ColumnDef,
} from '@brillliand/vue-table-chad'

type Person = { id: number; name: string; department: string; salary: number }

const rows = shallowRef<Person[]>(people)      // your rows, as in the table above
const columns: ColumnDef<Person>[] = [/* … */]  // the same column definitions work here
const state = useTableState({ pageSize: 10 })
const source = useLocalDataSource(rows, columns, state.query)
</script>

<template>
  <TableRoot
    v-slot="{ rows: pageRows, selection, total }"
    :columns="columns"
    :source="source"
    :state="state"
    selectable
  >
    <header>
      <SortTrigger column-id="salary" label="Salary" />
      <ColumnFilterPopover column-id="department" type="enum" />
      <span>{{ total }} rows</span>
    </header>

    <!-- cards, not a table -->
    <article v-for="row in pageRows" :key="row.id" @click="selection?.toggle(row)">
      {{ row.name }} — {{ row.department }}
    </article>

    <TablePagination />
  </TableRoot>
</template>
```

The slot carries `rows`, `displayRows`, `overallAggregates`, `grouping`, `columns`, `allColumns`,
`headerRows`, `state`, `selection`, `cursor`, `pagination`, `dnd`, `editing`, `source`, `loading`,
`error`, `total`, `getRowId`, `getRowKey`, `getCellValue` and `getCellText`.

**No CSS comes with this.** That is what headless buys: primitives emit class names and `data-*`
attributes and nothing else. Import `@brillliand/vue-table-chad/style.css` if you want the default
theme anyway, or write your own against `.vt-th[data-sorted='asc']` and friends — see
[Styling](styling.md).

Every primitive also takes explicit props that override the injected context, so each one works
standalone with no `TableRoot` above it:

```vue
<TablePagination :page="page" :page-size="20" :total="count" @update:page="page = $event" />
```

Three are the exception and genuinely require a root — `ColumnVisibilityMenu`, `RowGroupMenu` and
`ActiveFilters` — because each reads the whole column, group or filter model rather than taking it
as props. They call `requireTableContext()` and throw a named error without one.

### 2. `useTable()` — no component at all

`TableRoot` is thin: it calls `useTable()`, publishes the result with `provideTableContext()`, and
renders a slot. Call it directly when you want the wiring and none of the markup. Note that here
`TRow` is unconstrained, so a plain `interface` is fine:

```ts
interface Person { id: number; name: string; salary: number }

// `columns`, `source` and `state` as declared for the table above.
const table = useTable<Person>({
  columns: () => columns,
  source: () => source,
  state,                        // optional; it builds one if you don't
  selectable: () => true,
})

provideTableContext(table)      // only if primitives beneath need to find it
```

Options are **getters wherever the value can change** — a composable has no props to watch, so you
supply the read; `initialLayout`, `storageKey`, `pageSize` and `initialCursor` are read once at
setup instead. `UseTableOptions` says which are which.

What comes back is the `TableContext` every primitive reads, plus `headerRows`, `cursor`,
`rowSelection` and `getRowKey`. Grouping, selection gating, cursor seeding and layout persistence
all happen inside, so a hand-built table gets those rules rather than reimplementing them.

### 3. Nothing but the pure functions

`core/` imports nothing from `components/` and works with no Vue components at all. `filterRows`,
`sortRows`, `buildGroupTree`, `flattenTree`, `aggregateGroups`, `computeFacets`, `compileFilter`
and the comparators are all exported and all pure — usable in a worker, a test, or a server route.

## Hoisting the query into a URL or store

`QueryState` is plain JSON by contract, which is what makes this a two-liner:

```ts
function readFromUrl(): QueryState | null {
  const raw = new URLSearchParams(location.search).get('q')
  return raw ? (JSON.parse(raw) as QueryState) : null
}

const external = ref<QueryState>(readFromUrl() ?? createQueryState({ pageSize: 25 }))
const state = useTableState({ state: external })

watch(external, (q) => history.replaceState(null, '', `#q=${encodeURIComponent(JSON.stringify(q))}`),
  { deep: true })
```

Mirroring is synchronous both ways, so reading `external.value` right after `state.setPage(3)` gives
you page 3.

## What is not included

Tree rows, expandable detail rows, pinned rows, and pivoting. Cell-level clipboard copy and paste
*is* in — see [Keyboard navigation](keyboard.md) — and so is CSV/TSV export, see
[Local, server and infinite data](data-sources.md). Aggregation covers
`sum`/`avg`/`min`/`max` with no custom reducer. i18n *is* in: every string the table renders comes
off one `labels` record, four locales ship complete, and a spec keeps new literals out — see
[Labels and i18n](labels.md). [`TASKS.md`](https://bitbucket.org/BrilllianD/vue-table-chad/src/main/TASKS.md) has the
reasoning for each of the rest.

Row virtualization *is* included — see [Virtual rows](virtualization.md). Note what it means for a
**server** source: `virtual` sets the page size to the size of the result set, so every request
fetches the whole matching set rather than a page.

## Where to go next

Every page below has a matching view in `pnpm demo`, where the same thing runs against real data.

<!-- docs:index:short start — generated by `pnpm docs:index`; edit docs/nav.ts -->
| Page | For |
| --- | --- |
| […from plain JavaScript](getting-started-js.md) | The same, without TypeScript: what a column accepts, the four mistakes the compiler would have caught, and how to get autocomplete back with JSDoc. |
| [The two contracts](contracts.md) | `QueryState` and `DataSource` — the two interfaces everything else is written against. |
| [Local, server and infinite data](data-sources.md) | `useLocalDataSource`, `useServerDataSource`, `useInfiniteDataSource`, and why swapping one for another changes nothing above. |
| [Excel-style filters](filtering.md) | The value checklist, condition rules, and facets. |
| [Sorting and pagination](sorting-and-pagination.md) | `usePagination`, `PageItem`, `SortOptions`, per-column comparators, and null-sorting. |
| [Selection](selection.md) | Shift-ranges, the tri-state header, and selecting more rows than are loaded. |
| [Grouping rows](grouping.md) | Bands, `groupMode`, aggregates and whole-table totals. |
| [Editing cells](editing.md) | A draft per row, cell and row mode, validation, and a save the server can refuse. |
| [Keyboard navigation](keyboard.md) | The cell cursor: arrow keys, Enter or any character to edit, copy and paste, and the roving tabindex behind it. |
| [Column layout](column-layout.md) | Visibility, order, widths, pinning, persistence and drag-to-reorder. |
| [Header bands](column-groups.md) | Multi-row headers: banding columns under a shared header, nesting them, and folding a band shut. |
| [Styling](styling.md) | The `--vtc-*` variables, striping, and how cell backgrounds stack. |
| [Labels and i18n](labels.md) | The four shipped locales, overriding every string the table renders, and the spec that keeps new literals out. |
| [Virtual rows](virtualization.md) | Windowing a fixed-height list, and the whole-result-set caveat over a server source. |
| [Composing your own](composing.md) | Building a different table from the same parts, and hoisting state into a URL or store. |
| [Performance](performance.md) | The `shallowRef` rule, the invalidation invariants, and the benchmark numbers behind them. |
| [Recipes](recipes.md) | Six worked recipes, from a bare table to retheming without touching a component. |
<!-- docs:index:short end -->

The full API — every export with what it is for — is the **API reference** tab of `pnpm demo`,
generated from the doc comments in `src/`, so it cannot fall behind the code.

Live: the **Everything at once** tab of `pnpm demo` (`#overview`). Back to the [docs index](/).
