import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h, nextTick } from 'vue'
import TableCell from '../src/components/primitives/TableCell.vue'
import TableRow from '../src/components/primitives/TableRow.vue'
import TableGrid from '../src/components/primitives/TableGrid.vue'
import CellEditor from '../src/components/primitives/CellEditor.vue'
import { useCellCursor } from '../src/core/useCellCursor'
import type { ColumnDef, ResolvedColumn } from '../src/core/types'

/**
 * The cursor as the DOM sees it — every component mounted **standalone**, with
 * no `<TableRoot>` anywhere in the file. That is the primitives' contract, and
 * a cursor that only worked under the preset would have broken it.
 *
 * Columns over a plain record rather than a typed row, the way the other
 * primitive specs do it: `mount` cannot infer an SFC's own generic, and the row
 * shape is not what is under test here.
 */
type Row = Record<string, unknown>

function resolved(id: string): ResolvedColumn<Row> {
  return {
    id,
    header: id,
    visible: true,
    collapsed: false,
    order: 0,
    resolvedWidth: 100,
    pinned: false,
    pinOffset: 0,
    sortDirection: false,
    sortIndex: 0,
    hasFilter: false,
  }
}

const columns = [resolved('name'), resolved('city'), resolved('salary')]
const columnDefs: ColumnDef<Row>[] = columns
const rows: Row[] = [
  { id: 1, name: 'Ada', city: 'London', salary: 90 },
  { id: 2, name: 'Grace', city: 'New York', salary: 80 },
  { id: 3, name: 'Katherine', city: 'Hampton', salary: 70 },
]

function cursorOver(initial?: { rowId: number; columnId: string }) {
  return useCellCursor<Row>(rows, columnDefs, {
    getRowId: (row) => row.id as number,
    initial,
  })
}

describe('TableCell', () => {
  it('emits neither attribute when the table has no cursor', () => {
    const wrapper = mount(TableCell, { props: { column: columns[0]! } })
    const td = wrapper.get('td')
    // The whole "opt in" claim, in one assertion: a table nobody made
    // navigable renders exactly the markup it always did.
    expect(td.attributes('data-cursor')).toBeUndefined()
    expect(td.attributes('tabindex')).toBeUndefined()
    wrapper.unmount()
  })

  it('marks the four ways the cursor can touch a cell', () => {
    const cases = [
      { cursor: 'cell', mark: 'cell', tabindex: '0' },
      { cursor: 'column', mark: 'column', tabindex: '-1' },
      // The way in before a cursor exists: it takes the tab stop but draws no
      // ring, because nothing has been focused yet.
      { cursor: 'entry', mark: undefined, tabindex: '0' },
      { cursor: 'none', mark: undefined, tabindex: '-1' },
    ] as const

    for (const expected of cases) {
      const wrapper = mount(TableCell, {
        props: { column: columns[0]!, cursor: expected.cursor },
      })
      const td = wrapper.get('td')
      expect(td.attributes('data-cursor')).toBe(expected.mark)
      expect(td.attributes('tabindex')).toBe(expected.tabindex)
      wrapper.unmount()
    }
  })
})

describe('TableRow', () => {
  function mountRow(cursor: ReturnType<typeof cursorOver>, row: Row = rows[1]!) {
    return mount(TableRow, { props: { row, columns, cursor } })
  }

  it('renders standalone, with no table context above it', () => {
    const cursor = cursorOver({ rowId: 2, columnId: 'city' })
    const wrapper = mountRow(cursor)
    expect(wrapper.get('tr').attributes('data-row-id')).toBe('2')
    wrapper.unmount()
  })

  it('rings the cursor cell, tints the rest of its column, and marks its row', () => {
    const cursor = cursorOver({ rowId: 2, columnId: 'city' })
    const onRow = mountRow(cursor)
    const offRow = mountRow(cursor, rows[0]!)

    expect(onRow.get('tr').attributes('data-cursor')).toBe('true')
    expect(onRow.findAll('td').map((td) => td.attributes('data-cursor'))).toEqual([
      undefined,
      'cell',
      undefined,
    ])

    // Another row entirely: no ring, but the same column still tints, which is
    // what makes the highlight a column rather than a cell.
    expect(offRow.get('tr').attributes('data-cursor')).toBeUndefined()
    expect(offRow.findAll('td').map((td) => td.attributes('data-cursor'))).toEqual([
      undefined,
      'column',
      undefined,
    ])

    onRow.unmount()
    offRow.unmount()
  })

  it('offers a way in before anything has set a cursor', () => {
    const cursor = cursorOver()
    const first = mountRow(cursor, rows[0]!)
    const second = mountRow(cursor, rows[1]!)

    // Exactly one `tabindex="0"` across the two rows, and no ring on it: with
    // every cell at -1 the table would be skipped by Tab altogether.
    expect(first.findAll('td').map((td) => td.attributes('tabindex'))).toEqual(['0', '-1', '-1'])
    expect(second.findAll('td').map((td) => td.attributes('tabindex'))).toEqual([
      '-1',
      '-1',
      '-1',
    ])
    expect(first.get('tr').attributes('data-cursor')).toBeUndefined()
    expect(first.findAll('td').every((td) => td.attributes('data-cursor') === undefined)).toBe(
      true,
    )

    first.unmount()
    second.unmount()
  })

  it('emits data-row-id for the id 0, which `|| undefined` would have erased', () => {
    const zero: Row = { id: 0, name: 'Zero', city: 'Nowhere', salary: 0 }
    const cursor = useCellCursor<Row>([zero], columnDefs, { getRowId: (row) => row.id as number })
    const wrapper = mount(TableRow, { props: { row: zero, columns, cursor } })
    expect(wrapper.get('tr').attributes('data-row-id')).toBe('0')
    wrapper.unmount()
  })

  it('emits nothing at all without a cursor', () => {
    const wrapper = mount(TableRow, { props: { row: rows[0]!, columns } })
    const tr = wrapper.get('tr')
    expect(tr.attributes('data-row-id')).toBeUndefined()
    expect(tr.attributes('data-cursor')).toBeUndefined()
    expect(wrapper.findAll('td').every((td) => td.attributes('tabindex') === undefined)).toBe(true)
    wrapper.unmount()
  })
})

describe('TableGrid', () => {
  /** A whole `<tbody>` of primitives, and nothing else — no root, no preset. */
  function mountGrid(cursor?: ReturnType<typeof cursorOver>) {
    const activated: Array<{ rowId: unknown; columnId: string }> = []
    const copied: Array<{ rowId: unknown; columnId: string }> = []
    const pasted: Array<{ position: { rowId: unknown; columnId: string }; text: string }> = []
    // The event as well as the cell: what a key press *means* is decided by the
    // preset from the event riding along, so a report that dropped it would be
    // a report the editing session cannot act on.
    const activatedKeys: string[] = []
    const paged: number[] = []
    const scrolled: number[] = []
    const host = defineComponent({
      setup() {
        return () =>
          h(
            TableGrid,
            {
              columns,
              cursor,
              onActivate: (position: { rowId: unknown; columnId: string }, event: Event) => {
                activated.push(position)
                activatedKeys.push('key' in event ? String((event as KeyboardEvent).key) : event.type)
              },
              onPageMove: (pages: number) => paged.push(pages),
              onScrollMove: (cols: number) => scrolled.push(cols),
              onCopy: (position: { rowId: unknown; columnId: string }) => copied.push(position),
              onPaste: (position: { rowId: unknown; columnId: string }, text: string) =>
                pasted.push({ position, text }),
            },
            () => [
              h(
                'tbody',
                rows.map((row) => h(TableRow, { key: row.id as number, row, columns, cursor })),
              ),
            ],
          )
      },
    })
    return {
      wrapper: mount(host, { attachTo: document.body }),
      activated,
      activatedKeys,
      paged,
      scrolled,
      copied,
      pasted,
    }
  }

  /**
   * A `copy` or `paste` with a clipboard on it, dispatched by hand.
   *
   * Built rather than triggered because the payload is the point: jsdom's
   * `ClipboardEvent` carries a `clipboardData` of `null`, and `trigger` cannot
   * put one there. Returning the event as well as the store lets a test read
   * back both what was written and whether the default was suppressed.
   */
  function clipboardEvent(type: 'copy' | 'paste', text = '') {
    const store = new Map<string, string>([['text/plain', text]])
    const event = new Event(type, { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'clipboardData', {
      value: {
        getData: (format: string) => store.get(format) ?? '',
        setData: (format: string, value: string) => store.set(format, value),
      },
    })
    return { event, store }
  }

  function cellAt(wrapper: ReturnType<typeof mount>, rowId: number, columnId: string) {
    return wrapper.get(`tr[data-row-id="${rowId}"] td[data-column="${columnId}"]`)
  }

  it('is an ordinary table until it is given a cursor', () => {
    const { wrapper } = mountGrid()
    expect(wrapper.get('table').attributes('role')).toBeUndefined()
    wrapper.unmount()
  })

  it('becomes a grid once it has one', () => {
    const cursor = cursorOver({ rowId: 1, columnId: 'name' })
    const { wrapper } = mountGrid(cursor)
    // No `role` on the cells: HTML-AAM already maps a `<td>` to `gridcell`
    // rather than `cell` once its table is exposed as a grid.
    expect(wrapper.get('table').attributes('role')).toBe('grid')
    expect(wrapper.get('td').attributes('role')).toBeUndefined()
    wrapper.unmount()
  })

  it('moves the cursor with the arrows and takes the focus with it', async () => {
    const cursor = cursorOver({ rowId: 1, columnId: 'name' })
    const { wrapper } = mountGrid(cursor)

    await cellAt(wrapper, 1, 'name').trigger('keydown', { key: 'ArrowDown' })
    expect(cursor.position.value).toEqual({ rowId: 2, columnId: 'name' })
    await nextTick()
    expect(document.activeElement).toBe(cellAt(wrapper, 2, 'name').element)

    await cellAt(wrapper, 2, 'name').trigger('keydown', { key: 'ArrowRight' })
    expect(cursor.position.value).toEqual({ rowId: 2, columnId: 'city' })
    await nextTick()
    expect(document.activeElement).toBe(cellAt(wrapper, 2, 'city').element)

    wrapper.unmount()
  })

  it('scrolls the cell it focuses, rather than leaving that to focus()', async () => {
    /*
     * The one thing jsdom cannot show and a browser can: a focus scroll is
     * "centre if needed", and *needed* means the cell is entirely out of view.
     * A cell hanging half off the edge is left hanging — which is what a table
     * with a pinned column produces on every press, because the band covers the
     * cell rather than pushing it out of the box. So the scroll is asked for
     * explicitly, with the alignment that moves the least.
     */
    const cursor = cursorOver({ rowId: 1, columnId: 'name' })
    const { wrapper } = mountGrid(cursor)

    const calls: unknown[] = []
    const target = cellAt(wrapper, 2, 'name').element as HTMLElement
    target.scrollIntoView = (options?: unknown) => calls.push(options)
    let preventedScroll: boolean | undefined
    target.focus = (options?: { preventScroll?: boolean }) => {
      preventedScroll = options?.preventScroll
    }

    await cellAt(wrapper, 1, 'name').trigger('keydown', { key: 'ArrowDown' })
    await nextTick()

    // `preventScroll`, so the browser's alignment does not fire first and get
    // overridden — two scrolls for one key press, the first one wrong.
    expect(preventedScroll).toBe(true)
    expect(calls).toEqual([{ block: 'nearest', inline: 'nearest' }])
    wrapper.unmount()
  })

  it('takes Ctrl+End to the last cell and clamps at the edges', async () => {
    const cursor = cursorOver({ rowId: 1, columnId: 'name' })
    const { wrapper } = mountGrid(cursor)

    await cellAt(wrapper, 1, 'name').trigger('keydown', { key: 'End', ctrlKey: true })
    expect(cursor.position.value).toEqual({ rowId: 3, columnId: 'salary' })

    await cellAt(wrapper, 3, 'salary').trigger('keydown', { key: 'ArrowDown' })
    expect(cursor.position.value).toEqual({ rowId: 3, columnId: 'salary' })

    wrapper.unmount()
  })

  it('reports a page turn rather than moving the cursor sideways', async () => {
    const cursor = cursorOver({ rowId: 2, columnId: 'name' })
    const { wrapper, paged } = mountGrid(cursor)

    await cellAt(wrapper, 2, 'name').trigger('keydown', { key: 'ArrowRight', ctrlKey: true })
    expect(paged).toEqual([1])
    // The cursor has not moved, and that is the point: the grid has no data
    // source, so where the cursor lands depends on rows it has not been given.
    expect(cursor.position.value).toEqual({ rowId: 2, columnId: 'name' })

    await cellAt(wrapper, 2, 'name').trigger('keydown', { key: 'ArrowLeft', metaKey: true })
    expect(paged).toEqual([1, -1])
    expect(cursor.position.value).toEqual({ rowId: 2, columnId: 'name' })

    // Unmodified, the same key is one column and no page turn at all.
    await cellAt(wrapper, 2, 'name').trigger('keydown', { key: 'ArrowRight' })
    expect(paged).toEqual([1, -1])
    expect(cursor.position.value).toEqual({ rowId: 2, columnId: 'city' })

    wrapper.unmount()
  })

  it('reports a sideways scroll rather than moving the cursor', async () => {
    const cursor = cursorOver({ rowId: 2, columnId: 'city' })
    const { wrapper, scrolled, paged } = mountGrid(cursor)

    await cellAt(wrapper, 2, 'city').trigger('keydown', { key: 'ArrowRight', shiftKey: true })
    expect(scrolled).toEqual([1])
    // The ring stays put — that is the entire point of the gesture. It moves
    // the viewport so a far column can be read without losing your place.
    expect(cursor.position.value).toEqual({ rowId: 2, columnId: 'city' })

    await cellAt(wrapper, 2, 'city').trigger('keydown', { key: 'ArrowLeft', shiftKey: true })
    expect(scrolled).toEqual([1, -1])
    expect(cursor.position.value).toEqual({ rowId: 2, columnId: 'city' })

    // Ctrl+Shift stays a page turn, and the bare key stays one column: three
    // meanings on one pair of keys, told apart by the modifier alone.
    await cellAt(wrapper, 2, 'city').trigger('keydown', {
      key: 'ArrowRight',
      shiftKey: true,
      ctrlKey: true,
    })
    expect(scrolled).toEqual([1, -1])
    expect(paged).toEqual([1])

    await cellAt(wrapper, 2, 'city').trigger('keydown', { key: 'ArrowRight' })
    expect(scrolled).toEqual([1, -1])
    expect(cursor.position.value).toEqual({ rowId: 2, columnId: 'salary' })

    wrapper.unmount()
  })

  it('leaves Shift on the vertical arrows alone', async () => {
    const cursor = cursorOver({ rowId: 2, columnId: 'city' })
    const { wrapper, scrolled } = mountGrid(cursor)
    // Reserved for a range selection the table may yet grow; meanwhile the
    // vertical arrows simply ignore the modifier, as they always did.
    await cellAt(wrapper, 2, 'city').trigger('keydown', { key: 'ArrowDown', shiftKey: true })
    expect(scrolled).toEqual([])
    expect(cursor.position.value).toEqual({ rowId: 3, columnId: 'city' })
    wrapper.unmount()
  })

  it('reports Enter and F2 rather than deciding what they mean', async () => {
    const cursor = cursorOver({ rowId: 2, columnId: 'city' })
    const { wrapper, activated } = mountGrid(cursor)

    await cellAt(wrapper, 2, 'city').trigger('keydown', { key: 'F2' })
    // Opening an editor needs an editing session, and a grid that assumed one
    // could not be used without one.
    expect(activated).toEqual([{ rowId: 2, columnId: 'city' }])
    wrapper.unmount()
  })

  it('reports a printable key as an activation, and the key with it', async () => {
    const cursor = cursorOver({ rowId: 2, columnId: 'city' })
    const { wrapper, activated, activatedKeys } = mountGrid(cursor)

    await cellAt(wrapper, 2, 'city').trigger('keydown', { key: 'x' })
    // Typing starts an edit, but only the table holding the editing session
    // knows whether this cell has one — so the grid reports the gesture and
    // what was typed, and decides neither.
    expect(activated).toEqual([{ rowId: 2, columnId: 'city' }])
    expect(activatedKeys).toEqual(['x'])

    await cellAt(wrapper, 2, 'city').trigger('keydown', { key: 'Delete' })
    expect(activatedKeys).toEqual(['x', 'Delete'])

    // And the cursor has not moved: typing is not navigation.
    expect(cursor.position.value).toEqual({ rowId: 2, columnId: 'city' })
    wrapper.unmount()
  })

  it('leaves a shortcut to the browser rather than typing it into a cell', async () => {
    const cursor = cursorOver({ rowId: 2, columnId: 'city' })
    const { wrapper, activated } = mountGrid(cursor)
    // Ctrl+C is a copy, and a table that answered it with an editor holding
    // the letter "c" would have taken the clipboard away from the user.
    await cellAt(wrapper, 2, 'city').trigger('keydown', { key: 'c', ctrlKey: true })
    await cellAt(wrapper, 2, 'city').trigger('keydown', { key: 'Tab' })
    expect(activated).toEqual([])
    wrapper.unmount()
  })

  it('reports a copy of the cursor cell, and suppresses nothing itself', async () => {
    const cursor = cursorOver({ rowId: 2, columnId: 'city' })
    const { wrapper, copied } = mountGrid(cursor)

    const { event } = clipboardEvent('copy')
    cellAt(wrapper, 2, 'city').element.dispatchEvent(event)
    await nextTick()

    expect(copied).toEqual([{ rowId: 2, columnId: 'city' }])
    // The four cursor gestures call `preventDefault`; this one does not. The
    // grid holds no row data, so it cannot write the clipboard — and claiming
    // the copy before anyone had filled it would hand the user an empty one.
    expect(event.defaultPrevented).toBe(false)
    wrapper.unmount()
  })

  it('reports a paste with the clipboard text already read off it', async () => {
    const cursor = cursorOver({ rowId: 2, columnId: 'city' })
    const { wrapper, pasted } = mountGrid(cursor)

    const { event } = clipboardEvent('paste', 'Paris')
    cellAt(wrapper, 2, 'city').element.dispatchEvent(event)
    await nextTick()

    // Read here rather than left to the consumer: `clipboardData` is only
    // readable while the event is being dispatched.
    expect(pasted).toEqual([{ position: { rowId: 2, columnId: 'city' }, text: 'Paris' }])
    expect(event.defaultPrevented).toBe(false)
    wrapper.unmount()
  })

  it('leaves a copy and a paste inside an open editor to the control', async () => {
    const cursor = cursorOver({ rowId: 2, columnId: 'city' })
    const copied: unknown[] = []
    const pasted: unknown[] = []
    const host = defineComponent({
      setup() {
        return () =>
          h(
            TableGrid,
            {
              columns,
              cursor,
              onCopy: (position: unknown) => copied.push(position),
              onPaste: (position: unknown) => pasted.push(position),
            },
            () => [
              h(
                'tbody',
                rows.map((row) =>
                  h(
                    TableRow,
                    { key: row.id as number, row, columns, cursor },
                    { cell: () => h('input', { class: 'inner' }) },
                  ),
                ),
              ),
            ],
          )
      },
    })
    const wrapper = mount(host, { attachTo: document.body })

    // The same `cursorCell` guard the keyboard uses, doing the same job: with
    // an editor open the target is the input, and selecting part of the text
    // and copying it must stay the browser's ordinary copy.
    wrapper.get('input.inner').element.dispatchEvent(clipboardEvent('copy').event)
    wrapper.get('input.inner').element.dispatchEvent(clipboardEvent('paste', 'Paris').event)
    await nextTick()

    expect(copied).toEqual([])
    expect(pasted).toEqual([])
    wrapper.unmount()
  })

  it('reports neither clipboard gesture when the table has no cursor', async () => {
    const { wrapper, copied, pasted } = mountGrid()
    const cell = wrapper.get('td[data-column="city"]')
    cell.element.dispatchEvent(clipboardEvent('copy').event)
    cell.element.dispatchEvent(clipboardEvent('paste', 'Paris').event)
    await nextTick()

    // Off means off: no listeners are bound at all, so an ordinary table's
    // copy is exactly what it was before the cursor existed.
    expect(copied).toEqual([])
    expect(pasted).toEqual([])
    wrapper.unmount()
  })

  it('leaves Alt to the header and to the browser', async () => {
    const cursor = cursorOver({ rowId: 2, columnId: 'city' })
    const { wrapper } = mountGrid(cursor)
    await cellAt(wrapper, 2, 'city').trigger('keydown', { key: 'ArrowLeft', altKey: true })
    expect(cursor.position.value).toEqual({ rowId: 2, columnId: 'city' })
    wrapper.unmount()
  })

  it('leaves a key pressed inside a cell to whatever is in there', async () => {
    const cursor = cursorOver({ rowId: 2, columnId: 'city' })
    const host = defineComponent({
      setup() {
        return () =>
          h(TableGrid, { columns, cursor }, () => [
            h(
              'tbody',
              rows.map((row) =>
                h(
                  TableRow,
                  { key: row.id as number, row, columns, cursor },
                  { cell: () => h('input', { class: 'inner' }) },
                ),
              ),
            ),
          ])
      },
    })
    const wrapper = mount(host, { attachTo: document.body })

    // The guard is a positive test — the event started *on a cell* — rather
    // than a list of controls to skip, because the `editor:<id>` slot can
    // render anything at all.
    await wrapper.get('input.inner').trigger('keydown', { key: 'ArrowDown' })
    expect(cursor.position.value).toEqual({ rowId: 2, columnId: 'city' })
    // The same guard is what stops typing *into* an open editor from being read
    // as the gesture that opens one.
    await wrapper.get('input.inner').trigger('keydown', { key: 'x' })
    expect(cursor.position.value).toEqual({ rowId: 2, columnId: 'city' })
    wrapper.unmount()
  })

  it('adopts the cell that focus landed in', async () => {
    const cursor = cursorOver()
    const { wrapper } = mountGrid(cursor)

    // One handler covers all three ways in: Tab arrives at the single
    // `tabindex="0"` cell, a click focuses the cell it landed in, and an
    // editor's control focuses the cell around it.
    await cellAt(wrapper, 3, 'salary').trigger('focusin')
    expect(cursor.position.value).toEqual({ rowId: 3, columnId: 'salary' })
    wrapper.unmount()
  })

  it('reports a double-clicked cell as an activation', async () => {
    const cursor = cursorOver()
    const { wrapper, activated } = mountGrid(cursor)
    await cellAt(wrapper, 1, 'city').trigger('dblclick')
    expect(activated).toEqual([{ rowId: 1, columnId: 'city' }])
    wrapper.unmount()
  })

  it('pulls the ring back into view even when the move landed nowhere', async () => {
    const cursor = cursorOver({ rowId: 1, columnId: 'name' })
    const { wrapper } = mountGrid(cursor)
    // Focus is elsewhere and the cursor is already at the top, so the move
    // changes no state — but the person asked to be looking at it.
    ;(document.activeElement as HTMLElement | null)?.blur()
    cursor.move({ kind: 'by', rows: -1, columns: 0 })
    await nextTick()
    expect(document.activeElement).toBe(cellAt(wrapper, 1, 'name').element)
    wrapper.unmount()
  })
})

describe('CellEditor', () => {
  const column: ColumnDef = { id: 'name', header: 'Name', type: 'text' }

  function commitWith(props: Record<string, unknown>, event: Record<string, unknown>) {
    const wrapper = mount(CellEditor, { props: { column, value: 'Ada', ...props } })
    void wrapper.get('input, textarea, select').trigger('keydown', { key: 'Enter', ...event })
    const emitted = wrapper.emitted('commit')
    wrapper.unmount()
    return emitted
  }

  it('gives every Enter a direction', () => {
    expect(commitWith({}, {})).toEqual([[{ kind: 'by', rows: 1, columns: 0 }]])
    expect(commitWith({}, { shiftKey: true })).toEqual([[{ kind: 'by', rows: -1, columns: 0 }]])
    expect(commitWith({}, { ctrlKey: true })).toEqual([[{ kind: 'by', rows: 0, columns: 1 }]])
    expect(commitWith({}, { ctrlKey: true, shiftKey: true })).toEqual([
      [{ kind: 'by', rows: 0, columns: -1 }],
    ])
  })

  it('leaves a textarea its newline, and sends its modifier down rather than right', () => {
    const textarea = { column: { ...column, editor: 'textarea' } }
    expect(commitWith(textarea, {})).toBeUndefined()
    expect(commitWith(textarea, { shiftKey: true })).toBeUndefined()
    // Down, not right: a multi-line cell with no way to commit and move down
    // would be missing the gesture people actually use.
    expect(commitWith(textarea, { ctrlKey: true })).toEqual([[{ kind: 'by', rows: 1, columns: 0 }]])
    expect(commitWith(textarea, { ctrlKey: true, shiftKey: true })).toEqual([
      [{ kind: 'by', rows: -1, columns: 0 }],
    ])
  })
})
