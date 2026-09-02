import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h, nextTick, shallowRef } from 'vue'
import DataTable from '../src/components/preset/DataTable.vue'
import { useLocalDataSource } from '../src/core/useLocalDataSource'
import { useTableState } from '../src/core/useTableState'
import type { ColumnDef } from '../src/core/types'
import { people, personColumns, type Person } from './fixtures'

/**
 * The column under the pointer, end to end through the preset.
 *
 * The tint itself is CSS and jsdom applies none, so what is asserted here is
 * the contract the stylesheet hangs off: which cells carry `data-column-hover`,
 * and — the half that is easy to break later — everything a pointer move is not
 * allowed to touch.
 */

function mountTable(
  options: { cellCursor?: boolean; columns?: ColumnDef<Person>[] } = {},
) {
  const columns = options.columns ?? personColumns
  const rows = shallowRef<Person[]>([...people])

  const Host = defineComponent({
    setup() {
      const state = useTableState({ pageSize: 25 })
      const source = useLocalDataSource<Person>(rows, columns, state.query, { debounceMs: 0 })
      return () =>
        h(DataTable as never, {
          columns,
          source,
          state,
          cellCursor: options.cellCursor ?? false,
        })
    },
  })

  return mount(Host, { attachTo: document.body })
}

type Wrapper = ReturnType<typeof mountTable>

function cell(wrapper: Wrapper, rowIndex: number, columnId: string) {
  return wrapper.get(`tbody tr:nth-child(${rowIndex}) td[data-column="${columnId}"]`)
}

/** Every column that has a cell marked as hovered, `<th>` and `<td>` alike. */
function hovered(wrapper: Wrapper): string[] {
  const ids = new Set<string>()
  for (const marked of wrapper.findAll('[data-column-hover]')) {
    const id = marked.attributes('data-column')
    if (id) ids.add(id)
  }
  return [...ids]
}

describe('the column under the pointer', () => {
  it('marks that column and only that column, header included', async () => {
    const wrapper = mountTable()
    await cell(wrapper, 1, 'salary').trigger('pointerover')

    expect(hovered(wrapper)).toEqual(['salary'])
    // Every body cell of the column, not just the one the pointer is in.
    expect(cell(wrapper, 1, 'salary').attributes('data-column-hover')).toBe('true')
    expect(cell(wrapper, 3, 'salary').attributes('data-column-hover')).toBe('true')
    expect(
      wrapper.get('thead th[data-column="salary"]').attributes('data-column-hover'),
    ).toBe('true')
    expect(cell(wrapper, 1, 'name').attributes('data-column-hover')).toBeUndefined()
    wrapper.unmount()
  })

  it('follows the pointer out of the cell it started in', async () => {
    const wrapper = mountTable()
    await cell(wrapper, 1, 'salary').trigger('pointerover')

    // A header cell is a cell too: one listener on `.vt-scroll` sees both.
    await wrapper.get('thead th[data-column="name"]').trigger('pointerover')
    expect(hovered(wrapper)).toEqual(['name'])

    // And something inside a cell resolves to the cell around it — the pointer
    // is over a `<span>` or a sort button far more often than over the `<td>`.
    await wrapper.get('thead th[data-column="active"] .vt-th-inner').trigger('pointerover')
    expect(hovered(wrapper)).toEqual(['active'])
    wrapper.unmount()
  })

  it('clears when the pointer leaves the table', async () => {
    const wrapper = mountTable()
    await cell(wrapper, 1, 'name').trigger('pointerover')
    expect(hovered(wrapper)).toEqual(['name'])

    await wrapper.get('.vt-scroll').trigger('pointerleave')
    expect(hovered(wrapper)).toEqual([])
    wrapper.unmount()
  })

  it('ignores touch, which has no way to say it has left', async () => {
    const wrapper = mountTable()
    await cell(wrapper, 1, 'name').trigger('pointerover', { pointerType: 'touch' })

    expect(hovered(wrapper)).toEqual([])
    wrapper.unmount()
  })

  it('leaves the cell cursor exactly where it was', async () => {
    const wrapper = mountTable({ cellCursor: true })
    await cell(wrapper, 2, 'salary').trigger('focusin')
    await nextTick()

    const tabStop = wrapper.get('tbody td[tabindex="0"]')
    await cell(wrapper, 1, 'name').trigger('pointerover')

    // The ring, the crosshair and the one way in are all where the keyboard
    // left them; the hover mark is the only thing the pointer moved.
    expect(wrapper.get('tbody td[data-cursor="cell"]').attributes('data-column')).toBe('salary')
    expect(wrapper.get('tbody td[tabindex="0"]').element).toBe(tabStop.element)
    expect(wrapper.get('tbody tr[data-cursor]').attributes('data-row-id')).toBe('2')
    expect(hovered(wrapper)).toEqual(['name'])
    // And a cell can be in both at once, which is why they are two attributes.
    const both = cell(wrapper, 2, 'salary')
    await both.trigger('pointerover')
    expect(both.attributes('data-cursor')).toBe('cell')
    expect(both.attributes('data-column-hover')).toBe('true')
    wrapper.unmount()
  })

  it('re-derives no cell value when it moves', async () => {
    const format = vi.fn((value: unknown) => String(value))
    const columns: ColumnDef<Person>[] = personColumns.map((column) =>
      column.id === 'name' ? { ...column, format } : column,
    )
    const wrapper = mountTable({ columns })
    await cell(wrapper, 1, 'name').trigger('pointerover')
    format.mockClear()

    // Across three columns, so the state is written twice and every rendered
    // row re-renders both times. `TableRow.cells` must not be part of that:
    // it resolves an accessor and runs `format()` per column, and a pointer
    // sweeping a wide table would re-derive the whole page per boundary.
    await cell(wrapper, 1, 'salary').trigger('pointerover')
    await cell(wrapper, 1, 'active').trigger('pointerover')

    expect(format).not.toHaveBeenCalled()
    wrapper.unmount()
  })
})
