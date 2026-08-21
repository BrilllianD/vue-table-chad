/**
 * Header bands: the model for a multi-row `<thead>`, and the pure function that
 * shapes one.
 *
 * A band is declared flatly — `ColumnDef.group` names one by id — because every
 * other consumer in the library indexes columns by id and walks a flat array.
 * Nesting the defs would have meant flattening them again in `filterRows`,
 * `sortRows`, `buildGroupTree`, `columnStorage` and `useColumnDnd`, which is
 * five places to get it wrong for one place it reads nicer.
 *
 * This module knows nothing about *collapse*. By the time `buildHeaderRows` is
 * called, a folded band has already removed its own columns from the list it is
 * handed, so the builder only ever describes the columns in front of it. That
 * is the same split `buildGroupTree` / `flattenTree` draws for row bands, and
 * for the same reason: folding must not be a reason to rebuild.
 */

import type {
  ColumnDef,
  ColumnGroupDef,
  HeaderGroupCell,
  HeaderRow,
  PinSide,
  ResolvedColumn,
} from './types'

/**
 * Separator for band path keys — the same control character `groupPathKey`
 * uses, and unusable inside an id for the same reason.
 */
const GROUP_PATH_SEPARATOR = '\u001F'

/** Index the declared bands by id once, for the path walk below. */
function groupsById(groups: readonly ColumnGroupDef[] | undefined): Map<string, ColumnGroupDef> {
  return new Map((groups ?? []).map((group) => [group.id, group]))
}

/**
 * A band as it renders: the declared def with its `header` defaulted.
 *
 * An id nobody declared still resolves, headed by the id itself. A typo then
 * shows up as a visible band with an odd name rather than as a column silently
 * losing its header — declaring `columnGroups` is decoration, not registration.
 */
function resolveGroup(id: string, byId: Map<string, ColumnGroupDef>): ColumnGroupDef {
  const declared = byId.get(id)
  return declared ?? { id }
}

/**
 * The chain of bands above a column, outermost first.
 *
 * Follows `ColumnDef.group` to its def and then up through `parent`, so three
 * header rows cost one more link rather than a different data structure.
 *
 * A `parent` cycle truncates the path instead of hanging: a malformed config
 * should render a strange header, not lock the tab up.
 */
export function columnGroupPath<TRow>(
  column: ColumnDef<TRow> | ResolvedColumn<TRow>,
  groups?: readonly ColumnGroupDef[],
): ColumnGroupDef[] {
  const byId = groupsById(groups)
  return pathFrom(column.group, byId)
}

/**
 * Every column's band path at once, keyed by column id.
 *
 * The same answer `columnGroupPath` gives one column at a time, but indexing
 * the declared bands once instead of once per column — which is the difference
 * between O(columns + bands) and O(columns x bands) for the callers that need
 * the whole set, and all of them do.
 */
export function columnGroupPaths<TRow>(
  columns: readonly (ColumnDef<TRow> | ResolvedColumn<TRow>)[],
  groups?: readonly ColumnGroupDef[],
): Map<string, ColumnGroupDef[]> {
  const byId = groupsById(groups)
  return new Map(columns.map((column) => [column.id, pathFrom(column.group, byId)]))
}

/** The shared walk, so a caller iterating many columns indexes the defs once. */
function pathFrom(
  groupId: string | undefined,
  byId: Map<string, ColumnGroupDef>,
): ColumnGroupDef[] {
  const path: ColumnGroupDef[] = []
  const seen = new Set<string>()

  let current = groupId
  while (current !== undefined && !seen.has(current)) {
    seen.add(current)
    const group = resolveGroup(current, byId)
    // Built leaf-first and reversed at the end: walking `parent` links can only
    // go upwards, and unshifting on every step is quadratic in the depth.
    path.push(group)
    current = group.parent
  }

  return path.reverse()
}

/**
 * Which run of the header a cell belongs to at one depth.
 *
 * The whole prefix is in the key, not just the band at this level, so two
 * bands both called "Detail" under different parents never merge into one
 * spanning cell. The pin side is in it too: `useColumns().visible` hoists
 * pinned columns to the edges, so a band straddling that boundary is already
 * two runs on screen and must be two cells in the markup.
 */
function runKey(path: readonly ColumnGroupDef[], depth: number, pinned: PinSide | false): string {
  const ids = path.slice(0, depth + 1).map((group) => group.id)
  return `${pinned || 'none'}${GROUP_PATH_SEPARATOR}${ids.join(GROUP_PATH_SEPARATOR)}`
}

/**
 * The rows of a multi-row header: one array of cells per `<tr>`, in order.
 *
 * Each column appears exactly once, as a `column` cell in the row matching its
 * band depth, spanning the rows below it so a shallow column still reaches the
 * body. Bands appear as `group` cells spanning the columns beneath them.
 *
 * With no column declaring a `group` this returns a single row of `column`
 * cells with `rowspan: 1` — the markup a single-row header already emits, so
 * a table that uses no bands pays nothing and renders identically.
 */
export function buildHeaderRows<TRow>(
  columns: readonly ResolvedColumn<TRow>[],
  groups?: readonly ColumnGroupDef[],
): HeaderRow<TRow>[] {
  const byId = groupsById(groups)
  const paths = columns.map((column) => pathFrom(column.group, byId))

  let depth = 0
  for (const path of paths) depth = Math.max(depth, path.length)

  const rowCount = depth + 1

  // The flat case, written out rather than left to fall out of the loop below:
  // it is the overwhelmingly common one, and it is the one whose output has to
  // stay byte-identical to what the header rendered before bands existed.
  if (depth === 0) {
    return [
      columns.map((column) => ({
        kind: 'column' as const,
        key: column.id,
        column,
        rowspan: 1,
        depth: 0,
      })),
    ]
  }

  /**
   * How many columns each band covers in total, before any of it is split into
   * separate cells. Counted up front because a cell cannot see its siblings,
   * and whether a band is worth folding is a property of the band.
   */
  const bandWidths = new Map<string, number>()
  for (const path of paths) {
    for (const group of path) {
      bandWidths.set(group.id, (bandWidths.get(group.id) ?? 0) + 1)
    }
  }

  const rows: HeaderRow<TRow>[] = []

  for (let level = 0; level < rowCount; level += 1) {
    const row: HeaderRow<TRow> = []
    let open: HeaderGroupCell<TRow> | undefined
    let openKey = ''

    for (let index = 0; index < columns.length; index += 1) {
      const column = columns[index]!
      const path = paths[index]!

      // A column shallower than this row has already been emitted above, with a
      // rowspan that carries it down through here. Nothing to place.
      if (path.length < level) continue

      if (path.length === level) {
        open = undefined
        row.push({
          kind: 'column',
          key: column.id,
          column,
          // Spans every row from here down, so its bottom edge meets the body
          // whatever the deepest band in the table turned out to be.
          rowspan: rowCount - level,
          depth: level,
        })
        continue
      }

      const key = runKey(path, level, column.pinned)
      if (open && openKey === key) {
        open.colspan += 1
        open.columns.push(column)
        // Right-pinned offsets accumulate from the far edge inwards, so the
        // band's own offset is its *last* member's, not its first.
        if (column.pinned === 'right') open.pinOffset = column.pinOffset
        continue
      }

      open = {
        kind: 'group',
        group: path[level]!,
        // The first column is in the key so that a band split by a reorder or
        // by the pin boundary yields two cells with distinct keys rather than
        // two Vue nodes fighting over one.
        key: `${key}${GROUP_PATH_SEPARATOR}${column.id}`,
        colspan: 1,
        totalColumns: bandWidths.get(path[level]!.id) ?? 1,
        columns: [column],
        pinned: column.pinned,
        pinOffset: column.pinOffset,
        depth: level,
      }
      openKey = key
      row.push(open)
    }

    rows.push(row)
  }

  return rows
}
