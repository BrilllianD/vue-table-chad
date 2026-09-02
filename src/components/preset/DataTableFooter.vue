<script setup lang="ts" generic="TRow extends Record<string, unknown>">
/**
 * The preset's `<tfoot>`: one row aggregating every loaded row, using the same
 * per-column `aggregate` declarations the group rows use.
 *
 * Internal to the preset, and props-driven for the reason `DataTableHeader` is.
 * It renders a `<tfoot>` as its root, so it belongs directly inside the
 * `<table>` — after `</tbody>`, which is where HTML wants it.
 */
import TableCell from '../primitives/TableCell.vue'
import { formatAggregate } from '../../core/aggregation'
import type { BandEdge } from '../../core/columnGroups'
import type { AggregateResult, ResolvedColumn } from '../../core/types'

const props = defineProps<{
  columns: ResolvedColumn<TRow>[]
  /**
   * Band boundaries, so the footer carries the rules down to the bottom of the
   * table. Passed rather than injected because this is the one place a bare
   * `TableCell` is rendered with no row component above it to resolve them.
   */
  bandEdges: ReadonlyMap<string, BandEdge>
  aggregates: Record<string, AggregateResult<TRow>>
  /**
   * The column the pointer is in, so the footer cell tints with the header and
   * the body cells above it. `DataTable` owns the state — this component sees
   * only the id, exactly as `DataTableHeader` does.
   */
  hoverColumnId: string | undefined
  /** Text for the leading cell, where it displaces no number of its own. */
  label: string
  /** Whether the leading selection cell is present, so the row spans it. */
  selectable: boolean
  /** Whether the trailing actions cell is present, for the same reason. */
  actionsColumn: boolean
}>()

function footerText(column: ResolvedColumn<TRow>): string {
  const result = props.aggregates[column.id]
  return result ? formatAggregate(result, column) : ''
}
</script>

<template>
  <tfoot class="vt-tfoot">
    <tr class="vt-footer-row">
      <td v-if="selectable" class="vt-td vt-td-selection" />
      <TableCell
        v-for="(column, columnIndex) in columns"
        :key="column.id"
        :column="column"
        :band-edge="bandEdges.get(column.id)"
        :column-hovered="column.id === hoverColumnId"
      >
        <slot
          name="footer"
          :column="column"
          :result="aggregates[column.id]"
          :text="footerText(column)"
        >
          <!--
            The label only appears where it displaces nothing: a first column
            that aggregates shows its own number instead.
          -->
          <span v-if="columnIndex === 0 && !aggregates[column.id]">
            {{ label }}
          </span>
          <template v-else>{{ footerText(column) }}</template>
        </slot>
      </TableCell>
      <td v-if="actionsColumn" class="vt-td vt-td-actions" />
    </tr>
  </tfoot>
</template>
