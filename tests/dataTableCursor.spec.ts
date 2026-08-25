import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h, nextTick, shallowRef } from 'vue'
import DataTable from '../src/components/preset/DataTable.vue'
import { useLocalDataSource } from '../src/core/useLocalDataSource'
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

const columns: ColumnDef<Person>[] = personColumns.map((column) =>
  column.id === 'name' || column.id === 'salary' ? { ...column, editable: true } : column,
)

type SessionOptions = Partial<Parameters<typeof useRowEditing<Person>>[2]>

function mountTable(
  options: { cellCursor?: boolean; pageSize?: number; session?: SessionOptions } = {},
) {
  const rows = shallowRef<Person[]>([...people])
  const saves: RowChange<Person>[] = []
  const saved: Person[] = []

  const Host = defineComponent({
    setup() {
      const state = useTableState({ pageSize: options.pageSize ?? 25 })
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
          onRowSaved: (row: Person) => saved.push(row),
        })
    },
  })

  return { wrapper: mount(Host, { attachTo: document.body }), rows, saves, saved }
}

type Wrapper = ReturnType<typeof mountTable>['wrapper']

function cell(wrapper: Wrapper, rowId: number, columnId: string) {
  return wrapper.get(`tbody tr[data-row-id="${rowId}"] td[data-column="${columnId}"]`)
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

  it('commits and lands one row down, read-only', async () => {
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
    // Landed there, not opened there — typing is what starts the next edit.
    expect(wrapper.find('.vt-cell-input').exists()).toBe(false)
    // One Enter, one save: the blur on the way out must not count as a second.
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
  /** The row ids the body is showing, top to bottom. */
  function pageIds(wrapper: Wrapper): string[] {
    return wrapper
      .findAll('tbody tr[data-row-id]')
      .map((row) => row.attributes('data-row-id')!)
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
    return [box.style.getPropertyValue('--vt-pin-left'), box.style.getPropertyValue('--vt-pin-right')]
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
