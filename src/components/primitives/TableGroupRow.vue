<script setup lang="ts" generic="TRow">
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
import type { AggregateResult, ResolvedColumn, RowGroup } from '../../core/types'
import TableCell from './TableCell.vue'

const props = withDefaults(
  defineProps<{
    group: RowGroup<TRow>
    /** Columns to lay the aggregates out under. Defaults to the visible ones. */
    columns?: ResolvedColumn<TRow>[]
    /** Extra cells before the first column — the selection checkbox column. */
    leading?: number
    /** Forces the label cell's span, for standalone use outside a table. */
    colspan?: number
    /** Overrides the injected collapse state. */
    collapsed?: boolean
  }>(),
  // Vue casts an absent boolean prop to `false`, which would read as "this
  // group is open" and shadow the injected state for good. The explicit
  // `undefined` keeps "not passed" distinguishable from "passed as false".
  { collapsed: undefined, leading: 0 },
)

const emit = defineEmits<{ toggle: [key: string, collapsed: boolean] }>()

const context = useTableContext()

const collapsed = computed(
  () => props.collapsed ?? context?.grouping?.isCollapsed(props.group.key) ?? false,
)

const columns = computed<ResolvedColumn<TRow>[]>(
  () => props.columns ?? ((context?.visibleColumns.value ?? []) as ResolvedColumn<TRow>[]),
)

/**
 * Where the label stops and the numbers begin: the first column carrying an
 * aggregate. Everything before it is the label's to span.
 */
const firstAggregated = computed(() =>
  columns.value.findIndex((column) => column.aggregate !== undefined),
)

/** The columns that get a cell of their own. Empty when nothing aggregates. */
const trailing = computed(() =>
  firstAggregated.value === -1 ? [] : columns.value.slice(firstAggregated.value),
)

const colspan = computed(() => {
  if (props.colspan !== undefined) return props.colspan
  const spanned = firstAggregated.value === -1 ? columns.value.length : firstAggregated.value
  // At least one: a table whose very first column aggregates has nothing ahead
  // of it, and a colspan of 0 would collapse the label out of existence.
  return Math.max(1, spanned + props.leading)
})

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
      :column="(column as ResolvedColumn<never>)"
    >
      <slot name="aggregate" :column="column" :result="resultFor(column)" :text="textFor(column)">
        {{ textFor(column) }}
      </slot>
    </TableCell>
  </tr>
</template>
