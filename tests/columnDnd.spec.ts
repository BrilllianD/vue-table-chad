import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, effectScope, h, nextTick } from 'vue'
import { useColumns } from '../src/core/useColumns'
import { useColumnDnd, type DropSide } from '../src/core/useColumnDnd'
import DataTable from '../src/components/preset/DataTable.vue'
import { useLocalDataSource } from '../src/core/useLocalDataSource'
import { useTableState } from '../src/core/useTableState'
import { people, personColumns, type Person } from './fixtures'

/* ------------------------------------------------------------------ order */

function setupColumns(columns = personColumns) {
  const scope = effectScope()
  const result = scope.run(() => useColumns<Person>(columns))!
  return { columns: result, dispose: () => scope.stop() }
}

const idsOf = (result: ReturnType<typeof setupColumns>['columns']) =>
  result.all.value.map((column) => column.id)

describe('useColumns.moveColumnTo', () => {
  it('drops a column on either edge of the target', () => {
    const { columns, dispose } = setupColumns()

    columns.moveColumnTo('active', 'name', 'before')
    expect(idsOf(columns)).toEqual(['active', 'name', 'department', 'salary', 'hiredAt'])

    columns.moveColumnTo('active', 'salary', 'after')
    expect(idsOf(columns)).toEqual(['name', 'department', 'salary', 'active', 'hiredAt'])
    dispose()
  })

  // Dragging left past the target: the anchor's index shifts once the dragged
  // column is spliced out, so a position captured beforehand lands off by one.
  it('lands adjacent to the target whichever direction it came from', () => {
    const { columns, dispose } = setupColumns()

    columns.moveColumnTo('name', 'hiredAt', 'after')
    expect(idsOf(columns)).toEqual(['department', 'salary', 'hiredAt', 'name', 'active'])

    columns.moveColumnTo('name', 'department', 'before')
    expect(idsOf(columns)).toEqual(['name', 'department', 'salary', 'hiredAt', 'active'])
    dispose()
  })

  it('ignores a no-op drop and unknown ids', () => {
    const { columns, dispose } = setupColumns()

    columns.moveColumnTo('name', 'name', 'after')
    columns.moveColumnTo('nope', 'name', 'after')
    columns.moveColumnTo('name', 'nope', 'after')
    expect(columns.layout.value.order).toEqual([])
    dispose()
  })

  // A hidden column has no header to drop onto, so its position can only be
  // preserved — anchoring the move to a column id rather than a visible index
  // is what keeps it wedged between the same two neighbours.
  it('keeps hidden columns in place', () => {
    const { columns, dispose } = setupColumns()
    columns.toggleVisibility('salary', false)

    columns.moveColumnTo('active', 'department', 'before')
    expect(idsOf(columns)).toEqual(['name', 'active', 'department', 'salary', 'hiredAt'])
    expect(columns.visible.value.map((column) => column.id)).toEqual([
      'name',
      'active',
      'department',
      'hiredAt',
    ])
    dispose()
  })
})

/* -------------------------------------------------------------------- dnd */

function pointerEvent(type: string, init: Record<string, unknown> = {}): Event {
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.assign(event, { pointerId: 1, pointerType: 'mouse', button: 0, clientX: 0, clientY: 0 }, init)
  return event
}

function setupDnd(options: Partial<Parameters<typeof useColumnDnd>[0]> = {}) {
  const move = vi.fn()
  const scope = effectScope()
  const dnd = scope.run(() =>
    useColumnDnd({
      columnIds: () => ['name', 'department', 'salary'],
      move,
      ...options,
    }),
  )!
  return { dnd, move, dispose: () => scope.stop() }
}

function press(dnd: ReturnType<typeof setupDnd>['dnd'], columnId: string, x = 0): void {
  dnd.start(columnId, pointerEvent('pointerdown', { clientX: x }) as PointerEvent)
}

describe('useColumnDnd', () => {
  it('treats a press that barely moves as a click, not a drag', () => {
    const { dnd, move, dispose } = setupDnd()

    press(dnd, 'name')
    window.dispatchEvent(pointerEvent('pointermove', { clientX: 2 }))
    expect(dnd.dragging.value).toBe(false)

    window.dispatchEvent(pointerEvent('pointerup', { clientX: 2 }))
    expect(move).not.toHaveBeenCalled()
    dispose()
  })

  it('picks the column up once the pointer clears the threshold', () => {
    const { dnd, move, dispose } = setupDnd()

    press(dnd, 'name')
    window.dispatchEvent(pointerEvent('pointermove', { clientX: 40 }))
    expect(dnd.dragging.value).toBe(true)
    expect(dnd.isDragged('name')).toBe(true)

    dnd.over('salary', 'after')
    expect(dnd.dropSideFor('salary')).toBe('after')

    window.dispatchEvent(pointerEvent('pointerup', { clientX: 40 }))
    expect(move).toHaveBeenCalledWith('name', 'salary', 'after')
    expect(dnd.dragging.value).toBe(false)
    expect(dnd.target.value).toBeNull()
    dispose()
  })

  it('never offers the dragged column itself as a target', () => {
    const { dnd, move, dispose } = setupDnd()

    press(dnd, 'name')
    window.dispatchEvent(pointerEvent('pointermove', { clientX: 40 }))
    dnd.over('name', 'before')
    expect(dnd.target.value).toBeNull()

    window.dispatchEvent(pointerEvent('pointerup'))
    expect(move).not.toHaveBeenCalled()
    dispose()
  })

  it('drops nothing when Escape cancels the drag', () => {
    const { dnd, move, dispose } = setupDnd()

    press(dnd, 'name')
    window.dispatchEvent(pointerEvent('pointermove', { clientX: 40 }))
    dnd.over('salary', 'after')

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }))
    expect(dnd.dragging.value).toBe(false)

    window.dispatchEvent(pointerEvent('pointerup'))
    expect(move).not.toHaveBeenCalled()
    dispose()
  })

  it('respects canDrag and canDrop', () => {
    const { dnd, move, dispose } = setupDnd({
      canDrag: (columnId) => columnId !== 'name',
      canDrop: (_columnId, targetId) => targetId !== 'salary',
    })

    press(dnd, 'name')
    window.dispatchEvent(pointerEvent('pointermove', { clientX: 40 }))
    expect(dnd.dragging.value).toBe(false)

    press(dnd, 'department')
    window.dispatchEvent(pointerEvent('pointermove', { clientX: 40 }))
    dnd.over('salary', 'after')
    expect(dnd.target.value).toBeNull()

    window.dispatchEvent(pointerEvent('pointerup'))
    expect(move).not.toHaveBeenCalled()
    dispose()
  })

  it('clears the target only for the column that still owns it', () => {
    const { dnd, dispose } = setupDnd()

    press(dnd, 'name')
    window.dispatchEvent(pointerEvent('pointermove', { clientX: 40 }))
    dnd.over('salary', 'before')

    dnd.clearOver('department')
    expect(dnd.target.value).not.toBeNull()

    dnd.clearOver('salary')
    expect(dnd.target.value).toBeNull()

    dnd.cancel()
    dispose()
  })

  it('moves by keyboard and stops at the ends', () => {
    const { dnd, move, dispose } = setupDnd()

    dnd.moveBy('department', -1)
    expect(move).toHaveBeenLastCalledWith('department', 'name', 'before')

    dnd.moveBy('department', 1)
    expect(move).toHaveBeenLastCalledWith('department', 'salary', 'after')

    move.mockClear()
    dnd.moveBy('name', -1)
    dnd.moveBy('salary', 1)
    expect(move).not.toHaveBeenCalled()
    dispose()
  })
})

/* ------------------------------------------------------------ integration */

function mountTable(props: Record<string, unknown> = {}) {
  const Host = defineComponent({
    setup() {
      const state = useTableState({ pageSize: 3 })
      const source = useLocalDataSource<Person>(people, personColumns, state.query)
      return () => h(DataTable as never, { columns: personColumns, source, state, ...props })
    },
  })
  return mount(Host, { attachTo: document.body })
}

const headerIds = (wrapper: ReturnType<typeof mountTable>) =>
  wrapper.findAll('thead th[data-column]').map((th) => th.attributes('data-column'))

function headerFor(wrapper: ReturnType<typeof mountTable>, columnId: string) {
  const th = wrapper.findAll('thead th').find((cell) => cell.attributes('data-column') === columnId)!
  // happy-dom has no layout, so the drop-side maths needs a box to work from.
  const index = headerIds(wrapper).indexOf(columnId)
  th.element.getBoundingClientRect = () =>
    ({ left: index * 100, right: index * 100 + 100, width: 100, top: 0, bottom: 38, height: 38 }) as DOMRect
  return th
}

/** Full press → move → hover → release, the way a real drag arrives. */
async function drag(
  wrapper: ReturnType<typeof mountTable>,
  fromId: string,
  toId: string,
  side: DropSide,
): Promise<void> {
  const from = headerFor(wrapper, fromId)
  const to = headerFor(wrapper, toId)
  const toRect = to.element.getBoundingClientRect()
  const x = side === 'before' ? toRect.left + 10 : toRect.right - 10

  await from.trigger('pointerdown', { pointerId: 1, pointerType: 'mouse', button: 0, clientX: 0 })
  window.dispatchEvent(pointerEvent('pointermove', { clientX: 40 }))
  await to.trigger('pointermove', { pointerId: 1, clientX: x })
  window.dispatchEvent(pointerEvent('pointerup', { clientX: x }))
  await nextTick()
}

describe('DataTable column drag-and-drop', () => {
  it('reorders the header and the body cells together', async () => {
    const wrapper = mountTable()
    expect(headerIds(wrapper)).toEqual(['name', 'department', 'salary', 'hiredAt', 'active'])

    await drag(wrapper, 'name', 'salary', 'after')

    expect(headerIds(wrapper)).toEqual(['department', 'salary', 'name', 'hiredAt', 'active'])
    // The body follows the header — cells are rendered from the same list.
    const firstRow = wrapper.findAll('tbody tr')[0]!
    expect(firstRow.findAll('td[data-column]').map((td) => td.attributes('data-column'))).toEqual([
      'department',
      'salary',
      'name',
      'hiredAt',
      'active',
    ])
    wrapper.unmount()
  })

  it('reports the new order', async () => {
    const onOrder = vi.fn()
    const wrapper = mountTable({ 'onUpdate:columnOrder': onOrder })
    await drag(wrapper, 'active', 'name', 'before')

    expect(onOrder).toHaveBeenLastCalledWith(['active', 'name', 'department', 'salary', 'hiredAt'])
    wrapper.unmount()
  })

  it('marks the dragged column and paints a drop indicator while dragging', async () => {
    const wrapper = mountTable()
    const from = headerFor(wrapper, 'name')
    const to = headerFor(wrapper, 'hiredAt')

    await from.trigger('pointerdown', { pointerId: 1, pointerType: 'mouse', button: 0, clientX: 0 })
    window.dispatchEvent(pointerEvent('pointermove', { clientX: 40 }))
    await to.trigger('pointermove', { pointerId: 1, clientX: to.element.getBoundingClientRect().left + 5 })

    expect(headerFor(wrapper, 'name').attributes('data-dragging')).toBe('true')
    expect(headerFor(wrapper, 'hiredAt').attributes('data-drop')).toBe('before')
    expect(document.querySelector('.vt-drag-ghost')?.textContent?.trim()).toBe('Name')

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }))
    await nextTick()
    expect(headerIds(wrapper)).toEqual(['name', 'department', 'salary', 'hiredAt', 'active'])
    expect(document.querySelector('.vt-drag-ghost')).toBeNull()
    wrapper.unmount()
  })

  it('does not sort the column the drag started on', async () => {
    const wrapper = mountTable()
    await drag(wrapper, 'name', 'salary', 'after')

    // A real browser fires `click` on the common ancestor after the release.
    document.querySelector('thead')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await nextTick()

    expect(headerFor(wrapper, 'name').attributes('data-sorted')).toBeUndefined()
    wrapper.unmount()
  })

  it('adopts the pin side of the column it lands on', async () => {
    const wrapper = mountTable({ initialLayout: { pinned: { name: 'left' } } })
    await drag(wrapper, 'salary', 'name', 'after')

    expect(headerFor(wrapper, 'salary').attributes('data-pinned')).toBe('left')
    expect(headerIds(wrapper).slice(0, 2)).toEqual(['name', 'salary'])
    wrapper.unmount()
  })

  it('leaves headers undraggable when reordering is off', async () => {
    const wrapper = mountTable({ reorderable: false })
    expect(headerFor(wrapper, 'name').attributes('data-reorderable')).toBeUndefined()

    await drag(wrapper, 'name', 'salary', 'after')
    expect(headerIds(wrapper)).toEqual(['name', 'department', 'salary', 'hiredAt', 'active'])
    wrapper.unmount()
  })

  it('moves a column with Alt+Arrow for keyboard users', async () => {
    const wrapper = mountTable()
    await headerFor(wrapper, 'name').trigger('keydown', { key: 'ArrowRight', altKey: true })

    expect(headerIds(wrapper)).toEqual(['department', 'name', 'salary', 'hiredAt', 'active'])
    wrapper.unmount()
  })
})
