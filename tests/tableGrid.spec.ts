import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h, shallowRef } from 'vue'
import TableGrid from '../src/components/primitives/TableGrid.vue'
import { useCellCursor } from '../src/core/useCellCursor'
import type { ResolvedColumn } from '../src/core/types'

/**
 * Columns over a plain record rather than a `Person`, the way
 * `headerGroups.spec.ts` does: these primitives are generic over
 * `Record<string, unknown>`, and mounting one gives the inference nothing to
 * narrow from.
 */
type Row = Record<string, unknown>

function resolved(id: string, width?: number): ResolvedColumn<Row> {
  return {
    id,
    header: id,
    visible: true,
    collapsed: false,
    order: 0,
    resolvedWidth: width,
    pinned: false,
    pinOffset: 0,
    sortDirection: false,
    sortIndex: 0,
    hasFilter: false,
  }
}

const columns = [resolved('name', 120), resolved('salary', 80)]

describe('TableGrid', () => {
  // The property every primitive here is meant to have, and the one case
  // TableGrid was missing: it reads the context when there is one, so nothing
  // proved it still worked when there is not.
  it('renders standalone, with no table context above it', () => {
    const wrapper = mount(TableGrid, { props: { columns } })

    expect(wrapper.find('table.vt-table').exists()).toBe(true)
    const cols = wrapper.findAll('colgroup col')
    expect(cols).toHaveLength(2)
    expect(cols[0]!.attributes('style')).toContain('width: 120px')
    expect(cols[1]!.attributes('style')).toContain('width: 80px')
    wrapper.unmount()
  })

  it('omits a width from a column that resolved none', () => {
    const wrapper = mount(TableGrid, { props: { columns: [resolved('name')] } })

    // Not `width: undefined` and not a default: no style at all, so the
    // browser's own sizing applies.
    expect(wrapper.find('colgroup col').attributes('style')).toBeUndefined()
    wrapper.unmount()
  })

  it('adds the edge columns only when asked', () => {
    const bare = mount(TableGrid, { props: { columns } })
    expect(bare.findAll('colgroup col')).toHaveLength(2)
    bare.unmount()

    const both = mount(TableGrid, {
      props: { columns, selectionColumn: true, actionsColumn: true },
    })
    expect(both.findAll('colgroup col')).toHaveLength(4)
    expect(both.find('col.vt-col-selection').exists()).toBe(true)
    expect(both.find('col.vt-col-actions').exists()).toBe(true)
    both.unmount()
  })

  it('defaults to a fixed layout and takes an override', () => {
    const fixed = mount(TableGrid, { props: { columns } })
    expect(fixed.find('table').attributes('data-layout')).toBe('fixed')
    fixed.unmount()

    const auto = mount(TableGrid, { props: { columns, layout: 'auto' } })
    expect(auto.find('table').attributes('data-layout')).toBe('auto')
    auto.unmount()
  })

  it('renders its slot as the table body', () => {
    const wrapper = mount(TableGrid, {
      props: { columns },
      slots: { default: () => h('tbody', [h('tr', [h('td', 'cell')])]) },
    })

    expect(wrapper.find('tbody td').text()).toBe('cell')
    wrapper.unmount()
  })
})

/*
 * "Off means off" is a documented contract, not a detail: applying grid
 * semantics to every table in the library would change what a screen reader
 * announces about tables nobody made navigable.
 */
describe('TableGrid without a cursor', () => {
  it('emits no role and binds no listeners', async () => {
    const wrapper = mount(TableGrid, {
      props: { columns },
      slots: { default: () => h('tbody', [h('tr', [h('td', 'cell')])]) },
    })

    const table = wrapper.find('table')
    expect(table.attributes('role')).toBeUndefined()

    // The four gestures the cursor owns, all inert. A bound listener that
    // found no cursor would still emit nothing, so the events are the test:
    // no `activate`, no `page-move`, no `scroll-move`, no `viewport-move`, ever.
    await table.trigger('keydown', { key: 'Enter' })
    await table.trigger('keydown', { key: 'ArrowRight', ctrlKey: true })
    await table.trigger('keydown', { key: 'ArrowRight', shiftKey: true })
    await table.trigger('keydown', { key: 'ArrowDown', ctrlKey: true })
    await table.trigger('dblclick')
    await table.trigger('focusin')

    // Named explicitly rather than asserting `emitted()` is empty: a native
    // event that bubbles to the root is recorded there too, so an empty-object
    // assertion would be testing Vue's fallthrough, not this contract.
    expect(wrapper.emitted('activate')).toBeUndefined()
    expect(wrapper.emitted('pageMove')).toBeUndefined()
    expect(wrapper.emitted('scrollMove')).toBeUndefined()
    expect(wrapper.emitted('viewportMove')).toBeUndefined()
    wrapper.unmount()
  })

  it('gives no cell a tabindex', () => {
    const wrapper = mount(TableGrid, {
      props: { columns },
      slots: {
        default: () =>
          h('tbody', [h('tr', { class: 'vt-tr' }, [h('td', { class: 'vt-td' }, 'cell')])]),
      },
    })

    expect(wrapper.find('td').attributes('tabindex')).toBeUndefined()
    wrapper.unmount()
  })
})

describe('TableGrid with a cursor', () => {
  /**
   * The grid's own wrapper, so its custom emits are reachable. `findComponent`
   * on a generic SFC widens to `WrapperLike`, which does not carry `emitted`.
   */
  function gridOf(wrapper: ReturnType<typeof mountWithCursor>) {
    return wrapper.findComponent(TableGrid as never) as unknown as {
      emitted: (name: string) => unknown[][] | undefined
    }
  }

  /** A grid whose body is markup the cursor can actually address. */
  function mountWithCursor() {
    const rows = shallowRef<Row[]>([
      { id: 1, name: 'Ada', salary: 1 },
      { id: 2, name: 'Grace', salary: 2 },
    ])
    const Host = defineComponent({
      setup(_props, { expose }) {
        const cursor = useCellCursor<Row>(rows, () => columns, {
          getRowId: (row) => row.id as number,
        })
        cursor.anchorAt(0)
        expose({ cursor })
        return () =>
          h(TableGrid as never, { columns, cursor }, {
            default: () =>
              h(
                'tbody',
                rows.value.map((row) =>
                  h(
                    'tr',
                    { class: 'vt-tr', 'data-row-id': String(row.id) },
                    columns.map((column) =>
                      h(
                        'td',
                        {
                          class: 'vt-td',
                          'data-column': column.id,
                          // The roving tabindex, the way TableRow computes it:
                          // exactly one cell is reachable by Tab.
                          tabindex:
                            cursor.tabStop.value?.rowId === row.id &&
                            cursor.tabStop.value?.columnId === column.id
                              ? 0
                              : -1,
                        },
                        column.id === 'name'
                          ? [h('button', { class: 'in-cell', type: 'button' }, 'x')]
                          : String(row[column.id]),
                      ),
                    ),
                  ),
                ),
              ),
          })
      },
    })
    return mount(Host, { attachTo: document.body })
  }

  it('becomes a role="grid" once given one', () => {
    const wrapper = mountWithCursor()
    expect(wrapper.find('table').attributes('role')).toBe('grid')
    wrapper.unmount()
  })

  // Reported, not acted on: opening an editor needs a session this component
  // has no way to reach, so it says what happened and stops.
  it('reports Enter as activate rather than acting on it', async () => {
    const wrapper = mountWithCursor()
    const cell = wrapper.find('td[data-column="name"]')

    await cell.trigger('keydown', { key: 'Enter' })
    const grid = gridOf(wrapper)
    expect(grid.emitted('activate')).toBeTruthy()
    wrapper.unmount()
  })

  it('reports Ctrl+Arrow as a page move and Shift+Arrow as a scroll', async () => {
    const wrapper = mountWithCursor()
    const cell = wrapper.find('td[data-column="name"]')
    const grid = gridOf(wrapper)

    await cell.trigger('keydown', { key: 'ArrowRight', ctrlKey: true })
    expect(grid.emitted('pageMove')?.[0]).toEqual([1])

    await cell.trigger('keydown', { key: 'ArrowLeft', shiftKey: true })
    expect(grid.emitted('scrollMove')?.[0]).toEqual([-1])

    // The vertical pair, which a virtual table needs and a paged one is welcome
    // to: a screenful of scroll, and the ring stays where it is.
    await cell.trigger('keydown', { key: 'ArrowDown', ctrlKey: true })
    expect(grid.emitted('viewportMove')?.[0]).toEqual([1])
    wrapper.unmount()
  })

  // The presses more than one decoder sees. Only one may claim each, and the
  // modified arrows are claimed before the plain move decoder runs.
  it('does not also move the cursor on a modified arrow', async () => {
    const wrapper = mountWithCursor()
    const cell = wrapper.find('td[data-column="name"]')
    const grid = gridOf(wrapper)

    await cell.trigger('keydown', { key: 'ArrowRight', ctrlKey: true })
    expect(grid.emitted('pageMove')).toBeTruthy()
    // Still on the first column: the page move consumed the press.
    expect(wrapper.find('td[tabindex="0"]').attributes('data-column')).toBe('name')

    // And the vertical one, where the cursor used to ignore the modifier and
    // step a row: the scroll consumed it, so the ring has not moved.
    const rowOf = () =>
      wrapper.find('td[tabindex="0"]').element.closest('.vt-tr')?.getAttribute('data-row-id')
    const before = rowOf()
    expect(before).toBeTruthy()
    await cell.trigger('keydown', { key: 'ArrowDown', ctrlKey: true })
    expect(grid.emitted('viewportMove')).toBeTruthy()
    expect(rowOf()).toBe(before)
    wrapper.unmount()
  })

  // A positive test for a body cell, so anything focusable a slot renders owns
  // its own keys rather than having them stolen by the grid.
  it('ignores keys from a control inside a cell', async () => {
    const wrapper = mountWithCursor()
    const grid = gridOf(wrapper)

    // A real `<button>` in a cell, which is what the `editor:<id>` slot can put
    // there. Anything focusable inside a cell owns its own keys — a positive
    // test for "is this a managed `<td>`", not a list of controls to skip.
    await wrapper.find('button.in-cell').trigger('keydown', { key: 'Enter' })
    await wrapper.find('button.in-cell').trigger('keydown', { key: 'ArrowRight', ctrlKey: true })

    expect(grid.emitted('activate')).toBeUndefined()
    expect(grid.emitted('pageMove')).toBeUndefined()

    // ...while the same key on the cell itself is claimed, so the guard is
    // discriminating rather than simply inert.
    await wrapper.find('td[data-column="salary"]').trigger('keydown', { key: 'Enter' })
    expect(grid.emitted('activate')).toBeTruthy()
    wrapper.unmount()
  })
})
