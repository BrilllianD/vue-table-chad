# Grouping rows

<script setup>
import Example from './.vitepress/examples/grouping.vue'
</script>

<Demo :is="Example" />

<<< @/.vitepress/examples/grouping.vue

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

## Who does the grouping — `groupMode`

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

## Aggregates

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

## Whole-table totals

```vue
<DataTable :columns="columns" :source="source" show-footer footer-label="All staff" />
```

Off by default — declaring an aggregate should not add a row nobody asked for. The `<tfoot>`
uses the same per-column declarations, works with grouping switched off, and sticks to the
bottom of the scroll box when you give it a height. The label yields its cell to a first column
that aggregates something of its own.

## Where the numbers come from

Same rule as the group counts, for the same reason:

- **`groupMode: 'client'`** — a band aggregates the rows loaded under it. What you see is what
  was added up.
- **`groupMode: 'server'`** — figures come from `DataSource.groupAggregates`, so a group split
  across a page boundary still totals its whole self. `useLocalDataSource` implements it; a
  server source that does not falls back to the loaded rows.

Pure functions underneath, usable with no component at all: `aggregateValue`, `aggregateRow`,
`aggregateGroups` (keyed like `RowGroup.key`, with the whole set under `ROOT_GROUP_KEY`), and
`formatAggregate`.

## Headless

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
`.vt-group-label`, `.vt-group-count`, plus `--vtc-group-bg` and `--vtc-group-indent-step`.

---

Live: the **Grouping** tab of `pnpm demo` (`#grouping`). Back to the [docs index](/).
