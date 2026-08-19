import { bench, describe } from 'vitest'
import { effectScope } from 'vue'
import {
  useColumns,
  useLocalDataSource,
  useRowGrouping,
  useRowSelection,
  useTableState,
  valuesFilter,
} from '@sandbox/vue-table'
import { employeeColumns, makeRows, type Employee } from '@fixtures'

/**
 * What one *interaction* costs, as opposed to what one function costs.
 *
 * `pipeline.bench.ts` measures `sortRows` in isolation; this measures whether
 * clicking "next page" re-runs it at all. The gap between the two is the whole
 * subject of this phase: a stage that is fast is still wasted if nothing asked
 * for it.
 *
 * Two things make these numbers honest, and both were learned the hard way:
 *
 *  - **The table is loaded, not pristine.** With no filter and no sort every
 *    pipeline stage short-circuits to `rows.slice()`, so a naive harness
 *    reports paging as free — measuring the empty state rather than the state
 *    anyone pages through. Each harness starts with a filter and a sort applied.
 *  - **The harness is built once and warmed.** Construction is not the subject;
 *    including it would bury a 25ms recompute under setup noise.
 *
 * Every case reads through to a rendered value at the end, because Vue
 * computeds are lazy — without a read, an interaction would "cost" nothing.
 */
const SIZE = 10_000
const rows = makeRows(SIZE)

/** Keeps roughly half the rows, so the pipeline has real work to redo. */
const seedFilter = valuesFilter(['Engineering', 'Research', 'Design'])

function harness(groupBy: string[] = [], debounceMs = 0) {
  const scope = effectScope()
  const built = scope.run(() => {
    const state = useTableState({ pageSize: 25, initialGroupBy: groupBy })
    const source = useLocalDataSource<Employee>(rows, employeeColumns, () => state.query.value, {
      debounceMs,
    })
    const columns = useColumns<Employee>(employeeColumns, {
      sortFor: state.sortFor,
      sortIndexFor: state.sortIndexFor,
    })
    const grouping = useRowGrouping<Employee>(() => source.rows.value, employeeColumns, {
      groupBy: () => state.groupBy.value,
      sort: () => state.sort.value,
      totals: () => source.groupCounts(state.groupBy.value),
      aggregates: () => source.groupAggregates(state.groupBy.value),
    })
    const selection = useRowSelection<Employee>(
      () => source.rows.value,
      () => source.total.value,
      { getRowId: (row) => row.id },
    )

    // The loaded state: a filter and a sort, like any table someone is using.
    state.setFilter('department', seedFilter)
    state.setSort('name', 'asc')

    return { state, source, columns, grouping, selection }
  })!

  // Warm every computed, so a bench measures the recompute and not the first build.
  built.source.rows.value
  built.grouping.displayRows.value
  built.columns.visible.value

  return built
}

describe(`interaction · ${SIZE / 1000}k rows, filtered and sorted`, () => {
  const paging = harness()
  let page = 2
  bench('setPage — should redo neither the filter nor the sort', () => {
    page = page === 2 ? 3 : 2
    paging.state.setPage(page)
    paging.source.rows.value
  })

  // Two numbers, because the debounce splits one cost into two questions.
  // What a keystroke costs is what typing feels like; what the settled filter
  // costs is unchanged work that now happens once per burst instead of per key.
  const typing = harness([], 150)
  let term = 'ada'
  bench('search keystroke, debounced — the cost while typing', () => {
    term = term === 'ada' ? 'adam' : 'ada'
    typing.state.setSearch(term)
    typing.source.rows.value
  })

  const searching = harness()
  let settled = 'ada'
  bench('search settling — the filter pass itself', () => {
    settled = settled === 'ada' ? 'adam' : 'ada'
    searching.state.setSearch(settled)
    searching.source.rows.value
  })

  const sorting = harness()
  bench('toggleSort on a text column', () => {
    sorting.state.toggleSort('name')
    sorting.source.rows.value
  })

  const selecting = harness()
  bench('selection toggle', () => {
    selecting.selection.toggle(selecting.source.rows.value[0]!)
    selecting.selection.selectedIds.value
  })

  const resizing = harness()
  let width = 200
  bench('column resize — should touch the pipeline not at all', () => {
    width = width === 200 ? 220 : 200
    resizing.columns.setWidth('name', width)
    resizing.columns.visible.value
    resizing.source.rows.value
  })
})

describe(`interaction · ${SIZE / 1000}k rows, grouped two levels`, () => {
  const collapsing = harness(['department', 'role'])
  const firstGroup = collapsing.grouping.displayRows.value.find((item) => item.kind === 'group')
  const groupKey = firstGroup && firstGroup.kind === 'group' ? firstGroup.group.key : ''
  bench('group collapse toggle — should not re-scan the dataset', () => {
    collapsing.grouping.toggle(groupKey)
    collapsing.grouping.displayRows.value
  })

  const groupedPaging = harness(['department', 'role'])
  let page = 2
  bench('setPage while grouped', () => {
    page = page === 2 ? 3 : 2
    groupedPaging.state.setPage(page)
    groupedPaging.grouping.displayRows.value
  })
})
