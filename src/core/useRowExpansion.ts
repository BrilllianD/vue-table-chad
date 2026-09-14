import { computed, ref, shallowRef, type Ref } from 'vue'
import type { RowId } from './types'
import { defaultRowId } from './useRowSelection'

/** Where a row's detail data stands. */
export type DetailStatus = 'idle' | 'loading' | 'ready' | 'error'

/**
 * A row's detail data and how it got there.
 *
 * `ready` with no `data` is the answer for a table that declares no
 * `loadDetail` — the panel's content came from the row itself, so there is
 * nothing to wait for and a caller writing `v-if="detail.status === 'ready'"`
 * works either way.
 */
export interface DetailState<TDetail> {
  status: DetailStatus
  data?: TDetail
  error?: unknown
}

/** Row identity, the rows that start open, and where their children come from. */
export interface UseRowExpansionOptions<TRow, TDetail = unknown> {
  /**
   * Stable identity for a row. Defaults to `row.id` — `defaultRowId`, the same
   * one selection, the cursor and editing use, so a table that supplies it once
   * supplies it to all four.
   */
  getRowId?: (row: TRow) => RowId
  /** Rows whose detail panel starts open. */
  initial?: RowId[]
  /**
   * Fetches what a row's panel shows, when the panel's content is not already
   * in the row.
   *
   * Called on the expand transition and once per row id: shutting a panel keeps
   * what arrived, so reopening it is instant. `reload` is the way to ask again.
   */
  loadDetail?: (row: TRow) => Promise<TDetail>
}

/** The open set, its predicate, its mutators and the detail each row loaded. */
export interface UseRowExpansion<TRow, TDetail = unknown> {
  /** Open row ids. Writable, so the open set can be hoisted or saved. */
  expanded: Ref<RowId[]>
  isExpanded: (row: TRow) => boolean
  toggle: (row: TRow, expanded?: boolean) => void
  /**
   * Opens every row it is handed.
   *
   * The rows are an argument rather than an option on purpose: this composable
   * then holds no reference to the dataset at all, so it cannot re-derive when
   * the data moves and cannot be wired into the pipeline by accident. The
   * caller has the rendered rows already.
   */
  expandAll: (rows: TRow[]) => void
  collapseAll: () => void
  /**
   * What this row's panel has to show, and whether it is still coming.
   *
   * `ready` with no `data` when there is no `loadDetail` at all, so a template
   * reads the same either way.
   */
  detailFor: (row: TRow) => DetailState<TDetail>
  /**
   * Fetches a row's detail again, cache or no cache. What a Retry button in a
   * failed panel calls, and what a caller calls when the children changed
   * underneath an open one.
   */
  reload: (row: TRow) => void
  getRowId: (row: TRow) => RowId
}

/*
 * Two shared frozen answers rather than a fresh object per call. `detailFor`
 * runs once per rendered panel per render, and a new object each time would
 * make every consumer that watches it re-run for a state that never changed.
 */
const IDLE = Object.freeze({ status: 'idle' as const })
const READY_WITHOUT_DATA = Object.freeze({ status: 'ready' as const })

/**
 * Which rows have their detail panel open, and nothing else.
 *
 * The collapse half of `useRowGrouping` with the sense inverted, and it stays
 * out of the pipeline the same way: it reads the pipeline's output and writes
 * none of its inputs, so expanding a row costs the walk in `withDetailRows` and
 * not one filter, sort or aggregate pass. `tests/invalidation.spec.ts` is the
 * ratchet on that.
 *
 * Ids rather than rows, for the reason selection keys by id: a refetch hands
 * back freshly allocated row objects, and a panel the user opened has to
 * survive one.
 *
 * Given a `loadDetail`, it also owns the children each open row fetched: see
 * `detailFor` and `reload`.
 */
export function useRowExpansion<TRow, TDetail = unknown>(
  options: UseRowExpansionOptions<TRow, TDetail> = {},
): UseRowExpansion<TRow, TDetail> {
  const getRowId = options.getRowId ?? defaultRowId<TRow>
  const expanded = ref<RowId[]>([...(options.initial ?? [])]) as Ref<RowId[]>

  /**
   * The open ids as a set, rebuilt only when the list is written.
   *
   * `includes` would be O(open) and `withDetailRows` asks once per *displayed*
   * row — which under `virtual` is the whole dataset, so a table with fifty
   * panels open would do a few million array scans to answer one click. The
   * grouping side gets away with `includes` because a page holds a handful of
   * bands; the row side cannot.
   */
  const openIds = computed(() => new Set(expanded.value))

  function isExpanded(row: TRow): boolean {
    return openIds.value.has(getRowId(row))
  }

  /**
   * What each row's panel has loaded, replaced rather than mutated.
   *
   * A `shallowRef` around a whole new `Map` on every write: writing into the
   * map in place would change what a panel shows without telling anyone, and a
   * deep `ref` would proxy every detail object a consumer ever put in it. The
   * cost of the copy is one entry per *open* row, not per row in the dataset.
   */
  const details = shallowRef<Map<RowId, DetailState<TDetail>>>(new Map())

  /**
   * The request each id is waiting on. A plain `Map` rather than a ref: nothing
   * renders from it, and a response compares against it only to find out
   * whether it is the one still wanted.
   */
  const tokens = new Map<RowId, number>()
  let sequence = 0

  function writeDetail(id: RowId, state: DetailState<TDetail>): void {
    const next = new Map(details.value)
    next.set(id, state)
    details.value = next
  }

  function load(row: TRow, id: RowId): void {
    const loadDetail = options.loadDetail
    if (!loadDetail) return

    const token = (sequence += 1)
    tokens.set(id, token)
    writeDetail(id, { status: 'loading' })

    void loadDetail(row).then(
      (data) => {
        // A response nobody is waiting for any more: a `reload` overtook it, or
        // this row's request was superseded. Writing it would put stale
        // children under a panel that already asked again.
        if (tokens.get(id) !== token) return
        writeDetail(id, { status: 'ready', data })
      },
      (error: unknown) => {
        if (tokens.get(id) !== token) return
        writeDetail(id, { status: 'error', error })
      },
    )
  }

  function toggle(row: TRow, next?: boolean): void {
    const id = getRowId(row)
    const shouldExpand = next ?? !openIds.value.has(id)
    if (shouldExpand && !openIds.value.has(id) && !details.value.has(id)) load(row, id)

    const set = new Set(expanded.value)
    if (shouldExpand) set.add(id)
    else set.delete(id)
    expanded.value = [...set]
  }

  function expandAll(rows: TRow[]): void {
    /*
     * One request per row that has none yet. Opening every row means every
     * panel is on screen, and a panel with nothing in it is not an improvement
     * on a request — but a caller opening thousands of rows is asking for
     * thousands of requests, which is why this takes the rows it should open
     * rather than reaching for a dataset.
     */
    if (options.loadDetail) {
      for (const row of rows) {
        const id = getRowId(row)
        if (!details.value.has(id)) load(row, id)
      }
    }

    // One write for the whole set. Looping over `toggle` would reassign the ref
    // once per row, and every detail row downstream would re-walk the list for
    // each of them.
    expanded.value = [...new Set(rows.map(getRowId))]
  }

  function collapseAll(): void {
    // The cache stands: what a panel loaded is still true when it shuts, and
    // throwing it away would make reopening one cost a round trip.
    expanded.value = []
  }

  function detailFor(row: TRow): DetailState<TDetail> {
    if (!options.loadDetail) return READY_WITHOUT_DATA
    return details.value.get(getRowId(row)) ?? IDLE
  }

  function reload(row: TRow): void {
    load(row, getRowId(row))
  }

  return {
    expanded,
    isExpanded,
    toggle,
    expandAll,
    collapseAll,
    detailFor,
    reload,
    getRowId,
  }
}
