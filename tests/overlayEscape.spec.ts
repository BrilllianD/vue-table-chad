import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import { defineComponent, h, nextTick } from 'vue'
import DataTable from '../src/components/preset/DataTable.vue'
import { useLocalDataSource } from '../src/core/useLocalDataSource'
import { useTableState } from '../src/core/useTableState'
import { people, personColumns, type Person } from './fixtures'

/**
 * The Escape protocol for the four table overlays: the Escape that closes one is consumed
 * (`preventDefault` and `stopPropagation`), so a table inside a modal does not lose the modal on
 * the same press; an Escape that closes nothing, or ends an IME composition, is left to the page.
 *
 * `cancelBubble` stays set after dispatch in happy-dom but a real browser clears it, so each case
 * also asserts `reachedDocument`, which is portable.
 */

enableAutoUnmount(afterEach)
afterEach(() => {
  document.body.querySelectorAll('.vt-portal').forEach((node) => node.remove())
})

function mountTable() {
  const Host = defineComponent({
    setup() {
      const state = useTableState({ pageSize: 10 })
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

function press(target: Element, init: KeyboardEventInit = {}) {
  const event = new KeyboardEvent('keydown', {
    key: 'Escape',
    bubbles: true,
    cancelable: true,
    ...init,
  })
  let reachedDocument = false
  const spy = () => {
    reachedDocument = true
  }
  document.addEventListener('keydown', spy)
  target.dispatchEvent(event)
  document.removeEventListener('keydown', spy)
  return { event, reachedDocument }
}

function cell(row: number, columnId: string): HTMLElement {
  const element = document.querySelectorAll('.vt-tbody .vt-tr')[row]?.querySelector<HTMLElement>(
    `.vt-td[data-column="${columnId}"]`,
  )
  if (!element) throw new Error(`no cell at row ${row}, column ${columnId}`)
  return element
}

beforeEach(() => {
  document.body.innerHTML = ''
})

const overlays = [
  {
    name: 'ColumnVisibilityMenu',
    panel: '.vt-columns-panel',
    trigger: (wrapper: ReturnType<typeof mountTable>) =>
      wrapper.findAll('button').find((button) => button.text().startsWith('Columns'))!.element,
  },
  {
    name: 'RowGroupMenu',
    panel: '.vt-group-panel',
    trigger: (wrapper: ReturnType<typeof mountTable>) =>
      wrapper.findAll('button').find((button) => button.text().startsWith('Group by'))!.element,
  },
  {
    name: 'ColumnFilterPopover',
    panel: '.vt-filter-panel',
    trigger: (wrapper: ReturnType<typeof mountTable>) =>
      wrapper.find('.vt-th[data-column="name"] .vt-filter-trigger').element,
  },
]

describe.each(overlays)('$name Escape', ({ panel, trigger }) => {
  async function open() {
    const wrapper = mountTable()
    const button = trigger(wrapper) as HTMLElement
    button.click()
    await settle()
    expect(document.body.querySelector(panel)).not.toBeNull()
    return { wrapper, button }
  }

  it('consumes the Escape that closes it, pressed in the panel', async () => {
    await open()
    const inside = document.body.querySelector(panel)!.querySelector('button')!
    const { event, reachedDocument } = press(inside)
    expect(event.defaultPrevented).toBe(true)
    expect(event.cancelBubble).toBe(true)
    expect(reachedDocument).toBe(false)
    await settle()
    expect(document.body.querySelector(panel)).toBeNull()
  })

  it('consumes the Escape that closes it, pressed on the trigger', async () => {
    const { button } = await open()
    const { event, reachedDocument } = press(button)
    expect(event.defaultPrevented).toBe(true)
    expect(event.cancelBubble).toBe(true)
    expect(reachedDocument).toBe(false)
    await settle()
    expect(document.body.querySelector(panel)).toBeNull()
  })

  it('leaves an Escape that closes nothing to the page', () => {
    const wrapper = mountTable()
    const { event, reachedDocument } = press(trigger(wrapper))
    expect(event.defaultPrevented).toBe(false)
    expect(event.cancelBubble).toBe(false)
    expect(reachedDocument).toBe(true)
  })

  it('leaves an Escape that ends an IME composition alone', async () => {
    await open()
    const inside = document.body.querySelector(panel)!.querySelector('button')!
    const { event, reachedDocument } = press(inside, { isComposing: true })
    expect(event.defaultPrevented).toBe(false)
    expect(event.cancelBubble).toBe(false)
    expect(reachedDocument).toBe(true)
    await settle()
    expect(document.body.querySelector(panel)).not.toBeNull()
  })

  it('leaves an Escape with keyCode 229 alone', async () => {
    await open()
    const inside = document.body.querySelector(panel)!.querySelector('button')!
    const { event, reachedDocument } = press(inside, { keyCode: 229 })
    expect(event.defaultPrevented).toBe(false)
    expect(event.cancelBubble).toBe(false)
    expect(reachedDocument).toBe(true)
    await settle()
    expect(document.body.querySelector(panel)).not.toBeNull()
  })
})

describe('TableContextMenu Escape', () => {
  async function openMenu() {
    const wrapper = mountTable()
    cell(0, 'department').dispatchEvent(
      new MouseEvent('contextmenu', { bubbles: true, cancelable: true }),
    )
    await settle()
    expect(document.querySelector('.vt-context-menu')).not.toBeNull()
    return wrapper
  }

  it('consumes the Escape that closes it, then leaves the next one to the page', async () => {
    await openMenu()
    const item = document.querySelector('.vt-context-menu [role="menuitem"]')!
    const first = press(item)
    expect(first.event.defaultPrevented).toBe(true)
    expect(first.event.cancelBubble).toBe(true)
    expect(first.reachedDocument).toBe(false)
    await settle()
    expect(document.querySelector('.vt-context-menu')).toBeNull()

    const second = press(cell(0, 'department'))
    expect(second.event.defaultPrevented).toBe(false)
    expect(second.event.cancelBubble).toBe(false)
    expect(second.reachedDocument).toBe(true)
  })

  it('leaves an Escape on a cell to the page when never opened', () => {
    mountTable()
    const { event, reachedDocument } = press(cell(0, 'department'))
    expect(event.defaultPrevented).toBe(false)
    expect(event.cancelBubble).toBe(false)
    expect(reachedDocument).toBe(true)
  })
})
