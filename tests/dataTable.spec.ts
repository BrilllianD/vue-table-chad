import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h, nextTick, ref } from 'vue'
import DataTable from '../src/components/preset/DataTable.vue'
import TableRoot from '../src/components/primitives/TableRoot.vue'
import TablePagination from '../src/components/primitives/TablePagination.vue'
import TableRow from '../src/components/primitives/TableRow.vue'
import { useLocalDataSource } from '../src/core/useLocalDataSource'
import { useTableState } from '../src/core/useTableState'
import { valuesFilter } from '../src/core/filters/model'
import type { ResolvedColumn, SelectionState } from '../src/core/types'
import {
  aggregatedPersonColumns,
  groupedPersonColumns,
  people,
  personColumnGroups,
  personColumns,
  type Person,
} from './fixtures'

const columns = personColumns.map((column) =>
  column.id === 'name' ? { ...column, accessor: (row: Person) => row.name } : column,
)

function mountTable(props: Record<string, unknown> = {}) {
  const Host = defineComponent({
    setup() {
      const state = useTableState({ pageSize: 3 })
      // Synchronous by default here: these tests are about the markup the
      // preset renders, not about when the filter settles. The debounce gets
      // its own test below.
      const source = useLocalDataSource<Person>(people, columns, state.query, {
        debounceMs: (props.debounceMs as number) ?? 0,
      })
      const { debounceMs: _debounceMs, ...rest } = props
      return () => h(DataTable as never, { columns, source, state, ...rest })
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

  it('sorts when the cell around the trigger is clicked, and only once', async () => {
    const wrapper = mountTable()
    const salaryHeader = wrapper
      .findAll('thead th')
      .find((th) => th.attributes('data-column') === 'salary')!

    // The padding around the label, which the pointer cursor already claimed.
    await salaryHeader.trigger('click')
    expect(salaryHeader.attributes('data-sorted')).toBe('asc')

    // The trigger's own click bubbles up to the cell. Acting on both would
    // land on 'desc' in one click.
    await salaryHeader.find('button.vt-sort').trigger('click')
    expect(salaryHeader.attributes('data-sorted')).toBe('desc')

    // Shift is additive from the cell too, the same as from the trigger.
    const nameHeader = wrapper
      .findAll('thead th')
      .find((th) => th.attributes('data-column') === 'name')!
    await nameHeader.trigger('click', { shiftKey: true })
    expect(salaryHeader.attributes('data-sorted')).toBe('desc')
    expect(nameHeader.attributes('data-sorted')).toBe('asc')
    wrapper.unmount()
  })

  it('leaves the cell click to the controls inside it', async () => {
    const wrapper = mountTable()
    const salaryHeader = wrapper
      .findAll('thead th')
      .find((th) => th.attributes('data-column') === 'salary')!

    // The resize handle is a `<span role="separator">`, not a button, and a
    // drag of it must not also sort the column it resizes.
    await salaryHeader.find('.vt-resize').trigger('click')
    expect(salaryHeader.attributes('data-sorted')).toBeUndefined()

    await salaryHeader.find('.vt-filter-trigger').trigger('click')
    expect(salaryHeader.attributes('data-sorted')).toBeUndefined()
    wrapper.unmount()
  })

  it('does not sort a header that cannot, however much of it is clicked', async () => {
    const wrapper = mountTable({
      columns: [
        { id: 'name', header: 'Name' },
        { id: 'salary', header: 'Salary', sortable: false },
      ],
    })
    const salaryHeader = wrapper
      .findAll('thead th')
      .find((th) => th.attributes('data-column') === 'salary')!
    await salaryHeader.trigger('click')
    expect(salaryHeader.attributes('data-sorted')).toBeUndefined()
    wrapper.unmount()
  })

  it('marks what a header cell can do, not only what it is doing', () => {
    // Capability, which is what the stylesheet points the cursor at. jsdom
    // applies no CSS, so the attribute is the whole testable half.
    const wrapper = mountTable({
      columns: [
        { id: 'name', header: 'Name' },
        { id: 'salary', header: 'Salary', sortable: false, filterable: false },
      ],
    })
    const header = (id: string) =>
      wrapper.findAll('thead th').find((th) => th.attributes('data-column') === id)!

    expect(header('name').attributes('data-sortable')).toBe('true')
    expect(header('name').attributes('data-filterable')).toBe('true')
    expect(header('salary').attributes('data-sortable')).toBeUndefined()
    expect(header('salary').attributes('data-filterable')).toBeUndefined()
    wrapper.unmount()
  })

  it('shows the direction on the trigger itself, not only on the cell', async () => {
    const wrapper = mountTable()
    const trigger = () =>
      wrapper
        .findAll('thead th')
        .find((th) => th.attributes('data-column') === 'salary')!
        .find('button.vt-sort')

    // `direction` is a stand-in prop whose type includes `false`, so Vue counts
    // it as a boolean prop; an absent one cast to `false` would read as "not
    // sorted" and pin the arrow to its unsorted glyph forever, while the `<th>`
    // — which reads the resolved column instead — kept updating.
    expect(trigger().attributes('data-direction')).toBe('none')
    expect(trigger().find('.vt-sort-icon').text()).toBe('\u21c5')

    await trigger().trigger('click')
    expect(trigger().attributes('data-direction')).toBe('asc')
    expect(trigger().find('.vt-sort-icon').text()).toBe('\u25b2')

    await trigger().trigger('click')
    expect(trigger().attributes('data-direction')).toBe('desc')
    expect(trigger().find('.vt-sort-icon').text()).toBe('\u25bc')
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

  it('coalesces typing in the search box', async () => {
    vi.useFakeTimers()
    const wrapper = mountTable({ debounceMs: 150 })
    const search = wrapper.find('input.vt-search')

    for (const term of ['r', 're', 'res', 'research']) await search.setValue(term)
    await nextTick()
    // Mid-burst the table has not moved — which is the entire point.
    expect(wrapper.findAll('tbody tr')).toHaveLength(3)

    vi.advanceTimersByTime(150)
    await nextTick()
    expect(wrapper.findAll('tbody tr')).toHaveLength(2)
    wrapper.unmount()
    vi.useRealTimers()
  })

  it('shows the empty state when nothing matches', async () => {
    const wrapper = mountTable()
    await wrapper.find('input.vt-search').setValue('zzzz-nothing')
    await nextTick()
    expect(wrapper.text()).toContain('No Data')
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

  // The mode string has to survive the trip through DataTable into
  // `useRowSelection`; collapsing it to a boolean anywhere in between turns
  // single-select into multi-select while still looking single (no header
  // checkbox), which is the worst possible failure mode.
  it('replaces the previous row in single-select mode', async () => {
    const wrapper = mountTable({ selectable: 'single' })
    const rows = () => wrapper.findAll('tbody tr')

    await rows()[0]!.find('input[type="checkbox"]').trigger('click')
    await nextTick()
    await rows()[1]!.find('input[type="checkbox"]').trigger('click')
    await nextTick()

    expect(rows()[0]!.attributes('data-selected')).toBeUndefined()
    expect(rows()[1]!.attributes('data-selected')).toBe('true')
    expect(wrapper.text()).toContain('1 selected')
    wrapper.unmount()
  })

  // The selection composable used to be created only when `selectable` was
  // truthy at setup, so turning it on later rendered a checkbox column with
  // nothing behind it.
  it('starts working when selectable is switched on at runtime', async () => {
    const selectable = ref<boolean | 'single'>(false)
    const Host = defineComponent({
      setup() {
        const state = useTableState({ pageSize: 3 })
        const source = useLocalDataSource<Person>(people, columns, state.query)
        return () => h(DataTable as never, { columns, source, state, selectable: selectable.value })
      },
    })
    const wrapper = mount(Host, { attachTo: document.body })
    expect(wrapper.find('tbody input[type="checkbox"]').exists()).toBe(false)

    selectable.value = true
    await nextTick()

    const checkbox = wrapper.find('tbody input[type="checkbox"]')
    expect(checkbox.exists()).toBe(true)
    await checkbox.trigger('click')
    await nextTick()

    expect(wrapper.findAll('tbody tr')[0]!.attributes('data-selected')).toBe('true')
    expect(wrapper.text()).toContain('1 selected')
    wrapper.unmount()
  })

  it('switches selection mode without remounting', async () => {
    const selectable = ref<boolean | 'single'>(true)
    const Host = defineComponent({
      setup() {
        const state = useTableState({ pageSize: 3 })
        const source = useLocalDataSource<Person>(people, columns, state.query)
        return () => h(DataTable as never, { columns, source, state, selectable: selectable.value })
      },
    })
    const wrapper = mount(Host, { attachTo: document.body })
    const rows = () => wrapper.findAll('tbody tr')

    await rows()[0]!.find('input[type="checkbox"]').trigger('click')
    await nextTick()
    expect(wrapper.text()).toContain('1 selected')

    selectable.value = 'single'
    await nextTick()
    await rows()[1]!.find('input[type="checkbox"]').trigger('click')
    await nextTick()

    // Single mode now applies to a selection that already existed.
    expect(rows()[0]!.attributes('data-selected')).toBeUndefined()
    expect(wrapper.text()).toContain('1 selected')
    wrapper.unmount()
  })
})

describe('DataTable filter indicators', () => {
  /**
   * B6: the header funnel tested `filters[id] !== undefined` while the chip row
   * tested `pruneFilters`. A no-op filter arriving from `initialFilters` or a
   * URL therefore lit up the header with no chip to explain or clear it.
   */
  it('does not flag a column whose filter matches everything', () => {
    const Host = defineComponent({
      setup() {
        const state = useTableState({
          pageSize: 3,
          initialFilters: { department: valuesFilter(null) },
        })
        const source = useLocalDataSource<Person>(people, columns, state.query)
        return () => h(DataTable as never, { columns, source, state })
      },
    })
    const wrapper = mount(Host, { attachTo: document.body })
    const header = wrapper
      .findAll('thead th')
      .find((th) => th.attributes('data-column') === 'department')!

    expect(header.attributes('data-filtered')).toBeUndefined()
    expect(wrapper.find('.vt-chip').exists()).toBe(false)
    expect(wrapper.findAll('tbody tr')).toHaveLength(3)
    wrapper.unmount()
  })

  it('flags a column whose filter actually narrows the rows', () => {
    const Host = defineComponent({
      setup() {
        const state = useTableState({
          pageSize: 3,
          initialFilters: { department: valuesFilter(['Engineering']) },
        })
        const source = useLocalDataSource<Person>(people, columns, state.query)
        return () => h(DataTable as never, { columns, source, state })
      },
    })
    const wrapper = mount(Host, { attachTo: document.body })
    const header = wrapper
      .findAll('thead th')
      .find((th) => th.attributes('data-column') === 'department')!

    expect(header.attributes('data-filtered')).toBe('true')
    expect(wrapper.find('.vt-chip').text()).toContain('Department')
    wrapper.unmount()
  })
})

describe('DataTable checkbox state', () => {
  /**
   * B5: the input used to toggle itself before the handler ran. When the model
   * then declined to change, the vnode prop was unchanged, Vue patched nothing,
   * and the DOM kept a checked box the selection never contained.
   */
  it('never shows a checked box the model did not accept', async () => {
    const wrapper = mountTable({ selectable: true, isRowSelectable: () => false })
    const header = wrapper.find('thead input[type="checkbox"]')

    await header.trigger('click')
    await nextTick()

    expect((header.element as HTMLInputElement).checked).toBe(false)
    expect(wrapper.text()).not.toContain('selected')
    wrapper.unmount()
  })

  it('keeps the DOM in step with the model on a normal toggle', async () => {
    const wrapper = mountTable({ selectable: true })
    const box = () =>
      wrapper.findAll('tbody tr')[0]!.find('input[type="checkbox"]').element as HTMLInputElement

    await wrapper.findAll('tbody tr')[0]!.find('input[type="checkbox"]').trigger('click')
    await nextTick()
    expect(box().checked).toBe(true)

    await wrapper.findAll('tbody tr')[0]!.find('input[type="checkbox"]').trigger('click')
    await nextTick()
    expect(box().checked).toBe(false)
    wrapper.unmount()
  })
})

describe('DataTable row identity', () => {
  interface Ticket extends Record<string, unknown> {
    ref: string
    title: string
  }

  const ticketColumns = [
    { id: 'ref', header: 'Ref' },
    { id: 'title', header: 'Title' },
  ]

  function mountTickets(rows: Ticket[], props: Record<string, unknown> = {}) {
    const data = ref(rows)
    const Host = defineComponent({
      setup() {
        const state = useTableState({ pageSize: 10 })
        const source = useLocalDataSource<Ticket>(data, ticketColumns, state.query)
        return () => h(DataTable as never, { columns: ticketColumns, source, state, ...props })
      },
    })
    return { wrapper: mount(Host, { attachTo: document.body }), data }
  }

  /**
   * Keys used to come from `row.id ?? JSON.stringify(row)`, ignoring the
   * documented `getRowId` prop. Serialising the row makes the key depend on the
   * row's *contents*, so editing any field looks like a different row and Vue
   * throws the DOM node away instead of patching it.
   */
  it('keys rows through getRowId, so editing a field patches in place', async () => {
    const { wrapper, data } = mountTickets([{ ref: 'T-1', title: 'first' }], {
      getRowId: (row: Ticket) => row.ref,
    })

    const before = wrapper.find('tbody tr').element
    data.value = [{ ref: 'T-1', title: 'edited' }]
    await nextTick()

    expect(wrapper.find('tbody tr').text()).toContain('edited')
    expect(wrapper.find('tbody tr').element).toBe(before)
    wrapper.unmount()
  })

  it('still renders rows that have neither id nor getRowId', () => {
    const { wrapper } = mountTickets([
      { ref: 'T-1', title: 'first' },
      { ref: 'T-2', title: 'second' },
    ])
    expect(wrapper.findAll('tbody tr')).toHaveLength(2)
    wrapper.unmount()
  })
})

describe('DataTable filter popover', () => {
  /**
   * The panel is teleported to `<body>`, so it is not a descendant of the
   * header cell that owns it — look it up in the document instead.
   */
  function panel(): HTMLElement {
    const element = document.querySelector('.vt-filter-panel')
    if (!element) throw new Error('filter panel is not open')
    return element as HTMLElement
  }

  function panelRows(): HTMLElement[] {
    return [...panel().querySelectorAll('.vt-valuelist-row')] as HTMLElement[]
  }

  function click(element: Element | null | undefined): Promise<void> {
    if (!element) throw new Error('element not found')
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    return nextTick()
  }

  async function openDepartmentFilter(wrapper: ReturnType<typeof mountTable>) {
    const header = () =>
      wrapper.findAll('thead th').find((th) => th.attributes('data-column') === 'department')!
    await header().find('.vt-filter-trigger').trigger('click')
    await nextTick()
    await nextTick()
    return header
  }

  /** Uncheck "(Select All)", tick Engineering, Apply. */
  async function filterToEngineering() {
    const rows = panelRows()
    await click(rows[0]?.querySelector('input'))
    await click(rows.find((row) => row.textContent?.includes('Engineering'))?.querySelector('input'))
    await click(panel().querySelector('.vt-btn-primary'))
    await nextTick()
  }

  it('opens a facet list built from the data', async () => {
    const wrapper = mountTable()
    await openDepartmentFilter(wrapper)

    expect(panel().textContent).toContain('Engineering')
    expect(panel().textContent).toContain('(Blanks)')
    wrapper.unmount()
  })

  // A3: `.vt-th` and `.vt-scroll` both clip their overflow, so a panel rendered
  // in place is cropped to the header cell. It has to escape both.
  it('renders the panel outside the scroll container', async () => {
    const wrapper = mountTable()
    await openDepartmentFilter(wrapper)

    expect(panel().parentElement).toBe(document.body)
    expect(wrapper.find('.vt-scroll').element.contains(panel())).toBe(false)
    // And it carries the theme class, since the variables no longer inherit.
    expect(panel().classList.contains('vt-portal')).toBe(true)
    wrapper.unmount()
  })

  it('removes the teleported panel when the table unmounts', async () => {
    const wrapper = mountTable()
    await openDepartmentFilter(wrapper)
    expect(document.querySelectorAll('.vt-filter-panel')).toHaveLength(1)

    wrapper.unmount()
    expect(document.querySelectorAll('.vt-filter-panel')).toHaveLength(0)
  })

  it('applies a value filter and flags the column as filtered', async () => {
    const wrapper = mountTable()
    const header = await openDepartmentFilter(wrapper)
    await filterToEngineering()

    expect(wrapper.findAll('tbody tr')).toHaveLength(2)
    expect(header().attributes('data-filtered')).toBe('true')
    expect(wrapper.find('.vt-chip').text()).toContain('Department')
    wrapper.unmount()
  })

  it('clears a filter from its chip', async () => {
    const wrapper = mountTable()
    await openDepartmentFilter(wrapper)
    await filterToEngineering()
    expect(wrapper.findAll('tbody tr')).toHaveLength(2)

    await wrapper.find('.vt-chip-remove').trigger('click')
    await nextTick()
    expect(wrapper.findAll('tbody tr')).toHaveLength(3) // back to a full page
    wrapper.unmount()
  })

  // B4: a rejecting facet source used to escape as an unhandled rejection and
  // leave an unexplained empty checklist.
  it('surfaces a facet fetch failure instead of rejecting unhandled', async () => {
    const unhandled: unknown[] = []
    const onUnhandled = (event: PromiseRejectionEvent) => {
      unhandled.push(event.reason)
      event.preventDefault()
    }
    window.addEventListener('unhandledrejection', onUnhandled)

    let attempt = 0
    const failing = {
      ...useLocalDataSource<Person>(people, columns, useTableState().query),
      facets: async () => {
        attempt += 1
        if (attempt === 1) throw new Error('facet endpoint down')
        return [{ value: 'Engineering', count: 2 }]
      },
    }
    const Host = defineComponent({
      setup() {
        const state = useTableState({ pageSize: 3 })
        return () => h(DataTable as never, { columns, source: failing, state })
      },
    })
    const wrapper = mount(Host, { attachTo: document.body })
    await openDepartmentFilter(wrapper)

    expect(panel().querySelector('.vt-filter-error')).not.toBeNull()
    expect(panel().textContent).toContain('Could not load filter values')

    // And the panel offers a way back rather than staying broken.
    await click(panel().querySelector('.vt-filter-error button'))
    await nextTick()
    expect(panel().querySelector('.vt-filter-error')).toBeNull()
    expect(panel().textContent).toContain('Engineering')

    await nextTick()
    expect(unhandled).toEqual([])
    window.removeEventListener('unhandledrejection', onUnhandled)
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

  // Double-click is the way back from a drag. It used to write a flat 160,
  // which is a number the column never declared and left a column that *had*
  // declared one unable to return to it.
  it('double-clicking a resize handle restores the declared width', async () => {
    const sized = columns.map((column) =>
      column.id === 'name' ? { ...column, width: 200 } : column,
    )
    const Host = defineComponent({
      setup() {
        const state = useTableState({ pageSize: 3 })
        const source = useLocalDataSource<Person>(people, sized, state.query)
        return () => h(DataTable as never, { columns: sized, source, state })
      },
    })

    const wrapper = mount(Host)
    const firstCol = () => wrapper.find('colgroup col')
    const handle = wrapper
      .findAll('thead th')
      .find((th) => th.attributes('data-column') === 'name')!
      .find('.vt-resize')

    // Shift+ArrowRight is the keyboard resize: 200 + 40.
    await handle.trigger('keydown', { key: 'ArrowRight', shiftKey: true })
    expect(firstCol().attributes('style')).toContain('width: 240px')

    await handle.trigger('dblclick')
    expect(firstCol().attributes('style')).toContain('width: 200px')
    wrapper.unmount()
  })
})

/*
 * The two slots nothing else reaches for. Both are part of the preset's slot
 * API and neither appeared in the demo, the playground or a spec — so when the
 * header and the footer moved into components of their own, the forwarding
 * that keeps those slots working had nothing watching it.
 */
describe('header and footer slots', () => {
  it('headerGroup replaces a band label', () => {
    const Host = defineComponent({
      setup() {
        const state = useTableState({ pageSize: 3 })
        const source = useLocalDataSource<Person>(people, groupedPersonColumns, state.query, {
          debounceMs: 0,
        })
        return () =>
          h(
            DataTable as never,
            { columns: groupedPersonColumns, columnGroups: personColumnGroups, source, state },
            {
              headerGroup: ({ label }: { label: string }) =>
                h('span', { class: 'band-slot' }, `band:${label}`),
            },
          )
      },
    })

    const wrapper = mount(Host, { attachTo: document.body })
    const bands = wrapper.findAll('.band-slot').map((node) => node.text())
    expect(bands.length).toBeGreaterThan(0)
    expect(bands.some((text) => text.startsWith('band:'))).toBe(true)
    // The default it replaced is gone, not merely covered.
    expect(wrapper.find('.vt-th-group .vt-th-label').exists()).toBe(false)
    wrapper.unmount()
  })

  it('footer replaces an aggregate cell, and receives its text', () => {
    const Host = defineComponent({
      setup() {
        const state = useTableState({ pageSize: 3 })
        const source = useLocalDataSource<Person>(people, aggregatedPersonColumns, state.query, {
          debounceMs: 0,
        })
        return () =>
          h(
            DataTable as never,
            { columns: aggregatedPersonColumns, source, state, showFooter: true },
            {
              footer: ({ column, text }: { column: ResolvedColumn<Person>; text: string }) =>
                h('span', { class: 'foot-slot' }, `${column.id}=${text}`),
            },
          )
      },
    })

    const wrapper = mount(Host, { attachTo: document.body })
    const cells = wrapper.findAll('tfoot .foot-slot').map((node) => node.text())
    expect(cells.length).toBe(aggregatedPersonColumns.length)
    // `salary` aggregates `sum`, so the slot must be handed a real number.
    expect(cells.find((text) => text.startsWith('salary='))).not.toBe('salary=')
    wrapper.unmount()
  })

  it('renders the default footer label when no slot is given', () => {
    const Host = defineComponent({
      setup() {
        const state = useTableState({ pageSize: 3 })
        const source = useLocalDataSource<Person>(people, aggregatedPersonColumns, state.query, {
          debounceMs: 0,
        })
        return () =>
          h(DataTable as never, {
            columns: aggregatedPersonColumns,
            source,
            state,
            showFooter: true,
            footerLabel: 'Sum',
          })
      },
    })

    const wrapper = mount(Host, { attachTo: document.body })
    expect(wrapper.find('tfoot').text()).toContain('Sum')
    wrapper.unmount()
  })
})

/*
 * The preset's body slots, all of which now reach `<tbody>` through
 * `DataTableBody` rather than being written inline. Removing that forwarding
 * entirely used to fail exactly one test — an `editor:<id>` case — so
 * `cell:<id>`, `rowActions`, `empty`, `error`, `group` and `groupAggregate`
 * were being forwarded on trust.
 */
describe('body slots survive the forwarding', () => {
  it('cell:<id> replaces one column and leaves the others alone', () => {
    const Host = defineComponent({
      setup() {
        const state = useTableState({ pageSize: 3 })
        const source = useLocalDataSource<Person>(people, columns, state.query, { debounceMs: 0 })
        return () =>
          h(
            DataTable as never,
            { columns, source, state },
            {
              'cell:name': ({ text }: { text: string }) =>
                h('b', { class: 'mine' }, `${text}!`),
            },
          )
      },
    })

    const wrapper = mount(Host, { attachTo: document.body })
    const mine = wrapper.findAll('tbody .mine').map((node) => node.text())
    expect(mine[0]).toBe('Ada Lovelace!')
    expect(mine).toHaveLength(3)
    // The column next to it still renders its default text.
    expect(wrapper.find('tbody tr').text()).toContain('120000')
    wrapper.unmount()
  })

  it('empty replaces the no-rows message', async () => {
    const Host = defineComponent({
      setup() {
        const state = useTableState({ pageSize: 3 })
        const source = useLocalDataSource<Person>(people, columns, state.query, { debounceMs: 0 })
        state.setSearch('nothing matches this')
        return () =>
          h(
            DataTable as never,
            { columns, source, state },
            { empty: () => h('span', { class: 'mine' }, 'none at all') },
          )
      },
    })

    const wrapper = mount(Host, { attachTo: document.body })
    await nextTick()
    expect(wrapper.find('.mine').text()).toBe('none at all')
    expect(wrapper.text()).not.toContain('No Data')
    wrapper.unmount()
  })

  it('falls back to emptyMessage when no slot is given', async () => {
    const Host = defineComponent({
      setup() {
        const state = useTableState({ pageSize: 3 })
        const source = useLocalDataSource<Person>(people, columns, state.query, { debounceMs: 0 })
        state.setSearch('nothing matches this')
        return () => h(DataTable as never, { columns, source, state, emptyMessage: 'Nada' })
      },
    })

    const wrapper = mount(Host, { attachTo: document.body })
    await nextTick()
    // The body owns this fallback now; forwarding only the slots a caller
    // actually passed is what keeps it reachable.
    expect(wrapper.find('.vt-row-message').text()).toBe('Nada')
    wrapper.unmount()
  })

  it('group and groupAggregate replace the band header', async () => {
    const Host = defineComponent({
      setup() {
        const state = useTableState({ pageSize: 20 })
        const source = useLocalDataSource<Person>(people, aggregatedPersonColumns, state.query, {
          debounceMs: 0,
        })
        return () =>
          h(
            DataTable as never,
            {
              columns: aggregatedPersonColumns,
              source,
              state,
              initialGroupBy: ['department'],
            },
            {
              group: ({ group }: { group: { label: string } }) =>
                h('span', { class: 'mine' }, `G:${group.label}`),
              groupAggregate: ({ text }: { text: string }) =>
                h('span', { class: 'agg' }, `A:${text}`),
            },
          )
      },
    })

    const wrapper = mount(Host, { attachTo: document.body })
    await nextTick()
    const bands = wrapper.findAll('.mine').map((node) => node.text())
    expect(bands.length).toBeGreaterThan(0)
    expect(bands[0]!.startsWith('G:')).toBe(true)
    expect(wrapper.findAll('.agg').length).toBeGreaterThan(0)
    wrapper.unmount()
  })

  it('error replaces the failure row and keeps refresh reachable', async () => {
    const refresh = vi.fn()
    const Host = defineComponent({
      setup() {
        const state = useTableState({ pageSize: 3 })
        const source = {
          rows: ref([]),
          total: ref(0),
          loading: ref(false),
          error: ref(new Error('boom')),
          refresh,
          facets: async () => [],
          remote: true,
        }
        return () =>
          h(
            DataTable as never,
            { columns, source, state },
            {
              error: ({ error: err }: { error: Error }) =>
                h('span', { class: 'mine' }, `E:${err.message}`),
            },
          )
      },
    })

    const wrapper = mount(Host, { attachTo: document.body })
    await nextTick()
    expect(wrapper.find('.mine').text()).toBe('E:boom')
    // The default retry button is gone, replaced rather than added to.
    expect(wrapper.find('.vt-error').exists()).toBe(false)
    wrapper.unmount()
  })
})

describe('TableRow as a primitive', () => {
  // A plain record rather than a `Person`: `TableRow` is generic over
  // `Record<string, unknown>`, and these two tests are about a row rendering
  // with no table above it, not about any particular row shape.
  const row: Record<string, unknown> = { id: 1, name: 'Ada Lovelace', salary: 120000 }

  function resolved(
    extra: Partial<ResolvedColumn<Record<string, unknown>>> & { id: string },
  ): ResolvedColumn<Record<string, unknown>> {
    return {
      visible: true,
      collapsed: false,
      order: 0,
      resolvedWidth: undefined,
      pinned: false,
      pinOffset: 0,
      sortDirection: false,
      sortIndex: 0,
      hasFilter: false,
      ...extra,
    }
  }

  it('renders standalone, with no table context above it', () => {
    // The property every primitive here is meant to have: usable on its own.
    // A row that needed a `<TableRoot>` could not be assembled into a custom
    // `<tbody>`, which is the whole reason the layer exists.
    const wrapper = mount(TableRow, {
      props: {
        row,
        columns: [
          resolved({ id: 'name', header: 'Name' }),
          resolved({ id: 'salary', header: 'Salary', format: (value) => `$${value}` }),
        ],
      },
    })

    const cells = wrapper.findAll('td')
    expect(cells).toHaveLength(2)
    expect(cells[0]!.text()).toBe('Ada Lovelace')
    // Formatting comes from the column even with no context to route it.
    expect(cells[1]!.text()).toBe('$120000')
    wrapper.unmount()
  })

  it('reads each cell once rather than once per use', () => {
    let reads = 0
    const wrapper = mount(TableRow, {
      props: {
        row,
        columns: [
          resolved({
            id: 'name',
            header: 'Name',
            accessor: (source) => {
              reads += 1
              return source.name
            },
          }),
        ],
      },
    })

    // Inlined in the preset's template this was three reads: twice to build the
    // slot props, once more for the fallback content.
    expect(reads).toBe(1)
    wrapper.unmount()
  })
})

describe('rowClick', () => {
  it('emits the row that was clicked', async () => {
    // Worth pinning: the click reaches the `<tr>` through `TableRow`'s declared
    // `click` emit rather than through attribute fallthrough, and nothing else
    // in the suite would notice if that wiring came undone.
    const clicked: string[] = []
    const Host = defineComponent({
      setup() {
        const state = useTableState({ pageSize: 3 })
        const source = useLocalDataSource<Person>(people, columns, state.query, { debounceMs: 0 })
        return () =>
          h(DataTable as never, {
            columns,
            source,
            state,
            onRowClick: (row: Person) => clicked.push(row.name),
          })
      },
    })
    const wrapper = mount(Host, { attachTo: document.body })

    await wrapper.findAll('tbody tr')[1]!.trigger('click')
    expect(clicked).toEqual(['Grace Hopper'])
    wrapper.unmount()
  })
})

describe('DataTable loading state', () => {
  /*
   * `useLocalDataSource` hard-wires `loading` to `false`, so `mountTable` can
   * never reach this branch. A minimal hand-rolled `DataSource` is the only way
   * to render the overlay at all.
   */
  function mountLoading(
    props: Record<string, unknown> = {},
    slots: Record<string, unknown> = {},
    pageRows: Person[] = people.slice(0, 3),
  ) {
    const loading = ref(true)
    const Host = defineComponent({
      setup() {
        const state = useTableState({ pageSize: 3 })
        const source = {
          rows: ref(pageRows),
          total: ref(pageRows.length),
          loading,
          error: ref(null),
          refresh: () => {},
          facets: async () => [],
          remote: true,
        }
        return () => h(DataTable as never, { columns, source, state, ...props }, slots)
      },
    })
    return { wrapper: mount(Host, { attachTo: document.body }), loading }
  }

  it('shows a labelled pill, not a bare spinner', () => {
    const { wrapper } = mountLoading()
    const pill = wrapper.find('.vt-loading-pill')
    expect(pill.exists()).toBe(true)
    expect(pill.text()).toContain('Loading…')
    // The spinner is decoration once the word is real text; labelling it too
    // would have a screen reader announce the state twice.
    expect(pill.find('.vt-spinner').attributes('aria-hidden')).toBe('true')
    wrapper.unmount()
  })

  it('takes its wording from loadingMessage', () => {
    const { wrapper } = mountLoading({ loadingMessage: 'Fetching…' })
    expect(wrapper.find('.vt-loading-pill').text()).toContain('Fetching…')
    wrapper.unmount()
  })

  it('lets the loading slot replace the pill outright', () => {
    const { wrapper } = mountLoading({}, { loading: () => h('span', { class: 'mine' }, 'wait') })
    expect(wrapper.find('.vt-loading-pill').exists()).toBe(false)
    expect(wrapper.find('.mine').text()).toBe('wait')
    wrapper.unmount()
  })

  it('anchors the overlay outside the scroll box', () => {
    /*
     * The whole point of `.vt-scroll-frame`: an absolutely positioned child of
     * an `overflow: auto` element scrolls away with the content, so an overlay
     * inside `.vt-scroll` vanished on a table taller than its max-height. Only
     * the DOM position encodes that — no assertion on CSS could catch it.
     */
    const { wrapper } = mountLoading()
    expect(wrapper.find('.vt-scroll .vt-loading-overlay').exists()).toBe(false)
    expect(wrapper.find('.vt-scroll-frame > .vt-loading-overlay').exists()).toBe(true)
    wrapper.unmount()
  })

  it('keeps the live region mounted so the change is what gets announced', async () => {
    const { wrapper, loading } = mountLoading()
    const region = wrapper.find('[role="status"]')
    expect(region.exists()).toBe(true)
    expect(region.text()).toBe('Loading…')
    expect(wrapper.find('.vt-datatable').attributes('aria-busy')).toBe('true')

    loading.value = false
    await nextTick()
    // Still there, just empty: a region created alongside its content is not
    // reliably announced.
    expect(wrapper.find('[role="status"]').exists()).toBe(true)
    expect(wrapper.find('[role="status"]').text()).toBe('')
    expect(wrapper.find('.vt-datatable').attributes('aria-busy')).toBeUndefined()
    wrapper.unmount()
  })

  it('does not claim there are no rows while it is still fetching', async () => {
    // An empty page mid-fetch is not an empty result — with keepPreviousData
    // off, that is exactly the state between two requests.
    const { wrapper, loading } = mountLoading({}, {}, [])
    expect(wrapper.find('.vt-row-message').exists()).toBe(false)

    loading.value = false
    await nextTick()
    expect(wrapper.find('.vt-row-message').text()).toContain('No Data')
    wrapper.unmount()
  })
})

describe('row-click selection', () => {
  /*
   * The gestures live on the row rather than on the checkbox, so every test
   * here clicks a `<tr>`. `row-click-select` is opt-in, which is what the last
   * test in this block pins.
   */
  function selectedRowIndexes(wrapper: ReturnType<typeof mountTable>): number[] {
    return wrapper
      .findAll('tbody tr')
      .flatMap((row, index) => (row.attributes('data-selected') ? [index] : []))
  }

  it('extends a range on shift-click', async () => {
    const wrapper = mountTable({ selectable: true, rowClickSelect: true })
    const rows = wrapper.findAll('tbody tr')

    await rows[0]!.trigger('click', { ctrlKey: true })
    await rows[2]!.trigger('click', { shiftKey: true })
    await nextTick()

    expect(selectedRowIndexes(wrapper)).toEqual([0, 1, 2])
    wrapper.unmount()
  })

  it('toggles one row on ctrl-click without clearing the others', async () => {
    const wrapper = mountTable({ selectable: true, rowClickSelect: true })
    const rows = wrapper.findAll('tbody tr')

    await rows[0]!.trigger('click', { ctrlKey: true })
    await rows[2]!.trigger('click', { metaKey: true })
    await nextTick()
    expect(selectedRowIndexes(wrapper)).toEqual([0, 2])

    await rows[0]!.trigger('click', { ctrlKey: true })
    await nextTick()
    expect(selectedRowIndexes(wrapper)).toEqual([2])
    wrapper.unmount()
  })

  it('leaves the selection alone on an unmodified click', async () => {
    const wrapper = mountTable({ selectable: true, rowClickSelect: true })
    const rows = wrapper.findAll('tbody tr')

    await rows[0]!.trigger('click', { ctrlKey: true })
    await rows[2]!.trigger('click')
    await nextTick()

    expect(selectedRowIndexes(wrapper)).toEqual([0])
    wrapper.unmount()
  })

  it('does nothing without the prop', async () => {
    const wrapper = mountTable({ selectable: true })
    await wrapper.findAll('tbody tr')[0]!.trigger('click', { ctrlKey: true })
    await nextTick()

    expect(selectedRowIndexes(wrapper)).toEqual([])
    wrapper.unmount()
  })

  it('still reports every click through rowClick', async () => {
    const clicked: string[] = []
    const Host = defineComponent({
      setup() {
        const state = useTableState({ pageSize: 3 })
        const source = useLocalDataSource<Person>(people, columns, state.query, { debounceMs: 0 })
        return () =>
          h(DataTable as never, {
            columns,
            source,
            state,
            selectable: true,
            rowClickSelect: true,
            onRowClick: (row: Person) => clicked.push(row.name),
          })
      },
    })
    const wrapper = mount(Host, { attachTo: document.body })

    await wrapper.findAll('tbody tr')[0]!.trigger('click')
    await wrapper.findAll('tbody tr')[1]!.trigger('click', { ctrlKey: true })
    expect(clicked).toEqual(['Ada Lovelace', 'Grace Hopper'])
    wrapper.unmount()
  })

  /*
   * The checkbox's own click bubbles to the `<tr>`. Unguarded, the row handler
   * would toggle a second time and land back where it started — a checkbox that
   * visibly does nothing.
   */
  it('lets the checkbox toggle once, not twice', async () => {
    const wrapper = mountTable({ selectable: true, rowClickSelect: true })
    await wrapper.findAll('tbody tr')[0]!.find('input[type="checkbox"]').trigger('click')
    await nextTick()

    expect(selectedRowIndexes(wrapper)).toEqual([0])
    wrapper.unmount()
  })

  it('leaves a control inside a cell to itself', async () => {
    const Host = defineComponent({
      setup() {
        const state = useTableState({ pageSize: 3 })
        const source = useLocalDataSource<Person>(people, columns, state.query, { debounceMs: 0 })
        return () =>
          h(
            DataTable as never,
            { columns, source, state, selectable: true, rowClickSelect: true },
            { 'cell:name': () => h('button', { type: 'button' }, 'Open') },
          )
      },
    })
    const wrapper = mount(Host, { attachTo: document.body })

    await wrapper.findAll('tbody tr')[0]!.find('button').trigger('click', { ctrlKey: true })
    await nextTick()

    expect(wrapper.findAll('tbody tr')[0]!.attributes('data-selected')).toBeUndefined()
    wrapper.unmount()
  })

  /*
   * Without this the browser extends a *text* range from the last caret
   * position, smearing a selection across the table on every range gesture.
   * A real event, because `defaultPrevented` is the only observable effect.
   */
  it('cancels the text selection a shift-click would start', () => {
    const wrapper = mountTable({ selectable: true, rowClickSelect: true })
    const row = wrapper.findAll('tbody tr')[0]!.element

    const shift = new MouseEvent('mousedown', { shiftKey: true, bubbles: true, cancelable: true })
    row.dispatchEvent(shift)
    expect(shift.defaultPrevented).toBe(true)

    // And only that case: a plain mousedown still focuses the cell it landed in.
    const plain = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
    row.dispatchEvent(plain)
    expect(plain.defaultPrevented).toBe(false)
    wrapper.unmount()
  })
})

describe('reading the selection from code', () => {
  it('emits the selected rows, resolved beyond the page', async () => {
    const emitted: Person[][] = []
    const Host = defineComponent({
      setup() {
        const state = useTableState({ pageSize: 3 })
        const source = useLocalDataSource<Person>(people, columns, state.query, { debounceMs: 0 })
        return () =>
          h(DataTable as never, {
            columns,
            source,
            state,
            selectable: true,
            'onUpdate:selectedRows': (rows: Person[]) => emitted.push(rows),
          })
      },
    })
    const wrapper = mount(Host, { attachTo: document.body })

    await wrapper.find('thead input[type="checkbox"]').trigger('click')
    await nextTick()
    expect(emitted.at(-1)!.map((row) => row.name)).toEqual([
      'Ada Lovelace',
      'Grace Hopper',
      'Alan Turing',
    ])

    // "All matching" names rows the page never held — that is what allRows buys.
    await wrapper.find('.vt-selectall-banner button').trigger('click')
    await nextTick()
    expect(emitted.at(-1)!).toHaveLength(7)
    wrapper.unmount()
  })

  it('round-trips a selection through v-model:selection-state', async () => {
    const selectionState = ref<SelectionState>({ mode: 'ids', ids: [2] })
    const Host = defineComponent({
      setup() {
        const state = useTableState({ pageSize: 3 })
        const source = useLocalDataSource<Person>(people, columns, state.query, { debounceMs: 0 })
        return () =>
          h(DataTable as never, {
            columns,
            source,
            state,
            selectable: true,
            selectionState: selectionState.value,
            'onUpdate:selectionState': (next: SelectionState) => (selectionState.value = next),
          })
      },
    })
    const wrapper = mount(Host, { attachTo: document.body })

    // Seeded before the first render, so the row arrives already ticked.
    expect(wrapper.findAll('tbody tr')[1]!.attributes('data-selected')).toBe('true')

    await wrapper.findAll('tbody tr')[0]!.find('input[type="checkbox"]').trigger('click')
    await nextTick()
    expect(selectionState.value).toEqual({ mode: 'ids', ids: [2, 1] })

    // And inbound: a write from outside reaches the table.
    selectionState.value = { mode: 'ids', ids: [3] }
    await nextTick()
    expect(wrapper.findAll('tbody tr')[2]!.attributes('data-selected')).toBe('true')
    expect(wrapper.findAll('tbody tr')[1]!.attributes('data-selected')).toBeUndefined()
    wrapper.unmount()
  })

  it('exposes the selection on a template ref', async () => {
    const table = ref<{
      selection?: { count: { value: number } }
      getSelectedRows: () => Person[]
    } | null>(null)
    const Host = defineComponent({
      setup() {
        const state = useTableState({ pageSize: 3 })
        const source = useLocalDataSource<Person>(people, columns, state.query, { debounceMs: 0 })
        return () =>
          h(DataTable as never, { columns, source, state, selectable: true, ref: table })
      },
    })
    const wrapper = mount(Host, { attachTo: document.body })

    expect(table.value!.getSelectedRows()).toEqual([])

    await wrapper.findAll('tbody tr')[1]!.find('input[type="checkbox"]').trigger('click')
    await nextTick()

    expect(table.value!.selection!.count.value).toBe(1)
    expect(table.value!.getSelectedRows().map((row) => row.name)).toEqual(['Grace Hopper'])
    wrapper.unmount()
  })
})
