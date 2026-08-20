import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h, nextTick } from 'vue'
import DataTable from '../src/components/preset/DataTable.vue'
import { useLocalDataSource } from '../src/core/useLocalDataSource'
import { useTableState } from '../src/core/useTableState'
import { people, personColumns, type Person } from './fixtures'

/**
 * Reordering inside a dropdown panel used to close it: the browser sends a
 * `focusout` with a null `relatedTarget` when the focused button is detached
 * (Vue moving the keyed row) or disabled (an ↑ that reached the top), and the
 * panels read that as "focus left, close".
 *
 * happy-dom reproduces neither blur — it leaves focus on a node it has just
 * moved — so, as in `selectionCheckbox.spec.ts`, these tests stage the
 * browser's half explicitly: press the button, then send the `focusout` Chrome
 * would have sent mid-patch. What is asserted afterwards is the invariant that
 * matters: the panel is still open, and focus is still on a reorder button.
 */
function mountTable(props: Record<string, unknown> = {}) {
  const Host = defineComponent({
    setup() {
      const state = useTableState({ pageSize: 3 })
      const source = useLocalDataSource<Person>(people, personColumns, state.query, {
        debounceMs: 0,
      })
      return () => h(DataTable as never, { columns: personColumns, source, state, ...props })
    },
  })
  return mount(Host, { attachTo: document.body })
}

/** Click, then the blur the real browser folds into the same patch. */
function pressAndBlur(button: HTMLElement): void {
  button.focus()
  button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  button.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: null }))
}

async function settle(): Promise<void> {
  await nextTick()
  await nextTick()
}

function openPanel(wrapper: ReturnType<typeof mountTable>, label: string) {
  const trigger = wrapper.findAll('button').find((button) => button.text().startsWith(label))
  return trigger!.trigger('click')
}

describe('ColumnVisibilityMenu dismissal', () => {
  function open() {
    const wrapper = mountTable()
    return openPanel(wrapper, 'Columns').then(() => wrapper)
  }

  function rows(wrapper: ReturnType<typeof mountTable>) {
    return wrapper.findAll('.vt-columns-row')
  }

  function labels(wrapper: ReturnType<typeof mountTable>): string[] {
    return rows(wrapper).map((row) => row.find('.vt-columns-label').text())
  }

  it('stays open when a move steals the button focus', async () => {
    const wrapper = await open()
    expect(labels(wrapper)[1]).toBe('Department')

    pressAndBlur(rows(wrapper)[1]!.find('[aria-label="Move up"]').element as HTMLElement)
    await settle()

    expect(wrapper.find('.vt-columns-panel').exists()).toBe(true)
    expect(labels(wrapper).slice(0, 2)).toEqual(['Department', 'Name'])
    wrapper.unmount()
  })

  it('keeps focus on the pressed button so it can be pressed again', async () => {
    const wrapper = await open()

    // Third row: two moves up are available, so the button stays enabled.
    const up = rows(wrapper)[2]!.find('[aria-label="Move up"]').element as HTMLElement
    pressAndBlur(up)
    await settle()

    expect(document.activeElement).toBe(up)
    expect(labels(wrapper).slice(0, 3)).toEqual(['Name', 'Salary', 'Department'])
    wrapper.unmount()
  })

  it('hands focus to the other arrow when the move disables the pressed one', async () => {
    const wrapper = await open()

    const row = rows(wrapper)[1]!
    const up = row.find('[aria-label="Move up"]').element as HTMLButtonElement
    const down = row.find('[aria-label="Move down"]').element as HTMLElement
    pressAndBlur(up)
    await settle()

    // The column is at the top now, so its ↑ is disabled and unfocusable.
    expect(up.disabled).toBe(true)
    expect(document.activeElement).toBe(down)
    wrapper.unmount()
  })

  it('still closes when focus leaves for somewhere else', async () => {
    const wrapper = await open()
    const outside = document.createElement('button')
    document.body.append(outside)

    await wrapper
      .find('.vt-columns-panel')
      .trigger('focusout', { relatedTarget: outside })
    await settle()

    expect(wrapper.find('.vt-columns-panel').exists()).toBe(false)
    outside.remove()
    wrapper.unmount()
  })

  it('still closes on a pointerdown outside', async () => {
    const wrapper = await open()

    document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    await settle()

    expect(wrapper.find('.vt-columns-panel').exists()).toBe(false)
    wrapper.unmount()
  })

  it('ignores a pointerdown inside the panel', async () => {
    const wrapper = await open()

    const panel = wrapper.find('.vt-columns-panel').element
    panel.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    await settle()

    expect(wrapper.find('.vt-columns-panel').exists()).toBe(true)
    wrapper.unmount()
  })
})

describe('RowGroupMenu dismissal', () => {
  function open() {
    const wrapper = mountTable({ initialGroupBy: ['department', 'active'] })
    return openPanel(wrapper, 'Group by').then(() => wrapper)
  }

  function levels(wrapper: ReturnType<typeof mountTable>) {
    return wrapper.findAll('.vt-group-level')
  }

  function labels(wrapper: ReturnType<typeof mountTable>): string[] {
    return levels(wrapper).map((level) => level.find('.vt-group-level-label').text())
  }

  it('stays open when a move steals the button focus', async () => {
    const wrapper = await open()
    expect(labels(wrapper)).toEqual(['Department', 'Active'])

    const row = levels(wrapper)[1]!
    const up = row.find('[aria-label="Move up a level"]').element as HTMLButtonElement
    const down = row.find('[aria-label="Move down a level"]').element as HTMLElement
    pressAndBlur(up)
    await settle()

    expect(wrapper.find('.vt-group-panel').exists()).toBe(true)
    expect(labels(wrapper)).toEqual(['Active', 'Department'])
    // Outermost level now, so ↑ is disabled and ↓ takes the focus.
    expect(up.disabled).toBe(true)
    expect(document.activeElement).toBe(down)
    wrapper.unmount()
  })

  it('still closes on a pointerdown outside', async () => {
    const wrapper = await open()

    document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    await settle()

    expect(wrapper.find('.vt-group-panel').exists()).toBe(false)
    wrapper.unmount()
  })
})
