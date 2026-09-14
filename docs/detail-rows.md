# Expandable detail rows

<script setup>
import Example from './.vitepress/examples/detail-rows.vue'
</script>

<Demo :is="Example" />

<<< @/.vitepress/examples/detail-rows.vue

A row opens to show what hangs off it: the child entities it owns, or its own fields laid out with
more room than a cell has. Two props and one slot:

```vue
<DataTable :columns="columns" :source="source" expandable>
  <template #detail="{ row, index, depth }">…</template>
</DataTable>
```

`expandable` adds the disclosure column and lets the table own which rows are open. The panel is
rendered by the `#detail` slot, which is handed the row it belongs to, that row's `index` in the
page, its `depth` when the table is grouped, and — when the children are fetched rather than read
off the row — the `detail` state and a `reload` for it.

## The panel is a row

It is a real `<tr>` after the row it describes, spanning every column — not a `<div>` tucked inside
the row above. That is a deliberate shape rather than an implementation detail:

- A `<tr>` cannot contain another `<tr>`, so nesting was never available.
- A body that renders a window instead of the whole list counts the rows it handed out against the
  rows that came back. A panel smuggled in beside its row breaks that count, and measurement
  switches off silently. As a line of its own it is windowed, measured and scrolled like anything
  else.

`data-expanded` lands on the open row and the panel itself is `.vt-detail-row`, with its single
cell `.vt-detail-cell` and the element inside it `.vt-detail-inner`. The disclosure button is
`.vt-detail-toggle` and its caret `.vt-detail-caret`.

## Driving it from outside

Hand the table an expansion of your own when something else needs to open or read the panels:

```ts
import { useRowExpansion } from '@brillliand/vue-table-chad'

const expansion = useRowExpansion<Employee>({
  getRowId: (row) => row.id,     // the default — `row.id`, as everywhere else
  initial: [42],                 // rows that arrive open
})
```

```vue
<DataTable :columns="columns" :source="source" :expansion="expansion">
```

It carries `expanded` (a writable `Ref<RowId[]>`, so the open set can be saved and restored),
`isExpanded(row)`, `toggle(row, next?)`, `expandAll(rows)`, `collapseAll()`, and — for the async
case below — `detailFor(row)` and `reload(row)`. `expandAll` takes
its rows as an argument rather than reading a dataset of its own — the composable holds no
reference to your data at all, which is what keeps opening a panel out of the filter, sort and
group passes entirely.

Ids, not row objects: a refetch hands back freshly allocated rows, and a panel the user opened has
to survive one. It survives a page turn for the same reason.

`DataTable` exposes whichever of the two it ended up with on its template ref:

```vue
<DataTable ref="table" … expandable />
```

```ts
table.value?.expansion?.collapseAll()
```

## Keyboard

With `cell-cursor` on, `Alt` + `↓` opens the cursor's row and `Alt` + `↑` shuts it. The direction
is explicit rather than a toggle, so a held key does not flap the panel. No other cursor gesture
uses `Alt`, which is why that pair is the one this spends.

The disclosure button is a real button, reachable by <kbd>Tab</kbd> and announcing its state
through `aria-expanded`. Its accessible name comes from the `expandRow` / `collapseRow`
[labels](./labels.md), so it translates with everything else.

## Children fetched when the row opens

The children usually are not in the row. `loadDetail` is where they come from:

```ts
const expansion = useRowExpansion<Employee, Assignment[]>({
  loadDetail: (row) => fetch(`/api/employees/${row.id}/assignments`).then((r) => r.json()),
})
```

```vue
<DataTable :columns="columns" :source="source" :expansion="expansion">
  <template #detail="{ row, detail, reload }">
    <p v-if="detail.status === 'loading'">Loading…</p>
    <p v-else-if="detail.status === 'error'">
      {{ detail.error.message }}
      <button @click="reload()">Retry</button>
    </p>
    <AssignmentsTable v-else :key="row.id" :rows="detail.data" :columns="assignmentColumns" />
  </template>
</DataTable>
```

`detail` is `{ status, data?, error? }` with `status` one of `idle`, `loading`, `ready` or
`error`. With no `loadDetail` at all it reads `ready` with no `data`, so a panel built from the row
itself takes the same branch and there is one code path rather than two.

What the rules are:

- **The fetch is on the expand transition, once per row id.** Shutting a panel keeps what arrived,
  so reopening one is instant, and an explicit `toggle(row, true)` on an already-open row is not a
  transition.
- **`reload(row)` asks again**, cache or no cache. That is the Retry button above, and it is also
  what to call when the children changed underneath an open panel.
- **An overtaken response is discarded.** Each request carries a token per row id, and one that is
  no longer the current token for its row never reaches the cache — so a slow first answer cannot
  land on top of the retry that replaced it.
- **`expandAll(rows)` fetches for each row it opens** that has nothing cached. Every panel it opens
  is on screen, so every one of them needs its children; opening thousands of rows is asking for
  thousands of requests.
- **None of it touches the table's own data.** The fetch is yours, the cache is a `Map` keyed by row
  id held in a `shallowRef` and replaced rather than mutated, so one row's arrival re-renders that
  panel and not the table. `tests/invalidation.spec.ts` asserts zero filter, sort, group and
  aggregate passes for both the expand that starts a load and the response that settles it.

## A subtable of child entities

The panel is ordinary markup, so a nested `DataTable` goes in it like anything else. It needs its
own `DataSource`, and a source is a composable — which a template cannot call — so the subtable is
always one small component:

```vue
<!-- AssignmentsTable.vue -->
<script setup lang="ts">
import { toRef } from 'vue'
import { DataTable, useLocalDataSource, useTableState, type ColumnDef } from '@brillliand/vue-table-chad'

const props = defineProps<{ rows: Assignment[]; columns: ColumnDef<Assignment>[] }>()
const state = useTableState({ pageSize: 5 })
const source = useLocalDataSource(toRef(props, 'rows'), props.columns, state.query)
</script>

<template>
  <DataTable :columns="props.columns" :source="source" :state="state" />
</template>
```

```vue
<DataTable :columns="columns" :source="source" expandable>
  <template #detail="{ row }">
    <AssignmentsTable :key="row.id" :rows="assignmentsFor(row)" :columns="assignmentColumns" />
  </template>
</DataTable>
```

The `:key` matters: without it the nested table is reused between panels and keeps the previous
row's sort and page.

## A plain panel

Nothing says the panel has to be a table, and often it should not be. The row's own fields, a form,
a chart — the slot's content is yours:

```vue
<template #detail="{ row }">
  <dl class="fields">
    <div><dt>Email</dt><dd>{{ row.email }}</dd></div>
    <div><dt>Location</dt><dd>{{ row.location.city }}, {{ row.location.country }}</dd></div>
  </dl>
</template>
```

## Under `virtual`

A windowed table needs `measure-rows` when panels can open:

```vue
<DataTable :columns="columns" :source="source" expandable virtual measure-rows />
```

Windowing assumes one row height until it is told otherwise, and a panel is taller than the rows
around it. Without measurement the space the window stands in is short by the difference, and the
rows below drift — a gap that grows as you scroll. The table warns about this combination in
development rather than letting you find it by scrolling.

## Building it by hand

Below `DataTable` the two pieces are separate, and both are exported. `withDetailRows` interleaves
the panels into a display list; `TableDetailRow` renders one:

```ts
import { withDetailRows } from '@brillliand/vue-table-chad'

const lines = computed(() =>
  withDetailRows(
    rows.value.map((row, index) => ({ kind: 'row' as const, row, index, depth: 0 })),
    expansion.isExpanded,
  ),
)
```

```vue
<TableDetailRow v-if="line.kind === 'detail'" :row="line.row" :columns="cols" :leading="1">
  <template #default="{ row }">…</template>
</TableDetailRow>
<TableRow v-else :row="line.row" :columns="cols" :index="line.index" :expanded="…" />
```

`withDetailRows` returns the array it was given, by reference, when nothing is open — so a table
nobody has expanded propagates nothing downstream. `TableDetailRow` owns its `<td>` and its
`colspan`, never the slot: a row one cell short of the `<colgroup>` above it drags every column
after it out of place, which is why the count includes the leading disclosure column
(`:leading="1"`) and the trailing actions column.

`detailToggleFor(event)` is the keyboard half — it returns `'expand'`, `'collapse'` or
`undefined` for a key event, so a hand-assembled table gets the same `Alt` + `↓`/`↑` without
reimplementing the decision.

---

Live: the **Detail rows** tab of `pnpm demo` (`#detail`). Back to the [docs index](/).
