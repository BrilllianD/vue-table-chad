import { computed, ref, watch, type ComputedRef, type MaybeRefOrGetter, type Ref } from 'vue'
import { toValue } from 'vue'
import type { ColumnDef, ColumnGroupDef, PinSide, ResolvedColumn, SortDirection } from './types'
import { columnBandEdges, columnGroupPaths, type BandEdge } from './columnGroups'
import { devChecksEnabled, devWarn } from './devWarn'
import {
  clearColumnLayout,
  normalizeColumnStorage,
  readColumnLayout,
  writeColumnLayout,
  type ColumnStorageOptions,
} from './columnStorage'

/** The serialisable part of a layout: hidden ids, order, widths, pins. */
export interface ColumnLayoutState {
  hidden: string[]
  order: string[]
  widths: Record<string, number>
  /**
   * User overrides for `ColumnDef.pinned`. `false` is a real entry, not an
   * absent one — a column declaring `pinned: 'left'` needs a way to say
   * "unpinned" that outranks its own default.
   */
  pinned: Record<string, PinSide | false>
  /**
   * Ids of the header bands currently folded shut.
   *
   * Kept apart from `hidden` even though both end up withholding columns: one
   * is the user's verdict on a column, the other a band's current posture, and
   * expanding a band must not undo the former.
   */
  collapsedGroups: string[]
}

/**
 * Sort and filter lookups to decorate columns with, plus initial layout and
 * storage.
 */
export interface UseColumnsOptions {
  /** Reports the current sort direction for a column, if any. */
  sortFor?: (columnId: string) => SortDirection | false
  sortIndexFor?: (columnId: string) => number
  hasFilter?: (columnId: string) => boolean
  defaultWidth?: number
  initialLayout?: Partial<ColumnLayoutState>
  /**
   * Persists the layout to `localStorage` (or any `StorageLike`) and restores
   * it on the next mount. A bare string is shorthand for `{ key }`, which saves
   * visibility, order, widths and pins; pass `fields` to save fewer.
   *
   * Read once at setup — a saved layout outranks `initialLayout`, which stays
   * the fallback for a first visit.
   */
  storage?: string | ColumnStorageOptions
  /**
   * Header bands, for a multi-row header and per-band collapse.
   *
   * Optional even when columns declare a `group`: a band forms because a column
   * claims it, and these only supply the label, the nesting and how it folds.
   */
  groups?: MaybeRefOrGetter<ColumnGroupDef[] | undefined>
}

/** all / visible columns and every layout mutator. */
export interface UseColumnsResult<TRow> {
  /** Every column, in display order, including hidden ones. */
  all: ComputedRef<ResolvedColumn<TRow>[]>
  /** Visible columns in display order, with pin offsets resolved. */
  visible: ComputedRef<ResolvedColumn<TRow>[]>
  /**
   * Where a band's run ends, keyed by the column it falls to the right of.
   * Empty for a table declaring no bands.
   */
  bandEdges: ComputedRef<Map<string, BandEdge>>
  layout: Ref<ColumnLayoutState>

  isVisible: (columnId: string) => boolean
  toggleVisibility: (columnId: string, visible?: boolean) => void
  showAll: () => void

  setOrder: (order: string[]) => void
  moveColumn: (columnId: string, toIndex: number) => void
  /** Drops a column onto either edge of another one. */
  moveColumnTo: (columnId: string, targetId: string, side?: 'before' | 'after') => void

  setWidth: (columnId: string, width: number) => void
  /**
   * Forgets one column's stored width, so its declared `width` — or the
   * default — governs it again. `resetWidths()` is the whole-table version;
   * this is the one a double-click on a resize handle wants, because
   * overwriting the width with a number of its own would leave the column
   * unable to get back to what it declared.
   */
  resetWidth: (columnId: string) => void
  resetWidths: () => void

  /** Whether this band is folded shut. */
  isGroupCollapsed: (groupId: string) => boolean
  toggleGroup: (groupId: string, collapsed?: boolean) => void
  expandAllGroups: () => void
  collapseAllGroups: () => void

  setPinned: (columnId: string, side: PinSide | false) => void
  /** Forgets the override so the column's declared `pinned` applies again. */
  clearPinned: (columnId: string) => void
  resetLayout: () => void
  /**
   * Reports widths measured from a rendered table, by id.
   *
   * Not the persisted channel `setWidth` writes to: a measurement is never
   * saved, `resetWidth` does not clear it, and it is outranked by both a resize
   * and a declared `width`. Ids are written once — a later pass sees different
   * rows and must not move a column that is already on screen — and a width of
   * zero, which is what an unrendered element reports, is discarded.
   */
  setAutoWidths: (widths: Record<string, number>) => void
  /**
   * Forgets every measured width, so the next pass measures again. For a
   * caller that replaced the dataset with one whose cells are a different size.
   */
  clearAutoWidths: () => void
  /**
   * Drops the saved layout from storage without touching the current one. A
   * no-op when no `storage` was configured; `resetLayout()` overwrites the
   * saved entry with an empty layout, which is usually what you want instead.
   */
  clearStored: () => void
}

/**
 * Two jobs, one number, and they agree on purpose: the width a column gets when
 * nothing about it can be measured — SSR, jsdom, the frame before the first
 * layout — and the ceiling a measurement is allowed to reach. So no column ends
 * up wider than the flat 160 every undeclared column used to be; they only get
 * narrower.
 */
const DEFAULT_WIDTH = 160

/** The floor a measured or resized width is held above. */
const MIN_WIDTH = 60

/**
 * Says out loud what a bad column set does quietly.
 *
 * Neither problem throws. A table that refuses to render because one id is
 * empty is worse than one that renders and complains, and both mistakes are
 * recoverable: the column still appears, it just cannot be addressed by id —
 * which is how every layout, sort and filter lookup finds it.
 *
 * Deduped by message in `devWarn`, so the same duplicate reported on a later
 * re-evaluation stays quiet while a *different* one still gets through.
 */
function warnAboutColumns<TRow>(defs: ColumnDef<TRow>[]): void {
  const seen = new Set<string>()
  for (const column of defs) {
    if (!column.id) {
      devWarn(
        'A column was declared with no `id`. Layout, sorting and filtering all address ' +
          'columns by id, so this one cannot be hidden, reordered, resized or sorted.',
      )
      continue
    }
    if (seen.has(column.id)) {
      devWarn(
        `Duplicate column id "${column.id}". Ids address columns, so the layout, sort and ` +
          'filter state for these two is one entry that both will answer to.',
      )
    }
    if (column.flex && column.pinned) {
      devWarn(
        `Column "${column.id}" declares both \`flex\` and \`pinned\`. A pinned column's sticky ` +
          'offset is the sum of the widths before it, so it has to have one — the pin wins and ' +
          'the column is sized like any other.',
      )
    }
    seen.add(column.id)
  }
}

/**
 * `max` is a parameter rather than `column.maxWidth ?? DEFAULT_WIDTH`, because
 * the two callers want different ceilings: a measurement may not exceed the
 * default width, while a drag past `maxWidth` is the user's business — a column
 * declaring no `maxWidth` can be dragged as wide as the pointer goes.
 */
function clampWidth<TRow>(
  column: ColumnDef<TRow>,
  width: number,
  max = Number.POSITIVE_INFINITY,
): number {
  const min = column.minWidth ?? MIN_WIDTH
  return Math.min(Math.max(width, min), column.maxWidth ?? max)
}

/**
 * Folds user layout state (hidden / reordered / resized / pinned) into the
 * declared column defs, producing the list components actually render.
 */
export function useColumns<TRow>(
  columns: MaybeRefOrGetter<ColumnDef<TRow>[]>,
  options: UseColumnsOptions = {},
): UseColumnsResult<TRow> {
  const defaultWidth = options.defaultWidth ?? DEFAULT_WIDTH

  const storage = normalizeColumnStorage(options.storage)
  // Field by field, so persisting only `hidden` still lets `initialLayout`
  // supply the order rather than being discarded wholesale.
  const initial = { ...options.initialLayout, ...(storage ? readColumnLayout(storage) : undefined) }

  const layout = ref<ColumnLayoutState>({
    hidden: initial.hidden ? [...initial.hidden] : [],
    order: initial.order ? [...initial.order] : [],
    widths: { ...(initial.widths ?? {}) },
    pinned: { ...(initial.pinned ?? {}) },
    collapsedGroups: initial.collapsedGroups ? [...initial.collapsedGroups] : [],
  })

  /**
   * Widths measured from the rendered table, by whoever can see one.
   *
   * A separate map from `layout.widths` on purpose: that one is what the *user*
   * did — it is persisted, `resetWidth` clears it, and `columnStorage` is
   * defined against it. A measurement is a property of the viewport and the
   * font instead, so it is neither saved nor reset, and `resetWidth` on a
   * measured column now lands back on the measurement rather than on a number
   * the column never asked for.
   */
  const autoWidths = ref<Record<string, number>>({})

  if (storage) {
    // Batched (default flush), so a resize drag writes once per tick rather
    // than once per pointermove.
    watch(layout, (value) => writeColumnLayout(value, storage), { deep: true })
  }

  const source = computed(() => toValue(columns))

  /**
   * The declared columns, scanned for the two mistakes that corrupt a table
   * silently rather than erroring: a column with no `id`, and two columns
   * sharing one.
   *
   * Its own computed rather than a check inside `ordered` or `all`, so the walk
   * depends on the column *definitions* alone. Reordering, resizing or pinning
   * re-evaluates those; the defs are what a mistake lives in, and rescanning
   * every column on every drag would put an O(columns) pass on the one path
   * the layout work is careful to keep off it.
   *
   * Returns `defs` by identity, so standing in front of `ordered` costs
   * nothing: a computed handing back the same reference notifies nobody.
   */
  const checked = computed<ColumnDef<TRow>[]>(() => {
    const defs = source.value
    // The guard skips the *scan*, not merely the message — `devWarn` alone
    // would still pay for the walk in a consumer's production build.
    if (devChecksEnabled()) warnAboutColumns(defs)
    return defs
  })

  /** Declared order, overridden by any explicit ordering the user set. */
  const ordered = computed<ColumnDef<TRow>[]>(() => {
    const defs = checked.value
    const order = layout.value.order
    if (order.length === 0) return defs

    const byId = new Map(defs.map((column) => [column.id, column]))
    const result: ColumnDef<TRow>[] = []
    for (const id of order) {
      const column = byId.get(id)
      if (column) {
        result.push(column)
        byId.delete(id)
      }
    }
    // Columns added after the order was captured keep their declared position
    // relative to what is left, rather than vanishing.
    for (const column of defs) {
      if (byId.has(column.id)) result.push(column)
    }
    return result
  })

  function isVisible(columnId: string): boolean {
    return !layout.value.hidden.includes(columnId)
  }

  const groupDefs = computed<ColumnGroupDef[] | undefined>(() => toValue(options.groups))

  /** Band path per column, indexed once rather than once per lookup. */
  const groupPaths = computed(() => columnGroupPaths(source.value, groupDefs.value))

  /**
   * The columns a folded band is currently withholding.
   *
   * Everything a band covers goes, except the columns it folds *to* and any
   * column declaring `hideable: false` — a column the caller marked as never
   * hideable is the row's identity, and a band is no more entitled to take it
   * away than the column menu is.
   *
   * Depends on `collapsedGroups` and the declared columns, never on `hidden`,
   * `order`, `widths` or `pinned`. Resizing a column therefore cannot make this
   * recompute, which is what keeps a drag off the O(columns) path entirely.
   */
  const collapsedColumnIds = computed<Set<string>>(() => {
    const folded = layout.value.collapsedGroups
    const result = new Set<string>()
    if (folded.length === 0) return result

    const paths = groupPaths.value
    const byId = new Map((groupDefs.value ?? []).map((group) => [group.id, group]))

    for (const groupId of folded) {
      // Every column *under* the band, at any depth — folding an outer band
      // has to take its nested bands down with it.
      const members = source.value.filter((column) =>
        paths.get(column.id)?.some((group) => group.id === groupId),
      )
      if (members.length === 0) continue

      const declared = byId.get(groupId)?.collapseTo
      const requested = declared === undefined ? [] : [declared].flat()
      // Declared order, not display order, so dragging a column about cannot
      // change which one a folded band shows.
      const keep = new Set(
        requested.filter((id) => members.some((member) => member.id === id)),
      )
      // A `collapseTo` naming nothing in the band would fold it out of
      // existence. Falling back to the first member keeps the promise that a
      // band always leaves one column standing.
      if (keep.size === 0) keep.add(members[0]!.id)

      for (const member of members) {
        if (keep.has(member.id) || member.hideable === false) continue
        result.add(member.id)
      }
    }

    return result
  })

  /**
   * Four answers in precedence order, and `undefined` for a fifth case.
   *
   * A user's resize outranks everything, then a declared width, then the
   * fallback. A `flex` column resolves to `undefined` instead: `TableGrid`
   * renders it as a `<col>` with no width, and fixed table layout hands the
   * leftover space to exactly those. Pinned is checked here rather than at the
   * def, because a pin can arrive at runtime through `setPinned` — and a pinned
   * column may not be flex, since `pinOffset` below is a sum of real widths.
   */
  function resolvedWidthOf(column: ColumnDef<TRow>, pinned: PinSide | false): number | undefined {
    const stored = layout.value.widths[column.id]
    if (stored !== undefined) return stored
    if (column.width !== undefined) return column.width
    if (column.flex && !pinned) return undefined
    const measured = autoWidths.value[column.id]
    if (measured !== undefined) return measured
    return defaultWidth
  }

  function pinnedOf(column: ColumnDef<TRow>): PinSide | false {
    const override = layout.value.pinned[column.id]
    // `false` is a deliberate override; only an absent entry defers to the def.
    if (override !== undefined) return override
    return column.pinned ?? false
  }

  const all = computed<ResolvedColumn<TRow>[]>(() =>
    ordered.value.map((column, index) => {
      // Resolved first and passed in, because whether a column may be flex
      // depends on it and reading it twice could disagree with itself.
      const pinned = pinnedOf(column)
      return {
      ...column,
      visible: isVisible(column.id),
      order: index,
      resolvedWidth: resolvedWidthOf(column, pinned),
      pinned,
      pinOffset: 0,
      sortDirection: options.sortFor?.(column.id) ?? false,
      sortIndex: options.sortIndexFor?.(column.id) ?? 0,
      hasFilter: options.hasFilter?.(column.id) ?? false,
      collapsed: collapsedColumnIds.value.has(column.id),
      }
    }),
  )

  /**
   * Visible columns with pinned ones hoisted to the edges and their sticky
   * offsets accumulated from live widths — resizing a pinned column has to
   * shift everything pinned after it, so this cannot be precomputed config.
   */
  const visible = computed<ResolvedColumn<TRow>[]>(() => {
    // Both filters, in one pass: a column is on screen only if the user left it
    // on *and* no band above it is folded shut. Keeping the two apart is what
    // stops expanding a band from resurrecting a column the user switched off.
    const shown = all.value.filter((column) => column.visible && !column.collapsed)

    const left = shown.filter((column) => column.pinned === 'left')
    const right = shown.filter((column) => column.pinned === 'right')
    // Unpinned columns are passed through by reference. `all` already gave them
    // `pinOffset: 0`, which is the correct answer for anything not pinned, so
    // there is nothing to copy — and sharing identity with `all` is not merely
    // cheaper, it is what lets a consumer memoise on a column object at all.
    const middle = shown.filter((column) => !column.pinned)

    // Pinned ones do get a copy, because their offset accumulates from live
    // widths and writing it through would make `all`'s contents depend on
    // whether `visible` had been evaluated yet.
    let offset = 0
    const leftPinned = left.map((column) => {
      const resolved = { ...column, pinOffset: offset }
      offset += column.resolvedWidth ?? defaultWidth
      return resolved
    })

    // Right-pinned offsets accumulate from the far edge inwards, so they are
    // assigned back to front and the array put right way round afterwards.
    offset = 0
    const rightPinned: ResolvedColumn<TRow>[] = []
    for (let i = right.length - 1; i >= 0; i -= 1) {
      const column = right[i]!
      rightPinned.unshift({ ...column, pinOffset: offset })
      offset += column.resolvedWidth ?? defaultWidth
    }

    return [...leftPinned, ...middle, ...rightPinned]
  })

  /**
   * The band boundaries in the visible order.
   *
   * Depends on `visible` and the band defs and on nothing else, so it moves
   * when the layout does — a hide, a reorder, a resize, a pin, a fold — and
   * never when a row changes. Column layout not reaching the row pipeline is
   * the invariant; this is on the safe side of it by construction.
   */
  const bandEdges = computed(() => columnBandEdges(visible.value, groupDefs.value))

  function toggleVisibility(columnId: string, nextVisible?: boolean): void {
    const shouldShow = nextVisible ?? !isVisible(columnId)
    const hidden = new Set(layout.value.hidden)
    if (shouldShow) hidden.delete(columnId)
    else hidden.add(columnId)
    layout.value = { ...layout.value, hidden: [...hidden] }
  }

  function showAll(): void {
    layout.value = { ...layout.value, hidden: [] }
  }

  function setOrder(order: string[]): void {
    layout.value = { ...layout.value, order: [...order] }
  }

  function moveColumn(columnId: string, toIndex: number): void {
    const current = ordered.value.map((column) => column.id)
    const from = current.indexOf(columnId)
    if (from === -1) return
    const target = Math.min(Math.max(toIndex, 0), current.length - 1)
    if (from === target) return
    current.splice(from, 1)
    current.splice(target, 0, columnId)
    setOrder(current)
  }

  /**
   * The reorder a drop describes: "put this column immediately before/after
   * that one". Anchoring to a *column* rather than an index is what keeps
   * hidden columns in place — they hold their spot between their neighbours
   * instead of being shuffled by an index computed from the visible list.
   */
  function moveColumnTo(columnId: string, targetId: string, side: 'before' | 'after' = 'before'): void {
    if (columnId === targetId) return
    const ids = ordered.value.map((column) => column.id)
    const from = ids.indexOf(columnId)
    if (from === -1 || !ids.includes(targetId)) return

    ids.splice(from, 1)
    // Re-read the anchor after the removal: taking the column out shifts every
    // index behind it, so the position captured before the splice is stale.
    const anchor = ids.indexOf(targetId)
    ids.splice(side === 'after' ? anchor + 1 : anchor, 0, columnId)
    setOrder(ids)
  }

  function setWidth(columnId: string, width: number): void {
    const column = source.value.find((entry) => entry.id === columnId)
    if (!column) return
    layout.value = {
      ...layout.value,
      widths: { ...layout.value.widths, [columnId]: clampWidth(column, Math.round(width)) },
    }
  }

  function resetWidth(columnId: string): void {
    // Nothing stored means the declared width already governs; rewriting the
    // layout anyway would invalidate `all` for a change that isn't one.
    if (layout.value.widths[columnId] === undefined) return
    const widths = { ...layout.value.widths }
    delete widths[columnId]
    layout.value = { ...layout.value, widths }
  }

  function resetWidths(): void {
    layout.value = { ...layout.value, widths: {} }
  }

  function setAutoWidths(widths: Record<string, number>): void {
    let next: Record<string, number> | undefined
    for (const [columnId, width] of Object.entries(widths)) {
      // Zero is what an element with no layout reports — jsdom, a display:none
      // ancestor, a table that has not been painted yet. Discarding it is what
      // keeps an unmeasurable environment on the declared fallback instead of
      // collapsing every column to nothing.
      if (!(width > 0)) continue
      // Write-once per id. A second pass sees a different set of rows on
      // screen, and letting it overwrite would make a column's width a function
      // of how far you had scrolled.
      if (autoWidths.value[columnId] !== undefined) continue
      const column = source.value.find((entry) => entry.id === columnId)
      // A declared width and a flex column both outrank a measurement, so
      // storing one would be storing something nothing will read.
      if (!column || column.width !== undefined || column.flex) continue
      next ??= { ...autoWidths.value }
      next[columnId] = clampWidth(column, Math.round(width), defaultWidth)
    }
    // Only on a real change: a pass that measured nothing new must not
    // invalidate everything computed off the columns.
    if (next) autoWidths.value = next
  }

  function clearAutoWidths(): void {
    if (Object.keys(autoWidths.value).length === 0) return
    autoWidths.value = {}
  }

  function isGroupCollapsed(groupId: string): boolean {
    return layout.value.collapsedGroups.includes(groupId)
  }

  function toggleGroup(groupId: string, collapsed?: boolean): void {
    const shouldCollapse = collapsed ?? !isGroupCollapsed(groupId)
    const folded = new Set(layout.value.collapsedGroups)
    if (shouldCollapse) folded.add(groupId)
    else folded.delete(groupId)
    layout.value = { ...layout.value, collapsedGroups: [...folded] }
  }

  function expandAllGroups(): void {
    layout.value = { ...layout.value, collapsedGroups: [] }
  }

  /**
   * Folds every band that admits it.
   *
   * `useRowGrouping` needs an inversion flag for the same operation, because
   * row bands are discovered from the data and a band that has not been seen
   * yet still has to come back collapsed. Column bands are a finite declared
   * list, so this can simply name them all.
   */
  function collapseAllGroups(): void {
    const declared = new Map((groupDefs.value ?? []).map((group) => [group.id, group]))
    const ids = new Set<string>()
    for (const path of groupPaths.value.values()) {
      for (const group of path) {
        if (declared.get(group.id)?.collapsible === false) continue
        ids.add(group.id)
      }
    }
    layout.value = { ...layout.value, collapsedGroups: [...ids] }
  }

  /**
   * Records the pin side, including `false`. To go back to whatever the column
   * def declares, use `clearPinned` (or `resetLayout`) instead.
   */
  function setPinned(columnId: string, side: PinSide | false): void {
    layout.value = {
      ...layout.value,
      pinned: { ...layout.value.pinned, [columnId]: side },
    }
  }

  /** Drops the override so the column falls back to its declared `pinned`. */
  function clearPinned(columnId: string): void {
    if (!(columnId in layout.value.pinned)) return
    const pinned = { ...layout.value.pinned }
    delete pinned[columnId]
    layout.value = { ...layout.value, pinned }
  }

  function resetLayout(): void {
    layout.value = { hidden: [], order: [], widths: {}, pinned: {}, collapsedGroups: [] }
  }

  function clearStored(): void {
    if (storage) clearColumnLayout(storage)
  }

  return {
    all,
    visible,
    bandEdges,
    layout,
    isVisible,
    toggleVisibility,
    showAll,
    setOrder,
    moveColumn,
    moveColumnTo,
    setWidth,
    resetWidth,
    resetWidths,
    isGroupCollapsed,
    toggleGroup,
    expandAllGroups,
    collapseAllGroups,
    setPinned,
    clearPinned,
    resetLayout,
    setAutoWidths,
    clearAutoWidths,
    clearStored,
  }
}
