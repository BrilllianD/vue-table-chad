import { describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick } from 'vue'
import { useServerDataSource } from '../src/core/useServerDataSource'
import { useTableState } from '../src/core/useTableState'
import { usePagination } from '../src/core/usePagination'
import { valuesFilter } from '../src/core/filters/model'
import type { FetchParams, FetchResult } from '../src/core/types'

interface Row {
  id: number
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function setup(
  fetcher: (params: FetchParams) => Promise<FetchResult<Row>>,
  options = {},
) {
  const scope = effectScope()
  const result = scope.run(() => {
    const state = useTableState({ pageSize: 10 })
    const source = useServerDataSource<Row>(fetcher, state.query, { debounceMs: 50, ...options })
    return { state, source }
  })!
  return { ...result, dispose: () => scope.stop() }
}

describe('useServerDataSource', () => {
  it('fetches immediately and exposes rows and total', async () => {
    const fetcher = vi.fn(async () => ({ rows: [{ id: 1 }], total: 42 }))
    const { source, dispose } = setup(fetcher)

    expect(source.loading.value).toBe(true)
    expect(source.initialLoading.value).toBe(true)
    await vi.waitFor(() => expect(source.loading.value).toBe(false))

    expect(source.rows.value).toEqual([{ id: 1 }])
    expect(source.total.value).toBe(42)
    expect(source.initialLoading.value).toBe(false)
    expect(source.remote).toBe(true)
    dispose()
  })

  it('passes the query through to the fetcher', async () => {
    const fetcher = vi.fn(async (_params: FetchParams) => ({ rows: [] as Row[], total: 0 }))
    const { state, source, dispose } = setup(fetcher)
    await vi.waitFor(() => expect(source.loading.value).toBe(false))

    state.setFilter('department', valuesFilter(['Engineering']))
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2))

    const { query } = fetcher.mock.calls[1]![0]
    expect(query.filters.department).toEqual({
      kind: 'values',
      include: ['Engineering'],
      includeBlanks: false,
    })
    dispose()
  })

  it('does NOT let a slow earlier response overwrite a fast later one', async () => {
    const first = deferred<FetchResult<Row>>()
    const second = deferred<FetchResult<Row>>()
    const responses = [first, second]
    let call = 0
    const fetcher = vi.fn(() => responses[call++]!.promise)

    const { state, source, dispose } = setup(fetcher, { debounceMs: 0 })
    await nextTick()

    state.setPage(2)
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2))

    // The second request finishes first...
    second.resolve({ rows: [{ id: 2 }], total: 2 })
    await vi.waitFor(() => expect(source.rows.value).toEqual([{ id: 2 }]))

    // ...then the stale first one lands and must be ignored.
    first.resolve({ rows: [{ id: 1 }], total: 1 })
    await nextTick()
    await nextTick()

    expect(source.rows.value).toEqual([{ id: 2 }])
    expect(source.total.value).toBe(2)
    dispose()
  })

  it('aborts the in-flight request when a new one starts', async () => {
    const signals: AbortSignal[] = []
    const fetcher = vi.fn(({ signal }: FetchParams) => {
      signals.push(signal)
      return new Promise<FetchResult<Row>>(() => {})
    })

    const { state, dispose } = setup(fetcher, { debounceMs: 0 })
    await nextTick()
    state.setPage(2)
    await vi.waitFor(() => expect(signals).toHaveLength(2))

    expect(signals[0]!.aborted).toBe(true)
    expect(signals[1]!.aborted).toBe(false)
    dispose()
  })

  it('debounces filter changes but never debounces paging', async () => {
    const fetcher = vi.fn(async () => ({ rows: [], total: 0 }))
    const { state, dispose } = setup(fetcher, { debounceMs: 50 })
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1))

    state.setSearch('a')
    state.setSearch('ab')
    state.setSearch('abc')
    // All three keystrokes coalesce into one request.
    await new Promise((r) => setTimeout(r, 120))
    expect(fetcher).toHaveBeenCalledTimes(2)

    // Paging fires on the next tick, long before the 50ms debounce would elapse.
    state.setPage(2)
    await nextTick()
    expect(fetcher).toHaveBeenCalledTimes(3)
    dispose()
  })

  it('keeps the previous rows visible while loading by default', async () => {
    let resolveSecond!: (value: FetchResult<Row>) => void
    let call = 0
    const fetcher = vi.fn(() => {
      call += 1
      if (call === 1) return Promise.resolve({ rows: [{ id: 1 }], total: 1 })
      return new Promise<FetchResult<Row>>((resolve) => {
        resolveSecond = resolve
      })
    })

    const { state, source, dispose } = setup(fetcher, { debounceMs: 0 })
    await vi.waitFor(() => expect(source.rows.value).toEqual([{ id: 1 }]))

    state.setPage(2)
    await vi.waitFor(() => expect(source.loading.value).toBe(true))
    expect(source.rows.value).toEqual([{ id: 1 }])

    resolveSecond({ rows: [{ id: 2 }], total: 2 })
    await vi.waitFor(() => expect(source.rows.value).toEqual([{ id: 2 }]))
    dispose()
  })

  it('clears rows while loading when keepPreviousData is off', async () => {
    let call = 0
    const fetcher = vi.fn(() => {
      call += 1
      if (call === 1) return Promise.resolve({ rows: [{ id: 1 }], total: 1 })
      return new Promise<FetchResult<Row>>(() => {})
    })

    const { state, source, dispose } = setup(fetcher, { debounceMs: 0, keepPreviousData: false })
    await vi.waitFor(() => expect(source.rows.value).toEqual([{ id: 1 }]))

    state.setPage(2)
    await vi.waitFor(() => expect(source.rows.value).toEqual([]))
    dispose()
  })

  it('captures a fetch error without wedging loading on', async () => {
    const onError = vi.fn()
    const fetcher = vi.fn(async () => {
      throw new Error('boom')
    })
    const { source, dispose } = setup(fetcher, { onError })

    await vi.waitFor(() => expect(source.loading.value).toBe(false))
    expect((source.error.value as Error).message).toBe('boom')
    expect(onError).toHaveBeenCalledOnce()
    dispose()
  })

  it('refresh() refetches the same query', async () => {
    const fetcher = vi.fn(async () => ({ rows: [], total: 0 }))
    const { source, dispose } = setup(fetcher)
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1))

    source.refresh()
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2))
    dispose()
  })

  it('skips the initial fetch when immediate is false', async () => {
    const fetcher = vi.fn(async () => ({ rows: [], total: 0 }))
    const { dispose } = setup(fetcher, { immediate: false })
    await new Promise((r) => setTimeout(r, 20))
    expect(fetcher).not.toHaveBeenCalled()
    dispose()
  })

  it('aborts the in-flight request when the scope is disposed', async () => {
    const signals: AbortSignal[] = []
    const fetcher = vi.fn(({ signal }: FetchParams) => {
      signals.push(signal)
      return new Promise<FetchResult<Row>>(() => {})
    })
    const { dispose } = setup(fetcher)
    await vi.waitFor(() => expect(signals).toHaveLength(1))

    dispose()
    expect(signals[0]!.aborted).toBe(true)
  })

  it('excludes the column\'s own filter when fetching its facets', async () => {
    const fetchFacets = vi.fn(async (_columnId: string, _params: FetchParams) => [
      { value: 'Engineering', count: 3 },
    ])
    const fetcher = vi.fn(async () => ({ rows: [], total: 0 }))
    const { state, source, dispose } = setup(fetcher, { fetchFacets })

    state.setFilter('department', valuesFilter(['Engineering']))
    state.setFilter('active', valuesFilter([true]))
    await source.facets('department')

    const [columnId, params] = fetchFacets.mock.calls[0]!
    expect(columnId).toBe('department')
    // Own filter dropped, every other filter kept.
    expect(params.query.filters.department).toBeUndefined()
    expect(params.query.filters.active).toBeDefined()
    dispose()
  })

  it('caches facet requests per column and filter shape', async () => {
    const fetchFacets = vi.fn(async () => [{ value: 'Engineering', count: 3 }])
    const fetcher = vi.fn(async () => ({ rows: [], total: 0 }))
    const { source, dispose } = setup(fetcher, { fetchFacets })

    await source.facets('department')
    await source.facets('department')
    expect(fetchFacets).toHaveBeenCalledTimes(1)

    source.refresh()
    await source.facets('department')
    expect(fetchFacets).toHaveBeenCalledTimes(2)
    dispose()
  })

  it('returns no facets when the caller supplied no facet fetcher', async () => {
    const fetcher = vi.fn(async () => ({ rows: [], total: 0 }))
    const { source, dispose } = setup(fetcher)
    expect(await source.facets('department')).toEqual([])
    dispose()
  })
})

describe('usePagination', () => {
  it('computes page count, row range and boundaries', () => {
    const scope = effectScope()
    const page = { value: 2 }
    const pagination = scope.run(() => usePagination(() => page.value, 10, 95))!

    expect(pagination.pageCount.value).toBe(10)
    expect(pagination.firstRow.value).toBe(11)
    expect(pagination.lastRow.value).toBe(20)
    expect(pagination.canPrev.value).toBe(true)
    expect(pagination.canNext.value).toBe(true)
    scope.stop()
  })

  it('clamps a page index beyond the end', () => {
    const scope = effectScope()
    const pagination = scope.run(() => usePagination(99, 10, 25))!
    expect(pagination.page.value).toBe(3)
    expect(pagination.canNext.value).toBe(false)
    scope.stop()
  })

  it('handles an empty result set', () => {
    const scope = effectScope()
    const pagination = scope.run(() => usePagination(1, 10, 0))!
    expect(pagination.pageCount.value).toBe(1)
    expect(pagination.firstRow.value).toBe(0)
    expect(pagination.lastRow.value).toBe(0)
    scope.stop()
  })

  it('builds page items with ellipses only when needed', () => {
    const scope = effectScope()
    const short = scope.run(() => usePagination(1, 10, 50))!
    expect(short.items.value).toEqual([1, 2, 3, 4, 5])

    const middle = scope.run(() => usePagination(10, 10, 200))!
    expect(middle.items.value).toEqual([1, 'ellipsis', 9, 10, 11, 'ellipsis', 20])

    const start = scope.run(() => usePagination(1, 10, 200))!
    expect(start.items.value).toEqual([1, 2, 3, 4, 5, 'ellipsis', 20])

    const end = scope.run(() => usePagination(20, 10, 200))!
    expect(end.items.value).toEqual([1, 'ellipsis', 16, 17, 18, 19, 20])
    scope.stop()
  })

  it('emits onChange only for real moves', () => {
    const scope = effectScope()
    const onChange = vi.fn()
    const pagination = scope.run(() => usePagination(1, 10, 100, { onChange }))!

    pagination.next()
    expect(onChange).toHaveBeenCalledWith(2)

    pagination.prev()
    expect(onChange).toHaveBeenCalledTimes(1) // already on page 1, no move

    pagination.last()
    expect(onChange).toHaveBeenLastCalledWith(10)
    scope.stop()
  })
})
