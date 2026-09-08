<script setup lang="ts" generic="TRow extends Record<string, unknown>">
/**
 * Wires everything together and renders nothing of its own — the slot decides
 * the markup entirely.
 *
 * Thin on purpose. All of the wiring lives in `useTable()`, in `core/`, where
 * it can be reached and tested with no component involved; this component is
 * the props-to-options adapter, the `provide`, and the `update:*` emits.
 * The rules that used to live here — how `initialGroupBy` seeds a state built
 * elsewhere, why selection and the cursor are built unconditionally and gated
 * on the way out, why `autofocusCursor` waits for `onMounted` — are all in
 * `useTable`, with the comments that explain them.
 */
import { computed, getCurrentInstance, toRef, watch } from 'vue'
import type {
  ColumnDef,
  ColumnGroupDef,
  DataSource,
  GroupMode,
  QueryState,
  RowId,
  SelectionMode,
  SelectionState,
} from '../../core/types'
import { provideTableContext, provideTableLabels, useTableLabels } from '../../core/context'
import { mergeLabels, type TableLabels } from '../../core/labels'
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
    /**
     * The selection itself, for a caller that wants to own it —
     * `v-model:selection-state`. Left out, the table owns it.
     *
     * `selectionState` rather than `selection`, because `update:selection`
     * already exists and carries `RowId[]`; binding `v-model:selection` would
     * silently repurpose that event's payload. This one carries the whole
     * `SelectionState` union, which is what a caller has to hold to represent
     * "everything matching" as well as a list of ids.
     */
    selectionState?: SelectionState
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
    /** Wording for every string the table renders, over the English defaults. */
    labels?: Partial<TableLabels>
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
  /** The whole selection, for `v-model:selection-state`. */
  'update:selectionState': [state: SelectionState]
  /** The selected rows themselves — see the watcher for what it costs. */
  'update:selectedRows': [rows: TRow[]]
  /** Fires on every order change — dragged, keyboard-moved or menu-moved. */
  'update:columnOrder': [order: string[]]
}>()

/*
 * Getters for everything that can change, plain values for what `useTable`
 * reads once. Which is which is documented on `UseTableOptions`, not decided
 * here.
 */
/*
  The app-wide record from `createTableLabels`, or English with no plugin
  installed. Read *before* the `provideTableLabels` below, so it resolves in
  the parent chain and this component's own publish cannot feed itself.

  The prop is merged over it rather than replacing it, which is what makes a
  per-table override partial against the app's locale instead of against
  English.
*/
const inheritedLabels = useTableLabels()

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
  labels: () => mergeLabels(props.labels, inheritedLabels.value),
  editing: () => props.editing,
  cellCursor: () => props.cellCursor,
  initialCursor: props.initialCursor,
  autofocusCursor: props.autofocusCursor,
})

const { state, columns, grouping, dnd, pagination, selection, cursor, headerRows } = table
const rows = table.rows

provideTableContext(table)
provideTableLabels(table.labels)

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
  labels: table.labels.value,
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
 * The emits, and why they stay here rather than becoming callbacks on
 * `UseTableOptions`: an emit is a component's way of speaking, and `core/` has
 * no components in it. `useTable` returns the sources; turning a change in one
 * into an event is this component's job.
 *
 * Every watcher here is shallow on purpose. `state.query` is a computed that
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
/*
 * A selection owned from outside, seeded before any watcher can fire so that a
 * table bound with `v-model:selection-state` renders its first frame already
 * selected rather than reporting an empty selection back over the binding.
 */
if (props.selectionState) table.rowSelection.state.value = props.selectionState

/*
 * The binding, inbound. The reference test is the loop guard: a write below
 * emits the very object it stored, the parent hands that same object back, and
 * this stops there rather than writing it a second time. It is also the only
 * comparison that is correct — `useRowSelection` replaces the state object on
 * every write, so identity is exactly "has someone else changed it".
 */
watch(
  () => props.selectionState,
  (next) => {
    if (next && next !== table.rowSelection.state.value) {
      table.rowSelection.state.value = next
    }
  },
)

/**
 * Whether anyone is listening for the rows.
 *
 * Resolving them is a walk over the whole filtered set, and `selectedRows` is
 * lazy precisely so that a table nobody asked stays free — emitting into the
 * void on every click would spend that walk at 100k rows to hand the result to
 * no one. Read from the vnode rather than from `attrs`, which a declared emit
 * never reaches; both spellings, because a render function may write either.
 */
const instance = getCurrentInstance()
function wantsSelectedRows(): boolean {
  const vnodeProps = instance?.vnode.props
  if (!vnodeProps) return false
  return Boolean(vnodeProps['onUpdate:selectedRows'] ?? vnodeProps['onUpdate:selected-rows'])
}

// `rowSelection`, not `selection`: the ungated one, so that switching
// `selectable` off is not itself reported as a selection change.
watch(
  () => table.rowSelection.state.value,
  (current) => {
    if (props.selectable === false) return
    emit('update:selection', table.rowSelection.selectedIds.value)
    emit('update:selectionState', current)
    if (wantsSelectedRows()) emit('update:selectedRows', table.rowSelection.selectedRows.value)
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
