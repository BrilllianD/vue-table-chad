/**
 * Every user-facing string the library can render, in one record.
 *
 * Pure data and pure functions — no Vue beyond the types it does not need, so
 * the layer rule holds and a consumer can build a locale as a plain object.
 *
 * Keys are named for the *role* a string plays, never for the English it holds
 * today: `blanksFacet` rather than `parenBlanks`, so rewording a default is not
 * a breaking rename. Anything that interpolates is a function rather than a
 * template with placeholders, because a function is the one form that lets a
 * translation reorder its parts — several of these read in a different order in
 * languages that put the noun last, and `'{count} values'` cannot express that.
 */
import type { ColumnDataType, ConditionOperator, PinSide } from './types'

/**
 * The strings a table renders, overridable per table.
 *
 * Pass a `Partial` of this to `useTable`'s `labels` option or to `DataTable`'s
 * `labels` prop; anything left out falls back to `DEFAULT_LABELS`.
 */
export interface TableLabels {
  // — toolbar and search —
  /** Placeholder for the toolbar's global search box. */
  search: string
  /** Accessible name for the toolbar's global search box. */
  searchAllColumns: string
  /** Placeholder for the value-list filter's search box. */
  searchValuesPlaceholder: string
  /** Accessible name for the value-list filter's search box. */
  searchValues: string

  // — shared verbs —
  clear: string
  clearAll: string
  apply: string
  save: string
  cancel: string
  retry: string
  loading: string
  loadMore: string

  // — empty and error states —
  /** The pager's summary when nothing matched at all. */
  noRows: string
  /** The value list, when the search matched no facet. */
  noMatchingValues: string
  /** An async select's list, when the search matched no option. */
  noMatchingOptions: string
  /** The body, when the query matched no row. */
  emptyMessage: string
  /** The body, when the source rejected. */
  loadFailed: string
  /** A filter panel, when its facet request rejected. */
  facetsFailed: string
  /** An async select, when its option request rejected. */
  optionsFailed: string
  /** An async select's hidden status while options load. */
  loadingOptions: string

  // — selection —
  /** Accessible name for the header checkbox. */
  selectAllOnPage: string
  /** Accessible name for the value list's tri-state checkbox. */
  selectAllValues: string
  /** The value list's visible "everything" row. */
  selectAllRow: string
  /** Accessible name for the value list's blanks checkbox. */
  blanksCheckbox: string
  /**
   * The value list's blanks row — and what its search box matches against.
   *
   * One key for both on purpose: the search lowercases this label and compares,
   * so translating the row without the needle would leave a blanks row that
   * silently vanishes as soon as anything is typed.
   */
  blanksFacet: string
  /** Clears an "all matching" selection. */
  clearSelection: string

  // — pagination —
  /** Accessible name for the pager itself. */
  pagination: string
  firstPage: string
  previousPage: string
  nextPage: string
  lastPage: string
  /** Hidden label on the page-size select. */
  rowsPerPage: string

  // — grouping —
  /** Default for `RowGroupMenu`'s `label` prop. */
  groupBy: string
  /** Accessible name for the grouping panel. */
  groupingOptions: string
  /** The panel's worded expand-all button. */
  expandAll: string
  /** The panel's worded collapse-all button. */
  collapseAll: string
  /** Accessible name for the icon expand-all button beside the trigger. */
  expandAllGroups: string
  /** Accessible name for the icon collapse-all button beside the trigger. */
  collapseAllGroups: string
  /** Moves a grouping level outwards. */
  moveUpLevel: string
  /** Moves a grouping level inwards. */
  moveDownLevel: string

  // — columns —
  /** Default for `ColumnVisibilityMenu`'s `label` prop. */
  columns: string
  /** Accessible name for the column panel. */
  columnOptions: string
  showAll: string
  resetLayout: string
  moveUp: string
  moveDown: string
  /** Hidden header for the trailing row-actions column. */
  rowActions: string

  // — export —
  /** Caption for the toolbar's export button. */
  exportRows: string
  /** Accessible name for it, naming what gets written rather than the gesture. */
  exportRowsDescription: string

  // — filters —
  /** Accessible name and title for a filter trigger with nothing set. */
  filter: string
  /** Title for a filter trigger that has a filter on it. */
  filterApplied: string
  /** The filter panel's value-list tab. */
  filterValuesTab: string
  /** The filter panel's rule-builder tab. */
  filterConditionsTab: string
  /** A values filter that includes only blank cells. */
  filterBlanksOnly: string
  /** A values filter that includes nothing. */
  filterNone: string
  /** Joins the two halves of a `between` rule in a chip summary. */
  conditionAnd: string
  /** Accessible name for the and/or select. */
  combineConditions: string
  /** The and/or select's "and". */
  conjunctionAnd: string
  /** The and/or select's "or". */
  conjunctionOr: string
  /** The word before the first rule, where the others show a conjunction. */
  conditionWhere: string
  /** Accessible name for the operator select. */
  operator: string
  /** Accessible name and placeholder for a rule's first value. */
  conditionValue: string
  /** Accessible name for a `between` rule's second value. */
  conditionSecondValue: string
  /** Placeholder for a `between` rule's second value. */
  conditionSecondValuePlaceholder: string
  removeCondition: string
  addCondition: string

  // — editing —
  /** Default for an async select's trigger with nothing chosen. */
  selectPlaceholder: string
  /** Default for `DataTable`'s `footerLabel`. */
  footerLabel: string

  // — interpolating —
  /** Accessible name for a filter chip's remove button. */
  clearFilterOn: (columnLabel: string) => string
  /** Title for a filter chip: the column, then what it is filtered to. */
  filterChip: (columnLabel: string, summary: string) => string
  /** Accessible name for a column's filter trigger and panel. */
  filterColumn: (columnLabel: string) => string
  /** Accessible name for a resize handle. */
  resizeColumn: (columnLabel: string) => string
  /** Title for the pin button, naming the side it is pinned to. */
  pinState: (side: PinSide | 'none') => string
  /** Accessible name for the pin button. */
  pinColumn: (columnLabel: string) => string
  /** Accessible name for a visibility checkbox. */
  showColumn: (columnLabel: string) => string
  /** Accessible name for a grouping checkbox. */
  groupByColumn: (columnLabel: string) => string
  /** Accessible name for the button that drops a grouping level. */
  stopGroupingBy: (levelLabel: string) => string
  /** Title for a sort trigger, including how to add to a multi-sort. */
  sortByColumn: (columnLabel: string) => string
  /** Accessible name for the pointer-only edit trigger on a cell. */
  editCell: (columnLabel: string) => string
  /** Accessible name for an async select's own search box. */
  searchIn: (label: string | undefined) => string

  // — counts —
  /** A values filter summarised as how many values it admits. */
  valueCount: (count: number) => string
  /** The pager's summary: which rows of how many are on screen. */
  rowRange: (first: number, last: number, total: number) => string
  /** One option of the page-size select. */
  pageSizeOption: (size: number) => string
  /** The toolbar's selection summary. */
  selectedCount: (count: number) => string
  /** The banner, once everything matching is selected. */
  allMatchingSelected: (count: number) => string
  /** The banner, once the visible page is fully selected. */
  allOnPageSelected: (count: number) => string
  /** The banner's offer to widen the selection past this page. */
  selectAllMatching: (total: number) => string

  // — the expand/collapse pairs, whole messages rather than concatenations —
  /** Accessible name for a folded group row's toggle. */
  expandGroup: (columnLabel: string, groupLabel: string) => string
  /** Accessible name for an open group row's toggle. */
  collapseGroup: (columnLabel: string, groupLabel: string) => string
  /** Accessible name for a folded header band's toggle. */
  expandBand: (bandLabel: string) => string
  /** Accessible name for an open header band's toggle. */
  collapseBand: (bandLabel: string) => string
  /** Accessible name for a grouped column's header, folded. */
  expandColumnGroups: (columnLabel: string) => string
  /** Accessible name for a grouped column's header, open. */
  collapseColumnGroups: (columnLabel: string) => string
  /** Accessible name for a shut row's detail toggle. */
  expandRow: string
  /** Accessible name for an open row's detail toggle. */
  collapseRow: string

  // — the core modules' own strings —
  /** Human-readable names for every filter operator. */
  operators: Record<ConditionOperator, string>
  /** Shown when a cell holds something its column's `type` cannot read. */
  parse: Record<ColumnDataType, string>
  /** Shown when a `required` column is left blank. */
  required: string
  /** Shown when a save rejected with nothing that could be turned into a message. */
  saveFailed: string
  /** What a blank group is called when the column says nothing better. */
  blankGroup: string
}

/**
 * The English every table renders unless it is handed something else.
 *
 * Frozen, and deliberately: this is the base every merge starts from, so a
 * consumer mutating it would change the fallback for every other table on the
 * page rather than only their own.
 */
export const DEFAULT_LABELS: TableLabels = Object.freeze({
  search: 'Search…',
  searchAllColumns: 'Search all columns',
  searchValuesPlaceholder: 'Search values…',
  searchValues: 'Search values',

  clear: 'Clear',
  clearAll: 'Clear all',
  apply: 'Apply',
  save: 'Save',
  cancel: 'Cancel',
  retry: 'Retry',
  loading: 'Loading…',
  loadMore: 'Load more',

  noRows: 'No rows',
  noMatchingValues: 'No matching values',
  noMatchingOptions: 'No matching options',
  emptyMessage: 'No Data',
  loadFailed: 'Failed to load data.',
  facetsFailed: 'Could not load filter values.',
  optionsFailed: 'Could not load options.',
  loadingOptions: 'Loading options',

  selectAllOnPage: 'Select all rows on this page',
  selectAllValues: 'Select all',
  selectAllRow: '(Select All)',
  blanksCheckbox: 'Blanks',
  blanksFacet: '(Blanks)',
  clearSelection: 'Clear selection',

  pagination: 'Pagination',
  firstPage: 'First page',
  previousPage: 'Previous page',
  nextPage: 'Next page',
  lastPage: 'Last page',
  rowsPerPage: 'Rows per page',

  groupBy: 'Group by',
  groupingOptions: 'Grouping options',
  expandAll: 'Expand all',
  collapseAll: 'Collapse all',
  expandAllGroups: 'Expand all groups',
  collapseAllGroups: 'Collapse all groups',
  moveUpLevel: 'Move up a level',
  moveDownLevel: 'Move down a level',

  columns: 'Columns',
  columnOptions: 'Column options',
  showAll: 'Show all',
  resetLayout: 'Reset layout',
  moveUp: 'Move up',
  moveDown: 'Move down',
  rowActions: 'Row actions',

  exportRows: 'Export',
  exportRowsDescription: 'Export every filtered row as CSV',

  filter: 'Filter',
  filterApplied: 'Filter applied — click to edit',
  filterValuesTab: 'Values',
  filterConditionsTab: 'Conditions',
  filterBlanksOnly: 'blanks only',
  filterNone: 'none',
  conditionAnd: 'and',
  combineConditions: 'Combine conditions with',
  conjunctionAnd: 'And',
  conjunctionOr: 'Or',
  conditionWhere: 'Where',
  operator: 'Operator',
  conditionValue: 'Value',
  conditionSecondValue: 'Second value',
  conditionSecondValuePlaceholder: 'and',
  removeCondition: 'Remove condition',
  addCondition: 'Add condition',

  selectPlaceholder: 'Select…',
  footerLabel: 'Total',

  clearFilterOn: (columnLabel: string) => `Clear filter on ${columnLabel}`,
  filterChip: (columnLabel: string, summary: string) => `${columnLabel}: ${summary}`,
  filterColumn: (columnLabel: string) => `Filter ${columnLabel}`,
  resizeColumn: (columnLabel: string) => `Resize column ${columnLabel}`,
  pinState: (side: PinSide | 'none') => `Pin: ${side}`,
  pinColumn: (columnLabel: string) => `Pin ${columnLabel}`,
  showColumn: (columnLabel: string) => `Show ${columnLabel}`,
  groupByColumn: (columnLabel: string) => `Group by ${columnLabel}`,
  stopGroupingBy: (levelLabel: string) => `Stop grouping by ${levelLabel}`,
  sortByColumn: (columnLabel: string) =>
    `Sort by ${columnLabel} (shift-click to add to multi-sort)`,
  editCell: (columnLabel: string) => `Edit ${columnLabel}`,
  searchIn: (label: string | undefined) => (label ? `Search ${label}` : 'Search'),

  valueCount: (count: number) => `${count} values`,
  rowRange: (first: number, last: number, total: number) => `${first}–${last} of ${total}`,
  pageSizeOption: (size: number) => `${size} / page`,
  selectedCount: (count: number) => `${count} selected`,
  allMatchingSelected: (count: number) =>
    `All ${count} rows matching the current filters are selected.`,
  allOnPageSelected: (count: number) => `All ${count} rows on this page are selected.`,
  selectAllMatching: (total: number) => `Select all ${total} matching rows`,

  expandGroup: (columnLabel: string, groupLabel: string) =>
    `Expand ${columnLabel} ${groupLabel}`,
  collapseGroup: (columnLabel: string, groupLabel: string) =>
    `Collapse ${columnLabel} ${groupLabel}`,
  expandBand: (bandLabel: string) => `Expand ${bandLabel} columns`,
  collapseBand: (bandLabel: string) => `Collapse ${bandLabel} columns`,
  expandColumnGroups: (columnLabel: string) => `Expand all ${columnLabel} groups`,
  collapseColumnGroups: (columnLabel: string) => `Collapse all ${columnLabel} groups`,
  expandRow: 'Show details',
  collapseRow: 'Hide details',

  operators: Object.freeze({
    contains: 'contains',
    notContains: 'does not contain',
    startsWith: 'begins with',
    endsWith: 'ends with',
    eq: 'equals',
    neq: 'does not equal',
    empty: 'is empty',
    notEmpty: 'is not empty',
    gt: 'is greater than',
    gte: 'is greater than or equal to',
    lt: 'is less than',
    lte: 'is less than or equal to',
    between: 'is between',
    on: 'is on',
    before: 'is before',
    after: 'is after',
  }),
  parse: Object.freeze({
    text: 'Not valid text',
    number: 'Not a number',
    date: 'Not a date',
    boolean: 'Not a yes or no',
    enum: 'Not one of the options',
  }),
  required: 'Required',
  saveFailed: 'Could not save',
  blankGroup: 'Blank',
})

/**
 * `DEFAULT_LABELS` with an override laid over it.
 *
 * One level deep, plus an explicit merge of the two nested maps: the record is
 * flat everywhere else by design, so a generic deep merge would be machinery
 * with nothing to walk. Overriding one operator therefore keeps the other
 * fifteen, which is the only behaviour that makes a partial override useful.
 *
 * `base` is what an override falls back to, and it is the whole reason an
 * app-wide locale works: a table with `app.use(createTableLabels(ru))` above it
 * passes the inherited Russian record here, so a `labels` prop naming three
 * keys replaces those three and leaves the rest Russian rather than snapping
 * them back to English. Left out, it is `DEFAULT_LABELS` and the merge is the
 * one it always was.
 */
export function mergeLabels(
  overrides: Partial<TableLabels> | undefined,
  base: TableLabels = DEFAULT_LABELS,
): TableLabels {
  if (!overrides) return base
  return {
    ...base,
    ...overrides,
    operators: { ...base.operators, ...overrides.operators },
    parse: { ...base.parse, ...overrides.parse },
  }
}
