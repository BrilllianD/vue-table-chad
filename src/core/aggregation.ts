import type { AggregateResult, ColumnDef, FilterValue } from './types'
import { comparatorFor, readValue, sortKeyFor } from './sorting'
import { ROOT_GROUP_KEY, groupPathKey, groupValueOf } from './grouping'
import { isBlank, toNumber } from './utils/values'

/**
 * Column aggregation, as pure functions over an array of rows.
 *
 * Aggregates describe whatever set of rows they are handed and nothing more —
 * a page under `groupMode: 'client'`, the whole filtered set when a source
 * computes them. Keeping that decision outside these functions is what lets
 * the same code serve a band, a nested band and the footer.
 */

/** Shared, because constructing a formatter per cell per render is not free. */
const numberFormat = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 })

function sumOrAverage<TRow>(
  rows: readonly TRow[],
  column: ColumnDef<TRow>,
  average: boolean,
): AggregateResult<TRow> {
  let total = 0
  let sampleCount = 0
  for (const row of rows) {
    // `toNumber` yields undefined — not NaN, not 0 — for blanks and for
    // anything unparseable, which is exactly the "skip me" signal needed here.
    const value = toNumber(readValue(row, column))
    if (value === undefined) continue
    total += value
    sampleCount += 1
  }
  return {
    fn: average ? 'avg' : 'sum',
    // A sum of nothing is not 0: no row carried a number, and saying zero would
    // claim they all did and cancelled out.
    value: sampleCount === 0 ? null : average ? total / sampleCount : total,
    sampleCount,
  }
}

function extreme<TRow>(
  rows: readonly TRow[],
  column: ColumnDef<TRow>,
  wantLargest: boolean,
): AggregateResult<TRow> {
  // The column's own comparator first, exactly as `sortRows` resolves it, so a
  // column that sorts by a custom rule reports its extremes by the same rule.
  const compare = column.comparator
    ? (column.comparator as (a: unknown, b: unknown) => number)
    : comparatorFor(column.type)

  // Where the type has a numeric key and the column did not override the
  // ordering, each value is projected once and the incumbent's key is kept.
  // Otherwise the scan re-derives it on every row: `compareDate` parses both
  // operands per call, so finding the earliest of 10 000 dates parsed the
  // running minimum 10 000 times over.
  const key = column.comparator ? undefined : sortKeyFor(column.type)

  let winner: TRow | undefined
  let winning: unknown
  let winningKey = 0
  let sampleCount = 0

  for (const row of rows) {
    const value = readValue(row, column)
    if (isBlank(value)) continue
    sampleCount += 1

    if (key) {
      const candidate = key(value)
      if (winner === undefined || (wantLargest ? candidate > winningKey : candidate < winningKey)) {
        winner = row
        winning = value
        winningKey = candidate
      }
      continue
    }

    if (winner === undefined) {
      winner = row
      winning = value
      continue
    }
    const result = compare(value, winning)
    if (wantLargest ? result > 0 : result < 0) {
      winner = row
      winning = value
    }
  }

  return {
    fn: wantLargest ? 'max' : 'min',
    // The cell's own value, not a coerced number: this is what lets `min` on a
    // date column hand back a date the column's `format` can render.
    value: sampleCount === 0 ? null : winning,
    row: winner,
    sampleCount,
  }
}

/**
 * One column's aggregate over a set of rows, or `undefined` when the column
 * declared none.
 */
export function aggregateValue<TRow>(
  rows: readonly TRow[],
  column: ColumnDef<TRow>,
): AggregateResult<TRow> | undefined {
  switch (column.aggregate) {
    case 'sum':
      return sumOrAverage(rows, column, false)
    case 'avg':
      return sumOrAverage(rows, column, true)
    case 'min':
      return extreme(rows, column, false)
    case 'max':
      return extreme(rows, column, true)
    default:
      return undefined
  }
}

/** Every declared aggregate over one set of rows, keyed by column id. */
export function aggregateRow<TRow>(
  rows: readonly TRow[],
  columns: readonly ColumnDef<TRow>[],
): Record<string, AggregateResult<TRow>> {
  const out: Record<string, AggregateResult<TRow>> = {}
  for (const column of columns) {
    const result = aggregateValue(rows, column)
    if (result) out[column.id] = result
  }
  return out
}

/**
 * Aggregates per group key, at every depth, plus the whole set under
 * `ROOT_GROUP_KEY`.
 *
 * Shaped like `countGroups`: one pass to bucket rows by every prefix of their
 * group path, then one aggregation per bucket. Run over a full dataset it gives
 * a band figures that do not shrink to whatever fits on the current page.
 */
export function aggregateGroups<TRow>(
  rows: readonly TRow[],
  groupBy: readonly string[],
  columns: readonly ColumnDef<TRow>[],
): Map<string, Record<string, AggregateResult<TRow>>> {
  const out = new Map<string, Record<string, AggregateResult<TRow>>>()
  const aggregated = columns.filter((column) => column.aggregate)
  if (aggregated.length === 0) return out

  out.set(ROOT_GROUP_KEY, aggregateRow(rows, aggregated))

  const byId = new Map(columns.map((column) => [column.id, column]))
  // Grouping by a column that is not declared is ignored rather than fatal —
  // the same guard `flattenGroups` and `countGroups` apply.
  const levels = groupBy
    .map((id) => byId.get(id))
    .filter((column): column is ColumnDef<TRow> => column !== undefined)
  if (levels.length === 0) return out

  const buckets = new Map<string, TRow[]>()
  for (const row of rows) {
    const path: FilterValue[] = []
    for (const column of levels) {
      path.push(groupValueOf(row, column))
      const key = groupPathKey(path)
      const bucket = buckets.get(key)
      if (bucket) bucket.push(row)
      else buckets.set(key, [row])
    }
  }

  for (const [key, bucket] of buckets) out.set(key, aggregateRow(bucket, aggregated))
  return out
}

/**
 * Display text for an aggregate, through the column's `aggregateFormat` — or
 * through `format` for a `min`/`max`.
 *
 * `format` is only reached for a `min`/`max`, which carries the row it came
 * from; a sum has no row to hand it, so a column that needs its totals dressed
 * up declares `aggregateFormat`.
 */
export function formatAggregate<TRow>(
  result: AggregateResult<TRow>,
  column: ColumnDef<TRow>,
): string {
  if (column.aggregateFormat) return column.aggregateFormat(result)
  if (result.value === null || result.value === undefined) return ''
  if (column.format && result.row !== undefined) {
    return column.format(result.value, result.row)
  }
  if (typeof result.value === 'number') return numberFormat.format(result.value)
  return String(result.value)
}
