<script setup lang="ts" generic="TRow extends Record<string, unknown>">
/**
 * Wires everything together and renders nothing of its own — the slot decides
 * the markup entirely.
 *
 * Thin on purpose. All of the wiring lives in `useTable()`, in `core/`, where
 * it can be reached and tested with no component involved; this component is
 * the props-to-options adapter, the `provide`, and the three `update:*` emits.
 * The rules that used to live here — how `initialGroupBy` seeds a state built
 * elsewhere, why selection and the cursor are built unconditionally and gated
 * on the way out, why `autofocusCursor` waits for `onMounted` — are all in
 * `useTable`, with the comments that explain them.
 */
import { computed, toRef, watch } from 'vue'
import type {
  ColumnDef,
  ColumnGroupDef,
  DataSource,
  GroupMode,
  QueryState,
  RowId,
  SelectionMode,
} from '../../core/types'
import { provideTableContext } from '../../core/context'
import { useTable } from '../../core/useTable'
import type { TableState } from '../../core/useTableState'
import type { ColumnLayoutState } from '../../core/useColumns'
import type { ColumnLayoutField } from '../../core/columnStorage'
import type { CellPosition } from '../../core/cellCursor'
import type { UseRowEditing } from '../../core/useRowEditing'

/**
 * Every prop here is one `UseTableOptions` field. The documentation for what
 * each one means, and when it is read, lives on that interface — written once,
 * beside the code that acts on it.
 */
const props = withDefaults(
  defineProps<{
    columns: ColumnDef<TRow>[]
    /** Local or server — `TableRoot` treats them identically. */
    source: DataSource<TRow>
    /**
     * Reuse an existing state object, or let this component own one. To hoist
     * the query into a store or the URL, build the state yourself with
     * `useTableState({ state: yourRef })` and pass it here.
     */
    state?: TableState
    selectable?: boolean | SelectionMode
    getRowId?: (row: TRow) => RowId
    isRowSelectable?: (row: TRow) => boolean
    /** Header bands, giving a multi-row header and per-band collapse. */
    columnGroups?: ColumnGroupDef[]
    initialLayout?: Partial<ColumnLayoutState>
    /** Saves the column layout under this key in `localStorage`. */
    storageKey?: string
    /** Which parts of the layout `storageKey` saves. Defaults to all four. */
    storageFields?: ColumnLayoutField[]
    /** Rows per page. Ignored when a `state` is supplied — that state decides. */
    pageSize?: number
    /**
     * Renders every row as one scroll rather than a page at a time: here that
     * means a page size of everything. The window itself belongs to whatever
     * renders the body — `VirtualBody`, in the preset.
     */
    virtual?: boolean
    /**
     * Which rows a virtual body actually rendered, so the roving tabindex lands
     * on a cell that exists. Ordinary tables leave it undefined.
     */
    renderedRowIds?: RowId[]
    siblingCount?: number
    /** Turns column drag-to-reorder off for the whole table. */
    reorderable?: boolean
    /** Groups rows by these columns on first render, outermost level first. */
    initialGroupBy?: string[]
    /** Who performs the grouping — `'client'` (the default) or `'server'`. */
    groupMode?: GroupMode
    /** Renders every group folded shut until the user opens it. */
    groupsCollapsed?: boolean
    /** Header text for the bucket holding rows with no value. */
    blankGroupLabel?: string
    /** An editing session, from `useRowEditing`. Without one, cells are read-only. */
    editing?: UseRowEditing<TRow>
    /** A keyboard cell cursor: arrow keys move a focused cell. Off by default. */
    cellCursor?: boolean
    /** Where the cursor starts, when the first cell is not where you want it. */
    initialCursor?: CellPosition
    /** Take the caret on load, instead of waiting for a Tab or a click. */
    autofocusCursor?: boolean
  }>(),
  {
    selectable: false,
    siblingCount: 1,
    reorderable: true,
    cellCursor: false,
    autofocusCursor: false,
  },
)

const emit = defineEmits<{
  'update:query': [query: QueryState]
  'update:selection': [ids: RowId[]]
  /** Fires on every order change — dragged, keyboard-moved or menu-moved. */
  'update:columnOrder': [order: string[]]
}>()

/*
 * Getters for everything that can change, plain values for what `useTable`
 * reads once. Which is which is documented on `UseTableOptions`, not decided
 * here.
 */
const table = useTable<TRow>({
  columns: () => props.columns,
  source: () => props.source,
  state: props.state,
  selectable: () => props.selectable,
  getRowId: props.getRowId,
  isRowSelectable: props.isRowSelectable,
  columnGroups: () => props.columnGroups,
  initialLayout: props.initialLayout,
  storageKey: props.storageKey,
  storageFields: props.storageFields,
  pageSize: props.pageSize,
  virtual: () => props.virtual ?? false,
  renderedRowIds: () => props.renderedRowIds,
  siblingCount: () => props.siblingCount,
  reorderable: () => props.reorderable,
  initialGroupBy: props.initialGroupBy,
  groupMode: () => props.groupMode,
  groupsCollapsed: props.groupsCollapsed,
  blankGroupLabel: props.blankGroupLabel,
  editing: () => props.editing,
  cellCursor: () => props.cellCursor,
  initialCursor: props.initialCursor,
  autofocusCursor: props.autofocusCursor,
})

const { state, columns, grouping, dnd, pagination, selection, cursor, headerRows } = table
const rows = table.rows

provideTableContext(table)

/**
 * What the slot receives, built here rather than listed on the `<slot>` itself
 * so that one of them can be a getter.
 *
 * `overallAggregates` is the reason. A template binding is read on every render
 * of this component whether or not the caller wants a footer, and resolving it
 * walks the whole filtered dataset — in virtual mode, where a page *is* the
 * dataset, that is an O(n) pass per data change nobody asked for. As a getter
 * it costs what it always cost when something reads it, and nothing when
 * nothing does. Callers that destructure it in `v-slot` pay on destructure,
 * which is the same as asking for it.
 *
 * `v-bind` on its own, deliberately: mixing it with static bindings compiles to
 * `mergeProps`, which copies every property and so would call the getter.
 */
const slotBindings = computed(() => ({
  rows: rows.value,
  displayRows: grouping.displayRows.value,
  get overallAggregates() {
    return grouping.overallAggregates.value
  },
  grouping,
  columns: columns.visible.value,
  allColumns: columns.all.value,
  headerRows: headerRows.value,
  bandEdges: columns.bandEdges.value,
  state,
  // `.value` on both: they are gated computeds, and a template binding used to
  // unwrap them on the way into the slot. Callers see the session or
  // `undefined`, as they always did.
  selection: selection.value,
  cursor: cursor.value,
  pagination,
  dnd,
  editing: props.editing,
  source: props.source,
  loading: props.source.loading.value,
  error: props.source.error.value,
  total: props.source.total.value,
  getRowId: table.getRowId,
  getRowKey: table.getRowKey,
  getCellValue: table.getCellValue,
  getCellText: table.getCellText,
}))

/*
 * The three emits, and why they stay here rather than becoming callbacks on
 * `UseTableOptions`: an emit is a component's way of speaking, and `core/` has
 * no components in it. `useTable` returns the sources; turning a change in one
 * into an event is this component's job.
 *
 * All three watchers are shallow on purpose. `state.query` is a computed that
 * mints a fresh object on every write, so its identity already changes whenever
 * anything inside it does — a deep traversal of the filters and sort rules on
 * top of that is pure cost. The selection state is replaced wholesale by every
 * write for the same reason (see `useRowSelection`), so traversing an id list
 * per checkbox click bought nothing either.
 */
watch(() => state.query.value, (query) => emit('update:query', query))
// Watches the resolved order rather than `layout.order`, which stays empty
// until something reorders and would report nothing for the first move.
watch(
  () => columns.all.value.map((column) => column.id).join(' '),
  () => emit('update:columnOrder', columns.all.value.map((column) => column.id)),
)
// `rowSelection`, not `selection`: the ungated one, so that switching
// `selectable` off is not itself reported as a selection change.
watch(
  () => table.rowSelection.state.value,
  () => {
    if (props.selectable === false) return
    emit('update:selection', table.rowSelection.selectedIds.value)
  },
)

defineExpose({
  state,
  columns,
  selection,
  cursor,
  pagination,
  dnd,
  grouping,
  editing: toRef(props, 'editing'),
  source: toRef(props, 'source'),
})
</script>

<template>
  <!--
    Renders nothing of its own by default: the slot receives everything, so the
    caller decides the markup entirely. `DataTable` is one such caller.
  -->
  <slot v-bind="slotBindings" />
</template>
