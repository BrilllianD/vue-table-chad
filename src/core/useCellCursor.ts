import {
  computed,
  shallowRef,
  toValue,
  type ComputedRef,
  type MaybeRefOrGetter,
  type ShallowRef,
} from 'vue'
import type { ColumnDef, RowId } from './types'
import { nextPosition, type CellPosition, type CursorMove } from './cellCursor'
import { defaultRowId } from './useRowSelection'

/** Row identity, the columns to walk, and where to start. */
export interface UseCellCursorOptions<TRow> {
  /** Stable identity for a row. Defaults to `row.id`. */
  getRowId?: (row: TRow) => RowId
  /**
   * Where the cursor sits before anyone touches it. Seeded silently — it asks
   * for no focus, so a table does not steal the caret from the page it is on
   * merely by mounting.
   */
  initial?: CellPosition
}

/** Cursor position, predicates, and the movers. */
export interface UseCellCursor<TRow> {
  /** Where the cursor is, or `null` before anything has put it anywhere. */
  position: Readonly<ShallowRef<CellPosition | null>>
  rowId: ComputedRef<RowId | undefined>
  columnId: ComputedRef<string | undefined>
  /**
   * The cell that carries `tabindex="0"`: the cursor, or the first rendered
   * cell when there is no cursor yet.
   *
   * A roving tabindex needs exactly one way in. With every cell at `-1` a table
   * that nobody has clicked is skipped by Tab entirely, so an unset cursor
   * still has to nominate a cell — it simply does not draw a ring on it.
   */
  tabStop: ComputedRef<CellPosition | null>
  /**
   * Bumped whenever the cursor moved because a *person* moved it.
   *
   * A component watches this to move the DOM focus, and it exists because the
   * position alone cannot say who moved it. A table that focused on every
   * position change would grab the caret on mount, and again every time a
   * re-sort shuffled the cursor's row while the user was typing elsewhere.
   */
  focusRequests: Readonly<ShallowRef<number>>

  isCursor: (rowId: RowId, columnId: string) => boolean
  isCursorRow: (rowId: RowId) => boolean
  isCursorColumn: (columnId: string) => boolean

  /** Applies a move against the rendered cells. Returns whether it landed somewhere new. */
  move: (move: CursorMove) => boolean
  /** Puts the cursor somewhere outright. Silent unless asked to take focus. */
  moveTo: (position: CellPosition | null, options?: { focus?: boolean }) => void
  /** Asks for the focus back without moving — what Escape in an editor needs. */
  requestFocus: () => void
  clear: () => void
  /**
   * The rendered row whose id stringifies to `key`, or `undefined`.
   *
   * The DOM only ever holds strings, so a `data-row-id` read back off a clicked
   * cell is `"7"`, never `7`. Matching against the ids already on screen is the
   * only safe way back: parsing would turn the id `'007'` into `7`, and a uuid
   * into `NaN`.
   */
  rowIdFor: (key: string) => RowId | undefined
  getRowId: (row: TRow) => RowId
}

/**
 * A focused cell you can move with the keyboard, and the highlight that follows
 * it.
 *
 * The position is a pair of identities rather than a pair of indices, which is
 * what lets it survive a re-sort, a re-filter or a page change — the row moves
 * and the cursor goes with it. `useRowEditing` keys its drafts the same way and
 * for the same reason.
 *
 * Nothing here touches the data pipeline, and nothing here touches the DOM.
 * Moving the cursor writes one `shallowRef` and reads two arrays that are
 * already page-sized, so `filterRows`, `sortRows` and the aggregates never hear
 * about it; focus is a component's job, because `core/` has no document.
 *
 * It knows nothing about editing either. A cursor is useful on a read-only
 * table and a table can edit with no cursor, so neither composable imports the
 * other — the preset is where they meet.
 */
export function useCellCursor<TRow>(
  rows: MaybeRefOrGetter<TRow[]>,
  columns: MaybeRefOrGetter<ColumnDef<TRow>[]>,
  options: UseCellCursorOptions<TRow> = {},
): UseCellCursor<TRow> {
  const getRowId = options.getRowId ?? defaultRowId<TRow>

  /**
   * `shallowRef`, not `ref`: every write replaces the whole position object
   * rather than mutating it, so deep reactivity would buy nothing and cost a
   * Proxy on the hottest state in the table.
   */
  const position = shallowRef<CellPosition | null>(options.initial ?? null)
  const focusRequests = shallowRef(0)

  /*
   * The rendered lists, one field at a time.
   *
   * Ids rather than rows and columns because that is all movement needs, and
   * because these are what the components compare against — a re-render that
   * produced the same ids leaves every predicate below answering as before.
   */
  const rowIds = computed(() => (toValue(rows) ?? []).map(getRowId))
  const columnIds = computed(() => (toValue(columns) ?? []).map((column) => column.id))

  /** Stringified ids back to the real ones, for reading a position off the DOM. */
  const rowIdsByKey = computed(() => {
    const map = new Map<string, RowId>()
    for (const id of rowIds.value) map.set(String(id), id)
    return map
  })

  const tabStop = computed<CellPosition | null>(() => {
    const current = position.value
    if (
      current &&
      rowIds.value.includes(current.rowId) &&
      columnIds.value.includes(current.columnId)
    ) {
      return current
    }
    // No cursor, or one pointing at a row that is no longer rendered. Either
    // way the grid still needs a way in, so the first cell nominates itself.
    const firstRow = rowIds.value[0]
    const firstColumn = columnIds.value[0]
    if (firstRow === undefined || firstColumn === undefined) return null
    return { rowId: firstRow, columnId: firstColumn }
  })

  function isCursor(rowId: RowId, columnId: string): boolean {
    const current = position.value
    return current !== null && current.rowId === rowId && current.columnId === columnId
  }

  function isCursorRow(rowId: RowId): boolean {
    return position.value?.rowId === rowId
  }

  function isCursorColumn(columnId: string): boolean {
    return position.value?.columnId === columnId
  }

  function move(next: CursorMove): boolean {
    const landed = nextPosition(position.value, next, rowIds.value, columnIds.value)
    /*
     * The focus request is bumped either way, including for a move that landed
     * nowhere. Holding ArrowDown at the last row must still pull the ring back
     * into view if the user has scrolled away from it — the cursor did not
     * move, but the person did ask to be looking at it.
     */
    focusRequests.value += 1
    if (!landed) return false
    position.value = landed
    return true
  }

  function moveTo(next: CellPosition | null, moveOptions?: { focus?: boolean }): void {
    position.value = next
    // Silent by default. Setting the position from a `focusin` handler must not
    // ask for focus that is already there, or the two chase each other.
    if (moveOptions?.focus) focusRequests.value += 1
  }

  return {
    position,
    rowId: computed(() => position.value?.rowId),
    columnId: computed(() => position.value?.columnId),
    tabStop,
    focusRequests,
    isCursor,
    isCursorRow,
    isCursorColumn,
    move,
    moveTo,
    requestFocus: () => {
      focusRequests.value += 1
    },
    clear: () => {
      position.value = null
    },
    rowIdFor: (key) => rowIdsByKey.value.get(key),
    getRowId,
  }
}
