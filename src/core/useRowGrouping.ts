import { computed, ref, toValue, type ComputedRef, type MaybeRefOrGetter, type Ref } from 'vue'
import type { ColumnDef, DisplayRow, RowGroup } from './types'
import { flattenGroups } from './grouping'

export interface UseRowGroupingOptions {
  /** Column ids to group by, outermost first. Usually `state.groupBy`. */
  groupBy: MaybeRefOrGetter<string[]>
  /**
   * True per-group counts across the whole filtered dataset. Wire it to
   * `DataSource.groupCounts` — where a source cannot answer, headers fall back
   * to counting the rows they were handed.
   */
  totals?: MaybeRefOrGetter<Map<string, number> | undefined>
  /** Groups that start folded shut. */
  initialCollapsed?: string[]
  /** Fold every group on first sight instead. */
  collapsedByDefault?: boolean
  blankLabel?: string
}

export interface UseRowGrouping<TRow> {
  /** Group headers and rows interleaved, ready to render. */
  displayRows: ComputedRef<DisplayRow<TRow>[]>
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
  options: UseRowGroupingOptions,
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

  const displayRows = computed<DisplayRow<TRow>[]>(() =>
    flattenGroups(allRows.value, groupBy.value, allColumns.value, {
      isCollapsed,
      totals: toValue(options.totals),
      blankLabel: options.blankLabel,
    }),
  )

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
    groups,
    isGrouped,
    collapsed,
    isCollapsed,
    toggle,
    expandAll,
    collapseAll,
  }
}
