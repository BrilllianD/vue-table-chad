<script setup lang="ts" generic="TRow extends Record<string, unknown>">
/**
 * The batteries-included preset: every region a named slot, and the one
 * component that imports the default stylesheet. Deliberately NOT a god
 * component.
 *
 * It owns no logic of its own: every capability here comes from a primitive or
 * a composable, and every region is a named slot. If it does not fit, drop to
 * `<TableRoot>` and assemble the same pieces differently (see
 * `playground/src/examples/ComposedCustom.vue`).
 */
import { computed, getCurrentInstance, onScopeDispose, ref, shallowRef, useSlots, watch, watchEffect } from 'vue'
import type {
  ColumnDef,
  ColumnGroupDef,
  DataSource,
  GroupMode,
  PinSide,
  QueryState,
  ResolvedColumn,
  RowId,
  SelectionMode,
  SelectionState,
} from '../../core/types'
import type { ColumnLayoutState } from '../../core/useColumns'
import {
  commitMoveFor,
  editSeedFor,
  nextScrollLeft,
  nextScrollTop,
  type BandFold,
  type CellPosition,
  type DetailToggle,
} from '../../core/cellCursor'
import { columnGroupPath, foldTargetFor } from '../../core/columnGroups'
import { exportRows } from '../../core/export'
import type { UsePagination } from '../../core/usePagination'
import type { UseCellCursor } from '../../core/useCellCursor'
import type { ColumnLayoutField } from '../../core/columnStorage'
import type { TableState } from '../../core/useTableState'
import type { UseRowEditing } from '../../core/useRowEditing'
import { provideTableTheme, type TableTheme } from '../../core/context'
import { mergeLabels, type TableLabels } from '../../core/labels'
import { useTableLabels } from '../../core/context'
import type { UseRowSelection } from '../../core/useRowSelection'
import { useRowExpansion, type UseRowExpansion } from '../../core/useRowExpansion'
import { devChecksEnabled, devWarn } from '../../core/devWarn'
import type { UseColumnsResult } from '../../core/useColumns'
import TableRoot from '../primitives/TableRoot.vue'
import TableGrid from '../primitives/TableGrid.vue'
import ColumnDragGhost from '../primitives/ColumnDragGhost.vue'
import ColumnVisibilityMenu from '../primitives/ColumnVisibilityMenu.vue'
import RowGroupMenu from '../primitives/RowGroupMenu.vue'
import ActiveFilters from '../primitives/ActiveFilters.vue'
import TablePagination from '../primitives/TablePagination.vue'
import DataTableHeader from './DataTableHeader.vue'
import DataTableBody from './DataTableBody.vue'
import DataTableFooter from './DataTableFooter.vue'
import { useAutoColumnWidth } from './useAutoColumnWidth'
import { downloadText, type TableExportPayload } from './tableExport'

// The preset owns the preset theme, so `DataTable` is styled out of the box
// while the primitives stay CSS-free.
import './table.css'

const props = withDefaults(
  defineProps<{
    columns: ColumnDef<TRow>[]
    source: DataSource<TRow>
    state?: TableState
    selectable?: boolean | SelectionMode
    /**
     * Shift- and Ctrl/Cmd-click on the row itself, not only on its checkbox:
     * Shift extends a range from the last row touched, Ctrl (Cmd on a Mac)
     * toggles the one row.
     *
     * Off by default, and an unmodified click never changes the selection even
     * when it is on — a table using `@row-click` to open a detail panel keeps
     * working exactly as it did, and no plain click can wipe a selection the
     * user spent a minute building.
     */
    rowClickSelect?: boolean
    /**
     * The selection itself, for a caller that wants to own it —
     * `v-model:selection-state`. Left out, the table owns it.
     *
     * Not `v-model:selection`: `update:selection` already exists and carries
     * `RowId[]`, and this carries the whole `SelectionState`, which is the only
     * shape that can also say "everything matching the filters".
     */
    selectionState?: SelectionState
    getRowId?: (row: TRow) => RowId
    isRowSelectable?: (row: TRow) => boolean
    /**
     * Header bands, giving a multi-row header with a collapse control on each.
     *
     * Optional even when columns declare a `group` — a band forms because a
     * column claims it, and these supply the label, the nesting and how it
     * folds. With no column declaring one, the header stays a single row.
     */
    columnGroups?: ColumnGroupDef[]
    initialLayout?: Partial<ColumnLayoutState>
    /** Remembers the column layout across reloads under this `localStorage` key. */
    storageKey?: string
    /** Which parts of the layout to remember. Defaults to visibility, order, widths and pins. */
    storageFields?: ColumnLayoutField[]
    /** Rows per page. Defaults to 10, from `useTableState` — see `DEFAULT_PAGE_SIZE`. */
    pageSize?: number
    /**
     * Renders every row as one continuous scroll, rendering only the ones the
     * scroll box can show.
     *
     * Mutually exclusive with paging, and it is paging that gives way: the page
     * size becomes the whole result set and the pager is not rendered, because
     * a pager over exactly one page is a lie.
     *
     * The scroll box has to be height-constrained for this to mean anything —
     * `.vt-scroll` caps itself at `70vh`, and a theme that overrides that to
     * `none` has made the viewport as tall as the content and turned the window
     * back off.
     */
    virtual?: boolean
    /**
     * How tall one row is, in CSS pixels. Only read in `virtual` mode, where it
     * both drives the windowing arithmetic *and* is written to
     * `--vtc-row-height`, so the number the JS counts with and the number the
     * browser lays out with cannot drift apart.
     */
    rowHeight?: number
    /**
     * Measure each rendered row instead of trusting `rowHeight`.
     *
     * For a body whose rows are not all one height — a group header laying out
     * taller than a data row is the usual case. It costs one forced layout per
     * update, on the rows in the window, which is why it is off by default:
     * `rowHeight` alone is exact for a uniform body, and its error elsewhere is
     * bounded by the window rather than accumulating down the list.
     */
    measureRows?: boolean
    /**
     * How close to the end of the list a virtual window must come before
     * `end-reached` fires, in rows. Larger fires earlier, which a slow request
     * wants; `0` waits until the last row is rendered.
     */
    endThreshold?: number
    /** Rows kept rendered beyond each edge of the viewport. Defaults to four. */
    overscan?: number
    /** Drag column headers to reorder them. */
    reorderable?: boolean
    /**
     * Bands rows by these columns on first render, outermost level first.
     * Seeds a supplied `state` too, unless it already carries a grouping.
     */
    initialGroupBy?: string[]
    /**
     * Who performs the grouping. `'client'` (the default) bands the rows that
     * are already loaded and never touches the query, so nothing refetches and
     * no server hears about it. `'server'` puts it in `QueryState.groupBy` for
     * the data source to perform, keeping groups whole across pages.
     */
    groupMode?: GroupMode
    /** Renders every band folded shut until the user opens it. */
    groupsCollapsed?: boolean
    /** Header text for the band holding rows with no value. */
    blankGroupLabel?: string
    /**
     * Renders a footer row aggregating every loaded row, using the same
     * per-column `aggregate` declarations the group rows use. Off by default:
     * declaring an aggregate should not add a row nobody asked for.
     */
    showFooter?: boolean
    /** Text for the footer's leading cell. Defaults to the `footerLabel` label. */
    footerLabel?: string
    /**
     * Vertical rules between every pair of columns, header and body alike.
     *
     * The declarative form of `--vtc-body-border-vertical-width`, which is `0px`
     * by default because column separators are a deliberate look rather than
     * one every table should start with.
     *
     * Left unset it emits nothing at all, so a stylesheet that sets the
     * variable itself — to `3px`, or to a width that varies by breakpoint —
     * keeps working. Pass it and the prop wins, because it arrives as an inline
     * custom property on the same element the token is declared on.
     */
    columnRules?: boolean
    /**
     * The rule beside a band, where its run of columns ends — drawn the full
     * height of the table rather than only in the header.
     *
     * The declarative form of `--vtc-band-border-width`, which unlike the column
     * separators is `1px` by default: it is emitted only where a boundary
     * actually falls, so a table declaring no `columnGroups` never sees it.
     * Which is also why this prop does nothing on a table without bands —
     * there is no `data-band-edge` for it to reach.
     *
     * Unset emits nothing, exactly as `columnRules` does.
     */
    bandRules?: boolean
    showToolbar?: boolean
    showSearch?: boolean
    showColumnsMenu?: boolean
    showGroupMenu?: boolean
    showPagination?: boolean
    /**
     * Renders the toolbar's export button.
     *
     * Off by default, unlike the other `show*` props: every one of those turns
     * on a read-only control, while this one writes a file to the reader's
     * disk. That is a thing to opt into rather than something a table starts
     * doing because it was rendered.
     */
    showExport?: boolean
    /**
     * Name for the downloaded file, extension included. Defaults to
     * `'table.csv'`.
     */
    exportFilename?: string
    /**
     * Fetches every row for the export, for a server or infinite source.
     *
     * Only the consumer knows how to ask their server for the whole result set
     * rather than a page; without it a remote table's export holds the current
     * page and says so through a dev warning. Ignored on a local source, which
     * already has every row.
     */
    exportFetchAll?: () => Promise<readonly TRow[]>
    stickyHeader?: boolean
    /**
     * Which palette to paint, instead of following `prefers-color-scheme`.
     *
     * `'system'`, the default, emits no attribute and leaves the media query in
     * charge. `'light'` and `'dark'` write `data-theme` on the table — and on
     * the filter popover and the drag ghost, which teleport to `<body>` and
     * would otherwise be left behind under the OS setting.
     */
    theme?: TableTheme
    /** Text shown when nothing matched. Defaults to the `emptyMessage` label. */
    emptyMessage?: string
    /**
     * Text shown beside the spinner while the source is fetching. Defaults to
     * the `loading` label.
     */
    loadingMessage?: string
    /**
     * Wording for every string the table renders, over the English defaults.
     *
     * Forwarded to `<TableRoot>`, which publishes it for the primitives; this
     * component reads the same record for the toolbar and the banner it renders
     * itself. The three message props above win over it where both are given.
     */
    labels?: Partial<TableLabels>
    /**
     * An editing session from `useRowEditing`. Without one every cell renders
     * read-only, and the table costs exactly what it always did.
     *
     * The session owns the mode, so there is no `editMode` prop here to
     * disagree with it: `'cell'` commits each field as you leave it, `'row'`
     * opens every editable cell at once behind one Save.
     */
    editing?: UseRowEditing<TRow>
    /**
     * A keyboard cell cursor: arrows move a focused cell, Enter opens its
     * editor when it has one, and a move out of an open editor — Enter or an
     * arrow — commits and opens the cell it lands on, so a run of cells is
     * typed with no keystroke between them.
     *
     * Off by default, and off means off — no `role="grid"`, no `tabindex`, no
     * cursor attributes, and editable cells keep the button that is their only
     * keyboard route without one.
     */
    cellCursor?: boolean
    /**
     * Where the cursor starts. Defaults to the first rendered cell, so a table
     * asked for a keyboard looks like it has one before you press a key.
     */
    initialCursor?: CellPosition
    /**
     * Take the caret on load, instead of waiting for a Tab or a click.
     *
     * Off by default: a table that grabbed the focus on mount would scroll
     * itself into view and swallow the first keystroke on every page where the
     * table is not the point. Turn it on for the pages where it is. Asked for
     * once, when there is first a cell to give the focus to — a server source
     * has none at mount — and never again.
     */
    autofocusCursor?: boolean
    /**
     * A disclosure toggle on every row, opening a detail panel under it — what
     * the `#detail` slot renders into.
     *
     * The toggle shares the leading narrow column with the selection checkbox,
     * so turning it on adds no column of its own.
     *
     * Under `virtual` it requires `measureRows`: an open panel makes its row
     * taller than `rowHeight`, and windowing that trusts the declared height
     * would leave a gap the size of every panel above the viewport.
     */
    expandable?: boolean
    /**
     * A `useRowExpansion` of your own, for hoisting the open set — into a URL,
     * a store, or a composable that loads the panel's contents.
     *
     * Given one, `expandable` is implied. The same arrangement `editing` and
     * `selectionState` use: the flag is the easy way in, the instance is the
     * way to own the state.
     */
    expansion?: UseRowExpansion<TRow>
  }>(),
  {
    // Vue casts an absent boolean prop to `false`, which would make "not
    // passed" indistinguishable from "passed as false" — and these two have to
    // stay apart, because unset means "emit nothing and let the stylesheet's
    // own `--vtc-*` value stand".
    columnRules: undefined,
    bandRules: undefined,
    selectable: false,
    rowClickSelect: false,
    cellCursor: false,
    autofocusCursor: false,
    expandable: false,
    reorderable: true,
    virtual: false,
    rowHeight: 38,
    measureRows: false,
    endThreshold: 0,
    showFooter: false,
    footerLabel: undefined,
    showToolbar: true,
    showSearch: true,
    showColumnsMenu: true,
    showGroupMenu: true,
    showPagination: true,
    showExport: false,
    exportFilename: 'table.csv',
    exportFetchAll: undefined,
    stickyHeader: true,
    theme: 'system',
    emptyMessage: undefined,
    loadingMessage: undefined,
    labels: undefined,
  },
)

/*
  Attributes are forwarded by hand, onto `.vt-datatable` and no other element.

  Vue cannot do it automatically here: `<TableRoot>` renders a slot and nothing
  else, so this component's root is a fragment and fallthrough attributes are
  dropped rather than landing somewhere. Silently — a `:style` or an `id` on
  `<DataTable>` simply had no effect.

  `.vt-datatable` is also the only element they could usefully land on. Every
  theme token is declared there, so an inline custom property has to reach that
  element to beat the stylesheet — which is exactly what `defineTheme` produces
  and what `docs/styling.md` tells consumers to bind.
*/
defineOptions({ inheritAttrs: false })

const emit = defineEmits<{
  'update:query': [query: QueryState]
  'update:selection': [ids: RowId[]]
  /** The whole selection, for `v-model:selection-state`. */
  'update:selectionState': [state: SelectionState]
  /**
   * The selected rows themselves, resolved across pages where the source holds
   * them. Costs a walk over the filtered set, so it is only computed when this
   * event is actually listened for.
   */
  'update:selectedRows': [rows: TRow[]]
  'update:columnOrder': [order: string[]]
  rowClick: [row: TRow, event: MouseEvent]
  /** A row reached the server. Carries the row as it now stands. */
  rowSaved: [row: TRow]
  rowSaveError: [row: TRow, error: unknown]
  /**
   * A virtual window reached the end of the loaded rows.
   *
   * Wire it to an infinite source's `loadMore`, which is guarded against being
   * asked twice, so the handler needs nothing around it. In paged mode the
   * whole page is rendered and this fires once, on arrival, which is harmless
   * for the same reason.
   */
  endReached: []
  /**
   * The export was asked for, carrying the serialised text.
   *
   * Fires *before* the download, and `preventDefault()` cancels it — so a
   * consumer who wants to POST the text, name the file from the query, or hand
   * it to a save dialog replaces the default rather than racing it. Listening
   * without calling it leaves the download in place, which is what makes the
   * button work with nothing wired.
   */
  export: [payload: TableExportPayload]
}>()

/**
 * Whether to render the selection column at all. The *mode* is passed to
 * `TableRoot` untouched — collapsing it to a boolean here would silently turn
 * `selectable="single"` into multi-select.
 */
const selectable = computed(() => props.selectable !== false)

/**
 * The open set, and `undefined` when detail rows are off entirely.
 *
 * A composable created unconditionally and then withheld, rather than created
 * conditionally: `useRowExpansion` allocates one ref and registers nothing, and
 * a conditional call would have to sit behind a `watch` to survive the prop
 * being flipped at runtime. Withholding it is what makes "off means off" —
 * `DataTableBody` renders no toggle and no panel without one.
 */
const ownExpansion = useRowExpansion<TRow>({ getRowId: props.getRowId })
const expansion = computed<UseRowExpansion<TRow> | undefined>(() =>
  props.expansion ?? (props.expandable ? ownExpansion : undefined),
)

/**
 * Whether the leading narrow column exists. Either feature brings it, and both
 * share it — see `DataTableBody`.
 */
const leadingColumn = computed(() => selectable.value || expansion.value !== undefined)

/*
 * An open panel makes its row taller than `rowHeight`, and a window that trusts
 * the declared height would put the spacers a panel short per open row above
 * the viewport — a gap that grows as you scroll. `measureRows` is the answer the
 * component already has; this says so rather than rendering something wrong.
 *
 * Inside a `watchEffect` rather than checked once at setup, because all three
 * are props and a table may grow any of them after mount.
 */
watchEffect(() => {
  if (!devChecksEnabled()) return
  if (props.virtual && expansion.value && !props.measureRows) {
    devWarn(
      'A `virtual` table with `expandable` needs `measureRows`. An open detail row is taller ' +
        'than `rowHeight`, so without it the spacers under-count by one panel per open row and ' +
        'the rows drift out from under the scrollbar.',
    )
  }
})

/**
 * `'system'` becomes no attribute at all rather than `data-theme="system"`.
 * The dark block is written as `:not([data-theme='light'])`, so a third value
 * in the attribute would be one more thing every future selector has to
 * remember to exclude.
 */
const themeAttribute = computed(() => (props.theme === 'system' ? undefined : props.theme))

/*
  Published for the two components that teleport a `.vt-portal` wrapper to
  `<body>`. Custom properties inherit through the DOM and a teleported panel is
  no longer under the table, so without this a forced theme would stop at the
  table's edge and the filter popover would open in the OS's colours.
*/
provideTableTheme(computed(() => props.theme))

/*
  The same record `<TableRoot>` publishes below, merged a second time here.

  Not inherited from `TableRoot`: this component is its *parent*, so it sits
  above that `provide` and could never see it. The toolbar, the select-all
  banner and the three message props are rendered by this component rather than
  by a primitive, so they read the merge directly. `mergeLabels` is pure, and
  both calls are computeds over the same prop, so the second costs one object
  per change of wording rather than one per render.

  What it *does* inherit is the app-wide record `createTableLabels` publishes at
  the app root — above this component, not below it — with the prop merged over
  it per key. The full record then goes down to `<TableRoot>` as its `labels`
  prop, so the primitives are handed the same wording this component resolved
  rather than resolving it a third time from a partial.
*/
const inheritedLabels = useTableLabels()
const words = computed(() => mergeLabels(props.labels, inheritedLabels.value))

/*
  The three message props, resolved against the record. Each prop still wins
  where it is given: a caller who passed `emptyMessage` before this existed must
  keep seeing it, whatever the record says.
*/
/**
 * Serialises the result set and hands it over — to the listener first, to the
 * browser's download second.
 *
 * Takes the rendered columns rather than `props.columns`, so a hidden column
 * stays out of the file and a reordered one lands where the reader put it: the
 * export is of the table as it stands, which is the same rule cell copy
 * follows. The selection column and the row-actions column are not in this
 * list, since neither is a `ColumnDef`.
 *
 * Awaited before either, because a remote `fetchAll` has not answered yet. A
 * rejection is left to propagate: the consumer's own `fetchAll` failed, and
 * swallowing it here would leave a button that does nothing and says nothing.
 */
async function onExport(cols: ResolvedColumn<TRow>[]): Promise<void> {
  const text = await exportRows(props.source, cols, { fetchAll: props.exportFetchAll })
  let prevented = false
  const payload: TableExportPayload = {
    text,
    filename: props.exportFilename,
    preventDefault: () => {
      prevented = true
    },
  }
  emit('export', payload)
  if (!prevented) downloadText(payload.filename, payload.text)
}

const footerText = computed(() => props.footerLabel ?? words.value.footerLabel)
const emptyText = computed(() => props.emptyMessage ?? words.value.emptyMessage)
const loadingText = computed(() => props.loadingMessage ?? words.value.loading)

/**
 * The two rule widths, as inline custom properties on `.vt-datatable`.
 *
 * That element and no other: both tokens are declared on `.vt-datatable`
 * itself, so a value set on an ancestor never reaches them — which is also why
 * an inline style here beats the stylesheet without needing `!important`.
 *
 * An untouched prop contributes nothing rather than a zero. Emitting `0px` for
 * "unset" would silently overrule any stylesheet that had set these itself,
 * turning a prop nobody passed into a restyle nobody asked for.
 */
const ruleStyle = computed(() => {
  const style: Record<string, string> = {}
  if (props.columnRules !== undefined) {
    style['--vtc-body-border-vertical-width'] = props.columnRules ? '1px' : '0px'
  }
  if (props.bandRules !== undefined) {
    style['--vtc-band-border-width'] = props.bandRules ? '1px' : '0px'
  }
  return Object.keys(style).length > 0 ? style : undefined
})

/**
 * Row mode needs somewhere to put Save and Cancel, so it takes a trailing
 * column. Cell mode has no such controls — Enter and Escape are the whole
 * interface — so it adds no column and the table keeps the width it had.
 */
const rowMode = computed(() => props.editing?.mode.value === 'row')
const actionsColumn = computed(() => Boolean(props.editing) && rowMode.value)

/**
 * `aria-rowcount` and the numbering that has to go with it — only in virtual
 * mode.
 *
 * A screen reader counts the rows in the document, and a windowed body has
 * about thirty of them however long the list is. Paged, the document is already
 * the truth: every row of the page is there, the pager says which page it is,
 * and numbering rows 1..25 over and over would be a second, worse answer.
 *
 * A table still loading its first page reports `-1`, which is what ARIA has for
 * "many, and not known yet" — and an infinite source, whose `total` is the
 * server's count rather than what is loaded, reports that count, because it is
 * the honest size of the thing being scrolled.
 */
function ariaRowCount(headerRows: unknown[], displayRows: unknown[], total: number): number | undefined {
  if (!props.virtual) return undefined
  if (total <= 0 && displayRows.length === 0) return -1
  return headerRows.length + Math.max(total, displayRows.length)
}

/** Extra leading and trailing cells, for the rows that have to span them all. */
const extraColumns = computed(() => (leadingColumn.value ? 1 : 0) + (actionsColumn.value ? 1 : 0))

/**
 * `Ctrl`/`Cmd` + `←`/`→`: turn the page, and take the cursor along.
 *
 * It keeps its offset and its column — the third row of page 2 becomes the
 * third row of page 3 — rather than re-anchoring to the top. Paging is reading,
 * and the eye is already at a height on the screen; putting the ring back at
 * the top would make every page turn cost a second gesture to get back to it.
 *
 * Turning the page is all this does. Carrying the cursor across belongs to
 * `useTable`, which wraps `setPage` and `setPageSize` so the pager control and
 * a programmatic page change restore the cursor the same way this gesture does
 * — one answer to "the page was replaced", rather than one per route in.
 *
 * A clamped page change moves nothing at all: `pagination.go` refuses to step
 * past either end, so `setPage` is never reached and there is nothing to
 * re-anchor.
 *
 * Works whether or not `show-pagination` renders a pager: a keyboard route
 * that only exists when a control is on screen is not a keyboard route.
 */
function pageMove(pages: number, pagination: UsePagination): void {
  pagination.go(pagination.page.value + pages)
}

/**
 * `Ctrl`/`Cmd` + `.` from a cell: fold the band over the cursor's column, or
 * with `Shift` open every band.
 *
 * Here rather than in `TableGrid` because folding writes column layout, and the
 * grid is handed columns rather than owning them — the same split `page-move`
 * draws. `foldTargetFor` decides *which* band, since the key press names only
 * the column the cursor is on.
 *
 * A fold that takes the cursor's own column away moves the ring to the column
 * the band left standing, which is the one thing this cannot leave to
 * `nextPosition`: a position naming a column that is gone re-anchors to column
 * index 0, and the ring would jump to the far left of the table. The survivor
 * is read back out of `visible` rather than re-derived from `collapseTo` —
 * `useColumns` already decided which column a folded band keeps, and a second
 * opinion here could disagree with the header on screen.
 */
function bandFold(fold: BandFold, cursor: UseCellCursor<TRow> | undefined): void {
  const api = root.value?.columns
  if (!api) return
  if (fold.kind === 'expandAll') {
    api.expandAllGroups()
    return
  }

  const columnId = cursor?.columnId.value
  const rowId = cursor?.rowId.value
  if (columnId === undefined || rowId === undefined) return

  const target = foldTargetFor(
    api.all.value.find((column) => column.id === columnId),
    props.columnGroups,
    api.isGroupCollapsed,
  )
  if (!target) return
  api.toggleGroup(target.groupId, target.collapsed)

  // The layout write is synchronous, so `visible` already describes the folded
  // header and this reads the answer rather than predicting it.
  const visible = api.visible.value
  if (visible.some((column) => column.id === columnId)) return
  const survivor = visible.find((column) =>
    columnGroupPath(column, props.columnGroups).some((group) => group.id === target.groupId),
  )
  if (!survivor) return
  cursor?.moveTo({ rowId, columnId: survivor.id }, { focus: true })
}

/**
 * `Alt`+`↓`/`↑`: open or shut the cursor row's detail panel.
 *
 * The grid reports the row *id*, since that is all it holds; the row itself has
 * to be found among the rendered ones, which is what `rows` is. A press on a
 * row the window has evicted therefore does nothing, and correctly — the cursor
 * cannot be on one.
 */
function detailToggle(rowId: RowId, toggle: DetailToggle, rows: TRow[]): void {
  const api = expansion.value
  if (!api) return
  const row = rows.find((entry) => api.getRowId(entry) === rowId)
  if (!row) return
  api.toggle(row, toggle === 'expand')
}

/**
 * The scroll box, so `Shift`+`←`/`→` has something to scroll.
 *
 * The preset owns it — `.vt-scroll` is the element that overflows, and no
 * primitive has one — which is why `TableGrid` reports the gesture instead of
 * performing it.
 */
const scrollBox = ref<HTMLElement | null>(null)

/*
 * The scrollport's own width, written onto `.vt-scroll` as
 * `--vtc-scrollport-width` so the empty/error message can be centred on what
 * is *visible* rather than on the table.
 *
 * The message row spans every column, so on a table wider than its box the
 * centre of that cell is somewhere off to the side and the message scrolls out
 * of sight — the one row whose whole job is to be read. The stylesheet cannot
 * work the number out for itself: percentages inside the cell resolve against
 * the cell, and a container query would need `container-type` on an ancestor,
 * which is size containment imposed on every consumer's layout for the sake of
 * one row.
 *
 * `clientWidth` rather than a rect, because it is the padding box: border and
 * scrollbar excluded, which is exactly the strip a sticky child can occupy.
 *
 * Written straight to the element's style rather than through reactive state.
 * Nothing here may reach the pipeline, and a resize is not a data change —
 * `tests/invalidation.spec.ts` is the standing version of that rule.
 */
let detachScrollportWidth: (() => void) | undefined

watch(
  scrollBox,
  (box) => {
    detachScrollportWidth?.()
    detachScrollportWidth = undefined
    if (!box) return

    const write = () => box.style.setProperty('--vtc-scrollport-width', `${box.clientWidth}px`)
    write()

    // Guarded like `VirtualBody`'s: happy-dom ships a ResizeObserver that never
    // fires, and a caller may have none at all. The CSS fallback of `100%` is
    // the way out for both — the message stays centred on the table, which is
    // where it was before this existed.
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(write)
    observer?.observe(box)
    detachScrollportWidth = () => observer?.disconnect()
  },
  { immediate: true },
)

onScopeDispose(() => detachScrollportWidth?.())

/**
 * The column the pointer is in, or `undefined` while it is outside the table.
 *
 * Its own state rather than a use of the cell cursor. Moving the mouse must not
 * move the cursor: the cursor carries the focus, the roving `tabindex="0"` and
 * the cell an editor opens on, and a pointer crossing the table on its way
 * somewhere else has asked for none of that. It is also independent of whether
 * a cursor exists at all — `cellCursor` is off by default, and the column guide
 * is useful on a plain read-only table.
 *
 * A `shallowRef` holding one string, written only when the column changes, so
 * a mouse move within one column propagates nothing — the pointer's version of
 * the rule that a clamped cursor move writes no state.
 */
const hoverColumnId = shallowRef<string | undefined>(undefined)

/**
 * The pointer entered a cell — in the body or in the header, since one listener
 * on `.vt-scroll` sees both.
 *
 * `pointerover` rather than `pointerenter` because only the former bubbles, and
 * `.vt-td`/`.vt-th` rather than the event target itself because the pointer is
 * usually over a `<span>`, a sort button or an editor inside the cell.
 *
 * Touch is dropped outright. A tap synthesises one `pointerover` and never the
 * `pointerleave` that would undo it, so a touch device would light a column and
 * leave it lit until the next tap — a highlight nobody asked for, describing
 * where a finger was rather than where a pointer is.
 */
function onPointerOver(event: PointerEvent): void {
  if (event.pointerType === 'touch') return
  const cell = (event.target as HTMLElement | null)?.closest?.(
    '.vt-td[data-column], .vt-th[data-column]',
  )
  const columnId = cell?.getAttribute('data-column') ?? undefined
  if (columnId === hoverColumnId.value) return
  hoverColumnId.value = columnId
}

/**
 * Which rows the body has actually rendered, in virtual mode.
 *
 * It comes back up from `DataTableBody` and goes straight down into
 * `TableRoot`, where the cursor uses it to keep its one `tabindex="0"` on a
 * cell that exists. The round trip is the honest shape of it: the window is
 * measured at the bottom of the tree and needed at the top.
 */
const renderedRowIds = ref<RowId[] | undefined>(undefined)

/**
 * `Shift` + `←`/`→`: scroll one column sideways, and leave the cursor alone.
 *
 * The geometry is **measured**, not derived from `cols[].resolvedWidth`, and
 * that is not paranoia: the preset's `<colgroup>` also carries
 * `.vt-col-selection` and `.vt-col-actions`, which are 40px and 150px of CSS
 * and are not columns at all. Declared widths would put every boundary off by
 * the checkbox column on every selectable table. Measuring is also what makes
 * a resize, a pin and a folded band come out right without any of them being
 * known about here.
 *
 * The header row rather than a body row, because every column has exactly one
 * `<th>` — a band member spanning rows included — and a header exists even when
 * the body is empty or still loading.
 *
 * One `getBoundingClientRect` sweep per key press, so one forced layout, and it
 * reads header cells rather than rows: nothing here can reach the pipeline, and
 * `tests/invalidation.spec.ts` says so.
 */
function scrollColumns(direction: number): void {
  const box = scrollBox.value
  if (!box) return

  // The *padding* box, which is where `scrollLeft` is measured from.
  // `getBoundingClientRect` gives the border box, and `.vt-scroll` carries a
  // border: without `clientLeft` every boundary comes out a border-width too
  // far right, and scrolling to the very start lands at 1px instead of 0.
  const boxLeft = box.getBoundingClientRect().left + box.clientLeft
  let inset = 0
  const boundaries: number[] = []

  for (const cell of box.querySelectorAll<HTMLElement>('.vt-th[data-column]')) {
    const rect = cell.getBoundingClientRect()
    // Left-pinned cells are `position: sticky`, so they sit over the content
    // permanently: their combined width is dead space a column must not be
    // scrolled under. Their own rects are the stuck positions rather than the
    // laid-out ones, which is the other reason they are no use as boundaries.
    if (cell.dataset.pinned === 'left') inset += rect.width
    // Right-pinned cells eat space at the far edge, but nothing is ever
    // scrolled *to* them, so they are simply not boundaries.
    else if (!cell.dataset.pinned) boundaries.push(rect.left - boxLeft + box.scrollLeft)
  }

  const next = nextScrollLeft(
    box.scrollLeft,
    inset,
    boundaries,
    direction < 0 ? -1 : 1,
    box.scrollWidth - box.clientWidth,
  )
  // A direct assignment rather than `scrollTo({ behavior: 'smooth' })`: key
  // repeat against a running smooth scroll queues animations that fight each
  // other, and an instant jump has no `prefers-reduced-motion` question to
  // answer.
  if (next !== undefined) box.scrollLeft = next
}

/**
 * `Ctrl`/`Cmd` + `↑`/`↓`: scroll one screenful, and leave the cursor alone.
 *
 * The vertical twin of `scrollColumns`, and the gesture a virtual table needs
 * most: with no pages, `Ctrl`/`Cmd`+`←`/`→` has nothing to turn, and the arrows
 * move one row at a time through however many rows there are.
 *
 * The header is measured rather than assumed, because it is `position: sticky`
 * and covers the top of the scrollport: a step of the full viewport height
 * would slide a header's worth of rows past unseen. One
 * `getBoundingClientRect` per press, on one element.
 */
function scrollViewport(direction: number): void {
  const box = scrollBox.value
  if (!box) return

  const header = box.querySelector<HTMLElement>('thead')
  const next = nextScrollTop(
    box.scrollTop,
    box.clientHeight,
    box.scrollHeight - box.clientHeight,
    direction < 0 ? -1 : 1,
    header?.getBoundingClientRect().height ?? 0,
    props.rowHeight,
  )
  // Assigned rather than smooth-scrolled, for the reason `scrollColumns` is:
  // key repeat against a running animation queues scrolls that fight.
  if (next !== undefined) box.scrollTop = next
}

/**
 * How wide the pinned band on one side is, in CSS pixels, for the scroll box to
 * inset its idea of "in view" by.
 *
 * Pinned cells are `position: sticky` and so sit *over* the content rather than
 * beside it. The browser's scroll-into-view knows nothing about that, so a cell
 * it scrolled flush against the left edge of the box lands underneath the
 * left-pinned band and is not visible at all — which is why walking the cursor
 * leftwards looked like a table that had stopped scrolling. `scroll-padding`
 * on `.vt-scroll` is the fix, and this is the number it needs; the sticky
 * header already had the same problem solved the same way one axis over, with
 * `--vtc-header-rows` and `scroll-margin-top`.
 *
 * Declared widths rather than a measurement, because these are the very numbers
 * `useColumns` accumulates into `pinOffset` to *place* the sticky cells. Derived
 * any other way the padding and the pin could disagree, and the cell would land
 * beside a band of the wrong width. (`scrollColumns` above measures instead,
 * for a reason that does not apply here: it needs the boundaries of the
 * *unpinned* columns, and the preset's own `<colgroup>` entries put those out of
 * step with the declared widths.)
 *
 * A string with its unit, so the template can hand it straight to a custom
 * property — a bare number would be an invalid `scroll-padding`.
 */
function pinnedWidth(cols: ResolvedColumn<TRow>[], side: PinSide): string {
  let total = 0
  for (const column of cols) if (column.pinned === side) total += column.resolvedWidth ?? 0
  return `${total}px`
}

/**
 * Enter, F2 or a left click on the cursor cell.
 *
 * `TableGrid` reports the gesture rather than acting on it, because opening an
 * editor needs a session it may not have. Here we do have one, so: open the
 * editor if this cell has one, and otherwise let Enter mean what it means
 * everywhere else in the grid — move on. `commitMoveFor` returns nothing for
 * F2 and nothing for a click, so neither of those moves a read-only cell,
 * which is right: F2 asks to edit and nothing else.
 */
/**
 * The slot names to hand down to `DataTableBody`, typed as plain strings on
 * purpose.
 *
 * `v-for="(_, name) in $slots"` with `#[name]` reads naturally and type-checks
 * under `vue-tsc`, but it makes the slots this component *declares* depend on
 * the type of the slots it *receives* — and `vite-plugin-dts` reports that
 * circle as TS7022 while generating the declarations, so the shipped types are
 * built from a file the type-checker was unhappy with. The annotation here is
 * what cuts it: the names leave the script already `string[]`, so nothing the
 * template declares points back at `$slots`.
 *
 * A function rather than a computed: the slots object is replaced on re-render
 * rather than mutated reactively, so a cached list could describe the previous
 * render's slots.
 */
const slots = useSlots()
function forwardedSlotNames(): string[] {
  return Object.keys(slots)
}

/**
 * What `TableRoot` exposes, of what this component needs.
 *
 * `InstanceType<typeof TableRoot>` does not work on a generic SFC — the
 * component is a function with a type parameter rather than a constructor —
 * and `selection` is a plain value here rather than a `ComputedRef` because
 * `defineExpose` hands out a ref-unwrapping proxy. Reading it still tracks.
 */
interface TableRootView<T extends Record<string, unknown>> {
  selection: UseRowSelection<T> | undefined
  columns: UseColumnsResult<T>
}

/*
 * `shallowRef`, not `ref`: `ref` deep-unwraps refs *in its type*, which would
 * describe `selection.selectedRows` as a plain array while the expose proxy
 * only unwraps the top level and hands back the `ComputedRef` it really is.
 */
const root = shallowRef<TableRootView<TRow> | null>(null)

/**
 * `update:selectedRows`, forwarded only when someone up here is listening.
 *
 * `TableRoot` resolves the rows only for a listener, because resolving them is
 * a walk over the filtered set — and a forwarder bound unconditionally *is* a
 * listener, which would quietly spend that walk on every selection change for
 * every table. So the gate has to be at this end too.
 *
 * A function rather than a computed, for the reason `forwardedSlotNames` is
 * one: the vnode is replaced on re-render rather than mutated reactively, so a
 * cached answer would describe the previous render's listeners.
 */
const instance = getCurrentInstance()
function selectedRowsListener(): Record<string, (rows: TRow[]) => void> {
  const vnodeProps = instance?.vnode.props
  const listening = vnodeProps?.['onUpdate:selectedRows'] ?? vnodeProps?.['onUpdate:selected-rows']
  if (!listening) return {}
  return { 'update:selectedRows': (rows: TRow[]) => emit('update:selectedRows', rows) }
}

/**
 * The selection, for code that would rather hold a template ref than wire up a
 * slot or an event: `tableRef.value.selection?.count.value`.
 *
 * `undefined` whenever `selectable` is `false`, exactly as the `toolbar` slot's
 * `selection` is — one table, one answer, whichever way you reach it.
 */
const selectionApi = computed(() => root.value?.selection)

/**
 * The selected rows, resolved across pages where the source holds them all.
 *
 * A function rather than a computed on purpose: resolving rows is a walk over
 * the filtered set, and a function makes that a cost the caller asks for at the
 * moment they want an answer. Empty when `selectable` is `false`.
 */
function getSelectedRows(): TRow[] {
  return root.value?.selection?.selectedRows.value ?? []
}

/**
 * Widths for the columns that declared none, measured from the rendered table.
 *
 * Here rather than in `TableRoot` because the probe needs the scroll box and
 * the preset's stylesheet, and both belong to this component. `renderedRows`
 * gates it: a table whose source has not answered yet has a header and nothing
 * else, and measuring that would cache the header's width as the column's.
 */
const autoWidth = useAutoColumnWidth<TRow>({
  box: scrollBox,
  columns: () => root.value?.columns,
  renderedRows: () => props.source.rows.value.length,
})

defineExpose({
  selection: selectionApi,
  getSelectedRows,
  /**
   * The open detail rows, for a caller that wants to drive them from outside
   * without owning the composable. `undefined` when the table is neither
   * `expandable` nor handed an `expansion`.
   */
  expansion,
  /**
   * Measure the undeclared column widths again, for a caller that swapped the
   * dataset for one whose cells are a different size. Widths a user dragged are
   * untouched, as they are by everything else here.
   */
  remeasureColumns: autoWidth.remeasure,
})

/**
 * The row and the column a cursor position names, either of which may be
 * missing: the position outlives the rows it points at, so a cell that has been
 * filtered or paged away resolves to nothing rather than to the wrong row.
 */
function cellAt(
  position: CellPosition,
  rows: TRow[],
  cols: ResolvedColumn<TRow>[],
  cursor: UseCellCursor<TRow> | undefined,
): { row: TRow | undefined; column: ResolvedColumn<TRow> | undefined } {
  return {
    row: rows.find((entry) => cursor?.getRowId(entry) === position.rowId),
    column: cols.find((entry) => entry.id === position.columnId),
  }
}

/**
 * The cell whose editor was opened by typing, and so holds the typed character
 * rather than the value that was there.
 *
 * It lives here rather than in the draft because the seed is known only where
 * the gesture is — `onActivate` below — while the editor that has to react to
 * it is a level down in `DataTableBody`; and because a caret is a rendering
 * detail, which `RowEditState` (a public type) has no business carrying.
 *
 * Never cleared on close, only overwritten: it is compared by row *and* column
 * id, so a stale entry can only fail to match, which is the ordinary
 * select-the-value case.
 */
const seededCell = shallowRef<CellPosition | null>(null)

function onActivate(
  position: CellPosition,
  event: Event,
  rows: TRow[],
  cols: ResolvedColumn<TRow>[],
  cursor: UseCellCursor<TRow> | undefined,
): void {
  const session = props.editing
  const { row, column } = cellAt(position, rows, cols, cursor)
  if (session && row && column && session.isEditable(row, column)) {
    // Already open: leave it alone. Enter and F2 could not reach this — with an
    // editor mounted the key press never leaves it — but a click can land in a
    // cell that is already editing, and `begin` would reset `activeColumnId`
    // and re-seed nothing over a draft the user is part-way through.
    if (session.isEditing(session.getRowId(row), column.id)) return
    session.begin(row, column.id)
    /*
     * A cell opened by typing starts holding what was typed, not what was
     * there: the character replaces the value, which is what a spreadsheet
     * does and what makes retyping a cell one gesture rather than three.
     * Delete and Backspace seed `''`, so they open the editor cleared — the
     * clear is a draft like any other, and Escape still puts the cell back.
     *
     * Enter, F2 and a click seed nothing and open the value untouched.
     */
    const seed = 'key' in event ? editSeedFor(event as unknown as KeyboardEvent) : undefined
    seededCell.value = seed === undefined ? null : position
    if (seed !== undefined) session.setValue(row, column, seed)
    return
  }
  // A `KeyboardEvent` satisfies `CursorKeyGesture` structurally; anything else
  // has no `key` and is not a move.
  const move = 'key' in event ? commitMoveFor(event as unknown as KeyboardEvent) : undefined
  if (move) cursor?.move(move)
}

/**
 * Copy puts the cell's **displayed** text on the clipboard, not its value.
 *
 * `getCellText` is what the cell renders, `column.format` included, so a date
 * copies as the date the user is looking at rather than as an ISO string they
 * never saw. It is also the inverse of the paste below, which parses text the
 * same way a typed edit does.
 *
 * No editing session is needed and no `isEditable` check is made: copying is a
 * read, and a table whose cells could be read on screen but not onto the
 * clipboard would only be teaching people to retype them.
 */
function onCopy(
  position: CellPosition,
  event: ClipboardEvent,
  rows: TRow[],
  cols: ResolvedColumn<TRow>[],
  cursor: UseCellCursor<TRow> | undefined,
  getCellText: (row: TRow, column: ColumnDef<TRow>) => string,
): void {
  const { row, column } = cellAt(position, rows, cols, cursor)
  if (!row || !column) return
  // The default is not suppressed until the text is actually written, so a
  // cell that resolved to nothing leaves the browser's own copy alone.
  event.clipboardData?.setData('text/plain', getCellText(row, column))
  event.preventDefault()
}

/**
 * Paste is a typed edit whose characters arrived all at once: open the draft,
 * set the text, save.
 *
 * `setValue` runs `parseCellInput`, so `column.parse` and the type coercion
 * apply exactly as they do to typing, and a value that fails validation leaves
 * the editor open holding the message — the same place a rejected save leaves
 * it. Nothing about the clipboard needs its own parser or its own error path.
 *
 * The payload is used verbatim apart from one trailing newline. Splitting on
 * tabs and newlines would be block paste, which needs a cell *range* to paste
 * into and there is none; and a `textarea` column means its newlines. The one
 * exception is the line ending a spreadsheet appends to a single-cell copy,
 * which nobody typed and nobody wants stored.
 */
function onPaste(
  position: CellPosition,
  text: string,
  event: ClipboardEvent,
  rows: TRow[],
  cols: ResolvedColumn<TRow>[],
  cursor: UseCellCursor<TRow> | undefined,
): void {
  const session = props.editing
  if (!session) return
  const { row, column } = cellAt(position, rows, cols, cursor)
  // A read-only cell does not claim the gesture, so the paste is still the
  // browser's — it will do nothing to a `<td>`, which is the honest outcome.
  if (!row || !column || !session.isEditable(row, column)) return
  event.preventDefault()
  session.begin(row, column.id)
  // Seeded like a typed-open cell: the draft holds what was pasted, not what
  // was there, so a commit that fails must leave that text unselected rather
  // than one keystroke from being wiped.
  seededCell.value = position
  session.setValue(row, column, text.replace(/\r?\n$/, ''))
  // Not awaited: a save is the source's business and may take as long as it
  // likes. A failure is reported through the draft, which stays open.
  void session.commit(row)
}
</script>

<template>
  <TableRoot
    ref="root"
    v-slot="{
      rows,
      columns: cols,
      headerRows,
      bandEdges,
      state: tableState,
      selection,
      cursor,
      pagination,
      source: src,
      loading,
      error,
      total,
      displayRows,
      grouping,
      getRowKey: rowKey,
      getCellText: cellText,
    }"
    :columns="columns"
    :source="source"
    :state="state"
    :selectable="props.selectable"
    :selection-state="selectionState"
    :get-row-id="getRowId"
    :is-row-selectable="isRowSelectable"
    :column-groups="columnGroups"
    :initial-layout="initialLayout"
    :storage-key="storageKey"
    :storage-fields="storageFields"
    :page-size="pageSize"
    :virtual="virtual"
    :rendered-row-ids="renderedRowIds"
    :reorderable="reorderable"
    :initial-group-by="initialGroupBy"
    :group-mode="groupMode"
    :groups-collapsed="groupsCollapsed"
    :blank-group-label="blankGroupLabel"
    :labels="words"
    :editing="editing"
    :cell-cursor="cellCursor"
    :initial-cursor="initialCursor"
    :autofocus-cursor="autofocusCursor"
    @update:query="$emit('update:query', $event)"
    @update:selection="$emit('update:selection', $event)"
    @update:selection-state="$emit('update:selectionState', $event)"
    v-on="selectedRowsListener()"
    @update:column-order="$emit('update:columnOrder', $event)"
  >
    <div
      v-bind="$attrs"
      class="vt-datatable"
      :style="ruleStyle"
      :data-theme="themeAttribute"
      :data-loading="loading || undefined"
      :aria-busy="loading || undefined"
    >
      <!--
        The live region is mounted unconditionally and only its *text* changes.
        A region that appears at the same moment as its content is unreliably
        announced — screen readers watch existing regions for mutations — which
        is what the previous `role="status"` on the `v-if`'d overlay was doing.
      -->
      <span class="vt-visually-hidden" role="status" aria-live="polite">
        {{ loading ? loadingText : '' }}
      </span>

      <div v-if="showToolbar" class="vt-toolbar">
        <slot name="toolbar" :state="tableState" :selection="selection" :total="total">
          <input
            v-if="showSearch"
            class="vt-search"
            type="search"
            :placeholder="words.search"
            :value="tableState.globalSearch.value"
            :aria-label="words.searchAllColumns"
            @input="tableState.setSearch(($event.target as HTMLInputElement).value)"
          />
          <span v-if="selection && !selection.isEmpty.value" class="vt-selection-summary">
            {{ words.selectedCount(selection.count.value) }}
            <button type="button" class="vt-btn vt-btn-link" @click="selection.clear()">
              {{ words.clear }}
            </button>
          </span>
          <span class="vt-toolbar-spacer" />
          <RowGroupMenu v-if="showGroupMenu" />
          <ColumnVisibilityMenu v-if="showColumnsMenu" />
          <button
            v-if="showExport"
            type="button"
            class="vt-btn"
            :aria-label="words.exportRowsDescription"
            @click="onExport(cols)"
          >
            {{ words.exportRows }}
          </button>
        </slot>
      </div>

      <ActiveFilters />

      <!--
        "Select all N matching" — offered only once the visible page is fully
        checked, so it never fires before the user means it.
      -->
      <div
        v-if="selection && selection.headerState.value === 'all' && total > rows.length"
        class="vt-selectall-banner"
      >
        <template v-if="selection.isAllMatching.value">
          {{ words.allMatchingSelected(selection.count.value) }}
          <button type="button" class="vt-btn vt-btn-link" @click="selection.clear()">
            {{ words.clearSelection }}
          </button>
        </template>
        <template v-else>
          {{ words.allOnPageSelected(rows.length) }}
          <button type="button" class="vt-btn vt-btn-link" @click="selection.selectAllMatching()">
            {{ words.selectAllMatching(total) }}
          </button>
        </template>
      </div>

      <!--
        A frame around the scroll box purely so the loading overlay has an
        anchor that does not scroll. An absolutely positioned child of an
        `overflow: auto` element is laid out against the padding box at scroll
        origin and then translates with the content, so inside `.vt-scroll` the
        scrim and the spinner slid off the top the moment you scrolled past
        `max-height`. Out here they stay over the part you are looking at.
      -->
      <div class="vt-scroll-frame">
        <!--
          Three numbers the stylesheet cannot work out for itself, all saying
          the same thing: the browser's scroll-into-view knows nothing about
          `position: sticky`, so anything stuck has to declare how much of an
          edge it has already spoken for. `--vtc-header-rows` covers the sticky
          header (via `scroll-margin-top`), `--vtc-pin-*` the two pinned bands
          (via `scroll-padding`).
        -->
        <div
          ref="scrollBox"
          class="vt-scroll"
          :data-sticky="stickyHeader || undefined"
          @pointerover="onPointerOver"
          @pointerleave="hoverColumnId = undefined"
          :style="{
            '--vtc-header-rows': headerRows.length,
            '--vtc-pin-left': pinnedWidth(cols, 'left'),
            '--vtc-pin-right': pinnedWidth(cols, 'right'),
            // Only in virtual mode, so an ordinary table keeps whatever height
            // the theme gave it. Here the two have to agree: a row laid out
            // taller than the window counted on drifts a pixel per row, and by
            // row 5000 the spacers are describing a different table.
            ...(virtual ? { '--vtc-row-height': `${rowHeight}px` } : {}),
          }"
        >
          <TableGrid
            :columns="cols"
            :row-count="ariaRowCount(headerRows, displayRows, total)"
            :selection-column="leadingColumn"
            :actions-column="actionsColumn"
            :cursor="cursor"
            @activate="(position, event) => onActivate(position, event, rows, cols, cursor)"
            @copy="(position, event) => onCopy(position, event, rows, cols, cursor, cellText)"
            @paste="
              (position, text, event) => onPaste(position, text, event, rows, cols, cursor)
            "
            @band-fold="(fold) => bandFold(fold, cursor)"
            @detail-toggle="(rowId, toggle) => detailToggle(rowId, toggle, rows)"
            @page-move="(pages) => pageMove(pages, pagination)"
            @scroll-move="scrollColumns"
            @viewport-move="scrollViewport"
          >
            <!--
              One `<tr>` per header row. With no band declared `headerRows` is a
              single row of column cells spanning one row each, which is exactly
              the markup this emitted before bands existed.

              The selection and actions cells belong to the first row only, and
              span the rest: they head a column, not a band, and a second copy
              in row two would push every real column one place to the right.
            -->
            <DataTableHeader
              :hover-column-id="hoverColumnId"
              :group-by="tableState.groupBy.value"
              :grouping="grouping"
              :header-rows="headerRows"
              :leading-column="leadingColumn"
              :selectable="selectable"
              :selection-mode="props.selectable"
              :selection="selection"
              :cursor="cursor"
              :actions-column="actionsColumn"
              :numbered="virtual"
            >
              <template v-if="$slots.headerGroup" #headerGroup="bandProps">
                <slot name="headerGroup" v-bind="bandProps" />
              </template>
            </DataTableHeader>

            <DataTableBody
              :columns="cols"
              :rows="rows"
              :header-row-count="virtual ? headerRows.length : undefined"
              :virtual="virtual"
              :row-height="rowHeight"
              :measure-rows="measureRows"
              :end-threshold="endThreshold"
              @end-reached="$emit('endReached')"
              :overscan="overscan"
              :scroll-parent="scrollBox"
              :display-rows="displayRows"
              :expansion="expansion"
              @update:rendered-row-ids="renderedRowIds = $event"
              :source="src"
              :loading="loading"
              :error="error"
              :selection="selection"
              :cursor="cursor"
              :hover-column-id="hoverColumnId"
              :editing="props.editing"
              :row-key="rowKey"
              :selectable="selectable"
              :row-click-select="rowClickSelect"
              :row-mode="rowMode"
              :seeded-cell="seededCell"
              :actions-column="actionsColumn"
              :extra-columns="extraColumns"
              :empty-message="emptyText"
              @row-click="(row, event) => $emit('rowClick', row, event)"
              @row-saved="(row) => $emit('rowSaved', row)"
              @row-save-error="(row, err) => $emit('rowSaveError', row, err)"
            >
              <!--
                Every slot, forwarded wholesale rather than named one at a time.
                Two of the body's slots carry a column id in the name —
                `cell:<id>` and `editor:<id>` — so there is no list to write, and
                a list would go stale the moment a column is added anyway.

                Iterating this component's own `$slots` means only the slots a
                caller actually passed are forwarded, which is what keeps the
                body's own fallback content — the empty message, the default
                group header, the plain cell text — working.
              -->
              <template v-for="name in forwardedSlotNames()" #[name]="slotProps">
                <slot :name="name" v-bind="slotProps ?? {}" />
              </template>
            </DataTableBody>

            <!--
              After `</tbody>`, which is where HTML wants it, and inside the same
              `TableGrid` slot — the grid is a bare `<slot />`, so a footer needs
              nothing from it but the `<colgroup>` widths it already applies.

              `grouping.overallAggregates` rather than the slot's
              `overallAggregates`: destructuring that in `v-slot` would resolve
              it on every render, and it is a whole-dataset pass. Read here it
              runs only behind the `v-if`, so a table with no footer never pays
              for one.
            -->
            <DataTableFooter
              v-if="showFooter"
              :columns="cols"
              :band-edges="bandEdges"
              :aggregates="grouping.overallAggregates.value"
              :hover-column-id="hoverColumnId"
              :label="footerText"
              :selectable="selectable"
              :actions-column="actionsColumn"
            >
              <template v-if="$slots.footer" #footer="footerProps">
                <slot name="footer" v-bind="footerProps" />
              </template>
            </DataTableFooter>
          </TableGrid>
        </div>

        <div v-if="loading" class="vt-loading-overlay">
          <slot name="loading">
            <span class="vt-loading-pill">
              <!--
                Hidden from assistive tech, not labelled: the word beside it is
                real text now, so an `aria-label` here would be read twice.
              -->
              <span class="vt-spinner" aria-hidden="true" />
              {{ loadingText }}
            </span>
          </slot>
        </div>
      </div>

      <ColumnDragGhost v-if="reorderable" />

      <slot name="pagination" :state="tableState" :total="total">
        <!--
          Never in virtual mode, whatever the prop says: there is exactly one
          page there, and `showPagination` defaults to `true`, so refusing the
          combination out loud would fire at people who never asked for it.
        -->
        <TablePagination v-if="showPagination && !virtual" />
      </slot>
    </div>
  </TableRoot>
</template>
