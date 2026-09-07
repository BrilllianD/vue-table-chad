/**
 * Turning exported text into a downloaded file.
 *
 * Lives in the preset because it reads and writes the DOM, which `core/` may
 * not: `src/core/export.ts` produces the string, and this produces the file.
 * The split is what lets the serialiser be tested without a browser and lets a
 * consumer send the same text somewhere that is not a disk.
 */

/** What `DataTable`'s `export` event carries. */
export interface TableExportPayload {
  /** The serialised rows — every filtered row, in sort order. */
  text: string
  /** The name the file would be saved under. */
  filename: string
  /**
   * Cancels the built-in download.
   *
   * A consumer who calls this is taking over: POSTing the text, naming the
   * file from the query, opening a save dialog. Not calling it leaves the
   * default in place, so the button works with no handler at all.
   */
  preventDefault: () => void
}

/**
 * MIME type for the download.
 *
 * `text/csv` regardless of the delimiter: a TSV is a CSV with a different
 * separator as far as every browser is concerned, and the extension in
 * `filename` is what actually decides how the file opens.
 */
const EXPORT_MIME_TYPE = 'text/csv;charset=utf-8'

/**
 * The UTF-8 byte-order mark, prepended so Excel reads the file as UTF-8.
 *
 * Without it Excel on Windows decodes a CSV in the system codepage and turns
 * every non-ASCII name into mojibake — the single most reported problem with
 * exported CSVs, and one the file itself can fix. Every other reader tolerates
 * the mark.
 */
const BOM = '﻿'

/**
 * Saves text as a file the browser downloads.
 *
 * The object URL is revoked immediately after the click rather than on a timer:
 * the click has already handed the blob to the download, so the URL has done
 * its whole job by the time this returns. Leaving it alive would pin the string
 * in memory for the rest of the session.
 */
export function downloadText(filename: string, text: string): void {
  const blob = new Blob([BOM, text], { type: EXPORT_MIME_TYPE })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  /*
   * Never added to the document. `click()` on a detached anchor triggers the
   * download in every browser this library supports, and appending it would
   * mean a layout-affecting node in the consumer's `<body>` for the length of
   * one synchronous call.
   */
  anchor.click()
  URL.revokeObjectURL(url)
}
