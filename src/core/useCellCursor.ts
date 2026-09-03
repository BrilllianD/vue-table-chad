import {
  computed,
  effectScope,
  shallowRef,
  toValue,
  watch,
  type ComputedRef,
  type MaybeRefOrGetter,
  type ShallowRef,
  type WatchStopHandle,
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
   *
   * A position names a cell outright. To start at the first rendered cell
   * instead, call `anchorAt(0)` — it waits for a row to exist, which a value
   * read at setup cannot do.
   */
  initial?: CellPosition
  /**
   * Which of the rows are actually in the document, when that is a smaller set
   * than the rows the cursor can address.
   *
   * Read by `tabStop` and by nothing else. A virtualized body renders a window
   * — the cursor still walks every row, because a position is an identity and
   * scrolling does not change which row it names, but the cell carrying
   * `tabindex="0"` has to be one a Tab can actually reach. Without this the
   * grid drops out of the tab order entirely whenever the ring is scrolled out
   * of view, which is the opposite of what a roving tabindex is for.
   *
   * Omitted — the ordinary case — every addressable row is a rendered one.
   */
  renderedRowIds?: MaybeRefOrGetter<RowId[] | undefined>
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

  /**
   * How far down the rendered rows the cursor is, or `-1` when it is on none
   * of them — unset, or on a row this page does not hold.
   *
   * An offset is the one thing about a cursor position that survives the rows
   * underneath it being replaced wholesale, which is what turning the page
   * does. Everywhere else the identity is what matters and the index is the
   * meaningless half; this is the exception, so it is offered rather than
   * recomputed by every caller that needs it.
   */
  rowOffset: ComputedRef<number>

  /** Applies a move against the rendered cells. Returns whether it landed somewhere new. */
  move: (move: CursorMove) => boolean
  /** Puts the cursor somewhere outright. Silent unless asked to take focus. */
  moveTo: (position: CellPosition | null, options?: { focus?: boolean }) => void
  /**
   * Puts the cursor at an offset down the rendered rows — as soon as there are
   * rows to count. Without a `columnId` it takes the first rendered column, so
   * `anchorAt(0)` is "start at the first cell, whenever there is one".
   *
   * The waiting is the point, and it is why this is a call rather than a value
   * anyone could compute. A page change replaces the rendered rows and a server
   * source has not fetched the replacements yet, so the offset cannot be
   * resolved in the tick the page was asked for; a table still loading its
   * first page cannot name its first cell either. Resolving when the rows
   * arrive makes both of those, and a local source that answers immediately,
   * the same call.
   *
   * Clamped, so the last page being short lands on its last row rather than
   * nowhere.
   *
   * `replacing` is what makes the waiting correct rather than merely present.
   * "Are there rows" and "have the new rows arrived" are the same question only
   * for a source that swaps them synchronously; a remote one keeps rendering
   * the outgoing page for the whole flight, and answers the first question
   * "yes" with the very page the caller is turning away from. Naming that list
   * says which rows do not count as an answer. Omit it and any rows will do,
   * which is what a first-load `anchorAt(0)` wants.
   */
  anchorAt: (
    offset: number,
    columnId?: string,
    options?: { focus?: boolean; replacing?: readonly RowId[] },
  ) => void
  /**
   * Drops an anchor that is still waiting, without moving the cursor.
   *
   * A page whose fetch never lands leaves one armed, and the next rows to
   * arrive need not be that page's — a new filter or search produces rows too.
   * Letting the stale anchor resolve there would move the ring for a page turn
   * the user has already abandoned, and take the caret with it.
   */
  cancelAnchor: () => void
  /** Asks for the focus back without moving — what Escape in an editor needs. */
  requestFocus: () => void
  clear: () => void
  /**
   * The ids of the rows the cursor is currently walking, in render order.
   *
   * Offered so a caller about to replace them can name the list it is
   * replacing — see `anchorAt`'s `replacing`. This is the *display* list:
   * page-sized, grouped, with the columns and rows a folded band withholds
   * already gone. A data source's own `rows` is a different list.
   */
  rowIds: ComputedRef<readonly RowId[]>
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
 * Whether two rendered-row lists are the same page.
 *
 * Element-wise rather than by array identity: `rowIds` is a computed rebuilt on
 * every pipeline pass, so a re-sort that happened to produce the same order
 * would hand back a fresh array and an identity check would call it a new page.
 * Page-sized lists of primitives, so the walk is cheap and the early-out on
 * length covers the common case.
 */
function sameIds(a: readonly RowId[], b: readonly RowId[]): boolean {
  if (a.length !== b.length) return false
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) return false
  }
  return true
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
  const rowIds = computed<readonly RowId[]>(() => (toValue(rows) ?? []).map(getRowId))
  const columnIds = computed<readonly string[]>(() =>
    (toValue(columns) ?? []).map((column) => column.id),
  )

  /** Stringified ids back to the real ones, for reading a position off the DOM. */
  const rowIdsByKey = computed(() => {
    const map = new Map<string, RowId>()
    for (const id of rowIds.value) map.set(String(id), id)
    return map
  })

  /**
   * The rows a Tab can land on. The addressable ones unless a caller has said
   * otherwise — see `renderedRowIds`.
   */
  const tabbableRowIds = computed<readonly RowId[]>(
    () => toValue(options.renderedRowIds) ?? rowIds.value,
  )

  const tabStop = computed<CellPosition | null>(() => {
    const current = position.value
    if (
      current &&
      tabbableRowIds.value.includes(current.rowId) &&
      columnIds.value.includes(current.columnId)
    ) {
      return current
    }
    // No cursor, or one pointing at a row that is not in the document — off
    // this page, or outside a virtual window. Either way the grid still needs
    // a way in, so the first rendered cell nominates itself.
    const firstRow = tabbableRowIds.value[0]
    const firstColumn = columnIds.value[0]
    if (firstRow === undefined || firstColumn === undefined) return null
    return { rowId: firstRow, columnId: firstColumn }
  })

  /**
   * A position asked for by where it sits rather than by what it is, resolved
   * against the rendered lists — now, or on the first render that has any.
   *
   * A cell named by offset can be asked for at a moment when the table holds
   * no rows: because the source is still fetching its first page, or because
   * it has just been asked for its third. A source that answers synchronously
   * and one that answers over the network are then the same call from here,
   * which is the reason this waits rather than each caller doing it.
   *
   * One-shot, and a second request replaces the first: two answers to "where
   * should the cursor be" both landing would move it twice, and the older one
   * would win the race about half the time.
   */
  let pending: WatchStopHandle | undefined
  /*
   * Watchers created on demand belong to a scope of their own, so they stop
   * with the table rather than with whichever event handler happened to create
   * one. Not detached, so a component disposes it without being asked — and
   * never created at all by a table whose cursor resolves on the first try,
   * which is every table with rows already in hand.
   */
  const scope = effectScope()

  function resolveWhenRendered(
    resolve: (rowIds: readonly RowId[], columnIds: readonly string[]) => CellPosition | undefined,
    focus: boolean,
    replacing: readonly RowId[] | undefined,
  ): void {
    pending?.()
    pending = undefined

    /*
     * Rows the caller has already declared stale are not an answer. A remote
     * source keeps the outgoing page rendered for the whole fetch, so without
     * this the anchor resolves against the page being turned away from, moves
     * the ring there, and loses it again the moment the real page lands.
     */
    const arrived = (ids: readonly RowId[]): boolean =>
      replacing === undefined || !sameIds(ids, replacing)

    const landed = arrived(rowIds.value) ? resolve(rowIds.value, columnIds.value) : undefined
    if (landed) {
      moveTo(landed, { focus })
      return
    }

    /*
     * `flush: 'sync'`, so the cursor is in place in the same tick the rows are.
     * A queued watcher would let the new page render once with rows and no
     * ring, and the caller's own follow-up — a focus request, a scroll into
     * view — would be reading a position that has not been written yet.
     *
     * Sync is affordable precisely because this is one-shot: it stops itself
     * the moment it resolves, so there is never more than one of these
     * listening, and never one at all on a table that resolved on the first
     * try.
     */
    pending = scope.run(() =>
      watch(
        [rowIds, columnIds],
        ([rows, cols]) => {
          const next = arrived(rows) ? resolve(rows, cols) : undefined
          if (!next) return
          pending?.()
          pending = undefined
          moveTo(next, { focus })
        },
        { flush: 'sync' },
      ),
    )
  }

  function anchorAt(
    offset: number,
    columnId?: string,
    anchorOptions?: { focus?: boolean; replacing?: readonly RowId[] },
  ): void {
    resolveWhenRendered((rows, cols) => {
      if (rows.length === 0) return undefined
      // The column is named rather than offset because turning the page
      // changes which rows are rendered, never which columns are — and when it
      // has gone anyway, or was never given, the first column stands in. That
      // is the same re-anchoring `nextPosition` does for an axis it cannot
      // find, so a hidden column and a folded band behave here as they do
      // everywhere else.
      const column = columnId !== undefined && cols.includes(columnId) ? columnId : cols[0]
      if (column === undefined) return undefined
      const index = Math.min(Math.max(offset, 0), rows.length - 1)
      return { rowId: rows[index]!, columnId: column }
    }, anchorOptions?.focus ?? false, anchorOptions?.replacing)
  }

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
    rowOffset: computed(() => {
      const current = position.value
      return current ? rowIds.value.indexOf(current.rowId) : -1
    }),
    isCursor,
    isCursorRow,
    isCursorColumn,
    move,
    moveTo,
    anchorAt,
    cancelAnchor: () => {
      pending?.()
      pending = undefined
    },
    rowIds,
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
