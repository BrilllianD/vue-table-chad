import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h, nextTick } from 'vue'
import DataTable from '../src/components/preset/DataTable.vue'
import { contextMenuFor } from '../src/core/cellCursor'
import { useLocalDataSource } from '../src/core/useLocalDataSource'
import { useTableState, type TableState } from '../src/core/useTableState'
import { people, personColumns, type Person } from './fixtures'

/**
 * The right-click menu, end to end through `DataTable`.
 *
 * Asserted against the resulting `QueryState` and column layout rather than
 * against the click, because that is the claim the feature makes: every item is
 * a call some other control already makes, so a filter set from the menu has to
 * be the filter the panel would have set. A spec that only checked that a
 * button was pressed would pass over a menu that mutated something of its own.
 *
 * The panel is teleported to `<body>`, so it is found with
 * `document.querySelector` rather than through the wrapper — the same way
 * `tests/asyncSelect.spec.ts` reaches the dropdown it teleports.
 */

let state: TableState

function mountTable(props: Record<string, unknown> = {}) {
  const Host = defineComponent({
    setup() {
      state = useTableState({ pageSize: 10 })
      const source = useLocalDataSource<Person>(people, personColumns, state.query, {
        debounceMs: 0,
      })
      return () =>
        h(DataTable as never, {
          columns: personColumns,
          source,
          state,
          contextMenu: true,
          cellCursor: true,
          ...props,
        })
    },
  })
  return mount(Host, { attachTo: document.body })
}

async function settle(): Promise<void> {
  await nextTick()
  await nextTick()
  await nextTick()
}

function panel(): HTMLElement | null {
  return document.querySelector('.vt-context-menu')
}

function items(): HTMLButtonElement[] {
  return [...(panel()?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])]
}

function itemFor(action: string): HTMLButtonElement {
  const button = items().find((item) => item.dataset.action === action)
  if (!button) throw new Error(`no menu item '${action}' — have ${labels().join(', ')}`)
  return button
}

function labels(): string[] {
  return items().map((item) => item.textContent?.trim() ?? '')
}

/** The `<td>` at a row and column of the rendered page. */
function cell(row: number, columnId: string): HTMLElement {
  const element = document.querySelectorAll('.vt-tbody .vt-tr')[row]?.querySelector<HTMLElement>(
    `.vt-td[data-column="${columnId}"]`,
  )
  if (!element) throw new Error(`no cell at row ${row}, column ${columnId}`)
  return element
}

function header(columnId: string): HTMLElement {
  const element = document.querySelector<HTMLElement>(`.vt-th[data-column="${columnId}"]`)
  if (!element) throw new Error(`no header cell for ${columnId}`)
  return element
}

async function rightClick(element: HTMLElement): Promise<Event> {
  const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true })
  element.dispatchEvent(event)
  await settle()
  return event
}

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('contextMenuFor', () => {
  it('claims Shift+F10 and the ContextMenu key, and nothing else', () => {
    expect(contextMenuFor({ key: 'F10', shiftKey: true })).toBe(true)
    expect(contextMenuFor({ key: 'ContextMenu' })).toBe(true)
    // A bare F10 is the browser's own menu bar on Windows and Linux.
    expect(contextMenuFor({ key: 'F10' })).toBe(false)
    expect(contextMenuFor({ key: 'F10', shiftKey: true, ctrlKey: true })).toBe(false)
    expect(contextMenuFor({ key: 'F10', shiftKey: true, altKey: true })).toBe(false)
    expect(contextMenuFor({ key: 'Enter', shiftKey: true })).toBe(false)
  })
})

describe('TableContextMenu', () => {
  it('opens on a right-click over a body cell, with every item', async () => {
    const wrapper = mountTable()
    await settle()

    expect(panel()).toBeNull()
    const event = await rightClick(cell(0, 'department'))

    expect(panel()).not.toBeNull()
    // The browser's own menu is given up only once there is one to replace it.
    expect(event.defaultPrevented).toBe(true)
    expect(items().map((item) => item.dataset.action)).toEqual([
      'filter',
      'sort-asc',
      'sort-desc',
      'group',
      'hide',
      'copy',
    ])
    wrapper.unmount()
  })

  /**
   * Every item draws a mark, and none of them is readable by a screen reader.
   *
   * The icon repeats what the label already says, so a named one would have the
   * menu announce each item twice. jsdom applies no stylesheet, so this can only
   * assert the markup — the gutter that keeps a slot item lined up with these is
   * `tests/presetStyles.spec.ts`' kind of claim, not this one's.
   */
  it('draws a decorative icon on every item', async () => {
    const wrapper = mountTable()
    await settle()
    await rightClick(cell(0, 'department'))

    const missing = items()
      .filter((item) => !item.querySelector('svg.vt-context-icon[aria-hidden="true"]'))
      .map((item) => item.dataset.action ?? '')
    expect(missing, 'menu items rendered without an icon').toEqual([])
    // The label is still the item's only text, so the arrow keys and the
    // accessible name are what they were before the marks arrived.
    expect(itemFor('copy').textContent?.trim()).toBe('Copy')
    wrapper.unmount()
  })

  /**
   * The grouping item is a toggle with two wordings, and the mark follows the
   * words: indented rows for grouping, flat ones for undoing it. A mark that
   * stayed put would describe the half of the toggle that is not on offer.
   */
  it('swaps the grouping icon with the grouping label', async () => {
    const wrapper = mountTable()
    await settle()
    await rightClick(cell(0, 'department'))
    const grouping = () => itemFor('group').querySelector('.vt-context-icon')!.innerHTML

    const ungrouped = grouping()
    itemFor('group').click()
    await settle()
    expect(state.groupBy.value).toEqual(['department'])

    await rightClick(cell(0, 'department'))
    expect(itemFor('group').textContent?.trim()).toBe('Stop grouping by this column')
    expect(grouping()).not.toBe(ungrouped)
    wrapper.unmount()
  })

  it('leaves out the two items that need a cell, on a header', async () => {
    const wrapper = mountTable()
    await settle()
    await rightClick(header('department'))

    expect(items().map((item) => item.dataset.action)).toEqual([
      'sort-asc',
      'sort-desc',
      'group',
      'hide',
    ])
    wrapper.unmount()
  })

  it('is not bound at all without the prop', async () => {
    const wrapper = mountTable({ contextMenu: false })
    await settle()
    const event = await rightClick(cell(0, 'department'))

    expect(panel()).toBeNull()
    // Undefaulted, so the browser's own menu still opens.
    expect(event.defaultPrevented).toBe(false)
    wrapper.unmount()
  })

  it('opens on Shift+F10, anchored to the cursor cell', async () => {
    const wrapper = mountTable()
    await settle()

    const target = cell(1, 'salary')
    target.focus()
    await settle()
    target.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'F10', shiftKey: true, bubbles: true, cancelable: true }),
    )
    await settle()

    expect(panel()).not.toBeNull()
    // The panel takes the focus, or Esc and the arrow keys would never reach it.
    expect(items()).toContain(document.activeElement)
    wrapper.unmount()
  })

  it('walks its items with the arrow keys, and wraps', async () => {
    const wrapper = mountTable()
    await settle()
    await rightClick(cell(0, 'department'))

    const all = items()
    expect(document.activeElement).toBe(all[0])

    const press = (key: string) =>
      panel()?.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))

    press('ArrowDown')
    expect(document.activeElement).toBe(all[1])
    press('ArrowUp')
    press('ArrowUp')
    // Off the top lands on the last item rather than nowhere.
    expect(document.activeElement).toBe(all.at(-1))
    wrapper.unmount()
  })
})

describe('TableContextMenu dismissal', () => {
  it('closes on Esc', async () => {
    const wrapper = mountTable()
    await settle()
    await rightClick(cell(0, 'department'))

    panel()?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await settle()

    expect(panel()).toBeNull()
    wrapper.unmount()
  })

  it('closes on a pointerdown outside, and not on one inside', async () => {
    const wrapper = mountTable()
    await settle()
    await rightClick(cell(0, 'department'))

    panel()?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    await settle()
    expect(panel()).not.toBeNull()

    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    await settle()
    expect(panel()).toBeNull()
    wrapper.unmount()
  })

  it('closes when the focus really leaves', async () => {
    const wrapper = mountTable()
    await settle()
    await rightClick(cell(0, 'department'))

    const outside = document.createElement('button')
    document.body.append(outside)
    panel()?.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: outside }))
    await settle()

    expect(panel()).toBeNull()
    outside.remove()
    wrapper.unmount()
  })

  it('stays open on a focusout with no relatedTarget', async () => {
    const wrapper = mountTable()
    await settle()
    await rightClick(cell(0, 'department'))

    // The panel's own padding, and every detached element — left to the
    // outside-pointerdown listener, the split `useMenuDismiss` documents.
    panel()?.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: null }))
    await settle()

    expect(panel()).not.toBeNull()
    wrapper.unmount()
  })
})

describe('TableContextMenu actions', () => {
  it('filters by the value under the pointer', async () => {
    const wrapper = mountTable()
    await settle()
    await rightClick(cell(0, 'department'))

    itemFor('filter').click()
    await settle()

    expect(state.query.value.filters).toEqual({
      department: { kind: 'values', include: ['Engineering'], includeBlanks: false },
    })
    expect(panel()).toBeNull()
    wrapper.unmount()
  })

  it('filters a blank cell to blanks', async () => {
    const wrapper = mountTable()
    await settle()
    // Barbara Liskov's department is the empty string.
    await rightClick(cell(6, 'department'))

    itemFor('filter').click()
    await settle()

    expect(state.query.value.filters).toEqual({
      department: { kind: 'values', include: [], includeBlanks: true },
    })
    wrapper.unmount()
  })

  it('sorts both ways, without the cycle through unsorted', async () => {
    const wrapper = mountTable()
    await settle()

    await rightClick(cell(0, 'salary'))
    itemFor('sort-desc').click()
    await settle()
    expect(state.query.value.sort).toEqual([{ columnId: 'salary', direction: 'desc' }])

    await rightClick(cell(0, 'salary'))
    itemFor('sort-asc').click()
    await settle()
    expect(state.query.value.sort).toEqual([{ columnId: 'salary', direction: 'asc' }])
    wrapper.unmount()
  })

  it('groups by the column, and the same item ungroups it', async () => {
    const wrapper = mountTable()
    await settle()

    await rightClick(cell(0, 'department'))
    expect(itemFor('group').textContent?.trim()).toBe('Group by this column')
    itemFor('group').click()
    await settle()
    expect(state.groupBy.value).toEqual(['department'])

    await rightClick(cell(0, 'department'))
    expect(itemFor('group').textContent?.trim()).toBe('Stop grouping by this column')
    itemFor('group').click()
    await settle()
    expect(state.groupBy.value).toEqual([])
    wrapper.unmount()
  })

  it('hides the column', async () => {
    const wrapper = mountTable()
    await settle()
    await rightClick(cell(0, 'department'))

    itemFor('hide').click()
    await settle()

    expect(document.querySelector('.vt-th[data-column="department"]')).toBeNull()
    wrapper.unmount()
  })

  it('copies the displayed text', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })

    const wrapper = mountTable()
    await settle()
    await rightClick(cell(0, 'name'))

    itemFor('copy').click()
    await settle()

    expect(writeText).toHaveBeenCalledWith('Ada Lovelace')
    wrapper.unmount()
  })

  it('disables the items a column refuses, rather than dropping them', async () => {
    const columns = personColumns.map((column) =>
      column.id === 'name'
        ? { ...column, hideable: false, groupable: false, sortable: false, filterable: false }
        : column,
    )
    const wrapper = mountTable({ columns })
    await settle()
    await rightClick(cell(0, 'name'))

    expect(items().map((item) => item.dataset.action)).toEqual([
      'filter',
      'sort-asc',
      'sort-desc',
      'group',
      'hide',
      'copy',
    ])
    expect(itemFor('hide').disabled).toBe(true)
    expect(itemFor('group').disabled).toBe(true)
    expect(itemFor('sort-asc').disabled).toBe(true)
    expect(itemFor('filter').disabled).toBe(true)
    // Copying is a read, and a column that refuses everything else still shows
    // its text on screen.
    expect(itemFor('copy').disabled).toBe(false)
    wrapper.unmount()
  })

  it('renders a consumer slot after the built-in items', async () => {
    const wrapper = mount(
      defineComponent({
        setup() {
          state = useTableState({ pageSize: 10 })
          const source = useLocalDataSource<Person>(people, personColumns, state.query, {
            debounceMs: 0,
          })
          return () =>
            h(
              DataTable as never,
              { columns: personColumns, source, state, contextMenu: true },
              {
                contextMenu: ({ rowId }: { rowId: unknown }) =>
                  h('button', { class: 'vt-context-item', role: 'menuitem', 'data-action': 'audit' }, `audit ${String(rowId)}`),
              },
            )
        },
      }),
      { attachTo: document.body },
    )
    await settle()
    await rightClick(cell(0, 'department'))

    expect(labels().at(-1)).toBe('audit 1')
    wrapper.unmount()
  })
})
