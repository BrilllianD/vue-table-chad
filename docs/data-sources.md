# Local, server and infinite data

<script setup>
import Example from './.vitepress/examples/data-sources.vue'
import InfiniteExample from './.vitepress/examples/infinite.vue'
</script>

<Demo :is="Example" />

<<< @/.vitepress/examples/data-sources.vue

## Local data

```ts
const source = useLocalDataSource(rows, columns, state.query, { debounceMs: 150 })
```

The pipeline is filter → sort → slice, each stage its own computed, so paging redoes neither of
the first two and changing the sort does not redo the filter.

`debounceMs` (default `150`) coalesces the **global search only**. Every keystroke otherwise
re-filters and re-sorts the whole dataset synchronously on the input event — around 22ms of
blocked main thread per character at 10k rows. A filter checkbox or a header click is one
deliberate act and always lands at once; a delay there reads as a broken table rather than a
smooth one. Clearing the box is instant too, since emptying it can only ever widen the result.

`QueryState` is unaffected: it records every keystroke as it happens, so a URL or a store mirroring
the query stays truthful while only the filtering lags. Pass `0` to switch the debounce off
entirely — the right choice for small datasets and for tests that assert on the next line.

## Server data

```ts
const source = useServerDataSource(
  ({ query, signal }) =>
    fetch(`/api/people?${new URLSearchParams({ q: JSON.stringify(query) })}`, { signal })
      .then((r) => r.json()),          // -> { rows, total }
  state.query,
  {
    debounceMs: 300,
    fetchFacets: (columnId, { query, signal }) =>
      fetch(`/api/people/facets?column=${columnId}&q=${encodeURIComponent(JSON.stringify(query))}`,
        { signal }).then((r) => r.json()),
  },
)
```

What it handles for you:

- **Debouncing** filter/search/sort changes, but **never** paging — clicking "next page" is instant.
- **Race conditions** — a slow earlier response can never overwrite a fast later one (monotonic
  request ids + `AbortController`). There is an explicit test for this.
- **`keepPreviousData`** so the table does not blank out between pages.
- **Facet scoping** — the column's own filter is stripped before the facet request, so its checklist
  keeps offering the values you just unchecked.

## Infinite data

```ts
// `fetchPage` has the same signature as a server source's fetcher: `({ query, signal })`
// to `{ rows, total }`, with `query.page` and `query.pageSize` saying which portion.
const source = useInfiniteDataSource(fetchPage, state.query, { pageSize: 100 })
```

```vue
<DataTable virtual :source="source" :end-threshold="10" @end-reached="source.loadMore" />
```

The same fetcher and the same surface as the server source. One thing is different, and everything
else follows from it: a page **adds to** the list rather than replacing it.

- **It owns its paging.** `query.page` and `query.pageSize` are ignored — `virtual` writes the
  dataset's length into the second one, and a source that read it would ask the server for
  everything at once. `pageSize` is an option of its own, defaulting to `INFINITE_PAGE_SIZE`.
- **`rows` and `total` are different numbers.** `rows` is what has been loaded, `total` is what the
  server says matches; `loaded` and `hasMore` are the two derived from them. That is what makes the
  scrollbar grow as you go: it describes the list you have.
- **`loadMore` refuses to be asked twice.** It is a no-op while a request is in flight and a no-op
  at the end of the list, which is what lets `@end-reached` be wired straight to it and fire as
  often as the window moves.
- **A filter, a search or a sort starts the list again**, debounced. What "the next page" means
  changed with them.
- `initialLoading` is the first page and `loadingMore` is every page after it — one blanks the
  table, the other should not.

`end-threshold` is how early the window asks, in rows. `0` waits until the last row is rendered;
raise it and the request goes out while there are still rows to scroll through, which is what hides
the latency of a slow server.

Scroll it. There is no pager, the counter climbs as pages arrive, and the scrollbar lengthens with
the list you actually have:

<Demo :is="InfiniteExample" />

<<< @/.vitepress/examples/infinite.vue

---

Live: the **Server data** tab of `pnpm demo` (`#server`), and **Infinite scroll** (`#infinite`). Back to the [docs index](/).
