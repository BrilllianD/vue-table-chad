/**
 * The one workload — rows and the columns that read them.
 *
 * Benches, perf-invariant tests and the demo all build from here, so a number
 * measured in `bench/` describes the same data a reader sees on screen, and a
 * regression cannot hide behind a friendlier fixture.
 *
 * Rows first, then the column set at the bottom.
 *
 * Shaped to exercise every `ColumnDef` capability rather than to look tidy:
 *
 *   - `location` is nested, so a column needs an `accessor`
 *   - `tags` is an array, so a column needs both an accessor and a cell slot
 *   - `role` has a meaningful order that is not alphabetical, so it needs a
 *     custom `comparator`
 *   - `salary` and `hiredAt` are nullable, so "(Blanks)" and null-sorting show up
 *   - `department` is blank in ~4% of rows, which is a different kind of blank
 *     (empty string, not null) and must land in the same bucket
 *   - `city` and `country` read through an accessor, so making them *editable*
 *     forces a `setValue`: an accessor cannot be inverted
 *
 * The editing config is inert unless a table is handed an editing session, so
 * it costs the other twelve demo views and every benchmark nothing. Nothing in
 * `filterRows`, `sortRows`, `countGroups` or `aggregateGroups` reads any of it.
 */

import type { ColumnDef, ColumnGroupDef } from '@brillliand/vue-table-chad'

export interface Employee extends Record<string, unknown> {
  id: number
  name: string
  email: string
  department: string
  role: string
  salary: number | null
  hiredAt: string | null
  rating: number
  active: boolean
  location: { city: string; country: string }
  tags: string[]
}

export const DEPARTMENTS = ['Engineering', 'Research', 'Design', 'Support', 'Sales', 'Finance']

/** Deliberately not alphabetical — this is what `comparator` exists for. */
export const SENIORITY = ['Junior', 'Mid', 'Senior', 'Staff', 'Principal', 'Manager']

export const LOCATIONS: ReadonlyArray<{ city: string; country: string }> = [
  { city: 'Berlin', country: 'Germany' },
  { city: 'Lisbon', country: 'Portugal' },
  { city: 'Toronto', country: 'Canada' },
  { city: 'Austin', country: 'USA' },
  { city: 'Kraków', country: 'Poland' },
  { city: 'Tallinn', country: 'Estonia' },
  { city: 'Osaka', country: 'Japan' },
  { city: 'Nairobi', country: 'Kenya' },
]

export const COUNTRIES = [...new Set(LOCATIONS.map((entry) => entry.country))]

const TAGS = ['on-call', 'mentor', 'remote', 'hiring', 'oncall-lead', 'guild', 'new-hire']

const FIRST = [
  'Ada', 'Grace', 'Alan', 'Katherine', 'Barbara', 'Linus', 'Margaret',
  'Donald', 'Edsger', 'Radia', 'Hedy', 'Jean', 'Anita', 'Shafi', 'Frances',
]
const LAST = [
  'Lovelace', 'Hopper', 'Turing', 'Johnson', 'Liskov', 'Torvalds', 'Hamilton',
  'Knuth', 'Dijkstra', 'Perlman', 'Lamarr', 'Bartik', 'Borg', 'Goldwasser', 'Allen',
]

/**
 * Deterministic PRNG. Every reload, every screenshot and — the reason it matters
 * here — every benchmark run sees byte-identical rows, so a bench delta is a
 * change in the code rather than a change in the data.
 */
function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function pick<T>(random: () => number, list: readonly T[]): T {
  return list[Math.floor(random() * list.length)]!
}

/**
 * `count` rows from a fixed seed.
 *
 * The seed is fixed rather than derived from `count`, so the first 10 000 rows
 * of `makeRows(100_000)` are exactly `makeRows(10_000)` — which is what lets two
 * bench sizes be compared as the same workload at two scales.
 */
export function makeRows(count = 10_000): Employee[] {
  const random = mulberry32(1337)
  const rows: Employee[] = []

  for (let id = 1; id <= count; id += 1) {
    const first = pick(random, FIRST)
    const last = pick(random, LAST)
    const location = pick(random, LOCATIONS)

    // ~6% blanks on purpose, so "(Blanks)" and null-sorting are visible.
    const missingSalary = random() < 0.06
    const missingDate = random() < 0.06

    const year = 2015 + Math.floor(random() * 10)
    const month = 1 + Math.floor(random() * 12)
    const day = 1 + Math.floor(random() * 28)

    const tagCount = Math.floor(random() * 3)
    const tags = new Set<string>()
    for (let i = 0; i < tagCount; i += 1) tags.add(pick(random, TAGS))

    rows.push({
      id,
      name: `${first} ${last}`,
      email: `${first.toLowerCase()}.${last.toLowerCase()}${id}@example.com`,
      // An empty string rather than null — both must collapse into one bucket.
      department: random() < 0.04 ? '' : pick(random, DEPARTMENTS),
      role: pick(random, SENIORITY),
      salary: missingSalary ? null : 45000 + Math.floor(random() * 130000),
      hiredAt: missingDate
        ? null
        : `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
      rating: Math.round(random() * 50) / 10,
      active: random() < 0.82,
      location,
      tags: [...tags],
    })
  }

  return rows
}

/** The previous name for `makeRows`, kept so the demo reads the way it always did. */
export const generateEmployees = makeRows

/* ------------------------------------------------------------------ *
 * The workload's column set
 *
 * Rows alone do not define a benchmark: what the pipeline actually costs
 * depends on the accessors it reads through, the comparators it sorts by, the
 * formats the search box stringifies with and the aggregates the group rows
 * reduce. So the columns live beside the rows, and the demo renders the very
 * set the benches measure.
 *
 * It uses every field `ColumnDef` offers, annotated with why.
 * ------------------------------------------------------------------ */

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
    editable: true,
    // Nobody is nameless. `required` rejects the three blanks together, the
    // same trio `isBlank` buckets for filtering.
    required: true,
  },
  {
    id: 'email',
    header: 'Email',
    type: 'text',
    width: 250,
    editable: true,
    validate: (value) =>
      typeof value === 'string' && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)
        ? null
        : 'Not an email address',
  },
  {
    id: 'department',
    header: 'Department',
    type: 'enum',
    width: 150,
    // Fixed options keep every choice in the checklist even at count 0, so the
    // list does not reshuffle underneath the pointer as you filter. They are
    // also what turns the editor into a select rather than a text box.
    options: DEPARTMENTS,
    editable: true,
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
    editable: true,
  },
  {
    id: 'city',
    header: 'City',
    type: 'text',
    width: 140,
    // The value lives at `row.location.city`, not `row.city` — this is what
    // `accessor` is for. Sorting, filtering and facets all read through it.
    accessor: (row) => row.location.city,
    editable: true,
    // And this is what `setValue` is for: an accessor is a function, so it
    // cannot be run backwards to find where an edit should land. Without it the
    // table would have to guess `row.city`, which nothing ever reads.
    setValue: (row, value) => ({
      ...row,
      location: { ...row.location, city: String(value ?? '') },
    }),
  },
  {
    id: 'country',
    header: 'Country',
    type: 'enum',
    width: 130,
    accessor: (row) => row.location.country,
    options: COUNTRIES,
    editable: true,
    setValue: (row, value) => ({
      ...row,
      location: { ...row.location, country: String(value ?? '') },
    }),
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
    // `format` cannot dress a total up — it wants a row, and a sum has none —
    // so the aggregate gets its own formatter.
    aggregate: 'sum',
    aggregateFormat: (result) =>
      result.value === null ? '—' : money.format(Number(result.value)),
    editable: true,
    // Nullable, so a blank is allowed through and only a *negative* is refused.
    validate: (value) =>
      value !== null && Number(value) < 0 ? 'A salary cannot be negative' : null,
  },
  {
    id: 'hiredAt',
    header: 'Hired',
    type: 'date',
    width: 130,
    format: (value) => (value ? new Date(String(value)).toLocaleDateString() : '—'),
    // `min`/`max` know the row they came from, so `format` renders them and no
    // `aggregateFormat` is needed here.
    aggregate: 'min',
    editable: true,
  },
  {
    id: 'rating',
    header: 'Rating',
    type: 'number',
    width: 110,
    align: 'right',
    format: (value) => `${Number(value).toFixed(1)} ★`,
    aggregate: 'avg',
    aggregateFormat: (result) =>
      result.value === null ? '—' : `${Number(result.value).toFixed(2)} ★`,
    editable: true,
    validate: (value) =>
      Number(value) >= 0 && Number(value) <= 5 ? null : 'A rating runs from 0 to 5',
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
    // Left read-only on purpose. Editing is opt-in per column, and a list needs
    // an editor of its own — a comma-separated text box would be a worse lie
    // than showing the value plainly.
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

/** Look a column up by id — several views need this to label their controls. */
export function columnFor(id: string): ColumnDef<Employee> {
  const column = employeeColumns.find((entry) => entry.id === id)
  if (!column) throw new Error(`[demo] no column "${id}"`)
  return column
}

/**
 * Header bands over the same eleven columns.
 *
 * Shaped, like the columns themselves, to exercise the awkward cases rather
 * than to look tidy:
 *
 *   - `name` is `pinned: 'left'`, so `identity` and the `person` band above it
 *     are both split by the pin hoisting in `useColumns().visible` — the header
 *     has to draw that as two cells carrying one label
 *   - `identity`, `org` and `location` nest inside `person`, so the header is
 *     three rows deep, while `record` sits at the top level with its columns
 *     one row shallower — mixed depths in one header
 *   - `name` is `hideable: false`, so collapsing `identity` must leave it alone
 *   - `tags` and `active` sit in no band at all, so an unbanded column — pinned
 *     right, in `active`'s case — has to span down through every header row
 */
export const employeeColumnGroups: ColumnGroupDef[] = [
  { id: 'person', header: 'Personal details' },
  { id: 'identity', header: 'Identity', parent: 'person' },
  { id: 'org', header: 'Organisation', parent: 'person', collapseTo: 'department' },
  { id: 'location', header: 'Location', parent: 'person', collapseTo: 'country' },
  { id: 'record', header: 'Employment record', collapseTo: 'salary' },
]

/**
 * Which band each column claims. Ids not listed here stay unbanded.
 *
 * Every band is contiguous in the declared order on purpose: a band split by
 * the *declaration* would look like a mistake in the fixture rather than the
 * feature it is. The splits worth showing are the ones that happen to a
 * well-formed band — `name` is pinned left, so `identity` and `person` both
 * break across the pin boundary — and the ones a reader causes by dragging.
 */
const GROUP_OF: Record<string, string> = {
  name: 'identity',
  email: 'identity',
  department: 'org',
  role: 'org',
  city: 'location',
  country: 'location',
  salary: 'record',
  hiredAt: 'record',
  rating: 'record',
}

/**
 * `employeeColumns` banded. A derived copy rather than a change to the
 * original, for the reason `aggregatedPersonColumns` is a separate export in
 * `tests/fixtures.ts`: declaring a band adds a header row, and every other
 * demo view and benchmark asserts against the single-row shape.
 */
export const groupedEmployeeColumns: ColumnDef<Employee>[] = employeeColumns.map((column) => {
  const group = GROUP_OF[column.id]
  return group ? { ...column, group } : column
})
