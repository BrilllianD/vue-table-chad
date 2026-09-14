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
page, and its `depth` when the table is grouped.

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
`isExpanded(row)`, `toggle(row, next?)`, `expandAll(rows)` and `collapseAll()`. `expandAll` takes
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
