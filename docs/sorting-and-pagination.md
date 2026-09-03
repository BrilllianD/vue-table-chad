# Sorting and pagination

<script setup>
import Example from './.vitepress/examples/sorting-and-pagination.vue'
</script>

<Demo :is="Example" />

<<< @/.vitepress/examples/sorting-and-pagination.vue

Both are page arithmetic and comparator plumbing — no rows, and no component required to use
either.

## Sorting

`QueryState.sort` is `SortRule[]`, ordered — a table sorted by department then salary carries both
rules, and the first one wins ties:

```ts
interface SortRule {
  columnId: string
  direction: 'asc' | 'desc'
}
```

`useTableState` owns it through three calls:

```ts
state.toggleSort('salary')          // asc -> desc -> off, replacing whatever else was sorted
state.toggleSort('salary', true)    // same cycle, but appended — multi-sort
state.setSort('salary', 'desc')     // set a direction directly, no cycling
```

`SortTrigger` calls `toggleSort`, additive on shift-click — that is the entire mechanism behind
clicking a header and shift-clicking a second one. The whole `<th>` is the target, not only the
trigger inside it: a left click anywhere in the cell sorts, and shift, ctrl or cmd makes it
additive there too. Clicks that came from a control the cell contains — the sort button itself, the
filter popover, the resize handle — belong to that control alone, so nothing fires twice. The one
exception is a column the rows are currently grouped by: its header carries no sort trigger at all
and folds that grouping level instead. See [Grouping](./grouping.md).

**Column type decides the comparator**, and `comparator` overrides it. `role` in `employeeColumns`
is the reason the override exists: `SENIORITY` — `['Junior', 'Mid', 'Senior', 'Staff', 'Principal',
'Manager']` — is not alphabetical, so the default text comparator would put `'Junior'` ahead of
`'Senior'`. The column supplies its own:

```ts
{
  id: 'role',
  type: 'enum',
  options: SENIORITY,
  comparator: (a, b) => SENIORITY.indexOf(String(a)) - SENIORITY.indexOf(String(b)),
}
```

A `comparator` takes over sorting entirely for that column; the `type` still decides the filter
operators and the editor.

**Blanks sink to the bottom, in both directions.** `sortRows`'s `SortOptions.nullsLast` defaults to
`true`, and it is applied outside the direction flip on purpose: flipping blanks to the top on
`desc` is the behaviour every reader reports as a bug, because "descending" reads as "biggest
first," not "least-null first." Pass `nullsLast: false` to `sortRows` directly if a page genuinely
wants the opposite; `useTableState` does not expose the flag, because no view in this repo has
needed to override it.

`sortRows` derives each row's sort key once, not inside the comparator — comparisons run
`O(n log n)` times, and a column's cells number `n`. See CLAUDE.md, "Derive per row, not per
comparison."

## Pagination

`usePagination` is pure page arithmetic over three numbers, with no rows in it at all:

```ts
function usePagination(
  page: MaybeRefOrGetter<number>,
  pageSize: MaybeRefOrGetter<number>,
  total: MaybeRefOrGetter<number>,
  options?: { siblingCount?: MaybeRefOrGetter<number>; onChange?: (page: number) => void },
): UsePagination
```

It hands back `page`, `pageCount`, `firstRow`, `lastRow`, `canPrev`, `canNext`, the navigation calls
(`go`, `prev`, `next`, `first`, `last`), and `items: PageItem[]` — page numbers with `'ellipsis'`
gaps already computed, ready to render as buttons:

```ts
type PageItem = number | 'ellipsis'
```

`TablePagination` is this composable wearing a toolbar: page-size select, prev/next, the numbered
buttons `items` describes, and a "X–Y of Z" summary. Every input is also a prop, so it works as a
standalone pager for any list, table or not:

```vue
<TablePagination :page="page" :page-size="20" :total="count" @update:page="page = $event" />
```

**Paging redoes nothing.** Changing `page` or `pageSize` never re-runs the filter or sort pass — see
CLAUDE.md, "Paging redoes nothing" — because those stages depend on the query's `filters` and `sort`
fields, not on the whole `QueryState` object. `tests/invalidation.spec.ts` holds the pipeline to it.

Live: the **Everything at once** tab of `pnpm demo` (`#overview`). Back to the [docs index](/).
