import { inject, provide, type ComputedRef, type InjectionKey, type Ref } from 'vue'
import type { ColumnDef, DataSource, DisplayRow, ResolvedColumn, RowId } from './types'
import type { TableState } from './useTableState'
import type { UseColumnsResult } from './useColumns'
import type { UseColumnDnd } from './useColumnDnd'
import type { UseRowGrouping } from './useRowGrouping'
import type { UseRowSelection } from './useRowSelection'
import type { UseRowEditing } from './useRowEditing'
import type { UsePagination } from './usePagination'

/**
 * Everything a primitive can reach: state, columns, source, selection,
 * grouping, cell readers.
 */
export interface TableContext<TRow = Record<string, unknown>> {
  state: TableState
  columns: UseColumnsResult<TRow>
  source: DataSource<TRow>
  /**
   * Computed, not a plain value: whether the table is selectable can change at
   * runtime, and consumers must see that without the provider remounting.
   */
  selection: ComputedRef<UseRowSelection<TRow> | undefined>
  pagination: UsePagination
  /**
   * Column drag-and-drop. Optional: a hand-built context may omit it, and
   * header cells then simply render as non-draggable.
   */
  dnd?: UseColumnDnd
  /**
   * Row grouping. Optional for the same reason as `dnd`: a hand-built context
   * may leave it out, and consumers then render `rows` flat.
   */
  grouping?: UseRowGrouping<TRow>
  /**
   * Inline editing. Optional for the same reason as `dnd` and `grouping`: a
   * hand-built context may leave it out, and cells then render read-only.
   */
  editing?: UseRowEditing<TRow>

  rows: ComputedRef<TRow[]> | Readonly<Ref<TRow[]>>
  /**
   * `rows` with group headers folded in. Identical in content to `rows` when
   * nothing is grouped, so a renderer can read only this one.
   */
  displayRows: ComputedRef<DisplayRow<TRow>[]>
  visibleColumns: ComputedRef<ResolvedColumn<TRow>[]>
  columnDefs: ComputedRef<ColumnDef<TRow>[]>
  getRowId: (row: TRow) => RowId
  /** Reads a cell's raw value, honouring the column's accessor. */
  getCellValue: (row: TRow, column: ColumnDef<TRow>) => unknown
  /** Reads a cell's display string, honouring `format`. */
  getCellText: (row: TRow, column: ColumnDef<TRow>) => string
}

/** The injection key, exported so you can provide a context by hand. */
export const TableContextKey: InjectionKey<TableContext<never>> = Symbol('vue-table-chad')

/** Publishes a TableContext so primitives beneath can find it. */
export function provideTableContext<TRow>(context: TableContext<TRow>): void {
  provide(TableContextKey, context as unknown as TableContext<never>)
}

/**
 * The table context, or `undefined` — which is what lets a primitive work
 * standalone.
 *
 * Every primitive calls this, but each also accepts explicit props that
 * override it, so `<TablePagination>` or a filter popover can be used on its
 * own, outside any `<TableRoot>`.
 */
export function useTableContext<TRow = Record<string, unknown>>(): TableContext<TRow> | undefined {
  return inject(TableContextKey, undefined) as TableContext<TRow> | undefined
}

/**
 * The context, or a thrown error, for the primitives that genuinely need one.
 */
export function requireTableContext<TRow = Record<string, unknown>>(
  component: string,
): TableContext<TRow> {
  const context = useTableContext<TRow>()
  if (!context) {
    throw new Error(
      `[vue-table-chad] <${component}> needs a <TableRoot> ancestor, or explicit props to stand in for one.`,
    )
  }
  return context
}
