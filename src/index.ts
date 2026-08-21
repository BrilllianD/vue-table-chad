/**
 * Public surface. Three layers, each usable independently:
 *
 *   core/        composables and pure logic — no components
 *   primitives/  headless, slot-driven components
 *   preset/      DataTable + CSS, assembled from the primitives
 */

/* ------------------------------------------------------------------ core */

export { useTableState, createQueryState } from './core/useTableState'
export type { TableState, TableStateOptions } from './core/useTableState'

export { useColumns } from './core/useColumns'
export type { UseColumnsOptions, UseColumnsResult, ColumnLayoutState } from './core/useColumns'

export {
  readColumnLayout,
  writeColumnLayout,
  clearColumnLayout,
  sanitizeColumnLayout,
  normalizeColumnStorage,
  DEFAULT_COLUMN_LAYOUT_FIELDS,
} from './core/columnStorage'
export type { ColumnStorageOptions, ColumnLayoutField, StorageLike } from './core/columnStorage'

export { buildHeaderRows, columnGroupPath, columnGroupPaths } from './core/columnGroups'

export { useColumnDnd } from './core/useColumnDnd'
export type {
  UseColumnDnd,
  UseColumnDndOptions,
  ColumnDropTarget,
  DropSide,
} from './core/useColumnDnd'

export { useRowGrouping } from './core/useRowGrouping'
export type { UseRowGrouping, UseRowGroupingOptions } from './core/useRowGrouping'

export { useLocalDataSource } from './core/useLocalDataSource'
export type { LocalDataSource, LocalDataSourceOptions } from './core/useLocalDataSource'

export { useServerDataSource } from './core/useServerDataSource'
export type { ServerDataSource, ServerDataSourceOptions } from './core/useServerDataSource'

export { useRowSelection } from './core/useRowSelection'
export type { UseRowSelection, UseRowSelectionOptions } from './core/useRowSelection'

export { useRowEditing, SAVE_FAILED_MESSAGE } from './core/useRowEditing'
export type {
  UseRowEditing,
  UseRowEditingOptions,
  EditMode,
  RowChange,
  RowSaveFailure,
  RowEditState,
} from './core/useRowEditing'

export { usePagination } from './core/usePagination'
export type { UsePagination, UsePaginationOptions, PageItem } from './core/usePagination'

export {
  provideTableContext,
  useTableContext,
  requireTableContext,
  TableContextKey,
} from './core/context'
export type { TableContext } from './core/context'

/* --------------------------------------------------------------- filters */

export {
  valuesFilter,
  conditionsFilter,
  isEmptyFilter,
  isIncompleteRule,
  isUnaryOperator,
  isBinaryOperator,
  normalizeFilter,
  pruneFilters,
  operatorsFor,
  defaultOperator,
  OPERATOR_LABELS,
} from './core/filters/model'

export {
  matchesFilter,
  matchesRule,
  matchesSearch,
  compileFilter,
  compileSearch,
} from './core/filters/predicates'
export { computeFacets, filterRows } from './core/filters/facets'

/* --------------------------------------------------------------- sorting */

export {
  sortRows,
  applySortRule,
  nextDirection,
  comparatorFor,
  sortKeyFor,
  compareText,
  compareNumber,
  compareDate,
  compareBoolean,
  readValue,
} from './core/sorting'
export type { SortOptions } from './core/sorting'

/* -------------------------------------------------------------- grouping */

export {
  groupedSort,
  groupSortRules,
  buildGroupTree,
  flattenTree,
  flattenGroups,
  groupValueOf,
  groupPathKey,
  groupKeys,
  countGroups,
  BLANK_GROUP_LABEL,
  ROOT_GROUP_KEY,
} from './core/grouping'
export type {
  GroupingOptions,
  GroupTreeOptions,
  GroupTree,
  GroupNode,
} from './core/grouping'

/* ----------------------------------------------------------- aggregation */

export {
  aggregateValue,
  aggregateRow,
  aggregateGroups,
  formatAggregate,
} from './core/aggregation'

/* --------------------------------------------------------------- editing */

export {
  editorFor,
  isColumnEditable,
  parseCellInput,
  validateCell,
  validateDraft,
  applyCellValue,
  applyPatch,
  replaceRowIn,
  REQUIRED_MESSAGE,
} from './core/editing'
export type { CellErrors, DraftValidation } from './core/editing'

/* ----------------------------------------------------------------- utils */

export {
  isBlank,
  toNumber,
  toTime,
  toIsoDate,
  toBoolean,
  toFilterValue,
  startOfDay,
  facetKey,
} from './core/utils/values'

/* ------------------------------------------------------------ components */

export { default as TableRoot } from './components/primitives/TableRoot.vue'
export { default as TableGrid } from './components/primitives/TableGrid.vue'
export { default as TableHeaderCell } from './components/primitives/TableHeaderCell.vue'
export { default as TableCell } from './components/primitives/TableCell.vue'
export { default as TableRow } from './components/primitives/TableRow.vue'
export { default as CellEditor } from './components/primitives/CellEditor.vue'
export { default as TableGroupRow } from './components/primitives/TableGroupRow.vue'
export { default as SortTrigger } from './components/primitives/SortTrigger.vue'
export { default as ColumnFilterPopover } from './components/primitives/ColumnFilterPopover.vue'
export { default as ValueListFilter } from './components/primitives/ValueListFilter.vue'
export { default as ConditionFilter } from './components/primitives/ConditionFilter.vue'
export { default as ColumnResizeHandle } from './components/primitives/ColumnResizeHandle.vue'
export { default as ColumnDragGhost } from './components/primitives/ColumnDragGhost.vue'
export { default as ColumnVisibilityMenu } from './components/primitives/ColumnVisibilityMenu.vue'
export { default as RowGroupMenu } from './components/primitives/RowGroupMenu.vue'
export { default as ActiveFilters } from './components/primitives/ActiveFilters.vue'
export { default as TablePagination } from './components/primitives/TablePagination.vue'
export { default as SelectionCheckbox } from './components/primitives/SelectionCheckbox.vue'

/**
 * The preset. It imports `table.css` itself, so using `DataTable` pulls the
 * default theme in automatically.
 *
 * Using only the primitives pulls in no CSS at all — that is the point of a
 * headless layer. To style them with the default theme anyway, import the
 * stylesheet explicitly:
 *
 *   import '@sandbox/vue-table/style.css'
 *
 * (Note: the stylesheet is deliberately NOT imported from this barrel file.
 * `package.json` declares `sideEffects: ["**\/*.css"]`, which marks every JS
 * module as side-effect-free, so a bare CSS import here would be tree-shaken
 * away for anyone importing named exports — silently shipping an unstyled
 * table.)
 */
export { default as DataTable } from './components/preset/DataTable.vue'

/* ----------------------------------------------------------------- types */

export type {
  RowId,
  FilterValue,
  ColumnDataType,
  CellEditorKind,
  SortDirection,
  SortRule,
  ConditionOperator,
  ConditionRule,
  ValuesFilter,
  ConditionsFilter,
  ColumnFilter,
  FacetValue,
  QueryState,
  PinSide,
  ColumnDef,
  ResolvedColumn,
  ColumnGroupDef,
  HeaderCell,
  HeaderGroupCell,
  HeaderColumnCell,
  HeaderRow,
  RowGroup,
  DisplayRow,
  GroupMode,
  AggregateFn,
  AggregateResult,
  FetchParams,
  FetchResult,
  DataSource,
  SelectionMode,
  SelectionState,
  HeaderCheckboxState,
} from './core/types'
