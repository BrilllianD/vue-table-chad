import { describe, expect, it, vi } from 'vitest'
import { effectScope } from 'vue'
import { useInfiniteDataSource } from '../src/core/useInfiniteDataSource'
import { useTableState } from '../src/core/useTableState'
import { valuesFilter } from '../src/core/filters/model'
import type { FetchParams, FetchResult } from '../src/core/types'

/**
 * A source that grows.
 *
 * Everything here is about the one difference from `useServerDataSource`: a
 * page replaces the list, and a *further* page is added to the end of it. The
 * two failure modes that follow are appending the wrong page and appending the
 * same one twice, and both are what the guards below exist for.
 */

interface Row {
  id: number
}

const TOTAL = 250

/** A server holding `TOTAL` rows, answering whatever page it is asked for. */
function pagedServer() {
  const calls: { page: number; pageSize: number }[] = []
  const fetcher = async ({ query }: FetchParams): Promise<FetchResult<Row>> => {
    calls.push({ page: query.page, pageSize: query.pageSize })
    const from = (query.page - 1) * query.pageSize
    const rows = Array.from(
      { length: Math.max(0, Math.min(query.pageSize, TOTAL - from)) },
      (_, index) => ({ id: from + index }),
    )
    return { rows, total: TOTAL }
  }
  return { fetcher, calls }
}

function setup(
  fetcher: (params: FetchParams) => Promise<FetchResult<Row>>,
  options: Record<string, unknown> = {},
) {
  const scope = effectScope()
  const result = scope.run(() => {
    // A page size of 10 in the *state*, which this source must ignore: virtual
    // mode writes the dataset's length into it, and reading it would ask the
    // server for everything at once.
    const state = useTableState({ pageSize: 10 })
    const source = useInfiniteDataSource<Row>(fetcher, state.query, {
      debounceMs: 20,
      pageSize: 100,
      ...options,
    })
    return { state, source }
  })!
  return { ...result, dispose: () => scope.stop() }
}

describe('useInfiniteDataSource', () => {
  it('loads the first page immediately, and asks for its own page size', async () => {
    const { fetcher, calls } = pagedServer()
    const { source, dispose } = setup(fetcher)

    expect(source.initialLoading.value).toBe(true)
    await vi.waitFor(() => expect(source.loading.value).toBe(false))

    expect(source.rows.value).toHaveLength(100)
    expect(source.total.value).toBe(TOTAL)
    expect(source.loaded.value).toBe(100)
    // The option, not `query.pageSize` — which is 10 here and would be the
    // whole dataset under `virtual`.
    expect(calls[0]).toEqual({ page: 1, pageSize: 100 })
    dispose()
  })

  it('appends the next page rather than replacing the list', async () => {
    const { fetcher, calls } = pagedServer()
    const { source, dispose } = setup(fetcher)
    await vi.waitFor(() => expect(source.loading.value).toBe(false))

    source.loadMore()
    // A further page is not the initial load: the table stays on screen, and
    // only the footer spinner is running.
    expect(source.loadingMore.value).toBe(true)
    expect(source.initialLoading.value).toBe(false)
    expect(source.rows.value).toHaveLength(100)

    await vi.waitFor(() => expect(source.loading.value).toBe(false))
    expect(source.rows.value).toHaveLength(200)
    expect(source.rows.value[150]).toEqual({ id: 150 })
    expect(calls[1]).toEqual({ page: 2, pageSize: 100 })
    dispose()
  })

  it('runs one request at a time, however often a scroll handler asks', async () => {
    const { fetcher, calls } = pagedServer()
    const { source, dispose } = setup(fetcher)
    await vi.waitFor(() => expect(source.loading.value).toBe(false))

    // What a scroll handler does: call on every event and let the source
    // decide. Anything else would append page 2 three times over.
    source.loadMore()
    source.loadMore()
    source.loadMore()
    await vi.waitFor(() => expect(source.loading.value).toBe(false))

    expect(calls).toHaveLength(2)
    expect(source.rows.value).toHaveLength(200)
    dispose()
  })

  it('stops at the end of the list, and says so', async () => {
    const { fetcher, calls } = pagedServer()
    const { source, dispose } = setup(fetcher)
    await vi.waitFor(() => expect(source.loading.value).toBe(false))
    expect(source.hasMore.value).toBe(true)

    source.loadMore()
    await vi.waitFor(() => expect(source.rows.value).toHaveLength(200))
    source.loadMore()
    await vi.waitFor(() => expect(source.rows.value).toHaveLength(TOTAL))

    expect(source.hasMore.value).toBe(false)
    source.loadMore()
    expect(calls).toHaveLength(3)
    dispose()
  })

  it('starts the list again when the filters change, debounced', async () => {
    const { fetcher, calls } = pagedServer()
    const { state, source, dispose } = setup(fetcher)
    await vi.waitFor(() => expect(source.loading.value).toBe(false))
    source.loadMore()
    await vi.waitFor(() => expect(source.rows.value).toHaveLength(200))

    state.setFilter('department', valuesFilter(['Engineering']))
    await vi.waitFor(() => expect(calls).toHaveLength(3))
    await vi.waitFor(() => expect(source.loading.value).toBe(false))

    // Page 1 of the new shape, and only page 1: what "the next page" means
    // changed the moment the filters did.
    expect(calls[2]).toEqual({ page: 1, pageSize: 100 })
    expect(source.rows.value).toHaveLength(100)
    dispose()
  })

  it('coalesces a burst of keystrokes into one request', async () => {
    const { fetcher, calls } = pagedServer()
    const { state, source, dispose } = setup(fetcher)
    await vi.waitFor(() => expect(source.loading.value).toBe(false))

    for (const term of ['a', 'ad', 'ada']) state.setSearch(term)
    await vi.waitFor(() => expect(calls).toHaveLength(2))
    await vi.waitFor(() => expect(source.loading.value).toBe(false))
    expect(calls).toHaveLength(2)
    dispose()
  })

  it('ignores the pager entirely', async () => {
    const { fetcher, calls } = pagedServer()
    const { state, source, dispose } = setup(fetcher)
    await vi.waitFor(() => expect(source.loading.value).toBe(false))

    // The one query field this source does not answer to. Under `virtual` the
    // page size is written to the dataset's length on every load, and a source
    // refetching on that would never stop.
    state.setPage(3)
    state.setPageSize(999)
    await new Promise((resolve) => setTimeout(resolve, 60))

    expect(calls).toHaveLength(1)
    dispose()
  })

  it('keeps a late response from appending the wrong page', async () => {
    let resolveFirst!: (result: FetchResult<Row>) => void
    const calls: number[] = []
    const fetcher = vi.fn(async ({ query }: FetchParams) => {
      calls.push(query.page)
      if (calls.length === 1) {
        return new Promise<FetchResult<Row>>((resolve) => {
          resolveFirst = resolve
        })
      }
      return { rows: [{ id: 999 }], total: TOTAL }
    })
    const { state, source, dispose } = setup(fetcher)

    // The filter change aborts the first request and starts a second. The first
    // then resolves anyway — an abort cannot un-send a request — and must not
    // be written anywhere.
    state.setFilter('department', valuesFilter(['Engineering']))
    await vi.waitFor(() => expect(calls).toHaveLength(2))
    await vi.waitFor(() => expect(source.rows.value).toEqual([{ id: 999 }]))

    resolveFirst({ rows: [{ id: 1 }], total: 1 })
    await Promise.resolve()
    expect(source.rows.value).toEqual([{ id: 999 }])
    expect(source.total.value).toBe(TOTAL)
    dispose()
  })

  it('reports a failure and keeps the rows it had', async () => {
    const onError = vi.fn()
    let fail = false
    const { fetcher } = pagedServer()
    const failing = async (params: FetchParams) => {
      if (fail) throw new Error('nope')
      return fetcher(params)
    }
    const { source, dispose } = setup(failing, { onError })
    await vi.waitFor(() => expect(source.rows.value).toHaveLength(100))

    fail = true
    source.loadMore()
    await vi.waitFor(() => expect(source.error.value).toBeInstanceOf(Error))

    expect(onError).toHaveBeenCalledTimes(1)
    // The list is what the user is looking at; a failed *further* page must not
    // take it away.
    expect(source.rows.value).toHaveLength(100)
    // And the failure is not the end of the list: it can be asked again.
    expect(source.hasMore.value).toBe(true)
    dispose()
  })

  it('refresh starts the list over', async () => {
    const { fetcher, calls } = pagedServer()
    const { source, dispose } = setup(fetcher)
    await vi.waitFor(() => expect(source.loading.value).toBe(false))
    source.loadMore()
    await vi.waitFor(() => expect(source.rows.value).toHaveLength(200))

    source.refresh()
    await vi.waitFor(() => expect(source.loading.value).toBe(false))

    expect(source.rows.value).toHaveLength(100)
    expect(calls[calls.length - 1]).toEqual({ page: 1, pageSize: 100 })
    dispose()
  })
})
