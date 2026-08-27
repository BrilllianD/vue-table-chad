import { toValue, type MaybeRefOrGetter } from 'vue'
import type { FacetValue, FetchParams, QueryState } from './types'

/**
 * The parts of a remote source that are about the *query* rather than about
 * the rows: what a fetcher is handed, what counts as a different request, and
 * the facet cache in front of it.
 *
 * Extracted because there are two remote sources now — `useServerDataSource`
 * pages, `useInfiniteDataSource` appends — and everything here is identical
 * between them. The differences are all in what arrives; none of them are in
 * what is asked.
 */

/**
 * Detaches the query from Vue's reactivity before it crosses into user code,
 * so a fetcher can hold the snapshot without seeing it mutate underneath.
 *
 * `structuredClone` cannot clone a reactive Proxy (`DataCloneError`), and
 * `QueryState` is JSON-safe by contract, so a JSON round-trip is both correct
 * and sufficient here.
 */
export function cloneQuery(query: QueryState): QueryState {
  return JSON.parse(JSON.stringify(query)) as QueryState
}

/**
 * Everything except paging — a change here has to reset to page 1 server-side.
 * `groupBy` belongs in it because grouping is a sort: it decides which rows
 * land on which page, so changing it has to refetch.
 */
export function shapeKey(query: QueryState): string {
  return JSON.stringify([query.sort, query.filters, query.globalSearch, query.groupBy])
}

/**
 * What a facet list actually depends on. Sort is deliberately excluded: it
 * reorders rows without changing which ones match, so keying facets on it would
 * refetch an identical list every time a header is clicked.
 */
export function facetShapeKey(query: QueryState): string {
  return JSON.stringify([query.filters, query.globalSearch])
}

export function pageKey(query: QueryState): string {
  return JSON.stringify([query.page, query.pageSize])
}

/** A `DataSource.facets` implementation, plus the two ways to tear it down. */
export interface FacetCache {
  facets: (columnId: string) => Promise<FacetValue[]>
  /** Drops every cached list — what `refresh()` owes a caller. */
  clear: () => void
  /** Aborts every request in flight. */
  abort: () => void
}

/**
 * Bounded so a long session filtering many columns cannot grow the cache
 * without limit. Insertion order makes the oldest entry the first out.
 */
const FACET_CACHE_LIMIT = 32

/**
 * Caches a column's checklist against the filters it was computed under, and
 * keeps the requests cancellable.
 *
 * The column's own filter is excluded from the request, which is what makes the
 * checklist keep offering the values you just unchecked — the same rule the
 * local source follows.
 */
export function createFacetCache(
  query: MaybeRefOrGetter<QueryState>,
  fetchFacets?: (columnId: string, params: FetchParams) => Promise<FacetValue[]>,
): FacetCache {
  const cache = new Map<string, Promise<FacetValue[]>>()
  const controllers = new Set<AbortController>()

  function remember(key: string, request: Promise<FacetValue[]>): void {
    cache.set(key, request)
    while (cache.size > FACET_CACHE_LIMIT) {
      const oldest = cache.keys().next()
      if (oldest.done) break
      cache.delete(oldest.value)
    }
  }

  function abort(): void {
    for (const controller of controllers) controller.abort()
    controllers.clear()
  }

  async function facets(columnId: string): Promise<FacetValue[]> {
    if (!fetchFacets) return []
    const snapshot = cloneQuery(toValue(query))
    const { [columnId]: _own, ...others } = snapshot.filters
    const scoped: QueryState = { ...snapshot, filters: others }
    const key = `${columnId}|${facetShapeKey(scoped)}`

    const cached = cache.get(key)
    if (cached) return cached

    // A real controller, retained so `refresh()` and scope disposal can cancel
    // a facet request in flight the same way they cancel a row fetch.
    const controller = new AbortController()
    controllers.add(controller)

    const request = fetchFacets(columnId, { query: scoped, signal: controller.signal })
      .then((result) => {
        controllers.delete(controller)
        return result
      })
      .catch((caught) => {
        controllers.delete(controller)
        cache.delete(key)
        throw caught
      })
    remember(key, request)
    return request
  }

  return { facets, clear: () => cache.clear(), abort }
}
