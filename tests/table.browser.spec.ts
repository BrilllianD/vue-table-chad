import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { mount, type VueWrapper } from '@vue/test-utils'
import { defineComponent, h, nextTick, ref, shallowRef } from 'vue'
import DataTable from '../src/components/preset/DataTable.vue'
import { useLocalDataSource } from '../src/core/useLocalDataSource'
import { useTableState } from '../src/core/useTableState'
import { useRowEditing } from '../src/core/useRowEditing'
import { replaceRowIn } from '../src/core/editing'
import type { ColumnDef } from '../src/core/types'
import { people, personColumns, type Person } from './fixtures'
// The published JS does not load the stylesheet; layout and stacking need it.
import '../src/components/preset/table.css'

/**
 * What happy-dom cannot show: real stacking and clipping for the table's overlays, the font family
 * a teleported panel computes under a wrapper font, and the real click, click, dblclick sequence of
 * a double click.
 */

let wrapper: VueWrapper | undefined

beforeEach(async () => {
  await page.viewport(1000, 700)
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  document.body.innerHTML = ''
})

/** A clipping stacking context under a full-page cover, like a dialog frame under a modal. */
function mountInWindow() {
  const Host = defineComponent({
    setup() {
      const state = useTableState({ pageSize: 10 })
      const source = useLocalDataSource<Person>(people, personColumns, state.query, {
        debounceMs: 0,
      })
      return () => [
        h(
          'div',
          {
            'data-testid': 'window',
            style:
              'position: fixed; top: 20px; left: 20px; width: 760px; height: 90px; overflow: hidden; z-index: 44; transform: translateZ(0)',
          },
          [
            h(DataTable as never, {
              columns: personColumns,
              source,
              state,
              contextMenu: true,
              cellCursor: true,
            }),
          ],
        ),
        h('div', {
          'data-testid': 'cover',
          style: 'position: fixed; inset: 0; z-index: 5000; background: rgb(0 0 0 / 0.1)',
        }),
      ]
    },
  })
  return mount(Host, { attachTo: document.body })
}

/** A table under a host that sets the font family, and nothing sets `--vtc-font-family`. */
function mountUnderFont() {
  const Host = defineComponent({
    setup() {
      const state = useTableState({ pageSize: 10 })
      const source = useLocalDataSource<Person>(people, personColumns, state.query, {
        debounceMs: 0,
      })
      return () =>
        h('div', { style: 'font-family: "Courier New", monospace' }, [
          h(DataTable as never, {
            columns: personColumns,
            source,
            state,
            contextMenu: true,
          }),
        ])
    },
  })
  return mount(Host, { attachTo: document.body })
}

const overlays = [
  {
    name: 'ColumnVisibilityMenu',
    panel: '.vt-columns-panel',
    trigger: (root: VueWrapper) =>
      root.findAll('button').find((button) => button.text().startsWith('Columns'))!.element,
  },
  {
    name: 'RowGroupMenu',
    panel: '.vt-group-panel',
    trigger: (root: VueWrapper) =>
      root.findAll('button').find((button) => button.text().startsWith('Group by'))!.element,
  },
  {
    name: 'ColumnFilterPopover',
    panel: '.vt-filter-panel',
    trigger: (root: VueWrapper) =>
      root.find('.vt-th[data-column="name"] .vt-filter-trigger').element,
  },
]

describe.each(overlays)('$name', ({ panel, trigger }) => {
  it('opens above the page from inside a clipping window', async () => {
    wrapper = mountInWindow()
    const windowEl = document.querySelector<HTMLElement>('[data-testid=window]')!
    // The cover intercepts a real click, so the trigger is clicked through the DOM.
    ;(trigger(wrapper) as HTMLElement).click()
    await vi.waitFor(() => expect(document.querySelector(panel)).not.toBeNull())
    const panelEl = document.querySelector<HTMLElement>(panel)!

    expect(windowEl.contains(panelEl)).toBe(false)
    expect(getComputedStyle(panelEl).zIndex).toBe('9999')

    const windowRect = windowEl.getBoundingClientRect()
    const panelRect = panelEl.getBoundingClientRect()
    expect(panelRect.bottom).toBeGreaterThan(windowRect.bottom)

    // A point in the part of the panel below the window: a clipped or lower panel could not show it.
    const x = (panelRect.left + panelRect.right) / 2
    const y = (windowRect.bottom + panelRect.bottom) / 2
    const hit = document.elementFromPoint(x, y)
    expect(hit && panelEl.contains(hit)).toBe(true)

    panelEl.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    )
    await vi.waitFor(() => expect(document.querySelector(panel)).toBeNull())
  })

  it('takes the font family of the table it opened from', async () => {
    wrapper = mountUnderFont()
    ;(trigger(wrapper) as HTMLElement).click()
    await vi.waitFor(() => expect(document.querySelector(panel)).not.toBeNull())
    const panelEl = document.querySelector<HTMLElement>(panel)!

    const tableFamily = getComputedStyle(document.querySelector('.vt-datatable')!).fontFamily
    expect(tableFamily).not.toBe(getComputedStyle(document.body).fontFamily)
    expect(getComputedStyle(panelEl).fontFamily).toBe(tableFamily)

    panelEl.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    )
    await vi.waitFor(() => expect(document.querySelector(panel)).toBeNull())
  })
})

const DEPARTMENTS = ['Engineering', 'Research', 'Support']

const editableColumns: ColumnDef<Person>[] = personColumns.map((column) =>
  column.id === 'department' ? { ...column, editable: true, options: DEPARTMENTS } : column,
)

function nextFrames(count: number): Promise<void> {
  return new Promise((resolve) => {
    const step = (left: number) =>
      left === 0 ? resolve() : requestAnimationFrame(() => step(left - 1))
    step(count)
  })
}

describe('a real double click', () => {
  it('on an editable select cell leaves its list open and reports no rowDblclick', async () => {
    const onRowDblclick = vi.fn()
    const rows = shallowRef<Person[]>([...people])
    const Host = defineComponent({
      setup() {
        const state = useTableState({ pageSize: 3 })
        const source = useLocalDataSource<Person>(rows, editableColumns, state.query, {
          debounceMs: 0,
        })
        const session = useRowEditing<Person>(source, editableColumns, {
          mode: ref('cell'),
          save: async () => {},
          apply: (next) => {
            rows.value = replaceRowIn(rows.value, next, (row) => row.id)
          },
        })
        return () =>
          h(DataTable as never, {
            columns: editableColumns,
            source,
            state,
            editing: session,
            onRowDblclick,
          })
      },
    })
    wrapper = mount(Host, { attachTo: document.body })
    await nextTick()

    const trigger = document.querySelector<HTMLElement>(
      'tbody tr:first-child td[data-column="department"] .vt-cell-trigger',
    )!
    await userEvent.dblClick(trigger)

    await vi.waitFor(() => expect(document.querySelectorAll('.vt-select-panel')).toHaveLength(1))
    await nextFrames(2)
    expect(document.querySelectorAll('.vt-select-panel')).toHaveLength(1)
    expect(onRowDblclick).not.toHaveBeenCalled()
  })

  it('on the selection checkbox reports nothing, on a plain cell reports once', async () => {
    const onRowDblclick = vi.fn()
    const onRowClick = vi.fn()
    const Host = defineComponent({
      setup() {
        const state = useTableState({ pageSize: 3 })
        const source = useLocalDataSource<Person>(people, personColumns, state.query, {
          debounceMs: 0,
        })
        return () =>
          h(DataTable as never, {
            columns: personColumns,
            source,
            state,
            selectable: true,
            onRowDblclick,
            onRowClick,
          })
      },
    })
    wrapper = mount(Host, { attachTo: document.body })
    await nextTick()

    const row = document.querySelector('tbody tr')!
    await userEvent.dblClick(row.querySelector<HTMLElement>('.vt-td-selection input')!)
    expect(onRowDblclick).toHaveBeenCalledTimes(0)

    await userEvent.dblClick(row.querySelector<HTMLElement>('td[data-column="hiredAt"]')!)
    expect(onRowDblclick).toHaveBeenCalledTimes(1)
    expect(onRowDblclick.mock.calls[0]![0]).toMatchObject({ id: people[0]!.id })
    // Each click of the double click reports a rowClick on the cell.
    expect(onRowClick).toHaveBeenCalledTimes(2)
  })
})
