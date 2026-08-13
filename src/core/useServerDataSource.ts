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

export interface ServerDataSourceOptions {
  /** Delay applied to filter/search/sort changes. Paging is never debounced. */
  debounceMs?: number
  /** Fetch once on creation. Default true. */
  immediate?: boolean
  /** Keep showing the previous page while the next one loads. Default true. */
  keepPreviousData?: boolean
  /** Supplies the Excel checklist for a column. */
  fetchFacets?: (columnId: string, params: FetchParams) => Promise<FacetValue[]>
  onError?: (error: unknown) => void
}

export interface ServerDataSource<TRow> extends DataSource<TRow> {
  /** True only for the first load, when there is nothing to show yet. */
  initialLoading: ComputedRef<boolean>
}

/**
 * Detaches the query from Vue's reactivity before it crosses into user code,
 * so a fetcher can hold the snapshot without seeing it mutate underneath.
 *
 * `structuredClone` cannot clone a reactive Proxy (`DataCloneError`), and
 * `QueryState` is JSON-safe by contract, so a JSON round-trip is both correct
 * and sufficient here.
 */
function cloneQuery(query: QueryState): QueryState {
  return JSON.parse(JSON.stringify(query)) as QueryState
}

/** Everything except paging — a change here has to reset to page 1 server-side. */
function shapeKey(query: QueryState): string {
  return JSON.stringify([query.sort, query.filters, query.globalSearch])
}

/**
 * What a facet list actually depends on. Sort is deliberately excluded: it
 * reorders rows without changing which ones match, so keying facets on it would
 * refetch an identical list every time a header is clicked.
 */
function facetShapeKey(query: QueryState): string {
  return JSON.stringify([query.filters, query.globalSearch])
}

function pageKey(query: QueryState): string {
  return JSON.stringify([query.page, query.pageSize])
}

/**
 * Server-backed rows. The component-facing surface is identical to
 * `useLocalDataSource`, so swapping one for the other changes nothing above.
 */
export function useServerDataSource<TRow>(
  fetcher: (params: FetchParams) => Promise<FetchResult<TRow>>,
  query: MaybeRefOrGetter<QueryState>,
  options: ServerDataSourceOptions = {},
): ServerDataSource<TRow> {
  const debounceMs = options.debounceMs ?? 300
  const keepPreviousData = options.keepPreviousData ?? true

  const rows = shallowRef<TRow[]>([])
  const total = ref(0)
  const loading = ref(false)
  const error = shallowRef<unknown>(null)
  const hasLoaded = ref(false)

  let timer: ReturnType<typeof setTimeout> | undefined
  let controller: AbortController | undefined
  // Monotonic counter guards against out-of-order responses: a slow request
  // fired before a fast one must never overwrite the fast one's result.
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

  async function run(): Promise<void> {
    const snapshot = cloneQuery(toValue(query))
    controller?.abort()
    const localController = new AbortController()
    controller = localController
    const id = ++sequence

    loading.value = true
    if (!keepPreviousData) rows.value = []

    try {
      const result = await fetcher({ query: snapshot, signal: localController.signal })
      if (id <= settled || localController.signal.aborted) return
      settled = id
      rows.value = result.rows
      total.value = result.total
      error.value = null
      hasLoaded.value = true
    } catch (caught) {
      if (localController.signal.aborted) return
      if (id <= settled) return
      settled = id
      error.value = caught
      options.onError?.(caught)
    } finally {
      // Only the newest request may clear the spinner; an aborted straggler
      // resolving late must not make a still-running fetch look finished.
      if (id === sequence) {
        loading.value = false
        controller = undefined
      }
    }
  }

  function schedule(delay: number): void {
    if (timer !== undefined) clearTimeout(timer)
    if (delay <= 0) {
      timer = undefined
      void run()
      return
    }
    timer = setTimeout(() => {
      timer = undefined
      void run()
    }, delay)
  }

  let lastShape = shapeKey(toValue(query))
  let lastPage = pageKey(toValue(query))

  watch(
    () => toValue(query),
    (next) => {
      const shape = shapeKey(next)
      const page = pageKey(next)
      const shapeChanged = shape !== lastShape
      const pageChanged = page !== lastPage
      lastShape = shape
      lastPage = page
      if (!shapeChanged && !pageChanged) return
      // Typing in a filter box should coalesce; clicking "next page" should not.
      schedule(shapeChanged ? debounceMs : 0)
    },
    { deep: true },
  )

  if (options.immediate ?? true) void run()

  onScopeDispose(() => {
    cancelPending()
    abortFacets()
  })

  const facetCache = new Map<string, Promise<FacetValue[]>>()
  const facetControllers = new Set<AbortController>()

  /**
   * Bounded so a long session filtering many columns cannot grow the cache
   * without limit. Insertion order makes the oldest entry the first out.
   */
  const FACET_CACHE_LIMIT = 32

  function cacheFacets(key: string, request: Promise<FacetValue[]>): void {
    facetCache.set(key, request)
    while (facetCache.size > FACET_CACHE_LIMIT) {
      const oldest = facetCache.keys().next()
      if (oldest.done) break
      facetCache.delete(oldest.value)
    }
  }

  function abortFacets(): void {
    for (const controller of facetControllers) controller.abort()
    facetControllers.clear()
  }

  async function facets(columnId: string): Promise<FacetValue[]> {
    if (!options.fetchFacets) return []
    const snapshot = cloneQuery(toValue(query))
    // The column's own filter is excluded so the checklist keeps offering the
    // values you just unchecked — same rule as the local source.
    const { [columnId]: _own, ...others } = snapshot.filters
    const scoped: QueryState = { ...snapshot, filters: others }
    const key = `${columnId}|${facetShapeKey(scoped)}`

    const cached = facetCache.get(key)
    if (cached) return cached

    // A real controller, retained so `refresh()` and scope disposal can cancel
    // a facet request in flight the same way they cancel a row fetch.
    const controller = new AbortController()
    facetControllers.add(controller)

    const request = options
      .fetchFacets(columnId, { query: scoped, signal: controller.signal })
      .then((result) => {
        facetControllers.delete(controller)
        return result
      })
      .catch((caught) => {
        facetControllers.delete(controller)
        facetCache.delete(key)
        throw caught
      })
    cacheFacets(key, request)
    return request
  }

  return {
    rows,
    total,
    loading,
    error,
    refresh: () => {
      facetCache.clear()
      abortFacets()
      cancelPending()
      void run()
    },
    facets,
    initialLoading: computed(() => loading.value && !hasLoaded.value),
    remote: true,
  }
}
