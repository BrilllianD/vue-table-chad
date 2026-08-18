<script setup lang="ts" generic="TRow">
/**
 * A group header row: one `<td>` spanning the table, holding the expand
 * toggle, the group's label and its row count.
 *
 * Collapse state lives in the grouping composable rather than here, so the
 * same group stays folded as you page through it — and so `collapsed` can be
 * driven explicitly when this row is used outside a `<TableRoot>`.
 */
import { computed } from 'vue'
import { useTableContext } from '../../core/context'
import type { RowGroup } from '../../core/types'

const props = withDefaults(
  defineProps<{
    group: RowGroup<TRow>
    /** Columns to span. Defaults to every visible column. */
    colspan?: number
    /** Overrides the injected collapse state. */
    collapsed?: boolean
  }>(),
  // Vue casts an absent boolean prop to `false`, which would read as "this
  // group is open" and shadow the injected state for good. The explicit
  // `undefined` keeps "not passed" distinguishable from "passed as false".
  { collapsed: undefined },
)

const emit = defineEmits<{ toggle: [key: string, collapsed: boolean] }>()

const context = useTableContext()

const collapsed = computed(
  () => props.collapsed ?? context?.grouping?.isCollapsed(props.group.key) ?? false,
)

const colspan = computed(() => props.colspan ?? context?.visibleColumns.value.length ?? 1)

/** The grouped column's own header, so "Engineering" reads as a department. */
const columnLabel = computed(() => {
  const column = context?.columns.all.value.find((entry) => entry.id === props.group.columnId)
  return column?.header ?? props.group.columnId
})

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
    <!--
      One spanning cell rather than a cell per column: a group header is a
      statement about the whole row band, and splitting it would make the
      grouped column's value line up under a column it no longer describes.
    -->
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
          as the table, so it has no room to slide.
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
  </tr>
</template>
