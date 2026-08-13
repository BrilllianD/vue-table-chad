/**
 * One column set that uses every field `ColumnDef` offers, annotated with why.
 *
 * The demo views all share these, so a change here shows up everywhere — which
 * is the point: columns are data, not markup.
 */
import type { ColumnDef } from '@sandbox/vue-table'
import { COUNTRIES, DEPARTMENTS, SENIORITY, type Employee } from './data/dataset'

const money = new Intl.NumberFormat(undefined, {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})

export const employeeColumns: ColumnDef<Employee>[] = [
  {
    id: 'name',
    header: 'Name',
    type: 'text',
    width: 190,
    minWidth: 140,
    // Pinned and unhideable: the row's identity must never scroll away or be
    // switched off, or the rest of the row stops meaning anything.
    pinned: 'left',
    hideable: false,
  },
  { id: 'email', header: 'Email', type: 'text', width: 250 },
  {
    id: 'department',
    header: 'Department',
    type: 'enum',
    width: 150,
    // Fixed options keep every choice in the checklist even at count 0, so the
    // list does not reshuffle underneath the pointer as you filter.
    options: DEPARTMENTS,
  },
  {
    id: 'role',
    header: 'Role',
    type: 'enum',
    width: 130,
    options: SENIORITY,
    // Seniority is not alphabetical. Without this, "Junior" sorts above
    // "Senior" and the column is worse than useless.
    comparator: (a, b) => SENIORITY.indexOf(String(a)) - SENIORITY.indexOf(String(b)),
  },
  {
    id: 'city',
    header: 'City',
    type: 'text',
    width: 140,
    // The value lives at `row.location.city`, not `row.city` — this is what
    // `accessor` is for. Sorting, filtering and facets all read through it.
    accessor: (row) => row.location.city,
  },
  {
    id: 'country',
    header: 'Country',
    type: 'enum',
    width: 130,
    accessor: (row) => row.location.country,
    options: COUNTRIES,
  },
  {
    id: 'salary',
    header: 'Salary',
    type: 'number',
    width: 130,
    minWidth: 100,
    maxWidth: 240,
    align: 'right',
    format: (value) => (value === null || value === undefined ? '—' : money.format(Number(value))),
  },
  {
    id: 'hiredAt',
    header: 'Hired',
    type: 'date',
    width: 130,
    format: (value) => (value ? new Date(String(value)).toLocaleDateString() : '—'),
  },
  {
    id: 'rating',
    header: 'Rating',
    type: 'number',
    width: 110,
    align: 'right',
    format: (value) => `${Number(value).toFixed(1)} ★`,
  },
  {
    id: 'tags',
    header: 'Tags',
    width: 170,
    // A list has no sensible ordering and no useful facet list, so both are
    // switched off rather than left to produce nonsense. The width is fixed to
    // stop the chips reflowing mid-drag.
    sortable: false,
    filterable: false,
    resizable: false,
    accessor: (row) => row.tags.join(', '),
  },
  {
    id: 'active',
    header: 'Active',
    type: 'boolean',
    width: 100,
    align: 'center',
    pinned: 'right',
    format: (value) => (value ? 'Yes' : 'No'),
  },
]

/** Look a column up by id — several views need this to label their controls. */
export function columnFor(id: string): ColumnDef<Employee> {
  const column = employeeColumns.find((entry) => entry.id === id)
  if (!column) throw new Error(`[demo] no column "${id}"`)
  return column
}
