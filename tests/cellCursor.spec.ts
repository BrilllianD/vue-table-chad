import { describe, expect, it } from 'vitest'
import {
  PAGE_MOVE_ROWS,
  commitMoveFor,
  cursorMoveFor,
  nextPosition,
  type CellPosition,
} from '../src/core/cellCursor'

/**
 * The cursor, from the two angles it has: what a key press asked for, and where
 * that lands.
 *
 * Both halves are exercised without a DOM. `cursorMoveFor` takes a structural
 * gesture rather than a `KeyboardEvent` precisely so the key table can be
 * written out as data here, and `nextPosition` is handed plain arrays because
 * "the cells currently on screen" is all it is ever allowed to know.
 */

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
