import type { ColumnDataType, ColumnDef, SortDirection, SortRule } from './types'
import { isBlank, toBoolean, toNumber, toTime } from './utils/values'

/** Natural ordering: "item 2" sorts before "item 10". */
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

export function compareText(a: unknown, b: unknown): number {
  return collator.compare(String(a), String(b))
}

export function compareNumber(a: unknown, b: unknown): number {
  const na = toNumber(a)
  const nb = toNumber(b)
  if (na === undefined && nb === undefined) return 0
  if (na === undefined) return 1
  if (nb === undefined) return -1
  return na - nb
}

export function compareDate(a: unknown, b: unknown): number {
  const ta = toTime(a)
  const tb = toTime(b)
  if (ta === undefined && tb === undefined) return 0
  if (ta === undefined) return 1
  if (tb === undefined) return -1
  return ta - tb
}

export function compareBoolean(a: unknown, b: unknown): number {
  const ba = toBoolean(a)
  const bb = toBoolean(b)
  if (ba === bb) return 0
  if (ba === undefined) return 1
  if (bb === undefined) return -1
  return ba ? 1 : -1
}

export function comparatorFor(type: ColumnDataType = 'text'): (a: unknown, b: unknown) => number {
  switch (type) {
    case 'number':
      return compareNumber
    case 'date':
      return compareDate
    case 'boolean':
      return compareBoolean
    case 'enum':
    case 'text':
    default:
      return compareText
  }
}

export function readValue<TRow>(row: TRow, column: ColumnDef<TRow>): unknown {
  if (column.accessor) return column.accessor(row)
  return (row as Record<string, unknown>)[column.id]
}

/** Cycles a header through asc → desc → unsorted. */
export function nextDirection(current: SortDirection | false): SortDirection | false {
  if (current === 'asc') return 'desc'
  if (current === 'desc') return false
  return 'asc'
}

/**
 * Applies one sort rule to the multi-sort list.
 *
 * `additive` (shift-click) appends or updates in place, preserving the order
 * the user built. Otherwise the rule replaces the whole list.
 */
export function applySortRule(
  sort: SortRule[],
  columnId: string,
  direction: SortDirection | false,
  additive: boolean,
): SortRule[] {
  if (!additive) {
    return direction === false ? [] : [{ columnId, direction }]
  }
  const next = sort.filter((rule) => rule.columnId !== columnId)
  if (direction === false) return next
  const existingIndex = sort.findIndex((rule) => rule.columnId === columnId)
  if (existingIndex === -1) {
    next.push({ columnId, direction })
    return next
  }
  next.splice(existingIndex, 0, { columnId, direction })
  return next
}

export interface SortOptions {
  /** Blanks sink to the bottom in both directions when true (the default). */
  nullsLast?: boolean
}

/**
 * Stable multi-column sort. Returns a new array; the input is untouched.
 *
 * Blanks are handled outside the direction flip, so an empty cell stays at the
 * bottom whether you sort ascending or descending — flipping them to the top on
 * `desc` is the behaviour users read as a bug.
 */
export function sortRows<TRow>(
  rows: readonly TRow[],
  sort: readonly SortRule[],
  columns: readonly ColumnDef<TRow>[],
  options: SortOptions = {},
): TRow[] {
  if (sort.length === 0) return rows.slice()
  const nullsLast = options.nullsLast ?? true

  const byId = new Map(columns.map((column) => [column.id, column]))
  const plan = sort
    .map((rule) => {
      const column = byId.get(rule.columnId)
      if (!column) return undefined
      return {
        column,
        direction: rule.direction === 'desc' ? -1 : 1,
        compare: column.comparator
          ? (column.comparator as (a: unknown, b: unknown) => number)
          : comparatorFor(column.type),
      }
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== undefined)

  if (plan.length === 0) return rows.slice()

  // Decorate with the original index so ties keep their incoming order —
  // Array.prototype.sort is stable in modern engines, but multi-key comparison
  // still needs the tiebreak to be explicit and testable.
  return rows
    .map((row, index) => ({ row, index }))
    .sort((left, right) => {
      for (const { column, direction, compare } of plan) {
        const a = readValue(left.row, column)
        const b = readValue(right.row, column)
        const aBlank = isBlank(a)
        const bBlank = isBlank(b)
        if (aBlank || bBlank) {
          if (aBlank && bBlank) continue
          if (nullsLast) return aBlank ? 1 : -1
          return aBlank ? -1 : 1
        }
        const result = compare(a, b)
        if (result !== 0) return result * direction
      }
      return left.index - right.index
    })
    .map((entry) => entry.row)
}
