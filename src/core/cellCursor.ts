/**
 * Where the keyboard is, as pure functions.
 *
 * `editing.ts` is the write half of a column; this is the navigation half of a
 * table. It answers two questions and holds no state at all: what a key press
 * asked for, and which cell that lands on given the cells currently on screen.
 * There are several decoders for the first question — a position move, a
 * commit, a page turn, a sideways scroll, and the seed a printable key starts
 * an editor with — because those are different things for a caller to do, and
 * flattening them into one return type would only move the branch. They are
 * mutually exclusive over every gesture any of them claims, and
 * `tests/cellCursor.spec.ts` holds them to it.
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
 *     Turning the page is asked for outright — `pageMoveFor` — and even then
 *     nothing here performs it: a page change is the table's business, and
 *     `nextPosition` would be reading a row list its caller was about to
 *     replace.
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
 * How the cursor touches one cell, as a renderer needs to know it.
 *
 *   'cell'    the focused cell — the ring, and the grid's tab stop
 *   'column'  in the cursor's column — the tint
 *   'entry'   no cursor set yet, and this is the way in: the tab stop, no ring
 *   'none'    the table has a cursor, and this cell is nowhere near it
 *
 * One value rather than three booleans because both DOM decisions a cell makes
 * — its `data-cursor` and its place in the roving tabindex — fall out of this
 * one answer, and a cell carrying them separately could contradict itself.
 * `undefined` is the fifth state and means the table has no cursor at all, so
 * the cell emits neither attribute.
 */
export type CellCursorMark = 'cell' | 'column' | 'entry' | 'none'

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
 * `Alt` + `↑`/`↓` is neither, and `detailToggleFor` claims that pair.
 */
export function cursorMoveFor(gesture: CursorKeyGesture): CursorMove | undefined {
  if (gesture.altKey) return undefined
  const primary = isPrimaryModifier(gesture)

  switch (gesture.key) {
    // The primary modifier means "a screenful" here, the way it means "a page"
    // on the horizontal pair — `viewportMoveFor` claims it. Shift is left
    // alone, and so still moves the cursor one row.
    case 'ArrowDown':
      return primary ? undefined : { kind: 'by', rows: 1, columns: 0 }
    case 'ArrowUp':
      return primary ? undefined : { kind: 'by', rows: -1, columns: 0 }
    // A *modified* horizontal arrow is not a position move at all: the primary
    // modifier turns the page (`pageMoveFor`) and Shift scrolls the viewport
    // sideways (`scrollMoveFor`). Claiming them here as well would move the
    // cursor one column *and* do the other thing.
    case 'ArrowRight':
      return primary || gesture.shiftKey ? undefined : { kind: 'by', rows: 0, columns: 1 }
    case 'ArrowLeft':
      return primary || gesture.shiftKey ? undefined : { kind: 'by', rows: 0, columns: -1 }
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
 * Which way `Ctrl`/`Cmd` + `←`/`→` asked to turn the page — `-1` back, `1` on
 * — or `undefined` for any other key.
 *
 * A decoder of its own rather than a fourth `CursorMove`, because turning the
 * page is not a move: it changes which rows exist rather than which of them is
 * under the cursor, and it is the table's business, not the cursor's.
 * `nextPosition` is handed the cells currently on screen and clamps inside
 * them, and a `CursorMove` that could invalidate that list would make the one
 * thing it is allowed to know untrue.
 *
 * The horizontal arrows rather than `PageUp`/`PageDown`, which already mean
 * ten rows *within* the page and mean it in every spreadsheet. Left and right
 * for backwards and forwards is the pagination control's own direction, and
 * the modifier is what separates "the next column" from "the next page" —
 * the same primary-modifier split `Home` and `End` already use for "this row"
 * against "the whole table".
 */
export function pageMoveFor(gesture: CursorKeyGesture): -1 | 1 | undefined {
  if (gesture.altKey || !isPrimaryModifier(gesture)) return undefined
  if (gesture.key === 'ArrowRight') return 1
  if (gesture.key === 'ArrowLeft') return -1
  return undefined
}

/**
 * Which way `Ctrl`/`Cmd` + `↑`/`↓` asked to scroll the table — `-1` up, `1`
 * down, one screenful a press — or `undefined` for any other key.
 *
 * The gesture virtual mode was missing. `Ctrl`/`Cmd`+`←`/`→` turns the page,
 * and a virtual table has no pages, so the vertical pair was the only way
 * through 100k rows and it moved one row at a time. `PageUp`/`PageDown` are not
 * that gesture: they move the **cursor** ten rows and drag the viewport along
 * behind it, where this leaves the cursor exactly where it was and moves the
 * viewport out from under it — the vertical twin of `Shift`+`←`/`→`.
 *
 * Shift is ignored rather than refused, for the reason `pageMoveFor` ignores
 * it: `Ctrl`+`Shift`+`↑` is the same intent with a spare finger on the keyboard,
 * and leaving it unclaimed would make it silently do nothing.
 */
export function viewportMoveFor(gesture: CursorKeyGesture): -1 | 1 | undefined {
  if (gesture.altKey || !isPrimaryModifier(gesture)) return undefined
  if (gesture.key === 'ArrowDown') return 1
  if (gesture.key === 'ArrowUp') return -1
  return undefined
}

/**
 * Which way `Shift` + `←`/`→` asked to scroll the table sideways — `-1` left,
 * `1` right — or `undefined` for any other key.
 *
 * The fourth decoder, and the only one that moves neither the cursor nor the
 * rows. It moves the **viewport**: the ring stays exactly where it was, which
 * is the whole point of having the gesture at all. A wide table's far column
 * was previously reachable only by walking the cursor onto it and losing your
 * place, or by reaching for the scrollbar with the pointer.
 *
 * Three meanings, one pair of keys, separated by the modifier alone: bare moves
 * the cursor one column, the primary modifier turns the page, and `Shift`
 * scrolls. `Ctrl`/`Cmd`+`Shift`+`←`/`→` stays a page turn rather than becoming
 * a fourth thing, so a bare `Shift` is required here — that is also what keeps
 * this decoder exclusive with `pageMoveFor`.
 *
 * The vertical pair is deliberately unclaimed. `Shift`+`↑`/`↓` is the
 * spreadsheet gesture for extending a selection, and spending it on scrolling
 * would take the obvious binding away from a feature the table may yet grow.
 */
export function scrollMoveFor(gesture: CursorKeyGesture): -1 | 1 | undefined {
  if (gesture.altKey || isPrimaryModifier(gesture) || !gesture.shiftKey) return undefined
  if (gesture.key === 'ArrowRight') return 1
  if (gesture.key === 'ArrowLeft') return -1
  return undefined
}

/**
 * What a fold gesture asked for: `toggle` acts on the band over the cursor's
 * column, `expandAll` opens every band on the table.
 *
 * Two kinds rather than a boolean, because they are not opposites: one gesture
 * names a band by where the cursor is, the other names all of them.
 */
export type BandFold = { kind: 'toggle' } | { kind: 'expandAll' }

/**
 * Whether a key press asked to fold a header band, and which of the two ways.
 *
 * Folding was pointer-only — a click anywhere in the band cell — so from a
 * focused cell the only route to one was to Tab out of the grid, walk the
 * header's buttons and Tab back. This is that gesture from the body, where the
 * cursor already is.
 *
 * A bare `=`, and not an arrow, because the arrows are spent and each spend is
 * argued above: bare moves a cell, the primary modifier turns the page or
 * scrolls a screenful, `Shift`+`←`/`→` scrolls sideways, and `Shift`+`↑`/`↓`
 * is being held for range selection. Bare rather than modified because
 * `Ctrl`+`=` is the browser's zoom and `Cmd`+`=` is a page zoom too, so a
 * modified `=` would never arrive here at all.
 *
 * The cost is paid in `editSeedFor`, which gives up these two characters: a
 * cell no longer starts an edit from a typed `=` or `+`, and Enter or F2 opens
 * it first instead. That is the trade the bare key buys — `=` is one keystroke
 * on every layout, where the modified form was not.
 *
 * `'+'` is the same physical key with Shift held on a US layout, and the
 * browser reports the character rather than the key cap. Reading the character
 * rather than `shiftKey` is what makes the gesture survive a layout that sends
 * `+` without Shift.
 *
 * Which band `toggle` means is `foldTargetFor` in `columnGroups.ts`: a key
 * press names the cursor's column and nothing about the header above it.
 */
export function bandFoldFor(gesture: CursorKeyGesture): BandFold | undefined {
  if (gesture.altKey || isPrimaryModifier(gesture)) return undefined
  if (gesture.key !== '=' && gesture.key !== '+') return undefined
  return gesture.key === '+' ? { kind: 'expandAll' } : { kind: 'toggle' }
}

/**
 * Which cell a context menu was asked for.
 *
 * `rowId` is absent for a header cell, which has no row — the two
 * value-dependent items (filter by this value, copy) are what that takes away,
 * and a header's own three actions are what is left.
 *
 * The element to hang the panel off is *not* here: it is an `HTMLElement`, and
 * `core/` holds no DOM at all. `TableGrid` emits it alongside this, because the
 * grid is the only layer that knows which element the gesture hit.
 */
export interface ContextMenuTarget {
  columnId: string
  rowId?: RowId
}

/**
 * Whether a key press asked for the context menu on the cursor's cell.
 *
 * `Shift`+`F10` is the platform gesture every screen reader teaches, and the
 * `ContextMenu` key is the dedicated one the keyboards that have it send. Both
 * are function keys rather than characters, so `editSeedFor` never sees them
 * and the two decoders cannot answer the same press — which is why this one is
 * free to sit with the activation decoders rather than after them.
 *
 * `Shift` is required, not merely tolerated: a bare `F10` is the browser's own
 * menu bar on Windows and Linux, and taking it would cost a keyboard user the
 * only route to it.
 */
export function contextMenuFor(gesture: CursorKeyGesture): boolean {
  if (gesture.altKey || isPrimaryModifier(gesture)) return false
  if (gesture.key === 'ContextMenu') return !gesture.shiftKey
  return gesture.key === 'F10' && Boolean(gesture.shiftKey)
}

/** Which way a detail gesture asked the cursor's row to go. */
export type DetailToggle = 'expand' | 'collapse'

/**
 * Whether a key press asked to open or shut the cursor row's detail panel.
 *
 * `Alt` + `↓` opens and `Alt` + `↑` shuts, which is the disclosure direction
 * every tree control uses and reads the same way round as the caret.
 *
 * The vertical pair specifically. `Alt` + `←`/`→` is the header's keyboard
 * reorder and, in the body, most browsers' history navigation — which is why
 * every other decoder in this file refuses Alt outright. Nothing spends
 * `Alt` + `↑`/`↓`, and the bare and modified arrows are all accounted for:
 * bare moves a cell, the primary modifier turns the page or scrolls a
 * screenful, `Shift`+`←`/`→` scrolls sideways and `Shift`+`↑`/`↓` is held for
 * range selection.
 *
 * Directional rather than a toggle so a held key is idempotent: `Alt`+`↓` on an
 * already-open row leaves it open instead of flapping it shut.
 */
export function detailToggleFor(gesture: CursorKeyGesture): DetailToggle | undefined {
  if (!gesture.altKey || isPrimaryModifier(gesture) || gesture.shiftKey) return undefined
  if (gesture.key === 'ArrowDown') return 'expand'
  if (gesture.key === 'ArrowUp') return 'collapse'
  return undefined
}

/**
 * Where a sideways scroll lands the scroll box, or `undefined` when it cannot
 * move — the arithmetic behind `scrollMoveFor`, with the DOM read out of it.
 *
 * A press snaps the next column's left edge flush against the left edge of the
 * *scrollable* area, which is the horizontal twin of an arrow's "one more row".
 * `inset` is what makes that "scrollable" honest: left-pinned columns are
 * `position: sticky` and sit over the content permanently, so a column scrolled
 * to `scrollLeft` exactly would land underneath them and not be visible at all.
 *
 * `boundaries` are the content-box left edges of the columns that actually
 * scroll, ascending, with the pinned ones left out — a caller measures them,
 * because declared widths and rendered widths part company as soon as a
 * `<colgroup>` carries a column the caller did not declare.
 *
 * Running out of boundaries is not running out of travel: the last column may
 * be wider than the box, so a press past the final edge goes to `maxScrollLeft`
 * rather than stopping short of the tail, and symmetrically to `0` going left.
 * The gesture therefore always reaches both ends. It clamps rather than wraps,
 * as every other movement in this file does.
 */
export function nextScrollLeft(
  scrollLeft: number,
  inset: number,
  boundaries: readonly number[],
  direction: -1 | 1,
  maxScrollLeft: number,
): number | undefined {
  if (maxScrollLeft <= 0) return undefined

  // What the left edge of the scrollable area is showing right now, in content
  // coordinates. Everything below is a question about *this* number, not about
  // `scrollLeft` — they differ by the pinned band, and forgetting that is how a
  // press lands a column under the pin instead of beside it.
  const edge = scrollLeft + inset

  // A pixel of slack in both directions. Boundaries come from
  // `getBoundingClientRect`, `scrollLeft` is fractional in every current
  // browser, and a boundary the box is already sitting on must not count as one
  // further along — that would make a press a no-op at every second column.
  const found =
    direction === 1
      ? boundaries.find((boundary) => boundary > edge + 1)
      : [...boundaries].reverse().find((boundary) => boundary < edge - 1)

  const target = found === undefined ? (direction === 1 ? maxScrollLeft : 0) : found - inset
  const clamped = target < 0 ? 0 : target > maxScrollLeft ? maxScrollLeft : target

  // Nowhere new. The caller then writes nothing, so holding the key at either
  // end costs no scroll events — the rule `nextPosition` follows for the same
  // reason.
  if (Math.abs(clamped - scrollLeft) < 1) return undefined
  return clamped
}

/**
 * Where a vertical scroll lands the scroll box, or `undefined` when it cannot
 * move — the arithmetic behind `viewportMoveFor`, with the DOM read out of it.
 *
 * A screenful is the viewport **minus** `inset` and minus one row. The inset is
 * the sticky header, which covers the top of the scrollport permanently, so a
 * step of the full height would slide a band of rows behind it unseen; the
 * extra row is the overlap every pager keeps, so the row you were reading when
 * you pressed the key is still on screen after it.
 *
 * It clamps at both ends rather than wrapping, and answers `undefined` for a
 * press that would land within a pixel of where the box already is — so holding
 * the key at the bottom costs no scroll events, the same rule `nextScrollLeft`
 * and `nextPosition` follow.
 */
export function nextScrollTop(
  scrollTop: number,
  viewportHeight: number,
  maxScrollTop: number,
  direction: -1 | 1,
  inset = 0,
  rowHeight = 0,
): number | undefined {
  if (maxScrollTop <= 0) return undefined

  // Never less than one row, however small the box or however tall the header:
  // a step of zero would make the gesture a no-op rather than a short scroll.
  const step = Math.max(rowHeight, viewportHeight - Math.max(0, inset) - rowHeight)
  const target = scrollTop + step * direction
  const clamped = target < 0 ? 0 : target > maxScrollTop ? maxScrollTop : target

  if (Math.abs(clamped - scrollTop) < 1) return undefined
  return clamped
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

/**
 * The text a key press should open an editor with, or `undefined` when it
 * starts no edit at all.
 *
 * The spreadsheet gesture: land on a cell, type, and what you typed *is* the
 * new value — the old one is gone rather than appended to, which is why this
 * returns the seed instead of a boolean. Delete and Backspace are the same
 * gesture with an empty seed: they open the editor cleared rather than wiping
 * the cell outright, so Escape still puts it back.
 *
 * A single code point is the test for "printable" rather than a list of keys.
 * Every named key — `Tab`, `Escape`, `F2`, `Home`, `ArrowUp` — is more than one
 * character, and every character a user could mean to type is exactly one,
 * accented letters and emoji included. A list would have to be maintained
 * against every keyboard layout there is.
 *
 * The modifiers are excluded for the reason the other decoders exclude them:
 * `Ctrl+C` is a copy and `Alt` belongs to the browser and to the header's
 * reorder gesture. Shift is *not* excluded — it is how a capital letter is
 * typed.
 *
 * `=` and `+` are the two printable characters this decoder does not claim:
 * they are the band fold (`bandFoldFor`), which had to take them bare because
 * every modified form of `=` is a browser zoom. Editing those two characters
 * into a cell still works — Enter or F2 opens the editor, and the key means
 * itself from there.
 */
export function editSeedFor(gesture: CursorKeyGesture): string | undefined {
  if (gesture.altKey || isPrimaryModifier(gesture)) return undefined
  if (gesture.key === '=' || gesture.key === '+') return undefined
  if (gesture.key === 'Delete' || gesture.key === 'Backspace') return ''
  // Spread rather than `.length`, so a character outside the BMP counts as the
  // one key press it was rather than as its two code units.
  return [...gesture.key].length === 1 ? gesture.key : undefined
}

/**
 * Where the cursor goes when an arrow is pressed inside an **open** editor, or
 * `undefined` when the control keeps the key for itself.
 *
 * An editor opened by typing has to be leavable by the keys that brought the
 * user to it, or the cursor is trapped in the cell it just opened. So an arrow
 * commits and moves, the same way Enter does — this is the sibling of
 * `commitMoveFor`, and takes the same `kind` for the same reason.
 *
 * `select`, `async-select` and `textarea` are exempt, and not as a courtesy:
 * the arrows are how a select is changed at all, how a listbox is walked, and
 * how a caret crosses a line in a textarea, so claiming them would take away
 * the control's own operation. A text or number box loses its caret movement
 * to this, which is the trade a spreadsheet makes too — `Home` and `End` still
 * reach both ends of the text.
 */
export function editorMoveFor(
  gesture: CursorKeyGesture,
  kind?: CellEditorKind,
): CursorMove | undefined {
  if (kind === 'select' || kind === 'async-select' || kind === 'textarea') return undefined
  if (gesture.altKey || gesture.shiftKey || isPrimaryModifier(gesture)) return undefined

  switch (gesture.key) {
    case 'ArrowDown':
      return { kind: 'by', rows: 1, columns: 0 }
    case 'ArrowUp':
      return { kind: 'by', rows: -1, columns: 0 }
    case 'ArrowRight':
      return { kind: 'by', rows: 0, columns: 1 }
    case 'ArrowLeft':
      return { kind: 'by', rows: 0, columns: -1 }
    default:
      return undefined
  }
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
