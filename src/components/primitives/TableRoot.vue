<script setup lang="ts" generic="TRow extends Record<string, unknown>">
import { computed, toRef, watch } from 'vue'
import type { ColumnDef, DataSource, QueryState, RowId, SelectionMode } from '../../core/types'
import { provideTableContext, type TableContext } from '../../core/context'
import { useTableState, type TableState } from '../../core/useTableState'
import { useColumns, type ColumnLayoutState } from '../../core/useColumns'
import { useRowSelection } from '../../core/useRowSelection'
import { usePagination } from '../../core/usePagination'
import { readValue } from '../../core/sorting'

const props = withDefaults(
  defineProps<{
    columns: ColumnDef<TRow>[]
    /** Local or server — `TableRoot` treats them identically. */
    source: DataSource<TRow>
    /** Reuse an existing state object, or let this component own one. */
    state?: TableState
    /** Hoist the query into a store or the URL. */
    query?: QueryState
    selectable?: boolean | SelectionMode
    getRowId?: (row: TRow) => RowId
    isRowSelectable?: (row: TRow) => boolean
    initialLayout?: Partial<ColumnLayoutState>
    pageSize?: number
    siblingCount?: number
  }>(),
  { selectable: false, pageSize: 25, siblingCount: 1 },
)

const emit = defineEmits<{
  'update:query': [query: QueryState]
  'update:selection': [ids: RowId[]]
}>()

const state = props.state ?? useTableState({ pageSize: props.pageSize })

const columns = useColumns<TRow>(
  () => props.columns,
  {
    sortFor: state.sortFor,
    sortIndexFor: state.sortIndexFor,
    hasFilter: (id) => state.filters.value[id] !== undefined,
    initialLayout: props.initialLayout,
  },
)

const rows = computed(() => props.source.rows.value)

const selection = props.selectable
  ? useRowSelection<TRow>(rows, () => props.source.total.value, {
      mode: props.selectable === true ? 'multiple' : props.selectable,
      getRowId: props.getRowId,
      isSelectable: props.isRowSelectable,
    })
  : undefined

const pagination = usePagination(
  () => state.page.value,
  () => state.pageSize.value,
  () => props.source.total.value,
  { siblingCount: props.siblingCount, onChange: state.setPage },
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
  source: props.source,
  selection,
  pagination,
  rows,
  visibleColumns: columns.visible,
  columnDefs: computed(() => props.columns),
  // Without a selection there is no configured id getter, so fall back to
  // `row.id` — the same default `useRowSelection` applies.
  getRowId: selection?.getRowId ?? ((row: TRow) => (row as { id?: RowId }).id as RowId),
  getCellValue,
  getCellText,
}

provideTableContext(context)

watch(() => state.query.value, (query) => emit('update:query', query), { deep: true })
if (selection) {
  watch(() => selection.state.value, () => emit('update:selection', selection.selectedIds.value), {
    deep: true,
  })
}

defineExpose({ state, columns, selection, pagination, source: toRef(props, 'source') })
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
    :source="source"
    :loading="source.loading.value"
    :error="source.error.value"
    :total="source.total.value"
    :get-cell-value="getCellValue"
    :get-cell-text="getCellText"
  />
</template>
