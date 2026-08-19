# Local and server data

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

---

Live: the **Server data** tab of `pnpm demo`. Back to the [docs index](../README.md#docs).
