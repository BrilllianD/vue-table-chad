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
import type { UseRowEditing } from '../../core/useRowEditing'
import TableRoot from '../primitives/TableRoot.vue'
import TableGrid from '../primitives/TableGrid.vue'
import TableHeaderCell from '../primitives/TableHeaderCell.vue'
import TableCell from '../primitives/TableCell.vue'
import TableRow from '../primitives/TableRow.vue'
import CellEditor from '../primitives/CellEditor.vue'
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
     * Seeds a supplied `state` too, unless it already carries a grouping.
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
    /** Text shown beside the spinner while the source is fetching. */
    loadingMessage?: string
    /**
     * An editing session from `useRowEditing`. Without one every cell renders
     * read-only, and the table costs exactly what it always did.
     *
     * The session owns the mode, so there is no `editMode` prop here to
     * disagree with it: `'cell'` commits each field as you leave it, `'row'`
     * opens every editable cell at once behind one Save.
     */
    editing?: UseRowEditing<TRow>
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
    loadingMessage: 'Loading…',
  },
)

const emit = defineEmits<{
  'update:query': [query: QueryState]
  'update:selection': [ids: RowId[]]
  'update:columnOrder': [order: string[]]
  rowClick: [row: TRow, event: MouseEvent]
  /** A row reached the server. Carries the row as it now stands. */
  rowSaved: [row: TRow]
  rowSaveError: [row: TRow, error: unknown]
}>()

/**
 * Whether to render the selection column at all. The *mode* is passed to
 * `TableRoot` untouched — collapsing it to a boolean here would silently turn
 * `selectable="single"` into multi-select.
 */
const selectable = computed(() => props.selectable !== false)

/**
 * Row mode needs somewhere to put Save and Cancel, so it takes a trailing
 * column. Cell mode has no such controls — Enter and Escape are the whole
 * interface — so it adds no column and the table keeps the width it had.
 */
const rowMode = computed(() => props.editing?.mode.value === 'row')
const actionsColumn = computed(() => Boolean(props.editing) && rowMode.value)

/** Extra leading and trailing cells, for the rows that have to span them all. */
const extraColumns = computed(() => (selectable.value ? 1 : 0) + (actionsColumn.value ? 1 : 0))

function canEdit(row: TRow, column: ResolvedColumn<TRow>): boolean {
  return props.editing?.isEditable(row, column) ?? false
}

/** Whether *this* cell is the one showing an editor right now. */
function editorOpen(row: TRow, column: ResolvedColumn<TRow>): boolean {
  const session = props.editing
  if (!session) return false
  return session.isEditing(session.getRowId(row), column.id) && canEdit(row, column)
}

/**
 * The message this cell should carry: its own, or the row's when this is the
 * cell the user was last in.
 *
 * A row-level failure has nowhere of its own to go in cell mode — there is no
 * actions column to hold it — so it lands on the cell that caused it rather
 * than disappearing.
 */
function cellError(row: TRow, column: ResolvedColumn<TRow>): string | null {
  const session = props.editing
  if (!session) return null
  const id = session.getRowId(row)
  const field = session.errorFor(id, column.id)
  if (field) return field
  return session.stateFor(id)?.activeColumnId === column.id ? session.errorFor(id) : null
}

function rowState(row: TRow): 'dirty' | 'saving' | 'error' | undefined {
  const session = props.editing
  if (!session) return undefined
  const id = session.getRowId(row)
  const state = session.stateFor(id)
  if (!state) return undefined
  if (state.status === 'saving') return 'saving'
  if (state.status === 'error') return 'error'
  return session.isDirty(id) ? 'dirty' : undefined
}

async function commitRow(row: TRow): Promise<void> {
  const session = props.editing
  if (!session) return
  const saved = await session.commit(row)
  if (saved) emit('rowSaved', row)
  else if (session.stateFor(session.getRowId(row))?.status === 'error') {
    emit('rowSaveError', row, session.errorFor(session.getRowId(row)))
  }
}

/**
 * Leaving a cell finishes the edit — but only in cell mode. With a whole row
 * open, moving between its fields is navigation, not a decision to save.
 */
function onCellBlur(row: TRow): void {
  if (!rowMode.value) void commitRow(row)
}

/**
 * Tab: finish this cell, then open the next editable one along.
 *
 * A failed commit stays put rather than moving on, because moving would hide
 * the message explaining why it failed. In row mode this never runs — every
 * cell is already an editor, so Tab is left to reach the next one itself.
 */
async function moveEdit(
  row: TRow,
  column: ResolvedColumn<TRow>,
  delta: number,
  cols: ResolvedColumn<TRow>[],
): Promise<void> {
  const session = props.editing
  if (!session) return
  const saved = await session.commit(row)
  if (!saved) return
  emit('rowSaved', row)
  const editable = cols.filter((entry) => canEdit(row, entry))
  const index = editable.findIndex((entry) => entry.id === column.id)
  const next = editable[index + delta]
  if (next) session.begin(row, next.id)
}

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
    :editing="editing"
    @update:query="$emit('update:query', $event)"
    @update:selection="$emit('update:selection', $event)"
    @update:column-order="$emit('update:columnOrder', $event)"
  >
    <div
      class="vt-datatable"
      :data-loading="loading || undefined"
      :aria-busy="loading || undefined"
    >
      <!--
        The live region is mounted unconditionally and only its *text* changes.
        A region that appears at the same moment as its content is unreliably
        announced — screen readers watch existing regions for mutations — which
        is what the previous `role="status"` on the `v-if`'d overlay was doing.
      -->
      <span class="vt-visually-hidden" role="status" aria-live="polite">
        {{ loading ? loadingMessage : '' }}
      </span>

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

      <!--
        A frame around the scroll box purely so the loading overlay has an
        anchor that does not scroll. An absolutely positioned child of an
        `overflow: auto` element is laid out against the padding box at scroll
        origin and then translates with the content, so inside `.vt-scroll` the
        scrim and the spinner slid off the top the moment you scrolled past
        `max-height`. Out here they stay over the part you are looking at.
      -->
      <div class="vt-scroll-frame">
        <div class="vt-scroll" :data-sticky="stickyHeader || undefined">
          <TableGrid :columns="cols" :selection-column="selectable" :actions-column="actionsColumn">
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

                <th v-if="actionsColumn" class="vt-th vt-th-actions" scope="col">
                  <span class="vt-visually-hidden">Row actions</span>
                </th>
              </tr>
            </thead>

            <tbody class="vt-tbody">
              <tr v-if="error" class="vt-row-message">
                <td :colspan="cols.length + extraColumns">
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
                <td :colspan="cols.length + extraColumns">
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
                  :trailing-cells="actionsColumn ? 1 : 0"
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
                  :state="rowState(item.row)"
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

                    Three branches rather than one wrapper around the slot: a
                    table with no editing session must not pay an extra DOM node
                    per cell for a feature it is not using, and the read-only
                    branch at the bottom is exactly what it always rendered.
                  -->
                  <template #cell="{ row, column, value, text }">
                    <CellEditor
                      v-if="props.editing && editorOpen(row, column)"
                      :column="column"
                      :row="row"
                      :value="props.editing.inputFor(row, column)"
                      :error="cellError(row, column)"
                      :label="column.header ?? column.id"
                      :trap-tab="!rowMode"
                      :autofocus="props.editing.stateFor(props.editing.getRowId(row))?.activeColumnId === column.id"
                      @update:value="props.editing.setValue(row, column, $event)"
                      @commit="commitRow(row)"
                      @cancel="props.editing.cancel(row)"
                      @blur="onCellBlur(row)"
                      @move="moveEdit(row, column, $event, cols)"
                    >
                      <template v-if="$slots[`editor:${column.id}`]" #default="editorProps">
                        <slot
                          :name="`editor:${column.id}`"
                          v-bind="editorProps"
                          :row="row"
                          :column="column"
                        />
                      </template>
                    </CellEditor>

                    <!--
                      A real button, not a click handler on the cell: a cell you
                      can only reach with a pointer is a cell half the users
                      cannot edit at all.
                    -->
                    <button
                      v-else-if="canEdit(row, column)"
                      type="button"
                      class="vt-cell-trigger"
                      :aria-label="`Edit ${column.header ?? column.id}`"
                      @click="props.editing?.begin(row, column.id)"
                    >
                      <slot
                        :name="`cell:${column.id}`"
                        :row="row"
                        :column="column"
                        :value="value"
                        :text="text"
                      >
                        {{ text }}
                      </slot>
                    </button>

                    <slot
                      v-else
                      :name="`cell:${column.id}`"
                      :row="row"
                      :column="column"
                      :value="value"
                      :text="text"
                    >
                      {{ text }}
                    </slot>
                  </template>

                  <template v-if="actionsColumn" #trailing="{ row }">
                    <slot name="rowActions" :row="row" :state="rowState(row)" :editing="props.editing">
                      <span
                        v-if="props.editing && props.editing.isEditing(props.editing.getRowId(row))"
                        class="vt-row-actions"
                      >
                        <button
                          type="button"
                          class="vt-btn vt-btn-primary"
                          :disabled="rowState(row) === 'saving'"
                          @click="commitRow(row)"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          class="vt-btn"
                          :disabled="rowState(row) === 'saving'"
                          @click="props.editing.cancel(row)"
                        >
                          Cancel
                        </button>
                        <span
                          v-if="props.editing.errorFor(props.editing.getRowId(row))"
                          class="vt-row-error"
                          role="alert"
                          :title="props.editing.errorFor(props.editing.getRowId(row)) ?? undefined"
                        >
                          {{ props.editing.errorFor(props.editing.getRowId(row)) }}
                        </span>
                      </span>
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
                <td v-if="actionsColumn" class="vt-td vt-td-actions" />
              </tr>
            </tfoot>
          </TableGrid>
        </div>

        <div v-if="loading" class="vt-loading-overlay">
          <slot name="loading">
            <span class="vt-loading-pill">
              <!--
                Hidden from assistive tech, not labelled: the word beside it is
                real text now, so an `aria-label` here would be read twice.
              -->
              <span class="vt-spinner" aria-hidden="true" />
              {{ loadingMessage }}
            </span>
          </slot>
        </div>
      </div>

      <ColumnDragGhost v-if="reorderable" />

      <slot name="pagination" :state="tableState" :total="total">
        <TablePagination v-if="showPagination" />
      </slot>
    </div>
  </TableRoot>
</template>
