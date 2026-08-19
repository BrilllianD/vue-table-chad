# The two contracts

Everything hangs off these. Learn them and the rest follows.

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

Plain JSON, always. That is why it drops straight into a URL, a Pinia store, or a request body.

## `DataSource` — where rows come from

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

---

Live: the **Core only** tab of `pnpm demo`. Back to the [docs index](../README.md#docs).
