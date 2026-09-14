import type { ComputedRef, Raw, Ref } from 'vue'

/** Anything a row can be keyed by. */
export type RowId = string | number

/** Values that may appear inside a serialized filter. Keep this JSON-safe. */
export type FilterValue = string | number | boolean | null

/**
 * How a column's values behave. Drives which comparator sorts it and which
 * operators its filter panel offers.
 */
export type ColumnDataType = 'text' | 'number' | 'date' | 'boolean' | 'enum'

/**
 * Which control an editable column renders. Defaults from `type` — `number`
 * and `date` to their native inputs, `boolean` to a checkbox, an `enum` that
 * declared `options` to a select, a column that declared `asyncOptions` to the
 * dropdown that loads them a page at a time, and everything else to a text box.
 */
export type CellEditorKind =
  | 'text'
  | 'number'
  | 'date'
  | 'checkbox'
  | 'select'
  | 'async-select'
  | 'textarea'

/** 'asc' | 'desc'. Unsorted is the absence of a rule, not a third value. */
export type SortDirection = 'asc' | 'desc'

/** One sort key: a column id and a direction. */
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

/** Every operator across every column type. */
export type ConditionOperator = TextOperator | NumberOperator | DateOperator | BooleanOperator

/** Operators that need no operand at all. */
export const UNARY_OPERATORS = ['empty', 'notEmpty'] as const
/** Operators that need two operands (`value` and `value2`). */
export const BINARY_OPERATORS = ['between'] as const

/** An operator with up to two operands. */
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

/** Either kind of filter: a values checklist, or a set of condition rules. */
export type ColumnFilter = ValuesFilter | ConditionsFilter

/** One distinct value plus how many rows carry it. */
export interface FacetValue {
  value: FilterValue
  count: number
}

/* ------------------------------------------------------------------ *
 * Query state — the serializable description of what to show
 * ------------------------------------------------------------------ */

/**
 * The serialisable description of what to show. Put it in a URL and the table
 * is shareable.
 */
export interface QueryState {
  sort: SortRule[]
  filters: Record<string, ColumnFilter>
  /**
   * Column ids to group rows by, outermost level first — but only when
   * grouping is delegated to the data source (`groupMode: 'server'`).
   *
   * It sits in the query rather than in the column layout because delegated
   * grouping changes *which rows come back in which order*, so a server has to
   * honour it exactly as it honours `sort`. Client-side grouping never lands
   * here: it rearranges rows that are already loaded and is none of the
   * source's business, so this stays empty and nothing refetches.
   */
  groupBy: string[]
  /** 1-based. */
  page: number
  pageSize: number
  globalSearch: string
}

/* ------------------------------------------------------------------ *
 * Columns
 * ------------------------------------------------------------------ */

/** 'left' | 'right' — which edge a pinned column sticks to. */
export type PinSide = 'left' | 'right'

/**
 * A column as you declare it: accessor, type, format, aggregate, width, pin,
 * background.
 */
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
  /**
   * Options fetched a portion at a time instead of declared up front, from
   * `useAsyncOptions`. Renders the `async-select` editor.
   *
   * The counterpart to `options` rather than a variant of it, and the two are
   * mutually exclusive: `options` is the complete list, which is what lets the
   * filter checklist order itself by it and what lets `validateCell` reject a
   * value outside it. Neither is true of a list that arrives in pages, so this
   * one is read by the editor and by the cell's display text, and by nothing in
   * the filter or query pipeline.
   *
   * `Raw` because a column array handed to `ref()` would otherwise be walked
   * into and every ref inside this source unwrapped, which changes its type
   * and deep-proxies state that is not row data. `useAsyncOptions` marks what
   * it returns; a hand-built source has to say `markRaw` too.
   */
  asyncOptions?: Raw<AsyncOptionSource>
  /** Formats the value for display and for the filter checklist. */
  format?: (value: TValue, row: TRow) => string
  /**
   * Whether this column's cells can be edited. A function decides per row, so
   * a closed record or a row the user does not own can refuse.
   */
  editable?: boolean | ((row: TRow) => boolean)
  /**
   * Writes an edited value back, returning the **next row** rather than
   * mutating this one — the table hands rows out by reference and a caller's
   * `shallowRef` only notices a replacement.
   *
   * Defaults to `{ ...row, [id]: value }`. Required as soon as `accessor`
   * reads somewhere `row[id]` is not: a function cannot be inverted, so a
   * column reading `row.location.city` has to say how to write it back.
   */
  setValue?: (row: TRow, value: TValue) => TRow
  /**
   * Turns what the editor produced into the column's own value. Defaults from
   * `type`, through the same coercions the filters use.
   *
   * Return `undefined` to mean "this does not parse at all" — distinct from
   * `null`, which is a legitimately blank cell.
   */
  parse?: (input: unknown, row: TRow) => TValue | undefined
  /**
   * An error message, or `null` when the value is acceptable. Runs against the
   * parsed value, so it never has to re-do the coercion.
   */
  validate?: (value: TValue, row: TRow) => string | null
  /** Which control to edit with. Defaults from `type` and `options`. */
  editor?: CellEditorKind
  /** Rejects a blank, using the same `isBlank` that buckets them for filters. */
  required?: boolean
  /**
   * A fixed width in px. Declared, it is exactly what renders.
   *
   * Left off, the column is measured from what it holds and clamped into
   * `[minWidth ?? 60, maxWidth ?? defaultWidth]` — so an id column narrows to
   * its digits while a free-text one stops at the cap rather than running on.
   */
  width?: number
  /** Floor for a measured or resized width. Defaults to 60. */
  minWidth?: number
  /**
   * Ceiling for a measured width. Defaults to `useColumns`' own `defaultWidth`,
   * which is 160 — the width every undeclared column used to be.
   */
  maxWidth?: number
  /**
   * Takes the space left over when the columns do not fill their box.
   *
   * Without one the table is exactly as wide as its columns and the slack stays
   * empty; with several they share it equally. `width` outranks it, resizing
   * one fixes it at a number until `resetWidth`, and it is **ignored on a
   * pinned column** — sticky offsets are sums of real widths, and a column with
   * no width of its own cannot be summed.
   */
  flex?: boolean
  resizable?: boolean
  hideable?: boolean
  /** Whether the column can be dragged to a new position. Defaults to true. */
  reorderable?: boolean
  /** Whether the column may be grouped by. Defaults to true. */
  groupable?: boolean
  /**
   * The key rows are bucketed under when grouping by this column. Defaults to
   * the cell value collapsed through `toFilterValue`, which is what makes
   * `null`, `undefined` and `''` land in one "blank" bucket.
   *
   * Override it to group by something coarser than the cell — a date column
   * grouped by month, a number column grouped into bands.
   */
  groupValue?: (row: TRow) => FilterValue
  /** Labels a group header. Defaults to `format`, then `String(value)`. */
  groupLabel?: (value: FilterValue) => string
  /**
   * Aggregation shown for this column in group rows and in the footer.
   *
   * `sum` and `avg` coerce cells with `toNumber` and skip whatever will not
   * coerce; `min` and `max` use the column's comparator and report the winning
   * cell's own value, so a date column yields a date rather than a timestamp.
   */
  aggregate?: AggregateFn
  /**
   * Formats an aggregate for display. Defaults to `format` for a `min`/`max`
   * (which knows the row it came from), and to a plain number format otherwise
   * — `format` cannot stand in for a sum, having no row to be handed.
   */
  aggregateFormat?: (result: AggregateResult<TRow>) => string
  pinned?: PinSide | false
  align?: 'left' | 'center' | 'right'
  /**
   * Paints this column's body cells. Any CSS colour value, alpha included —
   * it reaches the DOM as the `--vtc-column-bg` custom property and the preset
   * paints it as a layer over the row's stripe, so `rgb(37 99 235 / 0.08)`
   * tints the column while hover and selection still read through it.
   */
  background?: string
  /** Same for the header cell. Defaults to the preset's header background. */
  headerBackground?: string
  /**
   * The header band this column sits under, by id. Columns naming the same
   * band get one spanning cell above them, and the header grows a second row.
   *
   * The band's label and collapse behaviour come from a matching
   * `ColumnGroupDef`; an id nobody declared still bands, headed by the id.
   */
  group?: string
}

/** A column after user-driven layout state (width, pin, order) is folded in. */
export interface ResolvedColumn<TRow = Record<string, unknown>> extends ColumnDef<TRow> {
  visible: boolean
  order: number
  /**
   * The width to render, in px, or `undefined` for a column that takes the
   * leftover space — a `flex` column, or one a standalone caller left blank.
   */
  resolvedWidth: number | undefined
  pinned: PinSide | false
  /** Sticky offset in px, only meaningful when pinned. */
  pinOffset: number
  sortDirection: SortDirection | false
  /** 1-based position within a multi-sort, or 0 when not sorted. */
  sortIndex: number
  hasFilter: boolean
  /**
   * Withheld because its header band is folded shut, as opposed to `visible`,
   * which is the user's own choice about this one column.
   *
   * The two are kept apart so that expanding a band cannot resurrect a column
   * the user had switched off, and so the column menu keeps reporting what the
   * user asked for rather than what a band is currently doing.
   */
  collapsed: boolean
}

/* ------------------------------------------------------------------ *
 * Header bands
 * ------------------------------------------------------------------ */

/**
 * A band of columns above the header row: its label, its nesting, and what it
 * folds down to.
 *
 * Purely decoration over the ids columns already name in `ColumnDef.group` —
 * a band exists because a column claims it, not because one of these was
 * declared. Declaring one gives it a readable header and a say in how it
 * collapses.
 */
export interface ColumnGroupDef {
  id: string
  /** Defaults to the id, so an undeclared band still reads as something. */
  header?: string
  /** Nests this band under another one, giving a third header row and beyond. */
  parent?: string
  /** Whether the band offers a collapse toggle. Defaults to true. */
  collapsible?: boolean
  /**
   * The column, or columns, that survive a collapse. Defaults to the band's
   * first member in *declared* order — not display order, so dragging a column
   * about cannot change which one a folded band shows.
   *
   * A band always keeps at least one column. That is what lets collapsing be a
   * plain subtraction from the visible list: the column count stays honest, so
   * `<colgroup>`, every body row and the footer stay aligned with no special
   * case for "a band that is showing nothing".
   */
  collapseTo?: string | string[]
  /**
   * Paints this band's header cell, reaching the DOM as `--vtc-column-bg` just
   * as `ColumnDef.headerBackground` does.
   */
  background?: string
  /**
   * Colours the rule drawn where this band's run of columns ends, overriding
   * `--vtc-band-border-color` on the cells either side of it.
   *
   * Travels as a custom property rather than as a `border-color` of its own,
   * for the reason `background` travels as one: an inline border would outrank
   * every state rule and leave that edge unable to respond to anything.
   */
  borderColor?: string
  /**
   * Widens — or with `0px` removes — this band's rule, as
   * `--vtc-band-border-width`. Give it a unit: a bare `0` is not a length, and
   * an invalid value takes the whole `border-right` with it.
   */
  borderWidth?: string
  /**
   * An extra class on this band's header cells, and on every run of them when
   * a pin or a drag has split the band in two.
   *
   * Header cells only. A class cannot follow a band down into the body, because
   * a `<td>` belongs to a column and knows nothing about the bands above it —
   * `borderColor` and `background` are the hooks that do reach that far.
   */
  class?: string
}

/** A band's spanning `<th>`: which columns it covers, and where it sits. */
export interface HeaderGroupCell<TRow = Record<string, unknown>> {
  kind: 'group'
  /** The band, with `header` defaulted to its id. */
  group: ColumnGroupDef
  /**
   * Stable identity for this cell. Carries the band's whole path, its pin side
   * and its first column, so a band split in two by a reorder or by the pin
   * boundary yields two keys rather than two nodes claiming one.
   */
  key: string
  colspan: number
  /**
   * How many columns the *band* covers across the whole header row, which is
   * more than `colspan` whenever a reorder or the pin boundary has split it
   * into several cells.
   *
   * A cell cannot see its own siblings, and whether a band is worth folding is
   * a property of the band: a two-column band split into two one-column cells
   * still has something to put away.
   */
  totalColumns: number
  /** The columns beneath this cell, in display order. */
  columns: ResolvedColumn<TRow>[]
  pinned: PinSide | false
  /** Sticky offset in px, only meaningful when pinned. */
  pinOffset: number
  /** Which header row it sits in, 0-based. */
  depth: number
}

/** One column's `<th>`, spanning down to the body from wherever its band left it. */
export interface HeaderColumnCell<TRow = Record<string, unknown>> {
  kind: 'column'
  key: string
  column: ResolvedColumn<TRow>
  /**
   * How many header rows this cell spans. A column under no band, in a header
   * two rows deep, spans both — otherwise the row beneath it would be short a
   * cell and every column after it would slide out of place.
   */
  rowspan: number
  /** Which header row it sits in, 0-based. */
  depth: number
}

/** Either kind of header cell: a band's spanning cell, or a column's own. */
export type HeaderCell<TRow = Record<string, unknown>> =
  | HeaderGroupCell<TRow>
  | HeaderColumnCell<TRow>

/** One `<tr>` of the header, as cells in display order. */
export type HeaderRow<TRow = Record<string, unknown>> = HeaderCell<TRow>[]

/* ------------------------------------------------------------------ *
 * Grouping
 * ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ *
 * Aggregation
 * ------------------------------------------------------------------ */

/** The aggregations a column can declare: `sum` | `avg` | `min` | `max`. */
export type AggregateFn = 'sum' | 'avg' | 'min' | 'max'

/** One computed aggregate, ready to render. */
export interface AggregateResult<TRow = Record<string, unknown>> {
  fn: AggregateFn
  /**
   * A number for `sum` and `avg`; the winning cell's own value for `min` and
   * `max`; `null` when no row carried anything aggregable.
   */
  value: unknown
  /**
   * The row a `min`/`max` came from, so the column's `format` can render the
   * value in the context it belongs to. Absent for `sum` and `avg`, which
   * describe a set rather than a row.
   */
  row?: TRow
  /**
   * How many rows actually contributed. Blanks are skipped, so this is the
   * denominator an `avg` was divided by — and `0` means the result is `null`.
   */
  sampleCount: number
}

/**
 * Who performs the grouping: `'client'` bands the rows already loaded,
 * `'server'` delegates it and keeps bands whole across pages.
 *
 *  - `'client'` — the table bands the rows it already has. Nothing enters the
 *    query, so no refetch happens and a server never hears about it. Bands
 *    describe the loaded rows, and a group larger than the page shows only the
 *    part that is loaded. This is the default.
 *  - `'server'` — the grouping goes into `QueryState.groupBy`, and the data
 *    source performs it: `useServerDataSource` sends it and refetches,
 *    `useLocalDataSource` sorts the whole dataset by it. Groups then stay whole
 *    across pages, and counts describe the entire group.
 */
export type GroupMode = 'client' | 'server'

/** One bucket of rows sharing the same value on a grouped column. */
export interface RowGroup<TRow = Record<string, unknown>> {
  /**
   * Stable identity, derived from the values of every level down to this one.
   * Collapse state is keyed by it, so it must not change when the page does.
   */
  key: string
  /** The grouped column at this level. */
  columnId: string
  /** This level's value, already collapsed through `toFilterValue`. */
  value: FilterValue
  /** The values of every level down to and including this one. */
  path: FilterValue[]
  /** 0 for the outermost level. */
  depth: number
  /** Display text for the header — `groupLabel`, then `format`, then the value. */
  label: string
  /** Leaf rows beneath this group, among the rows that were grouped. */
  rows: TRow[]
  /** `rows.length` — how many landed here out of what was handed in. */
  count: number
  /**
   * Rows in this group across the *whole* filtered dataset, when the data
   * source can say (local ones can; a server one only if it reports it).
   * Falls back to `count`, so a group split across two pages still reads
   * correctly whenever the true total is available.
   */
  totalCount: number
  /**
   * Per-column aggregates, keyed by column id — only the columns that declared
   * an `aggregate`, so `{}` when none did.
   */
  aggregates: Record<string, AggregateResult<TRow>>
}

/**
 * A rendered line: a group header, an actual row, or a row's open detail panel.
 * Flattening the tree into one list is what lets the table stay a plain
 * `<tbody>` of `<tr>`s.
 *
 * A `detail` line is a *line*, not a decoration on the row above it, precisely
 * so that windowing can count it: `VirtualBody` measures the rendered rows
 * against the items it handed out and gives up when the two disagree, so a
 * detail `<tr>` smuggled in beside its row would silently switch measurement
 * off and leave gaps. `withDetailRows` is what inserts them.
 */
export type DisplayRow<TRow = Record<string, unknown>> =
  | { kind: 'group'; group: RowGroup<TRow> }
  | {
      kind: 'row'
      row: TRow
      /** Position in the array that was grouped — survives regrouping, so it is a stable stripe parity. */
      index: number
      /** How many group levels sit above this row; 0 when grouping is off. */
      depth: number
    }
  | {
      kind: 'detail'
      /** The row this panel belongs to — the line directly above it. */
      row: TRow
      /** The parent row's `index`, so the pair stripes as one. */
      index: number
      /** The parent row's `depth`, so the panel indents with its band. */
      depth: number
    }

/* ------------------------------------------------------------------ *
 * Async options
 * ------------------------------------------------------------------ */

/** One choice in a dropdown: the value stored, and the text shown for it. */
export interface AsyncOption {
  value: FilterValue
  label: string
  /** Rendered, but not choosable. */
  disabled?: boolean
}

/**
 * What a fetcher is told when the dropdown asks for the next portion.
 *
 * Everything an offset, a page-number or a cursor API could need is here at
 * once, because the library holds no opinion about which one you have: read
 * the two fields your endpoint speaks and ignore the rest.
 */
export interface OptionPageRequest {
  /** The search box's text, or `''`. A change resets the list to the first portion. */
  search: string
  /** 1-based, and only advanced by a portion that actually arrived. */
  page: number
  /** How many options are already held — the offset, for a limit/offset API. */
  loaded: number
  /** Whatever the previous portion returned as `cursor`; `undefined` on the first. */
  cursor: unknown
  /** Aborted when a newer request supersedes this one, or the scope goes away. */
  signal: AbortSignal
}

/**
 * One portion of options, and however this endpoint says whether there are
 * more.
 *
 * The three answers are read in one order, stated once so that no caller has
 * to declare which protocol it speaks: an explicit `hasMore` wins; failing
 * that a `total` means "more while fewer are loaded than that"; failing both,
 * an empty portion is the end of the list.
 */
export interface OptionPage {
  options: AsyncOption[]
  hasMore?: boolean
  /** Options matching the search across every portion. */
  total?: number
  /** Handed back in the next request, for a cursor-paged endpoint. */
  cursor?: unknown
}

/** Fetches one portion of a dropdown's options. */
export type AsyncOptionFetcher = (request: OptionPageRequest) => Promise<OptionPage>

/**
 * A growing list of options, plus what a scrolling dropdown needs to grow it.
 * `useAsyncOptions` returns this; `ColumnDef.asyncOptions` holds one.
 */
export interface AsyncOptionSource {
  /** Every option loaded so far, in the order the portions arrived. */
  options: Readonly<Ref<readonly AsyncOption[]>> | ComputedRef<readonly AsyncOption[]>
  /** The search box's text. Writing it resets the list, debounced. */
  search: Ref<string>
  loading: Readonly<Ref<boolean>> | ComputedRef<boolean>
  /** True only for the first portion, when there is nothing to show yet. */
  initialLoading: ComputedRef<boolean>
  /** True while a *further* portion is on its way — the list's footer, not its body. */
  loadingMore: ComputedRef<boolean>
  hasMore: ComputedRef<boolean>
  error: Readonly<Ref<unknown>> | ComputedRef<unknown>
  /**
   * Ask for the next portion.
   *
   * A no-op while a request is in flight, while a search is still settling,
   * and once everything is loaded — so a scroll handler can call it on every
   * event without counting or debouncing anything itself.
   */
  loadMore: () => void
  /** Back to the first portion of the current search. */
  reset: () => void
  /**
   * The label for a value, or `undefined` while there is none.
   *
   * What lets a closed cell holding an id show a name: every portion loaded
   * and every option picked is remembered here. A value no portion carried is
   * looked up through `resolveOptions` — batched across the render that found
   * it, and asked about only once — so **reading this may schedule a request**.
   * Without a `resolveOptions` there is nothing to ask, and the value reads as
   * itself.
   */
  labelFor: (value: FilterValue) => string | undefined
  /** Remember one option's label without having loaded it. */
  remember: (option: AsyncOption) => void
}

/* ------------------------------------------------------------------ *
 * Data sources
 * ------------------------------------------------------------------ */

/** What a server fetcher receives and must honour. */
export interface FetchParams {
  query: QueryState
  signal: AbortSignal
}

/** What it must return: rows for the page, and the total across all pages. */
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
  /**
   * Row counts per group path across the entire filtered set, keyed the way
   * `RowGroup.key` is. Optional on purpose: only a source holding all the rows
   * can answer it, and a group header degrades to its per-page count when it
   * goes unanswered.
   */
  groupCounts?: (groupBy: string[]) => Map<string, number>
  /**
   * Per-group aggregates across the entire filtered set, keyed the way
   * `RowGroup.key` is, plus the whole-set total under `ROOT_GROUP_KEY`.
   * Optional for the same reason as `groupCounts`: only a source holding every
   * row can answer it, and a group row falls back to aggregating the rows it
   * was handed when it goes unanswered.
   */
  groupAggregates?: (
    groupBy: string[],
  ) => Map<string, Record<string, AggregateResult<TRow>>>
  /** True for server sources; lets the UI warn that facets are remote. */
  readonly remote: boolean
}

/* ------------------------------------------------------------------ *
 * Selection
 * ------------------------------------------------------------------ */

/** Whether one row at a time can be selected, or many. */
export type SelectionMode = 'single' | 'multiple'

/**
 * Explicit id list, or "everything matching the current filters minus these
 * exclusions" — the latter is the only sane way to select 12k server rows.
 */
export type SelectionState =
  | { mode: 'ids'; ids: RowId[] }
  | { mode: 'all-matching'; excluded: RowId[] }

/** 'none' | 'some' | 'all' — the tri-state header checkbox. */
export type HeaderCheckboxState = 'none' | 'some' | 'all'
