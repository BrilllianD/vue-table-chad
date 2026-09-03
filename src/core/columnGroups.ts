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
 * Which band a fold gesture on one column means, and which way — or
 * `undefined` when the column is under no band a fold could act on.
 *
 * The keyboard's half of folding. A pointer names the band it clicks; a key
 * press names only the cursor's column, so the band has to be derived, and
 * this is the derivation — pure, so `tests/columnGroups.spec.ts` can hold it
 * without a header on screen.
 *
 * Innermost first, and **unfold before fold**: that ordering is what makes one
 * key both gestures. A folded band leaves its `collapseTo` column standing and
 * that column's path still runs through the band, so the press that closed a
 * band lands on the survivor and the next press reopens exactly what the last
 * one closed. Walking for "the innermost collapsible band" instead would fold
 * the *next* band in from a column already folded shut, and the gesture would
 * only ever close things.
 *
 * `isCollapsed` is a callback rather than the collapsed list, so this module
 * keeps knowing nothing about collapse — the split the file header declares,
 * and the one that lets `buildHeaderRows` stay out of the fold's way.
 */
export function foldTargetFor<TRow>(
  column: ColumnDef<TRow> | ResolvedColumn<TRow> | undefined,
  groups: readonly ColumnGroupDef[] | undefined,
  isCollapsed: (groupId: string) => boolean,
): { groupId: string; collapsed: boolean } | undefined {
  if (!column) return undefined
  const path = columnGroupPath(column, groups)

  for (let depth = path.length - 1; depth >= 0; depth -= 1) {
    const group = path[depth]!
    if (isCollapsed(group.id)) return { groupId: group.id, collapsed: false }
  }
  for (let depth = path.length - 1; depth >= 0; depth -= 1) {
    const group = path[depth]!
    // `collapsible: false` is the caller saying this band never folds — from a
    // caret, from a click on the cell, and so from the keyboard too.
    if (group.collapsible !== false) return { groupId: group.id, collapsed: true }
  }
  return undefined
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

/**
 * Where a band's run ends, and how heavy the rule there should be.
 *
 * `depth` is the nesting level of the band that stops at this boundary, so `0`
 * is the outermost one — a hook for drawing an outer boundary heavier than an
 * inner one rather than a number the renderer has to interpret.
 */
export interface BandEdge {
  depth: number
  /** The ending band's `borderColor`, when it declares one. */
  color?: string
  /** The ending band's `borderWidth`, when it declares one. */
  width?: string
}

/**
 * The band boundaries in a row of columns, keyed by the column each one falls
 * to the right of.
 *
 * A boundary is a property of a *position in the visible order*, not of a
 * column, which is why this is a map rather than a field on `ResolvedColumn`:
 * `useColumns().visible` passes unpinned columns through by reference, and
 * writing a positional answer onto them would copy every one of them on every
 * layout change and cost consumers the identity they memoise on.
 *
 * Reading the visible order is also what makes a *split* band come out right.
 * Pinning or dragging one member out cuts a band into several runs; two members
 * that ended up adjacent share a path and produce no boundary between them, so
 * the rule lands where the run really stops rather than where the band was
 * declared to.
 *
 * The last column never gets one — its right edge is the table's own frame,
 * the same reasoning `:not(:last-child)` uses for the body's column separators.
 */
export function columnBandEdges<TRow>(
  columns: readonly ResolvedColumn<TRow>[],
  groups?: readonly ColumnGroupDef[],
): Map<string, BandEdge> {
  const edges = new Map<string, BandEdge>()
  if (columns.length < 2) return edges

  const byId = groupsById(groups)
  // Walked pairwise with the previous path carried forward, so each column's
  // path is built once rather than once as the left of a pair and again as the
  // right of the next.
  let path = pathFrom(columns[0]!.group, byId)

  for (let index = 0; index < columns.length - 1; index += 1) {
    const next = pathFrom(columns[index + 1]!.group, byId)
    const depth = divergenceDepth(path, next)
    if (depth !== undefined) {
      // The band that *stops* here owns the rule. Where none does — an
      // unbanded column with a band starting to its right — the band that
      // begins owns it instead, so the boundary still has somewhere to read
      // an override from.
      const owner = path[depth] ?? next[depth]
      const edge: BandEdge = { depth }
      if (owner?.borderColor) edge.color = owner.borderColor
      if (owner?.borderWidth) edge.width = owner.borderWidth
      edges.set(columns[index]!.id, edge)
    }
    path = next
  }

  return edges
}

/**
 * The shallowest level at which two band paths part company, or `undefined`
 * when they never do.
 *
 * Compared by id at each level rather than by identity: `pathFrom` resolves a
 * fresh def object per call, and two columns naming the same band must still
 * count as being inside it. A prefix relationship counts as a divergence at the
 * shorter length — a column sitting directly under `person` is not in `person`
 * > `identity`, and the boundary between them is real.
 */
function divergenceDepth(
  a: readonly ColumnGroupDef[],
  b: readonly ColumnGroupDef[],
): number | undefined {
  const shared = Math.min(a.length, b.length)
  for (let depth = 0; depth < shared; depth += 1) {
    if (a[depth]!.id !== b[depth]!.id) return depth
  }
  return a.length === b.length ? undefined : shared
}

/**
 * Writes a band edge's overrides into a cell's style object.
 *
 * Custom properties rather than `border-color` and `border-width` directly:
 * the stylesheet keeps ownership of *whether* the rule is drawn at all, so a
 * band naming a colour still disappears when `--vtc-band-border-width` is
 * zeroed, and a caller who has restyled the edge entirely is not overridden by
 * a band def written for the default theme.
 *
 * Shared by the three cell components rather than repeated in each, since a
 * boundary has to look the same in the header, the body and the footer or it
 * stops reading as one line.
 */
export function paintBandEdge(style: Record<string, string>, edge: BandEdge | undefined): void {
  if (!edge) return
  if (edge.color) style['--vtc-band-border-color'] = edge.color
  if (edge.width) style['--vtc-band-border-width'] = edge.width
}
