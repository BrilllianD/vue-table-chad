import { bench, describe } from 'vitest'
import {
  aggregateGroups,
  computeFacets,
  countGroups,
  filterRows,
  flattenGroups,
  sortRows,
  valuesFilter,
} from '@brillliand/vue-table-chad'
import { columnFor, employeeColumns, makeRows } from '@fixtures'

/**
 * The pure layer, at the two sizes that matter: 10k is what the demo generates
 * and what a client-side table plausibly holds; 100k is where an O(n log n)
 * pass stops being free and a per-row allocation starts to hurt.
 *
 * Rows are generated once per size rather than per iteration — the fixture is
 * not the thing under measurement, and regenerating it inside the loop would
 * bury the signal under ~200ms of PRNG.
 */
const SIZES = [10_000, 100_000] as const

const rowsBySize = new Map(SIZES.map((size) => [size, makeRows(size)]))

/** The same columns with every aggregate but one stripped off. */
function onlyAggregate(columnId: string) {
  return employeeColumns.map((column) =>
    column.id === columnId ? column : { ...column, aggregate: undefined },
  )
}

/** A filter that keeps roughly half the rows — the case that costs the most. */
const halfFilter = {
  department: valuesFilter(['Engineering', 'Research', 'Design']),
}

for (const size of SIZES) {
  const rows = rowsBySize.get(size)!
  const label = `${size / 1000}k`

  describe(`filter · ${label}`, () => {
    bench('unfiltered (the copy every keystroke pays for)', () => {
      filterRows(rows, employeeColumns, { filters: {}, globalSearch: '' })
    })

    bench('one values filter', () => {
      filterRows(rows, employeeColumns, { filters: halfFilter, globalSearch: '' })
    })

    bench('global search across every searchable column', () => {
      filterRows(rows, employeeColumns, { filters: {}, globalSearch: 'ada' })
    })
  })

  describe(`sort · ${label}`, () => {
    bench('single text column (Intl.Collator)', () => {
      sortRows(rows, [{ columnId: 'name', direction: 'asc' }], employeeColumns)
    })

    bench('single number column', () => {
      sortRows(rows, [{ columnId: 'salary', direction: 'desc' }], employeeColumns)
    })

    bench('single date column', () => {
      // The worst case for a comparator that derives its key on every call:
      // O(n log n) comparisons, each parsing both operands.
      sortRows(rows, [{ columnId: 'hiredAt', direction: 'asc' }], employeeColumns)
    })

    bench('three columns, mixed types', () => {
      sortRows(
        rows,
        [
          { columnId: 'department', direction: 'asc' },
          { columnId: 'role', direction: 'asc' },
          { columnId: 'salary', direction: 'desc' },
        ],
        employeeColumns,
      )
    })
  })

  describe(`facets · ${label}`, () => {
    bench('enum column, no other filters', () => {
      computeFacets(rows, employeeColumns, columnFor('department'), {
        filters: {},
        globalSearch: '',
      })
    })

    bench('enum column, narrowed by another filter', () => {
      // The Excel case: the checklist must re-scan the dataset behind every
      // other column's filter each time a popover opens.
      computeFacets(rows, employeeColumns, columnFor('role'), {
        filters: halfFilter,
        globalSearch: '',
      })
    })
  })

  describe(`group · ${label}`, () => {
    bench('flatten, one level', () => {
      flattenGroups(rows, ['department'], employeeColumns)
    })

    bench('flatten, two levels', () => {
      flattenGroups(rows, ['department', 'role'], employeeColumns)
    })

    bench('count, two levels', () => {
      countGroups(rows, ['department', 'role'], employeeColumns)
    })

    bench('aggregate, two levels', () => {
      aggregateGroups(rows, ['department', 'role'], employeeColumns)
    })

    // Split by reducer, because "aggregation is slow" is not actionable and
    // "parsing a date string per comparison is slow" is. `min` on a date column
    // runs the column's comparator once per row, and each call re-parses both
    // operands — including the incumbent, over and over.
    bench('aggregate · sum on a number column', () => {
      aggregateGroups(rows, ['department', 'role'], onlyAggregate('salary'))
    })

    bench('aggregate · avg on a number column', () => {
      aggregateGroups(rows, ['department', 'role'], onlyAggregate('rating'))
    })

    bench('aggregate · min on a date column', () => {
      aggregateGroups(rows, ['department', 'role'], onlyAggregate('hiredAt'))
    })
  })
}
