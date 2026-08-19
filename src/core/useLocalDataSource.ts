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

/** One shared empty grouping, so an absent `groupBy` is a stable reference. */
const NO_GROUPS: string[] = []

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
 *
 * The stages depend on the *fields* of the query rather than on the query
 * object, and that is load-bearing rather than stylistic. `useTableState`
 * builds a fresh query object on every write, page changes included, so a stage
 * reading the object would re-run whenever anything at all moved — which is
 * exactly the promise in the paragraph above, broken. The narrow computeds
 * below recompute just as often, but a computed returning the same reference
 * does not propagate, so a page change stops there instead of reaching the
 * filter.
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

  /* The query, one field at a time — see the note above the function. */
  const filtersOf = computed(() => currentQuery.value.filters)
  const searchOf = computed(() => currentQuery.value.globalSearch)
  const sortOf = computed(() => currentQuery.value.sort)
  // The shared empty array matters: `?? []` would mint a new one per read and
  // hand every downstream stage a fresh identity to react to.
  const groupByOf = computed(() => currentQuery.value.groupBy ?? NO_GROUPS)
  const pageOf = computed(() => currentQuery.value.page)
  const pageSizeOf = computed(() => currentQuery.value.pageSize)

  // Bumping this re-runs the pipeline for callers holding a mutable array
  // that Vue cannot see through (e.g. rows pushed in place).
  const revision = ref(0)

  const filtered = computed<TRow[]>(() => {
    void revision.value
    return filterRows(allRows.value, allColumns.value, {
      filters: filtersOf.value,
      globalSearch: searchOf.value,
    })
  })

  /**
   * Grouped columns sort first, ahead of whatever the user sorted by. Without
   * that, rows sharing a group value are scattered across the dataset and the
   * page slice hands the grouper interleaved runs rather than whole buckets.
   *
   * `groupedSort` mints a new array per call, so this must recompute only when
   * the sort or the grouping genuinely changes — which, reading the two narrow
   * refs rather than the query, is what it now does.
   */
  const effectiveSort = computed(() => groupedSort(sortOf.value, groupByOf.value))

  const sorted = computed<TRow[]>(() =>
    sortRows(filtered.value, effectiveSort.value, allColumns.value, options),
  )

  const total = computed(() => filtered.value.length)

  const rows = computed<TRow[]>(() => {
    const size = Math.max(1, pageSizeOf.value)
    // Guard against a page index left over from a larger result set.
    const lastPage = Math.max(1, Math.ceil(sorted.value.length / size))
    const page = Math.min(Math.max(1, pageOf.value), lastPage)
    const start = (page - 1) * size
    return sorted.value.slice(start, start + size)
  })

  function facetsSync(columnId: string): FacetValue[] {
    const column = allColumns.value.find((entry) => entry.id === columnId)
    if (!column) return []
    return computeFacets(allRows.value, allColumns.value, column, {
      filters: filtersOf.value,
      globalSearch: searchOf.value,
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
