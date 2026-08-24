/**
 * Where the keyboard is, as pure functions.
 *
 * `editing.ts` is the write half of a column; this is the navigation half of a
 * table. It answers two questions and holds no state at all: what a key press
 * asked for, and which cell that lands on given the cells currently on screen.
 *
 * Three conventions run through the file:
 *
 *   - **A position is a pair of identities, never a pair of indices.** A row
 *     index is meaningless the moment the table is re-sorted, re-filtered or
 *     paged; a row id survives all three, which is what lets the cursor stay on
 *     the row you put it on while that row moves. `useRowEditing` keys its
 *     drafts the same way and for the same reason.
 *   - **Movement clamps, it does not wrap and it does not page.** Falling off
 *     the bottom of a page into a fetch is a different feature with a different
 *     failure mode (rows that have not arrived yet); the cursor stops instead.
 *   - **A move that changes nothing returns `undefined`.** The caller then
 *     writes no state, so holding ArrowDown at the last row re-renders exactly
 *     zero times.
 */
import type { CellEditorKind, RowId } from './types'

/** Where the cursor is: a row and a column, by identity rather than by position. */
export interface CellPosition {
  rowId: RowId
  columnId: string
}

/**
 * What a key press asked for, before anything knows whether it is possible.
 *
 * Split by kind rather than flattened into a row/column delta pair because the
 * absolute moves genuinely are absolute: `Ctrl+End` means "the last cell",
 * not "however many rows down from here that happens to be", and expressing it
 * as a delta would require knowing the answer to compute the question.
 */
export type CursorMove =
  /** Arrows, PageUp/PageDown, and the Enter family. */
  | { kind: 'by'; rows: number; columns: number }
  /** Home / End — the first or last column of the row the cursor is already in. */
  | { kind: 'columnEdge'; to: 'first' | 'last' }
  /** Ctrl+Home / Ctrl+End — the first or last cell of the whole table. */
  | { kind: 'corner'; to: 'first' | 'last' }

/**
 * The parts of a key press this module reads.
 *
 * Structural rather than `KeyboardEvent`, so the key map can be exercised with
 * a plain object literal. `core/` is meant to be usable with no components and
 * no document, and a table of key bindings is exactly the kind of logic that
 * should not need a DOM to be tested.
 */
export interface CursorKeyGesture {
  key: string
  ctrlKey?: boolean
  metaKey?: boolean
  shiftKey?: boolean
  altKey?: boolean
}

/**
 * How far PageUp and PageDown jump.
 *
 * A fixed count rather than the page size, because the two are unrelated: with
 * `pageSize: 100` and twelve rows visible, a PageDown of 100 would put the
 * cursor somewhere nobody can see, and the scroll-into-view that follows would
 * throw the whole table down the screen.
 */
export const PAGE_MOVE_ROWS = 10

/** Ctrl on Windows and Linux, Cmd on a Mac — the same intent, two keys. */
function isPrimaryModifier(gesture: CursorKeyGesture): boolean {
  return Boolean(gesture.ctrlKey || gesture.metaKey)
}

/**
 * What a key press means while a **cell** has focus, or `undefined` for a key
 * the grid does not claim.
 *
 * Alt is excluded throughout: `Alt` + `←`/`→` is already the keyboard reorder
 * gesture on a header (`TableHeaderCell`), and in the body most browsers spend
 * it on history navigation. Claiming it here would break one or the other.
 */
export function cursorMoveFor(gesture: CursorKeyGesture): CursorMove | undefined {
  if (gesture.altKey) return undefined
  const primary = isPrimaryModifier(gesture)

  switch (gesture.key) {
    case 'ArrowDown':
      return { kind: 'by', rows: 1, columns: 0 }
    case 'ArrowUp':
      return { kind: 'by', rows: -1, columns: 0 }
    case 'ArrowRight':
      return { kind: 'by', rows: 0, columns: 1 }
    case 'ArrowLeft':
      return { kind: 'by', rows: 0, columns: -1 }
    case 'PageDown':
      return { kind: 'by', rows: PAGE_MOVE_ROWS, columns: 0 }
    case 'PageUp':
      return { kind: 'by', rows: -PAGE_MOVE_ROWS, columns: 0 }
    // Bare Home/End stay on this row, as they do in a spreadsheet; with the
    // primary modifier they mean the whole table's first and last cell.
    case 'Home':
      return primary ? { kind: 'corner', to: 'first' } : { kind: 'columnEdge', to: 'first' }
    case 'End':
      return primary ? { kind: 'corner', to: 'last' } : { kind: 'columnEdge', to: 'last' }
    case 'Enter':
      return commitMoveFor(gesture)
    default:
      return undefined
  }
}

/**
 * Where the cursor goes after an Enter that commits an open editor, or
 * `undefined` when this key press is not a commit at all.
 *
 * Every commit gesture carries a direction — Enter means "done, and on to the
 * next one", and which next one is the only thing the modifiers change:
 *
 *   Enter              down
 *   Shift+Enter        up
 *   Ctrl/Cmd+Enter     right
 *   Ctrl/Cmd+Shift+…   left
 *
 * `kind` is honoured for one control only. A `textarea` spends plain Enter on
 * the newline it exists for, so there it takes the primary modifier to commit
 * at all — which leaves Ctrl+Enter as the only gesture a multi-line cell has,
 * and spending it on "right" would leave that cell with no way to commit and
 * move **down**, the direction people actually use. So a textarea reads the
 * modifier as permission rather than as a direction: Ctrl+Enter goes down,
 * Ctrl+Shift+Enter goes up, and it has no sideways gesture.
 */
export function commitMoveFor(
  gesture: CursorKeyGesture,
  kind?: CellEditorKind,
): CursorMove | undefined {
  if (gesture.key !== 'Enter' || gesture.altKey) return undefined
  const primary = isPrimaryModifier(gesture)
  const back = Boolean(gesture.shiftKey)

  if (kind === 'textarea') {
    if (!primary) return undefined
    return { kind: 'by', rows: back ? -1 : 1, columns: 0 }
  }

  if (primary) return { kind: 'by', rows: 0, columns: back ? -1 : 1 }
  return { kind: 'by', rows: back ? -1 : 1, columns: 0 }
}

/** Clamps an index into a list, so a move off either end stops at the edge. */
function clamp(index: number, length: number): number {
  if (index < 0) return 0
  return index > length - 1 ? length - 1 : index
}

/**
 * Where `move` lands, given the cells currently on screen — or `undefined` when
 * it lands nowhere new.
 *
 * `rowIds` and `columnIds` are the **rendered** lists, in rendered order. That
 * is what makes the answer match what the user sees: a grouped table renders
 * its rows in group order rather than the source's page order, and a folded
 * band and a hidden column are simply absent from these lists, so the cursor
 * steps over them without knowing they exist.
 *
 * A `from` naming a row or column that is no longer rendered — filtered away,
 * paged past, hidden — is not an error. That axis re-anchors at the first entry
 * and the delta is dropped, so the first arrow press after a filter puts the
 * cursor somewhere visible instead of somewhere arithmetic.
 */
export function nextPosition(
  from: CellPosition | null,
  move: CursorMove,
  rowIds: readonly RowId[],
  columnIds: readonly string[],
): CellPosition | undefined {
  if (rowIds.length === 0 || columnIds.length === 0) return undefined

  const fromRow = from ? rowIds.indexOf(from.rowId) : -1
  const fromColumn = from ? columnIds.indexOf(from.columnId) : -1

  let rowIndex: number
  let columnIndex: number

  switch (move.kind) {
    case 'corner':
      rowIndex = move.to === 'first' ? 0 : rowIds.length - 1
      columnIndex = move.to === 'first' ? 0 : columnIds.length - 1
      break
    case 'columnEdge':
      // Stays on whatever row the cursor is on, which is the point of the
      // bare Home/End pair — re-anchoring only if that row has gone.
      rowIndex = fromRow === -1 ? 0 : fromRow
      columnIndex = move.to === 'first' ? 0 : columnIds.length - 1
      break
    default:
      // An unanchored axis takes the delta as 0: the first press after the
      // cursor's row was filtered away should land on a visible cell, not
      // one row below where it would have been.
      rowIndex = fromRow === -1 ? 0 : clamp(fromRow + move.rows, rowIds.length)
      columnIndex = fromColumn === -1 ? 0 : clamp(fromColumn + move.columns, columnIds.length)
  }

  const next: CellPosition = { rowId: rowIds[rowIndex]!, columnId: columnIds[columnIndex]! }
  // Compared by value, not by reference: a `from` that resolved to the same
  // cell means the user pressed a key that did nothing, and writing state for
  // it would re-render the page for no visible change.
  if (from && from.rowId === next.rowId && from.columnId === next.columnId) return undefined
  return next
}
