<script setup lang="ts" generic="TRow extends Record<string, unknown>">
/**
 * The batteries-included preset: every region a named slot, and the one
 * component that imports the default stylesheet. Deliberately NOT a god
 * component.
 *
 * It owns no logic of its own: every capability here comes from a primitive or
 * a composable, and every region is a named slot. If it does not fit, drop to
 * `<TableRoot>` and assemble the same pieces differently (see
 * `playground/src/examples/ComposedCustom.vue`).
 */
import { computed } from 'vue'
import { formatAggregate } from '../../core/aggregation'
import type {
  AggregateResult,
  ColumnDef,
  DataSource,
  GroupMode,
  QueryState,
  ResolvedColumn,
  RowId,
  SelectionMode,
} from '../../core/types'
import type { ColumnLayoutState } from '../../core/useColumns'
import type { ColumnLayoutField } from '../../core/columnStorage'
import type { TableState } from '../../core/useTableState'
import TableRoot from '../primitives/TableRoot.vue'
import TableGrid from '../primitives/TableGrid.vue'
import TableHeaderCell from '../primitives/TableHeaderCell.vue'
import TableCell from '../primitives/TableCell.vue'
import TableRow from '../primitives/TableRow.vue'
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
    /**
     * Who performs the grouping. `'client'` (the default) bands the rows that
     * are already loaded and never touches the query, so nothing refetches and
     * no server hears about it. `'server'` puts it in `QueryState.groupBy` for
     * the data source to perform, keeping groups whole across pages.
     */
    groupMode?: GroupMode
    /** Renders every band folded shut until the user opens it. */
    groupsCollapsed?: boolean
    /** Header text for the band holding rows with no value. */
    blankGroupLabel?: string
    /**
     * Renders a footer row aggregating every loaded row, using the same
     * per-column `aggregate` declarations the group rows use. Off by default:
     * declaring an aggregate should not add a row nobody asked for.
     */
    showFooter?: boolean
    /** Text for the footer's leading cell. */
    footerLabel?: string
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
    showFooter: false,
    footerLabel: 'Total',
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

function footerText(
  aggregates: Record<string, AggregateResult<TRow>>,
  column: ResolvedColumn<TRow>,
): string {
  const result = aggregates[column.id]
  return result ? formatAggregate(result, column) : ''
}
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
      overallAggregates,
      getRowKey: rowKey,
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
    :group-mode="groupMode"
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
                :columns="cols"
                :leading="selectable ? 1 : 0"
              >
                <template #default="slotProps">
                  <slot name="group" v-bind="slotProps">
                    <span class="vt-group-column">{{ slotProps.columnLabel }}</span>
                    <span class="vt-group-label">{{ slotProps.group.label }}</span>
                    <span class="vt-group-count">{{ slotProps.group.totalCount }}</span>
                  </slot>
                </template>
                <template #aggregate="slotProps">
                  <slot name="groupAggregate" v-bind="slotProps">{{ slotProps.text }}</slot>
                </template>
              </TableGroupRow>

              <TableRow
                v-else
                :key="rowKey(item.row, item.index)"
                :row="item.row"
                :columns="cols"
                :index="item.index"
                :depth="item.depth"
                :selected="selection ? selection.isSelected(item.row) : false"
                @click="$emit('rowClick', item.row, $event)"
              >
                <template v-if="selectable" #leading>
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
                </template>

                <!--
                  Forwards each cell to this component's own `cell:<id>` slot,
                  so the preset's slot API is exactly what it always was while
                  the row markup lives in the primitive.
                -->
                <template #cell="{ row, column, value, text }">
                  <slot
                    :name="`cell:${column.id}`"
                    :row="row"
                    :column="column"
                    :value="value"
                    :text="text"
                  >
                    {{ text }}
                  </slot>
                </template>
              </TableRow>
            </template>
          </tbody>

          <!--
            After `</tbody>`, which is where HTML wants it, and inside the same
            `TableGrid` slot — the grid is a bare `<slot />`, so a footer needs
            nothing from it but the `<colgroup>` widths it already applies.
          -->
          <tfoot v-if="showFooter" class="vt-tfoot">
            <tr class="vt-footer-row">
              <td v-if="selectable" class="vt-td vt-td-selection" />
              <TableCell v-for="(column, columnIndex) in cols" :key="column.id" :column="column">
                <slot
                  name="footer"
                  :column="column"
                  :result="overallAggregates[column.id]"
                  :text="footerText(overallAggregates, column)"
                >
                  <!--
                    The label only appears where it displaces nothing: a first
                    column that aggregates shows its own number instead.
                  -->
                  <span v-if="columnIndex === 0 && !overallAggregates[column.id]">
                    {{ footerLabel }}
                  </span>
                  <template v-else>{{ footerText(overallAggregates, column) }}</template>
                </slot>
              </TableCell>
            </tr>
          </tfoot>
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
