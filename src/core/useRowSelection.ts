import { computed, ref, toValue, type ComputedRef, type MaybeRefOrGetter, type Ref } from 'vue'
import type { HeaderCheckboxState, RowId, SelectionMode, SelectionState } from './types'

export interface UseRowSelectionOptions<TRow> {
  /** Stable identity for a row. Defaults to `row.id`. */
  getRowId?: (row: TRow) => RowId
  mode?: SelectionMode
  /** Rows the user may not toggle. */
  isSelectable?: (row: TRow) => boolean
  initial?: SelectionState
}

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

function defaultRowId<TRow>(row: TRow): RowId {
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
  const mode = options.mode ?? 'multiple'
  const getRowId = options.getRowId ?? defaultRowId<TRow>
  const isSelectable = (row: TRow) => options.isSelectable?.(row) ?? true

  const state = ref<SelectionState>(options.initial ?? { mode: 'ids', ids: [] })
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

  const headerState = computed<HeaderCheckboxState>(() => {
    const selectable = rows.value.filter(isSelectable)
    if (selectable.length === 0) return 'none'
    const selectedCount = selectable.filter(isSelected).length
    if (selectedCount === 0) return 'none'
    return selectedCount === selectable.length ? 'all' : 'some'
  })

  function setIds(ids: Iterable<RowId>): void {
    state.value = { mode: 'ids', ids: [...new Set(ids)] }
  }

  function select(row: TRow, selected?: boolean): void {
    if (!isSelectable(row)) return
    const id = getRowId(row)
    const shouldSelect = selected ?? !isSelected(row)

    if (mode === 'single') {
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

  function toggleRange(row: TRow): void {
    if (mode === 'single' || anchorId === undefined) {
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
    // Excel-style: the range takes the anchor's resulting state, applied to
    // every selectable row it spans.
    const shouldSelect = !isSelected(row)
    for (let i = start; i <= end; i += 1) {
      const target = visible[i]!
      if (isSelectable(target)) select(target, shouldSelect)
    }
    anchorId = getRowId(row)
  }

  function toggleAllOnPage(selected?: boolean): void {
    if (mode === 'single') return
    const selectable = rows.value.filter(isSelectable)
    const shouldSelect = selected ?? headerState.value !== 'all'
    for (const row of selectable) select(row, shouldSelect)
  }

  function selectAllMatching(): void {
    if (mode === 'single') return
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
