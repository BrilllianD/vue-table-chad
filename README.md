# vue-table-chad

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

Source, docs and the demo live at
[github.com/BrilllianD/vue-table-chad](https://github.com/BrilllianD/vue-table-chad). The
relative links below resolve there.

## Install

```bash
pnpm add @brillliand/vue-table-chad   # or npm install / yarn add
```

Vue **3.5+** is the one peer dependency; the library brings no runtime dependency of its own.
ESM only — there is no CJS build. TypeScript is optional but is most of the value: the column
definitions are where the types earn their keep.

Four entry points, and nothing is imported that you did not ask for:

| Import | What it is |
| --- | --- |
| `@brillliand/vue-table-chad` | Everything: `DataTable`, the primitives, the composables, the types. |
| `@brillliand/vue-table-chad/style.css` | The preset's stylesheet. Only `DataTable` needs it; the primitives ship no CSS. |
| `@brillliand/vue-table-chad/themes/<name>.css` | One of thirty opt-in palettes, switched on with `data-vtc-theme="<name>"`. See [Theme presets](docs/themes.md). |
| `@brillliand/vue-table-chad/locales` | `es`, `ja`, `ru`, `zhCN` — complete label records, one `app.use` for the whole app. See [Labels and i18n](docs/labels.md). |

[Using it in another project](docs/getting-started.md) covers the rest: the row type the
components insist on, the `DataTable` props and slots, and the three levels you can build a table
at. Not using TypeScript? [The same page without it](docs/getting-started-js.md).

## Quick start

Everything below is one file; paste it in as `App.vue` and it runs.

```vue
<script setup lang="ts">
import { shallowRef } from 'vue'
import { DataTable, useLocalDataSource, useTableState, type ColumnDef } from '@brillliand/vue-table-chad'
import '@brillliand/vue-table-chad/style.css'

type Person = { id: number; name: string; department: string; salary: number; hiredAt: string }

// Your rows. Anything with an `id` works; see "Hold rows in a shallowRef" below.
const rows = shallowRef<Person[]>([
  { id: 1, name: 'Ada Lovelace', department: 'Engineering', salary: 120_000, hiredAt: '2019-03-04' },
  { id: 2, name: 'Grace Hopper', department: 'Engineering', salary: 145_000, hiredAt: '2017-08-15' },
  { id: 3, name: 'Barbara Liskov', department: 'Research', salary: 150_000, hiredAt: '2021-01-11' },
])

const columns: ColumnDef<Person>[] = [
  { id: 'name', header: 'Name', type: 'text', pinned: 'left' },
  { id: 'department', header: 'Department', type: 'enum', options: ['Engineering', 'Research'] },
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

Each page is one topic, and each has a matching view in `pnpm demo` where the same thing runs. The
pages are also a VitePress site — `pnpm docs:dev` serves it locally, `pnpm docs:build` builds it.

<!-- docs:index:full start — generated by `pnpm docs:index`; edit docs/nav.ts -->
| Page | What it covers | See it live |
| --- | --- | --- |
| [Using it in another project](docs/getting-started.md) | Installing it, the row type it insists on, the `DataTable` props and slots, and the three levels you can build a table at. | Everything at once |
| […from plain JavaScript](docs/getting-started-js.md) | The same, without TypeScript: what a column accepts, the four mistakes the compiler would have caught, and how to get autocomplete back with JSDoc. | Everything at once |
| [The two contracts](docs/contracts.md) | `QueryState` and `DataSource` — the two interfaces everything else is written against. | Core only |
| [Local, server and infinite data](docs/data-sources.md) | `useLocalDataSource`, `useServerDataSource`, `useInfiniteDataSource`, and why swapping one for another changes nothing above. | Server data, Infinite scroll |
| [Excel-style filters](docs/filtering.md) | The value checklist, condition rules, and facets. | Filters |
| [Sorting and pagination](docs/sorting-and-pagination.md) | `usePagination`, `PageItem`, `SortOptions`, per-column comparators, and null-sorting. | Everything at once |
| [Selection](docs/selection.md) | Shift-ranges, the tri-state header, and selecting more rows than are loaded. | Selection |
| [Grouping rows](docs/grouping.md) | Bands, `groupMode`, aggregates and whole-table totals. | Grouping |
| [Expandable detail rows](docs/detail-rows.md) | A row opens to show the entities that hang off it — `expandable`, the `#detail` slot, `useRowExpansion`, and what `virtual` needs. | Detail rows |
| [The right-click menu](docs/context-menu.md) | Five actions on the cell under the pointer, `Shift`+`F10` from the keyboard, and the `#contextMenu` slot for items of your own. | Right-click menu |
| [Editing cells](docs/editing.md) | A draft per row, cell and row mode, validation, and a save the server can refuse. | Editing |
| [Keyboard navigation](docs/keyboard.md) | The cell cursor: arrow keys, Enter or any character to edit, copy and paste, and the roving tabindex behind it. | Cell cursor |
| [Column layout](docs/column-layout.md) | Visibility, order, widths, pinning, persistence and drag-to-reorder. | Column layout |
| [Header bands](docs/column-groups.md) | Multi-row headers: banding columns under a shared header, nesting them, and folding a band shut. | Header bands |
| [Styling](docs/styling.md) | The `--vtc-*` variables, striping, and how cell backgrounds stack. | Theming |
| [Theme presets](docs/themes.md) | Thirty named palettes as opt-in stylesheets, switched by one attribute — and why a palette is only nine colours. | Themes |
| [Labels and i18n](docs/labels.md) | The four shipped locales, one `app.use` for the whole app, overriding every string the table renders, and the spec that keeps new literals out. | Labels |
| [Virtual rows](docs/virtualization.md) | Windowing a fixed-height list, and the whole-result-set caveat over a server source. | Virtual rows |
| [Composing your own](docs/composing.md) | Building a different table from the same parts, and hoisting state into a URL or store. | Composed, Hoisted state |
| [Performance](docs/performance.md) | The `shallowRef` rule, the invalidation invariants, and the benchmark numbers behind them. | Performance |
| [Recipes](docs/recipes.md) | Six worked recipes, from a bare table to retheming without touching a component. | Recipes |
<!-- docs:index:full end -->

Also: [Porting an existing table](docs/examples/) — a real server-paginated Options API component
moved onto `useTableState` + `useServerDataSource`, keeping its own markup, mixins and widgets.

The full API — every export, with what it is for — is the **API reference** tab of the demo
(`pnpm demo` in a checkout). It is generated from the doc comments in `src/`, so it cannot fall
behind the code.

## Not included

Tree rows (parent/child hierarchies, as opposed to the value-based grouping in
[Grouping rows](docs/grouping.md)), pinned rows, and pivoting. Aggregation covers
`sum`/`avg`/`min`/`max` and no custom reducer. Cell-level clipboard copy and paste *is* in — see
[Keyboard navigation](docs/keyboard.md) — and so is CSV/TSV export of the whole result set, see
[Local, server and infinite data](docs/data-sources.md).

Row virtualization is in — see [Virtual rows](docs/virtualization.md). Rows are taken to be one
height unless `measure-rows` is on, which measures each rendered row at the cost of a layout per
update. It slotted in at the rendering layer as a page size of everything, so there is still
exactly one list for grouping, selection and the cursor to read. [`TASKS.md`](TASKS.md) carries
the rest, and why each of these is a decision rather than an oversight.

## Developing

Node **24** (`.nvmrc` is committed — run `nvm use`) and pnpm.

```bash
nvm use          # Node 24; pnpm crashes on Node 20 here
pnpm install
pnpm dev         # playground at http://localhost:5173
pnpm demo        # full feature demo at http://localhost:5174
pnpm test        # vitest
pnpm typecheck
pnpm lint
pnpm bench       # pipeline and interaction benchmarks
pnpm build       # library -> dist/
pnpm size        # bundle-size budget over dist/
pnpm docs:dev    # the VitePress docs site, locally
pnpm build:docs  # the demo, folded into one self-contained page
make pack        # build + size check + npm pack -> the installable tarball
```

`pnpm dev` is four short examples. `pnpm demo` is the exhaustive one — 23 views, every export, one
view per feature area, each listing the API it uses. See [`demo/README.md`](demo/README.md).
Inside this repo, `@brillliand/vue-table-chad` is an alias onto `src/index.ts`.

Also in the repo: [`bench/BASELINE.md`](bench/BASELINE.md) for the benchmark numbers and the
optimizations that turned out not to be worth it, [`TASKS.md`](TASKS.md) for what is planned and
what is deferred, [`CLAUDE.md`](CLAUDE.md) for the layer contracts and performance invariants, and
[`RELEASING.md`](RELEASING.md) for the release checklist.

## License

[MIT](LICENSE).
