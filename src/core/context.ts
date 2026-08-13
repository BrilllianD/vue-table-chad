import { inject, provide, type ComputedRef, type InjectionKey, type Ref } from 'vue'
import type { ColumnDef, DataSource, ResolvedColumn, RowId } from './types'
import type { TableState } from './useTableState'
import type { UseColumnsResult } from './useColumns'
import type { UseRowSelection } from './useRowSelection'
import type { UsePagination } from './usePagination'

export interface TableContext<TRow = Record<string, unknown>> {
  state: TableState
  columns: UseColumnsResult<TRow>
  source: DataSource<TRow>
  selection: UseRowSelection<TRow> | undefined
  pagination: UsePagination

  rows: ComputedRef<TRow[]> | Readonly<Ref<TRow[]>>
  visibleColumns: ComputedRef<ResolvedColumn<TRow>[]>
  columnDefs: ComputedRef<ColumnDef<TRow>[]>
  getRowId: (row: TRow) => RowId
  /** Reads a cell's raw value, honouring the column's accessor. */
  getCellValue: (row: TRow, column: ColumnDef<TRow>) => unknown
  /** Reads a cell's display string, honouring `format`. */
  getCellText: (row: TRow, column: ColumnDef<TRow>) => string
}

export const TableContextKey: InjectionKey<TableContext<never>> = Symbol('vue-table')

export function provideTableContext<TRow>(context: TableContext<TRow>): void {
  provide(TableContextKey, context as unknown as TableContext<never>)
}

/**
 * Reads the table context.
 *
 * Every primitive calls this, but each also accepts explicit props that
 * override it — which is what lets `<TablePagination>` or a filter popover be
 * used on its own, outside any `<TableRoot>`.
 */
export function useTableContext<TRow = Record<string, unknown>>(): TableContext<TRow> | undefined {
  return inject(TableContextKey, undefined) as TableContext<TRow> | undefined
}

export function requireTableContext<TRow = Record<string, unknown>>(
  component: string,
): TableContext<TRow> {
  const context = useTableContext<TRow>()
  if (!context) {
    throw new Error(
      `[vue-table] <${component}> needs a <TableRoot> ancestor, or explicit props to stand in for one.`,
    )
  }
  return context
}
