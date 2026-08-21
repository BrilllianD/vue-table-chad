import { beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, shallowRef } from 'vue'
import { useColumns } from '../src/core/useColumns'
import { useLocalDataSource } from '../src/core/useLocalDataSource'
import { useRowGrouping } from '../src/core/useRowGrouping'
import { useRowSelection } from '../src/core/useRowSelection'
import { useRowEditing } from '../src/core/useRowEditing'
import { replaceRowIn } from '../src/core/editing'
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
    // Counting synchronous passes, so the debounce is switched off here; that
    // it coalesces at all is asserted separately below.
    const source = useLocalDataSource<Employee>(rows, employeeColumns, () => state.query.value, {
      debounceMs: 0,
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

/** Every column writable, so an edit has somewhere to land. */
const editableColumns = employeeColumns.map((column) => ({ ...column, editable: true }))

/**
 * The same used table, plus an editing session over a row array this harness
 * owns — the shared `rows` is module-level and a test that wrote into it would
 * leak into every other one.
 */
function editingHarness(
  save: (change: { nextRow: Employee }) => Promise<Employee | void> = async ({ nextRow }) =>
    nextRow,
  groupBy: string[] = ['department'],
) {
  const scope = effectScope()
  const data = shallowRef<Employee[]>([...rows])
  const built = scope.run(() => {
    const state = useTableState({ pageSize: 25, initialGroupBy: groupBy })
    const source = useLocalDataSource<Employee>(data, editableColumns, () => state.query.value, {
      debounceMs: 0,
    })
    const grouping = useRowGrouping<Employee>(() => source.rows.value, editableColumns, {
      groupBy: () => state.groupBy.value,
      sort: () => state.sort.value,
      totals: () => source.groupCounts(state.groupBy.value),
      aggregates: () => source.groupAggregates(state.groupBy.value),
    })
    const editing = useRowEditing<Employee>(source, editableColumns, {
      save,
      apply: (next) => {
        data.value = replaceRowIn(data.value, next, (row) => row.id)
      },
    })

    state.setFilter('department', valuesFilter(['Engineering', 'Research', 'Design']))
    state.setSort('name', 'asc')
    return { state, source, grouping, editing, data, stop: () => scope.stop() }
  })!

  built.source.rows.value
  built.grouping.displayRows.value
  reset()
  return built
}

beforeEach(reset)

describe('what editing is allowed to recompute', () => {
  /** The column every case below edits: a plain number, no accessor to invert. */
  const salary = editableColumns.find((column) => column.id === 'salary')!

  it('opening a draft and typing into it never reaches the pipeline', () => {
    const h = editingHarness()
    const row = h.source.rows.value[0]!

    h.editing.begin(row, 'salary')
    for (const input of ['9', '92', '920', '9200', '92000']) {
      h.editing.setValue(row, salary, input)
    }
    h.editing.stateFor(h.editing.getRowId(row))
    h.source.rows.value
    h.grouping.displayRows.value

    expect(counters.filter).toBe(0)
    expect(counters.sort).toBe(0)
    expect(counters.count).toBe(0)
    expect(counters.aggregate).toBe(0)
    h.stop()
  })

  it('a draft that fails validation never reaches the pipeline', async () => {
    const h = editingHarness()
    const row = h.source.rows.value[0]!

    h.editing.begin(row, 'salary')
    h.editing.setValue(row, salary, 'not a number')
    await expect(h.editing.commit(row)).resolves.toBe(false)
    h.source.rows.value
    h.grouping.displayRows.value

    expect(counters.filter).toBe(0)
    expect(counters.sort).toBe(0)
    expect(counters.count).toBe(0)
    expect(counters.aggregate).toBe(0)
    h.stop()
  })

  it('a save the server rejects leaves the data, and the pipeline, alone', async () => {
    // The rows never changed, so nothing below the edit has anything to redo —
    // a failed save must cost exactly as little as a keystroke.
    const h = editingHarness(async () => {
      throw new Error('Simulated server error (503)')
    })
    const row = h.source.rows.value[0]!

    h.editing.begin(row, 'salary')
    h.editing.setValue(row, salary, '92000')
    await expect(h.editing.commit(row)).resolves.toBe(false)
    h.source.rows.value
    h.grouping.displayRows.value

    expect(counters.filter).toBe(0)
    expect(counters.sort).toBe(0)
    expect(counters.count).toBe(0)
    expect(counters.aggregate).toBe(0)
    h.stop()
  })

  it('a save that succeeds does redo the pipeline, and only once', async () => {
    // The mirror image, the same one `changing the sort` makes below: an edited
    // row genuinely changed the dataset, so it must be allowed — and required —
    // to re-sort, and to filter itself out of view. An invariant suite that only
    // says "do less" is satisfied by a table that never updates.
    const h = editingHarness()
    const row = h.source.rows.value[0]!

    h.editing.begin(row, 'salary')
    h.editing.setValue(row, salary, '92000')
    await expect(h.editing.commit(row)).resolves.toBe(true)
    h.source.rows.value
    h.source.rows.value

    expect(counters.filter).toBe(1)
    expect(counters.sort).toBe(1)
    h.stop()
  })
})

describe('what an interaction is allowed to recompute', () => {
  /*
   * `it.fails` rather than a skip, and rather than asserting today's numbers.
   *
   * It states the invariant we intend to hold and records that it does not hold
   * yet — and because vitest fails an `it.fails` that starts passing, the day
   * P1-4 lands this file demands to be updated instead of silently agreeing
   * with whatever the code now does. A skip would just rot.
   */
  it('setPage redoes neither the filter nor the sort', () => {
    const h = harness()
    h.state.setPage(2)
    h.source.rows.value

    expect(counters.filter).toBe(0)
    expect(counters.sort).toBe(0)
    h.stop()
  })

  it('setPage while grouped re-counts and re-aggregates nothing', () => {
    const h = harness(['department', 'role'])
    h.state.setPage(2)
    h.grouping.displayRows.value

    expect(counters.filter).toBe(0)
    expect(counters.count).toBe(0)
    expect(counters.aggregate).toBe(0)
    // Exactly one sort, and it is the *page* — 25 rows gathered into bands,
    // which a new page genuinely needs. The dataset-sized passes are the ones
    // that must not happen, and none of them do.
    expect(counters.sort).toBe(1)
    h.stop()
  })

  it('collapsing a group does not re-scan the dataset', () => {
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

  it('P1-5: a burst of keystrokes costs one filter pass, not one each', () => {
    vi.useFakeTimers()
    const scope = effectScope()
    const built = scope.run(() => {
      const state = useTableState({ pageSize: 25 })
      const source = useLocalDataSource<Employee>(rows, employeeColumns, () => state.query.value, {
        debounceMs: 150,
      })
      return { state, source }
    })!
    built.source.rows.value
    reset()

    for (const term of ['a', 'ad', 'ada', 'adam']) {
      built.state.setSearch(term)
      built.source.rows.value
    }
    expect(counters.filter).toBe(0)

    vi.advanceTimersByTime(150)
    built.source.rows.value
    expect(counters.filter).toBe(1)

    scope.stop()
    vi.useRealTimers()
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
