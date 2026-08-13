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
import type { TableState } from '../../core/useTableState'
import TableRoot from '../primitives/TableRoot.vue'
import TableGrid from '../primitives/TableGrid.vue'
import TableHeaderCell from '../primitives/TableHeaderCell.vue'
import TableCell from '../primitives/TableCell.vue'
import SortTrigger from '../primitives/SortTrigger.vue'
import ColumnFilterPopover from '../primitives/ColumnFilterPopover.vue'
import ColumnResizeHandle from '../primitives/ColumnResizeHandle.vue'
import ColumnVisibilityMenu from '../primitives/ColumnVisibilityMenu.vue'
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
    pageSize?: number
    showToolbar?: boolean
    showSearch?: boolean
    showColumnsMenu?: boolean
    showPagination?: boolean
    stickyHeader?: boolean
    emptyMessage?: string
  }>(),
  {
    selectable: false,
    pageSize: 25,
    showToolbar: true,
    showSearch: true,
    showColumnsMenu: true,
    showPagination: true,
    stickyHeader: true,
    emptyMessage: 'No rows match the current filters.',
  },
)

defineEmits<{
  'update:query': [query: QueryState]
  'update:selection': [ids: RowId[]]
  rowClick: [row: TRow, event: MouseEvent]
}>()

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
      getCellValue,
      getCellText,
    }"
    :columns="columns"
    :source="source"
    :state="state"
    :selectable="selectable ? selectable : false"
    :get-row-id="getRowId"
    :is-row-selectable="isRowSelectable"
    :initial-layout="initialLayout"
    :page-size="pageSize"
    @update:query="$emit('update:query', $event)"
    @update:selection="$emit('update:selection', $event)"
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

            <tr
              v-for="row in rows"
              v-else
              :key="String((row as Record<string, unknown>).id ?? JSON.stringify(row))"
              class="vt-tr"
              :data-selected="selection?.isSelected(row) || undefined"
              @click="$emit('rowClick', row, $event)"
            >
              <td v-if="selectable" class="vt-td vt-td-selection">
                <SelectionCheckbox
                  v-if="selection"
                  :checked="selection.isSelected(row)"
                  :disabled="!selection.isSelectable(row)"
                  label="Select row"
                  @change="
                    (_checked, event) =>
                      event.shiftKey ? selection.toggleRange(row) : selection.toggle(row)
                  "
                />
              </td>

              <TableCell v-for="column in cols" :key="column.id" :column="column">
                <!-- Reads through the column's accessor and format, not row[id]. -->
                <slot
                  :name="`cell:${column.id}`"
                  :row="row"
                  :column="column"
                  :value="getCellValue(row, column)"
                  :text="getCellText(row, column)"
                >
                  {{ getCellText(row, column) }}
                </slot>
              </TableCell>
            </tr>
          </tbody>
        </TableGrid>

        <div v-if="loading" class="vt-loading-overlay" role="status" aria-live="polite">
          <slot name="loading"><span class="vt-spinner" aria-label="Loading" /></slot>
        </div>
      </div>

      <slot name="pagination" :state="tableState" :total="total">
        <TablePagination v-if="showPagination" />
      </slot>
    </div>
  </TableRoot>
</template>
