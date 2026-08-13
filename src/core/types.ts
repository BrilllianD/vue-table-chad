import type { ComputedRef, Ref } from 'vue'

/** Anything a row can be keyed by. */
export type RowId = string | number

/** Values that may appear inside a serialized filter. Keep this JSON-safe. */
export type FilterValue = string | number | boolean | null

/**
 * How a column's values behave. Drives which comparator sorts it and which
 * operators its filter panel offers.
 */
export type ColumnDataType = 'text' | 'number' | 'date' | 'boolean' | 'enum'

export type SortDirection = 'asc' | 'desc'

export interface SortRule {
  columnId: string
  direction: SortDirection
}

/* ------------------------------------------------------------------ *
 * Filters
 * ------------------------------------------------------------------ */

export type TextOperator =
  | 'contains'
  | 'notContains'
  | 'startsWith'
  | 'endsWith'
  | 'eq'
  | 'neq'
  | 'empty'
  | 'notEmpty'

export type NumberOperator = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'between' | 'empty' | 'notEmpty'

export type DateOperator = 'on' | 'before' | 'after' | 'between' | 'empty' | 'notEmpty'

export type BooleanOperator = 'eq'

export type ConditionOperator = TextOperator | NumberOperator | DateOperator | BooleanOperator

/** Operators that need no operand at all. */
export const UNARY_OPERATORS = ['empty', 'notEmpty'] as const
/** Operators that need two operands (`value` and `value2`). */
export const BINARY_OPERATORS = ['between'] as const

export interface ConditionRule {
  operator: ConditionOperator
  value?: FilterValue
  /** Second operand, only for `between`. */
  value2?: FilterValue
}

/** Excel's checkbox list: pick which distinct values survive. */
export interface ValuesFilter {
  kind: 'values'
  /** `null` means "everything" — an unset filter. */
  include: FilterValue[] | null
  includeBlanks: boolean
}

/** Excel's "Text/Number/Date Filters…" submenu: operator-based rules. */
export interface ConditionsFilter {
  kind: 'conditions'
  op: 'and' | 'or'
  rules: ConditionRule[]
}

export type ColumnFilter = ValuesFilter | ConditionsFilter

/** One distinct value plus how many rows carry it. */
export interface FacetValue {
  value: FilterValue
  count: number
}

/* ------------------------------------------------------------------ *
 * Query state — the serializable description of what to show
 * ------------------------------------------------------------------ */

export interface QueryState {
  sort: SortRule[]
  filters: Record<string, ColumnFilter>
  /** 1-based. */
  page: number
  pageSize: number
  globalSearch: string
}

/* ------------------------------------------------------------------ *
 * Columns
 * ------------------------------------------------------------------ */

export type PinSide = 'left' | 'right'

export interface ColumnDef<TRow = Record<string, unknown>, TValue = unknown> {
  id: string
  header?: string
  /**
   * Pulls the sortable/filterable value out of a row. Defaults to
   * `row[id]` when omitted.
   */
  accessor?: (row: TRow) => TValue
  type?: ColumnDataType
  sortable?: boolean
  /** Overrides the type-derived comparator. */
  comparator?: (a: TValue, b: TValue) => number
  filterable?: boolean
  /**
   * Whether the global search box looks at this column. Defaults to
   * `filterable`, which is the usual intent, but the two are separable — an
   * internal id column can stay filterable without polluting search hits.
   */
  searchable?: boolean
  /** Fixed option list for `enum` columns; otherwise facets come from the data. */
  options?: FilterValue[]
  /** Formats the value for display and for the filter checklist. */
  format?: (value: TValue, row: TRow) => string
  width?: number
  minWidth?: number
  maxWidth?: number
  resizable?: boolean
  hideable?: boolean
  /** Whether the column can be dragged to a new position. Defaults to true. */
  reorderable?: boolean
  pinned?: PinSide | false
  align?: 'left' | 'center' | 'right'
}

/** A column after user-driven layout state (width, pin, order) is folded in. */
export interface ResolvedColumn<TRow = Record<string, unknown>> extends ColumnDef<TRow> {
  visible: boolean
  order: number
  resolvedWidth: number | undefined
  pinned: PinSide | false
  /** Sticky offset in px, only meaningful when pinned. */
  pinOffset: number
  sortDirection: SortDirection | false
  /** 1-based position within a multi-sort, or 0 when not sorted. */
  sortIndex: number
  hasFilter: boolean
}

/* ------------------------------------------------------------------ *
 * Data sources
 * ------------------------------------------------------------------ */

/** What a server fetcher receives and must honour. */
export interface FetchParams {
  query: QueryState
  signal: AbortSignal
}

export interface FetchResult<TRow> {
  rows: TRow[]
  /** Total rows matching the filters, across all pages. */
  total: number
}

/**
 * The seam that makes local and server data interchangeable. Components
 * consume this and never learn which implementation they were handed.
 */
export interface DataSource<TRow = Record<string, unknown>> {
  /** Rows for the current page only, ready to render. */
  rows: Readonly<Ref<TRow[]>> | ComputedRef<TRow[]>
  /** Row count after filtering — drives pagination. */
  total: Readonly<Ref<number>> | ComputedRef<number>
  loading: Readonly<Ref<boolean>> | ComputedRef<boolean>
  error: Readonly<Ref<unknown>> | ComputedRef<unknown>
  refresh: () => void
  /**
   * Distinct values for a column's filter checklist. Must apply every
   * *other* column's filter but not this column's own — that is what makes
   * the Excel checklist narrow as you filter elsewhere.
   */
  facets: (columnId: string) => Promise<FacetValue[]>
  /** True for server sources; lets the UI warn that facets are remote. */
  readonly remote: boolean
}

/* ------------------------------------------------------------------ *
 * Selection
 * ------------------------------------------------------------------ */

export type SelectionMode = 'single' | 'multiple'

/**
 * Explicit id list, or "everything matching the current filters minus these
 * exclusions" — the latter is the only sane way to select 12k server rows.
 */
export type SelectionState =
  | { mode: 'ids'; ids: RowId[] }
  | { mode: 'all-matching'; excluded: RowId[] }

export type HeaderCheckboxState = 'none' | 'some' | 'all'
