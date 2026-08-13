import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h, nextTick, ref } from 'vue'
import DataTable from '../src/components/preset/DataTable.vue'
import TableRoot from '../src/components/primitives/TableRoot.vue'
import TablePagination from '../src/components/primitives/TablePagination.vue'
import { useLocalDataSource } from '../src/core/useLocalDataSource'
import { useTableState } from '../src/core/useTableState'
import { people, personColumns, type Person } from './fixtures'

const columns = personColumns.map((column) =>
  column.id === 'name' ? { ...column, accessor: (row: Person) => row.name } : column,
)

function mountTable(props: Record<string, unknown> = {}) {
  const Host = defineComponent({
    setup() {
      const state = useTableState({ pageSize: 3 })
      const source = useLocalDataSource<Person>(people, columns, state.query)
      return () => h(DataTable as never, { columns, source, state, ...props })
    },
  })
  return mount(Host, { attachTo: document.body })
}

function bodyText(wrapper: ReturnType<typeof mountTable>): string[] {
  return wrapper.findAll('tbody tr').map((row) => row.text())
}

describe('DataTable rendering', () => {
  it('renders a header and the first page of rows', () => {
    const wrapper = mountTable()
    const headers = wrapper.findAll('thead th').map((th) => th.text())
    expect(headers.join(' ')).toContain('Name')
    expect(headers.join(' ')).toContain('Salary')
    expect(wrapper.findAll('tbody tr')).toHaveLength(3)
    wrapper.unmount()
  })

  it('reads cells through the column accessor and format', () => {
    const wrapper = mountTable()
    // `salary` has no format here, `active` does not either — but the date and
    // number columns must still stringify rather than render "[object Object]".
    expect(bodyText(wrapper)[0]).toContain('Ada Lovelace')
    expect(bodyText(wrapper)[0]).toContain('120000')
    wrapper.unmount()
  })

  it('sorts when a header trigger is clicked', async () => {
    const wrapper = mountTable()
    const salaryHeader = wrapper
      .findAll('thead th')
      .find((th) => th.attributes('data-column') === 'salary')!

    await salaryHeader.find('button.vt-sort').trigger('click')
    expect(salaryHeader.attributes('data-sorted')).toBe('asc')
    expect(bodyText(wrapper)[0]).toContain('Item 10') // 60000, the lowest

    await salaryHeader.find('button.vt-sort').trigger('click')
    expect(salaryHeader.attributes('data-sorted')).toBe('desc')
    expect(bodyText(wrapper)[0]).toContain('Barbara Liskov') // 150000, the highest

    // Third click clears the sort.
    await salaryHeader.find('button.vt-sort').trigger('click')
    expect(salaryHeader.attributes('data-sorted')).toBeUndefined()
    wrapper.unmount()
  })

  it('builds a multi-sort on shift-click and shows the rank badge', async () => {
    const wrapper = mountTable()
    const header = (id: string) =>
      wrapper.findAll('thead th').find((th) => th.attributes('data-column') === id)!

    await header('department').find('button.vt-sort').trigger('click', { shiftKey: true })
    await header('salary').find('button.vt-sort').trigger('click', { shiftKey: true })

    expect(header('department').attributes('data-sorted')).toBe('asc')
    expect(header('salary').attributes('data-sorted')).toBe('asc')
    expect(header('salary').find('.vt-sort-index').text()).toBe('2')
    wrapper.unmount()
  })

  it('filters through the global search box', async () => {
    const wrapper = mountTable()
    const search = wrapper.find('input.vt-search')
    await search.setValue('research')
    await nextTick()
    expect(wrapper.findAll('tbody tr')).toHaveLength(2)
    wrapper.unmount()
  })

  it('shows the empty state when nothing matches', async () => {
    const wrapper = mountTable()
    await wrapper.find('input.vt-search').setValue('zzzz-nothing')
    await nextTick()
    expect(wrapper.text()).toContain('No rows match the current filters.')
    wrapper.unmount()
  })

  it('paginates and reports the row range', async () => {
    const wrapper = mountTable()
    expect(wrapper.find('.vt-pagination-summary').text()).toContain('1–3 of 7')

    const nextButton = wrapper.find('button[aria-label="Next page"]')
    await nextButton.trigger('click')
    await nextTick()

    expect(wrapper.find('.vt-pagination-summary').text()).toContain('4–6 of 7')
    expect(bodyText(wrapper)[0]).toContain('Katherine Johnson')
    wrapper.unmount()
  })
})

describe('DataTable selection', () => {
  it('selects rows and marks them in the DOM', async () => {
    const wrapper = mountTable({ selectable: true })
    const firstRowCheckbox = wrapper.findAll('tbody tr')[0]!.find('input[type="checkbox"]')

    await firstRowCheckbox.trigger('click')
    await nextTick()

    expect(wrapper.findAll('tbody tr')[0]!.attributes('data-selected')).toBe('true')
    expect(wrapper.text()).toContain('1 selected')
    wrapper.unmount()
  })

  it('select-all only covers the visible page, then offers all matching', async () => {
    const wrapper = mountTable({ selectable: true })
    const headerCheckbox = wrapper.find('thead input[type="checkbox"]')

    await headerCheckbox.trigger('click')
    await nextTick()

    expect(wrapper.text()).toContain('3 selected')
    // 7 total vs 3 on this page, so the escalation banner appears.
    expect(wrapper.text()).toContain('Select all 7 matching rows')

    await wrapper.find('.vt-selectall-banner button').trigger('click')
    await nextTick()
    expect(wrapper.text()).toContain('7 selected')
    wrapper.unmount()
  })

  it('keeps selection across a page change', async () => {
    const wrapper = mountTable({ selectable: true })
    await wrapper.findAll('tbody tr')[0]!.find('input[type="checkbox"]').trigger('click')
    await wrapper.find('button[aria-label="Next page"]').trigger('click')
    await nextTick()

    expect(wrapper.text()).toContain('1 selected')
    expect(wrapper.findAll('tbody tr')[0]!.attributes('data-selected')).toBeUndefined()
    wrapper.unmount()
  })

  it('hides the header checkbox in single-select mode', () => {
    const wrapper = mountTable({ selectable: 'single' })
    expect(wrapper.find('thead input[type="checkbox"]').exists()).toBe(false)
    expect(wrapper.find('tbody input[type="checkbox"]').exists()).toBe(true)
    wrapper.unmount()
  })
})

describe('DataTable filter popover', () => {
  it('opens a facet list built from the data', async () => {
    const wrapper = mountTable()
    const departmentHeader = wrapper
      .findAll('thead th')
      .find((th) => th.attributes('data-column') === 'department')!

    await departmentHeader.find('.vt-filter-trigger').trigger('click')
    await nextTick()
    await nextTick()

    const panel = departmentHeader.find('.vt-filter-panel')
    expect(panel.exists()).toBe(true)
    expect(panel.text()).toContain('Engineering')
    expect(panel.text()).toContain('(Blanks)')
    wrapper.unmount()
  })

  it('applies a value filter and flags the column as filtered', async () => {
    const wrapper = mountTable()
    const departmentHeader = () =>
      wrapper.findAll('thead th').find((th) => th.attributes('data-column') === 'department')!

    await departmentHeader().find('.vt-filter-trigger').trigger('click')
    await nextTick()
    await nextTick()

    // Uncheck "Select All", then tick just Engineering.
    const rows = departmentHeader().findAll('.vt-valuelist-row')
    await rows[0]!.find('input').trigger('click') // (Select All) -> off
    const engineering = rows.find((row) => row.text().includes('Engineering'))!
    await engineering.find('input').trigger('click')
    await departmentHeader().find('.vt-btn-primary').trigger('click')
    await nextTick()

    expect(wrapper.findAll('tbody tr')).toHaveLength(2)
    expect(departmentHeader().attributes('data-filtered')).toBe('true')
    expect(wrapper.find('.vt-chip').text()).toContain('Department')
    wrapper.unmount()
  })

  it('clears a filter from its chip', async () => {
    const wrapper = mountTable()
    const departmentHeader = () =>
      wrapper.findAll('thead th').find((th) => th.attributes('data-column') === 'department')!

    await departmentHeader().find('.vt-filter-trigger').trigger('click')
    await nextTick()
    await nextTick()
    const rows = departmentHeader().findAll('.vt-valuelist-row')
    await rows[0]!.find('input').trigger('click')
    await rows.find((row) => row.text().includes('Engineering'))!.find('input').trigger('click')
    await departmentHeader().find('.vt-btn-primary').trigger('click')
    await nextTick()
    expect(wrapper.findAll('tbody tr')).toHaveLength(2)

    await wrapper.find('.vt-chip-remove').trigger('click')
    await nextTick()
    expect(wrapper.findAll('tbody tr')).toHaveLength(3) // back to a full page
    wrapper.unmount()
  })
})

describe('primitives used standalone', () => {
  it('TablePagination works with no TableRoot ancestor', async () => {
    const page = ref(2)
    const wrapper = mount(TablePagination, {
      props: {
        page: page.value,
        pageSize: 10,
        total: 95,
        'onUpdate:page': (next: number) => (page.value = next),
      },
    })

    expect(wrapper.find('.vt-pagination-summary').text()).toContain('11–20 of 95')
    await wrapper.find('button[aria-label="Next page"]').trigger('click')
    expect(page.value).toBe(3)
    wrapper.unmount()
  })

  it('TableRoot renders nothing of its own — the slot decides the markup', () => {
    const Host = defineComponent({
      setup() {
        const state = useTableState({ pageSize: 2 })
        const source = useLocalDataSource<Person>(people, columns, state.query)
        return () =>
          h(
            TableRoot as never,
            { columns, source, state },
            {
              default: ({ rows, total }: { rows: Person[]; total: number }) =>
                h('ul', rows.map((row) => h('li', `${row.name} of ${total}`))),
            },
          )
      },
    })

    const wrapper = mount(Host)
    expect(wrapper.find('table').exists()).toBe(false)
    expect(wrapper.findAll('li')).toHaveLength(2)
    expect(wrapper.find('li').text()).toBe('Ada Lovelace of 7')
    wrapper.unmount()
  })
})

describe('column layout', () => {
  it('applies resolved widths and sticky offsets to pinned columns', () => {
    const pinned = columns.map((column) =>
      column.id === 'name' ? { ...column, pinned: 'left' as const, width: 200 } : column,
    )
    const Host = defineComponent({
      setup() {
        const state = useTableState({ pageSize: 3 })
        const source = useLocalDataSource<Person>(people, pinned, state.query)
        return () => h(DataTable as never, { columns: pinned, source, state })
      },
    })

    const wrapper = mount(Host)
    const nameHeader = wrapper
      .findAll('thead th')
      .find((th) => th.attributes('data-column') === 'name')!

    expect(nameHeader.attributes('data-pinned')).toBe('left')
    expect(nameHeader.attributes('style')).toContain('left: 0px')
    expect(wrapper.find('colgroup col').attributes('style')).toContain('width: 200px')
    wrapper.unmount()
  })

  it('hides a column through the columns menu', async () => {
    const wrapper = mountTable()
    await wrapper.find('.vt-columns-menu > button').trigger('click')
    await nextTick()

    const before = wrapper.findAll('thead th').length
    const emailRow = wrapper
      .findAll('.vt-columns-row')
      .find((row) => row.text().includes('Department'))!
    await emailRow.find('input[type="checkbox"]').trigger('click')
    await nextTick()

    expect(wrapper.findAll('thead th').length).toBe(before - 1)
    wrapper.unmount()
  })
})
