import {
  computed,
  shallowRef,
  toValue,
  type ComputedRef,
  type MaybeRefOrGetter,
  type Ref,
} from 'vue'
import type { HeaderCheckboxState, RowId, SelectionMode, SelectionState } from './types'

/** Row identity, selectability, mode, and an initial selection. */
export interface UseRowSelectionOptions<TRow> {
  /** Stable identity for a row. Defaults to `row.id`. */
  getRowId?: (row: TRow) => RowId
  /** Accepts a ref or getter so a table can switch modes without remounting. */
  mode?: MaybeRefOrGetter<SelectionMode>
  /** Rows the user may not toggle. */
  isSelectable?: (row: TRow) => boolean
  initial?: SelectionState
}

/** Selection state, predicates and mutators. */
export interface UseRowSelection<TRow> {
  state: Ref<SelectionState>
  /** Ids explicitly selected. Empty in `all-matching` mode. */
  selectedIds: ComputedRef<RowId[]>
  /** Selected rows on the current page only — server pages hold no more. */
  selectedOnPage: ComputedRef<TRow[]>
  count: ComputedRef<number>
  isEmpty: ComputedRef<boolean>
  /** True when the user asked for every row matching the current filters. */
  isAllMatching: ComputedRef<boolean>
  headerState: ComputedRef<HeaderCheckboxState>

  isSelected: (row: TRow) => boolean
  isSelectable: (row: TRow) => boolean
  select: (row: TRow, selected?: boolean) => void
  toggle: (row: TRow) => void
  /** Shift-click: selects every row between the last click and this one. */
  toggleRange: (row: TRow) => void
  toggleAllOnPage: (selected?: boolean) => void
  /** "Select all N matching" — stores a predicate, not 12k ids. */
  selectAllMatching: () => void
  clear: () => void
  getRowId: (row: TRow) => RowId
}

/** `row.id`, or a pointed error telling the caller to supply `getRowId`. */
export function defaultRowId<TRow>(row: TRow): RowId {
  const id = (row as { id?: RowId }).id
  if (id === undefined) {
    throw new Error('[vue-table] Row has no `id`. Pass `getRowId` to useRowSelection.')
  }
  return id
}

/**
 * Selection that survives paging, and that can represent "everything matching
 * the filters" without materialising an id per row.
 */
export function useRowSelection<TRow>(
  pageRows: MaybeRefOrGetter<TRow[]>,
  total: MaybeRefOrGetter<number>,
  options: UseRowSelectionOptions<TRow> = {},
): UseRowSelection<TRow> {
  const mode = computed<SelectionMode>(() => toValue(options.mode) ?? 'multiple')
  const getRowId = options.getRowId ?? defaultRowId<TRow>
  const isSelectable = (row: TRow) => options.isSelectable?.(row) ?? true

  /**
   * `shallowRef`, not `ref`: every write below replaces the whole state object
   * rather than mutating the id list in place, so deep reactivity buys nothing
   * and costs a Proxy over an array that can hold one entry per selected row.
   * Selecting 12k rows would otherwise proxy 12k ids to notice a change that
   * the reassignment already announced.
   */
  const state = shallowRef<SelectionState>(options.initial ?? { mode: 'ids', ids: [] })
  const rows = computed(() => toValue(pageRows) ?? [])
  const totalCount = computed(() => toValue(total) ?? 0)

  // Anchor for shift-click ranges, tracked against the visible page.
  let anchorId: RowId | undefined

  const idSet = computed(() => {
    const current = state.value
    return new Set<RowId>(current.mode === 'ids' ? current.ids : current.excluded)
  })

  const isAllMatching = computed(() => state.value.mode === 'all-matching')

  function isSelected(row: TRow): boolean {
    const id = getRowId(row)
    return state.value.mode === 'ids' ? idSet.value.has(id) : !idSet.value.has(id)
  }

  const selectedIds = computed<RowId[]>(() =>
    state.value.mode === 'ids' ? [...state.value.ids] : [],
  )

  const selectedOnPage = computed(() => rows.value.filter(isSelected))

  const count = computed(() => {
    const current = state.value
    if (current.mode === 'ids') return current.ids.length
    return Math.max(0, totalCount.value - current.excluded.length)
  })

  const isEmpty = computed(() => count.value === 0)

  /**
   * The toggleable rows' ids, and *only* a function of the rows.
   *
   * Split out so that the walk over them is paid when the page changes rather
   * than when the selection does. Virtual mode hands this composable the whole
   * dataset as its "page", so an O(rows) pass per click is 8.2ms at 100k — see
   * `bench/BASELINE.md`.
   */
  const selectableIds = computed(() => {
    const ids = new Set<RowId>()
    for (const row of rows.value) {
      if (isSelectable(row)) ids.add(getRowId(row))
    }
    return ids
  })

  /**
   * How many of them are selected, counted from the *selection* rather than
   * from the rows: the state carries either the ids that are in or the ids that
   * are out, and both lists are as long as the user's own clicks. Asking each
   * row whether it is selected instead costs one pass over the dataset per
   * click, which is the thing this avoids.
   */
  const selectedOnPageCount = computed(() => {
    const onPage = selectableIds.value
    const current = state.value
    let counted = 0
    if (current.mode === 'ids') {
      for (const id of current.ids) if (onPage.has(id)) counted += 1
      return counted
    }
    for (const id of current.excluded) if (onPage.has(id)) counted += 1
    return onPage.size - counted
  })

  const headerState = computed<HeaderCheckboxState>(() => {
    const selectable = selectableIds.value.size
    if (selectable === 0) return 'none'
    const selected = selectedOnPageCount.value
    if (selected === 0) return 'none'
    return selected === selectable ? 'all' : 'some'
  })

  function setIds(ids: Iterable<RowId>): void {
    state.value = { mode: 'ids', ids: [...new Set(ids)] }
  }

  function select(row: TRow, selected?: boolean): void {
    if (!isSelectable(row)) return
    const id = getRowId(row)
    const shouldSelect = selected ?? !isSelected(row)

    if (mode.value === 'single') {
      state.value = { mode: 'ids', ids: shouldSelect ? [id] : [] }
      anchorId = shouldSelect ? id : undefined
      return
    }

    const current = state.value
    if (current.mode === 'all-matching') {
      // Deselecting inside "all matching" records an exclusion rather than
      // collapsing the whole selection into an id list.
      const excluded = new Set(current.excluded)
      if (shouldSelect) excluded.delete(id)
      else excluded.add(id)
      state.value = { mode: 'all-matching', excluded: [...excluded] }
    } else {
      const ids = new Set(current.ids)
      if (shouldSelect) ids.add(id)
      else ids.delete(id)
      setIds(ids)
    }
    anchorId = id
  }

  function toggle(row: TRow): void {
    select(row)
  }

  /**
   * Applies one decision to many rows with a single state write. Going through
   * `select()` per row would rebuild the whole state object and its `Set` on
   * every iteration — O(n²) across a large page.
   */
  function selectMany(targets: readonly TRow[], shouldSelect: boolean): void {
    const selectable = targets.filter(isSelectable)
    if (selectable.length === 0) return
    const ids = selectable.map(getRowId)
    const current = state.value

    if (current.mode === 'all-matching') {
      const excluded = new Set(current.excluded)
      for (const id of ids) {
        if (shouldSelect) excluded.delete(id)
        else excluded.add(id)
      }
      state.value = { mode: 'all-matching', excluded: [...excluded] }
    } else {
      const next = new Set(current.ids)
      for (const id of ids) {
        if (shouldSelect) next.add(id)
        else next.delete(id)
      }
      setIds(next)
    }
    anchorId = ids[ids.length - 1]
  }

  function toggleRange(row: TRow): void {
    if (mode.value === 'single' || anchorId === undefined) {
      select(row)
      return
    }
    const visible = rows.value
    const from = visible.findIndex((entry) => getRowId(entry) === anchorId)
    const to = visible.findIndex((entry) => getRowId(entry) === getRowId(row))
    if (from === -1 || to === -1) {
      select(row)
      return
    }
    const [start, end] = from <= to ? [from, to] : [to, from]
    // Excel-style: the whole range takes the state the *clicked* row is moving
    // to, so a shift-click that selects one row selects them all.
    const shouldSelect = !isSelected(row)
    selectMany(visible.slice(start, end + 1), shouldSelect)
    anchorId = getRowId(row)
  }

  function toggleAllOnPage(selected?: boolean): void {
    if (mode.value === 'single') return
    const shouldSelect = selected ?? headerState.value !== 'all'
    selectMany(rows.value, shouldSelect)
  }

  function selectAllMatching(): void {
    if (mode.value === 'single') return
    state.value = { mode: 'all-matching', excluded: [] }
  }

  function clear(): void {
    state.value = { mode: 'ids', ids: [] }
    anchorId = undefined
  }

  return {
    state,
    selectedIds,
    selectedOnPage,
    count,
    isEmpty,
    isAllMatching,
    headerState,
    isSelected,
    isSelectable,
    select,
    toggle,
    toggleRange,
    toggleAllOnPage,
    selectAllMatching,
    clear,
    getRowId,
  }
}
