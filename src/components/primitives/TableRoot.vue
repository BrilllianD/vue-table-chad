<script setup lang="ts" generic="TRow extends Record<string, unknown>">
import { computed, toRef, watch } from 'vue'
import type { ColumnDef, DataSource, QueryState, RowId, SelectionMode } from '../../core/types'
import { provideTableContext, type TableContext } from '../../core/context'
import { useTableState, type TableState } from '../../core/useTableState'
import { useColumns, type ColumnLayoutState } from '../../core/useColumns'
import { useColumnDnd, type DropSide } from '../../core/useColumnDnd'
import { useRowSelection, defaultRowId } from '../../core/useRowSelection'
import { usePagination } from '../../core/usePagination'
import { readValue } from '../../core/sorting'
import { isEmptyFilter } from '../../core/filters/model'

const props = withDefaults(
  defineProps<{
    columns: ColumnDef<TRow>[]
    /** Local or server — `TableRoot` treats them identically. */
    source: DataSource<TRow>
    /**
     * Reuse an existing state object, or let this component own one. To hoist
     * the query into a store or the URL, build the state yourself with
     * `useTableState({ state: yourRef })` and pass it here.
     */
    state?: TableState
    selectable?: boolean | SelectionMode
    getRowId?: (row: TRow) => RowId
    isRowSelectable?: (row: TRow) => boolean
    initialLayout?: Partial<ColumnLayoutState>
    pageSize?: number
    siblingCount?: number
    /** Turns column drag-to-reorder off for the whole table. */
    reorderable?: boolean
  }>(),
  { selectable: false, pageSize: 25, siblingCount: 1, reorderable: true },
)

const emit = defineEmits<{
  'update:query': [query: QueryState]
  'update:selection': [ids: RowId[]]
  /** Fires on every order change — dragged, keyboard-moved or menu-moved. */
  'update:columnOrder': [order: string[]]
}>()

const state = props.state ?? useTableState({ pageSize: props.pageSize })

const columns = useColumns<TRow>(
  () => props.columns,
  {
    sortFor: state.sortFor,
    sortIndexFor: state.sortIndexFor,
    // Same test `ActiveFilters` uses, so the header's funnel and the chip row
    // can never disagree about whether a column is filtered.
    hasFilter: (id) => !isEmptyFilter(state.filters.value[id]),
    initialLayout: props.initialLayout,
  },
)

/**
 * Applies a drop. Landing on a pinned column adopts that column's pin side —
 * without it, dragging into a pinned region would reorder the column but leave
 * it rendered back in the middle group, since `visible` hoists pins to the
 * edges regardless of order.
 */
function applyColumnMove(columnId: string, targetId: string, side: DropSide): void {
  const all = columns.all.value
  const dragged = all.find((column) => column.id === columnId)
  const target = all.find((column) => column.id === targetId)
  if (dragged && target && dragged.pinned !== target.pinned) {
    columns.setPinned(columnId, target.pinned)
  }
  columns.moveColumnTo(columnId, targetId, side)
}

const dnd = useColumnDnd({
  columnIds: () => columns.visible.value.map((column) => column.id),
  move: applyColumnMove,
  canDrag: (columnId) =>
    props.reorderable &&
    columns.all.value.find((column) => column.id === columnId)?.reorderable !== false,
})

const rows = computed(() => props.source.rows.value)

/**
 * Strict identity, for selection: a wrong id there silently corrupts the
 * selection, so a row with no id and no `getRowId` throws rather than guess.
 */
function getRowId(row: TRow): RowId {
  return (props.getRowId ?? defaultRowId<TRow>)(row)
}

/**
 * Identity for `v-for` keys. Honours `getRowId` — the whole point of the prop —
 * but falls back to the row's position rather than throwing, because a missing
 * id is a rendering inconvenience, not a reason to blow up the table.
 */
function getRowKey(row: TRow, index: number): RowId {
  if (props.getRowId) return props.getRowId(row)
  return (row as { id?: RowId }).id ?? index
}

// Built unconditionally and gated on the way out: creating it lazily would
// freeze the answer at setup, so flipping `selectable` on later would render a
// checkbox column with nothing behind it.
const rowSelection = useRowSelection<TRow>(rows, () => props.source.total.value, {
  mode: () => (props.selectable === 'single' ? 'single' : 'multiple'),
  getRowId,
  isSelectable: (row) => props.isRowSelectable?.(row) ?? true,
})

const selection = computed(() => (props.selectable === false ? undefined : rowSelection))

const pagination = usePagination(
  () => state.page.value,
  () => state.pageSize.value,
  () => props.source.total.value,
  { siblingCount: () => props.siblingCount, onChange: state.setPage },
)

function getCellValue(row: TRow, column: ColumnDef<TRow>): unknown {
  return readValue(row, column)
}

function getCellText(row: TRow, column: ColumnDef<TRow>): string {
  const value = getCellValue(row, column)
  if (column.format) return column.format(value, row)
  if (value === null || value === undefined) return ''
  return String(value)
}

const context: TableContext<TRow> = {
  state,
  columns,
  // A getter, so swapping the `source` prop (local ⇄ server) reaches everyone
  // holding the context rather than only the pieces that read it reactively.
  get source() {
    return props.source
  },
  selection,
  pagination,
  dnd,
  rows,
  visibleColumns: columns.visible,
  columnDefs: computed(() => props.columns),
  getRowId,
  getCellValue,
  getCellText,
}

provideTableContext(context)

watch(() => state.query.value, (query) => emit('update:query', query), { deep: true })
// Watches the resolved order rather than `layout.order`, which stays empty
// until something reorders and would report nothing for the first move.
watch(
  () => columns.all.value.map((column) => column.id).join(' '),
  () => emit('update:columnOrder', columns.all.value.map((column) => column.id)),
)
watch(
  () => rowSelection.state.value,
  () => {
    if (props.selectable === false) return
    emit('update:selection', rowSelection.selectedIds.value)
  },
  { deep: true },
)

defineExpose({ state, columns, selection, pagination, dnd, source: toRef(props, 'source') })
</script>

<template>
  <!--
    Renders nothing of its own by default: the slot receives everything, so the
    caller decides the markup entirely. `DataTable` is one such caller.
  -->
  <slot
    :rows="rows"
    :columns="columns.visible.value"
    :all-columns="columns.all.value"
    :state="state"
    :selection="selection"
    :pagination="pagination"
    :dnd="dnd"
    :source="source"
    :loading="source.loading.value"
    :error="source.error.value"
    :total="source.total.value"
    :get-row-id="getRowId"
    :get-row-key="getRowKey"
    :get-cell-value="getCellValue"
    :get-cell-text="getCellText"
  />
</template>
