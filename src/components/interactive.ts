/**
 * Elements that own the click that lands on them.
 *
 * Shared by the two components that have to decide whether a click in the body
 * was aimed at a cell or at something inside it: `TableGrid` (which turns a
 * click into an `activate`) and `DataTableBody` (which turns one into a row
 * selection). Both answers must agree about the checkbox, the row-action
 * buttons and an open editor's control, and two copies of the selector would
 * be two answers waiting to drift.
 *
 * It lives here rather than in `core/` because it is only meaningful against a
 * DOM, and here rather than in either component because a primitive may not
 * import from the preset.
 *
 * The `closest` rather than an equality test is the point: a click reports on
 * whatever is innermost — the `<span>` inside a button, the text node's parent
 * inside the label wrapping the checkbox.
 */
export const INTERACTIVE_SELECTOR = 'button, input, select, textarea, a, label, [contenteditable]'

/**
 * An unmodified click of the primary button — the only click that opens an
 * editor.
 *
 * Shared for the same reason the selector above is: `TableGrid` decides whether
 * a click activates a cell and `DataTableBody` decides whether that same click
 * still selects the row, and the two must agree about which clicks are in play.
 * A modified click belongs to selection — `Shift` extends a range, `Ctrl`/`Cmd`
 * toggles a row — so it opens nothing and is left to do its job.
 */
export function isPlainLeftClick(event: MouseEvent): boolean {
  if (event.button !== 0) return false
  return !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey
}
