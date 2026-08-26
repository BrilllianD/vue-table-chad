/**
 * The playground's view of the shared column set.
 *
 * A *slice* of it rather than the whole thing, unlike the demo, which takes
 * every column: these four examples are meant to stay small enough to read at
 * a glance. What matters is that the accessors, formats, comparators and
 * widths are the shared ones — those are half of what the pipeline costs, so a
 * playground running its own definitions would render a different table from
 * the one the benchmarks measure while looking like the same table.
 */
import { employeeColumns as allColumns } from '@fixtures'
import type { ColumnDef } from '@sandbox/vue-table'
import type { Employee } from '../mock/fakeApi'

/** The eight the examples show. Order is the shared set's own. */
const SHOWN = ['name', 'email', 'department', 'role', 'salary', 'hiredAt', 'rating', 'active']

export const employeeColumns: ColumnDef<Employee>[] = allColumns.filter((column) =>
  SHOWN.includes(column.id),
)
