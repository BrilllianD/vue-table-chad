/**
 * The result set as delimited text — CSV, TSV, or any other separator.
 *
 * Pure, and deliberately no DOM: turning a string into a file needs a `Blob`
 * and an anchor, which is the preset's business. What lives here is the part
 * worth testing without a browser, and the part a consumer can call from a
 * worker or a Node script to build the same file server-side.
 *
 * The text a cell exports is the text it *renders*, `column.format` included,
 * for the reason cell copy already gives: a date the user is looking at should
 * not land in a spreadsheet as an ISO string they never saw. `formatted: false`
 * is the escape hatch for when the file is going to a machine instead.
 */
import { devWarn } from './devWarn'
import { readValue } from './sorting'
import type { LocalDataSource } from './useLocalDataSource'
import type { ColumnDef, DataSource } from './types'

/**
 * A column's displayed text: its formatter, or the value stringified.
 *
 * The single definition of "what this cell reads as", shared by `useTable`'s
 * `getCellText` and by the export below so a file cannot drift from the table
 * it came from. Null and undefined render empty rather than as the words
 * `'null'` and `'undefined'`, which is what `String()` would give.
 */
export function cellText<TRow>(row: TRow, column: ColumnDef<TRow>): string {
  const value = readValue(row, column)
  if (column.format) return column.format(value, row)
  if (value === null || value === undefined) return ''
  return String(value)
}

/** How `toDelimited` writes its text. */
export interface DelimitedOptions {
  /** The field separator. `','` for CSV, `'\t'` for TSV. Defaults to `','`. */
  delimiter?: string
  /** Whether to write the column headers as the first line. Defaults to `true`. */
  header?: boolean
  /**
   * Whether cells go through `column.format`. Defaults to `true`, so the file
   * matches the table; `false` writes the raw value for a machine to read.
   */
  formatted?: boolean
  /**
   * Which columns to write, in this order. Defaults to every column given,
   * in the order given — pass `columns.visible` to export what is on screen.
   */
  columnIds?: string[]
}

/** The default field separator: a comma, so the default is CSV. */
const DEFAULT_DELIMITER = ','

/**
 * RFC 4180 line ending. Fixed rather than an option: `\r\n` is what the
 * standard says and what every spreadsheet accepts, and a `\n`-only file is
 * only ever a size micro-optimization.
 */
const LINE_ENDING = '\r\n'

/**
 * Quotes a field if it has to be, and doubles any quote inside it.
 *
 * The delimiter is a parameter rather than a constant because a TSV holding a
 * comma must *not* be quoted for it — quoting on the wrong character is how a
 * tab-separated file grows quotes no reader asked for. `\r` and `\n` are always
 * dangerous, whatever the delimiter is.
 */
function escapeField(text: string, delimiter: string): string {
  const dangerous =
    text.includes(delimiter) || text.includes('"') || text.includes('\n') || text.includes('\r')
  if (!dangerous) return text
  return `"${text.replaceAll('"', '""')}"`
}

/**
 * Serialises rows to delimited text, RFC 4180 quoted.
 *
 * Reads each cell the way the table renders it, so the file matches the screen.
 * The rows are written exactly as handed over — this function does no
 * filtering, sorting or slicing of its own, which is what lets a caller decide
 * between the result set, a page and a selection without an option for it.
 */
export function toDelimited<TRow>(
  rows: readonly TRow[],
  columns: readonly ColumnDef<TRow>[],
  options: DelimitedOptions = {},
): string {
  const delimiter = options.delimiter ?? DEFAULT_DELIMITER
  const formatted = options.formatted ?? true
  const ids = options.columnIds
  /*
   * Ordered by `columnIds` rather than by `columns`, so the caller's order is
   * the file's order. An id naming no column is dropped and said out loud: a
   * silently missing column is a file that looks complete and is not.
   */
  const chosen = ids
    ? ids.flatMap((id) => {
        const column = columns.find((candidate) => candidate.id === id)
        if (!column) {
          devWarn(`toDelimited: no column with id "${id}" — it is left out of the export`)
          return []
        }
        return [column]
      })
    : [...columns]

  const lines: string[] = []
  if (options.header ?? true) {
    lines.push(
      chosen.map((column) => escapeField(column.header ?? column.id, delimiter)).join(delimiter),
    )
  }
  for (const row of rows) {
    lines.push(
      chosen
        .map((column) => {
          const text = formatted ? cellText(row, column) : rawText(row, column)
          return escapeField(text, delimiter)
        })
        .join(delimiter),
    )
  }
  return lines.join(LINE_ENDING)
}

/** `cellText` with the formatter skipped — the value, stringified. */
function rawText<TRow>(row: TRow, column: ColumnDef<TRow>): string {
  const value = readValue(row, column)
  if (value === null || value === undefined) return ''
  return String(value)
}

/** How `exportRows` reaches the rows to export. */
export interface ExportRowsOptions<TRow> extends DelimitedOptions {
  /**
   * Fetches the whole result set from a remote source.
   *
   * Required for a server or infinite source and ignored for a local one: only
   * the consumer knows how to ask their server for every row rather than a
   * page, and guessing — re-issuing the current query with a huge page size —
   * would be a request the server never agreed to serve.
   */
  fetchAll?: () => Promise<readonly TRow[]>
}

/**
 * The whole result set as delimited text: every filtered row, in sort order.
 *
 * Not the page — a page is a viewport, and a file that held only what was on
 * screen would be a bug report waiting to happen. A local source already keeps
 * the filtered, sorted, unpaged rows in `filteredRows`; a remote one is asked
 * through `fetchAll`.
 *
 * Async because the remote case is, and returning two different types by
 * source would push the branch onto every caller.
 */
export async function exportRows<TRow>(
  source: DataSource<TRow> | LocalDataSource<TRow>,
  columns: readonly ColumnDef<TRow>[],
  options: ExportRowsOptions<TRow> = {},
): Promise<string> {
  const { fetchAll, ...delimited } = options
  const rows = await resolveRows(source, fetchAll)
  return toDelimited(rows, columns, delimited)
}

/**
 * The rows `exportRows` writes, whichever kind of source it was handed.
 *
 * The fallback to `source.rows` is the current page, which is wrong — hence the
 * warning. It is still better than an empty file or a throw: the user asked for
 * their data and gets what the table can actually reach.
 */
async function resolveRows<TRow>(
  source: DataSource<TRow> | LocalDataSource<TRow>,
  fetchAll: (() => Promise<readonly TRow[]>) | undefined,
): Promise<readonly TRow[]> {
  if (fetchAll) return await fetchAll()
  if ('filteredRows' in source) return source.filteredRows.value
  devWarn(
    'exportRows: this source has no filteredRows, so pass fetchAll to export every row — ' +
      'exporting the current page instead',
  )
  return source.rows.value
}
