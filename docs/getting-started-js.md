# Using vue-table-chad from plain JavaScript

**Short answer: it is easier from JavaScript than from TypeScript.** The one real friction point in
the [TypeScript guide](getting-started.md) — every component constraining
`TRow extends Record<string, unknown>`, which a plain `interface` fails to satisfy — is a
compile-time rule and does not exist for you. Nothing else about the library needs TypeScript.

The package ships `dist/vue-table-chad.js`: plain ESM JavaScript whose only import is `vue`. The
TypeScript types live in separate `.d.ts` files that your bundler never reads. No build step of ours
runs in your project, and there is no runtime type checking to trip over — a column definition is an
ordinary object literal.

What you give up is editor autocomplete on those object literals and the compiler catching a typo in
`type: 'txet'`. [Getting the types back](#getting-the-types-back-without-writing-typescript) below
restores both without a single `.ts` file, and is worth the ten minutes.

Everything on this page was built and run against the packaged library — the plain-JS examples with
`vite build`, the JSDoc section with `vue-tsc` — rather than written from the source.

## Install

Identical to the TypeScript path; see [Install](getting-started.md#install) for the tarball,
`link:` and bundler-alias options. In short:

```bash
# in this repo
pnpm install && pnpm build && npm pack

# in your project
pnpm add file:../vue-table-chad/brillliand-vue-table-chad-0.2.1.tgz
```

You need Vue **3.5+** and a bundler that compiles `.vue` files — the library's components arrive
pre-compiled inside `dist/vue-table-chad.js`, so `@vitejs/plugin-vue` is only for *your* own components.
No `tsconfig.json`, no `vue-tsc`, no `lang="ts"` anywhere.

## Your first table

```vue
<script setup>
import { shallowRef } from 'vue'
import { DataTable, useLocalDataSource, useTableState } from '@brillliand/vue-table-chad'
import '@brillliand/vue-table-chad/style.css'

const rows = shallowRef([
  { id: 1, name: 'Ada', department: 'Eng', salary: 120000, hiredAt: '2019-04-01' },
  { id: 2, name: 'Grace', department: 'Eng', salary: 140000, hiredAt: '2018-01-15' },
  { id: 3, name: 'Alan', department: 'Research', salary: 110000, hiredAt: '2021-09-30' },
])

const columns = [
  { id: 'name', header: 'Name', type: 'text', pinned: 'left' },
  { id: 'department', header: 'Department', type: 'enum' },
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

That is the TypeScript quick start with `lang="ts"` and two type imports removed. Nothing else
changed, and it produces a byte-identical stylesheet.

Four things are load-bearing:

- **`shallowRef`, not `ref`.** A plain `ref` deep-proxies the array *and* every row object in it, so
  each cell read in the filter, sort, group and aggregate passes goes through a Proxy trap. Worth
  1.6–1.9× on filter and sort — see the README's [quick start](https://bitbucket.org/BrilllianD/vue-table-chad/src/main/README.md).
- **`type` decides behaviour**, not just formatting: it picks the comparator and decides which
  operators the filter panel offers. Getting it wrong is the most common JS-only bug here, because
  nothing tells you — a `salary` column left at the default `'text'` sorts `100` before `99`.
- **`columns` is a plain array defined outside any `computed`**, so its identity is stable across
  renders.
- **The stylesheet is a separate import.** `DataTable` imports it itself, so the line is redundant
  when you use the preset — but it is what a primitives-only table needs, and importing it twice
  costs nothing.

Rows are identified by `row.id`. Pass `getRowId` when yours are keyed by something else — it drives
selection, editing drafts, the cursor position *and* the render keys.

## The values a column accepts

Without types in your editor, this is the reference you actually need. Anything not listed is not a
valid value, and passing one silently falls back to the default.

| Field | Legal values | Default |
| --- | --- | --- |
| `id` | any string; must match a key on the row unless you pass `accessor` | required |
| `type` | `'text'`, `'number'`, `'date'`, `'boolean'`, `'enum'` | `'text'` |
| `align` | `'left'`, `'center'`, `'right'` | `'left'` |
| `pinned` | `'left'`, `'right'`, `false` | `false` |
| `aggregate` | `'sum'`, `'avg'`, `'min'`, `'max'` | none |
| `editor` | `'text'`, `'number'`, `'date'`, `'checkbox'`, `'select'`, `'textarea'` | derived from `type` |
| `sortable`, `filterable`, `resizable`, `hideable`, `reorderable`, `groupable`, `required` | `true` / `false` | `true` (`required` is `false`) |
| `searchable` | `true` / `false` | whatever `filterable` is |
| `width`, `minWidth`, `maxWidth` | numbers, in px | unset |
| `options` | array of values, for an `enum` column's fixed checklist | derived from the data |
| `background`, `headerBackground` | any CSS colour, alpha included | unset |
| `group` | the id of a header band | none |

The function-valued fields, all of which take the row as an argument:

| Field | Signature | For |
| --- | --- | --- |
| `accessor` | `(row) => value` | Pulls the sortable/filterable value out. Defaults to `row[id]`. |
| `format` | `(value, row) => string` | Display text, and the filter checklist's labels. |
| `comparator` | `(a, b) => number` | Overrides the type-derived sort. |
| `groupValue` | `(row) => value` | The bucket key when grouping by this column — coarser than the cell, e.g. a date by month. |
| `groupLabel` | `(value) => string` | The group header's text. |
| `aggregateFormat` | `(result) => string` | Formats a computed aggregate. |
| `editable` | `boolean` or `(row) => boolean` | Per-row veto on editing. |
| `setValue` | `(row, value) => nextRow` | Writes an edit back. **Required whenever `accessor` reads somewhere `row[id]` does not** — a function cannot be inverted. Defaults to `{ ...row, [id]: value }`. |
| `parse` | `(input, row) => value` | Turns editor output into the column's value. Return `undefined` for "does not parse", which is distinct from `null` for "legitimately blank". |
| `validate` | `(value, row) => string \| null` | An error message, or `null` to accept. |

Filter operators, if you build a `ConditionsFilter` by hand: text columns take `contains`,
`notContains`, `startsWith`, `endsWith`, `eq`, `neq`, `empty`, `notEmpty`; number columns `eq`,
`neq`, `gt`, `gte`, `lt`, `lte`, `between`, `empty`, `notEmpty`; date columns `on`, `before`,
`after`, `between`, `empty`, `notEmpty`; enum columns `eq`, `neq`, `empty`, `notEmpty`; boolean
columns `eq` only. `operatorsFor(type)` returns exactly these lists at runtime, and
`OPERATOR_LABELS` maps each to its English name — so you can build a filter UI without hardcoding
either.

## Getting the types back without writing TypeScript

You do not have to adopt TypeScript to get autocomplete on `ColumnDef` and a red squiggle under
`type: 'txet'`. A JSDoc annotation and a `jsconfig.json` are enough, and VS Code reads both with no
build step:

```json
// jsconfig.json
{
  "compilerOptions": {
    "checkJs": true,
    "moduleResolution": "bundler",
    "strict": true,
    "noEmit": true
  },
  "include": ["src/**/*.js", "src/**/*.vue"]
}
```

```vue
<script setup>
import { shallowRef } from 'vue'
import { DataTable, useLocalDataSource, useTableState } from '@brillliand/vue-table-chad'

/**
 * @typedef {object} Person
 * @property {number} id
 * @property {string} name
 * @property {number} salary
 */

/** @type {import('vue').ShallowRef<Person[]>} */
const rows = shallowRef([{ id: 1, name: 'Ada', salary: 120000 }])

/** @type {import('@brillliand/vue-table-chad').ColumnDef<Person>[]} */
const columns = [
  { id: 'name', header: 'Name', type: 'text' },
  { id: 'salary', header: 'Salary', type: 'number', align: 'right',
    format: (v) => `$${Number(v).toLocaleString()}` },
]

const state = useTableState({ pageSize: 25 })
const source = useLocalDataSource(rows, columns, state.query)
</script>
```

That file type-checks clean, and it catches the two mistakes worth catching:

```
error TS2322: Type '"txet"' is not assignable to type 'ColumnDataType | undefined'.
error TS2561: Object literal may only specify known properties, but 'pinnd' does not exist
              in type 'ColumnDef<Person, any>'. Did you mean to write 'pinned'?
```

A JSDoc `@typedef` is an object-literal type, so it gets the implicit index signature that an
`interface` does not — which is why the constraint that bites TypeScript users never bites here.

> **`checkJs` is all-or-nothing per file, and turning it on will break your un-annotated column
> arrays.** Without the `@type` line above, `type: 'text'` widens to `string`, and `string` is not
> assignable to `ColumnDataType` — so a file that built perfectly a moment ago now reports
> `TS2322`. That is the annotation asking to be written, not a bug: annotate the array and the
> literal narrows back. If you want it gradually, drop `checkJs` from `jsconfig.json` and put
> `// @ts-check` at the top of each file as you get to it.

Everything the library exports is importable this way — `import('@brillliand/vue-table-chad').QueryState`,
`.DataSource`, `.RowChange`, and the rest.

## Building your own table

All three layers work from plain JS, unchanged. `TableRoot` hands you everything and the primitives
inside find their state by injection, so they need no props:

```vue
<script setup>
import { shallowRef } from 'vue'
import {
  TableRoot, SortTrigger, ColumnFilterPopover, TablePagination,
  useLocalDataSource, useTableState,
} from '@brillliand/vue-table-chad'

const rows = shallowRef(people)
const columns = [
  { id: 'name', header: 'Name', type: 'text' },
  { id: 'department', header: 'Department', type: 'enum' },
  { id: 'salary', header: 'Salary', type: 'number' },
]
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

**No CSS comes with this**, which is what headless buys: the primitives emit class names and
`data-*` attributes and nothing else. Import `@brillliand/vue-table-chad/style.css` if you want the
default theme anyway, or write your own against `.vt-th[data-sorted='asc']` and friends — see
[Styling](styling.md).

One level further down, `useTable()` gives you the whole assembly with no component at all. Its
options are **getters wherever the value can change**, because a composable has no props to watch:

```js
import { useTable, provideTableContext } from '@brillliand/vue-table-chad'

const table = useTable({
  columns: () => columns,
  source: () => source,
  state,                        // optional; it builds one if you don't
  selectable: () => true,
})

provideTableContext(table)      // only if primitives beneath need to find it
```

And below that, `core/` is pure functions with no Vue components anywhere near them — `filterRows`,
`sortRows`, `buildGroupTree`, `flattenTree`, `aggregateGroups`, `computeFacets`, `compileFilter` and
the comparators are all exported and all usable in a worker, a test or a Node route.

Three primitives genuinely require a `TableRoot` above them — `ColumnVisibilityMenu`, `RowGroupMenu`
and `ActiveFilters` — because each reads the whole column, group or filter model rather than taking
it as props. Without one they throw a named error rather than rendering wrong. Every other primitive
also accepts explicit props that override the injected context, so it works standalone:

```vue
<TablePagination :page="page" :page-size="20" :total="count" @update:page="page = $event" />
```

## Server data, and editing

Both are plain object literals too. Swapping the source is the only change needed to go remote —
the columns, the state, the component and the slots above it never learn which one they were handed:

```js
const source = useServerDataSource(
  ({ query, signal }) =>
    fetch(`/api/people?q=${encodeURIComponent(JSON.stringify(query))}`, { signal })
      .then((r) => r.json()),          // -> { rows, total }
  state.query,
  { debounceMs: 300 },
)
```

`query` reaches your fetcher as a plain JSON snapshot, detached from Vue's reactivity, so it is safe
to hold or serialise. Out-of-order responses, aborting, `keepPreviousData` and facet scoping are all
handled for you — see [Local and server data](data-sources.md).

Editing is a session built separately and passed in:

```js
import { useRowEditing, replaceRowIn } from '@brillliand/vue-table-chad'

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
one — hence `replaceRowIn`. Reject from `save` with an object carrying a `fields` property to put
messages on particular cells.

## The JS-only failure modes

Four mistakes the compiler would have caught. All four are silent at runtime, so they are worth
knowing by name:

1. **A misspelled `type`.** `type: 'nubmer'` is not rejected; the column quietly sorts as text, so
   `100` lands before `99`. The same goes for `align`, `pinned`, `aggregate` and `editor`.
2. **A misspelled field name.** `pinnd: 'left'` is simply ignored, and the column does not pin.
3. **A column `id` that no row has**, with no `accessor` to explain it — every cell reads
   `undefined` and renders blank, sorts as blank and filters as blank.
4. **`ref` where `shallowRef` belongs.** Correct, and 1.6–1.9× slower on every filter and sort.

The [`@type` annotation](#getting-the-types-back-without-writing-typescript) catches the first three
outright, which is most of why it is worth the ten minutes.

## Where to go next

Every page below applies unchanged — the code samples are TypeScript, but dropping `lang="ts"` and
the `type` imports is the whole translation. Each has a matching view in `pnpm demo` where the same
thing runs against real data.

<!-- docs:index:short start — generated by `pnpm docs:index`; edit docs/nav.ts -->
| Page | For |
| --- | --- |
| [Using it in another project](getting-started.md) | Installing it, the row type it insists on, the `DataTable` props and slots, and the three levels you can build a table at. |
| [The two contracts](contracts.md) | `QueryState` and `DataSource` — the two interfaces everything else is written against. |
| [Local, server and infinite data](data-sources.md) | `useLocalDataSource`, `useServerDataSource`, `useInfiniteDataSource`, and why swapping one for another changes nothing above. |
| [Excel-style filters](filtering.md) | The value checklist, condition rules, and facets. |
| [Sorting and pagination](sorting-and-pagination.md) | `usePagination`, `PageItem`, `SortOptions`, per-column comparators, and null-sorting. |
| [Selection](selection.md) | Shift-ranges, the tri-state header, and selecting more rows than are loaded. |
| [Grouping rows](grouping.md) | Bands, `groupMode`, aggregates and whole-table totals. |
| [Editing cells](editing.md) | A draft per row, cell and row mode, validation, and a save the server can refuse. |
| [Keyboard navigation](keyboard.md) | The cell cursor: arrow keys, Enter to edit, and the roving tabindex behind it. |
| [Column layout](column-layout.md) | Visibility, order, widths, pinning, persistence and drag-to-reorder. |
| [Header bands](column-groups.md) | Multi-row headers: banding columns under a shared header, nesting them, and folding a band shut. |
| [Styling](styling.md) | The `--vtc-*` variables, striping, and how cell backgrounds stack. |
| [Virtual rows](virtualization.md) | Windowing a fixed-height list, and the whole-result-set caveat over a server source. |
| [Composing your own](composing.md) | Building a different table from the same parts, and hoisting state into a URL or store. |
| [Performance](performance.md) | The `shallowRef` rule, the invalidation invariants, and the benchmark numbers behind them. |
| [Recipes](recipes.md) | Six worked recipes, from a bare table to retheming without touching a component. |
<!-- docs:index:short end -->

The full API — every export with what it is for — is the **API reference** tab of `pnpm demo`,
generated from the doc comments in `src/`, so it cannot fall behind the code.

Live: the **Everything at once** tab of `pnpm demo` (`#overview`). Back to the [docs index](/).
