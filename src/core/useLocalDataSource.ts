import {
  computed,
  onScopeDispose,
  ref,
  toValue,
  watch,
  type ComputedRef,
  type MaybeRefOrGetter,
} from 'vue'
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

export interface LocalDataSourceOptions extends SortOptions {
  /**
   * Coalesces the global search, in milliseconds. Every keystroke otherwise
   * re-filters and re-sorts the entire dataset synchronously, on the input
   * event — at 10k rows that is ~22ms of blocked main thread per character.
   *
   * Only the search is debounced. A filter checkbox or a header click is one
   * deliberate act and must land at once; a delay there reads as a broken
   * table rather than a smooth one.
   *
   * `0` disables it and restores fully synchronous behaviour, which is the
   * right choice for small datasets and for tests that assert on the next line.
   */
  debounceMs?: number
}

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

  /**
   * The search the filter actually runs, trailing the one the user is typing.
   *
   * It lags `searchOf` rather than replacing it, so `QueryState` stays the
   * truthful record of what was asked for — a URL or a store mirroring the
   * query still sees every keystroke — while the dataset is only walked once
   * the typing settles. `useServerDataSource` coalesces its fetches the same
   * way and for the same reason.
   */
  const debounceMs = options.debounceMs ?? 150
  const settledSearch = ref(searchOf.value)
  let searchTimer: ReturnType<typeof setTimeout> | undefined

  watch(
    searchOf,
    (next) => {
      if (searchTimer !== undefined) clearTimeout(searchTimer)
      searchTimer = undefined
      // Clearing the box restores every row, and nobody waits to be given back
      // what they already had. Emptying is also the one search change that can
      // only ever widen the result, so nothing flashes.
      if (debounceMs <= 0 || next === '') {
        settledSearch.value = next
        return
      }
      searchTimer = setTimeout(() => {
        searchTimer = undefined
        settledSearch.value = next
      }, debounceMs)
    },
    // Synchronous, so `debounceMs: 0` is genuinely indistinguishable from
    // having no debounce at all rather than merely a shorter one.
    { flush: 'sync' },
  )

  onScopeDispose(() => {
    if (searchTimer !== undefined) clearTimeout(searchTimer)
  })

  const filtered = computed<TRow[]>(() => {
    void revision.value
    return filterRows(allRows.value, allColumns.value, {
      filters: filtersOf.value,
      globalSearch: settledSearch.value,
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
    // The settled term, not the typed one: a checklist counting rows the table
    // is not showing yet would contradict what is on screen.
    return computeFacets(allRows.value, allColumns.value, column, {
      filters: filtersOf.value,
      globalSearch: settledSearch.value,
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
