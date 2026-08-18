import { computed, ref, toValue, type ComputedRef, type MaybeRefOrGetter } from 'vue'
import type {
  AggregateResult,
  ColumnDef,
  DataSource,
  FacetValue,
  QueryState,
} from './types'
import { computeFacets, filterRows } from './filters/facets'
import { sortRows, type SortOptions } from './sorting'
import { countGroups, groupedSort } from './grouping'
import { aggregateGroups } from './aggregation'

export interface LocalDataSourceOptions extends SortOptions {}

export interface LocalDataSource<TRow> extends DataSource<TRow> {
  /** Rows after filtering and sorting, before the page slice. */
  filteredRows: ComputedRef<TRow[]>
  /** Facets computed synchronously — local data needs no await. */
  facetsSync: (columnId: string) => FacetValue[]
  /** Always present here: a local source holds every row, so it can count them. */
  groupCounts: (groupBy: string[]) => Map<string, number>
  /** Likewise: it can aggregate them, per band and over the whole set. */
  groupAggregates: (groupBy: string[]) => Map<string, Record<string, AggregateResult<TRow>>>
}

/**
 * Client-side pipeline: filter → sort → slice, each stage its own computed so
 * paging does not redo the filter and sorting does not redo the search.
 */
export function useLocalDataSource<TRow>(
  data: MaybeRefOrGetter<TRow[]>,
  columns: MaybeRefOrGetter<ColumnDef<TRow>[]>,
  query: MaybeRefOrGetter<QueryState>,
  options: LocalDataSourceOptions = {},
): LocalDataSource<TRow> {
  const allRows = computed(() => toValue(data) ?? [])
  const allColumns = computed(() => toValue(columns) ?? [])
  const currentQuery = computed(() => toValue(query))

  // Bumping this re-runs the pipeline for callers holding a mutable array
  // that Vue cannot see through (e.g. rows pushed in place).
  const revision = ref(0)

  const filtered = computed<TRow[]>(() => {
    void revision.value
    const q = currentQuery.value
    return filterRows(allRows.value, allColumns.value, {
      filters: q.filters,
      globalSearch: q.globalSearch,
    })
  })

  /**
   * Grouped columns sort first, ahead of whatever the user sorted by. Without
   * that, rows sharing a group value are scattered across the dataset and the
   * page slice hands the grouper interleaved runs rather than whole buckets.
   */
  const effectiveSort = computed(() =>
    groupedSort(currentQuery.value.sort, currentQuery.value.groupBy ?? []),
  )

  const sorted = computed<TRow[]>(() =>
    sortRows(filtered.value, effectiveSort.value, allColumns.value, options),
  )

  const total = computed(() => filtered.value.length)

  const rows = computed<TRow[]>(() => {
    const q = currentQuery.value
    const size = Math.max(1, q.pageSize)
    // Guard against a page index left over from a larger result set.
    const lastPage = Math.max(1, Math.ceil(sorted.value.length / size))
    const page = Math.min(Math.max(1, q.page), lastPage)
    const start = (page - 1) * size
    return sorted.value.slice(start, start + size)
  })

  function facetsSync(columnId: string): FacetValue[] {
    const column = allColumns.value.find((entry) => entry.id === columnId)
    if (!column) return []
    const q = currentQuery.value
    return computeFacets(allRows.value, allColumns.value, column, {
      filters: q.filters,
      globalSearch: q.globalSearch,
    })
  }

  /**
   * Counts over the full filtered set, not the page — so a group straddling a
   * page boundary still reports how many rows it really holds.
   */
  function groupCounts(groupBy: string[]): Map<string, number> {
    return countGroups(filtered.value, groupBy, allColumns.value)
  }

  /** Same set as `groupCounts`, for the same reason: the page is not the group. */
  function groupAggregates(
    groupBy: string[],
  ): Map<string, Record<string, AggregateResult<TRow>>> {
    return aggregateGroups(filtered.value, groupBy, allColumns.value)
  }

  return {
    rows,
    total,
    loading: computed(() => false),
    error: computed(() => null),
    refresh: () => {
      revision.value += 1
    },
    facets: (columnId: string) => Promise.resolve(facetsSync(columnId)),
    facetsSync,
    groupCounts,
    groupAggregates,
    filteredRows: sorted,
    remote: false,
  }
}
