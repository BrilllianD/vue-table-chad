import { describe, expect, it, vi } from 'vitest'
import { effectScope } from 'vue'
import { useInfiniteDataSource } from '../src/core/useInfiniteDataSource'
import { useTableState } from '../src/core/useTableState'
import { valuesFilter } from '../src/core/filters/model'
import type { FacetValue, FetchParams } from '../src/core/types'

/**
 * The infinite source's column checklists.
 *
 * They come from `fetchFacets` without the column's own filter, are cached per
 * column and filter shape, dropped by `refresh()` and cancelled on disposal.
 */

const LIST: FacetValue[] = [{ value: 'Engineering', count: 3 }]

function setup(fetchFacets?: (columnId: string, params: FetchParams) => Promise<FacetValue[]>) {
  const scope = effectScope()
  const fetcher = vi.fn(async () => ({ rows: [], total: 0 }))
  const result = scope.run(() => {
    const state = useTableState({ pageSize: 10 })
    const source = useInfiniteDataSource<{ id: number }>(fetcher, state.query, {
      immediate: false,
      fetchFacets,
    })
    return { state, source }
  })!
  return { ...result, fetcher, dispose: () => scope.stop() }
}

describe('infinite source facets', () => {
  it("answers a column's checklist from fetchFacets, without its own filter", async () => {
    const fetchFacets = vi.fn(async () => LIST)
    const { state, source } = setup(fetchFacets)
    state.setFilter('department', valuesFilter(['Engineering']))
    state.setFilter('active', valuesFilter([true]))

    expect(await source.facets('department')).toEqual(LIST)
    expect(fetchFacets).toHaveBeenCalledTimes(1)
    const [columnId, params] = fetchFacets.mock.calls[0] as unknown as [string, FetchParams]
    expect(columnId).toBe('department')
    expect(params.query.filters.department).toBeUndefined()
    expect(params.query.filters.active).toBeDefined()
  })

  it('caches per column and filter shape, and refresh() drops the cache', async () => {
    const fetchFacets = vi.fn(async () => LIST)
    const { state, source } = setup(fetchFacets)

    await source.facets('department')
    await source.facets('department')
    expect(fetchFacets).toHaveBeenCalledTimes(1)

    await source.facets('role')
    expect(fetchFacets).toHaveBeenCalledTimes(2)

    state.setFilter('department', valuesFilter(['Engineering']))
    await source.facets('department')
    expect(fetchFacets).toHaveBeenCalledTimes(2)

    state.setFilter('active', valuesFilter([true]))
    await source.facets('department')
    expect(fetchFacets).toHaveBeenCalledTimes(3)

    source.refresh()
    await source.facets('department')
    expect(fetchFacets).toHaveBeenCalledTimes(4)
  })

  it('aborts a facet request in flight when the scope is disposed', () => {
    let signal: AbortSignal | undefined
    const fetchFacets = vi.fn((_columnId: string, params: FetchParams) => {
      signal = params.signal
      return new Promise<FacetValue[]>(() => {})
    })
    const { source, dispose } = setup(fetchFacets)

    void source.facets('department')
    expect(signal?.aborted).toBe(false)
    dispose()
    expect(signal?.aborted).toBe(true)
  })

  it('answers an empty list without fetchFacets', async () => {
    const { source } = setup()
    expect(await source.facets('department')).toEqual([])
  })
})
