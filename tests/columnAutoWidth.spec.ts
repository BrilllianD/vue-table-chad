import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h, nextTick, ref } from 'vue'
import DataTable from '../src/components/preset/DataTable.vue'
import { useAutoColumnWidth } from '../src/components/preset/useAutoColumnWidth'
import { useLocalDataSource } from '../src/core/useLocalDataSource'
import { useTableState } from '../src/core/useTableState'
import { useColumns } from '../src/core/useColumns'
import { people, personColumns, type Person } from './fixtures'

/**
 * The probe that lets a column that declares no width be as wide as what it
 * holds.
 *
 * jsdom applies no layout, so the real measurement cannot be exercised here —
 * which is the point of the last case: the whole suite's compatibility with
 * this feature rests on an unmeasurable environment reporting zero and the
 * measurement declining to write anything.
 */
function scrollBox(headers: Record<string, number>): HTMLElement {
  const box = document.createElement('div')
  box.className = 'vt-scroll'
  box.innerHTML =
    '<table class="vt-table"><thead><tr>' +
    Object.keys(headers)
      .map((id) => `<th class="vt-th" data-column="${id}"></th>`)
      .concat('<th class="vt-th" data-column-group="band"></th>')
      .join('') +
    '</tr></thead></table>'

  for (const cell of box.querySelectorAll<HTMLElement>('.vt-th[data-column]')) {
    const width = headers[cell.dataset.column!]!
    cell.getBoundingClientRect = () => ({ width }) as DOMRect
  }
  document.body.append(box)
  return box
}

/** Mounts the composable, since it registers a hook and a watcher. */
function host(box: HTMLElement, columns: ReturnType<typeof useColumns<Person>>, rows = 3) {
  const api = ref<ReturnType<typeof useAutoColumnWidth<Person>> | null>(null)
  const wrapper = mount(
    defineComponent({
      setup() {
        api.value = useAutoColumnWidth<Person>({
          box: ref(box),
          columns: () => columns,
          renderedRows: () => rows,
        })
        return () => h('div')
      },
    }),
  )
  return { api, wrapper }
}

describe('useAutoColumnWidth', () => {
  it('measures every column once the table has rows', async () => {
    const columns = useColumns<Person>(personColumns)
    const box = scrollBox({ name: 92, department: 210, salary: 70 })
    const { wrapper } = host(box, columns)
    await nextTick()

    const widthOf = (id: string) =>
      columns.all.value.find((column) => column.id === id)?.resolvedWidth
    expect(widthOf('name')).toBe(92)
    // Clamped at the default width, which is the flat 160 every undeclared
    // column used to get.
    expect(widthOf('department')).toBe(160)
    expect(widthOf('salary')).toBe(70)
    wrapper.unmount()
    box.remove()
  })

  it('leaves the DOM exactly as it found it', async () => {
    const columns = useColumns<Person>(personColumns)
    const box = scrollBox({ name: 92 })
    const table = box.querySelector('.vt-table')!
    box.scrollLeft = 40
    const { wrapper } = host(box, columns)
    await nextTick()

    // The attribute exists for one synchronous instant; a leftover would leave
    // the table permanently laid out by its contents.
    expect(table.hasAttribute('data-measuring')).toBe(false)
    // Changing the table's used width can clamp the scroll position, and a
    // measurement must not move the reader's view.
    expect(box.scrollLeft).toBe(40)
    wrapper.unmount()
    box.remove()
  })

  it('waits for rows rather than measuring a bare header', async () => {
    const columns = useColumns<Person>(personColumns)
    const box = scrollBox({ name: 92 })
    const { wrapper } = host(box, columns, 0)
    await nextTick()

    // A header-only pass would cache the header's width as the column's before
    // a single cell had been seen.
    expect(columns.all.value[0]!.resolvedWidth).toBe(160)
    wrapper.unmount()
    box.remove()
  })

  it('measures again only when asked to', async () => {
    const columns = useColumns<Person>(personColumns)
    const box = scrollBox({ name: 92 })
    const { api, wrapper } = host(box, columns)
    await nextTick()

    const cell = box.querySelector<HTMLElement>('.vt-th[data-column="name"]')!
    cell.getBoundingClientRect = () => ({ width: 140 }) as DOMRect
    columns.setAutoWidths({ name: 140 })
    expect(columns.all.value[0]!.resolvedWidth).toBe(92)

    api.value!.remeasure()
    expect(columns.all.value[0]!.resolvedWidth).toBe(140)
    wrapper.unmount()
    box.remove()
  })

  it('writes nothing where nothing has a layout', async () => {
    // The tripwire for the other 800 tests: every rect is zero under jsdom, so
    // every column stays on the declared fallback. If this case ever fails, the
    // measurement has started leaking and the assertions elsewhere that rest on
    // 160 are the next thing to go.
    const Host = defineComponent({
      setup() {
        const state = useTableState({ pageSize: 3 })
        const source = useLocalDataSource<Person>(people, personColumns, state.query, {
          debounceMs: 0,
        })
        return () => h(DataTable as never, { columns: personColumns, source, state })
      },
    })
    const wrapper = mount(Host, { attachTo: document.body })
    await nextTick()
    await nextTick()

    const widths = wrapper.findAll('colgroup col').map((col) => col.attributes('style'))
    expect(widths.every((style) => style?.includes('width: 160px'))).toBe(true)
    wrapper.unmount()
  })
})
