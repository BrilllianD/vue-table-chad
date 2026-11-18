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

/**
 * The panels are teleported to `<body>`, so a wrapper `find` cannot see them.
 * Looks the same way the browser does: through the document.
 */
const inBody = (selector: string) => [...document.body.querySelectorAll<HTMLElement>(selector)]

function openPanel(wrapper: ReturnType<typeof mountTable>, label: string) {
  const trigger = wrapper.findAll('button').find((button) => button.text().startsWith(label))
  return trigger!.trigger('click')
}

describe('ColumnVisibilityMenu dismissal', () => {
  function open() {
    const wrapper = mountTable()
    return openPanel(wrapper, 'Columns').then(() => wrapper)
  }

  function rows() {
    return inBody('.vt-columns-row')
  }

  function labels(): string[] {
    return rows().map((row) => row.querySelector('.vt-columns-label')!.textContent!.trim())
  }

  it('stays open when a move steals the button focus', async () => {
    const wrapper = await open()
    expect(labels()[1]).toBe('Department')

    pressAndBlur(rows()[1]!.querySelector<HTMLElement>('[aria-label="Move up"]')!)
    await settle()

    expect(inBody('.vt-columns-panel')).toHaveLength(1)
    expect(labels().slice(0, 2)).toEqual(['Department', 'Name'])
    wrapper.unmount()
  })

  it('keeps focus on the pressed button so it can be pressed again', async () => {
    const wrapper = await open()

    // Third row: two moves up are available, so the button stays enabled.
    const up = rows()[2]!.querySelector<HTMLElement>('[aria-label="Move up"]')!
    pressAndBlur(up)
    await settle()

    expect(document.activeElement).toBe(up)
    expect(labels().slice(0, 3)).toEqual(['Name', 'Salary', 'Department'])
    wrapper.unmount()
  })

  it('hands focus to the other arrow when the move disables the pressed one', async () => {
    const wrapper = await open()

    const row = rows()[1]!
    const up = row.querySelector<HTMLButtonElement>('[aria-label="Move up"]')!
    const down = row.querySelector<HTMLElement>('[aria-label="Move down"]')!
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

    inBody('.vt-columns-panel')[0]!.dispatchEvent(
      new FocusEvent('focusout', { bubbles: true, relatedTarget: outside }),
    )
    await settle()

    expect(inBody('.vt-columns-panel')).toHaveLength(0)
    outside.remove()
    wrapper.unmount()
  })

  it('still closes on a pointerdown outside', async () => {
    const wrapper = await open()

    document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    await settle()

    expect(inBody('.vt-columns-panel')).toHaveLength(0)
    wrapper.unmount()
  })

  it('ignores a pointerdown inside the panel', async () => {
    const wrapper = await open()

    const panel = inBody('.vt-columns-panel')[0]!
    panel.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    await settle()

    expect(inBody('.vt-columns-panel')).toHaveLength(1)
    wrapper.unmount()
  })
})

describe('RowGroupMenu dismissal', () => {
  function open() {
    const wrapper = mountTable({ initialGroupBy: ['department', 'active'] })
    return openPanel(wrapper, 'Group by').then(() => wrapper)
  }

  function levels() {
    return inBody('.vt-group-level')
  }

  function labels(): string[] {
    return levels().map((level) => level.querySelector('.vt-group-level-label')!.textContent!.trim())
  }

  it('stays open when a move steals the button focus', async () => {
    const wrapper = await open()
    expect(labels()).toEqual(['Department', 'Active'])

    const row = levels()[1]!
    const up = row.querySelector<HTMLButtonElement>('[aria-label="Move up a level"]')!
    const down = row.querySelector<HTMLElement>('[aria-label="Move down a level"]')!
    pressAndBlur(up)
    await settle()

    expect(inBody('.vt-group-panel')).toHaveLength(1)
    expect(labels()).toEqual(['Active', 'Department'])
    // Outermost level now, so ↑ is disabled and ↓ takes the focus.
    expect(up.disabled).toBe(true)
    expect(document.activeElement).toBe(down)
    wrapper.unmount()
  })

  it('still closes on a pointerdown outside', async () => {
    const wrapper = await open()

    document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    await settle()

    expect(inBody('.vt-group-panel')).toHaveLength(0)
    wrapper.unmount()
  })
})

describe('toolbar menus are teleported', () => {
  const menus = [
    { name: 'ColumnVisibilityMenu', trigger: 'Columns', panel: '.vt-columns-panel' },
    { name: 'RowGroupMenu', trigger: 'Group by', panel: '.vt-group-panel' },
  ]

  for (const { name, trigger, panel } of menus) {
    describe(name, () => {
      it('renders the panel as a positioned vt-portal child of <body>', async () => {
        const wrapper = mountTable()
        await openPanel(wrapper, trigger)
        await settle()

        const el = inBody(panel)[0]!
        expect(el.parentElement).toBe(document.body)
        expect(el.classList.contains('vt-portal')).toBe(true)
        expect(el.style.top.endsWith('px')).toBe(true)
        expect(el.style.left.endsWith('px')).toBe(true)
        wrapper.unmount()
      })

      it('moves focus into the panel on open', async () => {
        const wrapper = mountTable()
        await openPanel(wrapper, trigger)
        await settle()

        expect(inBody(panel)[0]!.contains(document.activeElement)).toBe(true)
        wrapper.unmount()
      })

      it('carries a forced theme', async () => {
        const wrapper = mountTable({ theme: 'dark' })
        await openPanel(wrapper, trigger)
        await settle()

        expect(inBody(panel)[0]!.getAttribute('data-theme')).toBe('dark')
        wrapper.unmount()
      })

      it('leaves nothing behind in <body> after unmount', async () => {
        const wrapper = mountTable()
        await openPanel(wrapper, trigger)
        await settle()
        expect(inBody(panel)).toHaveLength(1)

        wrapper.unmount()
        expect(inBody('.vt-columns-panel, .vt-group-panel')).toHaveLength(0)
      })
    })
  }
})
