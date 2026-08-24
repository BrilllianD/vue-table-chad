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
import { cursorMoveFor, type CellPosition } from '../../core/cellCursor'
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
}>()

const context = useTableContext<TRow>()
const columns = computed(() => props.columns ?? context?.visibleColumns.value ?? [])

const table = ref<HTMLTableElement | null>(null)

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
  // Already there when the move came from a click or from the editor's own
  // focus: re-focusing would fire a second `focusin` and set the cursor to the
  // cell it just came from.
  if (cell && cell !== document.activeElement) cell.focus()
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
    :role="cursor ? 'grid' : undefined"
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
