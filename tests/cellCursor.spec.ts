import { describe, expect, it } from 'vitest'
import { shallowRef } from 'vue'
import {
  PAGE_MOVE_ROWS,
  commitMoveFor,
  cursorMoveFor,
  nextPosition,
  nextScrollLeft,
  nextScrollTop,
  pageMoveFor,
  scrollMoveFor,
  viewportMoveFor,
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

  it('gives the modified arrows up entirely', () => {
    // The horizontal pair means a page change and the vertical pair means a
    // screenful of scrolling, neither of which is a position move — and if two
    // decoders claimed one key the cursor would step *and* the other happen.
    expect(cursorMoveFor({ key: 'ArrowRight', ctrlKey: true })).toBeUndefined()
    expect(cursorMoveFor({ key: 'ArrowLeft', metaKey: true })).toBeUndefined()
    expect(cursorMoveFor({ key: 'ArrowDown', ctrlKey: true })).toBeUndefined()
    expect(cursorMoveFor({ key: 'ArrowUp', metaKey: true })).toBeUndefined()
  })

  it('claims nothing else', () => {
    expect(cursorMoveFor({ key: 'a' })).toBeUndefined()
    expect(cursorMoveFor({ key: 'Tab' })).toBeUndefined()
    expect(cursorMoveFor({ key: 'Escape' })).toBeUndefined()
  })
})

describe('pageMoveFor', () => {
  it('reads the modified horizontal arrows as a page turn', () => {
    expect(pageMoveFor({ key: 'ArrowRight', ctrlKey: true })).toBe(1)
    expect(pageMoveFor({ key: 'ArrowLeft', ctrlKey: true })).toBe(-1)
    expect(pageMoveFor({ key: 'ArrowRight', metaKey: true })).toBe(1)
  })

  it('needs the modifier, and refuses Alt', () => {
    // Bare arrows are one cell, and must stay one cell — the modifier is the
    // whole difference between "the next column" and "the next page".
    expect(pageMoveFor({ key: 'ArrowRight' })).toBeUndefined()
    expect(pageMoveFor({ key: 'ArrowLeft' })).toBeUndefined()
    expect(pageMoveFor({ key: 'ArrowRight', ctrlKey: true, altKey: true })).toBeUndefined()
  })

  it('claims no other key, modified or not', () => {
    expect(pageMoveFor({ key: 'ArrowDown', ctrlKey: true })).toBeUndefined()
    expect(pageMoveFor({ key: 'PageDown', ctrlKey: true })).toBeUndefined()
    expect(pageMoveFor({ key: 'Home', ctrlKey: true })).toBeUndefined()
    expect(pageMoveFor({ key: 'Enter', ctrlKey: true })).toBeUndefined()
  })

  it('is exclusive with the other decoders over every gesture any of them claims', () => {
    // The invariant the whole split rests on. A key two decoders answered would
    // be acted on twice — the cursor stepping a column *and* the page turning —
    // and the modifier is the only thing keeping the three apart.
    const decoders = [
      ['cursorMoveFor', cursorMoveFor],
      ['pageMoveFor', pageMoveFor],
      ['scrollMoveFor', scrollMoveFor],
      ['viewportMoveFor', viewportMoveFor],
    ] as const
    const keys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp',
      'PageDown', 'Enter', 'F2', 'Tab', 'a']
    for (const key of keys) {
      for (const modifiers of [{}, { ctrlKey: true }, { metaKey: true }, { shiftKey: true },
        { ctrlKey: true, shiftKey: true }, { metaKey: true, shiftKey: true },
        { altKey: true }, { altKey: true, shiftKey: true }]) {
        const gesture = { key, ...modifiers }
        const claimed = decoders.filter(([, decode]) => decode(gesture) !== undefined)
        expect(
          claimed.length,
          `${key} ${JSON.stringify(modifiers)} was claimed by ` +
            claimed.map(([name]) => name).join(' and '),
        ).toBeLessThan(2)
      }
    }
  })
})

describe('scrollMoveFor', () => {
  it('reads a bare Shift plus a horizontal arrow as a sideways scroll', () => {
    expect(scrollMoveFor({ key: 'ArrowRight', shiftKey: true })).toBe(1)
    expect(scrollMoveFor({ key: 'ArrowLeft', shiftKey: true })).toBe(-1)
  })

  it('needs Shift, and needs it bare', () => {
    // Bare arrows move the cursor and must keep moving it; Ctrl/Cmd+Shift stays
    // a page turn rather than becoming a fourth meaning for the same two keys.
    expect(scrollMoveFor({ key: 'ArrowRight' })).toBeUndefined()
    expect(scrollMoveFor({ key: 'ArrowLeft' })).toBeUndefined()
    expect(scrollMoveFor({ key: 'ArrowRight', shiftKey: true, ctrlKey: true })).toBeUndefined()
    expect(scrollMoveFor({ key: 'ArrowLeft', shiftKey: true, metaKey: true })).toBeUndefined()
    expect(scrollMoveFor({ key: 'ArrowRight', shiftKey: true, altKey: true })).toBeUndefined()
  })

  it('leaves the vertical pair alone', () => {
    // Shift+up/down is the spreadsheet gesture for extending a selection, and
    // is deliberately unclaimed so the table can still grow one.
    expect(scrollMoveFor({ key: 'ArrowUp', shiftKey: true })).toBeUndefined()
    expect(scrollMoveFor({ key: 'ArrowDown', shiftKey: true })).toBeUndefined()
    expect(scrollMoveFor({ key: 'PageDown', shiftKey: true })).toBeUndefined()
    expect(scrollMoveFor({ key: 'Home', shiftKey: true })).toBeUndefined()
    expect(scrollMoveFor({ key: 'Enter', shiftKey: true })).toBeUndefined()
  })

  it('gives the cursor back its bare arrows, and only those', () => {
    // The other half of the exclusivity: the gesture had to be taken from
    // `cursorMoveFor`, which used to ignore Shift entirely.
    expect(cursorMoveFor({ key: 'ArrowRight', shiftKey: true })).toBeUndefined()
    expect(cursorMoveFor({ key: 'ArrowLeft', shiftKey: true })).toBeUndefined()
    expect(cursorMoveFor({ key: 'ArrowRight' })).toEqual({ kind: 'by', rows: 0, columns: 1 })
    // Vertical arrows never read the modifier, so Shift leaves them untouched.
    expect(cursorMoveFor({ key: 'ArrowDown', shiftKey: true })).toEqual(
      { kind: 'by', rows: 1, columns: 0 },
    )
  })
})

describe('viewportMoveFor', () => {
  it('reads the primary modifier plus a vertical arrow as a screenful', () => {
    expect(viewportMoveFor({ key: 'ArrowDown', ctrlKey: true })).toBe(1)
    expect(viewportMoveFor({ key: 'ArrowUp', metaKey: true })).toBe(-1)
    // Shift is a spare finger, not a fifth meaning — the rule `pageMoveFor`
    // follows for the horizontal pair.
    expect(viewportMoveFor({ key: 'ArrowDown', ctrlKey: true, shiftKey: true })).toBe(1)
  })

  it('claims nothing bare, nothing with Alt, and no other key', () => {
    expect(viewportMoveFor({ key: 'ArrowDown' })).toBeUndefined()
    expect(viewportMoveFor({ key: 'ArrowUp', shiftKey: true })).toBeUndefined()
    expect(viewportMoveFor({ key: 'ArrowDown', ctrlKey: true, altKey: true })).toBeUndefined()
    expect(viewportMoveFor({ key: 'ArrowRight', ctrlKey: true })).toBeUndefined()
    expect(viewportMoveFor({ key: 'PageDown', ctrlKey: true })).toBeUndefined()
    expect(viewportMoveFor({ key: 'Home', ctrlKey: true })).toBeUndefined()
  })

  it('takes the modified vertical arrows off the cursor, and leaves the bare ones', () => {
    // The other half of the exclusivity, and the behaviour that changed:
    // vertical arrows used to ignore the modifier entirely.
    expect(cursorMoveFor({ key: 'ArrowDown', ctrlKey: true })).toBeUndefined()
    expect(cursorMoveFor({ key: 'ArrowUp', metaKey: true })).toBeUndefined()
    expect(cursorMoveFor({ key: 'ArrowDown' })).toEqual({ kind: 'by', rows: 1, columns: 0 })
    expect(cursorMoveFor({ key: 'ArrowUp', shiftKey: true })).toEqual(
      { kind: 'by', rows: -1, columns: 0 },
    )
  })
})

describe('nextScrollTop', () => {
  const VIEWPORT = 600
  const HEADER = 40
  const ROW = 38
  const MAX = 10_000

  it('steps a screenful less the header and one row of overlap', () => {
    expect(nextScrollTop(0, VIEWPORT, MAX, 1, HEADER, ROW)).toBe(VIEWPORT - HEADER - ROW)
    expect(nextScrollTop(1000, VIEWPORT, MAX, -1, HEADER, ROW)).toBe(1000 - (VIEWPORT - HEADER - ROW))
  })

  it('takes the whole viewport when there is no header and no row height', () => {
    expect(nextScrollTop(0, VIEWPORT, MAX, 1)).toBe(VIEWPORT)
  })

  it('never steps less than one row, however tall the header', () => {
    // A box barely taller than its own header would otherwise step zero pixels,
    // which is a gesture that does nothing rather than a short scroll.
    expect(nextScrollTop(0, 50, MAX, 1, 48, ROW)).toBe(ROW)
  })

  it('clamps at both ends', () => {
    expect(nextScrollTop(MAX - 10, VIEWPORT, MAX, 1, HEADER, ROW)).toBe(MAX)
    expect(nextScrollTop(10, VIEWPORT, MAX, -1, HEADER, ROW)).toBe(0)
  })

  it('reports nowhere new as undefined, so holding the key costs nothing', () => {
    expect(nextScrollTop(MAX, VIEWPORT, MAX, 1, HEADER, ROW)).toBeUndefined()
    expect(nextScrollTop(0, VIEWPORT, MAX, -1, HEADER, ROW)).toBeUndefined()
    // Nothing overflows: there is no scrolling to do at all.
    expect(nextScrollTop(0, VIEWPORT, 0, 1, HEADER, ROW)).toBeUndefined()
  })
})

describe('nextScrollLeft', () => {
  // Four columns 100 wide, none pinned, in a box 250 wide: 400 of content and
  // 150 of travel.
  const boundaries = [0, 100, 200, 300]
  const max = 150

  it('snaps the next column flush to the left edge', () => {
    expect(nextScrollLeft(0, 0, boundaries, 1, max)).toBe(100)
    expect(nextScrollLeft(100, 0, boundaries, 1, max)).toBe(150)
  })

  it('snaps back to the previous one going left', () => {
    expect(nextScrollLeft(100, 0, boundaries, -1, max)).toBe(0)
    // Mid-column — dragged there by the scrollbar — snaps to the boundary it is
    // sitting inside rather than to the one before it.
    expect(nextScrollLeft(140, 0, boundaries, -1, max)).toBe(100)
  })

  it('offsets every boundary by a sticky left-pinned band', () => {
    // 100 of pin means the scrollable area starts at content x = scrollLeft +
    // 100, so landing the third column beside the pin is scrollLeft 100, not
    // 200. Getting this wrong scrolls the column *under* the pin.
    expect(nextScrollLeft(0, 100, boundaries, 1, max)).toBe(100)
    expect(nextScrollLeft(100, 100, boundaries, 1, max)).toBe(150)
  })

  it('runs to the end rather than stopping short of a wide last column', () => {
    // Past the final boundary there is still travel left, because the last
    // column is wider than the box. The gesture has to reach it.
    expect(nextScrollLeft(120, 0, [0, 100], 1, max)).toBe(max)
    expect(nextScrollLeft(40, 0, [0, 100], -1, max)).toBe(0)
  })

  it('returns undefined at either end, and when nothing scrolls at all', () => {
    expect(nextScrollLeft(max, 0, boundaries, 1, max)).toBeUndefined()
    expect(nextScrollLeft(0, 0, boundaries, -1, max)).toBeUndefined()
    // A table narrower than its box has no travel; a press must not write a
    // scroll position at all, or holding the key fires scroll events forever.
    expect(nextScrollLeft(0, 0, boundaries, 1, 0)).toBeUndefined()
  })

  it('tolerates the subpixel a rect and a scrollLeft disagree by', () => {
    // Sitting a shade past a boundary must not count as being before it —
    // that would make every second press a no-op.
    expect(nextScrollLeft(100.4, 0, boundaries, 1, max)).toBe(150)
    expect(nextScrollLeft(99.6, 0, boundaries, 1, max)).toBe(150)
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
