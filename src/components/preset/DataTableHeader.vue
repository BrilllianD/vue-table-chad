<script setup lang="ts" generic="TRow extends Record<string, unknown>">
/**
 * The preset's `<thead>`: the header bands, the sort triggers, the filter
 * popovers and the resize handles, plus the two edge cells the body also has.
 *
 * Internal to the preset — not exported, not a primitive. It takes props rather
 * than reading the context because that is what `DataTable` already resolved
 * from the `TableRoot` slot; going back to the context for the same values
 * would be a second route to them that could disagree.
 *
 * It renders a `<thead>` as its root, so it must stay a direct child of the
 * `<table>` that `TableGrid` renders. That is the one thing a caller has to
 * know about it.
 */
import SortTrigger from '../primitives/SortTrigger.vue'
import TableHeaderCell from '../primitives/TableHeaderCell.vue'
import TableHeaderGroupCell from '../primitives/TableHeaderGroupCell.vue'
import ColumnFilterPopover from '../primitives/ColumnFilterPopover.vue'
import ColumnResizeHandle from '../primitives/ColumnResizeHandle.vue'
import SelectionCheckbox from '../primitives/SelectionCheckbox.vue'
import type { HeaderRow, SelectionMode } from '../../core/types'
import type { UseRowSelection } from '../../core/useRowSelection'
import type { UseCellCursor } from '../../core/useCellCursor'
import type { UseRowGrouping } from '../../core/useRowGrouping'

defineProps<{
  headerRows: HeaderRow<TRow>[]
  /** Whether to render the leading selection cell at all. */
  selectable: boolean
  /**
   * The selection *mode*, untouched. Kept apart from `selectable` because
   * `'single'` renders the column but no header checkbox — there is nothing for
   * "select all on this page" to mean when only one row can be selected.
   */
  selectionMode: boolean | SelectionMode
  selection: UseRowSelection<TRow> | undefined
  cursor: UseCellCursor<TRow> | undefined
  /**
   * The column the pointer is in, so a `<th>` tints with the cells under it.
   * `DataTable` owns the state — this component sees only the id.
   */
  hoverColumnId: string | undefined
  /**
   * The columns the rows are grouped by. A grouped column's header folds its
   * bands instead of sorting, so this decides which control the cell renders —
   * `TableHeaderCell` resolves the same thing from the context for its own
   * click, but a component that takes props may not go around it for the half
   * it renders.
   */
  groupBy: string[]
  grouping: UseRowGrouping<TRow> | undefined
  /** Whether the trailing actions cell is present, so the header can span it. */
  actionsColumn: boolean
  /**
   * Number the header rows for `aria-rowindex`, which is 1-based over the whole
   * table. Only set when the body renders a window: numbering some rows and not
   * others is worse than numbering none.
   */
  numbered?: boolean
}>()
</script>

<template>
  <thead class="vt-thead">
    <tr
      v-for="(headerRow, headerLevel) in headerRows"
      :key="headerLevel"
      :aria-rowindex="numbered ? headerLevel + 1 : undefined"
    >
      <th
        v-if="selectable && headerLevel === 0"
        class="vt-th vt-th-selection"
        scope="col"
        :rowspan="headerRows.length > 1 ? headerRows.length : undefined"
      >
        <SelectionCheckbox
          v-if="selection && selectionMode !== 'single'"
          :checked="selection.headerState.value === 'all'"
          :indeterminate="selection.headerState.value === 'some'"
          label="Select all rows on this page"
          @change="selection.toggleAllOnPage()"
        />
      </th>

      <template v-for="cell in headerRow" :key="cell.key">
        <TableHeaderGroupCell v-if="cell.kind === 'group'" :cell="cell">
          <template #default="bandProps">
            <slot
              name="headerGroup"
              :cell="bandProps.cell"
              :collapsed="bandProps.collapsed"
              :label="bandProps.label"
            >
              <span class="vt-th-label">{{ bandProps.label }}</span>
            </slot>
          </template>
        </TableHeaderGroupCell>

        <TableHeaderCell
          v-else
          :column="cell.column"
          :rowspan="cell.rowspan"
          :depth="cell.depth"
          :cursor="cursor?.isCursorColumn(cell.column.id) ? 'column' : undefined"
          :column-hovered="cell.column.id === hoverColumnId"
          :grouped="groupBy.includes(cell.column.id)"
          :groups-collapsed="grouping?.isColumnCollapsed(cell.column.id)"
        >
          <template #default="cellProps">
            <!--
              A grouped column gets a real `<button>` rather than leaving the
              fold to the cell's click alone: the `<th>` itself takes no focus,
              so without one this level would be unreachable from a keyboard.
              Its click bubbles to the cell, which ignores clicks that came from
              a control inside it, so the fold happens once either way.
            -->
            <button
              v-if="groupBy.includes(cell.column.id)"
              type="button"
              class="vt-th-fold"
              :aria-expanded="!grouping?.isColumnCollapsed(cell.column.id)"
              :aria-label="`${
                grouping?.isColumnCollapsed(cell.column.id) ? 'Expand' : 'Collapse'
              } all ${cell.column.header ?? cell.column.id} groups`"
              @click="cellProps.fold()"
            >
              <span class="vt-group-caret" aria-hidden="true">▸</span>
              <span class="vt-th-label">{{ cell.column.header ?? cell.column.id }}</span>
            </button>

            <SortTrigger
              v-else-if="cell.column.sortable !== false"
              :column-id="cell.column.id"
              :label="cell.column.header ?? cell.column.id"
            />
            <span v-else class="vt-th-label">
              {{ cell.column.header ?? cell.column.id }}
            </span>

            <ColumnFilterPopover
              v-if="cell.column.filterable !== false"
              :column-id="cell.column.id"
              :type="cell.column.type ?? 'text'"
              :label="cell.column.header ?? cell.column.id"
            />
          </template>
          <template #resize>
            <ColumnResizeHandle
              v-if="cell.column.resizable !== false"
              :column-id="cell.column.id"
              :width="cell.column.resolvedWidth"
              :min-width="cell.column.minWidth"
            />
          </template>
        </TableHeaderCell>
      </template>

      <th
        v-if="actionsColumn && headerLevel === 0"
        class="vt-th vt-th-actions"
        scope="col"
        :rowspan="headerRows.length > 1 ? headerRows.length : undefined"
      >
        <span class="vt-visually-hidden">Row actions</span>
      </th>
    </tr>
  </thead>
</template>
