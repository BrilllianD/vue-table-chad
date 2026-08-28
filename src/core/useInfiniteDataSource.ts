import {
  computed,
  onScopeDispose,
  ref,
  shallowRef,
  toValue,
  watch,
  type ComputedRef,
  type MaybeRefOrGetter,
} from 'vue'
import type { DataSource, FacetValue, FetchParams, FetchResult, QueryState } from './types'
import { cloneQuery, createFacetCache, shapeKey } from './remoteQuery'

/** How many rows one request asks for, when nothing says otherwise. */
export const INFINITE_PAGE_SIZE = 100

/** pageSize, debounceMs, immediate, fetchFacets and onError. */
export interface InfiniteDataSourceOptions {
  /**
   * Rows per request. **Not** `query.pageSize`, which this source ignores
   * entirely: virtual mode writes the whole dataset's length into it, and a
   * source that read it would ask the server for everything on the first
   * request. Defaults to `INFINITE_PAGE_SIZE`.
   */
  pageSize?: MaybeRefOrGetter<number | undefined>
  /** Delay applied to filter/search/sort changes. Defaults to 300ms. */
  debounceMs?: number
  /** Fetch the first page on creation. Default true. */
  immediate?: boolean
  /** Supplies the Excel checklist for a column. */
  fetchFacets?: (columnId: string, params: FetchParams) => Promise<FacetValue[]>
  onError?: (error: unknown) => void
}

/** A DataSource that grows, plus what a scroll handler needs to grow it. */
export interface InfiniteDataSource<TRow> extends DataSource<TRow> {
  /** True only for the first page, when there is nothing to show yet. */
  initialLoading: ComputedRef<boolean>
  /** True while a *further* page is on its way — the footer spinner, not the table one. */
  loadingMore: ComputedRef<boolean>
  /** Whether the server said there are rows beyond the ones loaded. */
  hasMore: ComputedRef<boolean>
  /** How many rows are loaded. `total` stays the server's count of all of them. */
  loaded: ComputedRef<number>
  /**
   * Ask for the next page.
   *
   * A no-op while a request is in flight, and a no-op once everything is
   * loaded — so a scroll handler can call it on every event without counting
   * anything or debouncing anything.
   */
  loadMore: () => void
}

/**
 * Server-backed rows that **accumulate** instead of being replaced: one
 * continuous list that grows as something asks for more of it.
 *
 * The same surface as the other two sources — `rows`, `total`, `loading`,
 * `error`, `facets` — so everything above it is unchanged. Two things are
 * different underneath, and both follow from "a page is not a window":
 *
 * - **It owns its paging.** `query.page` and `query.pageSize` are ignored,
 *   because virtual mode writes the dataset's length into the second one and
 *   the pager is not what advances this source. Each request asks for the page
 *   after the last one that arrived.
 * - **`rows` is every row loaded so far, and `total` is the server's count of
 *   the rows that match.** They differ, on purpose: `total` is what a header
 *   says and what `aria-rowcount` needs, and `loaded` is how far down the list
 *   the user can currently get.
 *
 * Everything else about the query behaves as it does for `useServerDataSource`:
 * a change of filters, search, sort or grouping is debounced, resets the list
 * to empty and asks for page 1 again, because those change which rows match and
 * therefore what "the next page" even means.
 *
 * ```ts
 * const source = useInfiniteDataSource(fetchPage, state.query, { pageSize: 100 })
 * // <DataTable virtual :source="source" @end-reached="source.loadMore" />
 * ```
 */
export function useInfiniteDataSource<TRow>(
  fetcher: (params: FetchParams) => Promise<FetchResult<TRow>>,
  query: MaybeRefOrGetter<QueryState>,
  options: InfiniteDataSourceOptions = {},
): InfiniteDataSource<TRow> {
  const debounceMs = options.debounceMs ?? 300
  const pageSize = computed(() => Math.max(1, toValue(options.pageSize) || INFINITE_PAGE_SIZE))

  const rows = shallowRef<TRow[]>([])
  const total = ref(0)
  const loading = ref(false)
  const error = shallowRef<unknown>(null)
  const hasLoaded = ref(false)
  /** The page a *further* request would ask for. 1 means nothing has arrived. */
  const nextPage = ref(1)

  let timer: ReturnType<typeof setTimeout> | undefined
  let controller: AbortController | undefined
  // The same monotonic guard the paging source uses, and for a sharper reason
  // here: an out-of-order response would not overwrite the list, it would
  // *append the wrong page to it*, which no later request can undo.
  let sequence = 0
  let settled = 0

  function cancelPending(): void {
    if (timer !== undefined) {
      clearTimeout(timer)
      timer = undefined
    }
    controller?.abort()
    controller = undefined
  }

  /**
   * One request. `append` is the whole difference between "more of this list"
   * and "a different list": a reset clears what is on screen, a load-more keeps
   * it and adds to the end.
   */
  async function run(page: number, append: boolean): Promise<void> {
    const snapshot = cloneQuery(toValue(query))
    // The page this source decided on, not the one in the query — see the note
    // on `pageSize` above.
    snapshot.page = page
    snapshot.pageSize = pageSize.value

    controller?.abort()
    const localController = new AbortController()
    controller = localController
    const id = ++sequence

    loading.value = true
    if (!append) {
      rows.value = []
      hasLoaded.value = false
    }

    try {
      const result = await fetcher({ query: snapshot, signal: localController.signal })
      if (id <= settled || localController.signal.aborted) return
      settled = id
      // A fresh array either way: `rows` is a `shallowRef`, so pushing into the
      // one it holds would change the list without telling anyone.
      rows.value = append ? [...rows.value, ...result.rows] : result.rows
      total.value = result.total
      nextPage.value = page + 1
      error.value = null
      hasLoaded.value = true
    } catch (caught) {
      if (localController.signal.aborted) return
      if (id <= settled) return
      settled = id
      error.value = caught
      options.onError?.(caught)
    } finally {
      if (id === sequence) {
        loading.value = false
        controller = undefined
      }
    }
  }

  /** Back to one page of the new shape, which is what a filter change means. */
  function reset(delay: number): void {
    if (timer !== undefined) clearTimeout(timer)
    nextPage.value = 1
    if (delay <= 0) {
      timer = undefined
      void run(1, false)
      return
    }
    timer = setTimeout(() => {
      timer = undefined
      void run(1, false)
    }, delay)
  }

  const hasMore = computed(() => !hasLoaded.value || rows.value.length < total.value)

  function loadMore(): void {
    // Both guards matter to a scroll handler, which will call this on every
    // event it gets: one request at a time, and none at all at the end of the
    // list. That is what lets the caller be a one-line `@end-reached`.
    if (loading.value || timer !== undefined) return
    if (!hasMore.value) return
    void run(nextPage.value, true)
  }

  let lastShape = shapeKey(toValue(query))

  watch(
    () => toValue(query),
    (next) => {
      const shape = shapeKey(next)
      if (shape === lastShape) return
      lastShape = shape
      // Paging is not watched at all: this source advances itself, and the page
      // number in the query belongs to a pager that is not driving it.
      reset(debounceMs)
    },
    { deep: true },
  )

  if (options.immediate ?? true) void run(1, false)

  const facetCache = createFacetCache(query, options.fetchFacets)

  onScopeDispose(() => {
    cancelPending()
    facetCache.abort()
  })

  return {
    rows,
    total,
    loading,
    error,
    refresh: () => {
      facetCache.clear()
      facetCache.abort()
      cancelPending()
      reset(0)
    },
    facets: facetCache.facets,
    initialLoading: computed(() => loading.value && !hasLoaded.value),
    loadingMore: computed(() => loading.value && hasLoaded.value),
    hasMore,
    loaded: computed(() => rows.value.length),
    loadMore,
    remote: true,
  }
}
