/**
 * The demo dataset. Self-contained on purpose — the demo must not depend on
 * the playground.
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
 */

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

/** Deterministic PRNG, so every reload and every screenshot shows the same data. */
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

export function generateEmployees(count = 10000): Employee[] {
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

/** 10k rows, generated once and shared by every view. */
export const employees = generateEmployees()
