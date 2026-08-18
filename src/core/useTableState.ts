import { computed, reactive, ref, toRaw, toRefs, watch, type ComputedRef, type Ref } from 'vue'
import type {
  ColumnFilter,
  GroupMode,
  QueryState,
  SortDirection,
  SortRule,
} from './types'
import { applySortRule, nextDirection } from './sorting'
import { isEmptyFilter, pruneFilters } from './filters/model'

export interface TableStateOptions {
  initialSort?: SortRule[]
  initialFilters?: Record<string, ColumnFilter>
  /** Column ids to group rows by on first render, outermost level first. */
  initialGroupBy?: string[]
  /**
   * Who performs the grouping. Defaults to `'client'` — the table bands rows
   * that are already loaded and `query.groupBy` stays empty, so no source ever
   * refetches over a grouping change. `'server'` publishes it into the query
   * instead. Settable later through `groupMode`.
   */
  groupMode?: GroupMode
  initialPage?: number
  pageSize?: number
  initialSearch?: string
  /**
   * Hand in a ref to hoist the whole query into a store or the URL. When
   * provided this ref becomes the single source of truth and the composable
   * writes straight through to it.
   */
  state?: Ref<QueryState>
}

export interface TableState {
  query: ComputedRef<QueryState>
  sort: Ref<SortRule[]>
  filters: Ref<Record<string, ColumnFilter>>
  groupBy: Ref<string[]>
  /**
   * Who performs the grouping. Writable: `<TableRoot>` binds its `groupMode`
   * prop through this, so the switch reaches a state built outside too.
   * Flipping it carries the current grouping across rather than dropping it.
   */
  groupMode: Ref<GroupMode>
  page: Ref<number>
  pageSize: Ref<number>
  globalSearch: Ref<string>

  /** Cycles asc → desc → off. Hold shift (`additive`) to build a multi-sort. */
  toggleSort: (columnId: string, additive?: boolean) => void
  setSort: (columnId: string, direction: SortDirection | false, additive?: boolean) => void
  clearSort: () => void
  sortFor: (columnId: string) => SortDirection | false
  sortIndexFor: (columnId: string) => number

  setFilter: (columnId: string, filter: ColumnFilter | undefined) => void
  clearFilter: (columnId: string) => void
  clearAllFilters: () => void
  filterFor: (columnId: string) => ColumnFilter | undefined
  activeFilterIds: ComputedRef<string[]>
  hasActiveFilters: ComputedRef<boolean>

  setGroupBy: (columnIds: string[]) => void
  /** Adds a grouping level, or moves an existing one to the end. */
  addGroup: (columnId: string) => void
  removeGroup: (columnId: string) => void
  /** Adds the column if it is not grouped, removes it if it is. */
  toggleGroup: (columnId: string) => void
  clearGrouping: () => void
  isGrouped: (columnId: string) => boolean
  /** 1-based grouping level for a column, or 0 when it is not grouped. */
  groupIndexFor: (columnId: string) => number
  hasGrouping: ComputedRef<boolean>

  setPage: (page: number) => void
  setPageSize: (size: number) => void
  setSearch: (search: string) => void
  reset: () => void
}

export function createQueryState(options: TableStateOptions = {}): QueryState {
  return {
    sort: options.initialSort ? [...options.initialSort] : [],
    filters: options.initialFilters ? { ...options.initialFilters } : {},
    groupBy: options.initialGroupBy ? [...options.initialGroupBy] : [],
    page: options.initialPage ?? 1,
    pageSize: options.pageSize ?? 25,
    globalSearch: options.initialSearch ?? '',
  }
}

/**
 * Owns the `QueryState`. Nothing here knows where rows come from — that is the
 * data source's job — which is what lets one state object drive either.
 */
export function useTableState(options: TableStateOptions = {}): TableState {
  const initial = createQueryState(options)
  const internal = reactive<QueryState>(initial)

  // When the caller supplies a ref, mirror both ways so external writes (a
  // router query, a Pinia store) land in the table and vice versa.
  //
  // Both watchers are `flush: 'sync'` so a caller reading `external.value`
  // immediately after `setPage()` sees the new page rather than the old one.
  // The `syncing` guard stops the two from echoing each other.
  if (options.state) {
    const external = options.state
    Object.assign(internal, external.value)
    let syncing = false

    watch(
      () => external.value,
      (value) => {
        if (syncing || !value) return
        syncing = true
        Object.assign(internal, value)
        syncing = false
      },
      { deep: true, flush: 'sync' },
    )

    watch(
      internal,
      () => {
        if (syncing) return
        syncing = true
        external.value = { ...toRaw(internal) } as QueryState
        syncing = false
      },
      { deep: true, flush: 'sync' },
    )
  }

  const refs = toRefs(internal)
  const sort = refs.sort as Ref<SortRule[]>
  const filters = refs.filters as Ref<Record<string, ColumnFilter>>
  const page = refs.page as Ref<number>
  const pageSize = refs.pageSize as Ref<number>
  const globalSearch = refs.globalSearch as Ref<string>

  /* --------------------------------------------------------------- grouping */

  const groupMode = ref<GroupMode>(options.groupMode ?? 'client')

  /**
   * Where a client-side grouping lives. It cannot live in `internal`, because
   * everything there is the query — mirrored to an external ref and handed to
   * the data source — and a grouping the client performs must reach neither.
   */
  const clientGroupBy = ref<string[]>([])

  // `initialGroupBy` seeded the query object; under the default mode that is
  // the wrong home for it, so move it before anything can observe it there.
  if (groupMode.value === 'client' && internal.groupBy.length > 0) {
    clientGroupBy.value = internal.groupBy
    internal.groupBy = []
  }

  /** Reads and writes whichever home the current mode designates. */
  const groupBy = computed<string[]>({
    get: () => (groupMode.value === 'server' ? internal.groupBy : clientGroupBy.value),
    set: (value) => {
      // De-duplicated: the same column twice would nest a group inside itself,
      // producing a second level in which every group holds exactly one bucket.
      const next = [...new Set(value)]
      if (groupMode.value !== 'server') {
        clientGroupBy.value = next
        return
      }
      internal.groupBy = next
      // Delegated grouping reorders the result set, so — like a filter change —
      // it invalidates the current page rather than just redecorating it. A
      // client-side grouping rearranges what is already on screen and leaves
      // paging alone.
      internal.page = 1
    },
  })

  // `sync`, like the external-state mirrors above: a caller flipping the mode
  // and reading `groupBy` on the next line must see the grouping it kept, not
  // the empty home it is about to be moved out of.
  watch(
    groupMode,
    (mode, previous) => {
      if (mode === previous) return
      const carried = previous === 'server' ? internal.groupBy : clientGroupBy.value
      if (mode === 'server') {
        clientGroupBy.value = []
        internal.groupBy = [...carried]
        internal.page = 1
      } else {
        internal.groupBy = []
        clientGroupBy.value = [...carried]
      }
    },
    { flush: 'sync' },
  )

  const query = computed<QueryState>(() => ({
    sort: internal.sort,
    filters: internal.filters,
    groupBy: internal.groupBy,
    page: internal.page,
    pageSize: internal.pageSize,
    globalSearch: internal.globalSearch,
  }))

  function sortFor(columnId: string): SortDirection | false {
    return internal.sort.find((rule) => rule.columnId === columnId)?.direction ?? false
  }

  function sortIndexFor(columnId: string): number {
    const index = internal.sort.findIndex((rule) => rule.columnId === columnId)
    return index === -1 ? 0 : index + 1
  }

  function setSort(columnId: string, direction: SortDirection | false, additive = false): void {
    internal.sort = applySortRule(internal.sort, columnId, direction, additive)
    internal.page = 1
  }

  function toggleSort(columnId: string, additive = false): void {
    setSort(columnId, nextDirection(sortFor(columnId)), additive)
  }

  function clearSort(): void {
    internal.sort = []
  }

  function setFilter(columnId: string, filter: ColumnFilter | undefined): void {
    const next = { ...internal.filters }
    if (!filter || isEmptyFilter(filter)) delete next[columnId]
    else next[columnId] = filter
    internal.filters = next
    // A changed filter invalidates the current page — page 7 of a 3-page
    // result set would otherwise render empty.
    internal.page = 1
  }

  function clearFilter(columnId: string): void {
    setFilter(columnId, undefined)
  }

  function clearAllFilters(): void {
    internal.filters = {}
    internal.page = 1
  }

  function filterFor(columnId: string): ColumnFilter | undefined {
    return internal.filters[columnId]
  }

  const activeFilterIds = computed(() =>
    Object.keys(pruneFilters(internal.filters)).sort(),
  )
  const hasActiveFilters = computed(() => activeFilterIds.value.length > 0)

  function setGroupBy(columnIds: string[]): void {
    groupBy.value = columnIds
  }

  function isGrouped(columnId: string): boolean {
    return groupBy.value.includes(columnId)
  }

  function groupIndexFor(columnId: string): number {
    return groupBy.value.indexOf(columnId) + 1
  }

  function addGroup(columnId: string): void {
    setGroupBy([...groupBy.value.filter((id) => id !== columnId), columnId])
  }

  function removeGroup(columnId: string): void {
    setGroupBy(groupBy.value.filter((id) => id !== columnId))
  }

  function toggleGroup(columnId: string): void {
    if (isGrouped(columnId)) removeGroup(columnId)
    else addGroup(columnId)
  }

  function clearGrouping(): void {
    setGroupBy([])
  }

  const hasGrouping = computed(() => groupBy.value.length > 0)

  function setPage(value: number): void {
    internal.page = Math.max(1, Math.floor(value))
  }

  function setPageSize(size: number): void {
    const next = Math.max(1, Math.floor(size))
    if (next === internal.pageSize) return
    internal.pageSize = next
    internal.page = 1
  }

  function setSearch(search: string): void {
    internal.globalSearch = search
    internal.page = 1
  }

  function reset(): void {
    Object.assign(internal, createQueryState(options))
    clientGroupBy.value = groupMode.value === 'client' ? [...(options.initialGroupBy ?? [])] : []
    if (groupMode.value === 'client') internal.groupBy = []
  }

  return {
    query,
    sort,
    filters,
    groupBy,
    groupMode,
    page,
    pageSize,
    globalSearch,
    toggleSort,
    setSort,
    clearSort,
    sortFor,
    sortIndexFor,
    setFilter,
    clearFilter,
    clearAllFilters,
    filterFor,
    activeFilterIds,
    hasActiveFilters,
    setGroupBy,
    addGroup,
    removeGroup,
    toggleGroup,
    clearGrouping,
    isGrouped,
    groupIndexFor,
    hasGrouping,
    setPage,
    setPageSize,
    setSearch,
    reset,
  }
}
