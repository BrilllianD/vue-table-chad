import { beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope } from 'vue'
import { useColumns } from '../src/core/useColumns'
import { useLocalDataSource } from '../src/core/useLocalDataSource'
import { useRowGrouping } from '../src/core/useRowGrouping'
import { useRowSelection } from '../src/core/useRowSelection'
import { useTableState } from '../src/core/useTableState'
import { valuesFilter } from '../src/core/filters/model'
import { employeeColumns, makeRows, type Employee } from '@fixtures'

/**
 * Performance as a correctness property.
 *
 * Every other spec here asks whether the table produced the right rows. This
 * one asks how much work it did to produce them — because "paging re-sorts the
 * whole dataset" is invisible to a correctness test (the rows come out right)
 * and invisible to a benchmark until someone reads the number and recognises it
 * as wrong. Counting passes catches it on the way in.
 *
 * The counters wrap the four functions that are O(dataset). An interaction that
 * changes nothing about which rows exist or what order they are in must move
 * none of them.
 */
const counters = vi.hoisted(() => ({ filter: 0, sort: 0, count: 0, aggregate: 0, flatten: 0 }))

vi.mock('../src/core/filters/facets', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/core/filters/facets')>()
  return {
    ...actual,
    filterRows: (...args: Parameters<typeof actual.filterRows>) => {
      counters.filter += 1
      return actual.filterRows(...args)
    },
  }
})

vi.mock('../src/core/sorting', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/core/sorting')>()
  return {
    ...actual,
    sortRows: (...args: Parameters<typeof actual.sortRows>) => {
      counters.sort += 1
      return actual.sortRows(...args)
    },
  }
})

vi.mock('../src/core/grouping', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/core/grouping')>()
  return {
    ...actual,
    countGroups: (...args: Parameters<typeof actual.countGroups>) => {
      counters.count += 1
      return actual.countGroups(...args)
    },
    flattenGroups: (...args: Parameters<typeof actual.flattenGroups>) => {
      counters.flatten += 1
      return actual.flattenGroups(...args)
    },
  }
})

vi.mock('../src/core/aggregation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/core/aggregation')>()
  return {
    ...actual,
    aggregateGroups: (...args: Parameters<typeof actual.aggregateGroups>) => {
      counters.aggregate += 1
      return actual.aggregateGroups(...args)
    },
  }
})

/** Small: these tests count passes, so the dataset only has to be real, not big. */
const rows = makeRows(400)

function reset(): void {
  counters.filter = 0
  counters.sort = 0
  counters.count = 0
  counters.aggregate = 0
  counters.flatten = 0
}

/**
 * A table someone is actually using: a filter and a sort applied, and every
 * computed warmed. Both matter — a pristine table short-circuits each stage, so
 * an invariant proved against one would prove nothing about the real thing.
 */
function harness(groupBy: string[] = []) {
  const scope = effectScope()
  const built = scope.run(() => {
    const state = useTableState({ pageSize: 25, initialGroupBy: groupBy })
    const source = useLocalDataSource<Employee>(rows, employeeColumns, () => state.query.value)
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

    state.setFilter('department', valuesFilter(['Engineering', 'Research', 'Design']))
    state.setSort('name', 'asc')
    return { state, source, columns, grouping, selection, stop: () => scope.stop() }
  })!

  built.source.rows.value
  built.grouping.displayRows.value
  built.columns.visible.value

  // Warming is setup, not subject. Without this the harness's own first pass
  // lands in the counters and every test measures construction instead of the
  // interaction it names.
  reset()
  return built
}

beforeEach(reset)

describe('what an interaction is allowed to recompute', () => {
  /*
   * `it.fails` rather than a skip, and rather than asserting today's numbers.
   *
   * It states the invariant we intend to hold and records that it does not hold
   * yet — and because vitest fails an `it.fails` that starts passing, the day
   * P1-4 lands this file demands to be updated instead of silently agreeing
   * with whatever the code now does. A skip would just rot.
   */
  it.fails('P1-4: setPage redoes neither the filter nor the sort', () => {
    const h = harness()
    h.state.setPage(2)
    h.source.rows.value

    expect(counters.filter).toBe(0)
    expect(counters.sort).toBe(0)
    h.stop()
  })

  it.fails('P1-4: setPage while grouped re-counts and re-aggregates nothing', () => {
    const h = harness(['department', 'role'])
    h.state.setPage(2)
    h.grouping.displayRows.value

    expect(counters.filter).toBe(0)
    expect(counters.sort).toBe(0)
    expect(counters.count).toBe(0)
    expect(counters.aggregate).toBe(0)
    h.stop()
  })

  it.fails('P1-6: collapsing a group does not re-scan the dataset', () => {
    const h = harness(['department', 'role'])
    const first = h.grouping.displayRows.value.find((item) => item.kind === 'group')
    const key = first && first.kind === 'group' ? first.group.key : ''

    h.grouping.toggle(key)
    h.grouping.displayRows.value

    // Re-flattening the page is the actual work of collapsing. Re-counting and
    // re-aggregating the whole filtered set is not.
    expect(counters.count).toBe(0)
    expect(counters.aggregate).toBe(0)
    h.stop()
  })

  it('one search change costs exactly one filter pass', () => {
    const h = harness()
    h.state.setSearch('ada')
    h.source.rows.value

    expect(counters.filter).toBe(1)
    h.stop()
  })

  it('a column resize never reaches the pipeline', () => {
    const h = harness()
    h.columns.setWidth('name', 240)
    h.columns.visible.value
    h.source.rows.value

    expect(counters.filter).toBe(0)
    expect(counters.sort).toBe(0)
    h.stop()
  })

  it('a column pin never reaches the pipeline', () => {
    const h = harness()
    h.columns.setPinned('email', 'left')
    h.columns.visible.value
    h.source.rows.value

    expect(counters.filter).toBe(0)
    expect(counters.sort).toBe(0)
    h.stop()
  })

  it('a selection toggle never reaches the pipeline', () => {
    const h = harness()
    h.selection.toggle(h.source.rows.value[0]!)
    h.selection.selectedIds.value
    h.source.rows.value

    expect(counters.filter).toBe(0)
    expect(counters.sort).toBe(0)
    h.stop()
  })

  it('changing the sort does redo the sort, and only once', () => {
    // The mirror image: work that *is* asked for must actually happen. An
    // invariant suite that only ever says "do less" can be satisfied by a
    // table that does nothing.
    const h = harness()
    h.state.toggleSort('salary', true)
    h.source.rows.value

    expect(counters.sort).toBe(1)
    h.stop()
  })
})
