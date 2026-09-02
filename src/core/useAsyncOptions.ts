import { computed, markRaw, onScopeDispose, reactive, ref, shallowRef, watch } from 'vue'
import type { Raw } from 'vue'
import type {
  AsyncOption,
  AsyncOptionFetcher,
  AsyncOptionSource,
  FilterValue,
  OptionPage,
} from './types'

/** debounceMs, immediate and onError. */
export interface AsyncOptionsOptions {
  /** Delay applied to a change of the search term. Defaults to 300ms. */
  debounceMs?: number
  /**
   * Fetch the first portion on creation. Defaults to **false**, the opposite
   * of the data sources: a dropdown's list is not on screen until it opens,
   * and a table with twenty such columns would otherwise fire twenty requests
   * for lists nobody has looked at. `loadMore()` fetches the first portion as
   * readily as the tenth, so opening the panel is the trigger.
   */
  immediate?: boolean
  /**
   * Labels the values a cell already holds but no portion has carried yet.
   *
   * Without it a column of ids reads as ids until the user happens to scroll
   * the portion holding each one — which is almost never, since the value in
   * row 1 may sit on portion 40. With it every unknown id on the page is
   * labelled from the start.
   *
   * **Called with every unknown value at once, and each value at most once.**
   * A page of 25 unlabelled ids is one request, not 25; a value the endpoint
   * answers nothing for is not asked about again, so a missing record cannot
   * turn into a request per render. Return whichever of the values you could
   * resolve, in any order.
   */
  resolveOptions?: (
    values: FilterValue[],
    context: { signal: AbortSignal },
  ) => Promise<AsyncOption[]>
  onError?: (error: unknown) => void
}

/**
 * Options for a dropdown, fetched a portion at a time as something scrolls.
 *
 * The list never arrives whole. Each request says where it got to — page
 * number, count loaded, and the cursor the last portion returned — and the
 * answer says whether there is more, in whichever of the three ways the
 * endpoint has one (`OptionPage`). So an offset API, a page-number API and a
 * cursor API are all expressible without the library naming a protocol or the
 * caller declaring which it speaks.
 *
 * Deliberately *not* built on `useInfiniteDataSource`, which is the same idea
 * one layer up: that one is welded to a `QueryState` and derives "is there
 * more" from a mandatory `total`, which is exactly the assumption a dropdown
 * over someone else's endpoint cannot make. What is shared is its shape — one
 * request at a time, a monotonic guard so a late portion cannot append itself
 * in the wrong order, and a `loadMore` safe to call from every scroll event —
 * because a scroll handler that had to debounce or count would be the caller's
 * bug to write.
 *
 * ```ts
 * const managers = useAsyncOptions(async ({ search, loaded, signal }) => {
 *   const response = await fetch(`/api/managers?q=${search}&offset=${loaded}`, { signal })
 *   const body = await response.json()
 *   return { options: body.items.map((m) => ({ value: m.id, label: m.name })), total: body.total }
 * })
 * // { id: 'managerId', editable: true, asyncOptions: managers }
 * ```
 */
export function useAsyncOptions(
  fetcher: AsyncOptionFetcher,
  options: AsyncOptionsOptions = {},
): Raw<AsyncOptionSource> {
  const debounceMs = options.debounceMs ?? 300

  const loaded = shallowRef<readonly AsyncOption[]>([])
  const search = ref('')
  const loading = ref(false)
  const error = shallowRef<unknown>(null)
  const hasLoaded = ref(false)
  /** What the last portion said about the next one. */
  const more = ref(true)
  /** The page a *further* request would ask for. 1 means nothing has arrived. */
  const nextPage = ref(1)

  /*
   * A reactive Map rather than a plain one, because a cell showing an id is
   * waiting on exactly this: Vue tracks a Map read per key, so a portion
   * arriving re-renders the cells holding the ids it carried and nothing else.
   *
   * It is not a cache of the fetcher's answers — it never grows a value the
   * user has not already had in front of them, and nothing here ever asks the
   * fetcher for a label it was not given.
   */
  const labels = reactive(new Map<FilterValue, string>())

  /** Not reactive: it is an argument to the next request, never something rendered. */
  let cursor: unknown
  /*
   * The two halves of "ask once": what the next resolve request will carry,
   * and every value that has already been asked about. Both are plain Sets
   * rather than reactive state — they are written from inside a render, where
   * a reactive write would be a loop waiting to happen, and nothing renders
   * them.
   */
  const unresolved = new Set<FilterValue>()
  const asked = new Set<FilterValue>()
  let resolveTimer: ReturnType<typeof setTimeout> | undefined
  let resolveController: AbortController | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  let controller: AbortController | undefined
  // The same monotonic guard the remote sources use, for their sharper reason:
  // an out-of-order portion would not replace the list, it would *append the
  // wrong portion to it*, which no later request can undo.
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

  function remember(option: AsyncOption): void {
    labels.set(option.value, option.label)
  }

  /**
   * One request for every id the page turned out not to know, batched across
   * the render that discovered them.
   *
   * A zero-delay timer rather than a microtask: a table renders its cells one
   * after another within the same task, so this is the first moment at which
   * the whole page's worth of misses is known. Draining before the request
   * means a miss discovered *during* it queues the next batch rather than
   * joining this one.
   */
  function flushResolve(): void {
    resolveTimer = undefined
    const resolver = options.resolveOptions
    if (!resolver || unresolved.size === 0) return

    const batch = [...unresolved]
    unresolved.clear()
    // Marked before the answer, and never unmarked: a value the endpoint knows
    // nothing about must not come back as a miss on the next render and be
    // asked about forever.
    for (const value of batch) asked.add(value)

    resolveController?.abort()
    const localController = new AbortController()
    resolveController = localController

    void resolver(batch, { signal: localController.signal })
      .then((resolved) => {
        if (localController.signal.aborted) return
        for (const option of resolved) remember(option)
      })
      .catch((caught) => {
        if (localController.signal.aborted) return
        options.onError?.(caught)
      })
  }

  /**
   * The label for a value, and the request for it when there is none.
   *
   * Reading this is what schedules the lookup, because the cells are the only
   * thing that knows which ids are on screen — a source cannot guess, and
   * resolving every id in the dataset is the request nobody wanted.
   */
  function labelFor(value: FilterValue): string | undefined {
    const known = labels.get(value)
    if (known !== undefined) return known
    if (!options.resolveOptions || asked.has(value) || value === null) return undefined
    unresolved.add(value)
    if (resolveTimer === undefined) resolveTimer = setTimeout(flushResolve, 0)
    return undefined
  }

  /**
   * Whether to ask again, read in one order so that no caller declares a
   * protocol: an explicit answer wins, a `total` is compared against what is
   * now loaded, and failing both an empty portion ends the list.
   */
  function resolveHasMore(page: OptionPage, count: number): boolean {
    if (page.hasMore !== undefined) return page.hasMore
    if (page.total !== undefined) return count < page.total
    return page.options.length > 0
  }

  /**
   * One request. `append` is the whole difference between "more of this list"
   * and "a different list": a new search clears what is on screen, a scroll
   * keeps it and adds to the end.
   */
  async function run(page: number, append: boolean): Promise<void> {
    controller?.abort()
    const localController = new AbortController()
    controller = localController
    const id = ++sequence

    loading.value = true
    if (!append) {
      loaded.value = []
      hasLoaded.value = false
      cursor = undefined
    }

    try {
      const result = await fetcher({
        search: search.value,
        page,
        loaded: append ? loaded.value.length : 0,
        cursor: append ? cursor : undefined,
        signal: localController.signal,
      })
      if (id <= settled || localController.signal.aborted) return
      settled = id
      // A fresh array either way: `loaded` is a `shallowRef`, so pushing into
      // the one it holds would change the list without telling anyone.
      const next = append ? [...loaded.value, ...result.options] : [...result.options]
      loaded.value = next
      for (const option of result.options) remember(option)
      cursor = result.cursor
      more.value = resolveHasMore(result, next.length)
      nextPage.value = page + 1
      error.value = null
      hasLoaded.value = true
    } catch (caught) {
      if (localController.signal.aborted) return
      if (id <= settled) return
      settled = id
      // The list is left standing. A portion that failed to arrive is a reason
      // to let the user try again, not to empty what they were reading.
      error.value = caught
      options.onError?.(caught)
    } finally {
      if (id === sequence) {
        loading.value = false
        controller = undefined
      }
    }
  }

  /** Back to the first portion, which is what a new search term means. */
  function restart(delay: number): void {
    if (timer !== undefined) clearTimeout(timer)
    nextPage.value = 1
    more.value = true
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

  const hasMore = computed(() => !hasLoaded.value || more.value)

  function loadMore(): void {
    // All three guards matter to a scroll handler, which will call this on
    // every event it gets: one request at a time, nothing while a search is
    // still settling, and nothing at all at the end of the list. That is what
    // lets the caller be a one-line `@end-reached`.
    if (loading.value || timer !== undefined) return
    if (!hasMore.value) return
    // Nothing loaded yet is the first portion rather than a further one — so
    // opening a panel and scrolling it are the same call.
    void run(hasLoaded.value ? nextPage.value : 1, hasLoaded.value)
  }

  /*
   * Synchronous, so the debounce timer is armed by the keystroke itself rather
   * than by the flush after it. Between the two, a scroll event arriving in the
   * same tick would find no timer, decide nothing was settling, and fire a
   * request the debounce is about to supersede.
   */
  watch(search, () => restart(debounceMs), { flush: 'sync' })

  if (options.immediate ?? false) void run(1, false)

  onScopeDispose(() => {
    cancelPending()
    if (resolveTimer !== undefined) clearTimeout(resolveTimer)
    resolveController?.abort()
  })

  // Marked raw for the reason `ColumnDef.asyncOptions` gives: this is a handle
  // on running state, not row data, and a column array put in a `ref()` must
  // not walk into it.
  return markRaw({
    options: loaded,
    search,
    loading,
    error,
    initialLoading: computed(() => loading.value && !hasLoaded.value),
    loadingMore: computed(() => loading.value && hasLoaded.value),
    hasMore,
    loadMore,
    reset: () => restart(0),
    labelFor,
    remember,
  })
}
