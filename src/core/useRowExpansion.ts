import { computed, ref, type Ref } from 'vue'
import type { RowId } from './types'
import { defaultRowId } from './useRowSelection'

/** Row identity and the rows that start open. */
export interface UseRowExpansionOptions<TRow> {
  /**
   * Stable identity for a row. Defaults to `row.id` — `defaultRowId`, the same
   * one selection, the cursor and editing use, so a table that supplies it once
   * supplies it to all four.
   */
  getRowId?: (row: TRow) => RowId
  /** Rows whose detail panel starts open. */
  initial?: RowId[]
}

/** The open set, its predicate and its mutators. */
export interface UseRowExpansion<TRow> {
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
  getRowId: (row: TRow) => RowId
}

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
 */
export function useRowExpansion<TRow>(
  options: UseRowExpansionOptions<TRow> = {},
): UseRowExpansion<TRow> {
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

  function toggle(row: TRow, next?: boolean): void {
    const id = getRowId(row)
    const shouldExpand = next ?? !openIds.value.has(id)
    const set = new Set(expanded.value)
    if (shouldExpand) set.add(id)
    else set.delete(id)
    expanded.value = [...set]
  }

  function expandAll(rows: TRow[]): void {
    // One write for the whole set. Looping over `toggle` would reassign the ref
    // once per row, and every detail row downstream would re-walk the list for
    // each of them.
    expanded.value = [...new Set(rows.map(getRowId))]
  }

  function collapseAll(): void {
    expanded.value = []
  }

  return { expanded, isExpanded, toggle, expandAll, collapseAll, getRowId }
}
