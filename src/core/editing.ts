/**
 * The write half of a column, as pure functions.
 *
 * `readValue` in `sorting.ts` is how the table reads a cell; everything here is
 * its counterpart — how an edited value is coerced, checked, and written back.
 * No reactivity and no components, so the same rules hold whether a cell is
 * edited through `useRowEditing` or by a caller doing it by hand.
 *
 * Two conventions run through the file:
 *
 *   - **`undefined` means "will not parse"; `null` means "blank".** The
 *     coercions in `utils/values.ts` already draw that line, and validation
 *     depends on it — clearing a cell is a legitimate edit, typing `"abc"` into
 *     a number column is not.
 *   - **Nothing mutates a row.** `applyCellValue` returns the next row, because
 *     rows are handed out by reference and a caller's `shallowRef` only notices
 *     a replacement.
 */
import type { CellEditorKind, ColumnDataType, ColumnDef, RowId } from './types'
import { isBlank, toBoolean, toIsoDate, toNumber } from './utils/values'

/** Error messages by column id — the shape both validators and a rejected save produce. */
export type CellErrors = Record<string, string>

/** What a draft would produce: per-field errors, a row-level error, and the row itself. */
export interface DraftValidation<TRow> {
  fields: CellErrors
  /** A cross-field failure, or a save rejection that named no field. */
  error: string | null
  /**
   * The row as it would be if this draft were applied. `undefined` whenever a
   * field failed — a value that did not survive validation must never be
   * written, not even into a throwaway copy.
   */
  nextRow: TRow | undefined
}

/** Shown when a cell holds something its column's `type` cannot read. */
const PARSE_MESSAGES: Record<ColumnDataType, string> = {
  text: 'Not valid text',
  number: 'Not a number',
  date: 'Not a date',
  boolean: 'Not a yes or no',
  enum: 'Not one of the options',
}

/** Shown when a `required` column is left blank. */
export const REQUIRED_MESSAGE = 'Required'

/**
 * Which control edits this column: its own `editor`, or one derived from
 * `type`.
 *
 * An `enum` only earns a select if it declared `options`; without them there is
 * no list to offer, and a text box beats an empty dropdown.
 */
export function editorFor<TRow>(column: ColumnDef<TRow>): CellEditorKind {
  if (column.editor) return column.editor
  switch (column.type) {
    case 'number':
      return 'number'
    case 'date':
      return 'date'
    case 'boolean':
      return 'checkbox'
    case 'enum':
      return column.options && column.options.length > 0 ? 'select' : 'text'
    default:
      return 'text'
  }
}

/**
 * Whether this column accepts an edit to this row.
 *
 * Editing is the one column capability that defaults to **off**. `sortable`,
 * `filterable` and the rest default to on because they cannot damage anything;
 * a table that silently became writable would be a different promise.
 */
export function isColumnEditable<TRow>(column: ColumnDef<TRow>, row: TRow): boolean {
  const flag = column.editable
  if (typeof flag === 'function') return flag(row)
  return flag === true
}

/**
 * Coerces what an editor produced into the column's own value: `column.parse`,
 * or the coercion its `type` implies.
 *
 * Blank input becomes `null` rather than a failure — the same collapse
 * `toFilterValue` makes, so a cleared cell and an absent one read alike.
 * `undefined` comes back only when a non-blank value will not coerce at all.
 */
export function parseCellInput<TRow>(
  input: unknown,
  column: ColumnDef<TRow>,
  row: TRow,
): unknown {
  if (column.parse) return column.parse(input, row)
  if (isBlank(input)) return null

  switch (column.type) {
    case 'number':
      return toNumber(input)
    case 'date':
      return toIsoDate(input)
    case 'boolean':
      return toBoolean(input)
    case 'enum':
      // A `<select>` hands back a string even when the options are numbers, so
      // the declared option wins over the string that stood in for it.
      return column.options?.find((option) => String(option) === String(input)) ?? String(input)
    default:
      return typeof input === 'string' ? input : String(input)
  }
}

/**
 * One cell's error message, or `null` when the value is acceptable.
 *
 * Runs against the value `parseCellInput` produced, so a validator never has to
 * repeat the coercion — and never sees a raw input string where it expects a
 * number.
 */
export function validateCell<TRow>(
  value: unknown,
  column: ColumnDef<TRow>,
  row: TRow,
): string | null {
  if (value === undefined) return PARSE_MESSAGES[column.type ?? 'text']
  if (column.required && isBlank(value)) return REQUIRED_MESSAGE
  if (
    column.type === 'enum' &&
    column.options &&
    column.options.length > 0 &&
    !isBlank(value) &&
    !column.options.includes(value as never)
  ) {
    return PARSE_MESSAGES.enum
  }
  return column.validate?.(value, row) ?? null
}

/**
 * Writes one value into a row, returning the next row.
 *
 * Throws for a column that reads through an `accessor` and never said how to
 * write: a function cannot be inverted, and guessing `row[id]` would put the
 * value somewhere nothing reads it back from.
 */
export function applyCellValue<TRow>(row: TRow, column: ColumnDef<TRow>, value: unknown): TRow {
  if (column.setValue) return column.setValue(row, value)
  if (column.accessor) {
    throw new Error(
      `[vue-table-chad] Column "${column.id}" reads through an accessor, so the table cannot work out ` +
        'where to write an edit back. Give the column a `setValue`.',
    )
  }
  return { ...(row as Record<string, unknown>), [column.id]: value } as TRow
}

/** Looks a column up, or says which id had no column rather than dropping the field. */
function columnFor<TRow>(columns: ColumnDef<TRow>[], columnId: string): ColumnDef<TRow> {
  const column = columns.find((entry) => entry.id === columnId)
  if (!column) {
    throw new Error(`[vue-table-chad] No column "${columnId}" to write an edited value into.`)
  }
  return column
}

/**
 * Applies a whole patch — values keyed by column id — and returns the next row.
 *
 * Each write feeds the next, so a `setValue` reading its own row sees the
 * edits already made rather than the original.
 */
export function applyPatch<TRow>(
  row: TRow,
  patch: Record<string, unknown>,
  columns: ColumnDef<TRow>[],
): TRow {
  let next = row
  for (const [columnId, value] of Object.entries(patch)) {
    next = applyCellValue(next, columnFor(columns, columnId), value)
  }
  return next
}

/**
 * Checks a whole draft: every changed field, then the cross-field rule.
 *
 * The order is load-bearing. Field rules run first and stop the draft dead if
 * any fails, so the row-level rule is only ever handed a row it could actually
 * be given — and so a broken value is never written, even into the copy the
 * cross-field rule would inspect.
 */
export function validateDraft<TRow>(
  row: TRow,
  draft: Record<string, unknown>,
  columns: ColumnDef<TRow>[],
  rowValidate?: (next: TRow, draft: Record<string, unknown>) => CellErrors | string | null,
): DraftValidation<TRow> {
  const fields: CellErrors = {}

  for (const [columnId, value] of Object.entries(draft)) {
    const message = validateCell(value, columnFor(columns, columnId), row)
    if (message) fields[columnId] = message
  }

  if (Object.keys(fields).length > 0) return { fields, error: null, nextRow: undefined }

  const nextRow = applyPatch(row, draft, columns)
  const result = rowValidate?.(nextRow, draft) ?? null

  if (typeof result === 'string') return { fields, error: result, nextRow: undefined }
  if (result && Object.keys(result).length > 0) {
    return { fields: { ...result }, error: null, nextRow: undefined }
  }
  return { fields, error: null, nextRow }
}

/**
 * A copy of `rows` with one row swapped for its saved version, matched by id.
 *
 * The copy is the point: row arrays belong in a `shallowRef`, which notices a
 * reassignment and nothing else, so writing the row in place would leave the
 * table showing the old one. Returns the original array untouched when the id
 * is not there — nothing changed, so nothing should re-render.
 */
export function replaceRowIn<TRow>(
  rows: TRow[],
  next: TRow,
  getRowId: (row: TRow) => RowId,
): TRow[] {
  const id = getRowId(next)
  const index = rows.findIndex((row) => getRowId(row) === id)
  if (index === -1) return rows
  const copy = rows.slice()
  copy[index] = next
  return copy
}
