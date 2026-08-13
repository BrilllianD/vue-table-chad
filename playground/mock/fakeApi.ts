/**
 * An in-memory "server" that honours the exact same `QueryState` the client
 * sends. Its whole purpose is to prove the contract round-trips: it reuses the
 * library's own `filterRows` / `sortRows` / `computeFacets`, so if the server
 * and client ever disagree about what a filter means, the demo breaks loudly.
 */
import {
  computeFacets,
  filterRows,
  sortRows,
  type ColumnDef,
  type FacetValue,
  type FetchResult,
  type QueryState,
} from '@sandbox/vue-table'

export interface Employee extends Record<string, unknown> {
  id: number
  name: string
  email: string
  department: string
  role: string
  salary: number | null
  hiredAt: string | null
  active: boolean
  rating: number
}

const FIRST = ['Ada', 'Grace', 'Alan', 'Katherine', 'Barbara', 'Linus', 'Margaret', 'Donald', 'Edsger', 'Radia', 'Hedy', 'Jean', 'Anita', 'Shafi']
const LAST = ['Lovelace', 'Hopper', 'Turing', 'Johnson', 'Liskov', 'Torvalds', 'Hamilton', 'Knuth', 'Dijkstra', 'Perlman', 'Lamarr', 'Bartik', 'Borg', 'Goldwasser']
const DEPARTMENTS = ['Engineering', 'Research', 'Design', 'Support', 'Sales', 'Finance']
const ROLES = ['Junior', 'Mid', 'Senior', 'Staff', 'Principal', 'Manager']

/** Deterministic PRNG so the dataset is identical on every reload. */
function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function generateEmployees(count = 10000): Employee[] {
  const random = mulberry32(42)
  const rows: Employee[] = []

  for (let i = 1; i <= count; i += 1) {
    const first = FIRST[Math.floor(random() * FIRST.length)]!
    const last = LAST[Math.floor(random() * LAST.length)]!
    const department = DEPARTMENTS[Math.floor(random() * DEPARTMENTS.length)]!

    // ~6% blanks on purpose, so "(Blanks)" and null-sorting are visible.
    const missingSalary = random() < 0.06
    const missingDate = random() < 0.06

    const year = 2015 + Math.floor(random() * 10)
    const month = 1 + Math.floor(random() * 12)
    const day = 1 + Math.floor(random() * 28)

    rows.push({
      id: i,
      name: `${first} ${last}`,
      email: `${first.toLowerCase()}.${last.toLowerCase()}${i}@example.com`,
      department: random() < 0.04 ? '' : department,
      role: ROLES[Math.floor(random() * ROLES.length)]!,
      salary: missingSalary ? null : 45000 + Math.floor(random() * 130000),
      hiredAt: missingDate
        ? null
        : `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
      active: random() < 0.82,
      rating: Math.round(random() * 50) / 10,
    })
  }
  return rows
}

export const employees = generateEmployees()

export interface ApiOptions {
  latencyMs?: number
  /** Fail this fraction of requests, to exercise the error path. */
  failureRate?: number
}

function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms)
    signal.addEventListener('abort', () => {
      clearTimeout(timer)
      reject(new DOMException('Aborted', 'AbortError'))
    })
  })
}

/** Simulates `GET /employees?…` — filter, sort and paginate server-side. */
export async function fetchEmployees(
  query: QueryState,
  columns: ColumnDef<Employee>[],
  signal: AbortSignal,
  options: ApiOptions = {},
): Promise<FetchResult<Employee>> {
  const latency = options.latencyMs ?? 350 + Math.random() * 350
  await delay(latency, signal)

  if (options.failureRate && Math.random() < options.failureRate) {
    throw new Error('Simulated server error')
  }

  const matched = filterRows(employees, columns, {
    filters: query.filters,
    globalSearch: query.globalSearch,
  })
  const ordered = sortRows(matched, query.sort, columns)
  const start = (query.page - 1) * query.pageSize

  return { rows: ordered.slice(start, start + query.pageSize), total: matched.length }
}

/** Simulates `GET /employees/facets?column=…` for the Excel checklist. */
export async function fetchEmployeeFacets(
  columnId: string,
  query: QueryState,
  columns: ColumnDef<Employee>[],
  signal: AbortSignal,
  options: ApiOptions = {},
): Promise<FacetValue[]> {
  await delay(options.latencyMs ?? 250, signal)

  const column = columns.find((entry) => entry.id === columnId)
  if (!column) return []

  // `query.filters` already has this column's own filter stripped by
  // useServerDataSource, so a real backend would do exactly this.
  return computeFacets(employees, columns, column, {
    filters: query.filters,
    globalSearch: query.globalSearch,
  }).slice(0, 500)
}
