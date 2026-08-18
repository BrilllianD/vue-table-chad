<script setup lang="ts" generic="TRow extends Record<string, unknown>">
/**
 * The batteries-included preset — and deliberately NOT a god component.
 *
 * It owns no logic of its own: every capability here comes from a primitive or
 * a composable, and every region is a named slot. If it does not fit, drop to
 * `<TableRoot>` and assemble the same pieces differently (see
 * `playground/src/examples/ComposedCustom.vue`).
 */
import { computed } from 'vue'
import type { ColumnDef, DataSource, QueryState, RowId, SelectionMode } from '../../core/types'
import type { ColumnLayoutState } from '../../core/useColumns'
import type { ColumnLayoutField } from '../../core/columnStorage'
import type { TableState } from '../../core/useTableState'
import TableRoot from '../primitives/TableRoot.vue'
import TableGrid from '../primitives/TableGrid.vue'
import TableHeaderCell from '../primitives/TableHeaderCell.vue'
import TableCell from '../primitives/TableCell.vue'
import TableGroupRow from '../primitives/TableGroupRow.vue'
import SortTrigger from '../primitives/SortTrigger.vue'
import ColumnFilterPopover from '../primitives/ColumnFilterPopover.vue'
import ColumnResizeHandle from '../primitives/ColumnResizeHandle.vue'
import ColumnDragGhost from '../primitives/ColumnDragGhost.vue'
import ColumnVisibilityMenu from '../primitives/ColumnVisibilityMenu.vue'
import RowGroupMenu from '../primitives/RowGroupMenu.vue'
import ActiveFilters from '../primitives/ActiveFilters.vue'
import TablePagination from '../primitives/TablePagination.vue'
import SelectionCheckbox from '../primitives/SelectionCheckbox.vue'

// The preset owns the preset theme, so `DataTable` is styled out of the box
// while the primitives stay CSS-free.
import './table.css'

const props = withDefaults(
  defineProps<{
    columns: ColumnDef<TRow>[]
    source: DataSource<TRow>
    state?: TableState
    selectable?: boolean | SelectionMode
    getRowId?: (row: TRow) => RowId
    isRowSelectable?: (row: TRow) => boolean
    initialLayout?: Partial<ColumnLayoutState>
    /** Remembers the column layout across reloads under this `localStorage` key. */
    storageKey?: string
    /** Which parts of the layout to remember. Defaults to visibility, order, widths and pins. */
    storageFields?: ColumnLayoutField[]
    pageSize?: number
    /** Drag column headers to reorder them. */
    reorderable?: boolean
    /**
     * Bands rows by these columns on first render, outermost level first.
     * Ignored when `state` is supplied — seed that state's `initialGroupBy`.
     */
    initialGroupBy?: string[]
    /** Renders every band folded shut until the user opens it. */
    groupsCollapsed?: boolean
    /** Header text for the band holding rows with no value. */
    blankGroupLabel?: string
    showToolbar?: boolean
    showSearch?: boolean
    showColumnsMenu?: boolean
    showGroupMenu?: boolean
    showPagination?: boolean
    stickyHeader?: boolean
    emptyMessage?: string
  }>(),
  {
    selectable: false,
    pageSize: 25,
    reorderable: true,
    showToolbar: true,
    showSearch: true,
    showColumnsMenu: true,
    showGroupMenu: true,
    showPagination: true,
    stickyHeader: true,
    emptyMessage: 'No rows match the current filters.',
  },
)

defineEmits<{
  'update:query': [query: QueryState]
  'update:selection': [ids: RowId[]]
  'update:columnOrder': [order: string[]]
  rowClick: [row: TRow, event: MouseEvent]
}>()

/**
 * Whether to render the selection column at all. The *mode* is passed to
 * `TableRoot` untouched — collapsing it to a boolean here would silently turn
 * `selectable="single"` into multi-select.
 */
const selectable = computed(() => props.selectable !== false)
</script>

<template>
  <TableRoot
    v-slot="{
      rows,
      columns: cols,
      state: tableState,
      selection,
      source: src,
      loading,
      error,
      total,
      displayRows,
      getRowKey: rowKey,
      getCellValue,
      getCellText,
    }"
    :columns="columns"
    :source="source"
    :state="state"
    :selectable="props.selectable"
    :get-row-id="getRowId"
    :is-row-selectable="isRowSelectable"
    :initial-layout="initialLayout"
    :storage-key="storageKey"
    :storage-fields="storageFields"
    :page-size="pageSize"
    :reorderable="reorderable"
    :initial-group-by="initialGroupBy"
    :groups-collapsed="groupsCollapsed"
    :blank-group-label="blankGroupLabel"
    @update:query="$emit('update:query', $event)"
    @update:selection="$emit('update:selection', $event)"
    @update:column-order="$emit('update:columnOrder', $event)"
  >
    <div class="vt-datatable" :data-loading="loading || undefined">
      <div v-if="showToolbar" class="vt-toolbar">
        <slot name="toolbar" :state="tableState" :selection="selection" :total="total">
          <input
            v-if="showSearch"
            class="vt-search"
            type="search"
            placeholder="Search…"
            :value="tableState.globalSearch.value"
            aria-label="Search all columns"
            @input="tableState.setSearch(($event.target as HTMLInputElement).value)"
          />
          <span v-if="selection && !selection.isEmpty.value" class="vt-selection-summary">
            {{ selection.count.value }} selected
            <button type="button" class="vt-btn vt-btn-link" @click="selection.clear()">
              Clear
            </button>
          </span>
          <span class="vt-toolbar-spacer" />
          <RowGroupMenu v-if="showGroupMenu" />
          <ColumnVisibilityMenu v-if="showColumnsMenu" />
        </slot>
      </div>

      <ActiveFilters />

      <!--
        "Select all N matching" — offered only once the visible page is fully
        checked, so it never fires before the user means it.
      -->
      <div
        v-if="selection && selection.headerState.value === 'all' && total > rows.length"
        class="vt-selectall-banner"
      >
        <template v-if="selection.isAllMatching.value">
          All {{ selection.count.value }} rows matching the current filters are selected.
          <button type="button" class="vt-btn vt-btn-link" @click="selection.clear()">
            Clear selection
          </button>
        </template>
        <template v-else>
          All {{ rows.length }} rows on this page are selected.
          <button type="button" class="vt-btn vt-btn-link" @click="selection.selectAllMatching()">
            Select all {{ total }} matching rows
          </button>
        </template>
      </div>

      <div class="vt-scroll" :data-sticky="stickyHeader || undefined">
        <TableGrid :columns="cols" :selection-column="selectable">
          <thead class="vt-thead">
            <tr>
              <th v-if="selectable" class="vt-th vt-th-selection" scope="col">
                <SelectionCheckbox
                  v-if="selection && props.selectable !== 'single'"
                  :checked="selection.headerState.value === 'all'"
                  :indeterminate="selection.headerState.value === 'some'"
                  label="Select all rows on this page"
                  @change="selection.toggleAllOnPage()"
                />
              </th>

              <TableHeaderCell v-for="column in cols" :key="column.id" :column="column">
                <template #default>
                  <SortTrigger
                    v-if="column.sortable !== false"
                    :column-id="column.id"
                    :label="column.header ?? column.id"
                  />
                  <span v-else class="vt-th-label">{{ column.header ?? column.id }}</span>

                  <ColumnFilterPopover
                    v-if="column.filterable !== false"
                    :column-id="column.id"
                    :type="column.type ?? 'text'"
                    :label="column.header ?? column.id"
                  />
                </template>
                <template #resize>
                  <ColumnResizeHandle
                    v-if="column.resizable !== false"
                    :column-id="column.id"
                    :width="column.resolvedWidth ?? 160"
                    :min-width="column.minWidth"
                  />
                </template>
              </TableHeaderCell>
            </tr>
          </thead>

          <tbody class="vt-tbody">
            <tr v-if="error" class="vt-row-message">
              <td :colspan="cols.length + (selectable ? 1 : 0)">
                <slot name="error" :error="error" :refresh="src.refresh">
                  <span class="vt-error">
                    Failed to load data.
                    <button type="button" class="vt-btn vt-btn-link" @click="src.refresh()">
                      Retry
                    </button>
                  </span>
                </slot>
              </td>
            </tr>

            <tr v-else-if="rows.length === 0 && !loading" class="vt-row-message">
              <td :colspan="cols.length + (selectable ? 1 : 0)">
                <slot name="empty">{{ emptyMessage }}</slot>
              </td>
            </tr>

            <!--
              Iterates the display list, not `rows`: with nothing grouped the
              two hold the same rows in the same order, so there is only one
              code path to keep correct.
            -->
            <template v-for="item in displayRows" v-else>
              <TableGroupRow
                v-if="item.kind === 'group'"
                :key="`group:${item.group.key}`"
                :group="item.group"
                :colspan="cols.length + (selectable ? 1 : 0)"
              >
                <template #default="slotProps">
                  <slot name="group" v-bind="slotProps">
                    <span class="vt-group-column">{{ slotProps.columnLabel }}</span>
                    <span class="vt-group-label">{{ slotProps.group.label }}</span>
                    <span class="vt-group-count">{{ slotProps.group.totalCount }}</span>
                  </slot>
                </template>
              </TableGroupRow>

              <tr
                v-else
                :key="rowKey(item.row, item.index)"
                class="vt-tr"
                :data-selected="selection?.isSelected(item.row) || undefined"
                :data-parity="item.index % 2 === 0 ? 'odd' : 'even'"
                @click="$emit('rowClick', item.row, $event)"
              >
                <td v-if="selectable" class="vt-td vt-td-selection">
                  <SelectionCheckbox
                    v-if="selection"
                    :checked="selection.isSelected(item.row)"
                    :disabled="!selection.isSelectable(item.row)"
                    label="Select row"
                    @change="
                      (_checked, event) =>
                        event.shiftKey ? selection.toggleRange(item.row) : selection.toggle(item.row)
                    "
                  />
                </td>

                <TableCell
                  v-for="(column, columnIndex) in cols"
                  :key="column.id"
                  :column="column"
                >
                  <!--
                    The first cell carries the group indent, so rows sit visibly
                    inside their band without an extra spacer column.
                  -->
                  <span
                    v-if="columnIndex === 0 && item.depth > 0"
                    class="vt-group-indent"
                    :style="{ '--vt-group-depth': item.depth }"
                    aria-hidden="true"
                  />
                  <!-- Reads through the column's accessor and format, not row[id]. -->
                  <slot
                    :name="`cell:${column.id}`"
                    :row="item.row"
                    :column="column"
                    :value="getCellValue(item.row, column)"
                    :text="getCellText(item.row, column)"
                  >
                    {{ getCellText(item.row, column) }}
                  </slot>
                </TableCell>
              </tr>
            </template>
          </tbody>
        </TableGrid>

        <div v-if="loading" class="vt-loading-overlay" role="status" aria-live="polite">
          <slot name="loading"><span class="vt-spinner" aria-label="Loading" /></slot>
        </div>
      </div>

      <ColumnDragGhost v-if="reorderable" />

      <slot name="pagination" :state="tableState" :total="total">
        <TablePagination v-if="showPagination" />
      </slot>
    </div>
  </TableRoot>
</template>
