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
import { toRef, watch } from 'vue'
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
  <slot
    :rows="rows"
    :display-rows="grouping.displayRows.value"
    :overall-aggregates="grouping.overallAggregates.value"
    :grouping="grouping"
    :columns="columns.visible.value"
    :all-columns="columns.all.value"
    :header-rows="headerRows"
    :state="state"
    :selection="selection"
    :cursor="cursor"
    :pagination="pagination"
    :dnd="dnd"
    :editing="editing"
    :source="source"
    :loading="source.loading.value"
    :error="source.error.value"
    :total="source.total.value"
    :get-row-id="table.getRowId"
    :get-row-key="table.getRowKey"
    :get-cell-value="table.getCellValue"
    :get-cell-text="table.getCellText"
  />
</template>
