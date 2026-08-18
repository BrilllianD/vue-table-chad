<script setup lang="ts">
/**
 * `TableRoot`, rebuilt from scratch in about forty lines.
 *
 * This is the deepest seam the library has: `TableContext` is a plain interface
 * and `provideTableContext` is a plain `provide`, so a component that assembles
 * the same object can host every built-in primitive. Nothing in
 * `SortTrigger`, `ColumnFilterPopover` or `TablePagination` knows it is talking
 * to this file rather than to the real `TableRoot`.
 *
 * (`provideTableContext` is a one-line wrapper over `provide(TableContextKey, …)`.
 * The key is exported too, so you can inject it directly with your own default
 * when the helper does not fit.)
 *
 * Typed to `Employee` rather than generic, because the point here is the shape
 * of the context, not the generics ceremony around it.
 */
import { computed, toRef } from 'vue'
import {
  provideTableContext,
  readValue,
  useColumns,
  useLocalDataSource,
  usePagination,
  useRowGrouping,
  useRowSelection,
  useTableState,
  type ColumnDef,
  type DataSource,
  type LocalDataSourceOptions,
  type TableContext,
  type TableState,
  type TableStateOptions,
  type UseColumnsOptions,
  type UseColumnsResult,
  type UsePagination,
  type UsePaginationOptions,
  type UseRowGroupingOptions,
  type UseRowSelectionOptions,
} from '@sandbox/vue-table'
import type { Employee } from '../data/dataset'

const props = defineProps<{
  columns: ColumnDef<Employee>[]
  rows: Employee[]
  pageSize?: number
}>()

const stateOptions: TableStateOptions = { pageSize: props.pageSize ?? 5 }
const state: TableState = useTableState(stateOptions)

// Self-contained: this root owns its data source as well as its state, so the
// caller hands it rows and gets a working table context back.
const sourceOptions: LocalDataSourceOptions = { nullsLast: true }
const source: DataSource<Employee> = useLocalDataSource<Employee>(
  toRef(props, 'rows'),
  () => props.columns,
  state.query,
  sourceOptions,
)

const columnOptions: UseColumnsOptions = {
  sortFor: state.sortFor,
  sortIndexFor: state.sortIndexFor,
  hasFilter: (id) => state.filters.value[id] !== undefined,
}
const columns: UseColumnsResult<Employee> = useColumns<Employee>(
  () => props.columns,
  columnOptions,
)

const rows = computed(() => source.rows.value)

// Grouping is a layer over whatever rows the source produced, so a hand-built
// root wires it in exactly the way `TableRoot` does.
const groupingOptions: UseRowGroupingOptions = {
  groupBy: () => state.groupBy.value,
  totals: () => source.groupCounts?.(state.groupBy.value),
}
const grouping = useRowGrouping<Employee>(rows, () => props.columns, groupingOptions)

const selectionOptions: UseRowSelectionOptions<Employee> = {
  mode: 'multiple',
  getRowId: (row) => row.id,
}
const selection = useRowSelection<Employee>(
  rows,
  () => source.total.value,
  selectionOptions,
)

const paginationOptions: UsePaginationOptions = { siblingCount: 1, onChange: state.setPage }
const pagination: UsePagination = usePagination(
  () => state.page.value,
  () => state.pageSize.value,
  () => source.total.value,
  paginationOptions,
)

function getCellValue(row: Employee, column: ColumnDef<Employee>): unknown {
  return readValue(row, column)
}

function getCellText(row: Employee, column: ColumnDef<Employee>): string {
  const value = getCellValue(row, column)
  if (column.format) return column.format(value, row)
  return value === null || value === undefined ? '' : String(value)
}

const context: TableContext<Employee> = {
  state,
  columns,
  source,
  selection: computed(() => selection),
  pagination,
  grouping,
  rows,
  displayRows: grouping.displayRows,
  visibleColumns: columns.visible,
  columnDefs: computed(() => props.columns),
  getRowId: selection.getRowId,
  getCellValue,
  getCellText,
}

provideTableContext(context)
</script>

<template>
  <slot :rows="rows" :columns="columns.visible.value" :selection="selection" :state="state" />
</template>
