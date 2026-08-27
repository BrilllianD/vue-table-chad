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
import { cloneQuery, createFacetCache, pageKey, shapeKey } from './remoteQuery'

/** debounceMs, keepPreviousData, immediate, fetchFacets and onError. */
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

/** A DataSource plus initialLoading, true only before anything has arrived. */
export interface ServerDataSource<TRow> extends DataSource<TRow> {
  /** True only for the first load, when there is nothing to show yet. */
  initialLoading: ComputedRef<boolean>
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
      void run()
    },
    facets: facetCache.facets,
    initialLoading: computed(() => loading.value && !hasLoaded.value),
    remote: true,
  }
}
