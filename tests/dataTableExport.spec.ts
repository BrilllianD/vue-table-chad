import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h, nextTick, shallowRef } from 'vue'
import DataTable from '../src/components/preset/DataTable.vue'
import { useLocalDataSource } from '../src/core/useLocalDataSource'
import { useTableState } from '../src/core/useTableState'
import type { TableExportPayload } from '../src/components/preset/tableExport'
import type { ColumnDef } from '../src/core/types'
import { people, personColumns, type Person } from './fixtures'

/**
 * The export button, end to end through the preset.
 *
 * The serialisation itself is `tests/export.spec.ts`. What is asserted here is
 * everything the component adds around it: which columns and which rows the
 * button chooses, that the event fires before the download and can replace it,
 * and that nothing happens at all without `showExport`.
 *
 * The download is always cancelled through `preventDefault`. jsdom has no
 * object URLs and no downloads, so leaving it in would test the environment
 * rather than the component.
 */

const columns: ColumnDef<Person>[] = personColumns.map((column) =>
  column.id === 'salary'
    ? { ...column, format: (value: unknown) => (value === null ? '—' : `$${value}`) }
    : column,
)

function mountTable(props: Record<string, unknown> = {}) {
  const rows = shallowRef<Person[]>([...people])
  const exports: TableExportPayload[] = []
  const Host = defineComponent({
    setup() {
      // A page size of 2 over 7 rows, so "the page" and "the result set" are
      // different answers and the assertion below can tell them apart.
      const state = useTableState({ pageSize: 2 })
      const source = useLocalDataSource<Person>(rows, columns, state.query, { debounceMs: 0 })
      return () =>
        h(DataTable as never, {
          columns,
          source,
          state,
          showExport: true,
          onExport: (payload: TableExportPayload) => {
            exports.push(payload)
            payload.preventDefault()
          },
          ...props,
        })
    },
  })
  const wrapper = mount(Host, { attachTo: document.body })
  return { wrapper, exports }
}

function exportButton(wrapper: ReturnType<typeof mountTable>['wrapper']) {
  return wrapper
    .findAll('.vt-toolbar button')
    .find((button) => button.text() === 'Export')
}

describe('DataTable export', () => {
  it('renders no button without showExport', () => {
    const { wrapper } = mountTable({ showExport: false })
    expect(exportButton(wrapper)).toBeUndefined()
    wrapper.unmount()
  })

  it('emits the whole result set, not the page', async () => {
    const { wrapper, exports } = mountTable()
    await exportButton(wrapper)!.trigger('click')
    await nextTick()

    const lines = exports[0]!.text.split('\r\n')
    // One header line plus every row, while the table itself shows two.
    expect(wrapper.findAll('tbody tr')).toHaveLength(2)
    expect(lines).toHaveLength(people.length + 1)
    expect(lines[0]).toBe('Name,Department,Salary,Hired,Active')
    wrapper.unmount()
  })

  it('writes what the cells show, formatter included', async () => {
    const { wrapper, exports } = mountTable()
    await exportButton(wrapper)!.trigger('click')
    await nextTick()

    expect(exports[0]!.text).toContain('$120000')
    wrapper.unmount()
  })

  it('leaves out a hidden column', async () => {
    const { wrapper, exports } = mountTable({
      initialLayout: { hidden: ['salary'] },
    })
    await exportButton(wrapper)!.trigger('click')
    await nextTick()

    expect(exports[0]!.text.split('\r\n')[0]).toBe('Name,Department,Hired,Active')
    wrapper.unmount()
  })

  it('carries the filename, defaulting to table.csv', async () => {
    const { wrapper, exports } = mountTable()
    await exportButton(wrapper)!.trigger('click')
    await nextTick()
    expect(exports[0]!.filename).toBe('table.csv')
    wrapper.unmount()

    const named = mountTable({ exportFilename: 'people.csv' })
    await exportButton(named.wrapper)!.trigger('click')
    await nextTick()
    expect(named.exports[0]!.filename).toBe('people.csv')
    named.wrapper.unmount()
  })

  it('downloads unless the listener says otherwise', async () => {
    // The download path is only reachable where object URLs exist, so it is
    // stubbed rather than skipped: what is being asserted is that not calling
    // `preventDefault` still reaches it.
    const createObjectURL = vi.fn(() => 'blob:test')
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL })
    const clicks = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    const { wrapper } = mountTable({ onExport: undefined })
    await exportButton(wrapper)!.trigger('click')
    await nextTick()

    expect(createObjectURL).toHaveBeenCalledTimes(1)
    expect(clicks).toHaveBeenCalledTimes(1)
    // Revoked in the same turn: the click has already taken the blob.
    expect(revokeObjectURL).toHaveBeenCalledTimes(1)

    clicks.mockRestore()
    vi.unstubAllGlobals()
    wrapper.unmount()
  })

  it('follows the filter and the sort', async () => {
    const { wrapper, exports } = mountTable()
    await wrapper.get('.vt-search').setValue('Item')
    await nextTick()
    await exportButton(wrapper)!.trigger('click')
    await nextTick()

    const lines = exports[0]!.text.split('\r\n')
    expect(lines).toHaveLength(3)
    expect(lines[1]!.startsWith('Item')).toBe(true)
    wrapper.unmount()
  })
})
