# The two contracts

<script setup>
import Example from './.vitepress/examples/contracts.vue'
</script>

<Demo :is="Example" />

<<< @/.vitepress/examples/contracts.vue

Everything hangs off these two interfaces. `QueryState` says **what to show**; `DataSource` says
**where rows come from**. Every composable, every primitive and the whole preset is written against
them and against nothing else — which is what makes local data, a REST endpoint and an
infinite-scroll feed interchangeable, and what lets the example above run the same pipeline with no
component in sight.

## `QueryState` — what to show

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

Field by field:

- **`sort`** is an array because the order *is* the priority: `[{ department, asc }, { salary, desc }]`
  sorts by department, then by salary within it. Unsorted is the absence of a rule, not a third
  direction.
- **`filters`** is keyed by column id, holding either shape from
  [Excel-style filters](./filtering.md). No-op entries are pruned on the way in, so a filter that
  matches everything never appears here.
- **`groupBy`** is populated **only** under `groupMode: 'server'`. Delegated grouping changes which
  rows come back in which order, so a server must honour it as it honours `sort`. Client-side
  grouping rearranges rows that are already loaded, is none of the source's business, and leaves this
  empty so nothing refetches.
- **`page`** is 1-based, and every mutator that changes what matches resets it to 1.
- **`globalSearch`** records every keystroke as it happens, even while the source debounces the
  actual filtering. The query is the truthful record of what was asked for; the lag lives downstream.

**It is plain JSON, always.** `FilterValue` is `string | number | boolean | null` and dates live as
`YYYY-MM-DD` strings, so nothing in here needs a revival step. That is what lets it drop straight
into a URL, a Pinia store or a request body:

```ts
const external = ref<QueryState>(createQueryState({ pageSize: 25 }))
const state = useTableState({ state: external })
```

`createQueryState(options)` builds one with the defaults filled in — useful for seeding a store or a
URL before a table exists to own it. `useTableState` is what owns it at runtime; hand it a writable
`state` ref and that ref becomes the single source of truth, mirrored in both directions and
synchronously, so reading `external.value` straight after `state.setPage(3)` gives page 3. See
[Composing your own](./composing.md) for the whole hoisting story.

## `DataSource` — where rows come from

```ts
interface DataSource<TRow> {
  rows: Readonly<Ref<TRow[]>>       // current page only
  total: Readonly<Ref<number>>      // total after filtering, across all pages
  loading: Readonly<Ref<boolean>>
  error: Readonly<Ref<unknown>>
  refresh(): void
  facets(columnId: string): Promise<FacetValue[]>
  groupCounts?(groupBy: string[]): Map<string, number>
  groupAggregates?(groupBy: string[]): Map<string, Record<string, AggregateResult<TRow>>>
  readonly remote: boolean
}
```

The four refs are typed `Readonly<Ref<T>> | ComputedRef<T>`, elided above for width — a `computed`
satisfies them, which is what the hand-rolled source below relies on.

The obligations that go beyond the types:

- **`rows` is the current page**, already filtered, sorted and sliced. Not the dataset — the table
  renders what it is handed and never slices again.
- **`total` is the count after filtering**, across every page. It drives the pager, the "N of M"
  copy and the "select all N matching" escalation, so a source that returns `rows.length` here breaks
  all three.
- **`facets` must apply every *other* column's filter but not the column's own.** That is what makes
  the Excel checklist narrow as you filter elsewhere while still offering the value you just
  unchecked. It returns a promise even when the answer is synchronous, so the panel is written once.
- **`groupCounts` and `groupAggregates` are optional on purpose.** Only a source holding every row
  can answer them. Keys are `RowGroup.key` — `groupPathKey`, over the values of every level down to
  that group — plus, for aggregates, the whole-set total under `ROOT_GROUP_KEY` (the empty string).
  Left unimplemented, a group header degrades to the count of the rows it was handed, which is right
  for a page and understated for a group split across two.
- **`remote`** is not decoration: the filter panel uses it to say facets come from the server.

`useLocalDataSource`, `useServerDataSource` and `useInfiniteDataSource` all satisfy this, so swapping
one for another changes nothing above them. The local one widens it — `filteredRows`, a synchronous
`facetsSync`, and both group methods non-optional, because it holds every row. See
[Local, server and infinite data](./data-sources.md) for what each adds.

## Writing your own source

There is nothing privileged about the three built-ins. Anything satisfying the interface works —
here is one over a store that already holds its own rows and does its own querying:

```ts
import { computed, ref } from 'vue'
import { computeFacets, type DataSource, type QueryState } from '@brillliand/vue-table-chad'

function useStoreDataSource(store: PeopleStore, query: Ref<QueryState>): DataSource<Person> {
  // Depend on the fields, never on the query object — see below.
  const page = computed(() => query.value.page)
  const pageSize = computed(() => query.value.pageSize)

  const matching = computed(() => store.search(query.value.filters, query.value.globalSearch))
  const sorted = computed(() => store.sort(matching.value, query.value.sort))

  return {
    rows: computed(() => sorted.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value)),
    total: computed(() => matching.value.length),
    loading: computed(() => store.pending),
    error: computed(() => store.error),
    refresh: () => store.reload(),
    // The column's own filter is skipped — that is the contract, not an optimisation.
    facets: async (columnId) =>
      computeFacets(store.all, store.columns, store.columnFor(columnId), query.value),
    remote: false,
  }
}
```

For a fetching source, `FetchParams` and `FetchResult` are the two halves of the fetcher
`useServerDataSource` and `useInfiniteDataSource` take, and are worth reusing even in a hand-rolled
one: `{ query, signal }` in, `{ rows, total }` out. The `signal` is the part that matters — without
it a slow earlier response can overwrite a fast later one.

## The rule that makes it fast

Note the `computed`s in that example, one per field. This is the load-bearing habit of the whole
library, and it is not stylistic.

`useTableState` mints a **fresh query object on every write**, page changes included. A stage that
reads the whole object therefore re-runs whenever anything at all moves — so a page turn would redo
the filter and the sort over the entire dataset. Narrow computeds recompute just as often, but a
computed returning the same reference does not propagate, so the page change stops there.

`tests/invalidation.spec.ts` wraps the five dataset-wide functions and asserts exactly this: paging
redoes nothing, collapsing a group re-scans nothing, column layout and selection never reach the
pipeline at all. A failure there is a broken feature, not a slow one — see
[Performance](./performance.md).

---

Live: the **Core only** tab of `pnpm demo` (`#core`). Back to the [docs index](/).
