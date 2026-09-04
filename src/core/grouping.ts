import type {
  AggregateResult,
  ColumnDef,
  DisplayRow,
  FilterValue,
  RowGroup,
  SortRule,
} from './types'
import { DEFAULT_LABELS } from './labels'
import { readValue } from './sorting'
import { facetKey, toFilterValue } from './utils/values'

/**
 * Row grouping, as pure functions over an array of rows.
 *
 * Grouping deliberately does NOT re-page or re-filter anything: it takes the
 * rows a data source already handed over and buckets them. That is what keeps
 * a local and a server source interchangeable here — the piece that makes the
 * buckets contiguous in the first place is `groupedSort`, which every source
 * can honour because it is expressed as ordinary sort rules.
 */

/** Separator for path keys — a control character cannot occur in `facetKey`. */
const KEY_SEPARATOR = '\u001F'

/**
 * What a blank group is called when the column says nothing better.
 *
 * An alias onto the label record, so a table that translates its labels and a
 * caller that imports this constant read the same word.
 */
export const BLANK_GROUP_LABEL = DEFAULT_LABELS.blankGroup

/**
 * The key an empty group path produces — `groupPathKey([])` — and so the key
 * anything covering the whole set rather than one band is filed under.
 *
 * Named rather than written as `''` at each use, so that "the root is the empty
 * path" is a contract instead of a coincidence two modules happen to share.
 */
export const ROOT_GROUP_KEY = ''

/**
 * The bucket a row falls into for one column, with every flavour of blank
 * collapsed into one.
 *
 * `toFilterValue` does the collapsing, so `null`, `undefined` and `''` land in
 * one group rather than three.
 */
export function groupValueOf<TRow>(row: TRow, column: ColumnDef<TRow>): FilterValue {
  if (column.groupValue) return column.groupValue(row)
  return toFilterValue(readValue(row, column), column.type)
}

/**
 * Stable identity for a band, built from every level above it.
 *
 * Two groups at different depths, or under different parents, can never
 * collide — which matters because collapse state is nothing but a set of these.
 */
export function groupPathKey(path: readonly FilterValue[]): string {
  return path.map(facetKey).join(KEY_SEPARATOR)
}

/**
 * The sort a grouped table actually needs: the grouped columns first, in
 * grouping order, then whatever the user sorted by.
 *
 * Without this, rows sharing a group value are scattered through the page and
 * a group is split into as many headers as it has runs. Existing sort rules on
 * a grouped column keep their direction — clicking a grouped header to flip it
 * must still flip the order the groups come out in.
 */
export function groupedSort(sort: readonly SortRule[], groupBy: readonly string[]): SortRule[] {
  if (groupBy.length === 0) return sort.slice()
  return [
    ...groupSortRules(sort, groupBy),
    ...sort.filter((rule) => !groupBy.includes(rule.columnId)),
  ]
}

/**
 * Just the leading part of `groupedSort` — one rule per grouped column, in
 * grouping order, carrying whatever direction that column was sorted by.
 *
 * Sorting by these *alone* gathers rows into bands while leaving the order
 * inside each band exactly as it arrived. That is what client-side grouping
 * needs: it must not re-apply the user's sort keys over rows a source has
 * already ordered, because a server's collation is not reproducible here and
 * redoing it would shuffle rows within a page.
 */
export function groupSortRules(
  sort: readonly SortRule[],
  groupBy: readonly string[],
): SortRule[] {
  return groupBy.map<SortRule>((columnId) => ({
    columnId,
    direction: sort.find((rule) => rule.columnId === columnId)?.direction ?? 'asc',
  }))
}

function labelFor<TRow>(
  column: ColumnDef<TRow>,
  value: FilterValue,
  firstRow: TRow,
  blankLabel: string,
): string {
  if (column.groupLabel) return column.groupLabel(value)
  if (value === null) return blankLabel
  // `format` is skipped when `groupValue` is overridden: the bucket is then no
  // longer the cell, so formatting a member row would describe the wrong thing
  // (a month group labelled with one day inside it). Pair the two overrides.
  if (column.format && !column.groupValue) {
    return column.format(readValue(firstRow, column), firstRow)
  }
  return String(value)
}

/** Collapse predicate, supplied totals and aggregates, and the blank label. */
export interface GroupingOptions<TRow = Record<string, unknown>> {
  /** Group keys the user has folded shut. Their rows and subgroups are skipped. */
  isCollapsed?: (key: string) => boolean
  /** True per-group totals across the full dataset, from `DataSource.groupCounts`. */
  totals?: Map<string, number>
  /**
   * Per-group aggregates across the full dataset, from
   * `DataSource.groupAggregates`. Takes precedence over `computeAggregates`.
   */
  aggregates?: Map<string, Record<string, AggregateResult<TRow>>>
  /**
   * Aggregates a band's own rows, for every band `aggregates` does not cover.
   *
   * Injected rather than imported: aggregation needs `groupPathKey` from this
   * module, and reaching back for the aggregator would close a cycle whose
   * evaluation order decides whether a `const` is still in its temporal dead
   * zone. `useRowGrouping` supplies it.
   */
  computeAggregates?: (rows: readonly TRow[]) => Record<string, AggregateResult<TRow>>
  /** Header text for the blank bucket. Defaults to `"Blank"`. */
  blankLabel?: string
}

/**
 * Buckets rows one level deep, preserving both row order inside a bucket and
 * first-appearance order between buckets. Applied to rows already ordered by
 * `groupedSort`, "first appearance" is the sorted order — but bucketing rather
 * than run-detecting means unsorted input still yields one group per value
 * instead of one per run.
 */
function bucket<TRow>(
  rows: readonly TRow[],
  column: ColumnDef<TRow>,
): { value: FilterValue; rows: TRow[] }[] {
  const buckets = new Map<string, { value: FilterValue; rows: TRow[] }>()
  for (const row of rows) {
    const value = groupValueOf(row, column)
    const key = facetKey(value)
    const existing = buckets.get(key)
    if (existing) existing.rows.push(row)
    else buckets.set(key, { value, rows: [row] })
  }
  return [...buckets.values()]
}

/** One node of the tree: a band, and the bands nested inside it. */
export interface GroupNode<TRow = Record<string, unknown>> {
  group: RowGroup<TRow>
  /** Subgroups, empty at the innermost grouped level. */
  children: GroupNode<TRow>[]
}

/**
 * The grouping, before anything is folded shut.
 *
 * This exists so that collapsing a band is not a reason to rebuild it. The tree
 * depends on the rows, the grouping and the columns; the collapse state does
 * not appear in it at all, which is what lets a caller keep one tree across
 * many toggles and pay only for the walk (see `useRowGrouping`).
 */
export interface GroupTree<TRow = Record<string, unknown>> {
  /** Top-level bands. Empty when nothing is grouped. */
  nodes: GroupNode<TRow>[]
  /** The rows the tree was built from, in the order they arrived. */
  rows: readonly TRow[]
  /**
   * Each row's position in `rows`, resolved once. First occurrence wins: a row
   * object appearing twice would otherwise report the parity of its last copy.
   */
  indexOf: Map<TRow, number>
  /** How many levels the grouping goes; `0` when nothing is grouped. */
  depth: number
}

/** Everything `flattenGroups` takes except the part that folds bands shut. */
export type GroupTreeOptions<TRow = Record<string, unknown>> = Omit<
  GroupingOptions<TRow>,
  'isCollapsed'
>

/**
 * Builds the group tree: buckets the rows level by level and resolves each
 * band's label, count and aggregates.
 *
 * This is the expensive half of grouping, and the half that has nothing to do
 * with what the user has folded shut.
 */
export function buildGroupTree<TRow>(
  rows: readonly TRow[],
  groupBy: readonly string[],
  columns: readonly ColumnDef<TRow>[],
  options: GroupTreeOptions<TRow> = {},
): GroupTree<TRow> {
  const byId = new Map(columns.map((column) => [column.id, column]))
  // Grouping by a column that is not declared (or was removed) is ignored
  // rather than fatal — a stale `groupBy` from a URL must not break the table.
  const levels = groupBy
    .map((id) => byId.get(id))
    .filter((column): column is ColumnDef<TRow> => column !== undefined)

  if (levels.length === 0) {
    // No map: the ungrouped flatten reads positions straight off the array.
    return { nodes: [], rows, indexOf: new Map(), depth: 0 }
  }

  const blankLabel = options.blankLabel ?? BLANK_GROUP_LABEL
  const indexOf = new Map<TRow, number>()
  rows.forEach((row, index) => {
    if (!indexOf.has(row)) indexOf.set(row, index)
  })

  function build(
    subset: readonly TRow[],
    depth: number,
    path: readonly FilterValue[],
  ): GroupNode<TRow>[] {
    const column = levels[depth]!
    return bucket(subset, column).map((entry) => {
      const nextPath = [...path, entry.value]
      const key = groupPathKey(nextPath)
      const group: RowGroup<TRow> = {
        key,
        columnId: column.id,
        value: entry.value,
        path: nextPath,
        depth,
        label: labelFor(column, entry.value, entry.rows[0]!, blankLabel),
        rows: entry.rows,
        count: entry.rows.length,
        totalCount: options.totals?.get(key) ?? entry.rows.length,
        // A collapsed band keeps its rows — collapse only skips the walk — so
        // its figures survive being folded shut.
        aggregates: options.aggregates?.get(key) ?? options.computeAggregates?.(entry.rows) ?? {},
      }
      return {
        group,
        children: depth + 1 < levels.length ? build(entry.rows, depth + 1, nextPath) : [],
      }
    })
  }

  return { nodes: build(rows, 0, []), rows, indexOf, depth: levels.length }
}

/**
 * The cheap half: walks a built tree under the current collapse state.
 *
 * Produces the list a `<tbody>` renders, skipping the contents of whatever is
 * folded shut. It allocates the output and nothing else, which is the point of
 * having built the tree separately.
 */
export function flattenTree<TRow>(
  tree: GroupTree<TRow>,
  isCollapsed?: (key: string) => boolean,
): DisplayRow<TRow>[] {
  if (tree.depth === 0) {
    return tree.rows.map((row, index) => ({ kind: 'row', row, index, depth: 0 }))
  }

  const out: DisplayRow<TRow>[] = []

  function walk(nodes: readonly GroupNode<TRow>[]): void {
    for (const node of nodes) {
      out.push({ kind: 'group', group: node.group })
      if (isCollapsed?.(node.group.key)) continue
      if (node.children.length > 0) {
        walk(node.children)
        continue
      }
      for (const row of node.group.rows) {
        out.push({ kind: 'row', row, index: tree.indexOf.get(row) ?? 0, depth: tree.depth })
      }
    }
  }

  walk(tree.nodes)
  return out
}

/**
 * Build and walk in one call, for callers doing it once.
 *
 * The output is the list a `<tbody>` renders: a group header, then its
 * contents, recursively. With no grouping it is the rows themselves, so a
 * caller can render `displayRows` unconditionally.
 *
 * `index` on a leaf is its position in the *input* array, not in the output —
 * so it stays a usable stripe parity no matter how many headers interleave.
 *
 * A caller that folds bands open and shut should hold a `buildGroupTree`
 * result and call `flattenTree` on each toggle instead.
 */
export function flattenGroups<TRow>(
  rows: readonly TRow[],
  groupBy: readonly string[],
  columns: readonly ColumnDef<TRow>[],
  options: GroupingOptions<TRow> = {},
): DisplayRow<TRow>[] {
  return flattenTree(buildGroupTree(rows, groupBy, columns, options), options.isCollapsed)
}

/**
 * Every group key at every depth, ignoring collapse — what "collapse all"
 * needs.
 *
 * Including keys currently nested inside an already-collapsed parent: those
 * are exactly the ones "collapse all" is about to hide.
 */
export function groupKeys<TRow>(
  rows: readonly TRow[],
  groupBy: readonly string[],
  columns: readonly ColumnDef<TRow>[],
): string[] {
  const keys: string[] = []
  for (const item of flattenGroups(rows, groupBy, columns)) {
    if (item.kind === 'group') keys.push(item.group.key)
  }
  return keys
}

/**
 * Rows per group key, at every depth. Run over a full dataset it gives group
 * headers a count that does not shrink to whatever fits on the current page.
 */
export function countGroups<TRow>(
  rows: readonly TRow[],
  groupBy: readonly string[],
  columns: readonly ColumnDef<TRow>[],
): Map<string, number> {
  const counts = new Map<string, number>()
  const byId = new Map(columns.map((column) => [column.id, column]))
  const levels = groupBy
    .map((id) => byId.get(id))
    .filter((column): column is ColumnDef<TRow> => column !== undefined)
  if (levels.length === 0) return counts

  // A tally over each row's own path rather than a recursive re-bucketing:
  // this runs over the whole dataset, which may be far larger than a page.
  for (const row of rows) {
    const path: FilterValue[] = []
    for (const column of levels) {
      path.push(groupValueOf(row, column))
      const key = groupPathKey(path)
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
  }
  return counts
}

/**
 * Every group key produced by one grouped column, from an already built tree.
 *
 * The keys at a single grouping *level* — what folding one column's bands shut
 * needs, as against `groupKeys`, which is every level at once. It takes a tree
 * rather than rows because the caller folding bands already holds one, and
 * rebuilding it to answer a question about collapse state is exactly the cost
 * `buildGroupTree` and `flattenTree` were split apart to avoid.
 *
 * Collapse state does not enter into it: a band nested inside a folded parent
 * is still one of the bands this column produced.
 */
export function groupKeysOf<TRow>(tree: GroupTree<TRow>, columnId: string): string[] {
  const keys: string[] = []

  function walk(nodes: readonly GroupNode<TRow>[]): void {
    for (const node of nodes) {
      if (node.group.columnId === columnId) {
        keys.push(node.group.key)
        // A column sits at exactly one depth, so nothing below this node can
        // match — the levels are the `groupBy` list, and it holds each id once.
        continue
      }
      walk(node.children)
    }
  }

  walk(tree.nodes)
  return keys
}
