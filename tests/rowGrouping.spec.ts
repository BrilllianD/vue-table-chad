import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, effectScope, h, nextTick, ref } from 'vue'
import DataTable from '../src/components/preset/DataTable.vue'
import { useLocalDataSource } from '../src/core/useLocalDataSource'
import { useRowGrouping } from '../src/core/useRowGrouping'
import { createQueryState, useTableState } from '../src/core/useTableState'
import { groupPathKey } from '../src/core/grouping'
import {
  aggregatedPersonColumns,
  names,
  people,
  personColumns,
  type Person,
} from './fixtures'

describe('useTableState grouping', () => {
  it('starts ungrouped and reports no levels', () => {
    const state = useTableState()
    expect(state.groupBy.value).toEqual([])
    expect(state.hasGrouping.value).toBe(false)
    expect(state.groupIndexFor('department')).toBe(0)
  })

  it('adds, reports and removes levels', () => {
    const state = useTableState()
    state.toggleGroup('department')
    state.toggleGroup('active')
    expect(state.groupBy.value).toEqual(['department', 'active'])
    expect(state.isGrouped('active')).toBe(true)
    expect(state.groupIndexFor('active')).toBe(2)

    state.toggleGroup('department')
    expect(state.groupBy.value).toEqual(['active'])
    state.clearGrouping()
    expect(state.hasGrouping.value).toBe(false)
  })

  it('never nests a column inside itself', () => {
    const state = useTableState()
    state.setGroupBy(['department', 'department'])
    expect(state.groupBy.value).toEqual(['department'])
    state.addGroup('active')
    state.addGroup('active')
    expect(state.groupBy.value).toEqual(['department', 'active'])
  })

  it('keeps client-side grouping out of the query, so nothing refetches', () => {
    const state = useTableState({ initialGroupBy: ['department'] })
    expect(state.groupMode.value).toBe('client')
    expect(state.groupBy.value).toEqual(['department'])
    // The query is the instruction to the data source. The client is doing the
    // grouping, so the source is told nothing about it.
    expect(state.query.value.groupBy).toEqual([])
  })

  it('leaves paging alone when the client groups, because no rows move pages', () => {
    const state = useTableState()
    state.setPage(4)
    state.addGroup('department')
    expect(state.page.value).toBe(4)
  })

  it('publishes groupBy and resets the page when the source groups', () => {
    const state = useTableState({ groupMode: 'server', initialGroupBy: ['department'] })
    expect(state.query.value.groupBy).toEqual(['department'])

    state.setPage(4)
    state.addGroup('active')
    expect(state.query.value.groupBy).toEqual(['department', 'active'])
    expect(state.page.value).toBe(1)
  })

  it('carries the grouping across a mode change rather than dropping it', () => {
    const state = useTableState({ initialGroupBy: ['department'] })

    state.groupMode.value = 'server'
    expect(state.groupBy.value).toEqual(['department'])
    expect(state.query.value.groupBy).toEqual(['department'])

    state.groupMode.value = 'client'
    expect(state.groupBy.value).toEqual(['department'])
    expect(state.query.value.groupBy).toEqual([])
  })

  it('never leaves a client grouping behind in an external state ref', () => {
    const scope = effectScope()
    const external = ref({
      sort: [],
      filters: {},
      groupBy: [],
      page: 1,
      pageSize: 10,
      globalSearch: '',
    })
    const state = scope.run(() => useTableState({ state: external }))!
    state.addGroup('department')
    expect(state.groupBy.value).toEqual(['department'])
    // The hoisted query — a URL, a store — is the source's view of the world,
    // and must not imply a grouping the source is not performing.
    expect(external.value.groupBy).toEqual([])
    scope.stop()
  })
})

describe('useLocalDataSource with delegated grouping', () => {
  it('sorts by the grouped column first, so groups arrive contiguous', () => {
    const scope = effectScope()
    const result = scope.run(() => {
      const state = useTableState({
        pageSize: 100,
        groupMode: 'server',
        initialSort: [{ columnId: 'name', direction: 'asc' }],
      })
      state.setGroupBy(['department'])
      const source = useLocalDataSource<Person>(people, personColumns, state.query)
      return source.rows.value.map((row) => row.department)
    })!
    // Each department appears as one unbroken run.
    expect(new Set(result).size).toBe([...result].filter((d, i) => result[i - 1] !== d).length)
    expect(result[0]).toBe('Engineering')
    scope.stop()
  })

  it('keeps the user sort as the tiebreak inside each group', () => {
    const scope = effectScope()
    const rows = scope.run(() => {
      const state = useTableState({
        pageSize: 100,
        groupMode: 'server',
        initialSort: [{ columnId: 'salary', direction: 'desc' }],
      })
      state.setGroupBy(['department'])
      return useLocalDataSource<Person>(people, personColumns, state.query).rows.value
    })!
    expect(names(rows).slice(0, 2)).toEqual(['Grace Hopper', 'Ada Lovelace'])
    scope.stop()
  })

  it('counts groups over the whole filtered set, not the page', () => {
    const scope = effectScope()
    const counts = scope.run(() => {
      const state = useTableState({ pageSize: 2, groupMode: 'server' })
      state.setGroupBy(['department'])
      const source = useLocalDataSource<Person>(people, personColumns, state.query)
      // The page holds two rows; the count must still describe all seven.
      expect(source.rows.value).toHaveLength(2)
      return source.groupCounts(['department'])
    })!
    expect(counts.get(groupPathKey(['Engineering']))).toBe(2)
    expect(counts.get(groupPathKey(['Support']))).toBe(2)
    scope.stop()
  })

  it('narrows those counts with the active filters', () => {
    const scope = effectScope()
    const counts = scope.run(() => {
      const state = useTableState({ pageSize: 100, groupMode: 'server' })
      state.setGroupBy(['department'])
      state.setSearch('Item')
      return useLocalDataSource<Person>(people, personColumns, state.query).groupCounts(['department'])
    })!
    expect(counts.get(groupPathKey(['Support']))).toBe(2)
    expect(counts.has(groupPathKey(['Engineering']))).toBe(false)
    scope.stop()
  })
})

describe('client-side grouping over loaded rows', () => {
  it('bands the page without the source reordering anything', () => {
    const scope = effectScope()
    const result = scope.run(() => {
      // Page 1 of an unsorted dataset: departments are interleaved, and no
      // source has gathered them, because the client is doing the grouping.
      const state = useTableState({ pageSize: 4 })
      state.addGroup('department')
      const source = useLocalDataSource<Person>(people, personColumns, state.query)
      expect(source.rows.value.map((row) => row.department)).toEqual([
        'Engineering',
        'Engineering',
        'Research',
        'Research',
      ])
      const grouping = useRowGrouping<Person>(
        () => source.rows.value,
        personColumns,
        { groupBy: () => state.groupBy.value, sort: () => state.sort.value },
      )
      return grouping.groups.value.map((group) => `${group.label}:${group.count}`)
    })!
    expect(result).toEqual(['Engineering:2', 'Research:2'])
    scope.stop()
  })

  it('gathers a band that the source left scattered across the page', () => {
    const scope = effectScope()
    const result = scope.run(() => {
      // Sorted by name, so departments are interleaved inside the page.
      const state = useTableState({
        pageSize: 100,
        initialSort: [{ columnId: 'name', direction: 'asc' }],
      })
      state.addGroup('department')
      const source = useLocalDataSource<Person>(people, personColumns, state.query)
      const grouping = useRowGrouping<Person>(
        () => source.rows.value,
        personColumns,
        { groupBy: () => state.groupBy.value, sort: () => state.sort.value },
      )
      return grouping
    })!
    // One band per department, not one per run of them.
    expect(result.groups.value.map((group) => group.label)).toEqual([
      'Engineering',
      'Research',
      'Support',
      'Blank',
    ])
    // Order inside a band is the order the source produced — the name sort.
    expect(names(result.groups.value[0]!.rows)).toEqual(['Ada Lovelace', 'Grace Hopper'])
    scope.stop()
  })

  it('follows the sort direction of a grouped column when ordering bands', () => {
    const scope = effectScope()
    const labels = scope.run(() => {
      const state = useTableState({
        pageSize: 100,
        initialSort: [{ columnId: 'department', direction: 'desc' }],
      })
      state.addGroup('department')
      const source = useLocalDataSource<Person>(people, personColumns, state.query)
      const grouping = useRowGrouping<Person>(
        () => source.rows.value,
        personColumns,
        { groupBy: () => state.groupBy.value, sort: () => state.sort.value },
      )
      return grouping.groups.value.map((group) => group.label)
    })!
    expect(labels.slice(0, 3)).toEqual(['Support', 'Research', 'Engineering'])
    scope.stop()
  })
})

describe('useRowGrouping', () => {
  function setup(groupBy: string[]) {
    const scope = effectScope()
    const ids = ref(groupBy)
    const grouping = scope.run(() =>
      useRowGrouping<Person>(people, personColumns, { groupBy: () => ids.value }),
    )!
    return { scope, ids, grouping }
  }

  it('is a plain row list until something is grouped', () => {
    const { scope, ids, grouping } = setup([])
    expect(grouping.isGrouped.value).toBe(false)
    expect(grouping.displayRows.value).toHaveLength(people.length)

    ids.value = ['department']
    expect(grouping.isGrouped.value).toBe(true)
    expect(grouping.groups.value).toHaveLength(4)
    scope.stop()
  })

  it('toggles one group without touching the others', () => {
    const { scope, grouping } = setup(['department'])
    const key = grouping.groups.value[0]!.key
    expect(grouping.isCollapsed(key)).toBe(false)

    grouping.toggle(key)
    expect(grouping.isCollapsed(key)).toBe(true)
    expect(grouping.isCollapsed(grouping.groups.value[1]!.key)).toBe(false)

    grouping.toggle(key)
    expect(grouping.isCollapsed(key)).toBe(false)
    scope.stop()
  })

  it('folds one grouping level and leaves the level under it alone', () => {
    const { scope, grouping } = setup(['department', 'active'])
    const outer = grouping.groups.value.filter((group) => group.columnId === 'department')
    const inner = grouping.groups.value.filter((group) => group.columnId === 'active')
    expect(outer.length).toBeGreaterThan(1)
    expect(inner.length).toBeGreaterThan(1)

    grouping.toggleColumn('active')
    expect(grouping.isColumnCollapsed('active')).toBe(true)
    expect(inner.every((group) => grouping.isCollapsed(group.key))).toBe(true)
    // The level above stays open, or the fold would have hidden its own result.
    expect(grouping.isColumnCollapsed('department')).toBe(false)
    expect(outer.every((group) => !grouping.isCollapsed(group.key))).toBe(true)

    grouping.toggleColumn('active')
    expect(grouping.isColumnCollapsed('active')).toBe(false)
    expect(inner.every((group) => !grouping.isCollapsed(group.key))).toBe(true)
    scope.stop()
  })

  it('reads as folded only once every one of the column\'s bands is', () => {
    const { scope, grouping } = setup(['department'])
    // A column producing no bands is not folded — it is not grouped at all.
    expect(grouping.isColumnCollapsed('active')).toBe(false)

    const keys = grouping.groups.value.map((group) => group.key)
    for (const key of keys.slice(1)) grouping.toggle(key)
    expect(grouping.isColumnCollapsed('department')).toBe(false)

    grouping.toggle(keys[0]!)
    expect(grouping.isColumnCollapsed('department')).toBe(true)
    scope.stop()
  })

  it('folds a level under `collapsedByDefault`, where the list means the opposite', () => {
    const scope = effectScope()
    const grouping = scope.run(() =>
      useRowGrouping<Person>(people, personColumns, {
        groupBy: ['department'],
        collapsedByDefault: true,
      }),
    )!
    expect(grouping.isColumnCollapsed('department')).toBe(true)

    grouping.toggleColumn('department')
    expect(grouping.isColumnCollapsed('department')).toBe(false)
    expect(grouping.groups.value.every((group) => !grouping.isCollapsed(group.key))).toBe(true)

    grouping.toggleColumn('department', true)
    expect(grouping.isColumnCollapsed('department')).toBe(true)
    scope.stop()
  })

  it('collapses every group, including ones it has not rendered yet', () => {
    const { scope, grouping } = setup(['department'])
    grouping.collapseAll()
    expect(grouping.groups.value.every((group) => grouping.isCollapsed(group.key))).toBe(true)
    // Nothing but headers survives.
    expect(grouping.displayRows.value.every((item) => item.kind === 'group')).toBe(true)

    // A group that only appears now must follow the default rather than
    // reverting to expanded because no one listed its key.
    grouping.toggle(grouping.groups.value[0]!.key, false)
    expect(grouping.isCollapsed(grouping.groups.value[0]!.key)).toBe(false)
    expect(grouping.isCollapsed(grouping.groups.value[1]!.key)).toBe(true)

    grouping.expandAll()
    expect(grouping.groups.value.every((group) => !grouping.isCollapsed(group.key))).toBe(true)
    scope.stop()
  })
})

/* ------------------------------------------------------------- rendering */

/**
 * The state is built here rather than left to `DataTable`, so `groupBy` starts
 * where each test needs it. `initialGroupBy` seeds a state the table owns; once
 * one is handed in, that state is the authority — same rule as `pageSize`.
 */
function mountTable(
  options: {
    groupBy?: string[]
    pageSize?: number
    groupMode?: 'client' | 'server'
    /** Defaults to the plain columns; pass the aggregated set to exercise totals. */
    columns?: typeof personColumns
  } = {},
  props: Record<string, unknown> = {},
) {
  const columns = options.columns ?? personColumns
  const Host = defineComponent({
    setup() {
      const state = useTableState({
        pageSize: options.pageSize ?? 100,
        initialGroupBy: options.groupBy,
        groupMode: options.groupMode,
      })
      const source = useLocalDataSource<Person>(people, columns, state.query)
      return () => h(DataTable as never, { columns, source, state, ...props })
    },
  })
  return mount(Host, { attachTo: document.body })
}

describe('DataTable grouping', () => {
  it('renders no group rows until a column is grouped', () => {
    const wrapper = mountTable()
    expect(wrapper.findAll('.vt-group-row')).toHaveLength(0)
    wrapper.unmount()
  })

  it('renders one header per group, labelled with the column and the value', () => {
    const wrapper = mountTable({ groupBy: ['department'] })
    const headers = wrapper.findAll('.vt-group-row')
    expect(headers).toHaveLength(4)
    expect(headers[0]!.text()).toContain('Department')
    expect(headers[0]!.text()).toContain('Engineering')
    // The blank bucket is named rather than rendered as an empty header.
    expect(headers[3]!.text()).toContain('Blank')
    wrapper.unmount()
  })

  it('spans the whole table, selection column included', () => {
    const wrapper = mountTable({ groupBy: ['department'] }, { selectable: true })
    const cell = wrapper.find('.vt-group-cell')
    expect(cell.attributes('colspan')).toBe(String(personColumns.length + 1))
    wrapper.unmount()
  })

  it('folds a group shut when its header is clicked, and opens it again', async () => {
    const wrapper = mountTable({ groupBy: ['department'] })
    const rowCount = () => wrapper.findAll('tbody tr.vt-tr').length
    expect(rowCount()).toBe(people.length)

    await wrapper.find('.vt-group-toggle').trigger('click')
    expect(rowCount()).toBe(people.length - 2)
    expect(wrapper.find('.vt-group-row').attributes('data-collapsed')).toBeDefined()
    // The header itself stays, or there would be no way back.
    expect(wrapper.findAll('.vt-group-row')).toHaveLength(4)

    await wrapper.find('.vt-group-toggle').trigger('click')
    expect(rowCount()).toBe(people.length)
    wrapper.unmount()
  })

  it('turns a grouped column\'s header into a fold control, not a sort one', async () => {
    const wrapper = mountTable({ groupBy: ['department'] })
    const header = (id: string) =>
      wrapper.findAll('thead th').find((th) => th.attributes('data-column') === id)!
    const rowCount = () => wrapper.findAll('tbody tr.vt-tr').length

    // Grouped: no sort trigger at all, and the capability attribute says so —
    // sorting stays on the columns under it.
    expect(header('department').find('button.vt-sort').exists()).toBe(false)
    expect(header('department').attributes('data-sortable')).toBeUndefined()
    expect(header('department').attributes('data-grouped')).toBe('true')
    expect(header('salary').find('button.vt-sort').exists()).toBe(true)

    await header('department').trigger('click')
    expect(rowCount()).toBe(0)
    expect(header('department').attributes('data-groups-collapsed')).toBe('true')
    expect(wrapper.findAll('.vt-group-row')).toHaveLength(4)

    await header('department').trigger('click')
    expect(rowCount()).toBe(people.length)
    expect(header('department').attributes('data-groups-collapsed')).toBeUndefined()
    wrapper.unmount()
  })

  it('folds only its own level, and the button inside it folds it once', async () => {
    const wrapper = mountTable({ groupBy: ['department', 'active'] })
    const header = (id: string) =>
      wrapper.findAll('thead th').find((th) => th.attributes('data-column') === id)!
    const groupRows = (columnId: string) =>
      wrapper.findAll('.vt-group-row').filter((row) => row.attributes('data-column') === columnId)

    // The inner level's button, whose click also bubbles to the cell around it.
    await header('active').find('button.vt-th-fold').trigger('click')
    expect(groupRows('active').every((row) => row.attributes('data-collapsed') !== undefined)).toBe(
      true,
    )
    // The outer level is still open, or its own bands would have gone with it.
    expect(groupRows('department')).toHaveLength(4)
    expect(groupRows('department').every((row) => row.attributes('data-collapsed') === undefined))
      .toBe(true)
    expect(wrapper.findAll('tbody tr.vt-tr')).toHaveLength(0)

    await header('active').find('button.vt-th-fold').trigger('click')
    expect(wrapper.findAll('tbody tr.vt-tr')).toHaveLength(people.length)
    wrapper.unmount()
  })

  it('folds once from the caret, the label and the padding alike', async () => {
    const wrapper = mountTable({ groupBy: ['department'] })
    const header = () =>
      wrapper.findAll('thead th').find((th) => th.attributes('data-column') === 'department')!
    const rowCount = () => wrapper.findAll('tbody tr.vt-tr').length

    // Every one of these bubbles to the cell as well as to the button, so a
    // second toggle would show up as the fold undoing itself in one click.
    await header().find('.vt-group-caret').trigger('click')
    expect(rowCount()).toBe(0)
    await header().find('.vt-th-label').trigger('click')
    expect(rowCount()).toBe(people.length)
    await header().find('button.vt-th-fold').trigger('click')
    expect(rowCount()).toBe(0)
    // The cell's own padding, where no control sits.
    await header().trigger('click')
    expect(rowCount()).toBe(people.length)
    wrapper.unmount()
  })

  it('names the fold for a screen reader, which has no caret to read', async () => {
    const wrapper = mountTable({ groupBy: ['department'] })
    const fold = () => wrapper.find('button.vt-th-fold')
    expect(fold().attributes('aria-expanded')).toBe('true')
    expect(fold().attributes('aria-label')).toBe('Collapse all Department groups')

    await fold().trigger('click')
    expect(fold().attributes('aria-expanded')).toBe('false')
    expect(fold().attributes('aria-label')).toBe('Expand all Department groups')
    wrapper.unmount()
  })

  it('starts every group folded when asked to', () => {
    const wrapper = mountTable({ groupBy: ['department'] }, { groupsCollapsed: true })
    expect(wrapper.findAll('.vt-group-row')).toHaveLength(4)
    expect(wrapper.findAll('tbody tr.vt-tr')).toHaveLength(0)
    wrapper.unmount()
  })

  it('counts the whole group, not the slice of it on this page, when delegated', () => {
    const wrapper = mountTable({ groupBy: ['department'], pageSize: 1, groupMode: 'server' })
    expect(wrapper.findAll('tbody tr.vt-tr')).toHaveLength(1)
    // One Engineering row is visible; the header still reports both.
    expect(wrapper.find('.vt-group-count').text()).toBe('2')
    wrapper.unmount()
  })

  it('indents rows under their group and keeps stripe parity across headers', () => {
    const wrapper = mountTable({ groupBy: ['department'] })
    expect(wrapper.find('tbody tr.vt-tr .vt-group-indent').exists()).toBe(true)
    const parities = wrapper.findAll('tbody tr.vt-tr').map((row) => row.attributes('data-parity'))
    expect(parities.slice(0, 4)).toEqual(['odd', 'even', 'odd', 'even'])
    wrapper.unmount()
  })

  it('groups from the toolbar menu, and clears from it again', async () => {
    const wrapper = mountTable()
    await wrapper.find('.vt-group-menu .vt-btn').trigger('click')

    const boxes = wrapper.findAll('.vt-group-option input')
    // Grouping by Department — the second column.
    await boxes[1]!.trigger('click')
    await nextTick()
    expect(wrapper.findAll('.vt-group-row')).toHaveLength(4)
    expect(wrapper.find('.vt-group-badge').text()).toBe('1')

    const clear = wrapper.findAll('.vt-group-actions .vt-btn').at(-1)!
    await clear.trigger('click')
    expect(wrapper.findAll('.vt-group-row')).toHaveLength(0)
    wrapper.unmount()
  })

  it('folds and unfolds every band from the buttons beside the menu trigger', async () => {
    const wrapper = mountTable({ groupBy: ['department'] })
    const rowCount = () => wrapper.findAll('tbody tr.vt-tr').length
    // Second and third button of the trigger row — the panel is still closed,
    // which is the point of putting them there.
    const [, expandAll, collapseAll] = [
      ...wrapper.findAll('.vt-group-trigger .vt-btn'),
    ] as const

    expect(rowCount()).toBe(people.length)
    await collapseAll!.trigger('click')
    expect(rowCount()).toBe(0)
    await expandAll!.trigger('click')
    expect(rowCount()).toBe(people.length)
    wrapper.unmount()
  })

  it('bands only what is loaded by default, counting the rows in view', () => {
    const wrapper = mountTable({ groupBy: ['department'], pageSize: 2 })
    // Two Engineering rows are loaded; the band says two, not the four the
    // dataset holds elsewhere.
    expect(wrapper.findAll('.vt-group-row')).toHaveLength(1)
    expect(wrapper.find('.vt-group-count').text()).toBe('2')
    wrapper.unmount()
  })

  it('binds the groupMode prop through to a state supplied from outside', async () => {
    const state = useTableState({ initialGroupBy: ['department'] })
    const mode = ref<'client' | 'server'>('client')
    const Host = defineComponent({
      setup() {
        const source = useLocalDataSource<Person>(people, personColumns, state.query)
        return () =>
          h(DataTable as never, {
            columns: personColumns,
            source,
            state,
            groupMode: mode.value,
          })
      },
    })
    const wrapper = mount(Host, { attachTo: document.body })
    expect(state.query.value.groupBy).toEqual([])

    mode.value = 'server'
    await nextTick()
    expect(state.query.value.groupBy).toEqual(['department'])
    // The grouping survived the switch rather than being dropped.
    expect(wrapper.findAll('.vt-group-row')).toHaveLength(4)
    wrapper.unmount()
  })

  it('leaves a state built for delegated grouping alone when the prop is unset', () => {
    const state = useTableState({ groupMode: 'server', initialGroupBy: ['department'] })
    const Host = defineComponent({
      setup() {
        const source = useLocalDataSource<Person>(people, personColumns, state.query)
        return () => h(DataTable as never, { columns: personColumns, source, state })
      },
    })
    const wrapper = mount(Host, { attachTo: document.body })
    expect(state.groupMode.value).toBe('server')
    expect(state.query.value.groupBy).toEqual(['department'])
    wrapper.unmount()
  })

  it('nests a second level and indents it further', async () => {
    const wrapper = mountTable({ groupBy: ['department', 'active'] })
    const depths = wrapper.findAll('.vt-group-row').map((row) => row.attributes('data-depth'))
    expect(depths).toContain('0')
    expect(depths).toContain('1')
    wrapper.unmount()
  })
})

/* -------------------------------------------------- hoisted query state */

describe('grouping against a hoisted QueryState', () => {
  it('keeps a client grouping without writing it into the query', () => {
    /*
     * Client grouping is deliberately absent from `QueryState` — no source
     * refetches over it, and no server hears about it. That made the setup-time
     * move erase it: clearing `internal.groupBy` fired the mirror and stamped
     * `groupBy: []` over the caller's own ref, so a URL carrying a grouping
     * applied it once and lost it on the next change to anything else.
     */
    const external = ref(createQueryState({ initialGroupBy: ['department'] }))
    const state = useTableState({ state: external })

    expect(state.groupBy.value).toEqual(['department'])
    // Never in the query itself: that is the whole point of the client mode.
    expect(state.query.value.groupBy).toEqual([])

    state.setPage(2)
    state.setFilter('name', undefined)
    expect(external.value.groupBy).toEqual(['department'])
    expect(state.groupBy.value).toEqual(['department'])
  })

  it('writes a server grouping straight through to the query', () => {
    const external = ref(createQueryState({ initialGroupBy: ['department'] }))
    const state = useTableState({ state: external, groupMode: 'server' })

    expect(state.groupBy.value).toEqual(['department'])
    expect(state.query.value.groupBy).toEqual(['department'])

    state.setGroupBy(['department', 'role'])
    expect(external.value.groupBy).toEqual(['department', 'role'])
  })

  it('carries the grouping across a mode flip in both directions', () => {
    const external = ref(createQueryState())
    const state = useTableState({ state: external })
    state.setGroupBy(['department'])

    state.groupMode.value = 'server'
    expect(external.value.groupBy).toEqual(['department'])

    state.groupMode.value = 'client'
    expect(state.groupBy.value).toEqual(['department'])
  })

  it('seeds a supplied state from initialGroupBy set on the table', () => {
    // Config set where the table is used has to reach a state built elsewhere,
    // otherwise hoisting the query silently drops the grouping the table asked
    // for.
    const external = ref(createQueryState())
    let state!: ReturnType<typeof useTableState>
    const Host = defineComponent({
      setup() {
        state = useTableState({ state: external, pageSize: 100 })
        const source = useLocalDataSource<Person>(people, personColumns, state.query)
        return () =>
          h(DataTable as never, {
            columns: personColumns,
            source,
            state,
            initialGroupBy: ['department'],
          })
      },
    })
    const wrapper = mount(Host, { attachTo: document.body })
    expect(state.groupBy.value).toEqual(['department'])
    expect(wrapper.findAll('.vt-group-row').length).toBeGreaterThan(0)
    wrapper.unmount()
  })

  it('does not override a grouping the supplied state already carries', () => {
    const external = ref(createQueryState())
    let state!: ReturnType<typeof useTableState>
    const Host = defineComponent({
      setup() {
        state = useTableState({ state: external, pageSize: 100 })
        state.setGroupBy(['role'])
        const source = useLocalDataSource<Person>(people, personColumns, state.query)
        return () =>
          h(DataTable as never, {
            columns: personColumns,
            source,
            state,
            initialGroupBy: ['department'],
          })
      },
    })
    const wrapper = mount(Host, { attachTo: document.body })
    expect(state.groupBy.value).toEqual(['role'])
    wrapper.unmount()
  })
})

/* ------------------------------------------------------------ aggregates */

/** `[label colspan, ...trailing cell texts]` for each band, in order. */
function bands(wrapper: ReturnType<typeof mountTable>): { span: string; cells: string[] }[] {
  return wrapper.findAll('.vt-group-row').map((row) => ({
    span: row.find('.vt-group-cell').attributes('colspan')!,
    cells: row.findAll('.vt-td').map((cell) => cell.text()),
  }))
}

describe('group aggregates', () => {
  it('renders nothing extra when no column declares one', () => {
    const wrapper = mountTable({ groupBy: ['department'] })
    const row = wrapper.find('.vt-group-row')
    // One spanning cell, exactly as before aggregation existed.
    expect(row.find('.vt-group-cell').attributes('colspan')).toBe(String(personColumns.length))
    expect(row.findAll('.vt-td')).toHaveLength(0)
    wrapper.unmount()
  })

  it('shrinks the label span to the columns before the first aggregate', () => {
    const wrapper = mountTable({ groupBy: ['department'], columns: aggregatedPersonColumns })
    // name, department, | salary, hiredAt, active
    expect(bands(wrapper)[0]!.span).toBe('2')
    expect(bands(wrapper)[0]!.cells).toHaveLength(3)
    wrapper.unmount()
  })

  it('counts the selection column into the label span', () => {
    const wrapper = mountTable(
      { groupBy: ['department'], columns: aggregatedPersonColumns },
      { selectable: true },
    )
    expect(wrapper.find('.vt-group-cell').attributes('colspan')).toBe('3')
    wrapper.unmount()
  })

  it('never emits more cells than the row has columns', () => {
    /*
     * The label cell needs a column of its own, so a table whose *first*
     * column aggregates has nothing ahead of it to span. Clamping the span to
     * 1 while still giving that column its own aggregate cell emitted N+1
     * cells against an N-column `<colgroup>`, shifting every aggregate one
     * column right. A selection column hid it — that leading cell is what the
     * span was borrowing.
     */
    const firstAggregates = personColumns.map((column) =>
      column.id === 'name' ? { ...column, aggregate: 'min' as const } : column,
    )
    const wrapper = mountTable({ groupBy: ['department'], columns: firstAggregates })
    const band = bands(wrapper)[0]!
    expect(Number(band.span) + band.cells.length).toBe(personColumns.length)
    // The label took the first column, so its aggregate is the one not shown.
    expect(band.span).toBe('1')
    wrapper.unmount()
  })

  it('puts each aggregate under the column it describes', () => {
    const wrapper = mountTable({ groupBy: ['department'], columns: aggregatedPersonColumns })
    const engineering = bands(wrapper)[0]!
    // salary summed, hiredAt at its minimum, active left blank — no aggregate.
    expect(engineering.cells[0]!.replace(/\D/g, '')).toBe('265000')
    expect(engineering.cells[1]).toBe('2019-11-20')
    expect(engineering.cells[2]).toBe('')
    wrapper.unmount()
  })

  it('keeps a band’s figures visible once it is folded shut', async () => {
    const wrapper = mountTable({ groupBy: ['department'], columns: aggregatedPersonColumns })
    await wrapper.find('.vt-group-toggle').trigger('click')
    expect(wrapper.find('.vt-group-row').attributes('data-collapsed')).toBeDefined()
    expect(bands(wrapper)[0]!.cells[0]!.replace(/\D/g, '')).toBe('265000')
    wrapper.unmount()
  })

  it('aggregates nested bands at their own level', () => {
    const wrapper = mountTable({
      groupBy: ['department', 'active'],
      columns: aggregatedPersonColumns,
    })
    const rows = bands(wrapper)
    // Research: 130000 across both, all of it under `active: false`.
    const research = rows.find((row) => row.cells[0]!.replace(/\D/g, '') === '130000')
    expect(research).toBeDefined()
    wrapper.unmount()
  })

  it('aggregates only the loaded rows by default', () => {
    const wrapper = mountTable({
      groupBy: ['department'],
      columns: aggregatedPersonColumns,
      pageSize: 1,
    })
    // One Engineering row is loaded, so the band sums that row alone.
    expect(bands(wrapper)[0]!.cells[0]!.replace(/\D/g, '')).toBe('120000')
    wrapper.unmount()
  })

  it('takes whole-group figures from the source when grouping is delegated', () => {
    const wrapper = mountTable({
      groupBy: ['department'],
      columns: aggregatedPersonColumns,
      pageSize: 1,
      groupMode: 'server',
    })
    // Still one row on the page, but the source aggregated the whole group.
    expect(wrapper.findAll('tbody tr.vt-tr')).toHaveLength(1)
    expect(bands(wrapper)[0]!.cells[0]!.replace(/\D/g, '')).toBe('265000')
    wrapper.unmount()
  })
})

describe('footer totals', () => {
  it('renders no footer unless asked', () => {
    const wrapper = mountTable({ columns: aggregatedPersonColumns })
    expect(wrapper.find('tfoot').exists()).toBe(false)
    wrapper.unmount()
  })

  it('totals every loaded row, with grouping switched off', () => {
    const wrapper = mountTable({ columns: aggregatedPersonColumns }, { showFooter: true })
    const cells = wrapper.findAll('tfoot .vt-td').map((cell) => cell.text())
    expect(cells[0]).toBe('Total')
    expect(cells[2]!.replace(/\D/g, '')).toBe('670000')
    expect(cells[3]).toBe('2018-05-09')
    wrapper.unmount()
  })

  it('takes a custom label, and yields the cell to a first-column aggregate', () => {
    const columns = aggregatedPersonColumns.map((column) =>
      column.id === 'name' ? { ...column, aggregate: 'max' as const } : column,
    )
    const wrapper = mountTable({ columns }, { showFooter: true, footerLabel: 'All staff' })
    const cells = wrapper.findAll('tfoot .vt-td').map((cell) => cell.text())
    expect(cells[0]).not.toContain('All staff')
    expect(cells[0]).toBe('Katherine Johnson')
    wrapper.unmount()
  })

  it('matches the sum of the bands when grouping is on', () => {
    const wrapper = mountTable(
      { groupBy: ['department'], columns: aggregatedPersonColumns },
      { showFooter: true },
    )
    const banded = bands(wrapper).reduce(
      (total, band) => total + Number(band.cells[0]!.replace(/\D/g, '')),
      0,
    )
    const footer = wrapper.findAll('tfoot .vt-td').map((cell) => cell.text())
    expect(Number(footer[2]!.replace(/\D/g, ''))).toBe(banded)
    wrapper.unmount()
  })
})
