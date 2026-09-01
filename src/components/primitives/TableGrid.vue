<script setup lang="ts" generic="TRow extends Record<string, unknown>">
/**
 * The `<table>` element itself, plus a `<colgroup>` driven by resolved widths
 * so column sizing survives resizing and pinning without per-cell inline styles.
 *
 * Given a `cursor`, it is also the one place that owns the grid's keyboard and
 * its focus. `useCellCursor` lives in `core/`, which may not touch the DOM, so
 * it holds the position and this component holds the caret — and holding both
 * here rather than in each cell means one delegated listener and one lookup per
 * key press instead of a watcher on every `<td>` on the page.
 *
 * Given no `cursor`, none of that exists: no listeners are bound, no `role` is
 * emitted, and the markup is exactly what it always was. `role="grid"` in
 * particular is opt-in on purpose — applying grid semantics to every table in
 * the library would change what a screen reader announces about tables nobody
 * made navigable.
 *
 * The cells need no `role` of their own. HTML-AAM already maps a `<td>` to
 * `gridcell` rather than `cell` when its table is exposed as a grid, so writing
 * it out per cell would add an attribute to every cell on the page to say what
 * the platform already says.
 */
import { computed, ref, watch } from 'vue'
import { useTableContext } from '../../core/context'
import {
  cursorMoveFor,
  editSeedFor,
  pageMoveFor,
  scrollMoveFor,
  viewportMoveFor,
  type CellPosition,
} from '../../core/cellCursor'
import type { UseCellCursor } from '../../core/useCellCursor'
import type { ResolvedColumn } from '../../core/types'

const props = defineProps<{
  /** Overrides the injected columns, for standalone use. */
  columns?: ResolvedColumn<TRow>[]
  /** Adds a leading narrow column for selection checkboxes. */
  selectionColumn?: boolean
  /** Adds a trailing column for per-row controls, such as Save and Cancel. */
  actionsColumn?: boolean
  layout?: 'auto' | 'fixed'
  /**
   * A cell cursor from `useCellCursor`. Present, the table becomes a
   * `role="grid"` with a roving tabindex and this component drives it from the
   * keyboard. Absent, nothing here runs at all.
   */
  cursor?: UseCellCursor<TRow>
  /**
   * How many rows the table has in total, header rows included —
   * `aria-rowcount`.
   *
   * For a body rendering a window: a screen reader counts the rows in the
   * document, so a virtual table of 100k announces itself as a table of thirty.
   * Left `undefined` when every row is rendered, where the document is already
   * the truth. `-1` is the ARIA way to say "many, and unknown", which is what a
   * source still loading its first page knows.
   */
  rowCount?: number
}>()

const emit = defineEmits<{
  /**
   * The user asked to act on the cursor cell — Enter, F2, or a double-click.
   *
   * Reported rather than acted on, for the reason `CellEditor` reports `blur`
   * rather than deciding what it means: opening an editor needs an editing
   * session, and a grid that assumed one could not be used without one.
   */
  activate: [position: CellPosition, event: Event]
  /**
   * The user asked to turn the page — `Ctrl`/`Cmd` + `←`/`→`. `-1` back, `1` on.
   *
   * Reported rather than acted on, for the reason `activate` is: paging needs
   * a data source and a query, and this component has neither. It also should
   * not decide where the cursor lands afterwards — that depends on rows it has
   * not been given yet.
   */
  pageMove: [pages: number]
  /**
   * The user asked to scroll the table sideways — `Shift` + `←`/`→`. `-1` left,
   * `1` right, one column a press.
   *
   * Reported rather than acted on, and for a plainer reason than `activate` and
   * `page-move` have: the scroll box is an **ancestor** of this component, not
   * part of it. A primitive ships no stylesheet and so has no scroll box of its
   * own — the preset's `.vt-scroll` is the element that overflows, and reaching
   * up the tree to guess at it would make this component depend on markup its
   * caller wrote.
   */
  scrollMove: [columns: number]
  /**
   * The user asked to scroll the table by a screenful — `Ctrl`/`Cmd` + `↑`/`↓`.
   * `-1` up, `1` down. The cursor does not move.
   *
   * Reported rather than acted on, for the same reason `scroll-move` is: the
   * scroll box is an ancestor of this component and belongs to whoever wrote
   * the markup around it.
   */
  viewportMove: [screens: number]
}>()

const context = useTableContext<TRow>()
const columns = computed(() => props.columns ?? context?.visibleColumns.value ?? [])

const table = ref<HTMLTableElement | null>(null)

/**
 * Whether any column renders a `<col>` with no width — a `flex` column, or one
 * a standalone caller left blank.
 *
 * Emitted as an attribute and nothing else, which is all a primitive may do:
 * under fixed table layout a bare `<col>` absorbs whatever space is left over,
 * so a stylesheet that lets the table fill its box wants to know whether there
 * is anything to absorb it. Without one, filling the box would inflate every
 * column instead.
 */
const fill = computed(() => columns.value.some((column) => !column.resolvedWidth))

/**
 * The narrowest the table may be while filling its box, in px.
 *
 * Filling means `width: 100%`, and a box narrower than the widthed columns
 * leaves nothing over — the column that was meant to absorb the slack collapses
 * to zero and its cells vanish. So the table carries a floor: every declared
 * width, plus each leftover column's own `minWidth`. Past that the box scrolls,
 * which is what a table too wide for its space is supposed to do.
 *
 * `undefined` when nothing takes the leftover, because then the table is
 * already exactly its columns and a floor would say the same thing twice. The
 * preset's own selection and actions `<col>`s are not counted: their widths are
 * the stylesheet's, not this component's, and the only cost of leaving them out
 * is that a flexible column gives up their width before the box scrolls.
 */
const minWidth = computed(() => {
  if (!fill.value) return undefined
  let total = 0
  for (const column of columns.value) total += column.resolvedWidth ?? column.minWidth ?? 60
  return `${total}px`
})

/**
 * Escapes a value for use inside a **quoted** attribute selector.
 *
 * `CSS.escape` where there is one; the fallback covers the two characters a
 * quoted string can actually be broken by. Over-escaping is harmless either
 * way — a CSS string honours the same escape sequences an identifier does — so
 * `CSS.escape` turning the row id `1` into `\31 ` still matches
 * `data-row-id="1"`.
 */
function quoteAttr(value: string): string {
  const css = (globalThis as { CSS?: { escape?: (value: string) => string } }).CSS
  return css?.escape ? css.escape(value) : value.replace(/["\\]/g, '\\$&')
}

function cellAt(position: CellPosition): HTMLElement | null {
  return (
    table.value?.querySelector<HTMLElement>(
      `.vt-tr[data-row-id="${quoteAttr(String(position.rowId))}"]` +
        ` > .vt-td[data-column="${quoteAttr(position.columnId)}"]`,
    ) ?? null
  )
}

function focusCursorCell(): void {
  const position = props.cursor?.position.value ?? props.cursor?.tabStop.value
  if (!position) return
  const cell = cellAt(position)
  if (!cell) return
  // Already there when the move came from a click or from the editor's own
  // focus: re-focusing would fire a second `focusin` and set the cursor to the
  // cell it just came from.
  if (cell !== document.activeElement) cell.focus({ preventScroll: true })
  /*
   * The scroll, taken off `focus()` and done here.
   *
   * A browser's focus scroll is "centre if needed", and its idea of *needed* is
   * that the cell be entirely out of view. Measured in Chrome against a table
   * wider than its box: a cell hanging twenty pixels off the right edge is left
   * hanging, and then the next one — fully off — is *centred*, throwing the
   * viewport two columns' worth of scroll to travel one. `nearest` moves the
   * least that works, in both directions, every press.
   *
   * Both routes honour `scroll-margin` and `scroll-padding`, which is what
   * keeps the cell clear of the sticky header and the pinned bands rather than
   * underneath them. Doing the scroll ourselves is what makes that reliable:
   * the cell one press beyond the pin is *partially* covered, which is exactly
   * the case a focus scroll declines to act on.
   *
   * Unconditional, including when the cell already has the focus. That is the
   * case `focusRequests` exists for — holding ArrowDown at the last row asks to
   * be looking at a ring that did not move — and a cell already in view makes
   * `nearest` a no-op anyway.
   *
   * Optional call: jsdom implements neither scrolling nor this method, and a
   * component test moving the cursor should not have to care.
   */
  cell.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
}

/**
 * Only a body cell the cursor manages. A positive test rather than a list of
 * controls to skip: the default editors are input/select/textarea, but the
 * `editor:<id>` slot can render anything at all, and an exclusion list would
 * have to learn about each one. Anything focusable inside a cell owns its own
 * keys — which is also what leaves Enter to `CellEditor`, since with an editor
 * open the event never reaches this line.
 *
 * `event.target`, not `document.activeElement`: the two differ for exactly the
 * keystroke that matters, the Enter that opens an editor and moves focus.
 */
function cursorCell(target: EventTarget | null): HTMLElement | null {
  const element = target as HTMLElement | null
  if (!element || element.tagName !== 'TD') return null
  if (!element.hasAttribute('data-column') || !element.hasAttribute('tabindex')) return null
  return element
}

function onKeydown(event: KeyboardEvent): void {
  const cursor = props.cursor
  if (!cursor || !cursorCell(event.target)) return

  if (event.key === 'Enter' || event.key === 'F2') {
    const position = cursor.position.value ?? cursor.tabStop.value
    if (!position) return
    event.preventDefault()
    emit('activate', position, event)
    return
  }

  // Typing on a closed cell is an activation too, reported through the same
  // event: the key rides along on it, so what the character means — the seed
  // for a new editor — is decoded once, by the component that owns the editing
  // session. A second emit would have to be kept in step with the first about
  // which cell it meant.
  //
  // Nothing below claims a bare printable key or Delete/Backspace, so the
  // position among the decoders is free; it sits here because it belongs with
  // the other activation.
  if (editSeedFor(event) !== undefined) {
    const position = cursor.position.value ?? cursor.tabStop.value
    if (!position) return
    // Claimed even when no editor opens — the cell may be read-only, and the
    // alternative is a space-bar that scrolls the page out from under a table
    // the user was typing into.
    event.preventDefault()
    emit('activate', position, event)
    return
  }

  // Before `cursorMoveFor`, which returns nothing for a modified arrow — the
  // one place all four decoders see the same key press, and only one of them
  // may claim it. The order between these is free; that they all come first is
  // not.
  const pages = pageMoveFor(event)
  if (pages) {
    event.preventDefault()
    emit('pageMove', pages)
    return
  }

  const screens = viewportMoveFor(event)
  if (screens) {
    event.preventDefault()
    emit('viewportMove', screens)
    return
  }

  const columns = scrollMoveFor(event)
  if (columns) {
    // Worth more than the usual here: Firefox spends Shift+arrow on
    // caret-browsing text selection, which would drag a selection across the
    // table behind the scroll.
    event.preventDefault()
    emit('scrollMove', columns)
    return
  }

  const move = cursorMoveFor(event)
  if (!move) return
  // Only once the grid has claimed the key. An unclaimed ArrowLeft must still
  // scroll the box sideways the way it always did.
  event.preventDefault()
  cursor.move(move)
}

/**
 * Focus landing in a body cell puts the cursor there, which is what makes all
 * three ways in work with no code of their own: Tab arrives at the single
 * `tabindex="0"` cell, a click focuses the cell it landed in, and an editor's
 * control focuses the cell around it. `focusin` rather than `focus`, because
 * only the former bubbles.
 */
function onFocusIn(event: FocusEvent): void {
  const cursor = props.cursor
  if (!cursor) return
  const cell = (event.target as HTMLElement | null)?.closest?.('.vt-td[data-column]')
  const columnId = cell?.getAttribute('data-column')
  const key = cell?.closest('.vt-tr')?.getAttribute('data-row-id')
  if (!columnId || key === null || key === undefined) return
  const rowId = cursor.rowIdFor(key)
  if (rowId === undefined) return
  if (cursor.isCursor(rowId, columnId)) return
  // No focus request: focus is already where it belongs, and asking for it
  // again from inside a focus handler is how you build a loop.
  cursor.moveTo({ rowId, columnId })
}

function onDblclick(event: MouseEvent): void {
  const cursor = props.cursor
  if (!cursor) return
  const cell = (event.target as HTMLElement | null)?.closest?.('.vt-td[data-column]')
  const columnId = cell?.getAttribute('data-column')
  const key = cell?.closest('.vt-tr')?.getAttribute('data-row-id')
  if (!columnId || key === null || key === undefined) return
  const rowId = cursor.rowIdFor(key)
  if (rowId === undefined) return
  emit('activate', { rowId, columnId }, event)
}

/**
 * One object of listeners, empty when there is no cursor — a table that did not
 * ask for a keyboard should not pay for three listeners to find out it did not.
 */
const cursorHandlers = computed(() =>
  props.cursor ? { keydown: onKeydown, focusin: onFocusIn, dblclick: onDblclick } : {},
)

/*
 * Two sources, one watcher, two different rules.
 *
 * `focusRequests` changing means a person asked to be somewhere, so focus
 * follows unconditionally. The position changing on its own means the data
 * moved underneath the cursor — a re-sort, a filter — and focus follows only
 * if it was already inside the table, because pulling the caret out of the
 * search box the user is typing in is exactly what nobody wants.
 *
 * `flush: 'post'`, so the roving tabindex has been patched before anything is
 * focused: rewriting `tabindex` under an already-focused element makes Firefox
 * blur it. No `immediate`, so mounting focuses nothing.
 */
watch(
  [() => props.cursor?.focusRequests.value, () => props.cursor?.position.value],
  ([requests], [previousRequests]) => {
    const asked = requests !== previousRequests
    const root = table.value
    if (!asked && !(root && root.contains(document.activeElement))) return
    focusCursorCell()
  },
  { flush: 'post' },
)

defineExpose({ focusCursorCell })
</script>

<template>
  <table
    ref="table"
    class="vt-table"
    :data-layout="layout ?? 'fixed'"
    :data-fill="fill ? '' : undefined"
    :style="minWidth ? { minWidth } : undefined"
    :role="cursor ? 'grid' : undefined"
    :aria-rowcount="rowCount"
    v-on="cursorHandlers"
  >
    <colgroup>
      <col v-if="selectionColumn" class="vt-col-selection" />
      <col
        v-for="column in columns"
        :key="column.id"
        :style="column.resolvedWidth ? { width: `${column.resolvedWidth}px` } : undefined"
      />
      <col v-if="actionsColumn" class="vt-col-actions" />
    </colgroup>
    <slot />
  </table>
</template>
