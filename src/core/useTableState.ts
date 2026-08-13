import { computed, reactive, toRaw, toRefs, watch, type ComputedRef, type Ref } from 'vue'
import type {
  ColumnFilter,
  QueryState,
  SortDirection,
  SortRule,
} from './types'
import { applySortRule, nextDirection } from './sorting'
import { isEmptyFilter, pruneFilters } from './filters/model'

export interface TableStateOptions {
  initialSort?: SortRule[]
  initialFilters?: Record<string, ColumnFilter>
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

  setPage: (page: number) => void
  setPageSize: (size: number) => void
  setSearch: (search: string) => void
  reset: () => void
}

export function createQueryState(options: TableStateOptions = {}): QueryState {
  return {
    sort: options.initialSort ? [...options.initialSort] : [],
    filters: options.initialFilters ? { ...options.initialFilters } : {},
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

  const query = computed<QueryState>(() => ({
    sort: internal.sort,
    filters: internal.filters,
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
  }

  return {
    query,
    sort,
    filters,
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
    setPage,
    setPageSize,
    setSearch,
    reset,
  }
}
