import { computed, inject, provide, type ComputedRef, type InjectionKey, type Ref } from 'vue'
import type { ColumnDef, DataSource, DisplayRow, ResolvedColumn, RowId } from './types'
import type { TableState } from './useTableState'
import type { UseColumnsResult } from './useColumns'
import type { UseColumnDnd } from './useColumnDnd'
import type { UseRowGrouping } from './useRowGrouping'
import type { UseRowSelection } from './useRowSelection'
import type { UseRowEditing } from './useRowEditing'
import type { UsePagination } from './usePagination'
import { DEFAULT_LABELS, type TableLabels } from './labels'

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

/**
 * Publishes a TableContext, and a `useTable` result's labels, so primitives
 * beneath can find them.
 *
 * A hand-built table then needs this one call: its primitives render the
 * wording its pipeline uses. A plain context object without `labels` publishes
 * none, and primitives keep the record they inherited.
 */
export function provideTableContext<TRow>(
  context: TableContext<TRow> & { labels?: Readonly<Ref<TableLabels>> },
): void {
  provide(TableContextKey, context as unknown as TableContext<never>)
  if (context.labels) provide(TableLabelsKey, context.labels)
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
 * A palette a table asks for outright, rather than following the OS.
 *
 * `'system'` is the absence of a choice: it emits no `data-theme` at all, so
 * `prefers-color-scheme` decides, which is what every table did before this
 * existed.
 */
export type TableTheme = 'light' | 'dark' | 'system'

/**
 * The theme, published on its own key rather than as a field on `TableContext`.
 *
 * A hand-built context has to satisfy that interface in full, and which palette
 * to paint is not something a caller assembling a table out of primitives
 * should have to answer. The consumers are the two components that teleport a
 * `.vt-portal` wrapper to `<body>`: once there they are no longer descendants
 * of the table, custom properties stop inheriting, and a forced theme would
 * stop at the table's edge.
 */
export const TableThemeKey: InjectionKey<Readonly<Ref<TableTheme>>> = Symbol(
  'vue-table-chad:theme',
)

/** Publishes the theme, so teleported wrappers beneath can stamp it on themselves. */
export function provideTableTheme(theme: Readonly<Ref<TableTheme>>): void {
  provide(TableThemeKey, theme)
}

/**
 * The theme a `<DataTable>` above asked for, or `undefined` with no table above
 * — in which case a wrapper emits nothing and the media query decides.
 */
export function useTableTheme(): Readonly<Ref<TableTheme>> | undefined {
  return inject(TableThemeKey, undefined)
}

/**
 * A reader of the font family the table computes, published on its own key.
 *
 * A teleported wrapper leaves the table, so the family the table inherited from
 * its ancestors (a wrapper such as `#app`, an ancestor's `--vtc-font-family`)
 * does not reach it. A function and not a ref: the family's source is the page,
 * which no ref can watch, so it is read when a panel opens instead.
 */
export const TableFontFamilyKey: InjectionKey<() => string | undefined> = Symbol(
  'vue-table-chad:font-family',
)

/** Publishes the reader, so teleported wrappers beneath can stamp the family on themselves. */
export function provideTableFontFamily(read: () => string | undefined): void {
  provide(TableFontFamilyKey, read)
}

/**
 * The inline style that gives a teleported `.vt-portal` wrapper the table's
 * font family, or `undefined` with no table above or while `active()` is false.
 *
 * Stamps the custom property, not `font-family`: the wrapper's own rule and the
 * nested `.vt-select-panel` and `.vt-drag-ghost` rules all read the token, and
 * an inline `font-family` would lose to those when `:root` sets another one.
 * The computed depends only on `active()`, so the reader runs once per open.
 */
export function usePortalFontStyle(
  active: () => boolean,
): ComputedRef<{ '--vtc-font-family': string } | undefined> {
  const read = inject(TableFontFamilyKey, undefined)
  return computed(() => {
    if (!read || !active()) return undefined
    const family = read()
    return family ? { '--vtc-font-family': family } : undefined
  })
}

/**
 * The app-wide default theme `createTable` publishes, on a key of its own and
 * not on `TableThemeKey`.
 *
 * `TableThemeKey` is what the teleported panels read. Providing it from the app
 * root would turn the popovers of a hand-built table (`TableRoot`, no
 * `DataTable`, so no `data-theme` on its body) dark while its body follows the
 * OS. This key is read by `DataTable` alone, which resolves it against its own
 * `theme` prop and re-publishes the result on `TableThemeKey`.
 */
export const TableDefaultThemeKey: InjectionKey<Readonly<Ref<TableTheme | undefined>>> = Symbol(
  'vue-table-chad:default-theme',
)

/** The app default `createTable` set, or `undefined` when it set none. */
export function useDefaultTableTheme(): Readonly<Ref<TableTheme | undefined>> | undefined {
  return inject(TableDefaultThemeKey, undefined)
}

/**
 * The label record, published on its own key rather than as a field on
 * `TableContext`, for the reason the theme is: a hand-built context has to
 * satisfy that interface in full, and a caller assembling a table out of
 * primitives should not have to hand over ~120 strings to render a pager.
 */
export const TableLabelsKey: InjectionKey<Readonly<Ref<TableLabels>>> = Symbol(
  'vue-table-chad:labels',
)

/** Publishes the labels, so every primitive beneath reads the same wording. */
export function provideTableLabels(labels: Readonly<Ref<TableLabels>>): void {
  provide(TableLabelsKey, labels)
}

/**
 * The labels a table above asked for, else the app-wide record, else English.
 *
 * Never `undefined`, unlike `useTableContext` — which is what keeps every
 * primitive standalone: with no `<TableRoot>` above, a primitive still renders
 * full English rather than blank buttons or a thrown error.
 */
export function useTableLabels(): ComputedRef<TableLabels> {
  const injected = inject(TableLabelsKey, undefined)
  return computed(() => injected?.value ?? DEFAULT_LABELS)
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
