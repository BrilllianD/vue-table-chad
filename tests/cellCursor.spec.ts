import { describe, expect, it } from 'vitest'
import { shallowRef } from 'vue'
import {
  PAGE_MOVE_ROWS,
  commitMoveFor,
  cursorMoveFor,
  nextPosition,
  type CellPosition,
} from '../src/core/cellCursor'
import { useCellCursor } from '../src/core/useCellCursor'
import type { ColumnDef } from '../src/core/types'

/**
 * The cursor, from the two angles it has: what a key press asked for, and where
 * that lands.
 *
 * Both halves are exercised without a DOM. `cursorMoveFor` takes a structural
 * gesture rather than a `KeyboardEvent` precisely so the key table can be
 * written out as data here, and `nextPosition` is handed plain arrays because
 * "the cells currently on screen" is all it is ever allowed to know.
 */

interface Row {
  id: number
  name: string
}

const rows: Row[] = [
  { id: 1, name: 'Ada' },
  { id: 2, name: 'Grace' },
  { id: 3, name: 'Katherine' },
]

const columns: ColumnDef<Row>[] = [{ id: 'id' }, { id: 'name' }, { id: 'role' }]

const rowIds = [1, 2, 3]
const columnIds = ['id', 'name', 'role']

/** The middle cell, so a move in any of the four directions has somewhere to go. */
const middle: CellPosition = { rowId: 2, columnId: 'name' }

describe('cursorMoveFor', () => {
  it('maps the four arrows onto the four directions', () => {
    expect(cursorMoveFor({ key: 'ArrowDown' })).toEqual({ kind: 'by', rows: 1, columns: 0 })
    expect(cursorMoveFor({ key: 'ArrowUp' })).toEqual({ kind: 'by', rows: -1, columns: 0 })
    expect(cursorMoveFor({ key: 'ArrowRight' })).toEqual({ kind: 'by', rows: 0, columns: 1 })
    expect(cursorMoveFor({ key: 'ArrowLeft' })).toEqual({ kind: 'by', rows: 0, columns: -1 })
  })

  it('sends PageUp and PageDown a fixed distance, not a page', () => {
    // Deliberately unrelated to `pageSize`: a PageDown of 100 on a 100-row page
    // would land somewhere nobody can see.
    expect(cursorMoveFor({ key: 'PageDown' })).toEqual({
      kind: 'by',
      rows: PAGE_MOVE_ROWS,
      columns: 0,
    })
    expect(cursorMoveFor({ key: 'PageUp' })).toEqual({
      kind: 'by',
      rows: -PAGE_MOVE_ROWS,
      columns: 0,
    })
  })

  it('keeps bare Home and End on this row, and takes the modifier to leave it', () => {
    expect(cursorMoveFor({ key: 'Home' })).toEqual({ kind: 'columnEdge', to: 'first' })
    expect(cursorMoveFor({ key: 'End' })).toEqual({ kind: 'columnEdge', to: 'last' })
    expect(cursorMoveFor({ key: 'Home', ctrlKey: true })).toEqual({ kind: 'corner', to: 'first' })
    expect(cursorMoveFor({ key: 'End', metaKey: true })).toEqual({ kind: 'corner', to: 'last' })
  })

  it('claims Enter, and reads its modifiers as a direction', () => {
    expect(cursorMoveFor({ key: 'Enter' })).toEqual({ kind: 'by', rows: 1, columns: 0 })
    expect(cursorMoveFor({ key: 'Enter', shiftKey: true })).toEqual({
      kind: 'by',
      rows: -1,
      columns: 0,
    })
  })

  it('leaves Alt alone, whatever the key', () => {
    // `Alt` + arrows is already the header's keyboard reorder gesture, and in
    // the body most browsers spend it on history navigation.
    expect(cursorMoveFor({ key: 'ArrowLeft', altKey: true })).toBeUndefined()
    expect(cursorMoveFor({ key: 'Home', altKey: true })).toBeUndefined()
  })

  it('claims nothing else', () => {
    expect(cursorMoveFor({ key: 'a' })).toBeUndefined()
    expect(cursorMoveFor({ key: 'Tab' })).toBeUndefined()
    expect(cursorMoveFor({ key: 'Escape' })).toBeUndefined()
  })
})

describe('commitMoveFor', () => {
  it('gives Enter a direction, and the modifiers change only which one', () => {
    expect(commitMoveFor({ key: 'Enter' })).toEqual({ kind: 'by', rows: 1, columns: 0 })
    expect(commitMoveFor({ key: 'Enter', shiftKey: true })).toEqual({
      kind: 'by',
      rows: -1,
      columns: 0,
    })
    expect(commitMoveFor({ key: 'Enter', ctrlKey: true })).toEqual({
      kind: 'by',
      rows: 0,
      columns: 1,
    })
    expect(commitMoveFor({ key: 'Enter', ctrlKey: true, shiftKey: true })).toEqual({
      kind: 'by',
      rows: 0,
      columns: -1,
    })
  })

  it('treats Cmd as Ctrl', () => {
    expect(commitMoveFor({ key: 'Enter', metaKey: true })).toEqual({
      kind: 'by',
      rows: 0,
      columns: 1,
    })
  })

  it('leaves a textarea its newline, and reads the modifier as permission', () => {
    // Enter and Shift+Enter are both newlines in a textarea, so neither can
    // commit. That leaves the Ctrl pair as the only gesture it has — and
    // spending it sideways would leave a multi-line cell with no way to commit
    // and move down, which is the direction people actually use.
    expect(commitMoveFor({ key: 'Enter' }, 'textarea')).toBeUndefined()
    expect(commitMoveFor({ key: 'Enter', shiftKey: true }, 'textarea')).toBeUndefined()
    expect(commitMoveFor({ key: 'Enter', ctrlKey: true }, 'textarea')).toEqual({
      kind: 'by',
      rows: 1,
      columns: 0,
    })
    expect(commitMoveFor({ key: 'Enter', ctrlKey: true, shiftKey: true }, 'textarea')).toEqual({
      kind: 'by',
      rows: -1,
      columns: 0,
    })
  })

  it('is not a commit for anything but Enter', () => {
    expect(commitMoveFor({ key: 'ArrowDown' })).toBeUndefined()
    expect(commitMoveFor({ key: 'Enter', altKey: true })).toBeUndefined()
  })
})

describe('nextPosition', () => {
  it('steps one cell in each direction', () => {
    expect(nextPosition(middle, { kind: 'by', rows: 1, columns: 0 }, rowIds, columnIds)).toEqual({
      rowId: 3,
      columnId: 'name',
    })
    expect(nextPosition(middle, { kind: 'by', rows: 0, columns: -1 }, rowIds, columnIds)).toEqual({
      rowId: 2,
      columnId: 'id',
    })
  })

  it('clamps at every edge rather than wrapping or paging', () => {
    const topLeft: CellPosition = { rowId: 1, columnId: 'id' }
    const bottomRight: CellPosition = { rowId: 3, columnId: 'role' }
    // Each of these asks to leave the grid, and each stays put — so the result
    // is "nothing changed" rather than a position off the end.
    expect(nextPosition(topLeft, { kind: 'by', rows: -1, columns: 0 }, rowIds, columnIds)).toBeUndefined()
    expect(nextPosition(topLeft, { kind: 'by', rows: 0, columns: -1 }, rowIds, columnIds)).toBeUndefined()
    expect(nextPosition(bottomRight, { kind: 'by', rows: 1, columns: 0 }, rowIds, columnIds)).toBeUndefined()
    expect(nextPosition(bottomRight, { kind: 'by', rows: 0, columns: 1 }, rowIds, columnIds)).toBeUndefined()
  })

  it('clamps a page jump to the last row instead of refusing it', () => {
    // A PageDown that overshoots is still a move — it just lands on the end.
    expect(
      nextPosition({ rowId: 1, columnId: 'id' }, { kind: 'by', rows: 10, columns: 0 }, rowIds, columnIds),
    ).toEqual({ rowId: 3, columnId: 'id' })
  })

  it('lands on the first cell when there is no cursor yet', () => {
    // Not "one row below where it would have been": the first arrow press on an
    // untouched table has to put the cursor somewhere visible.
    expect(nextPosition(null, { kind: 'by', rows: 1, columns: 0 }, rowIds, columnIds)).toEqual({
      rowId: 1,
      columnId: 'id',
    })
  })

  it('re-anchors the axis whose row or column has gone', () => {
    // The row was filtered away while the cursor was on it. The column is still
    // there, so it keeps it and only the row axis starts over.
    const gone: CellPosition = { rowId: 99, columnId: 'role' }
    expect(nextPosition(gone, { kind: 'by', rows: 1, columns: 0 }, rowIds, columnIds)).toEqual({
      rowId: 1,
      columnId: 'role',
    })
  })

  it('takes Home and End to the ends of the row it is already on', () => {
    expect(nextPosition(middle, { kind: 'columnEdge', to: 'last' }, rowIds, columnIds)).toEqual({
      rowId: 2,
      columnId: 'role',
    })
    expect(nextPosition(middle, { kind: 'columnEdge', to: 'first' }, rowIds, columnIds)).toEqual({
      rowId: 2,
      columnId: 'id',
    })
  })

  it('takes the corners absolutely, from anywhere including nowhere', () => {
    expect(nextPosition(middle, { kind: 'corner', to: 'first' }, rowIds, columnIds)).toEqual({
      rowId: 1,
      columnId: 'id',
    })
    expect(nextPosition(null, { kind: 'corner', to: 'last' }, rowIds, columnIds)).toEqual({
      rowId: 3,
      columnId: 'role',
    })
  })

  it('has nowhere to go in an empty table', () => {
    expect(nextPosition(middle, { kind: 'by', rows: 1, columns: 0 }, [], columnIds)).toBeUndefined()
    expect(nextPosition(middle, { kind: 'by', rows: 1, columns: 0 }, rowIds, [])).toBeUndefined()
  })
})

describe('useCellCursor', () => {
  function cursor(initial?: CellPosition) {
    const data = shallowRef<Row[]>([...rows])
    return {
      data,
      cursor: useCellCursor<Row>(data, columns, { getRowId: (row) => row.id, initial }),
    }
  }

  it('starts nowhere, and still offers a way in', () => {
    const h = cursor()
    expect(h.cursor.position.value).toBeNull()
    // With every cell at `tabindex="-1"` the table would fall out of the tab
    // order entirely, so an unset cursor still nominates a cell.
    expect(h.cursor.tabStop.value).toEqual({ rowId: 1, columnId: 'id' })
  })

  it('takes an initial position without asking for focus', () => {
    const h = cursor({ rowId: 2, columnId: 'name' })
    expect(h.cursor.position.value).toEqual({ rowId: 2, columnId: 'name' })
    // Mounting a table must not steal the caret from the page it is on.
    expect(h.cursor.focusRequests.value).toBe(0)
  })

  it('nominates the first cell again once the cursor row leaves the page', () => {
    const h = cursor({ rowId: 2, columnId: 'name' })
    h.data.value = [rows[0]!, rows[2]!]
    // The position is kept — the row may come back on the next page — but the
    // tab stop has to be a cell that actually exists.
    expect(h.cursor.position.value).toEqual({ rowId: 2, columnId: 'name' })
    expect(h.cursor.tabStop.value).toEqual({ rowId: 1, columnId: 'id' })
  })

  it('reports how far down the rendered rows it is', () => {
    const h = cursor({ rowId: 2, columnId: 'name' })
    expect(h.cursor.rowOffset.value).toBe(1)

    // A row this page does not hold is not an offset. Falling back to 0 here
    // would silently turn "the cursor is somewhere else" into "the cursor is
    // at the top", which is a page change landing on the wrong row.
    h.data.value = [rows[0]!, rows[2]!]
    expect(h.cursor.rowOffset.value).toBe(-1)

    h.cursor.clear()
    expect(h.cursor.rowOffset.value).toBe(-1)
  })

  it('anchors at an offset, taking the first column when none is named', () => {
    const h = cursor()
    h.cursor.anchorAt(1)
    expect(h.cursor.position.value).toEqual({ rowId: 2, columnId: 'id' })
    // Silent by default, like every other way of putting the cursor somewhere
    // the user did not personally ask for.
    expect(h.cursor.focusRequests.value).toBe(0)

    h.cursor.anchorAt(2, 'role', { focus: true })
    expect(h.cursor.position.value).toEqual({ rowId: 3, columnId: 'role' })
    expect(h.cursor.focusRequests.value).toBe(1)
  })

  it('clamps an anchor to the rows it was given', () => {
    const h = cursor()
    // What a short last page does: page 2 of a 5-row table holds two rows, and
    // an offset of 4 has to land on one of them rather than on nothing.
    h.cursor.anchorAt(99, 'name')
    expect(h.cursor.position.value).toEqual({ rowId: 3, columnId: 'name' })

    h.cursor.anchorAt(-3, 'name')
    expect(h.cursor.position.value).toEqual({ rowId: 1, columnId: 'name' })
  })

  it('re-anchors to the first column when the named one has gone', () => {
    const h = cursor()
    // Hidden, or withheld by a folded band. `nextPosition` re-anchors an axis
    // it cannot find the same way, so a fold behaves here as it does there.
    h.cursor.anchorAt(0, 'salary')
    expect(h.cursor.position.value).toEqual({ rowId: 1, columnId: 'id' })
  })

  it('waits for rows before anchoring, then anchors once', () => {
    const data = shallowRef<Row[]>([])
    const c = useCellCursor<Row>(data, columns, { getRowId: (row) => row.id })

    // A server source has not answered yet. The offset cannot be resolved in
    // this tick, and giving up would leave the table with no cursor at all.
    c.anchorAt(1, 'name')
    expect(c.position.value).toBeNull()

    data.value = [...rows]
    expect(c.position.value).toEqual({ rowId: 2, columnId: 'name' })

    // One-shot: the rows changing again is the next page arriving, not a
    // second reason to move the cursor back to where it was told once.
    data.value = [rows[2]!, rows[0]!]
    expect(c.position.value).toEqual({ rowId: 2, columnId: 'name' })
  })

  it('lets a second anchor replace one still waiting', () => {
    const data = shallowRef<Row[]>([])
    const c = useCellCursor<Row>(data, columns, { getRowId: (row) => row.id })

    // Two page changes before the first answered. Both landing would move the
    // cursor twice, and the older one would win about half the time.
    c.anchorAt(0, 'name')
    c.anchorAt(2, 'role')
    data.value = [...rows]
    expect(c.position.value).toEqual({ rowId: 3, columnId: 'role' })
  })

  it('reports a move that landed, and one that did not', () => {
    const h = cursor({ rowId: 3, columnId: 'role' })
    expect(h.cursor.move({ kind: 'by', rows: -1, columns: 0 })).toBe(true)
    expect(h.cursor.position.value).toEqual({ rowId: 2, columnId: 'role' })
    expect(h.cursor.move({ kind: 'by', rows: 0, columns: 1 })).toBe(false)
    expect(h.cursor.position.value).toEqual({ rowId: 2, columnId: 'role' })
  })

  it('asks for focus even when it had nowhere to go', () => {
    const h = cursor({ rowId: 1, columnId: 'id' })
    h.cursor.move({ kind: 'by', rows: -1, columns: 0 })
    // The cursor did not move, but the person did ask to be looking at it —
    // and they may have scrolled it off the screen since.
    expect(h.cursor.focusRequests.value).toBe(1)
  })

  it('sets a position silently, and takes focus only when asked', () => {
    const h = cursor()
    h.cursor.moveTo({ rowId: 2, columnId: 'name' })
    expect(h.cursor.focusRequests.value).toBe(0)
    h.cursor.moveTo({ rowId: 3, columnId: 'name' }, { focus: true })
    expect(h.cursor.focusRequests.value).toBe(1)
  })

  it('answers what is the cursor, what is in its row, and what is in its column', () => {
    const h = cursor({ rowId: 2, columnId: 'name' })
    expect(h.cursor.isCursor(2, 'name')).toBe(true)
    expect(h.cursor.isCursor(2, 'id')).toBe(false)
    expect(h.cursor.isCursorRow(2)).toBe(true)
    expect(h.cursor.isCursorColumn('name')).toBe(true)
    expect(h.cursor.isCursorColumn('role')).toBe(false)
  })

  it('says nothing is the cursor while there is no cursor', () => {
    const h = cursor()
    // `tabStop` nominates the first cell, but nominating is not being: an
    // untouched table draws no ring anywhere.
    expect(h.cursor.isCursor(1, 'id')).toBe(false)
    expect(h.cursor.isCursorRow(1)).toBe(false)
  })

  it('matches a stringified id back to the row rather than parsing it', () => {
    const h = cursor()
    // The DOM only ever holds strings, and `Number('007')` is not the row whose
    // id is the string '007'.
    expect(h.cursor.rowIdFor('2')).toBe(2)
    expect(h.cursor.rowIdFor('007')).toBeUndefined()
    expect(h.cursor.rowIdFor('nope')).toBeUndefined()
  })

  it('stays on its row when the rows are re-sorted underneath it', () => {
    const h = cursor({ rowId: 3, columnId: 'name' })
    h.data.value = [rows[2]!, rows[1]!, rows[0]!]
    expect(h.cursor.position.value).toEqual({ rowId: 3, columnId: 'name' })
    // And the row it names is now the first one, so the next step down is the
    // row that is now visually below it.
    expect(h.cursor.move({ kind: 'by', rows: 1, columns: 0 })).toBe(true)
    expect(h.cursor.position.value).toEqual({ rowId: 2, columnId: 'name' })
  })

  it('clears back to nothing', () => {
    const h = cursor({ rowId: 2, columnId: 'name' })
    h.cursor.clear()
    expect(h.cursor.position.value).toBeNull()
  })
})
