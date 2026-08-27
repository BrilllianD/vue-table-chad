import { bench, describe } from 'vitest'
import { effectScope, ref, shallowRef } from 'vue'
import {
  filterRows,
  sortRows,
  useColumns,
  useLocalDataSource,
  useRowGrouping,
  useRowSelection,
  useTableState,
  valuesFilter,
} from '@brillliand/vue-table-chad'
// Relative rather than through the package alias every other import here
// uses: the export lands with its demo view, and `tests/apiSurface.spec.ts`
// fails a value export that no view demonstrates yet.
import { useVirtualRows } from '../src/core/useVirtualRows'
import {
  employeeColumnGroups,
  employeeColumns,
  groupedEmployeeColumns,
  makeRows,
  type Employee,
} from '@fixtures'

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
    // Banded, so the fold bench below has something to fold. Inert otherwise:
    // the pipeline reads the declared defs, and a band is not one of them.
    const columns = useColumns<Employee>(groupedEmployeeColumns, {
      groups: employeeColumnGroups,
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

  // Same claim as the resize above, and benched for the same reason: "this
  // touches nothing" is worth a number, not just an assertion.
  const folding = harness()
  bench('header band fold — should touch the pipeline not at all', () => {
    folding.columns.toggleGroup('location')
    folding.columns.visible.value
    folding.source.rows.value
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

/**
 * What scrolling a virtual window costs.
 *
 * A separate, larger harness, because the question is only interesting where
 * pagination has stopped being an answer — and because virtual mode is a page
 * size of everything, so the pipeline below it is running over 100k rows
 * rather than over 25.
 *
 * The third case is the one to watch. `start` and `end` are floored integers,
 * so a scroll that moves less than one row recomputes two divisions, arrives
 * at the same pair, and propagates nothing: it should cost what writing a ref
 * costs, and nothing near what the case above it costs.
 */
describe('virtual scroll · 100k rows, filtered and sorted', () => {
  const SCROLL_SIZE = 100_000
  const ROW_HEIGHT = 38
  const bigRows = makeRows(SCROLL_SIZE)

  function virtualHarness() {
    const scope = effectScope()
    const built = scope.run(() => {
      // A page size of everything, which is what `virtual` sets.
      const state = useTableState({ pageSize: SCROLL_SIZE })
      const source = useLocalDataSource<Employee>(
        bigRows,
        employeeColumns,
        () => state.query.value,
        { debounceMs: 0 },
      )
      const grouping = useRowGrouping<Employee>(() => source.rows.value, employeeColumns, {
        groupBy: () => state.groupBy.value,
        sort: () => state.sort.value,
      })
      const selection = useRowSelection<Employee>(
        () => source.rows.value,
        () => source.total.value,
        { getRowId: (row) => row.id },
      )
      const virtual = useVirtualRows(() => grouping.displayRows.value, {
        rowHeight: ROW_HEIGHT,
        viewportHeight: 640,
      })

      state.setFilter('department', seedFilter)
      state.setSort('name', 'asc')
      return { state, source, grouping, selection, virtual }
    })!

    built.source.rows.value
    built.grouping.displayRows.value
    built.selection.headerState.value
    built.virtual.items.value
    return built
  }

  const stepping = virtualHarness()
  let row = 500
  bench('scroll one row — the window moves by one', () => {
    row += 1
    stepping.virtual.setScrollOffset(row * ROW_HEIGHT)
    stepping.virtual.items.value
  })

  const paging = virtualHarness()
  let screen = 10
  bench('scroll one viewport — the window moves wholesale', () => {
    screen += 1
    paging.virtual.setScrollOffset(screen * 640)
    paging.virtual.items.value
  })

  const jittering = virtualHarness()
  let pixel = 0
  bench('scroll within one row — should move the window not at all', () => {
    pixel = (pixel + 1) % ROW_HEIGHT
    jittering.virtual.setScrollOffset(500 * ROW_HEIGHT + pixel)
    jittering.virtual.items.value
  })

  // The pipeline underneath, at the size virtual mode hands it. This is the
  // cost virtual mode *adds*: the same passes as before over the whole dataset
  // instead of over a page.
  const filtering = virtualHarness()
  let term = 'ada'
  bench('search settling at a page size of everything', () => {
    term = term === 'ada' ? 'adam' : 'ada'
    filtering.state.setSearch(term)
    filtering.virtual.items.value
  })

  /*
   * Selection is the one thing that scales with the *interaction* rather than
   * with the data: `headerState` asks "are all of these selected" over the
   * rows it was handed, and virtual mode hands it the dataset. Compare this
   * against `selection toggle` in the 10k block above — that one is a page of
   * 25.
   */
  const selecting = virtualHarness()
  bench('selection toggle at a page size of everything', () => {
    selecting.selection.toggle(selecting.source.rows.value[0]!)
    selecting.selection.headerState.value
  })
})

/**
 * What holding rows in a `ref` costs, versus a `shallowRef`.
 *
 * `ref(rows)` proxies the array and every object in it, so each `readValue`
 * during a filter or a sort goes through a Proxy trap — once per row per
 * column. The README recommends `shallowRef` on the strength of these two
 * numbers rather than on principle.
 */
describe(`how rows are held · ${SIZE / 1000}k rows`, () => {
  const deep = ref(rows)
  const shallow = shallowRef(rows)

  bench('filter · deep ref', () => {
    filterRows(deep.value, employeeColumns, { filters: {}, globalSearch: 'ada' })
  })

  bench('filter · shallowRef', () => {
    filterRows(shallow.value, employeeColumns, { filters: {}, globalSearch: 'ada' })
  })

  bench('sort · deep ref', () => {
    sortRows(deep.value, [{ columnId: 'name', direction: 'asc' }], employeeColumns)
  })

  bench('sort · shallowRef', () => {
    sortRows(shallow.value, [{ columnId: 'name', direction: 'asc' }], employeeColumns)
  })
})
