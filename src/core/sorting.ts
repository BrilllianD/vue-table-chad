import type { ColumnDataType, ColumnDef, SortDirection, SortRule } from './types'
import { isBlank, toBoolean, toNumber, toTime } from './utils/values'

/** Natural ordering: "item 2" sorts before "item 10". */
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

/** Text ordering, natural and case-insensitive, through the shared collator. */
export function compareText(a: unknown, b: unknown): number {
  return collator.compare(String(a), String(b))
}

/** Numeric ordering; anything uncoercible sorts last. */
export function compareNumber(a: unknown, b: unknown): number {
  const na = toNumber(a)
  const nb = toNumber(b)
  if (na === undefined && nb === undefined) return 0
  if (na === undefined) return 1
  if (nb === undefined) return -1
  return na - nb
}

/** Chronological ordering, with bare YYYY-MM-DD read as local midnight. */
export function compareDate(a: unknown, b: unknown): number {
  const ta = toTime(a)
  const tb = toTime(b)
  if (ta === undefined && tb === undefined) return 0
  if (ta === undefined) return 1
  if (tb === undefined) return -1
  return ta - tb
}

/** false before true, with blanks last. */
export function compareBoolean(a: unknown, b: unknown): number {
  const ba = toBoolean(a)
  const bb = toBoolean(b)
  if (ba === bb) return 0
  if (ba === undefined) return 1
  if (bb === undefined) return -1
  return ba ? 1 : -1
}

/**
 * A number a value of this type can be ordered by, or `undefined` for the types
 * that have none.
 *
 * Text and enum are excluded on purpose: they order through `Intl.Collator`,
 * which is not expressible as a number. For the three that remain, projecting
 * once per row beats re-deriving inside a comparator on every comparison —
 * `compareDate` parses *both* operands per call, so scanning for a minimum
 * re-parses the incumbent once per row.
 *
 * Unorderable values map to `+Infinity`, which is not a convenience: it is what
 * `compareNumber`, `compareDate` and `compareBoolean` already do, each
 * returning `1` when its own operand will not coerce and `0` when neither will.
 * A caller swapping a comparator for a key must not quietly reorder blanks.
 */
export function sortKeyFor(type: ColumnDataType = 'text'): ((value: unknown) => number) | undefined {
  const key = orderKeyFor(type)
  return key && ((value) => key(value) ?? Number.POSITIVE_INFINITY)
}

/**
 * Like `sortKeyFor`, but `undefined` — not `+Infinity` — for a value the type
 * cannot order.
 *
 * Sorting wants those values last, which `+Infinity` says exactly. A caller
 * choosing between them wants the opposite: "sorts last" and "is the maximum"
 * are the same number, so an aggregate reusing the sort key would report a
 * cell its own column cannot read as the largest one. Anything picking a
 * winner rather than an order wants this and skips what it returns nothing for.
 *
 * Not exported from `src/index.ts`: `sortKeyFor` is the public projection and
 * this is the shape the two share.
 */
export function orderKeyFor(
  type: ColumnDataType = 'text',
): ((value: unknown) => number | undefined) | undefined {
  switch (type) {
    case 'number':
      return toNumber
    case 'date':
      return toTime
    case 'boolean':
      return (value) => {
        const parsed = toBoolean(value)
        if (parsed === undefined) return undefined
        return parsed ? 1 : 0
      }
    default:
      return undefined
  }
}

/** The comparator a column type sorts by. */
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

/** A column's value for a row: its accessor, or row[id]. */
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

/** Sort behaviour that is not per-column — currently just blank handling. */
export interface SortOptions {
  /** Blanks sink to the bottom in both directions when true (the default). */
  nullsLast?: boolean
}

/**
 * Stable multi-column sort, projecting each row's sort key once rather than
 * deriving it inside the comparator.
 *
 * Returns a new array; the input is untouched. Blanks are handled outside the
 * direction flip, so an empty cell stays at the bottom whether you sort
 * ascending or descending — flipping them to the top on `desc` is the
 * behaviour users read as a bug.
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
        // Present for number, date and boolean columns that did not override
        // the ordering. See below for why it is worth the extra pass.
        key: column.comparator ? undefined : sortKeyFor(column.type),
      }
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== undefined)

  if (plan.length === 0) return rows.slice()

  /*
   * Read every sort cell up front, one column-shaped array per plan entry.
   *
   * The comparator runs O(n log n) times but there are only n cells, so
   * anything derived inside it is derived tens of times per row. That was the
   * whole cost of sorting a date column: `compareDate` parses both operands on
   * every call, so 10 000 rows cost roughly 270 000 date parses instead of
   * 10 000. Accessor columns paid the same way — `readValue` ran per
   * comparison, not per row.
   *
   * Column-shaped rather than row-shaped on purpose: one array per sort key
   * beats one small array per row, which for a single-column sort would mean
   * allocating an array per row to hold one value.
   */
  const values = plan.map((entry) => {
    const column = new Array<unknown>(rows.length)
    for (let i = 0; i < rows.length; i += 1) column[i] = readValue(rows[i]!, entry.column)
    return column
  })

  const blanks = values.map((column) => {
    const flags = new Array<boolean>(column.length)
    for (let i = 0; i < column.length; i += 1) flags[i] = isBlank(column[i])
    return flags
  })

  const keys = plan.map((entry, planIndex) => {
    const project = entry.key
    if (!project) return undefined
    const column = values[planIndex]!
    const projected = new Array<number>(column.length)
    for (let i = 0; i < column.length; i += 1) projected[i] = project(column[i])
    return projected
  })

  // Indices rather than decorated objects: the original position is the index
  // itself, so ties keep their incoming order with nothing to carry around.
  const order = new Array<number>(rows.length)
  for (let i = 0; i < rows.length; i += 1) order[i] = i

  order.sort((left, right) => {
    for (let planIndex = 0; planIndex < plan.length; planIndex += 1) {
      const aBlank = blanks[planIndex]![left]!
      const bBlank = blanks[planIndex]![right]!
      if (aBlank || bBlank) {
        if (aBlank && bBlank) continue
        if (nullsLast) return aBlank ? 1 : -1
        return aBlank ? -1 : 1
      }

      const { direction, compare } = plan[planIndex]!
      const projected = keys[planIndex]
      let result: number
      if (projected) {
        const a = projected[left]!
        const b = projected[right]!
        // Subtraction would yield NaN for two unorderable values, which both
        // map to +Infinity; comparing instead makes that case the tie it is.
        result = a === b ? 0 : a < b ? -1 : 1
      } else {
        result = compare(values[planIndex]![left], values[planIndex]![right])
      }
      if (result !== 0) return result * direction
    }
    return left - right
  })

  const sorted = new Array<TRow>(rows.length)
  for (let i = 0; i < order.length; i += 1) sorted[i] = rows[order[i]!]!
  return sorted
}
