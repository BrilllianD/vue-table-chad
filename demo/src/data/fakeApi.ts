/**
 * An in-memory "server" that honours the exact same `QueryState` the client
 * sends.
 *
 * It reuses the library's own `filterRows` / `sortRows` / `computeFacets`, so
 * if client and server ever disagreed about what a filter means, the demo would
 * break loudly rather than quietly showing the wrong rows.
 *
 * It also counts requests, so the Server view can *prove* that debouncing
 * coalesces keystrokes and that paging is not debounced.
 */
import { reactive } from 'vue'
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
import { employees, type Employee } from './dataset'

export interface ApiOptions {
  latencyMs?: number
  /** Fail this fraction of requests, to exercise the error path. */
  failureRate?: number
}

export interface RequestLogEntry {
  id: number
  at: number
  kind: 'rows' | 'facets'
  label: string
  outcome: 'pending' | 'ok' | 'error' | 'aborted'
  ms: number
}

let nextRequestId = 1

/** Newest first, and reactive so the Server view can render it live. */
export const requestLog = reactive<RequestLogEntry[]>([])

function logStart(kind: RequestLogEntry['kind'], label: string): RequestLogEntry {
  requestLog.unshift({
    id: nextRequestId++,
    at: Date.now(),
    kind,
    label,
    outcome: 'pending',
    ms: 0,
  })
  // Unbounded growth would make the log page itself a performance problem.
  if (requestLog.length > 40) requestLog.length = 40
  // Hand back the *reactive proxy*, not the object literal: `reactive` wraps
  // nested objects on read, and a later write through the raw reference would
  // never notify anyone, leaving finished requests stuck on "pending".
  return requestLog[0]!
}

function logEnd(entry: RequestLogEntry, outcome: RequestLogEntry['outcome']): void {
  entry.outcome = outcome
  entry.ms = Date.now() - entry.at
}

export function clearRequestLog(): void {
  requestLog.length = 0
}

function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Aborted', 'AbortError'))
      return
    }
    const timer = setTimeout(resolve, ms)
    signal.addEventListener('abort', () => {
      clearTimeout(timer)
      reject(new DOMException('Aborted', 'AbortError'))
    })
  })
}

function describe(query: QueryState): string {
  const parts: string[] = [`page ${query.page}×${query.pageSize}`]
  if (query.sort.length) {
    parts.push(`sort ${query.sort.map((r) => `${r.columnId} ${r.direction}`).join(', ')}`)
  }
  const filterIds = Object.keys(query.filters)
  if (filterIds.length) parts.push(`filters ${filterIds.join(', ')}`)
  if (query.globalSearch) parts.push(`search "${query.globalSearch}"`)
  if (query.groupBy.length) parts.push(`grouped by ${query.groupBy.join(' › ')}`)
  return parts.join(' · ')
}

/** Simulates `GET /employees?…` — filter, sort and paginate server-side. */
export async function fetchEmployees(
  query: QueryState,
  columns: ColumnDef<Employee>[],
  signal: AbortSignal,
  options: ApiOptions = {},
): Promise<FetchResult<Employee>> {
  const entry = logStart('rows', describe(query))
  try {
    await delay(options.latencyMs ?? 450, signal)

    if (options.failureRate && Math.random() < options.failureRate) {
      throw new Error('Simulated server error (503)')
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

    logEnd(entry, 'ok')
    return { rows: ordered.slice(start, start + query.pageSize), total: matched.length }
  } catch (caught) {
    logEnd(entry, signal.aborted ? 'aborted' : 'error')
    throw caught
  }
}

/** Simulates `GET /employees/facets?column=…` for the Excel checklist. */
export async function fetchEmployeeFacets(
  columnId: string,
  query: QueryState,
  columns: ColumnDef<Employee>[],
  signal: AbortSignal,
  options: ApiOptions = {},
): Promise<FacetValue[]> {
  const entry = logStart('facets', columnId)
  try {
    await delay(options.latencyMs ?? 250, signal)

    const column = columns.find((entry_) => entry_.id === columnId)
    if (!column) {
      logEnd(entry, 'ok')
      return []
    }

    // `query.filters` arrives with this column's own filter already stripped by
    // `useServerDataSource` — a real backend would do exactly this and nothing
    // more.
    const facets = computeFacets(employees, columns, column, {
      filters: query.filters,
      globalSearch: query.globalSearch,
    }).slice(0, 500)

    logEnd(entry, 'ok')
    return facets
  } catch (caught) {
    logEnd(entry, signal.aborted ? 'aborted' : 'error')
    throw caught
  }
}
