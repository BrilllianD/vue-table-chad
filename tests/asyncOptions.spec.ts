import { describe, expect, it, vi } from 'vitest'
import { effectScope } from 'vue'
import { useAsyncOptions } from '../src/core/useAsyncOptions'
import type {
  AsyncOptionFetcher,
  FilterValue,
  OptionPage,
  OptionPageRequest,
} from '../src/core/types'

/**
 * A list of options that grows a portion at a time.
 *
 * Two things are being pinned here, and neither is "it fetches". The first is
 * that the library holds no opinion about the endpoint: page number, offset and
 * cursor all reach the fetcher, and any of the three ways of saying "there is
 * more" is understood. The second is the pair of failure modes a scrolling list
 * has — appending the wrong portion, and appending the same one twice — which
 * is what the guards inside `loadMore` exist for.
 */

const TOTAL = 25

/** A server holding `TOTAL` options, answering by offset. */
function pagedServer(reply: (page: number) => Partial<OptionPage> = () => ({ total: TOTAL })) {
  const calls: OptionPageRequest[] = []
  const fetcher: AsyncOptionFetcher = async (request) => {
    calls.push(request)
    const size = 10
    const from = request.loaded
    const options = Array.from(
      { length: Math.max(0, Math.min(size, TOTAL - from)) },
      (_, index) => ({ value: from + index, label: `Option ${from + index}` }),
    )
    return { options, ...reply(request.page) }
  }
  return { fetcher, calls }
}

function setup(fetcher: AsyncOptionFetcher, options: Record<string, unknown> = {}) {
  const scope = effectScope()
  const source = scope.run(() => useAsyncOptions(fetcher, { debounceMs: 20, ...options }))!
  return { source, dispose: () => scope.stop() }
}

describe('useAsyncOptions', () => {
  it('fetches nothing until something asks', async () => {
    const { fetcher, calls } = pagedServer()
    const { source, dispose } = setup(fetcher)

    // The opposite default from the data sources, and deliberately: a table of
    // twenty such columns would otherwise fire twenty requests for lists
    // nobody has opened.
    expect(calls).toHaveLength(0)
    expect(source.options.value).toEqual([])

    source.loadMore()
    await vi.waitFor(() => expect(source.loading.value).toBe(false))
    expect(source.options.value).toHaveLength(10)
    expect(calls[0]).toMatchObject({ page: 1, loaded: 0, search: '', cursor: undefined })
    dispose()
  })

  it('adds the next portion to the end rather than replacing the list', async () => {
    const { fetcher, calls } = pagedServer()
    const { source, dispose } = setup(fetcher)
    source.loadMore()
    await vi.waitFor(() => expect(source.loading.value).toBe(false))

    source.loadMore()
    await vi.waitFor(() => expect(source.options.value).toHaveLength(20))

    expect(source.options.value.map((option) => option.value)).toEqual(
      Array.from({ length: 20 }, (_, index) => index),
    )
    // Everything an offset, a page-number or a cursor endpoint could need.
    expect(calls[1]).toMatchObject({ page: 2, loaded: 10 })
    dispose()
  })

  it('runs one request at a time, however often a scroll handler asks', async () => {
    const { fetcher, calls } = pagedServer()
    const { source, dispose } = setup(fetcher)

    source.loadMore()
    source.loadMore()
    source.loadMore()
    await vi.waitFor(() => expect(source.loading.value).toBe(false))

    expect(calls).toHaveLength(1)
    dispose()
  })

  it('stops asking once the list is complete', async () => {
    const { fetcher, calls } = pagedServer()
    const { source, dispose } = setup(fetcher)

    for (let round = 0; round < 4; round += 1) {
      source.loadMore()
      await vi.waitFor(() => expect(source.loading.value).toBe(false))
    }

    expect(source.options.value).toHaveLength(TOTAL)
    expect(source.hasMore.value).toBe(false)
    const asked = calls.length
    source.loadMore()
    expect(calls).toHaveLength(asked)
    dispose()
  })

  describe('however the endpoint says there is more', () => {
    it('takes an explicit hasMore over everything else', async () => {
      // A total that would say "keep going", overruled by the flag.
      const { fetcher } = pagedServer(() => ({ total: TOTAL, hasMore: false }))
      const { source, dispose } = setup(fetcher)
      source.loadMore()
      await vi.waitFor(() => expect(source.loading.value).toBe(false))

      expect(source.options.value).toHaveLength(10)
      expect(source.hasMore.value).toBe(false)
      dispose()
    })

    it('compares a total against what is loaded', async () => {
      const { fetcher } = pagedServer(() => ({ total: 10 }))
      const { source, dispose } = setup(fetcher)
      source.loadMore()
      await vi.waitFor(() => expect(source.loading.value).toBe(false))

      expect(source.hasMore.value).toBe(false)
      dispose()
    })

    it('reads an empty portion as the end, for a cursor endpoint that says nothing', async () => {
      const cursors: unknown[] = []
      const fetcher: AsyncOptionFetcher = async (request) => {
        cursors.push(request.cursor)
        if (request.cursor === 'end') return { options: [] }
        return {
          options: [{ value: 1, label: 'One' }],
          cursor: request.cursor === undefined ? 'more' : 'end',
        }
      }
      const { source, dispose } = setup(fetcher)

      source.loadMore()
      await vi.waitFor(() => expect(source.loading.value).toBe(false))
      expect(source.hasMore.value).toBe(true)

      source.loadMore()
      await vi.waitFor(() => expect(source.options.value).toHaveLength(2))
      source.loadMore()
      await vi.waitFor(() => expect(source.hasMore.value).toBe(false))

      // The cursor from the previous portion, handed straight back.
      expect(cursors).toEqual([undefined, 'more', 'end'])
      dispose()
    })
  })

  it('keeps a late portion from appending itself in the wrong order', async () => {
    let resolveFirst: ((page: OptionPage) => void) | undefined
    const fetcher = vi
      .fn<AsyncOptionFetcher>()
      .mockImplementationOnce(
        () =>
          new Promise<OptionPage>((resolve) => {
            resolveFirst = resolve
          }),
      )
      .mockImplementation(async () => ({
        options: [{ value: 2, label: 'Second' }],
        hasMore: false,
      }))

    const { source, dispose } = setup(fetcher)
    source.loadMore()
    // A new search supersedes the portion still in flight.
    source.search.value = 'x'
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2))
    await vi.waitFor(() => expect(source.options.value).toHaveLength(1))

    resolveFirst?.({ options: [{ value: 1, label: 'First' }], hasMore: true })
    await Promise.resolve()

    expect(source.options.value.map((option) => option.label)).toEqual(['Second'])
    dispose()
  })

  it('coalesces a burst of keystrokes into one request', async () => {
    const { fetcher, calls } = pagedServer()
    const { source, dispose } = setup(fetcher)

    source.search.value = 'a'
    source.search.value = 'an'
    source.search.value = 'ann'
    await vi.waitFor(() => expect(calls).toHaveLength(1))

    expect(calls[0]).toMatchObject({ search: 'ann', page: 1, loaded: 0 })
    dispose()
  })

  it('refuses to load more while a search is still settling', async () => {
    const { fetcher, calls } = pagedServer()
    const { source, dispose } = setup(fetcher)

    source.search.value = 'ann'
    source.loadMore()
    expect(calls).toHaveLength(0)

    await vi.waitFor(() => expect(calls).toHaveLength(1))
    dispose()
  })

  it('keeps the list standing when a portion fails', async () => {
    let fail = false
    const { fetcher: ok } = pagedServer()
    const fetcher: AsyncOptionFetcher = async (request) => {
      if (fail) throw new Error('nope')
      return ok(request)
    }
    const onError = vi.fn()
    const { source, dispose } = setup(fetcher, { onError })

    source.loadMore()
    await vi.waitFor(() => expect(source.options.value).toHaveLength(10))

    fail = true
    source.loadMore()
    await vi.waitFor(() => expect(source.error.value).toBeInstanceOf(Error))

    // A portion that failed to arrive is a reason to let the user try again,
    // not to empty what they were reading.
    expect(source.options.value).toHaveLength(10)
    expect(source.hasMore.value).toBe(true)
    expect(onError).toHaveBeenCalledOnce()
    dispose()
  })

  it('aborts what is in flight when its scope goes away', async () => {
    const signals: AbortSignal[] = []
    const fetcher: AsyncOptionFetcher = ({ signal }) => {
      signals.push(signal)
      return new Promise<OptionPage>(() => {})
    }
    const { source, dispose } = setup(fetcher)

    source.loadMore()
    await vi.waitFor(() => expect(signals).toHaveLength(1))
    expect(signals[0]!.aborted).toBe(false)

    dispose()
    expect(signals[0]!.aborted).toBe(true)
  })

  describe('the labels it remembers', () => {
    it('takes them from every portion that arrives', async () => {
      const { fetcher } = pagedServer()
      const { source, dispose } = setup(fetcher)

      expect(source.labelFor(3)).toBeUndefined()
      source.loadMore()
      await vi.waitFor(() => expect(source.options.value).toHaveLength(10))

      expect(source.labelFor(3)).toBe('Option 3')
      // A value on a portion nobody has scrolled to has no label, and nothing
      // here goes looking for one.
      expect(source.labelFor(20)).toBeUndefined()
      dispose()
    })

    it('keeps them across a search that clears the list', async () => {
      const { fetcher } = pagedServer()
      const { source, dispose } = setup(fetcher)
      source.loadMore()
      await vi.waitFor(() => expect(source.options.value).toHaveLength(10))

      source.search.value = 'zzz'
      await vi.waitFor(() => expect(source.search.value).toBe('zzz'))

      // The cell holding option 3 still has to show its name while the panel
      // is showing something else entirely.
      expect(source.labelFor(3)).toBe('Option 3')
      dispose()
    })

    it('asks for every unknown id on the page in one request', async () => {
      const calls: FilterValue[][] = []
      const { fetcher } = pagedServer()
      const { source, dispose } = setup(fetcher, {
        resolveOptions: async (values: FilterValue[]) => {
          calls.push(values)
          return values.map((value) => ({ value, label: `Resolved ${String(value)}` }))
        },
      })

      // What a page of cells does: each one reads the label it has no answer
      // for. That is 25 misses and must not be 25 requests.
      for (const value of [7, 3, 90]) expect(source.labelFor(value)).toBeUndefined()
      await vi.waitFor(() => expect(calls).toHaveLength(1))

      expect(calls[0]).toEqual([7, 3, 90])
      expect(source.labelFor(3)).toBe('Resolved 3')
      dispose()
    })

    it('asks about a value once, even when nothing comes back for it', async () => {
      const calls: FilterValue[][] = []
      const { fetcher } = pagedServer()
      const { source, dispose } = setup(fetcher, {
        resolveOptions: async (values: FilterValue[]) => {
          calls.push(values)
          // The endpoint knows nothing about it — a deleted record, say.
          return []
        },
      })

      source.labelFor(7)
      await vi.waitFor(() => expect(calls).toHaveLength(1))

      // Re-rendered, the same cell misses again. Asking again would be a
      // request per render, for as long as the row is on screen.
      source.labelFor(7)
      source.labelFor(7)
      await new Promise((resolve) => setTimeout(resolve, 20))
      expect(calls).toHaveLength(1)
      dispose()
    })

    it('says nothing and asks nothing when there is no resolver', async () => {
      const { fetcher } = pagedServer()
      const { source, dispose } = setup(fetcher)

      expect(source.labelFor(7)).toBeUndefined()
      await new Promise((resolve) => setTimeout(resolve, 20))
      expect(source.options.value).toEqual([])
      dispose()
    })

    it('aborts a lookup in flight when its scope goes away', async () => {
      const signals: AbortSignal[] = []
      const { fetcher } = pagedServer()
      const { source, dispose } = setup(fetcher, {
        resolveOptions: (_values: FilterValue[], { signal }: { signal: AbortSignal }) => {
          signals.push(signal)
          return new Promise<never>(() => {})
        },
      })

      source.labelFor(7)
      await vi.waitFor(() => expect(signals).toHaveLength(1))
      dispose()
      expect(signals[0]!.aborted).toBe(true)
    })

    it('takes one that was handed over rather than loaded', () => {
      const { fetcher } = pagedServer()
      const { source, dispose } = setup(fetcher)

      source.remember({ value: 99, label: 'Ninety-nine' })
      expect(source.labelFor(99)).toBe('Ninety-nine')
      dispose()
    })
  })
})
