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
import type { ResolvedColumn } from '../src/core/types'
import { people, personColumns, type Person } from './fixtures'

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
