import type { ColumnDef, ColumnFilter, FacetValue, FilterValue, QueryState } from '../types'
import { compileFilter, compileSearch } from './predicates'
import { readValue } from '../sorting'
import { compareDate, compareNumber, compareText } from '../sorting'
import { facetKey, toFilterValue } from '../utils/values'

/**
 * Rows surviving every filter *except* the ones listed in `skip`.
 *
 * Excel's checklist shows the values still reachable given the other columns'
 * filters, while ignoring the column's own filter — otherwise unchecking a box
 * would erase the very option you just unchecked, and you could never get it
 * back.
 */
export function filterRows<TRow>(
  rows: readonly TRow[],
  columns: readonly ColumnDef<TRow>[],
  query: Pick<QueryState, 'filters' | 'globalSearch'>,
  skip?: string,
): TRow[] {
  const byId = new Map(columns.map((column) => [column.id, column]))

  const compiled: Array<{ column: ColumnDef<TRow>; test: (raw: unknown) => boolean }> = []
  for (const [columnId, filter] of Object.entries(query.filters ?? {})) {
    if (columnId === skip) continue
    const column = byId.get(columnId)
    if (!column) continue
    compiled.push({ column, test: compileFilter(filter as ColumnFilter, column.type ?? 'text') })
  }

  const search = (query.globalSearch ?? '').trim()
  // `searchable` wins when set; otherwise a column is searched if it is
  // filterable, which is what callers expect without having to say so.
  const searchable =
    search === ''
      ? []
      : columns.filter((column) => column.searchable ?? column.filterable !== false)

  if (compiled.length === 0 && searchable.length === 0) return rows.slice()

  // Compiled once for the whole pass rather than rebuilt per row.
  const searchTest = compileSearch(search)

  return rows.filter((row) => {
    for (const { column, test } of compiled) {
      if (!test(readValue(row, column))) return false
    }
    // Both halves matter. `searchTest` is undefined for an empty search, and
    // `searchable` is empty when no column will take one — a search with
    // nothing to search against must be ignored rather than tested against
    // zero columns, which would leave `hit` false and reject every row. The
    // early return above already answers that case when no filter is active,
    // so dropping this half made the same search return everything or nothing
    // depending on whether an unrelated column filter happened to be set.
    if (searchTest && searchable.length > 0) {
      // Walked rather than collected: gathering every searchable cell into an
      // array first meant allocating one array per row and running `format` on
      // all of them, when the first hit already settles the question. Most rows
      // that match do so on an early column, and most that do not are decided
      // by the loop ending — neither case wants the array.
      let hit = false
      for (const column of searchable) {
        const value = readValue(row, column)
        if (searchTest(column.format ? column.format(value, row) : value)) {
          hit = true
          break
        }
      }
      if (!hit) return false
    }
    return true
  })
}

function facetComparator(column: ColumnDef<unknown>): (a: FilterValue, b: FilterValue) => number {
  switch (column.type) {
    case 'number':
      return compareNumber
    case 'date':
      return compareDate
    default:
      return compareText
  }
}

/**
 * Distinct values for one column, with row counts, computed against the rows
 * that survive every *other* column's filter.
 */
export function computeFacets<TRow>(
  rows: readonly TRow[],
  columns: readonly ColumnDef<TRow>[],
  column: ColumnDef<TRow>,
  query: Pick<QueryState, 'filters' | 'globalSearch'>,
): FacetValue[] {
  const scoped = filterRows(rows, columns, query, column.id)
  const type = column.type ?? 'text'

  const counts = new Map<string, FacetValue>()
  for (const row of scoped) {
    const value = toFilterValue(readValue(row, column), type)
    const key = facetKey(value)
    const existing = counts.get(key)
    if (existing) existing.count += 1
    else counts.set(key, { value, count: 1 })
  }

  // Fixed enum options should appear even when no row currently uses them,
  // so the checklist does not shift around as you filter.
  if (column.options) {
    for (const option of column.options) {
      const key = facetKey(option)
      if (!counts.has(key)) counts.set(key, { value: option, count: 0 })
    }
  }

  const blanks: FacetValue[] = []
  const values: FacetValue[] = []
  for (const facet of counts.values()) {
    if (facet.value === null) blanks.push(facet)
    else values.push(facet)
  }

  if (column.options) {
    // Declared options keep their declared order; anything the data turned up
    // that was never declared sorts after them rather than jumping to the top.
    const order = new Map(column.options.map((option, index) => [facetKey(option), index]))
    const undeclared = column.options.length
    values.sort(
      (a, b) =>
        (order.get(facetKey(a.value)) ?? undeclared) - (order.get(facetKey(b.value)) ?? undeclared),
    )
  } else {
    const compare = facetComparator(column as ColumnDef<unknown>)
    values.sort((a, b) => compare(a.value, b.value))
  }

  // Blanks last, matching Excel's "(Blanks)" row at the bottom of the list.
  return [...values, ...blanks]
}
