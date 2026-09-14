<script setup lang="ts" generic="TRow extends Record<string, unknown>">
/**
 * A row's detail panel: one `<tr>` spanning every column, rendered directly
 * under the row it belongs to.
 *
 * A second row rather than something inside the row above it, for the reason a
 * group header is its own row — a `<tbody>` of uniform `<tr>`s is what lets the
 * body be one loop, and it is what lets a windowed body count and measure the
 * panel like anything else. `withDetailRows` puts one in the display list; this
 * renders it.
 *
 * It owns the `<td>` and its `colspan`, never the slot, for the same reason
 * `TableRow` owns its leading and trailing cells: a slot handed the cell could
 * knock the `<colgroup>` out of alignment for every row below it.
 *
 * Like every other primitive it works standalone — pass `columns` or a
 * `colspan` and it needs no `<TableRoot>` above it.
 */
import { computed } from 'vue'
import { useTableContext } from '../../core/context'
import type { ResolvedColumn } from '../../core/types'

const props = withDefaults(
  defineProps<{
    /** The row this panel describes — the line directly above it. */
    row: TRow
    /** Columns the panel spans. Defaults to the injected visible ones. */
    columns?: ResolvedColumn<TRow>[]
    /** The parent row's position in the array it came from, for stripe parity. */
    index?: number
    /** The parent row's group depth, so the panel indents with its band. */
    depth?: number
    /** Extra cells before the first column — the selection checkbox column. */
    leading?: number
    /** Extra cells after the last column — the row-actions column. */
    trailingCells?: number
    /**
     * Forces the span outright. The escape hatch for standalone use, where
     * there are no injected columns to count.
     */
    colspan?: number
    /**
     * This row's 1-based position in the whole table, header rows included —
     * `aria-rowindex`. A panel is a row like any other to a screen reader, so a
     * windowed body has to number it too. See `TableRow.rowIndex`.
     */
    rowIndex?: number
  }>(),
  {
    columns: undefined,
    index: 0,
    depth: 0,
    leading: 0,
    trailingCells: 0,
    colspan: undefined,
    rowIndex: undefined,
  },
)

const context = useTableContext<TRow>()

const columns = computed<ResolvedColumn<TRow>[]>(
  () => props.columns ?? ((context?.visibleColumns.value ?? []) as ResolvedColumn<TRow>[]),
)

/**
 * One cell across the whole row, the leading and trailing columns included.
 *
 * Unlike a group header there is nothing to lay out column by column: the
 * panel's content is the consumer's, and it knows nothing about the grid above
 * it. A row one cell short of its `<colgroup>` drags every column after it out
 * of place, so the count has to be the whole width.
 */
const colspan = computed(
  () => props.colspan ?? props.leading + columns.value.length + props.trailingCells,
)
</script>

<template>
  <tr
    class="vt-detail-row"
    :data-depth="depth || undefined"
    :data-parity="index % 2 === 0 ? 'odd' : 'even'"
    :aria-rowindex="rowIndex"
  >
    <td class="vt-detail-cell" :colspan="colspan" :style="{ '--vtc-group-depth': depth }">
      <!--
        The inner element is what keeps a panel readable on a table wider than
        its scroll box: the cell spans every column, so its centre is off to one
        side, and only a sticky child as wide as the scrollport stays on screen.
        The same reasoning as the preset's message rows.
      -->
      <div class="vt-detail-inner">
        <slot :row="row" :index="index" :depth="depth" />
      </div>
    </td>
  </tr>
</template>
