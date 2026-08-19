/**
 * Every name `src/index.ts` exports, with what it is and what it is for.
 *
 * Kept as data rather than as markup so the reference can be *rendered by the
 * library it documents* — the API view is a `DataTable` over this array, which
 * makes the docs a working example of the thing being documented.
 *
 * `tests/apiReference.spec.ts` diffs this against the real export list in both
 * directions, so it cannot drift: adding an export without describing it fails,
 * and describing a name that no longer exists fails too.
 */

export type ApiKind = 'composable' | 'function' | 'component' | 'constant' | 'type'

export type ApiLayer = 'core' | 'filters' | 'sorting' | 'grouping' | 'aggregation' | 'utils' | 'primitives' | 'preset' | 'types'

export interface ApiEntry extends Record<string, unknown> {
  name: string
  layer: ApiLayer
  kind: ApiKind
  summary: string
}

export const API_LAYERS: ApiLayer[] = [
  'core',
  'filters',
  'sorting',
  'grouping',
  'aggregation',
  'utils',
  'primitives',
  'preset',
  'types',
]

export const API_KINDS: ApiKind[] = ['composable', 'function', 'component', 'constant', 'type']

export const apiReference: ApiEntry[] = [
  /* ------------------------------------------------------------------ core */
  { name: 'useTableState', layer: 'core', kind: 'composable', summary: 'Owns the QueryState — sort, filters, grouping, paging, search. Knows nothing about where rows come from.' },
  { name: 'createQueryState', layer: 'core', kind: 'function', summary: 'A fresh QueryState with defaults filled in. Useful for seeding a store or a URL.' },
  { name: 'TableState', layer: 'core', kind: 'type', summary: 'What useTableState returns: refs plus the mutators that keep paging honest.' },
  { name: 'TableStateOptions', layer: 'core', kind: 'type', summary: 'pageSize, initialGroupBy, groupMode, and an external ref to mirror.' },

  { name: 'useColumns', layer: 'core', kind: 'composable', summary: 'Resolves column definitions against user layout — visibility, order, widths, pins — and computes sticky offsets.' },
  { name: 'UseColumnsOptions', layer: 'core', kind: 'type', summary: 'Sort and filter lookups to decorate columns with, plus initial layout and storage.' },
  { name: 'UseColumnsResult', layer: 'core', kind: 'type', summary: 'all / visible columns and every layout mutator.' },
  { name: 'ColumnLayoutState', layer: 'core', kind: 'type', summary: 'The serialisable part of a layout: hidden ids, order, widths, pins.' },

  { name: 'readColumnLayout', layer: 'core', kind: 'function', summary: 'Reads a saved layout out of storage, sanitised.' },
  { name: 'writeColumnLayout', layer: 'core', kind: 'function', summary: 'Persists a layout, silently doing nothing when storage is full or absent.' },
  { name: 'clearColumnLayout', layer: 'core', kind: 'function', summary: 'Forgets the saved layout. The in-memory one is untouched.' },
  { name: 'sanitizeColumnLayout', layer: 'core', kind: 'function', summary: 'Drops anything malformed from a stored layout rather than trusting it.' },
  { name: 'normalizeColumnStorage', layer: 'core', kind: 'function', summary: 'Resolves the storage options into a concrete key, fields and StorageLike.' },
  { name: 'DEFAULT_COLUMN_LAYOUT_FIELDS', layer: 'core', kind: 'constant', summary: 'The four layout fields persisted unless you narrow them.' },
  { name: 'ColumnStorageOptions', layer: 'core', kind: 'type', summary: 'Storage key, which fields to keep, and where to keep them.' },
  { name: 'ColumnLayoutField', layer: 'core', kind: 'type', summary: "One of 'hidden' | 'order' | 'widths' | 'pinned'." },
  { name: 'StorageLike', layer: 'core', kind: 'type', summary: 'The slice of the Storage API used — pass sessionStorage, or a stub.' },

  { name: 'useColumnDnd', layer: 'core', kind: 'composable', summary: 'Pointer-driven column reordering with a drag threshold, drop sides, Escape to cancel and keyboard moves.' },
  { name: 'UseColumnDnd', layer: 'core', kind: 'type', summary: 'Drag state and handlers for a header cell to bind.' },
  { name: 'UseColumnDndOptions', layer: 'core', kind: 'type', summary: 'The column order, a move callback, and canDrag / canDrop guards.' },
  { name: 'ColumnDropTarget', layer: 'core', kind: 'type', summary: 'The column a drag is currently over, and which side of it.' },
  { name: 'DropSide', layer: 'core', kind: 'type', summary: "'before' | 'after' — which edge of the target the column lands on." },

  { name: 'useRowGrouping', layer: 'core', kind: 'composable', summary: 'Bands rows into groups and owns collapse state. Builds the tree once; folding a band only re-walks it.' },
  { name: 'UseRowGrouping', layer: 'core', kind: 'type', summary: 'displayRows, groups, overall aggregates and the collapse controls.' },
  { name: 'UseRowGroupingOptions', layer: 'core', kind: 'type', summary: 'What to group by, whole-set totals and aggregates, and the initial collapse state.' },

  { name: 'useLocalDataSource', layer: 'core', kind: 'composable', summary: 'Client-side filter → sort → slice, each stage its own computed. Paging redoes neither of the first two.' },
  { name: 'LocalDataSource', layer: 'core', kind: 'type', summary: 'A DataSource plus filteredRows, synchronous facets, and whole-set group counts.' },
  { name: 'LocalDataSourceOptions', layer: 'core', kind: 'type', summary: 'nullsLast, and debounceMs to coalesce the global search.' },

  { name: 'useServerDataSource', layer: 'core', kind: 'composable', summary: 'Fetch-backed rows with debouncing, abort, race-safety and keepPreviousData. Same surface as the local one.' },
  { name: 'ServerDataSource', layer: 'core', kind: 'type', summary: 'A DataSource plus initialLoading, true only before anything has arrived.' },
  { name: 'ServerDataSourceOptions', layer: 'core', kind: 'type', summary: 'debounceMs, keepPreviousData, immediate, fetchFacets and onError.' },

  { name: 'useRowSelection', layer: 'core', kind: 'composable', summary: 'Set-backed selection with shift-ranges, tri-state header, and an "all matching minus exclusions" mode for server data.' },
  { name: 'UseRowSelection', layer: 'core', kind: 'type', summary: 'Selection state, predicates and mutators.' },
  { name: 'UseRowSelectionOptions', layer: 'core', kind: 'type', summary: 'Row identity, selectability, mode, and an initial selection.' },

  { name: 'usePagination', layer: 'core', kind: 'composable', summary: 'Page maths and the elided page list — 1 … 4 5 6 … 80.' },
  { name: 'UsePagination', layer: 'core', kind: 'type', summary: 'Current page, bounds, the item list, and the navigation calls.' },
  { name: 'UsePaginationOptions', layer: 'core', kind: 'type', summary: 'siblingCount around the current page, and an onChange callback.' },
  { name: 'PageItem', layer: 'core', kind: 'type', summary: 'A page number or an ellipsis, ready to render.' },

  { name: 'provideTableContext', layer: 'core', kind: 'function', summary: 'Publishes a TableContext so primitives beneath can find it.' },
  { name: 'useTableContext', layer: 'core', kind: 'function', summary: 'The context, or undefined — what lets a primitive work standalone.' },
  { name: 'requireTableContext', layer: 'core', kind: 'function', summary: 'The context, or a thrown error, for the primitives that genuinely need one.' },
  { name: 'TableContextKey', layer: 'core', kind: 'constant', summary: 'The injection key, exported so you can provide a context by hand.' },
  { name: 'TableContext', layer: 'core', kind: 'type', summary: 'Everything a primitive can reach: state, columns, source, selection, grouping, cell readers.' },

  /* --------------------------------------------------------------- filters */
  { name: 'valuesFilter', layer: 'filters', kind: 'function', summary: "Excel's checkbox list: which distinct values survive." },
  { name: 'conditionsFilter', layer: 'filters', kind: 'function', summary: "Excel's operator rules, combined with and / or." },
  { name: 'isEmptyFilter', layer: 'filters', kind: 'function', summary: 'Whether a filter constrains anything at all — a half-built one must not blank the table.' },
  { name: 'isIncompleteRule', layer: 'filters', kind: 'function', summary: 'Whether a rule is still missing an operand.' },
  { name: 'isUnaryOperator', layer: 'filters', kind: 'function', summary: 'Operators that take no operand: empty, notEmpty.' },
  { name: 'isBinaryOperator', layer: 'filters', kind: 'function', summary: 'Operators that take two: between.' },
  { name: 'normalizeFilter', layer: 'filters', kind: 'function', summary: 'Collapses a filter to a canonical shape, dropping incomplete rules.' },
  { name: 'pruneFilters', layer: 'filters', kind: 'function', summary: 'Strips every filter that constrains nothing, so "active filters" means what it says.' },
  { name: 'operatorsFor', layer: 'filters', kind: 'function', summary: 'The operators a column type offers — contains for text, between for numbers.' },
  { name: 'defaultOperator', layer: 'filters', kind: 'function', summary: 'The operator a fresh rule on this type starts with.' },
  { name: 'OPERATOR_LABELS', layer: 'filters', kind: 'constant', summary: 'Human-readable names for every operator.' },
  { name: 'matchesFilter', layer: 'filters', kind: 'function', summary: 'Does one raw cell value survive one column filter?' },
  { name: 'matchesRule', layer: 'filters', kind: 'function', summary: 'Does one value satisfy one condition rule, at this type?' },
  { name: 'matchesSearch', layer: 'filters', kind: 'function', summary: 'Case-insensitive substring match across a row’s searchable cells.' },
  { name: 'compileFilter', layer: 'filters', kind: 'function', summary: 'Pre-builds a filter into a predicate once, instead of rebuilding its value set per row.' },
  { name: 'compileSearch', layer: 'filters', kind: 'function', summary: 'The search test with the needle lowered once rather than once per row.' },
  { name: 'computeFacets', layer: 'filters', kind: 'function', summary: "Distinct values with counts, scoped by every *other* column's filter — that is what makes the checklist narrow." },
  { name: 'filterRows', layer: 'filters', kind: 'function', summary: 'Rows surviving every filter and the global search, with one column optionally skipped.' },

  /* --------------------------------------------------------------- sorting */
  { name: 'sortRows', layer: 'sorting', kind: 'function', summary: 'Multi-key sort. Reads each cell once and projects numeric keys once, rather than deriving inside the comparator.' },
  { name: 'applySortRule', layer: 'sorting', kind: 'function', summary: 'Adds, flips or removes one key, additively or not — the whole shift-click behaviour.' },
  { name: 'nextDirection', layer: 'sorting', kind: 'function', summary: 'Cycles asc → desc → unsorted.' },
  { name: 'comparatorFor', layer: 'sorting', kind: 'function', summary: 'The comparator a column type sorts by.' },
  { name: 'sortKeyFor', layer: 'sorting', kind: 'function', summary: 'A numeric key for number / date / boolean columns, so a value is projected per row instead of per comparison.' },
  { name: 'compareText', layer: 'sorting', kind: 'function', summary: 'Natural ordering through a shared Intl.Collator: "Item 2" before "Item 10".' },
  { name: 'compareNumber', layer: 'sorting', kind: 'function', summary: 'Numeric ordering; anything uncoercible sorts last.' },
  { name: 'compareDate', layer: 'sorting', kind: 'function', summary: 'Chronological ordering, with bare YYYY-MM-DD read as local midnight.' },
  { name: 'compareBoolean', layer: 'sorting', kind: 'function', summary: 'false before true, with blanks last.' },
  { name: 'readValue', layer: 'sorting', kind: 'function', summary: "A column's value for a row: its accessor, or row[id]." },
  { name: 'SortOptions', layer: 'sorting', kind: 'type', summary: 'nullsLast — blanks stay at the bottom in both directions by default.' },

  /* -------------------------------------------------------------- grouping */
  { name: 'groupedSort', layer: 'grouping', kind: 'function', summary: 'The grouped columns first, then the user’s own keys — what keeps a band contiguous.' },
  { name: 'groupSortRules', layer: 'grouping', kind: 'function', summary: 'Only the grouping keys, so rows gather into bands without their in-band order changing.' },
  { name: 'buildGroupTree', layer: 'grouping', kind: 'function', summary: 'The expensive half: buckets rows level by level and resolves each band’s label, count and aggregates.' },
  { name: 'flattenTree', layer: 'grouping', kind: 'function', summary: 'The cheap half: walks a built tree under the current collapse state.' },
  { name: 'flattenGroups', layer: 'grouping', kind: 'function', summary: 'Build and walk in one call, for callers doing it once.' },
  { name: 'groupValueOf', layer: 'grouping', kind: 'function', summary: 'The bucket a row falls into for one column, with every flavour of blank collapsed into one.' },
  { name: 'groupPathKey', layer: 'grouping', kind: 'function', summary: 'Stable identity for a band, built from every level above it.' },
  { name: 'groupKeys', layer: 'grouping', kind: 'function', summary: 'Every group key at every depth, ignoring collapse — what "collapse all" needs.' },
  { name: 'countGroups', layer: 'grouping', kind: 'function', summary: 'Rows per group key across a whole dataset, so a header does not shrink to the page.' },
  { name: 'BLANK_GROUP_LABEL', layer: 'grouping', kind: 'constant', summary: 'What a blank band is called when the column says nothing better.' },
  { name: 'ROOT_GROUP_KEY', layer: 'grouping', kind: 'constant', summary: 'The empty group path — where whole-set figures are filed.' },
  { name: 'GroupingOptions', layer: 'grouping', kind: 'type', summary: 'Collapse predicate, supplied totals and aggregates, and the blank label.' },
  { name: 'GroupTreeOptions', layer: 'grouping', kind: 'type', summary: 'The same, minus the part that folds bands shut.' },
  { name: 'GroupTree', layer: 'grouping', kind: 'type', summary: 'The grouping before anything is folded: nodes, the rows, and each row’s position.' },
  { name: 'GroupNode', layer: 'grouping', kind: 'type', summary: 'One band and the bands nested inside it.' },

  /* ----------------------------------------------------------- aggregation */
  { name: 'aggregateValue', layer: 'aggregation', kind: 'function', summary: "One column's aggregate over a set of rows." },
  { name: 'aggregateRow', layer: 'aggregation', kind: 'function', summary: 'Every declared aggregate over one set of rows, keyed by column id.' },
  { name: 'aggregateGroups', layer: 'aggregation', kind: 'function', summary: 'Aggregates per group key at every depth, plus the whole set under ROOT_GROUP_KEY.' },
  { name: 'formatAggregate', layer: 'aggregation', kind: 'function', summary: "Renders a result through the column's aggregateFormat, or format for a min/max." },

  /* ----------------------------------------------------------------- utils */
  { name: 'isBlank', layer: 'utils', kind: 'function', summary: 'null, undefined or the empty string — the three that must bucket together.' },
  { name: 'toNumber', layer: 'utils', kind: 'function', summary: 'A number, or undefined. Never NaN, so "skip me" is expressible.' },
  { name: 'toTime', layer: 'utils', kind: 'function', summary: 'Milliseconds since epoch, reading bare YYYY-MM-DD as local midnight rather than UTC.' },
  { name: 'toIsoDate', layer: 'utils', kind: 'function', summary: 'YYYY-MM-DD in local time — the facet key for date columns.' },
  { name: 'toBoolean', layer: 'utils', kind: 'function', summary: 'true/false from booleans, numbers, or the usual strings.' },
  { name: 'toFilterValue', layer: 'utils', kind: 'function', summary: 'Collapses a cell into the JSON-safe form filters and facets use.' },
  { name: 'startOfDay', layer: 'utils', kind: 'function', summary: 'Local midnight for the calendar day a value falls on.' },
  { name: 'facetKey', layer: 'utils', kind: 'function', summary: "A stable map key where null and the string 'null' cannot collide." },

  /* ------------------------------------------------------------ primitives */
  { name: 'TableRoot', layer: 'primitives', kind: 'component', summary: 'Wires everything together and renders nothing of its own — the slot decides the markup entirely.' },
  { name: 'TableGrid', layer: 'primitives', kind: 'component', summary: 'The <table> plus a <colgroup> driven by resolved widths, so sizing survives resize and pinning.' },
  { name: 'TableHeaderCell', layer: 'primitives', kind: 'component', summary: 'A <th> with aria-sort, pin offsets and the drag/resize hooks.' },
  { name: 'TableCell', layer: 'primitives', kind: 'component', summary: 'A <td> sharing the header’s pin logic, so columns stay aligned.' },
  { name: 'TableRow', layer: 'primitives', kind: 'component', summary: 'A body row that resolves each cell’s value and text once and hands both to the slot.' },
  { name: 'TableGroupRow', layer: 'primitives', kind: 'component', summary: 'A band header: the toggle and label, then aggregates under the columns they describe.' },
  { name: 'SortTrigger', layer: 'primitives', kind: 'component', summary: 'The clickable header label. Shift-click stacks sort keys.' },
  { name: 'ColumnFilterPopover', layer: 'primitives', kind: 'component', summary: 'The funnel and its panel, teleported out of the scroll container.' },
  { name: 'ValueListFilter', layer: 'primitives', kind: 'component', summary: "Excel's checklist, working on a draft until Apply." },
  { name: 'ConditionFilter', layer: 'primitives', kind: 'component', summary: 'Operator rules combined with and / or.' },
  { name: 'ColumnResizeHandle', layer: 'primitives', kind: 'component', summary: 'Pointer and keyboard column resizing, as a separator role.' },
  { name: 'ColumnDragGhost', layer: 'primitives', kind: 'component', summary: 'The floating label that follows a dragged column.' },
  { name: 'ColumnVisibilityMenu', layer: 'primitives', kind: 'component', summary: 'Show/hide and reorder columns. The one primitive that truly needs a table context.' },
  { name: 'RowGroupMenu', layer: 'primitives', kind: 'component', summary: 'Pick grouping columns and their nesting order.' },
  { name: 'ActiveFilters', layer: 'primitives', kind: 'component', summary: 'A chip per active filter, each clearing its own.' },
  { name: 'TablePagination', layer: 'primitives', kind: 'component', summary: 'Page buttons, the row range, and a page-size select.' },
  { name: 'SelectionCheckbox', layer: 'primitives', kind: 'component', summary: 'A checkbox that tracks indeterminate, and stays in step when the parent refuses a change.' },

  /* ---------------------------------------------------------------- preset */
  { name: 'DataTable', layer: 'preset', kind: 'component', summary: 'Everything assembled, every region a named slot. Owns the default theme; imports its own CSS.' },

  /* ----------------------------------------------------------------- types */
  { name: 'RowId', layer: 'types', kind: 'type', summary: 'string | number — anything a row can be keyed by.' },
  { name: 'FilterValue', layer: 'types', kind: 'type', summary: 'The JSON-safe values that may appear inside a serialised filter.' },
  { name: 'ColumnDataType', layer: 'types', kind: 'type', summary: "text | number | date | boolean | enum — picks the comparator and the operators." },
  { name: 'SortDirection', layer: 'types', kind: 'type', summary: "'asc' | 'desc'. Unsorted is the absence of a rule, not a third value." },
  { name: 'SortRule', layer: 'types', kind: 'type', summary: 'One sort key: a column id and a direction.' },
  { name: 'ConditionOperator', layer: 'types', kind: 'type', summary: 'Every operator across every column type.' },
  { name: 'ConditionRule', layer: 'types', kind: 'type', summary: 'An operator with up to two operands.' },
  { name: 'ValuesFilter', layer: 'types', kind: 'type', summary: 'The checklist filter. include: null means "everything".' },
  { name: 'ConditionsFilter', layer: 'types', kind: 'type', summary: 'Operator rules plus how to combine them.' },
  { name: 'ColumnFilter', layer: 'types', kind: 'type', summary: 'Either kind of filter.' },
  { name: 'FacetValue', layer: 'types', kind: 'type', summary: 'One distinct value and how many rows carry it.' },
  { name: 'QueryState', layer: 'types', kind: 'type', summary: 'The serialisable description of what to show. Put it in a URL and the table is shareable.' },
  { name: 'PinSide', layer: 'types', kind: 'type', summary: "'left' | 'right' — which edge a pinned column sticks to." },
  { name: 'ColumnDef', layer: 'types', kind: 'type', summary: 'A column as you declare it: accessor, type, format, aggregate, width, pin, background.' },
  { name: 'ResolvedColumn', layer: 'types', kind: 'type', summary: 'A column with user layout folded in: visibility, order, width, pin offset, sort state.' },
  { name: 'RowGroup', layer: 'types', kind: 'type', summary: 'One band: its key, path, label, rows, counts and aggregates.' },
  { name: 'DisplayRow', layer: 'types', kind: 'type', summary: 'A rendered line — a band header or a row — so <tbody> stays one flat list.' },
  { name: 'GroupMode', layer: 'types', kind: 'type', summary: "'client' bands the loaded rows; 'server' delegates and keeps bands whole across pages." },
  { name: 'AggregateFn', layer: 'types', kind: 'type', summary: 'sum | avg | min | max.' },
  { name: 'AggregateResult', layer: 'types', kind: 'type', summary: 'A computed aggregate, with the row a min/max came from and how many rows contributed.' },
  { name: 'FetchParams', layer: 'types', kind: 'type', summary: 'What a server fetcher receives: the query and an AbortSignal.' },
  { name: 'FetchResult', layer: 'types', kind: 'type', summary: 'What it must return: rows for the page, and the total across all pages.' },
  { name: 'DataSource', layer: 'types', kind: 'type', summary: 'The seam that makes local and server data interchangeable.' },
  { name: 'SelectionMode', layer: 'types', kind: 'type', summary: "'single' | 'multiple'." },
  { name: 'SelectionState', layer: 'types', kind: 'type', summary: 'An id list, or "everything matching minus these" — the only sane way to select 12k server rows.' },
  { name: 'HeaderCheckboxState', layer: 'types', kind: 'type', summary: "'none' | 'some' | 'all' — the tri-state header checkbox." },
]
