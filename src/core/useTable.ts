/**
 * The whole table, assembled — everything `<TableRoot>` used to do in a
 * component, with no component in it.
 */
import { computed, onMounted, watch, watchEffect, type ComputedRef } from 'vue'
import type {
  ColumnDef,
  ColumnGroupDef,
  DataSource,
  GroupMode,
  HeaderRow,
  RowId,
  SelectionMode,
} from './types'
import type { TableContext } from './context'
import { useTableState, type TableState } from './useTableState'
import { useColumns, type ColumnLayoutState } from './useColumns'
import { devChecksEnabled, devWarn } from './devWarn'
import { buildHeaderRows } from './columnGroups'
import type { ColumnLayoutField } from './columnStorage'
import { useColumnDnd, type DropSide, type UseColumnDnd } from './useColumnDnd'
import { useRowGrouping, type UseRowGrouping } from './useRowGrouping'
import { useRowSelection, defaultRowId, type UseRowSelection } from './useRowSelection'
import { useCellCursor, type UseCellCursor } from './useCellCursor'
import type { CellPosition } from './cellCursor'
import type { UseRowEditing } from './useRowEditing'
import { usePagination } from './usePagination'
import type { LocalDataSource } from './useLocalDataSource'
import { readValue } from './sorting'
import { isEmptyFilter } from './filters/model'

/** Everything `useTable` accepts. See `useTable` for what is read when. */
export interface UseTableOptions<TRow> {
  /** The column definitions. */
  columns: () => ColumnDef<TRow>[]
  /** Local or server — `useTable` treats them identically. */
  source: () => DataSource<TRow>
  /**
   * Reuse an existing state object, or let this composable own one. To hoist
   * the query into a store or the URL, build the state yourself with
   * `useTableState({ state: yourRef })` and pass it here.
   */
  state?: TableState
  /** `false` (the default), `true`, or `'single'`. */
  selectable?: () => boolean | SelectionMode
  getRowId?: (row: TRow) => RowId
  isRowSelectable?: (row: TRow) => boolean
  /**
   * Header bands, giving a multi-row header and per-band collapse.
   *
   * Optional even when columns declare a `group`: a band forms because a
   * column claims it, and these supply the label, the nesting and how it
   * folds. With no column declaring one, the header stays a single row.
   */
  columnGroups?: () => ColumnGroupDef[] | undefined
  /** Read once at setup. */
  initialLayout?: Partial<ColumnLayoutState>
  /**
   * Saves the column layout under this key in `localStorage` and restores it
   * on the next call. Read once at setup, like `initialLayout` — a saved
   * layout wins over it.
   */
  storageKey?: string
  /** Which parts of the layout `storageKey` saves. Defaults to all four. */
  storageFields?: ColumnLayoutField[]
  /**
   * Rows per page. Left undefined here rather than defaulted, so the number
   * lives in `useTableState` alone — see `DEFAULT_PAGE_SIZE`. Read once at
   * setup, and ignored entirely when a `state` is supplied, because that state
   * is then the authority.
   */
  pageSize?: number
  /**
   * Renders every row as one continuous scroll instead of a page at a time.
   *
   * Here it means one thing only: **a page size of everything.** The window
   * itself is the render layer's business (`VirtualBody`), and nothing in
   * `core/` knows a window exists. Everything downstream — the grouping, the
   * selection, the cursor's row list, the footer's totals — keeps the meaning
   * it already had, because "the page" has simply become the whole result set.
   *
   * The size the table had is restored when this goes back off.
   */
  virtual?: () => boolean
  /**
   * Which rows are actually in the document, when a virtual body is rendering
   * fewer than the table holds.
   *
   * Reaches `useCellCursor` and nothing else, where it decides which cell may
   * carry `tabindex="0"`. The cursor still *addresses* every row — a position
   * is an identity, and scrolling does not change which row it names — but the
   * one cell a Tab lands on has to be one that exists.
   *
   * It travels up from the render layer rather than down, because the window
   * is the renderer's business: `core/` has no viewport to measure.
   */
  renderedRowIds?: () => RowId[] | undefined
  siblingCount?: () => number | undefined
  /** Turns column drag-to-reorder off for the whole table. Defaults to on. */
  reorderable?: () => boolean
  /**
   * Groups rows by these columns on first render, outermost level first.
   *
   * Seeds a `state` supplied from outside as well as one this composable
   * owns — unlike `pageSize` — but only when that state carries no grouping of
   * its own, which keeps it a default rather than an override.
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
   * Written through on every change, so it works with a `state` supplied from
   * outside too. Leave it unset to keep whatever that state was built with.
   */
  groupMode?: () => GroupMode | undefined
  /** Renders every group folded shut until the user opens it. */
  groupsCollapsed?: boolean
  /** Header text for the bucket holding rows with no value. */
  blankGroupLabel?: string
  /**
   * An editing session, from `useRowEditing`. Passed in rather than built
   * here, unlike selection: editing carries a `save`, a `validate`, an `apply`
   * and a mode, and re-declaring all four here would duplicate that
   * composable's own surface for nothing. Leave it out and cells are
   * read-only.
   */
  editing?: () => UseRowEditing<TRow> | undefined
  /**
   * A keyboard cell cursor: arrow keys move a focused cell.
   *
   * A boolean rather than a session built outside, unlike `editing`. That one
   * is passed in because it carries callbacks; a cursor carries none. It also
   * *has* to be built here, because only this composable knows the rendered
   * row order — see `cursorRows` below.
   */
  cellCursor?: () => boolean
  /** Where the cursor starts. Read once at setup. */
  initialCursor?: CellPosition
  /**
   * Take the caret on load, instead of waiting for a Tab or a click. Read once,
   * on mount. Does nothing without `cellCursor`.
   */
  autofocusCursor?: boolean
}

/**
 * A wired table: the `TableContext` every primitive reads, plus the few
 * derived values a renderer needs that no primitive reaches for.
 */
export interface UseTable<TRow> extends TableContext<TRow> {
  /**
   * Always present, unlike the optional fields of the same name on
   * `TableContext`. Those are optional because a context assembled by hand may
   * leave them out; `useTable` builds both every time, and saying so here
   * spares every caller a check that cannot fail.
   */
  grouping: UseRowGrouping<TRow>
  dnd: UseColumnDnd
  /** The header, row by row, bands folded in. */
  headerRows: ComputedRef<HeaderRow<TRow>[]>
  /** The cursor when one was asked for, `undefined` otherwise. */
  cursor: ComputedRef<UseCellCursor<TRow> | undefined>
  /**
   * The cursor itself, built whether or not it was asked for — see the note on
   * `cursor` below. Reach for `cursor` unless you specifically want the one
   * that exists regardless.
   */
  cellCursor: UseCellCursor<TRow>
  /**
   * Selection, ungated by `selectable` — the context's `selection` is the
   * gated view of this. A caller reporting selection changes wants this one,
   * so that turning `selectable` off does not look like a selection event.
   */
  rowSelection: UseRowSelection<TRow>
  /**
   * Identity for `v-for` keys. Honours `getRowId` — the whole point of the
   * option — but falls back to the row's position rather than throwing,
   * because a missing id is a rendering inconvenience, not a reason to blow up
   * the table.
   */
  getRowKey: (row: TRow, index: number) => RowId
}

/**
 * Wires a whole table — state, columns, drag, grouping, selection, cursor,
 * pagination — into one `TableContext`, with no component involved.
 *
 * This is what `<TableRoot>` is: it calls this, publishes the result with
 * `provideTableContext`, and renders a slot. Call it directly to build a table
 * whose markup has nothing in common with the preset's while its behaviour has
 * everything in common — every rule lives here rather than in a component, so
 * a hand-built table gets them all rather than reimplementing them.
 *
 * Options are getters wherever the value can change, matching the convention
 * `useColumns(() => props.columns, …)` already sets: a composable has no props
 * to watch, so the caller supplies the read. The rest are read once at setup,
 * and `UseTableOptions` says which are which.
 *
 * ```ts
 * const table = useTable({ columns: () => columns, source: () => source })
 * provideTableContext(table)   // only if primitives beneath need to find it
 * ```
 *
 * `TRow` is unconstrained, like every other composable in `core/`.
 * `<TableRoot>` constrains it to `Record<string, unknown>` because a Vue SFC's
 * `generic=` needs that for its template, but an ordinary `interface Row {…}`
 * has no index signature and so does not satisfy it — which would rule out the
 * normal way to type a row for no benefit down here.
 */
export function useTable<TRow>(
  options: UseTableOptions<TRow>,
): UseTable<TRow> {
  /** The three defaulted options, read through one place each. */
  const selectableOf = (): boolean | SelectionMode => options.selectable?.() ?? false
  const cursorEnabled = (): boolean => options.cellCursor?.() ?? false
  const reorderable = (): boolean => options.reorderable?.() ?? true

  const state =
    options.state ??
    useTableState({ pageSize: options.pageSize, initialGroupBy: options.initialGroupBy })

  /*
   * Virtual mode, in its entirety, as far as `core/` is concerned.
   *
   * Writing the page size rather than adding a second row path is what keeps
   * `query.pageSize` truthful — a URL-synced query still describes what was
   * asked for — and what keeps `source.rows` the one list every composable
   * below reads. The alternative, feeding the renderer from `filteredRows`,
   * would make `displayRows` mean one thing to the markup and another to the
   * cursor and the selection.
   *
   * `setPageSize` returns early on an unchanged size, which is what stops the
   * `total` dependency here from writing in a loop.
   */
  let sizeBeforeVirtual: number | undefined
  watch(
    [() => options.virtual?.() ?? false, () => options.source().total.value],
    ([on, total]) => {
      if (!on) {
        if (sizeBeforeVirtual !== undefined) state.setPageSize(sizeBeforeVirtual)
        sizeBeforeVirtual = undefined
        return
      }
      /*
       * A total of zero is "nothing to size to", not "size to nothing".
       *
       * A server source starts at `total: 0` and stays there until its first
       * response lands, so this watcher — which is `immediate` — used to fire
       * on mount and write a page size of 1. That is a real query change, so
       * `useServerDataSource` refetched at `pageSize: 1`, and every virtual
       * server-backed table spent one wasted round trip fetching a single row
       * before the real total arrived and sized the page properly. A local
       * source never showed it, knowing its total synchronously.
       *
       * Returning also covers a filter that matches nothing: the page size
       * stays whatever the last non-empty set asked for, which is the size the
       * next non-empty one will most likely want, and there are no rows to
       * window either way.
       */
      if (total <= 0) return

      // Captured on the way in, not on the way out: by then the page size is
      // the dataset's length and the number the caller chose is gone.
      if (sizeBeforeVirtual === undefined) sizeBeforeVirtual = state.pageSize.value
      state.setPageSize(total)
    },
    { immediate: true },
  )

  const columns = useColumns<TRow>(
    () => options.columns(),
    {
      groups: () => options.columnGroups?.(),
      sortFor: state.sortFor,
      sortIndexFor: state.sortIndexFor,
      // Same test `ActiveFilters` uses, so the header's funnel and the chip row
      // can never disagree about whether a column is filtered.
      hasFilter: (id) => !isEmptyFilter(state.filters.value[id]),
      initialLayout: options.initialLayout,
      storage: options.storageKey
        ? { key: options.storageKey, fields: options.storageFields }
        : undefined,
    },
  )

  /*
   * A sort naming a column nobody declared sorts by nothing at all: `sortRows`
   * looks the column up to find its accessor and skips a rule it cannot
   * resolve. That is the right behaviour — a typo in restored state or a URL
   * must not break the table — but it is indistinguishable from a sort that
   * simply did not work, which is the kind of thing a reader blames on the
   * library.
   *
   * A watcher rather than a check inside the pipeline, because the pipeline is
   * where this must *not* live: the stages are what the perf invariants count,
   * and the whole `devChecksEnabled()` block folds away in a consumer's
   * production build only if nothing downstream depends on it.
   */
  if (devChecksEnabled()) {
    watchEffect(() => {
      const declared = new Set(options.columns().map((column) => column.id))
      for (const rule of state.sort.value) {
        if (declared.has(rule.columnId)) continue
        devWarn(
          `Sorting by "${rule.columnId}", which no column declares. The rule is ignored — ` +
            'check the id against the column definitions.',
        )
      }
    })
  }

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
      reorderable() &&
      columns.all.value.find((column) => column.id === columnId)?.reorderable !== false,
  })

  const rows = computed(() => options.source().rows.value)

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
    () => options.columns(),
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
          ? options.source().groupCounts?.(state.groupBy.value)
          : undefined,
      /** Same gate, same reason: a band's figures must describe the rows under it. */
      aggregates: () =>
        state.groupMode.value === 'server'
          ? options.source().groupAggregates?.(state.groupBy.value)
          : undefined,
      collapsedByDefault: options.groupsCollapsed,
      blankLabel: options.blankGroupLabel,
    },
  )

  // Written through rather than read at setup, so the option still governs a
  // state the caller built. Left alone when unset, so that state keeps its own.
  watch(
    () => options.groupMode?.(),
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
   * option is a default and the caller's own state outranks a default. Runs
   * after the mode is settled above, so the seed lands in the home that mode
   * designates rather than relying on the flip to carry it across.
   */
  if (options.state && options.initialGroupBy?.length && state.groupBy.value.length === 0) {
    state.setGroupBy(options.initialGroupBy)
  }

  /**
   * Strict identity, for selection: a wrong id there silently corrupts the
   * selection, so a row with no id and no `getRowId` throws rather than guess.
   */
  function getRowId(row: TRow): RowId {
    return (options.getRowId ?? defaultRowId<TRow>)(row)
  }

  function getRowKey(row: TRow, index: number): RowId {
    if (options.getRowId) return options.getRowId(row)
    return (row as { id?: RowId }).id ?? index
  }

  // Built unconditionally and gated on the way out: creating it lazily would
  // freeze the answer at setup, so flipping `selectable` on later would render a
  // checkbox column with nothing behind it.
  const rowSelection = useRowSelection<TRow>(rows, () => options.source().total.value, {
    mode: () => (selectableOf() === 'single' ? 'single' : 'multiple'),
    getRowId,
    isSelectable: (row) => options.isRowSelectable?.(row) ?? true,
    /*
     * `filteredRows` is a `LocalDataSource` field rather than a `DataSource`
     * one, which is exactly the split `selectedRows` wants: only a source
     * holding every row can name the selected ones beyond the current page, and
     * a server source falling back to what is loaded is the honest answer
     * rather than a degraded one. Optional-chained off the source for that
     * reason — the same shape `groupCounts` and `groupAggregates` already have.
     */
    allRows: () => (options.source() as Partial<LocalDataSource<TRow>>).filteredRows?.value,
  })

  const selection = computed(() => (selectableOf() === false ? undefined : rowSelection))

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
  // is: creating it lazily would freeze the answer at setup, so turning the
  // option on later would render a grid with nothing behind it.
  const cellCursor = useCellCursor<TRow>(cursorRows, columns.visible, {
    getRowId,
    initial: options.initialCursor,
    renderedRowIds: () => options.renderedRowIds?.(),
  })

  /*
   * The default start — the first rendered cell — waits for the cursor to be
   * switched on, and deliberately does not go through `useCellCursor`'s
   * `initial`.
   *
   * Two reasons, and the first is a bug the suite caught. Resolving "the first
   * rendered cell" reads every rendered row's identity, and `getRowId` throws for
   * rows carrying no `id` unless the caller supplied one. A table with the cursor
   * off never asked for identities and must not be made to produce them, so the
   * read cannot happen at setup, where `initial` is consumed. The second is the
   * reason the cursor is built unconditionally in the first place: the option can
   * be switched on later, and an answer frozen at setup would leave that table
   * with a cursor starting nowhere.
   *
   * `immediate`, so the ordinary case — the option true from the first render —
   * still seeds on mount; `anchorAt` then does the waiting when the rows have
   * not arrived. Silent, asking for no focus: a ring is a hint about where the
   * arrow keys will start, but a caret nobody asked for is a scroll and a lost
   * keystroke.
   */
  watch(
    cursorEnabled,
    (on) => {
      if (!on || cellCursor.position.value) return
      cellCursor.anchorAt(0)
    },
    { immediate: true },
  )

  /*
   * `autofocusCursor`, and the two things that make it more than one call.
   *
   * `onMounted` rather than setup: the watcher that moves the DOM focus lives in
   * `TableGrid` and is created during *its* setup, which runs after this. A
   * `focusRequests` bump made here at setup is therefore captured as that
   * watcher's starting value and never seen as a change — which would make this
   * silently do nothing against a source that answers immediately and work
   * against one that fetches, the worst of both.
   *
   * And it waits, because a server source has no rows at mount and so no cell to
   * hand the caret to. `tabStop` turning non-null is exactly "there is one now",
   * whether that happens on the first render or three ticks later. One shot
   * either way: the watcher stops itself, so nothing here survives to pull the
   * caret back out of the search box on the re-filter three keystrokes later.
   *
   * `flush: 'post'`, so the cell is in the DOM and the roving tabindex has been
   * patched before anything is focused. Same reason `TableGrid`'s own focus
   * watcher uses it.
   *
   * Lifecycle in a composable, deliberately: this is *table* lifecycle, and the
   * three paragraphs above are about why it cannot be a setup-time call. Moving
   * the hook out would strand them from the code they explain.
   */
  /*
   * Registered only when it was asked for, rather than registered always with
   * the guard inside. The two are identical inside a component — `autofocusCursor`
   * is read once — but `useTable` is meant to be callable outside one, and an
   * `onMounted` with no component instance to attach to draws a Vue warning.
   * A table that never asked to take the caret should not have to hear about a
   * lifecycle hook it does not use.
   */
  if (options.autofocusCursor) onMounted(() => {
    /** Whether there is a cell to hand the caret to at all. */
    const ready = (): boolean => cursorEnabled() && cellCursor.tabStop.value !== null

    // The ordinary case, answered outright rather than through a watcher with
    // `immediate` — which would have to stop a handle it has not been given yet.
    if (ready()) {
      cellCursor.requestFocus()
      return
    }

    const stop = watch(
      ready,
      (isReady) => {
        if (!isReady) return
        stop()
        cellCursor.requestFocus()
      },
      { flush: 'post' },
    )
  })

  const cursor = computed(() => (cursorEnabled() ? cellCursor : undefined))

  /**
   * Every explicit page change carries the cursor along: same offset down the
   * page, same column.
   *
   * Paging is reading, and the eye is already at a height on the screen. Left
   * alone the cursor keeps naming a row this page does not hold, so the ring
   * vanishes, the tab stop falls back to the first cell and the focused cell is
   * gone from the document — the caret lands on `<body>`. Re-anchoring is the
   * same answer the keyboard route already gave; here it covers the pager
   * control and a programmatic `setPage` as well, because both come through
   * this pair of writers.
   *
   * Wrapping the two writers rather than watching `page` is what keeps the
   * *implicit* resets out: a new filter, sort or search sends the table back to
   * page 1 by assigning the field, not by calling `setPage`, and re-anchoring
   * there would pull the caret out of the search box the user is typing in.
   *
   * A no-op write anchors nothing. `setPage` clamps and `setPageSize` returns
   * early on an unchanged size, so the guard is what the state already decided
   * rather than a second opinion about it.
   *
   * The offset is read *before* the write, because afterwards there is nothing
   * left to read it from: the cursor's row is on no page and `rowOffset` says
   * `-1`. `anchorAt` then resolves it whenever the new rows arrive — the same
   * tick for a local source, some tick later for a server one, which is why
   * this is not simply a `moveTo` on the line after the write.
   *
   * The rendered ids are read before the write for a second reason, and the
   * offset alone was never enough without them. In that later tick the rows are
   * *still* the outgoing page: the source has not been asked yet, and with
   * `keepPreviousData` it goes on rendering that page for the whole fetch. So
   * the anchor is handed the list it is replacing, and waits for rows that are
   * not it.
   */
  function turnPage(write: () => void): void {
    const page = state.page.value
    const size = state.pageSize.value
    /*
     * A cursor nobody has placed stays unplaced. Turning the page must not give
     * an untouched table a ring, nor pull the caret into it — and `rowOffset`
     * is read only past this point, so a table with the cursor switched off
     * never asks `getRowId` for an identity its rows may not carry.
     */
    const placed = cursorEnabled() && cellCursor.position.value !== null
    const offset = placed ? Math.max(0, cellCursor.rowOffset.value) : 0
    const columnId = placed ? cellCursor.columnId.value : undefined
    const replacing = placed ? cellCursor.rowIds.value : undefined

    write()
    if (state.page.value === page && state.pageSize.value === size) return
    if (!placed) return
    cellCursor.anchorAt(offset, columnId, { focus: true, replacing })
  }

  /*
   * An anchor outlives the page turn that armed it when the page never arrives
   * — a rejected fetch leaves the rows exactly as they were. The next rows to
   * land then need not be that page's at all: a new search or filter produces
   * rows too, and it reaches the pipeline by assigning the field rather than
   * through `turnPage`, precisely so the caret is left alone. Letting the stale
   * anchor resolve there would move the ring for a page turn the user has
   * already given up on and pull the caret out of the box they are typing in —
   * the very thing wrapping the writers instead of watching `page` avoids.
   *
   * The four fields are the ones `shapeKey` reads, watched as fields rather
   * than as `state.query`, which is what keeps `page` and `pageSize` out of it:
   * an anchor must survive the page turn that created it.
   */
  watch(
    [
      () => state.sort.value,
      () => state.filters.value,
      () => state.globalSearch.value,
      () => state.groupBy.value,
    ],
    () => cellCursor.cancelAnchor(),
    { deep: true },
  )

  /*
   * The state everyone else sees. A spread rather than a mutation: `options.state`
   * may be a caller's own object, and rewriting their `setPage` under them is
   * not this composable's to do.
   */
  const pagedState: TableState = {
    ...state,
    setPage: (page) => turnPage(() => state.setPage(page)),
    setPageSize: (size) => turnPage(() => state.setPageSize(size)),
  }

  const pagination = usePagination(
    () => state.page.value,
    () => state.pageSize.value,
    () => options.source().total.value,
    { siblingCount: () => options.siblingCount?.(), onChange: pagedState.setPage },
  )

  /**
   * The header, row by row.
   *
   * Derived rather than put on the context: a folded band has already taken its
   * columns out of `columns.visible`, so this describes whatever list survives
   * and needs no collapse state of its own. `buildHeaderRows` is exported from
   * core, so a hand-assembled table reaches the same answer without a context.
   */
  const headerRows = computed(() =>
    buildHeaderRows(columns.visible.value, options.columnGroups?.()),
  )

  function getCellValue(row: TRow, column: ColumnDef<TRow>): unknown {
    return readValue(row, column)
  }

  function getCellText(row: TRow, column: ColumnDef<TRow>): string {
    const value = getCellValue(row, column)
    if (column.format) return column.format(value, row)
    if (value === null || value === undefined) return ''
    return String(value)
  }

  return {
    state: pagedState,
    columns,
    // A getter, so swapping the source (local ⇄ server) reaches everyone holding
    // the context rather than only the pieces that read it reactively.
    get source() {
      return options.source()
    },
    selection,
    rowSelection,
    pagination,
    dnd,
    grouping,
    // A getter, for the reason `source` is one: swapping the session must reach
    // everyone holding the context, not only what reads it reactively.
    get editing() {
      return options.editing?.()
    },
    rows,
    displayRows: grouping.displayRows,
    visibleColumns: columns.visible,
    columnDefs: computed(() => options.columns()),
    headerRows,
    cursor,
    cellCursor,
    getRowId,
    getRowKey,
    getCellValue,
    getCellText,
  }
}
