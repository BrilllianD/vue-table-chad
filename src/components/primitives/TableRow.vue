<script setup lang="ts" generic="TRow extends Record<string, unknown>">
/**
 * One body row: the cells of a row, under the columns that read it.
 *
 * The counterpart to `TableGroupRow`, which existed on its own for a while —
 * the band header was a component while the rows it banded were markup inlined
 * in the preset. Giving rows the same standing is what lets a caller assemble
 * a `<tbody>` from primitives without hand-writing pin offsets and indents.
 *
 * It resolves each cell's value and text **once** per render and hands both to
 * the slot. Inlined in a template, `getCellValue` and `getCellText` were called
 * to build the slot props and `getCellText` called again for the fallback
 * content — and it calls `getCellValue` internally — so every cell paid three
 * accessor reads and two `format()` calls to display one value.
 *
 * Like the other primitives it works with or without a `<TableRoot>` above it:
 * pass `columns` and it needs no context at all.
 */
import { computed } from 'vue'
import { useTableContext } from '../../core/context'
import { readValue } from '../../core/sorting'
import type { ColumnDef, ResolvedColumn } from '../../core/types'
import TableCell from './TableCell.vue'

const props = withDefaults(
  defineProps<{
    row: TRow
    /** Columns to render. Defaults to the injected visible ones. */
    columns?: ResolvedColumn<TRow>[]
    /**
     * The row's position in the array it came from — not in the rendered list,
     * so group headers interleaving cannot upset the stripe parity.
     */
    index?: number
    /** How many group levels sit above this row; `0` when nothing is grouped. */
    depth?: number
    /** Overrides the injected selection state. */
    selected?: boolean
  }>(),
  { index: 0, depth: 0, selected: undefined, columns: undefined },
)

/*
 * Declared rather than left to fall through. An undeclared `@click` would land
 * in `attrs`, and Vue clones a component's root vnode to apply fallthrough
 * attrs — a fresh vnode every render, for a listener that never changes.
 */
const emit = defineEmits<{ click: [event: MouseEvent] }>()

const context = useTableContext<TRow>()

const columns = computed<ResolvedColumn<TRow>[]>(
  () => props.columns ?? ((context?.visibleColumns.value ?? []) as ResolvedColumn<TRow>[]),
)

const selected = computed(
  () => props.selected ?? context?.selection?.value?.isSelected(props.row) ?? false,
)

/**
 * Value and display text per column, resolved once.
 *
 * Falls back to the column's own `accessor`/`format` when there is no context,
 * which is the same pair `TableRoot` implements — a primitive used standalone
 * must not render `[object Object]` where a table would have formatted it.
 */
const cells = computed(() =>
  columns.value.map((column) => {
    const value = context
      ? context.getCellValue(props.row, column)
      : readValue(props.row, column as ColumnDef<TRow>)
    const text = context
      ? context.getCellText(props.row, column)
      : column.format
        ? column.format(value, props.row)
        : value === null || value === undefined
          ? ''
          : String(value)
    return { column, value, text }
  }),
)
</script>

<template>
  <tr
    class="vt-tr"
    :data-selected="selected || undefined"
    :data-parity="index % 2 === 0 ? 'odd' : 'even'"
    @click="emit('click', $event)"
  >
    <!--
      The selection checkbox's cell, when the caller has one to put there. The
      `<td>` belongs to the row rather than to the slot so that a caller cannot
      accidentally break the grid alignment the `<colgroup>` set up.
    -->
    <td v-if="$slots.leading" class="vt-td vt-td-selection">
      <slot name="leading" :row="row" :selected="selected" />
    </td>

    <TableCell
      v-for="(cell, cellIndex) in cells"
      :key="cell.column.id"
      :column="cell.column"
    >
      <!--
        The first cell carries the group indent, so rows sit visibly inside
        their band without an extra spacer column.
      -->
      <span
        v-if="cellIndex === 0 && depth > 0"
        class="vt-group-indent"
        :style="{ '--vt-group-depth': depth }"
        aria-hidden="true"
      />
      <slot
        name="cell"
        :row="row"
        :column="cell.column"
        :value="cell.value"
        :text="cell.text"
        :index="index"
      >
        {{ cell.text }}
      </slot>
    </TableCell>
  </tr>
</template>
