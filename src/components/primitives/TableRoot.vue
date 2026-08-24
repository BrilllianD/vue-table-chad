<script setup lang="ts" generic="TRow extends Record<string, unknown>">
/**
 * Wires everything together and renders nothing of its own — the slot decides
 * the markup entirely.
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
import { provideTableContext, type TableContext } from '../../core/context'
import { useTableState, type TableState } from '../../core/useTableState'
import { useColumns, type ColumnLayoutState } from '../../core/useColumns'
import { buildHeaderRows } from '../../core/columnGroups'
import type { ColumnLayoutField } from '../../core/columnStorage'
import { useColumnDnd, type DropSide } from '../../core/useColumnDnd'
import { useRowGrouping } from '../../core/useRowGrouping'
import { useRowSelection, defaultRowId } from '../../core/useRowSelection'
import { useCellCursor } from '../../core/useCellCursor'
import type { UseRowEditing } from '../../core/useRowEditing'
import { usePagination } from '../../core/usePagination'
import { readValue } from '../../core/sorting'
import { isEmptyFilter } from '../../core/filters/model'

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
    /**
     * Header bands, giving a multi-row header and per-band collapse.
     *
     * Optional even when columns declare a `group`: a band forms because a
     * column claims it, and these supply the label, the nesting and how it
     * folds. With no column declaring one, the header stays a single row.
     */
    columnGroups?: ColumnGroupDef[]
    initialLayout?: Partial<ColumnLayoutState>
    /**
     * Saves the column layout under this key in `localStorage` and restores it
     * on the next mount. Read once at setup, like `initialLayout` — a saved
     * layout wins over it.
     */
    storageKey?: string
    /** Which parts of the layout `storageKey` saves. Defaults to all four. */
    storageFields?: ColumnLayoutField[]
    pageSize?: number
    siblingCount?: number
    /** Turns column drag-to-reorder off for the whole table. */
    reorderable?: boolean
    /**
     * Groups rows by these columns on first render, outermost level first.
     *
     * Seeds a `state` supplied from outside as well as one this component
     * owns — unlike `pageSize` — but only when that state carries no grouping
     * of its own, which keeps it a default rather than an override.
     */
    initialGroupBy?: string[]
    /**
     * Who performs the grouping.
     *
     *  - `'client'` (the default) bands the rows the source already returned.
     *    Nothing enters `QueryState`, so no refetch is triggered and a server
     *    never sees it; a band shows the part of its group that is loaded.
     *  - `'server'` puts it in `QueryState.groupBy` and lets the data source
     *    perform it — `useServerDataSource` sends it and refetches,
     *    `useLocalDataSource` sorts the whole dataset by it — so groups stay
     *    whole across pages and counts describe the entire group.
     *
     * Bound through to the state on every change, so it works with a `state`
     * supplied from outside too. Leave it unset to keep whatever that state
     * was built with.
     */
    groupMode?: GroupMode
    /** Renders every group folded shut until the user opens it. */
    groupsCollapsed?: boolean
    /** Header text for the bucket holding rows with no value. */
    blankGroupLabel?: string
    /**
     * An editing session, from `useRowEditing`. Passed in rather than built
     * here, unlike selection: editing carries a `save`, a `validate`, an
     * `apply` and a mode, and re-declaring all four as props would duplicate
     * the composable's own surface for nothing. Leave it out and cells render
     * read-only.
     */
    editing?: UseRowEditing<TRow>
    /**
     * A keyboard cell cursor: arrow keys move a focused cell, and the theme
     * rings it and crosses its row and column.
     *
     * A boolean rather than a session built outside, unlike `editing`. That one
     * is passed in because it carries a `save`, a `validate`, an `apply` and a
     * mode, and re-declaring all four as props would duplicate the composable's
     * surface; a cursor carries no callbacks at all. It also *has* to be built
     * here, because only this component knows the rendered row order — see
     * `cursorRows` below.
     *
     * Off by default. With it off the table emits no `role`, no `tabindex` and
     * no cursor attributes, and renders exactly what it always did.
     */
    cellCursor?: boolean
  }>(),
  { selectable: false, pageSize: 25, siblingCount: 1, reorderable: true, cellCursor: false },
)

const emit = defineEmits<{
  'update:query': [query: QueryState]
  'update:selection': [ids: RowId[]]
  /** Fires on every order change — dragged, keyboard-moved or menu-moved. */
  'update:columnOrder': [order: string[]]
}>()

const state =
  props.state ?? useTableState({ pageSize: props.pageSize, initialGroupBy: props.initialGroupBy })

const columns = useColumns<TRow>(
  () => props.columns,
  {
    groups: () => props.columnGroups,
    sortFor: state.sortFor,
    sortIndexFor: state.sortIndexFor,
    // Same test `ActiveFilters` uses, so the header's funnel and the chip row
    // can never disagree about whether a column is filtered.
    hasFilter: (id) => !isEmptyFilter(state.filters.value[id]),
    initialLayout: props.initialLayout,
    storage: props.storageKey
      ? { key: props.storageKey, fields: props.storageFields }
      : undefined,
  },
)

/**
 * Applies a drop. Landing on a pinned column adopts that column's pin side —
 * without it, dragging into a pinned region would reorder the column but leave
 * it rendered back in the middle group, since `visible` hoists pins to the
 * edges regardless of order.
 */
function applyColumnMove(columnId: string, targetId: string, side: DropSide): void {
  const all = columns.all.value
  const dragged = all.find((column) => column.id === columnId)
  const target = all.find((column) => column.id === targetId)
  if (dragged && target && dragged.pinned !== target.pinned) {
    columns.setPinned(columnId, target.pinned)
  }
  columns.moveColumnTo(columnId, targetId, side)
}

const dnd = useColumnDnd({
  columnIds: () => columns.visible.value.map((column) => column.id),
  move: applyColumnMove,
  canDrag: (columnId) =>
    props.reorderable &&
    columns.all.value.find((column) => column.id === columnId)?.reorderable !== false,
})

const rows = computed(() => props.source.rows.value)

/**
 * Grouping sits above the source and below the markup: it groups the page the
 * source produced, which is why it works the same for local and server data.
 *
 * `groupCounts` is what a source offers when it holds every row, so a header
 * can say "Engineering (240)" rather than "Engineering (12 of them on page 3)".
 * Server sources leave it undefined and the count falls back to the page.
 */
const grouping = useRowGrouping<TRow>(
  rows,
  () => props.columns,
  {
    groupBy: () => state.groupBy.value,
    sort: () => state.sort.value,
    /**
     * True group sizes, but only when the source is the one grouping. Under
     * `'client'` the bands describe the loaded rows and nothing else, so a
     * count reaching past them would contradict what is on screen.
     */
    totals: () =>
      state.groupMode.value === 'server'
        ? props.source.groupCounts?.(state.groupBy.value)
        : undefined,
    /** Same gate, same reason: a band's figures must describe the rows under it. */
    aggregates: () =>
      state.groupMode.value === 'server'
        ? props.source.groupAggregates?.(state.groupBy.value)
        : undefined,
    collapsedByDefault: props.groupsCollapsed,
    blankLabel: props.blankGroupLabel,
  },
)

// Written through rather than read at setup, so the prop still governs a state
// the caller built. Left alone when unset, so that state keeps its own setting.
watch(
  () => props.groupMode,
  (mode) => {
    if (mode) state.groupMode.value = mode
  },
  { immediate: true },
)

/*
 * `initialGroupBy` is config set where the table is used, so it has to reach a
 * state built elsewhere too — hoisting the query into a store or the URL must
 * not silently drop the grouping the table asked for.
 *
 * Seeding only: a state that already carries a grouping keeps it, because the
 * prop is a default and the caller's own state outranks a default. Runs after
 * the mode is settled above, so the seed lands in the home that mode
 * designates rather than relying on the flip to carry it across.
 */
if (props.state && props.initialGroupBy?.length && state.groupBy.value.length === 0) {
  state.setGroupBy(props.initialGroupBy)
}

/**
 * Strict identity, for selection: a wrong id there silently corrupts the
 * selection, so a row with no id and no `getRowId` throws rather than guess.
 */
function getRowId(row: TRow): RowId {
  return (props.getRowId ?? defaultRowId<TRow>)(row)
}

/**
 * Identity for `v-for` keys. Honours `getRowId` — the whole point of the prop —
 * but falls back to the row's position rather than throwing, because a missing
 * id is a rendering inconvenience, not a reason to blow up the table.
 */
function getRowKey(row: TRow, index: number): RowId {
  if (props.getRowId) return props.getRowId(row)
  return (row as { id?: RowId }).id ?? index
}

// Built unconditionally and gated on the way out: creating it lazily would
// freeze the answer at setup, so flipping `selectable` on later would render a
// checkbox column with nothing behind it.
const rowSelection = useRowSelection<TRow>(rows, () => props.source.total.value, {
  mode: () => (props.selectable === 'single' ? 'single' : 'multiple'),
  getRowId,
  isSelectable: (row) => props.isRowSelectable?.(row) ?? true,
})

const selection = computed(() => (props.selectable === false ? undefined : rowSelection))

/**
 * The cells the cursor walks: the rows actually rendered, in the order they are
 * rendered in, under the columns actually on screen.
 *
 * Not `rows` — grouping bands the page into a different order, so the source's
 * page order and what is on screen are two different lists, and a cursor
 * walking the first would jump about under the user. Narrowing `displayRows`
 * gets a folded band right for nothing as well: its rows are already absent
 * here, so the cursor steps over it rather than into it, and a group header is
 * never a cursor target because it is not a row.
 *
 * `columns.visible` for the same reason: it has already dropped the columns the
 * user hid and the ones a folded header band is withholding.
 */
const cursorRows = computed(() =>
  grouping.displayRows.value.flatMap((item) => (item.kind === 'row' ? [item.row] : [])),
)

// Built unconditionally and gated on the way out, for the reason the selection
// is: creating it lazily would freeze the answer at setup, so turning the prop
// on later would render a grid with nothing behind it.
const cellCursor = useCellCursor<TRow>(cursorRows, columns.visible, { getRowId })

const cursor = computed(() => (props.cellCursor ? cellCursor : undefined))

const pagination = usePagination(
  () => state.page.value,
  () => state.pageSize.value,
  () => props.source.total.value,
  { siblingCount: () => props.siblingCount, onChange: state.setPage },
)

/**
 * The header, row by row.
 *
 * Derived rather than put on the context: a folded band has already taken its
 * columns out of `columns.visible`, so this describes whatever list survives
 * and needs no collapse state of its own. `buildHeaderRows` is exported from
 * core, so a hand-assembled table reaches the same answer without a context.
 */
const headerRows = computed(() => buildHeaderRows(columns.visible.value, props.columnGroups))

function getCellValue(row: TRow, column: ColumnDef<TRow>): unknown {
  return readValue(row, column)
}

function getCellText(row: TRow, column: ColumnDef<TRow>): string {
  const value = getCellValue(row, column)
  if (column.format) return column.format(value, row)
  if (value === null || value === undefined) return ''
  return String(value)
}

const context: TableContext<TRow> = {
  state,
  columns,
  // A getter, so swapping the `source` prop (local ⇄ server) reaches everyone
  // holding the context rather than only the pieces that read it reactively.
  get source() {
    return props.source
  },
  selection,
  pagination,
  dnd,
  grouping,
  // A getter, for the same reason `source` is one: swapping the session must
  // reach everyone holding the context, not only what reads it reactively.
  get editing() {
    return props.editing
  },
  rows,
  displayRows: grouping.displayRows,
  visibleColumns: columns.visible,
  columnDefs: computed(() => props.columns),
  getRowId,
  getCellValue,
  getCellText,
}

provideTableContext(context)

/*
 * Both watchers below are shallow on purpose.
 *
 * `state.query` is a computed that mints a fresh object on every write, so its
 * identity already changes whenever anything inside it does — a deep traversal
 * of the filters and sort rules on top of that is pure cost. The selection
 * state is replaced wholesale by every write for the same reason (see
 * `useRowSelection`), so traversing an id list per checkbox click bought
 * nothing either.
 */
watch(() => state.query.value, (query) => emit('update:query', query))
// Watches the resolved order rather than `layout.order`, which stays empty
// until something reorders and would report nothing for the first move.
watch(
  () => columns.all.value.map((column) => column.id).join(' '),
  () => emit('update:columnOrder', columns.all.value.map((column) => column.id)),
)
watch(
  () => rowSelection.state.value,
  () => {
    if (props.selectable === false) return
    emit('update:selection', rowSelection.selectedIds.value)
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
    :get-row-id="getRowId"
    :get-row-key="getRowKey"
    :get-cell-value="getCellValue"
    :get-cell-text="getCellText"
  />
</template>
