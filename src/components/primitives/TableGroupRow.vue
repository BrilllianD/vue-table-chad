<script setup lang="ts" generic="TRow extends Record<string, unknown>">
/**
 * A group header row: the expand toggle and the group's label, followed by
 * whatever the grouped rows aggregate to, under the columns those aggregates
 * describe.
 *
 * The label cell spans only as far as the first column declaring an
 * `aggregate` — with none declared it spans the whole row, which is the plain
 * banner this component started as. A group header is a statement about the
 * row band, so splitting it column by column would make the grouped value line
 * up beneath a column it no longer describes; a *number*, though, means
 * nothing unless it sits under its own column.
 *
 * Collapse state lives in the grouping composable rather than here, so the
 * same group stays folded as you page through it — and so `collapsed` can be
 * driven explicitly when this row is used outside a `<TableRoot>`.
 */
import { computed } from 'vue'
import { useTableContext } from '../../core/context'
import { formatAggregate } from '../../core/aggregation'
import type { BandEdge } from '../../core/columnGroups'
import type { AggregateResult, ResolvedColumn, RowGroup } from '../../core/types'
import TableCell from './TableCell.vue'

const props = withDefaults(
  defineProps<{
    group: RowGroup<TRow>
    /** Columns to lay the aggregates out under. Defaults to the visible ones. */
    columns?: ResolvedColumn<TRow>[]
    /**
     * Band boundaries for the aggregate cells, keyed by the column each falls
     * to the right of. Defaults to the injected ones. The spanning label cell
     * gets none: it crosses band boundaries by definition, so a rule on its
     * right edge would sit wherever the aggregates happen to start.
     */
    bandEdges?: ReadonlyMap<string, BandEdge>
    /** Extra cells before the first column — the selection checkbox column. */
    leading?: number
    /**
     * Extra empty cells after the last column — the row-actions column. A group
     * header has no actions of its own, but the grid still has to line up, and
     * a row one cell short of its `<colgroup>` drags every column after it out
     * of place.
     */
    trailingCells?: number
    /** Forces the label cell's span, for standalone use outside a table. */
    colspan?: number
    /** Overrides the injected collapse state. */
    collapsed?: boolean
    /**
     * This row's 1-based position in the whole table, header rows included —
     * `aria-rowindex`. A group header is a row like any other to a screen
     * reader, so a windowed body has to number it too. See `TableRow.rowIndex`.
     */
    rowIndex?: number
  }>(),
  // Vue casts an absent boolean prop to `false`, which would read as "this
  // group is open" and shadow the injected state for good. The explicit
  // `undefined` keeps "not passed" distinguishable from "passed as false".
  { collapsed: undefined, leading: 0, trailingCells: 0 },
)

const emit = defineEmits<{ toggle: [key: string, collapsed: boolean] }>()

const context = useTableContext()

const collapsed = computed(
  () => props.collapsed ?? context?.grouping?.isCollapsed(props.group.key) ?? false,
)

const columns = computed<ResolvedColumn<TRow>[]>(
  () => props.columns ?? ((context?.visibleColumns.value ?? []) as ResolvedColumn<TRow>[]),
)

const bandEdges = computed<ReadonlyMap<string, BandEdge> | undefined>(
  () => props.bandEdges ?? context?.columns.bandEdges.value,
)

/**
 * Where the label stops and the numbers begin: the first column carrying an
 * aggregate. Everything before it is the label's to span.
 */
const firstAggregated = computed(() =>
  columns.value.findIndex((column) => column.aggregate !== undefined),
)

/**
 * Where the label's span ends and the aggregates begin.
 *
 * Both the span and the trailing cells derive from this one index, because the
 * row is only well formed when `colspan + trailing.length` equals
 * `leading + columns.length`. Deriving them separately let the span be clamped
 * without the cells being trimmed to match, which emitted one cell more than
 * the row had columns.
 */
const spanStart = computed(() => {
  if (firstAggregated.value === -1) return columns.value.length
  // The label needs a column of its own. When the very first column aggregates
  // and no leading cell sits ahead of it, the label takes that column and its
  // aggregate goes unshown — a colspan of 0 would collapse the label out of
  // existence, and keeping both the span and the cell would overflow the row.
  return Math.max(firstAggregated.value, 1 - props.leading)
})

/** The columns that get a cell of their own. Empty when nothing aggregates. */
const trailing = computed(() => columns.value.slice(spanStart.value))

const colspan = computed(() =>
  props.colspan !== undefined ? props.colspan : spanStart.value + props.leading,
)

/** The grouped column's own header, so "Engineering" reads as a department. */
const columnLabel = computed(() => {
  const column = context?.columns.all.value.find((entry) => entry.id === props.group.columnId)
  return column?.header ?? props.group.columnId
})

function resultFor(column: ResolvedColumn<TRow>): AggregateResult<TRow> | undefined {
  return props.group.aggregates[column.id]
}

function textFor(column: ResolvedColumn<TRow>): string {
  const result = resultFor(column)
  return result ? formatAggregate(result, column) : ''
}

function toggle(): void {
  const next = !collapsed.value
  context?.grouping?.toggle(props.group.key, next)
  emit('toggle', props.group.key, next)
}
</script>

<template>
  <tr
    class="vt-group-row"
    :data-depth="group.depth"
    :data-collapsed="collapsed || undefined"
    :data-column="group.columnId"
    :aria-rowindex="rowIndex"
  >
    <td class="vt-group-cell" :colspan="colspan" :style="{ '--vt-group-depth': group.depth }">
      <button
        type="button"
        class="vt-group-toggle"
        :aria-expanded="!collapsed"
        :aria-label="`${collapsed ? 'Expand' : 'Collapse'} ${columnLabel} ${group.label}`"
        @click="toggle"
      >
        <!--
          The label sticks to the left edge while the button stays full width:
          a band header describes rows that are still on screen when the table
          is scrolled sideways, so it has to stay readable there too. Sticky on
          the cell itself would do nothing — a spanning cell is already as wide
          as the columns it covers, so it has no room to slide.
        -->
        <span class="vt-group-sticky">
          <span class="vt-group-caret" aria-hidden="true">▸</span>
          <slot :group="group" :collapsed="collapsed" :column-label="columnLabel">
            <span class="vt-group-column">{{ columnLabel }}</span>
            <span class="vt-group-label">{{ group.label }}</span>
            <span class="vt-group-count">{{ group.totalCount }}</span>
          </slot>
        </span>
      </button>
    </td>

    <!--
      Rendered through `TableCell` rather than a bare `<td>`, so pin offsets,
      alignment and column backgrounds keep coming from the one place that owns
      them. A column with no aggregate still gets its cell — the grid has to
      stay aligned whether or not there is a number to put in it.
    -->
    <TableCell
      v-for="column in trailing"
      :key="column.id"
      :column="column"
      :band-edge="bandEdges?.get(column.id)"
    >
      <slot name="aggregate" :column="column" :result="resultFor(column)" :text="textFor(column)">
        {{ textFor(column) }}
      </slot>
    </TableCell>

    <td v-for="n in trailingCells" :key="`trailing-${n}`" class="vt-td vt-td-actions" />
  </tr>
</template>
