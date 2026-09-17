<script setup lang="ts">
import { shallowRef } from 'vue'
import {
  DataTable,
  replaceRowIn,
  useLocalDataSource,
  useRowEditing,
  useTableState,
  type ColumnDef,
  type ColumnGroupDef,
  type RowChange,
} from '@brillliand/vue-table-chad'
import '@brillliand/vue-table-chad/style.css'

// Nested `location` and an array of `tags` on purpose: both need an `accessor`,
// which is the part a flat row type never shows.
type Employee = {
  id: number
  name: string
  email: string
  department: string
  role: string
  city: string
  country: string
  salary: number | null
  hiredAt: string | null
  rating: number
  active: boolean
  tags: string[]
}

const DEPARTMENTS = ['Engineering', 'Research', 'Design', 'Support', 'Sales', 'Finance']

/** Deliberately not alphabetical — this is what a column's `comparator` is for. */
const SENIORITY = ['Junior', 'Mid', 'Senior', 'Staff', 'Principal', 'Manager']

const PLACES = [
  { city: 'Berlin', country: 'Germany' },
  { city: 'Lisbon', country: 'Portugal' },
  { city: 'Toronto', country: 'Canada' },
  { city: 'Austin', country: 'USA' },
  { city: 'Kraków', country: 'Poland' },
  { city: 'Osaka', country: 'Japan' },
]

const COUNTRIES = [...new Set(PLACES.map((place) => place.country))]
const TAGS = ['on-call', 'mentor', 'remote', 'hiring', 'alumni']

/*
 * Bands nest: `identity`, `org` and `location` all sit under "Personal
 * details", and "Employment record" stands alone. `collapseTo` names the one
 * column a folded band keeps showing — fold "Location" and it becomes
 * Country alone, rather than the band's first column by default.
 *
 * Every band starts open. There is an `initial-layout` prop that can fold one
 * from the start; not passing it is what leaves them all expanded.
 */
const columnGroups: ColumnGroupDef[] = [
  { id: 'person', header: 'Personal details' },
  { id: 'identity', header: 'Identity', parent: 'person' },
  { id: 'org', header: 'Organisation', parent: 'person', collapseTo: 'department' },
  { id: 'location', header: 'Location', parent: 'person', collapseTo: 'country' },
  { id: 'record', header: 'Employment record', collapseTo: 'salary' },
]

const money = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

// `type` is most of the configuration: it picks the comparator a header click
// sorts with, the operators the filter popover offers, and the editor a cell
// opens with.
const columns: ColumnDef<Employee>[] = [
  {
    id: 'name',
    header: 'Name',
    type: 'text',
    group: 'identity',
    width: 180,
    // Pinned and unhideable: the row's identity must never scroll away or be
    // switched off, or the rest of the row stops meaning anything. It is also
    // why folding "Identity" leaves this column where it is.
    pinned: 'left',
    hideable: false,
    editable: true,
    required: true,
  },
  {
    id: 'email',
    header: 'Email',
    type: 'text',
    group: 'identity',
    width: 230,
    editable: true,
    validate: (value) =>
      typeof value === 'string' && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value) ? null : 'Not an email address',
  },
  {
    id: 'department',
    header: 'Department',
    type: 'enum',
    group: 'org',
    width: 150,
    // Declared options keep every choice in the filter checklist even at count
    // 0, so the list does not reshuffle under the pointer. They are also what
    // makes the editor a select rather than a text box.
    options: DEPARTMENTS,
    editable: true,
  },
  {
    id: 'role',
    header: 'Role',
    type: 'enum',
    group: 'org',
    width: 130,
    options: SENIORITY,
    // Seniority is not alphabetical. Without this, "Junior" sorts above
    // "Senior" and the column is worse than useless.
    comparator: (a, b) => SENIORITY.indexOf(String(a)) - SENIORITY.indexOf(String(b)),
    editable: true,
  },
  { id: 'city', header: 'City', type: 'text', group: 'location', width: 140, editable: true },
  { id: 'country', header: 'Country', type: 'enum', group: 'location', width: 140, options: COUNTRIES, editable: true },
  {
    id: 'salary',
    header: 'Salary',
    type: 'number',
    group: 'record',
    width: 130,
    align: 'right',
    format: (value) => (value == null ? '—' : money.format(Number(value))),
    aggregate: 'sum',
    // `format` cannot dress a total up — it is handed a row, and a sum has
    // none — so the aggregate gets a formatter of its own.
    aggregateFormat: (result) => (result.value == null ? '—' : money.format(Number(result.value))),
    editable: true,
    // Nullable, so a blank is allowed through and only a negative is refused.
    validate: (value) => (value != null && Number(value) < 0 ? 'A salary cannot be negative' : null),
  },
  {
    id: 'hiredAt',
    header: 'Hired',
    type: 'date',
    group: 'record',
    width: 130,
    format: (value) => (value ? new Date(String(value)).toLocaleDateString() : '—'),
    // `min` knows the row it came from, so `format` renders it and no
    // `aggregateFormat` is needed here.
    aggregate: 'min',
    editable: true,
  },
  {
    id: 'rating',
    header: 'Rating',
    type: 'number',
    group: 'record',
    width: 110,
    align: 'right',
    format: (value) => `${Number(value).toFixed(1)} ★`,
    aggregate: 'avg',
    aggregateFormat: (result) => (result.value == null ? '—' : `${Number(result.value).toFixed(2)} ★`),
    editable: true,
    validate: (value) => (Number(value) >= 0 && Number(value) <= 5 ? null : 'A rating runs from 0 to 5'),
  },
  {
    id: 'tags',
    header: 'Tags',
    width: 160,
    // A list has no sensible ordering and no useful facet list, so both are
    // switched off rather than left to produce nonsense. In no band, so this
    // header spans every band row.
    sortable: false,
    filterable: false,
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
    editable: true,
  },
]

/*
 * Stand-in for your own data. Seeded rather than `Math.random`, so a reload
 * shows the same table and a screenshot keeps matching the page.
 */
function makeEmployees(count: number): Employee[] {
  let seed = 1337
  const random = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296)

  return Array.from({ length: count }, (_, i) => {
    const place = PLACES[i % PLACES.length]!
    const year = 2015 + Math.floor(random() * 10)
    const month = 1 + Math.floor(random() * 12)
    const day = 1 + Math.floor(random() * 28)

    return {
      id: i + 1,
      name: `Person ${i + 1}`,
      email: `person${i + 1}@example.com`,
      // An empty string rather than null, so a blank department and a null
      // salary show the two kinds of blank landing in one bucket. The offsets
      // are not zero on purpose: at zero all three blanks land on row 1, and
      // the first row anyone sees is three em-dashes.
      department: i % 23 === 7 ? '' : DEPARTMENTS[i % DEPARTMENTS.length]!,
      role: SENIORITY[(i * 5) % SENIORITY.length]!,
      city: place.city,
      country: place.country,
      salary: i % 17 === 5 ? null : 45_000 + Math.floor(random() * 130_000),
      hiredAt: i % 19 === 11 ? null : `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
      rating: Math.round(random() * 50) / 10,
      active: i % 9 !== 4,
      tags: TAGS.filter((_tag, t) => (i + t) % 4 === 0),
    }
  })
}

const rows = shallowRef<Employee[]>(makeEmployees(400))

// No `pageSize`: the default 10 is also the first option the rows-per-page
// select offers, and a size that is not one of its options would leave that
// select showing a number the table is not using.
const state = useTableState()
const source = useLocalDataSource(rows, columns, state.query)

// Cell mode, not row mode: with a cursor on the table, Enter opens the cell the
// cursor is on and a second Enter commits it and steps down.
const editing = useRowEditing(source, columns, {
  mode: 'cell',
  // Stands in for the request a real table would send. `apply` is what writes
  // the answer back, and it is the only thing here that redoes the pipeline.
  save: ({ nextRow }: RowChange<Employee>) => Promise.resolve(nextRow),
  apply: (next) => {
    rows.value = replaceRowIn(rows.value, next, (row) => row.id)
  },
})
</script>

<template>
  <!--
    The toolbar, the search box, the columns and group menus and the pager are
    on by default, so the props here are the ones that are not: the bands, the
    keyboard cell cursor, checkboxes, the aggregate footer, draggable headers
    and the right-click menu.
  -->
  <DataTable
    :columns="columns"
    :column-groups="columnGroups"
    :source="source"
    :state="state"
    :editing="editing"
    cell-cursor
    selectable
    show-footer
    reorderable
    context-menu
  />
</template>
