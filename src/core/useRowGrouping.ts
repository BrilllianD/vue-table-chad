import { computed, ref, toValue, type ComputedRef, type MaybeRefOrGetter, type Ref } from 'vue'
import type { AggregateResult, ColumnDef, DisplayRow, RowGroup, SortRule } from './types'
import { ROOT_GROUP_KEY, buildGroupTree, flattenTree, groupSortRules } from './grouping'
import { aggregateRow } from './aggregation'
import { sortRows } from './sorting'

/**
 * What to group by, whole-set totals and aggregates, and the initial collapse
 * state.
 */
export interface UseRowGroupingOptions<TRow = Record<string, unknown>> {
  /** Column ids to group by, outermost first. Usually `state.groupBy`. */
  groupBy: MaybeRefOrGetter<string[]>
  /**
   * The active sort. Only the rules on grouped columns are read, and only to
   * decide which way round the bands come out.
   */
  sort?: MaybeRefOrGetter<SortRule[]>
  /**
   * True per-group counts across the whole filtered dataset. Wire it to
   * `DataSource.groupCounts` — where a source cannot answer, headers fall back
   * to counting the rows they were handed.
   */
  totals?: MaybeRefOrGetter<Map<string, number> | undefined>
  /**
   * True per-group aggregates across the whole filtered dataset. Wire it to
   * `DataSource.groupAggregates` — where a source cannot answer, each band
   * aggregates the rows it was handed.
   */
  aggregates?: MaybeRefOrGetter<
    Map<string, Record<string, AggregateResult<TRow>>> | undefined
  >
  /** Groups that start folded shut. */
  initialCollapsed?: string[]
  /** Fold every group on first sight instead. */
  collapsedByDefault?: boolean
  blankLabel?: string
}

/** displayRows, groups, overall aggregates and the collapse controls. */
export interface UseRowGrouping<TRow> {
  /** Group headers and rows interleaved, ready to render. */
  displayRows: ComputedRef<DisplayRow<TRow>[]>
  /** The rows it was handed, gathered into bands. Leaf order of `displayRows`. */
  orderedRows: ComputedRef<TRow[]>
  /**
   * Aggregates over every row it was handed, ignoring the grouping — what a
   * footer shows. Populated whether or not anything is grouped.
   *
   * A pass over every row, so read it only where a footer is actually rendered:
   * in virtual mode the rows it was handed are the whole dataset.
   */
  overallAggregates: ComputedRef<Record<string, AggregateResult<TRow>>>
  /** Just the group headers, in display order. */
  groups: ComputedRef<RowGroup<TRow>[]>
  isGrouped: ComputedRef<boolean>
  /** Collapsed group keys. Writable, so collapse state can be hoisted or saved. */
  collapsed: Ref<string[]>

  isCollapsed: (key: string) => boolean
  toggle: (key: string, collapsed?: boolean) => void
  expandAll: () => void
  collapseAll: () => void
}

/**
 * Turns a flat page of rows into group headers plus rows, and owns the
 * collapse state.
 *
 * It groups whatever it is given — the current page — rather than the whole
 * dataset, which is what lets it sit above either data source unchanged. For
 * the buckets to be whole rather than scattered, the source must order rows by
 * the grouped columns first; `groupedSort` expresses exactly that as sort
 * rules, and `useLocalDataSource` applies it for you.
 *
 * `collapsedByDefault` is inverted state, not a preset list: a group the user
 * has never seen (page 3, or one that appears after a filter changes) has to
 * follow the default, and a stored list of keys cannot know about it yet.
 */
export function useRowGrouping<TRow>(
  rows: MaybeRefOrGetter<TRow[]>,
  columns: MaybeRefOrGetter<ColumnDef<TRow>[]>,
  options: UseRowGroupingOptions<TRow>,
): UseRowGrouping<TRow> {
  const allRows = computed(() => toValue(rows) ?? [])
  const allColumns = computed(() => toValue(columns) ?? [])
  const groupBy = computed(() => toValue(options.groupBy) ?? [])

  // When `collapsedByDefault` is on, this list holds the *expanded* keys —
  // the exceptions to the default, either way round.
  const collapsed = ref<string[]>([...(options.initialCollapsed ?? [])])
  const inverted = ref(options.collapsedByDefault ?? false)

  function isCollapsed(key: string): boolean {
    return collapsed.value.includes(key) !== inverted.value
  }

  const isGrouped = computed(() => groupBy.value.length > 0)

  /**
   * Rows gathered so each band is one contiguous run, in group-key order.
   *
   * Client-side grouping has no one else to do this: the source handed over a
   * page ordered by the user's sort, in which two rows of the same department
   * may sit ten rows apart. Sorting by the grouped columns *only* leaves the
   * order inside each band untouched, so whatever the source decided — a
   * server's own collation included — still holds row to row.
   *
   * When the source did order by the grouped columns (`groupMode: 'server'`),
   * this is a stable no-op.
   */
  const orderedRows = computed<TRow[]>(() => {
    const ids = groupBy.value
    if (ids.length === 0) return allRows.value
    return sortRows(allRows.value, groupSortRules(toValue(options.sort) ?? [], ids), allColumns.value)
  })

  /** Only the columns that declared one, so the common case costs a filter. */
  const aggregated = computed(() => allColumns.value.filter((column) => column.aggregate))

  /*
   * Both getters are memoized, and `totals` especially so.
   *
   * It resolves to `DataSource.groupCounts`, which walks the entire filtered
   * dataset — far more rows than the page being grouped. Read inline inside
   * `displayRows`, which depends on `collapsed`, that walk ran again every time
   * a user folded a single band shut.
   */
  const suppliedTotals = computed(() => toValue(options.totals))
  const suppliedAggregates = computed(() => toValue(options.aggregates))

  /**
   * The bands themselves. Deliberately free of any dependency on `collapsed`:
   * folding a band shut changes which rows are listed, not which bands exist or
   * what they contain, so it must not cost a rebuild.
   *
   * Ungrouped, neither getter is read at all. `buildGroupTree` returns the rows
   * untouched when there are no levels, so resolving `totals` and `aggregates`
   * to hand it figures it will not look at spent two whole-dataset walks per
   * data change on every table that never grouped anything.
   */
  const tree = computed(() => {
    if (groupBy.value.length === 0) {
      return buildGroupTree(orderedRows.value, groupBy.value, allColumns.value, {
        blankLabel: options.blankLabel,
      })
    }
    return buildGroupTree(orderedRows.value, groupBy.value, allColumns.value, {
      totals: suppliedTotals.value,
      aggregates: suppliedAggregates.value,
      computeAggregates:
        aggregated.value.length > 0
          ? (rows) => aggregateRow(rows, aggregated.value)
          : undefined,
      blankLabel: options.blankLabel,
    })
  })

  /** The cheap half: a walk of the tree above under the current collapse state. */
  const displayRows = computed<DisplayRow<TRow>[]>(() => flattenTree(tree.value, isCollapsed))

  const overallAggregates = computed<Record<string, AggregateResult<TRow>>>(() => {
    if (aggregated.value.length === 0) return {}
    // A source that computed the bands has already computed the whole set too,
    // and its answer covers rows this page never received.
    return suppliedAggregates.value?.get(ROOT_GROUP_KEY) ?? aggregateRow(allRows.value, aggregated.value)
  })

  const groups = computed<RowGroup<TRow>[]>(() => {
    const result: RowGroup<TRow>[] = []
    for (const item of displayRows.value) {
      if (item.kind === 'group') result.push(item.group)
    }
    return result
  })

  function toggle(key: string, next?: boolean): void {
    const shouldCollapse = next ?? !isCollapsed(key)
    // The list means "expanded" under inversion, so membership flips with it.
    const listed = shouldCollapse !== inverted.value
    const set = new Set(collapsed.value)
    if (listed) set.add(key)
    else set.delete(key)
    collapsed.value = [...set]
  }

  function expandAll(): void {
    inverted.value = false
    collapsed.value = []
  }

  function collapseAll(): void {
    inverted.value = true
    collapsed.value = []
  }

  return {
    displayRows,
    orderedRows,
    overallAggregates,
    groups,
    isGrouped,
    collapsed,
    isCollapsed,
    toggle,
    expandAll,
    collapseAll,
  }
}
