/**
 * The demo's view of the shared column set.
 *
 * Like the rows, the columns live in `bench/fixtures.ts`: they are half of the
 * workload the benchmarks measure, and a demo rendering different accessors,
 * comparators and formats than the benches ran would make both less honest.
 * Every name the views imported from here still resolves.
 */
import type { ColumnDef } from '@brillliand/vue-table-chad'
import { employeeColumns, type Employee } from '@fixtures'

export { employeeColumns, columnFor, employeeColumnGroups, groupedEmployeeColumns } from '@fixtures'

/**
 * The same columns, with three of the declared widths taken off — the only
 * shape in which the sizing defaults are visible at all.
 *
 * The fixture declares a `width` on all eleven, which is exactly why the
 * defaults used to be invisible everywhere in the demo. Here `city` and
 * `country` are measured once from what they hold, and `role` takes whatever
 * the rest of the table leaves over. A derived copy rather than a change to the
 * fixture, because the fixture's columns are half of what `bench/BASELINE.md`
 * measured.
 */
export const sizedEmployeeColumns: ColumnDef<Employee>[] = employeeColumns.map((column) =>
  column.id === 'role'
    ? { ...column, width: undefined, flex: true }
    : column.id === 'city' || column.id === 'country'
      ? { ...column, width: undefined }
      : column,
)
