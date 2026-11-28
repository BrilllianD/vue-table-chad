import { describe, expect, it, vi } from 'vitest'
import { createFacetCache } from '../src/core/remoteQuery'
import { createQueryState } from '../src/core/useTableState'

/**
 * The facet cache is bounded, oldest entry first out, and never keeps a
 * failed request.
 *
 * Without the bound a long session filtering many columns grows the cache
 * without limit; without the eviction order the wrong list is refetched.
 */

// Mirrors `FACET_CACHE_LIMIT` in `src/core/remoteQuery.ts`, which is not
// exported. Change both together.
const LIMIT = 32

describe('the facet cache bound', () => {
  it('keeps the newest 32 lists and refetches the oldest after the 33rd', async () => {
    const fetchFacets = vi.fn(async (columnId: string) => [{ value: columnId, count: 1 }])
    const cache = createFacetCache(createQueryState(), fetchFacets)

    for (let i = 0; i < LIMIT; i++) await cache.facets(`c${i}`)
    expect(fetchFacets).toHaveBeenCalledTimes(LIMIT)

    // Still cached: the limit is not lower than 32.
    await cache.facets('c0')
    expect(fetchFacets).toHaveBeenCalledTimes(LIMIT)

    // The 33rd entry evicts the oldest, c0.
    await cache.facets(`c${LIMIT}`)
    expect(fetchFacets).toHaveBeenCalledTimes(LIMIT + 1)

    // Only the oldest went.
    await cache.facets('c1')
    await cache.facets(`c${LIMIT}`)
    expect(fetchFacets).toHaveBeenCalledTimes(LIMIT + 1)

    await cache.facets('c0')
    expect(fetchFacets).toHaveBeenCalledTimes(LIMIT + 2)
  })

  it('does not cache a rejected request', async () => {
    const fetchFacets = vi
      .fn<(columnId: string) => Promise<{ value: string; count: number }[]>>()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValue([{ value: 'a', count: 1 }])
    const cache = createFacetCache(createQueryState(), fetchFacets)

    await expect(cache.facets('c0')).rejects.toThrow('boom')
    expect(await cache.facets('c0')).toEqual([{ value: 'a', count: 1 }])
    expect(fetchFacets).toHaveBeenCalledTimes(2)
  })
})
