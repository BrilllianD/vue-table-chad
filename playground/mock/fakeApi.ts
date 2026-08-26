/**
 * An in-memory "server" that honours the exact same `QueryState` the client
 * sends. Its whole purpose is to prove the contract round-trips: it reuses the
 * library's own `filterRows` / `sortRows` / `computeFacets`, so if the server
 * and client ever disagree about what a filter means, the playground breaks
 * loudly.
 *
 * The rows are **not** generated here. They come from `bench/fixtures.ts`, the
 * one dataset the benchmarks measure, the invariant tests count passes over and
 * the demo renders — this used to keep a second generator of its own, and the
 * two had already drifted apart in the shape of a row.
 *
 * It stays separate from the demo's `fakeApi` on purpose, rather than both
 * importing one server. The demo's counts requests, fails on demand and saves
 * rows, because the Server view exists to *prove* that debouncing coalesces
 * keystrokes; `playground/src/examples/ServerMocked.vue` is a minimal example
 * someone reads to learn the shape of a data source, and a minimal example
 * wants a minimal server. What they must not disagree about is the data, and
 * now they cannot.
 */
import {
  computeFacets,
  filterRows,
  groupedSort,
  sortRows,
  type ColumnDef,
  type FacetValue,
  type FetchResult,
  type QueryState,
} from '@sandbox/vue-table'
import { makeRows, type Employee } from '@fixtures'

export type { Employee }

/** 10k rows, generated once and shared by every example. */
export const employees: Employee[] = makeRows()

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
  // A grouped table needs its groups contiguous *across pages*, which is a
  // server-side ordering concern: the grouped columns sort ahead of the
  // user's sort. `groupedSort` is the same helper the local source uses.
  const ordered = sortRows(matched, groupedSort(query.sort, query.groupBy), columns)
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
