/**
 * Measures what a column holds, once, so a column that declares no width can be
 * as wide as its contents rather than as wide as a constant.
 *
 * In `preset/` rather than `core/` because it reads the DOM, which `core/` may
 * not — and rather than `primitives/` because it depends on the preset's
 * stylesheet (the `[data-measuring]` rules) and on the preset's markup. A
 * primitive ships no stylesheet, so a primitive must not need one either.
 *
 * The reporting shape is `useVirtualRows`': the composable that can see the
 * layout hands numbers to `useColumns`, which holds them and stays DOM-free.
 */
import { onMounted, watch, type Ref } from 'vue'
import type { UseColumnsResult } from '../../core/useColumns'

export interface AutoColumnWidthOptions<TRow> {
  /** The scroll box the table is rendered inside. */
  box: Ref<HTMLElement | null>
  /** The column layout to report into, once there is one. */
  columns: () => UseColumnsResult<TRow> | undefined
  /**
   * How many rows the body is rendering. Not used as a size — only to tell a
   * table that has content from one that has not been given any yet.
   */
  renderedRows: () => number
}

/**
 * One synchronous probe: set the attribute, read every header cell, take it off
 * again. No Vue render happens in between, so the attribute cannot survive into
 * a patch and no extra frame is spent.
 *
 * The `<th>`s rather than the cells, for the reason `scrollColumns` gives: every
 * column has exactly one `.vt-th[data-column]`, band cells carry
 * `data-column-group` instead and are skipped, and under the probe's own layout
 * a header cell's width *is* the column's — the widest of the header and every
 * rendered body cell.
 *
 * It costs one forced layout, on mount and on the first render that has rows.
 */
function probe(box: HTMLElement): Record<string, number> {
  const table = box.querySelector<HTMLTableElement>('.vt-table')
  if (!table) return {}

  // Changing the table's used width can clamp the scroll position, and the
  // measurement must not move the reader's view.
  const scrollLeft = box.scrollLeft
  table.setAttribute('data-measuring', '')
  const widths: Record<string, number> = {}
  for (const cell of table.querySelectorAll<HTMLElement>('.vt-th[data-column]')) {
    const id = cell.dataset.column
    if (id) widths[id] = cell.getBoundingClientRect().width
  }
  table.removeAttribute('data-measuring')
  box.scrollLeft = scrollLeft
  return widths
}

/**
 * Runs the probe when it can say something new, and not otherwise.
 *
 * Not on scroll, not on a page turn, not on a filter: `setAutoWidths` writes
 * each id once, and re-running with a different window on screen is exactly how
 * a column ends up a different width depending on where you had scrolled to.
 * The trigger is instead "some visible column has no width yet, and there are
 * rows to measure it against" — which is the mount for a table with data, and
 * the first render with rows for one whose source is still loading. A
 * header-only table is left alone deliberately: measuring it would cache the
 * header's width as the column's before a single cell had been seen.
 */
export function useAutoColumnWidth<TRow>(options: AutoColumnWidthOptions<TRow>): {
  remeasure: () => void
} {
  function unmeasured(): string {
    const columns = options.columns()
    if (!columns) return ''
    // The ids still waiting on a number, as a string: a fresh array would be a
    // new value every evaluation and this watcher would run on every render.
    return columns.visible.value
      .filter((column) => column.width === undefined && !column.flex)
      .map((column) => column.id)
      .join(',')
  }

  function measure(): void {
    const columns = options.columns()
    const box = options.box.value
    if (!columns || !box) return
    columns.setAutoWidths(probe(box))
  }

  function measureWhenReady(): void {
    if (options.renderedRows() === 0) return
    measure()
  }

  onMounted(measureWhenReady)
  // Post-flush, so the DOM being measured is the one this change produced.
  watch([unmeasured, options.renderedRows], measureWhenReady, { flush: 'post' })

  return {
    remeasure: () => {
      options.columns()?.clearAutoWidths()
      measure()
    },
  }
}
