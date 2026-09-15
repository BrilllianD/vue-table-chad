import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h, nextTick, shallowRef } from 'vue'
import DataTable from '../src/components/preset/DataTable.vue'
import { useLocalDataSource } from '../src/core/useLocalDataSource'
import { useServerDataSource } from '../src/core/useServerDataSource'
import { useTableState } from '../src/core/useTableState'
import { useRowEditing, type RowChange } from '../src/core/useRowEditing'
import { replaceRowIn } from '../src/core/editing'
import type { ColumnDef } from '../src/core/types'
import { people, personColumns, type Person } from './fixtures'

/**
 * The cursor end to end through the preset: the keys, the editor they open, and
 * the cell they land on afterwards.
 *
 * `hiredAt` stays read-only throughout, because half of what is being asserted
 * here is what Enter does on a cell that has no editor.
 */

type SessionOptions = Partial<Parameters<typeof useRowEditing<Person>>[2]>

const DEPARTMENTS = ['Engineering', 'Research', 'Support']

function mountTable(
  options: {
    cellCursor?: boolean
    pageSize?: number
    session?: SessionOptions
    /** Which columns take an editor. `name` and `salary` unless a test says otherwise. */
    editable?: string[]
    /**
     * Options for the `department` column, which is what turns it into a
     * select — an `enum` with no list renders a text box, and several cases
     * below want exactly that.
     */
    selectOptions?: string[]
    rowClickSelect?: boolean
  } = {},
) {
  const editable = options.editable ?? ['name', 'salary']
  const columns: ColumnDef<Person>[] = personColumns.map((column) => {
    if (!editable.includes(column.id)) return column
    if (column.id === 'department' && options.selectOptions) {
      return { ...column, editable: true, options: options.selectOptions }
    }
    return { ...column, editable: true }
  })
  const rows = shallowRef<Person[]>([...people])
  const saves: RowChange<Person>[] = []
  const saved: Person[] = []

  /** Assigned by the host's setup, so a test can drive the query directly. */
  let state!: ReturnType<typeof useTableState>

  const Host = defineComponent({
    setup() {
      state = useTableState({ pageSize: options.pageSize ?? 25 })
      const source = useLocalDataSource<Person>(rows, columns, state.query, { debounceMs: 0 })
      const session = useRowEditing<Person>(source, columns, {
        save: async (change) => {
          saves.push(change)
        },
        apply: (next) => {
          rows.value = replaceRowIn(rows.value, next, (row) => row.id)
        },
        ...options.session,
      })
      return () =>
        h(DataTable as never, {
          columns,
          source,
          state,
          editing: session,
          cellCursor: options.cellCursor ?? true,
          selectable: options.rowClickSelect ? true : undefined,
          rowClickSelect: options.rowClickSelect,
          onRowSaved: (row: Person) => saved.push(row),
        })
    },
  })

  const wrapper = mount(Host, { attachTo: document.body })
  return { wrapper, rows, saves, saved, state }
}

type Wrapper = ReturnType<typeof mountTable>['wrapper']

function cell(wrapper: Wrapper, rowId: number, columnId: string) {
  return wrapper.get(`tbody tr[data-row-id="${rowId}"] td[data-column="${columnId}"]`)
}

/** The row ids the body is showing, top to bottom. */
function pageIds(wrapper: Wrapper): string[] {
  return wrapper.findAll('tbody tr[data-row-id]').map((row) => row.attributes('data-row-id')!)
}

/** Where the ring is right now, as the DOM reports it. */
function ringAt(wrapper: Wrapper): string | undefined {
  const cursorCell = wrapper.find('tbody td[data-cursor="cell"]')
  if (!cursorCell.exists()) return undefined
  const rowId = cursorCell.element.closest('tr')?.getAttribute('data-row-id')
  return `${rowId}:${cursorCell.attributes('data-column')}`
}

describe('a table with no cell cursor', () => {
  it('renders exactly what it always did', () => {
    const { wrapper } = mountTable({ cellCursor: false })

    expect(wrapper.get('table').attributes('role')).toBeUndefined()
    expect(wrapper.find('tbody td[tabindex]').exists()).toBe(false)
    expect(wrapper.find('tbody td[data-cursor]').exists()).toBe(false)
    // No `data-row-id` either: it exists for the cursor to find a cell again,
    // and nothing is looking.
    expect(wrapper.find('tr[data-row-id]').exists()).toBe(false)
    // And an editable cell keeps the button that is its only keyboard route
    // without a cursor to reach it by.
    const editable = wrapper.get('tbody tr:first-child td[data-column="name"]')
    expect(editable.find('.vt-cell-trigger').exists()).toBe(true)
    expect(editable.find('.vt-cell-editable').exists()).toBe(false)
    wrapper.unmount()
  })
})

describe('a table with one', () => {
  it('becomes a grid with exactly one way in', () => {
    const { wrapper } = mountTable()
    expect(wrapper.get('table').attributes('role')).toBe('grid')
    // One tab stop for the whole grid, not one per editable cell.
    expect(wrapper.findAll('tbody td[tabindex="0"]')).toHaveLength(1)
    wrapper.unmount()
  })

  it('swaps the edit button for the cell itself', () => {
    const { wrapper } = mountTable()
    expect(wrapper.find('.vt-cell-trigger').exists()).toBe(false)
    // The pointer affordance survives the swap: it is what says "you can type
    // here" before you try.
    expect(cell(wrapper, 1, 'name').find('.vt-cell-editable').exists()).toBe(true)
    expect(cell(wrapper, 1, 'hiredAt').find('.vt-cell-editable').exists()).toBe(false)
    wrapper.unmount()
  })

  it('rings the cursor cell, crosses its row, and tints its header', async () => {
    const { wrapper } = mountTable()
    await cell(wrapper, 2, 'salary').trigger('focusin')
    await nextTick()

    expect(ringAt(wrapper)).toBe('2:salary')
    expect(wrapper.get('tbody tr[data-row-id="2"]').attributes('data-cursor')).toBe('true')
    // Every other cell of that column is tinted, the `<th>` above them included.
    expect(cell(wrapper, 1, 'salary').attributes('data-cursor')).toBe('column')
    expect(wrapper.get('thead th[data-column="salary"]').attributes('data-cursor')).toBe('column')
    expect(wrapper.get('thead th[data-column="name"]').attributes('data-cursor')).toBeUndefined()
    wrapper.unmount()
  })

  it('moves with the arrows and takes the focus with it', async () => {
    const { wrapper } = mountTable()
    await cell(wrapper, 1, 'name').trigger('focusin')

    await cell(wrapper, 1, 'name').trigger('keydown', { key: 'ArrowDown' })
    await nextTick()
    expect(ringAt(wrapper)).toBe('2:name')
    expect(document.activeElement).toBe(cell(wrapper, 2, 'name').element)
    wrapper.unmount()
  })
})

describe('a left click', () => {
  it('opens the editor on an editable cell, in one click', async () => {
    const { wrapper } = mountTable()
    await cell(wrapper, 1, 'name').trigger('click')
    await nextTick()

    expect(cell(wrapper, 1, 'name').find('.vt-cell-input').exists()).toBe(true)
    wrapper.unmount()
  })

  it('opens nothing on a read-only cell', async () => {
    const { wrapper } = mountTable()
    // `hiredAt` has no editor. The click still places the cursor, through the
    // focus the browser gives the cell — that half is not this component's.
    await cell(wrapper, 1, 'hiredAt').trigger('focusin')
    await cell(wrapper, 1, 'hiredAt').trigger('click')
    await nextTick()

    expect(wrapper.find('.vt-cell-input').exists()).toBe(false)
    expect(ringAt(wrapper)).toBe('1:hiredAt')
    wrapper.unmount()
  })

  it('leaves a draft alone when a second click lands in the open cell', async () => {
    const { wrapper } = mountTable()
    await cell(wrapper, 1, 'name').trigger('click')
    await nextTick()

    const input = cell(wrapper, 1, 'name').get('.vt-cell-input')
    await input.setValue('Augusta')
    // The second click of a double click, and every click into the editor
    // after it: the draft must survive all of them.
    await input.trigger('click')
    await cell(wrapper, 1, 'name').trigger('click')
    await nextTick()

    expect((cell(wrapper, 1, 'name').get('.vt-cell-input').element as HTMLInputElement).value).toBe(
      'Augusta',
    )
    wrapper.unmount()
  })

  it('opens nothing when the click carries a modifier', async () => {
    const { wrapper } = mountTable()
    await cell(wrapper, 1, 'name').trigger('click', { shiftKey: true })
    await cell(wrapper, 1, 'name').trigger('click', { ctrlKey: true })
    await nextTick()

    // Those belong to selection, and a table that took them would leave an
    // editable column with no range gesture at all.
    expect(wrapper.find('.vt-cell-input').exists()).toBe(false)
    wrapper.unmount()
  })
})

describe('a left click on a table that also selects on one', () => {
  function selectedRowIds(wrapper: Wrapper): string[] {
    return wrapper
      .findAll('tbody tr[data-selected]')
      .map((row) => row.attributes('data-row-id') ?? '')
  }

  it('edits the editable cell and leaves the selection alone', async () => {
    const { wrapper } = mountTable({ rowClickSelect: true })
    await cell(wrapper, 1, 'name').trigger('click')
    await nextTick()

    expect(cell(wrapper, 1, 'name').find('.vt-cell-input').exists()).toBe(true)
    // One click cannot mean both. The editor wins because the checkbox is right
    // there and the cell the user aimed at is not.
    expect(selectedRowIds(wrapper)).toEqual([])
    wrapper.unmount()
  })

  it('still selects from a read-only cell', async () => {
    const { wrapper } = mountTable({ rowClickSelect: true })
    await cell(wrapper, 1, 'hiredAt').trigger('click', { ctrlKey: true })
    await nextTick()

    expect(selectedRowIds(wrapper)).toEqual(['1'])
    wrapper.unmount()
  })

  it('still extends a range across an editable column', async () => {
    const { wrapper } = mountTable({ rowClickSelect: true })
    // Both clicks land on `name`, which is editable — a range gesture that died
    // on the editable columns would be no range gesture at all.
    await cell(wrapper, 1, 'name').trigger('click', { ctrlKey: true })
    await cell(wrapper, 3, 'name').trigger('click', { shiftKey: true })
    await nextTick()

    expect(selectedRowIds(wrapper)).toEqual(['1', '2', '3'])
    expect(wrapper.find('.vt-cell-input').exists()).toBe(false)
    wrapper.unmount()
  })
})

describe('Enter', () => {
  async function focusCell(wrapper: Wrapper, rowId: number, columnId: string) {
    await cell(wrapper, rowId, columnId).trigger('focusin')
    await nextTick()
  }

  it('opens the editor on a cell that has one', async () => {
    const { wrapper } = mountTable()
    await focusCell(wrapper, 1, 'name')
    await cell(wrapper, 1, 'name').trigger('keydown', { key: 'Enter' })
    await nextTick()

    expect(cell(wrapper, 1, 'name').find('.vt-cell-input').exists()).toBe(true)
    wrapper.unmount()
  })

  it('just moves down on a cell that has not', async () => {
    const { wrapper } = mountTable()
    await focusCell(wrapper, 1, 'hiredAt')
    await cell(wrapper, 1, 'hiredAt').trigger('keydown', { key: 'Enter' })
    await nextTick()

    // Enter always means "move down", and additionally opens an editor first
    // when the cell has one.
    expect(wrapper.find('.vt-cell-input').exists()).toBe(false)
    expect(ringAt(wrapper)).toBe('2:hiredAt')
    wrapper.unmount()
  })

  it('commits and opens the editor one row down', async () => {
    const { wrapper, rows, saved } = mountTable()
    await focusCell(wrapper, 1, 'name')
    await cell(wrapper, 1, 'name').trigger('keydown', { key: 'Enter' })
    await nextTick()

    const input = cell(wrapper, 1, 'name').get('.vt-cell-input')
    await input.setValue('Augusta')
    await input.trigger('keydown', { key: 'Enter' })
    await nextTick()
    await nextTick()

    expect(rows.value.find((row) => row.id === 1)!.name).toBe('Augusta')
    expect(ringAt(wrapper)).toBe('2:name')
    // Open, not merely landed on: Enter said this cell was finished, and a
    // column of values is then typed with Enter alone.
    expect(cell(wrapper, 2, 'name').find('.vt-cell-input').exists()).toBe(true)
    // Exactly one, and it is the destination: the cell left behind must be
    // closed, not a second editor still holding the old value.
    expect(wrapper.findAll('.vt-cell-input')).toHaveLength(1)
    // One Enter, one save: the blur on the way out must not count as a second.
    expect(saved).toHaveLength(1)
    wrapper.unmount()
  })

  it('opens nothing when the cell it lands on has no editor', async () => {
    // `salary` is editable, `hiredAt` below-right of it is not. Ctrl+Enter is
    // the sideways commit, so this lands on a read-only cell by moving rather
    // than by running out of rows.
    const { wrapper, saved } = mountTable()
    await focusCell(wrapper, 1, 'salary')
    await cell(wrapper, 1, 'salary').trigger('keydown', { key: 'Enter' })
    await nextTick()

    const input = cell(wrapper, 1, 'salary').get('.vt-cell-input')
    await input.setValue('123')
    await input.trigger('keydown', { key: 'Enter', ctrlKey: true })
    await nextTick()
    await nextTick()

    // The cursor goes where the key said and stops there. No hunting past a
    // read-only column for the next editable one — a cursor whose path
    // depended on editability is one nobody could predict.
    expect(ringAt(wrapper)).toBe('1:hiredAt')
    expect(wrapper.find('.vt-cell-input').exists()).toBe(false)
    expect(saved).toHaveLength(1)
    wrapper.unmount()
  })

  it('opens the next cell in the same row without the leaving blur closing it', async () => {
    // Sideways is the case the blur guard exists for: the editor left behind
    // blurs *after* the next draft is open, and on the same row, so "is this
    // row editing" cannot tell the two apart.
    const { wrapper, rows, saved } = mountTable({ editable: ['department', 'salary'] })
    await focusCell(wrapper, 1, 'department')
    await cell(wrapper, 1, 'department').trigger('keydown', { key: 'Enter' })
    await nextTick()

    const input = cell(wrapper, 1, 'department').get('.vt-cell-input')
    await input.setValue('Ops')
    await input.trigger('keydown', { key: 'Enter', ctrlKey: true })
    await nextTick()
    await nextTick()
    // The blur arrives after the DOM has been patched, if it arrives at all.
    await cell(wrapper, 1, 'department').trigger('blur')
    await nextTick()

    expect(rows.value.find((row) => row.id === 1)!.department).toBe('Ops')
    expect(ringAt(wrapper)).toBe('1:salary')
    expect(cell(wrapper, 1, 'salary').find('.vt-cell-input').exists()).toBe(true)
    // One save, not two: the stray blur must not commit the draft that just
    // opened, which would close it a frame after it appeared.
    expect(saved).toHaveLength(1)
    wrapper.unmount()
  })

  it('opens the editor holding the character that was typed', async () => {
    const { wrapper } = mountTable()
    await focusCell(wrapper, 1, 'name')
    await cell(wrapper, 1, 'name').trigger('keydown', { key: 'A' })
    await nextTick()

    const input = cell(wrapper, 1, 'name').get('.vt-cell-input')
    // The typed character *is* the new value — the old one is gone rather than
    // appended to, which is what makes retyping a cell one gesture.
    expect((input.element as HTMLInputElement).value).toBe('A')
    wrapper.unmount()
  })

  it('typeaheads to an option instead of seeding a select with the letter', async () => {
    const { wrapper } = mountTable({
      editable: ['name', 'department'],
      selectOptions: DEPARTMENTS,
    })
    await focusCell(wrapper, 1, 'department')
    await cell(wrapper, 1, 'department').trigger('keydown', { key: 'r' })
    await nextTick()

    // The trigger shows what the cell now holds; the panel is teleported.
    expect(cell(wrapper, 1, 'department').get('.vt-select-trigger').text()).toBe('Research')
    wrapper.unmount()
  })

  it('opens a select on the value that was there when the letter names nothing', async () => {
    const { wrapper } = mountTable({
      editable: ['name', 'department'],
      selectOptions: DEPARTMENTS,
    })
    await focusCell(wrapper, 1, 'department')
    await cell(wrapper, 1, 'department').trigger('keydown', { key: 'z' })
    await nextTick()

    // The editor opens, because the keystroke did say "edit this" — but on the
    // value the cell held. Seeding "z" was one keystroke into a draft the
    // option list does not contain and `validateCell` is waiting to reject.
    expect(cell(wrapper, 1, 'department').get('.vt-select-trigger').text()).toBe('Engineering')
    wrapper.unmount()
  })

  it('moves the cursor out of a select once its panel is closed', async () => {
    const { wrapper } = mountTable({
      editable: ['department', 'salary'],
      selectOptions: DEPARTMENTS,
    })
    await focusCell(wrapper, 1, 'department')
    await cell(wrapper, 1, 'department').trigger('keydown', { key: 'Enter' })
    await nextTick()
    await nextTick()

    const trigger = cell(wrapper, 1, 'department').get('.vt-select-trigger')
    // Escape closes the panel and leaves the edit open, which is exactly the
    // state the arrows used to be dead in: the cell had no exit but Enter,
    // Tab and a second Escape.
    await trigger.trigger('keydown', { key: 'Escape' })
    await nextTick()
    await trigger.trigger('keydown', { key: 'ArrowDown' })
    await nextTick()
    await nextTick()

    expect(ringAt(wrapper)).toBe('2:department')
    wrapper.unmount()
  })

  it('opens a checkbox unchanged — a character is not a boolean', async () => {
    const { wrapper } = mountTable({ editable: ['name', 'active'] })
    await focusCell(wrapper, 1, 'active')
    await cell(wrapper, 1, 'active').trigger('keydown', { key: 'x' })
    await nextTick()

    const box = cell(wrapper, 1, 'active').get('.vt-cell-checkbox').element as HTMLInputElement
    expect(box.checked).toBe(true)
    wrapper.unmount()
  })

  it('leaves the typed character standing, caret after it', async () => {
    const { wrapper } = mountTable()
    await focusCell(wrapper, 1, 'name')
    await cell(wrapper, 1, 'name').trigger('keydown', { key: 'A' })
    await nextTick()
    await nextTick()

    const element = cell(wrapper, 1, 'name').get('.vt-cell-input')
      .element as HTMLInputElement
    // Selected, the very next keystroke would replace the character that
    // opened the cell — the one gesture becomes two again.
    expect(element.selectionStart).toBe(1)
    expect(element.selectionEnd).toBe(1)
    wrapper.unmount()
  })

  it('opens a cell with its value selected when nothing was typed', async () => {
    const { wrapper } = mountTable()
    await focusCell(wrapper, 1, 'name')
    await cell(wrapper, 1, 'name').trigger('keydown', { key: 'Enter' })
    await nextTick()
    await nextTick()

    const element = cell(wrapper, 1, 'name').get('.vt-cell-input')
      .element as HTMLInputElement
    expect(element.value).toBe('Ada Lovelace')
    // Retyping the cell is what opening it usually means, so the first
    // keystroke replaces the value the way a spreadsheet does.
    expect(element.selectionStart).toBe(0)
    expect(element.selectionEnd).toBe(element.value.length)
    wrapper.unmount()
  })

  it('selects the value again in the cell an editor moved on to', async () => {
    const { wrapper } = mountTable()
    await focusCell(wrapper, 1, 'name')
    // Typed open, so this first cell is the unselected one — and the cell
    // Enter lands on must not inherit that.
    await cell(wrapper, 1, 'name').trigger('keydown', { key: 'A' })
    await nextTick()
    await cell(wrapper, 1, 'name').get('.vt-cell-input').trigger('keydown', { key: 'Enter' })
    await nextTick()
    await nextTick()

    const element = cell(wrapper, 2, 'name').get('.vt-cell-input')
      .element as HTMLInputElement
    expect(element.selectionStart).toBe(0)
    expect(element.selectionEnd).toBe(element.value.length)
    wrapper.unmount()
  })

  it('opens the cell empty on Delete, and saves the clear', async () => {
    const { wrapper, rows } = mountTable()
    await focusCell(wrapper, 1, 'name')
    await cell(wrapper, 1, 'name').trigger('keydown', { key: 'Delete' })
    await nextTick()

    const input = cell(wrapper, 1, 'name').get('.vt-cell-input')
    expect((input.element as HTMLInputElement).value).toBe('')
    // A draft like any other: it is the commit that clears the cell, so
    // Escape still puts the value back.
    await input.trigger('keydown', { key: 'Enter' })
    await nextTick()
    await nextTick()
    expect(rows.value.find((row) => row.id === 1)!.name).toBe(null)
    wrapper.unmount()
  })

  it('types nothing into a read-only cell, and moves nothing either', async () => {
    const { wrapper } = mountTable()
    await focusCell(wrapper, 1, 'hiredAt')
    await cell(wrapper, 1, 'hiredAt').trigger('keydown', { key: 'x' })
    await nextTick()

    expect(wrapper.find('.vt-cell-input').exists()).toBe(false)
    // Unlike Enter, a printable key is not a movement gesture with an editor
    // in front of it — there is nothing left to do with it.
    expect(ringAt(wrapper)).toBe('1:hiredAt')
    wrapper.unmount()
  })

  it('commits and opens the cell an arrow leaves an editor for', async () => {
    const { wrapper, rows, saved } = mountTable()
    await focusCell(wrapper, 1, 'name')
    await cell(wrapper, 1, 'name').trigger('keydown', { key: 'A' })
    await nextTick()

    const input = cell(wrapper, 1, 'name').get('.vt-cell-input')
    await input.setValue('Augusta')
    await input.trigger('keydown', { key: 'ArrowDown' })
    await nextTick()
    await nextTick()

    // Otherwise an editor opened by typing is a cell there is no arrow out of.
    expect(rows.value.find((row) => row.id === 1)!.name).toBe('Augusta')
    expect(ringAt(wrapper)).toBe('2:name')
    // Open, the same as Enter's destination: the arrow came out of an editor,
    // which is the user saying they are editing, and a closed cell would make
    // them say it again. An arrow on a *closed* cell never commits, so this is
    // not every arrow — only the ones that leave a draft behind.
    expect(cell(wrapper, 2, 'name').find('.vt-cell-input').exists()).toBe(true)
    expect(wrapper.findAll('.vt-cell-input')).toHaveLength(1)
    expect(saved).toHaveLength(1)
    wrapper.unmount()
  })

  it('leaves an arrow on a read-only destination closed', async () => {
    // The same rule Enter follows: the cursor goes where the key said, and a
    // cell with no editor simply has none opened.
    const { wrapper, saved } = mountTable()
    await focusCell(wrapper, 1, 'salary')
    await cell(wrapper, 1, 'salary').trigger('keydown', { key: 'Enter' })
    await nextTick()

    const input = cell(wrapper, 1, 'salary').get('.vt-cell-input')
    await input.setValue('123')
    await input.trigger('keydown', { key: 'ArrowRight' })
    await nextTick()
    await nextTick()

    expect(ringAt(wrapper)).toBe('1:hiredAt')
    expect(wrapper.find('.vt-cell-input').exists()).toBe(false)
    expect(saved).toHaveLength(1)
    wrapper.unmount()
  })

  it('goes up with Shift, right with Ctrl, and left with both', async () => {
    // From `salary`, which is editable and has a column on either side of it —
    // `department` to its left, `hiredAt` to its right — so no case is really
    // a clamp wearing a direction's clothes.
    const cases = [
      { event: { shiftKey: true }, landsOn: '1:salary' },
      { event: { ctrlKey: true }, landsOn: '2:hiredAt' },
      { event: { ctrlKey: true, shiftKey: true }, landsOn: '2:department' },
    ] as const

    for (const expected of cases) {
      const { wrapper } = mountTable()
      await focusCell(wrapper, 2, 'salary')
      await cell(wrapper, 2, 'salary').trigger('keydown', { key: 'Enter' })
      await nextTick()
      await cell(wrapper, 2, 'salary')
        .get('.vt-cell-input')
        .trigger('keydown', { key: 'Enter', ...expected.event })
      await nextTick()
      await nextTick()

      expect(ringAt(wrapper)).toBe(expected.landsOn)
      wrapper.unmount()
    }
  })

  it('stays put when the save is refused', async () => {
    const { wrapper, saved } = mountTable({
      session: { save: async () => Promise.reject(new Error('Nope')) },
    })
    await focusCell(wrapper, 1, 'name')
    await cell(wrapper, 1, 'name').trigger('keydown', { key: 'Enter' })
    await nextTick()

    const input = cell(wrapper, 1, 'name').get('.vt-cell-input')
    await input.setValue('Augusta')
    await input.trigger('keydown', { key: 'Enter' })
    await nextTick()
    await nextTick()

    // Moving would scroll the message explaining the failure out from under
    // the user, so the cursor does not.
    expect(ringAt(wrapper)).toBe('1:name')
    expect(cell(wrapper, 1, 'name').find('.vt-cell-input').exists()).toBe(true)
    expect(saved).toHaveLength(0)
    wrapper.unmount()
  })
})

describe('Escape', () => {
  it('puts the cell back and hands the focus to the cell', async () => {
    const { wrapper, rows } = mountTable()
    await cell(wrapper, 1, 'name').trigger('focusin')
    await cell(wrapper, 1, 'name').trigger('keydown', { key: 'Enter' })
    await nextTick()

    const input = cell(wrapper, 1, 'name').get('.vt-cell-input')
    await input.setValue('Augusta')
    await input.trigger('keydown', { key: 'Escape' })
    await nextTick()
    await nextTick()

    expect(rows.value.find((row) => row.id === 1)!.name).toBe('Ada Lovelace')
    // Without this the editor unmounts and the focus falls all the way to
    // <body>, stranding a keyboard user outside the table they were in.
    expect(document.activeElement).toBe(cell(wrapper, 1, 'name').element)
    wrapper.unmount()
  })
})

describe('Ctrl and an arrow', () => {
  /** The pager's next-page control, and its last-page one. */
  function next(wrapper: Wrapper) {
    return wrapper.get('.vt-pagination-controls button[aria-label="Next page"]')
  }

  function last(wrapper: Wrapper) {
    return wrapper.get('.vt-pagination-controls button[aria-label="Last page"]')
  }

  it('turns the page and keeps the cursor at the same offset and column', async () => {
    const { wrapper } = mountTable({ pageSize: 3 })
    expect(pageIds(wrapper)).toEqual(['1', '2', '3'])

    // Second row, third column — an offset and a column that are both wrong if
    // either half of the re-anchor is dropped.
    await cell(wrapper, 2, 'salary').trigger('focusin')
    expect(ringAt(wrapper)).toBe('2:salary')

    await cell(wrapper, 2, 'salary').trigger('keydown', { key: 'ArrowRight', ctrlKey: true })
    await nextTick()
    expect(pageIds(wrapper)).toEqual(['4', '5', '6'])
    // Second row of the new page, same column. Re-anchoring to the top would
    // make every page turn cost a second gesture to get back to reading height.
    expect(ringAt(wrapper)).toBe('5:salary')
    // And the caret goes with it: the cell it was on has left the document, so
    // leaving the focus alone strands the keyboard user on <body>.
    expect(document.activeElement).toBe(cell(wrapper, 5, 'salary').element)

    await cell(wrapper, 5, 'salary').trigger('keydown', { key: 'ArrowLeft', ctrlKey: true })
    await nextTick()
    expect(pageIds(wrapper)).toEqual(['1', '2', '3'])
    expect(ringAt(wrapper)).toBe('2:salary')

    wrapper.unmount()
  })

  it('clamps to a short last page rather than landing nowhere', async () => {
    const { wrapper } = mountTable({ pageSize: 3 })
    await cell(wrapper, 3, 'name').trigger('focusin')

    await cell(wrapper, 3, 'name').trigger('keydown', { key: 'ArrowRight', ctrlKey: true })
    await nextTick()
    expect(ringAt(wrapper)).toBe('6:name')

    // Page 3 holds one row, and the cursor was on the third.
    await cell(wrapper, 6, 'name').trigger('keydown', { key: 'ArrowRight', ctrlKey: true })
    await nextTick()
    expect(pageIds(wrapper)).toEqual(['7'])
    expect(ringAt(wrapper)).toBe('7:name')

    wrapper.unmount()
  })

  it('does nothing at all at either end', async () => {
    const { wrapper } = mountTable({ pageSize: 3 })
    await cell(wrapper, 2, 'name').trigger('focusin')

    // Already on page 1. The page cannot move, so the cursor must not either —
    // re-anchoring anyway would yank it to a page it never left.
    await cell(wrapper, 2, 'name').trigger('keydown', { key: 'ArrowLeft', ctrlKey: true })
    await nextTick()
    expect(pageIds(wrapper)).toEqual(['1', '2', '3'])
    expect(ringAt(wrapper)).toBe('2:name')

    wrapper.unmount()
  })

  it('carries the cursor across a page turn from the pager as well', async () => {
    const { wrapper } = mountTable({ pageSize: 3 })
    await cell(wrapper, 2, 'salary').trigger('focusin')
    expect(ringAt(wrapper)).toBe('2:salary')

    // The mouse route. It reaches `setPage` rather than the grid's key handler,
    // and used to leave the cursor naming a row no page holds: no ring at all,
    // and the focused cell gone from the document.
    await next(wrapper).trigger('click')
    await nextTick()
    expect(pageIds(wrapper)).toEqual(['4', '5', '6'])
    expect(ringAt(wrapper)).toBe('5:salary')
    expect(document.activeElement).toBe(cell(wrapper, 5, 'salary').element)

    wrapper.unmount()
  })

  it('clamps a pager page turn to a short last page', async () => {
    const { wrapper } = mountTable({ pageSize: 3 })
    await cell(wrapper, 3, 'name').trigger('focusin')

    await last(wrapper).trigger('click')
    await nextTick()
    // Page 3 holds one row, and the cursor was on the third.
    expect(pageIds(wrapper)).toEqual(['7'])
    expect(ringAt(wrapper)).toBe('7:name')

    wrapper.unmount()
  })

  it('carries the cursor across a page size change', async () => {
    const { wrapper } = mountTable({ pageSize: 3 })
    await cell(wrapper, 2, 'salary').trigger('focusin')
    await next(wrapper).trigger('click')
    await nextTick()
    expect(ringAt(wrapper)).toBe('5:salary')

    // A new size sends the table back to page 1, so the rows under the cursor
    // are replaced exactly as a page turn replaces them.
    const select = wrapper.get('.vt-pagination-size select')
    await select.setValue('10')
    await nextTick()
    expect(pageIds(wrapper)).toEqual(['1', '2', '3', '4', '5', '6', '7'])
    expect(ringAt(wrapper)).toBe('2:salary')
    expect(document.activeElement).toBe(cell(wrapper, 2, 'salary').element)

    wrapper.unmount()
  })

  it('keeps the default anchor at the top of the new page', async () => {
    const { wrapper } = mountTable({ pageSize: 3 })
    // Nobody has moved the cursor: it sits where the table put it, on the first
    // cell. A page turn keeps that offset rather than losing the ring, and the
    // caret follows it as it does from any other offset.
    expect(ringAt(wrapper)).toBe('1:name')

    await next(wrapper).trigger('click')
    await nextTick()
    expect(pageIds(wrapper)).toEqual(['4', '5', '6'])
    expect(ringAt(wrapper)).toBe('4:name')
    expect(document.activeElement).toBe(cell(wrapper, 4, 'name').element)

    wrapper.unmount()
  })

  it('leaves the unmodified arrow meaning one cell', async () => {
    const { wrapper } = mountTable({ pageSize: 3 })
    await cell(wrapper, 2, 'name').trigger('focusin')

    await cell(wrapper, 2, 'name').trigger('keydown', { key: 'ArrowRight' })
    await nextTick()
    expect(pageIds(wrapper)).toEqual(['1', '2', '3'])
    expect(ringAt(wrapper)).toBe('2:department')

    wrapper.unmount()
  })

  it('is inert on a table with no cursor', async () => {
    const { wrapper } = mountTable({ cellCursor: false, pageSize: 3 })
    // No listeners are bound at all without a cursor, so the key reaches
    // nothing — the table pages by its pager and by nothing else.
    await wrapper.get('tbody tr:nth-child(2) td').trigger('keydown', {
      key: 'ArrowRight',
      ctrlKey: true,
    })
    await nextTick()
    expect(wrapper.findAll('tbody tr')).toHaveLength(3)
    expect(wrapper.get('tbody tr:first-child td').text()).toContain('Ada')
    wrapper.unmount()
  })
})

describe('a blur that follows a commit', () => {
  it('does not report a second save', async () => {
    // The hazard `commitRow`'s guard exists for. Whether the unmounting input
    // fires a blur at all is browser-dependent, so the guard is asserted by
    // firing one explicitly rather than by hoping the environment does.
    const { wrapper, saved } = mountTable()
    await cell(wrapper, 1, 'name').trigger('focusin')
    await cell(wrapper, 1, 'name').trigger('keydown', { key: 'Enter' })
    await nextTick()

    const input = cell(wrapper, 1, 'name').get('.vt-cell-input')
    await input.setValue('Augusta')
    await input.trigger('keydown', { key: 'Enter' })
    await nextTick()
    await nextTick()
    await input.trigger('blur')
    await nextTick()
    await nextTick()

    expect(saved).toHaveLength(1)
    wrapper.unmount()
  })
})

/**
 * The pinned band's width, handed to the stylesheet.
 *
 * jsdom lays nothing out and scrolls nothing, so what a browser does with
 * `scroll-padding` is not assertable here. What is assertable is the number the
 * rule reads — and getting *that* wrong is the whole bug, because a pinned cell
 * is `position: sticky` and the browser's scroll-into-view will happily park a
 * focused cell underneath it.
 */
describe('the scroll box and the pinned bands', () => {
  function mountPinned(options: {
    columns: ColumnDef<Person>[]
    layout?: { widths?: Record<string, number>; pinned?: Record<string, 'left' | 'right' | false> }
  }) {
    const rows = shallowRef<Person[]>([...people])
    const Host = defineComponent({
      setup() {
        const state = useTableState({ pageSize: 25 })
        const source = useLocalDataSource<Person>(rows, options.columns, state.query, {
          debounceMs: 0,
        })
        return () =>
          h(DataTable as never, {
            columns: options.columns,
            source,
            state,
            cellCursor: true,
            initialLayout: options.layout,
          })
      },
    })
    return mount(Host, { attachTo: document.body })
  }

  /** The two custom properties, as the scroll box carries them. */
  function pins(wrapper: ReturnType<typeof mountPinned>): [string, string] {
    const box = wrapper.get('.vt-scroll').element as HTMLElement
    return [box.style.getPropertyValue('--vtc-pin-left'), box.style.getPropertyValue('--vtc-pin-right')]
  }

  it('insets by nothing when nothing is pinned', () => {
    const wrapper = mountPinned({ columns: personColumns })
    expect(pins(wrapper)).toEqual(['0px', '0px'])
    wrapper.unmount()
  })

  it('sums each side, and counts a declared width rather than assuming the default', () => {
    const wrapper = mountPinned({
      columns: personColumns.map((column) => {
        if (column.id === 'name') return { ...column, pinned: 'left' as const, width: 220 }
        // Two on one side, so a sum is being asserted and not just a lookup.
        if (column.id === 'department') return { ...column, pinned: 'left' as const }
        if (column.id === 'active') return { ...column, pinned: 'right' as const, width: 80 }
        return column
      }),
    })
    // 220 declared + 160, the default width `useColumns` gives a column that
    // declares none — the same number it accumulates into `pinOffset` to place
    // the sticky cells, which is why this is derived and not measured.
    expect(pins(wrapper)).toEqual(['380px', '80px'])
    wrapper.unmount()
  })

  it('follows the layout state, not the declarations', () => {
    // A pin and a resize the user made. Reading the declarations alone would
    // leave the padding describing a table nobody is looking at.
    const wrapper = mountPinned({
      columns: personColumns,
      layout: { pinned: { salary: 'left' }, widths: { salary: 130 } },
    })
    expect(pins(wrapper)).toEqual(['130px', '0px'])
    wrapper.unmount()
  })
})

/**
 * `autofocusCursor`: the caret on load, for the page where the table is the
 * point of it.
 *
 * The default matters as much as the feature. Every other way the cursor is
 * seeded is deliberately silent — the ring appears and the caret stays wherever
 * the user left it — so this is the one opt-in that is allowed to move it, and
 * only once.
 */
describe('autofocusCursor', () => {
  function mountAuto(options: {
    autofocusCursor?: boolean
    cellCursor?: boolean
    initialCursor?: { rowId: number; columnId: string }
    startEmpty?: boolean
  }) {
    const rows = shallowRef<Person[]>(options.startEmpty ? [] : [...people])
    const Host = defineComponent({
      setup() {
        const state = useTableState({ pageSize: 25 })
        const source = useLocalDataSource<Person>(rows, personColumns, state.query, {
          debounceMs: 0,
        })
        return () =>
          h(DataTable as never, {
            columns: personColumns,
            source,
            state,
            cellCursor: options.cellCursor ?? true,
            autofocusCursor: options.autofocusCursor,
            initialCursor: options.initialCursor,
          })
      },
    })
    return { wrapper: mount(Host, { attachTo: document.body }), rows }
  }

  /** The cell holding the caret, as `row/column`, or undefined for none. */
  function focused(): string | undefined {
    const active = document.activeElement as HTMLElement | null
    if (!active || active.tagName !== 'TD') return undefined
    const rowId = active.closest('tr')?.getAttribute('data-row-id')
    return `${rowId}/${active.getAttribute('data-column')}`
  }

  it('leaves the caret alone by default', async () => {
    const { wrapper } = mountAuto({})
    await nextTick()
    expect(focused()).toBeUndefined()
    wrapper.unmount()
  })

  it('takes the caret on mount when asked', async () => {
    const { wrapper } = mountAuto({ autofocusCursor: true })
    await nextTick()
    expect(focused()).toBe('1/name')
    wrapper.unmount()
  })

  it('lands on the seeded cell rather than the first', async () => {
    const { wrapper } = mountAuto({
      autofocusCursor: true,
      initialCursor: { rowId: 3, columnId: 'salary' },
    })
    await nextTick()
    expect(focused()).toBe('3/salary')
    wrapper.unmount()
  })

  it('has nothing to focus without a cursor', async () => {
    const { wrapper } = mountAuto({ autofocusCursor: true, cellCursor: false })
    await nextTick()
    expect(focused()).toBeUndefined()
    wrapper.unmount()
  })

  it('waits for the rows a source has not produced yet', async () => {
    // The case that makes this a watch rather than a call: a server source has
    // no cell to give the caret to at mount, and asking then would spend the
    // request on nothing.
    const { wrapper, rows } = mountAuto({ autofocusCursor: true, startEmpty: true })
    await nextTick()
    expect(focused()).toBeUndefined()

    rows.value = [...people]
    await nextTick()
    await nextTick()
    expect(focused()).toBe('1/name')
    wrapper.unmount()
  })

  it('does not chase the rows a second time', async () => {
    // One shot. A re-filter that replaces every row must not pull the caret
    // back out of whatever the user moved it to — the search box, most often.
    const { wrapper, rows } = mountAuto({ autofocusCursor: true })
    await nextTick()
    ;(document.activeElement as HTMLElement).blur()

    rows.value = people.filter((person) => person.id !== 1)
    await nextTick()
    await nextTick()
    expect(focused()).toBeUndefined()
    wrapper.unmount()
  })
})

/**
 * The same page turn, over a source that answers over the network.
 *
 * The local version of this lives in `Ctrl and an arrow` above, and it passed
 * throughout the bug this covers: a local source hands back the new page in the
 * same tick the page field is written, so re-anchoring against "the rows on
 * screen" happens to be right. A remote one is still showing the page being
 * left — for the whole fetch, with the default `keepPreviousData` — so the same
 * re-anchor put the ring on a row that then left the document, taking the caret
 * to `<body>` with it.
 */
describe('a page turn on a server source', () => {
  function mountServerTable() {
    const pending: ((page: { rows: Person[]; total: number }) => void)[] = []
    const Host = defineComponent({
      setup() {
        const state = useTableState({ pageSize: 3 })
        const source = useServerDataSource<Person>(
          () =>
            new Promise<{ rows: Person[]; total: number }>((resolve) => {
              pending.push(resolve)
            }),
          state.query,
          { debounceMs: 0 },
        )
        return () =>
          h(DataTable as never, { columns: personColumns, source, state, cellCursor: true })
      },
    })
    const wrapper = mount(Host, { attachTo: document.body })
    /** Answers the request in flight with a slice of `people`. */
    const land = async (from: number, to: number) => {
      pending.shift()!({ rows: people.slice(from, to), total: people.length })
      await nextTick()
      await nextTick()
      await nextTick()
    }
    return { wrapper: wrapper as unknown as Wrapper, land }
  }

  it('holds the ring on the page in view, then carries it to the one that arrives', async () => {
    const { wrapper, land } = mountServerTable()
    await land(0, 3)
    expect(pageIds(wrapper)).toEqual(['1', '2', '3'])

    // A real `focus()` rather than a synthetic `focusin`, because half of what
    // this asserts is where the caret is, and only the former puts it anywhere.
    ;(cell(wrapper, 2, 'salary').element as HTMLElement).focus()
    await nextTick()
    expect(ringAt(wrapper)).toBe('2:salary')
    expect(document.activeElement).toBe(cell(wrapper, 2, 'salary').element)

    await wrapper
      .get('.vt-pagination-controls button[aria-label="Next page"]')
      .trigger('click')
    await nextTick()
    // Mid-flight: the rows have not moved, so neither has the ring or the
    // caret. Re-anchoring here is what used to strand both.
    expect(pageIds(wrapper)).toEqual(['1', '2', '3'])
    expect(ringAt(wrapper)).toBe('2:salary')
    expect(document.activeElement).toBe(cell(wrapper, 2, 'salary').element)

    await land(3, 6)
    expect(pageIds(wrapper)).toEqual(['4', '5', '6'])
    // Second row of the new page, same column, caret with it — the same
    // promise the local page turn keeps.
    expect(ringAt(wrapper)).toBe('5:salary')
    expect(document.activeElement).toBe(cell(wrapper, 5, 'salary').element)
    wrapper.unmount()
  })
})

/**
 * Sorting under a set cursor, and where the caret is left afterwards.
 *
 * The ring keeps the place on the screen, which `tests/useTable.spec.ts` proves
 * on its own. What needs a DOM is the other half: a sort is a click on a button
 * inside the same `<table>`, and that button has to keep the focus, or a second
 * Enter cannot reverse the direction it just set.
 */
describe('a cursor across a sort', () => {
  it('keeps the ring at its offset and leaves the caret on the sort button', async () => {
    const { wrapper } = mountTable({ pageSize: 3 })
    await cell(wrapper, 2, 'salary').trigger('focusin')
    await nextTick()
    expect(ringAt(wrapper)).toBe('2:salary')

    const sort = wrapper.get('thead th[data-column="name"] button.vt-sort')
    ;(sort.element as HTMLElement).focus()
    await sort.trigger('click')
    await nextTick()

    // Ada, Alan, Barbara — and the ring on the second of them, where it was.
    expect(pageIds(wrapper)).toEqual(['1', '3', '7'])
    expect(ringAt(wrapper)).toBe('3:salary')
    expect(document.activeElement).toBe(sort.element)
    wrapper.unmount()
  })

  it('carries the caret when it was already on a cell', async () => {
    const { wrapper, state } = mountTable({ pageSize: 3 })
    const focused = cell(wrapper, 2, 'salary')
    ;(focused.element as HTMLElement).focus()
    await focused.trigger('focusin')
    await nextTick()

    // Sorted from somewhere that is not the header — a toolbar, a saved view —
    // so the caret is on the cell and has nowhere else to be.
    state.setSort('name', 'asc')
    await nextTick()

    expect(ringAt(wrapper)).toBe('3:salary')
    expect(document.activeElement).toBe(cell(wrapper, 3, 'salary').element)
    wrapper.unmount()
  })
})
