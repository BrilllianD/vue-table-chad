# vue-table

Composable table building blocks for Vue 3 — sorting, Excel-style filters, pagination, row
selection, row grouping, column layout, multi-row header bands, inline editing and a keyboard cell
cursor, over **local arrays or server endpoints, interchangeably**.

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
pnpm test        # ~600 tests
pnpm typecheck
pnpm bench       # pipeline and interaction benchmarks
pnpm build       # library -> dist/
pnpm build:docs  # the demo, folded into one self-contained page
```

`pnpm dev` is four short examples. `pnpm demo` is the exhaustive one — 16 views, every export, one
view per feature area, each listing the API it uses. See [`demo/README.md`](demo/README.md).

Not on npm yet: `@brillliand/vue-table-chad` is the name the examples import from — an alias onto
`src/index.ts` until the first release. [`TODO.md`](TODO.md) tracks what publishing still needs.

## Quick start

```vue
<script setup lang="ts">
import { shallowRef } from 'vue'
import { DataTable, useLocalDataSource, useTableState, type ColumnDef } from '@brillliand/vue-table-chad'

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


## Docs

Each page is one topic, and each has a matching view in `pnpm demo` where the same thing runs.

| Page | What it covers | See it live |
| --- | --- | --- |
| [The two contracts](docs/contracts.md) | `QueryState` and `DataSource` — the two interfaces everything else is written against. | Core only |
| [Local and server data](docs/data-sources.md) | `useLocalDataSource`, `useServerDataSource`, and why swapping one for the other changes nothing above. | Server data |
| [Excel-style filters](docs/filtering.md) | The value checklist, condition rules, and facets. | Filters |
| [Selection](docs/selection.md) | Shift-ranges, the tri-state header, and selecting more rows than are loaded. | Selection |
| [Grouping rows](docs/grouping.md) | Bands, `groupMode`, aggregates and whole-table totals. | Grouping |
| [Composing your own](docs/composing.md) | Building a different table from the same parts, and hoisting state into a URL or store. | Composed |
| [Styling](docs/styling.md) | The `--vt-*` variables, striping, and how cell backgrounds stack. | Theming |
| [Column layout](docs/column-layout.md) | Visibility, order, widths, pinning, persistence and drag-to-reorder. | Column layout |
| [Header bands](docs/column-groups.md) | Multi-row headers: banding columns under a shared header, nesting them, and folding a band shut. | Header bands |
| [Keyboard navigation](docs/keyboard.md) | The cell cursor: arrow keys, Enter to edit, and the roving tabindex behind it. | Cell cursor |

Editable rows — `useRowEditing`, a draft per row, cell or row mode, validation, and a save the
server can refuse — have no page of their own yet. They run in the demo's **Editing** view, and
[Keyboard navigation](docs/keyboard.md) covers how the cursor drives them.

The full API — every export, with what it is for — is the **API reference** tab of `pnpm demo`.
It is generated from the doc comments in `src/`, so it cannot fall behind the code.

Also in the repo: [`demo/README.md`](demo/README.md) for how the demo is laid out,
[`bench/BASELINE.md`](bench/BASELINE.md) for the benchmark numbers and the optimizations that
turned out not to be worth it, [`TODO.md`](TODO.md) for where this stands and what is planned, and
[`CLAUDE.md`](CLAUDE.md) for the layer contracts and performance invariants.

## Not included

Row virtualization, tree rows (parent/child hierarchies, as opposed to the value-based grouping in
[Grouping rows](docs/grouping.md)), expandable detail rows, pinned rows, pivoting, and CSV or
clipboard export. Aggregation covers `sum`/`avg`/`min`/`max` and no custom reducer. There is no
i18n either: around 35 English strings are hardcoded across the components, `aria-label`s included.

The core is structured so virtualization slots in at the rendering layer without touching the
pipeline — `filteredRows` on the local source is the hook for it. [`TODO.md`](TODO.md) carries the
rest, and why each of these is a decision rather than an oversight.
