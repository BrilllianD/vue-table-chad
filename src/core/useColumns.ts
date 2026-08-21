import { computed, ref, watch, type ComputedRef, type MaybeRefOrGetter, type Ref } from 'vue'
import { toValue } from 'vue'
import type { ColumnDef, ColumnGroupDef, PinSide, ResolvedColumn, SortDirection } from './types'
import { columnGroupPaths } from './columnGroups'
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
  layout: Ref<ColumnLayoutState>

  isVisible: (columnId: string) => boolean
  toggleVisibility: (columnId: string, visible?: boolean) => void
  showAll: () => void

  setOrder: (order: string[]) => void
  moveColumn: (columnId: string, toIndex: number) => void
  /** Drops a column onto either edge of another one. */
  moveColumnTo: (columnId: string, targetId: string, side?: 'before' | 'after') => void

  setWidth: (columnId: string, width: number) => void
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
   * Drops the saved layout from storage without touching the current one. A
   * no-op when no `storage` was configured; `resetLayout()` overwrites the
   * saved entry with an empty layout, which is usually what you want instead.
   */
  clearStored: () => void
}

const DEFAULT_WIDTH = 160

function clampWidth<TRow>(column: ColumnDef<TRow>, width: number): number {
  const min = column.minWidth ?? 60
  const max = column.maxWidth ?? Number.POSITIVE_INFINITY
  return Math.min(Math.max(width, min), max)
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

  if (storage) {
    // Batched (default flush), so a resize drag writes once per tick rather
    // than once per pointermove.
    watch(layout, (value) => writeColumnLayout(value, storage), { deep: true })
  }

  const source = computed(() => toValue(columns))

  /** Declared order, overridden by any explicit ordering the user set. */
  const ordered = computed<ColumnDef<TRow>[]>(() => {
    const defs = source.value
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

  function resolvedWidthOf(column: ColumnDef<TRow>): number {
    return layout.value.widths[column.id] ?? column.width ?? defaultWidth
  }

  function pinnedOf(column: ColumnDef<TRow>): PinSide | false {
    const override = layout.value.pinned[column.id]
    // `false` is a deliberate override; only an absent entry defers to the def.
    if (override !== undefined) return override
    return column.pinned ?? false
  }

  const all = computed<ResolvedColumn<TRow>[]>(() =>
    ordered.value.map((column, index) => ({
      ...column,
      visible: isVisible(column.id),
      order: index,
      resolvedWidth: resolvedWidthOf(column),
      pinned: pinnedOf(column),
      pinOffset: 0,
      sortDirection: options.sortFor?.(column.id) ?? false,
      sortIndex: options.sortIndexFor?.(column.id) ?? 0,
      hasFilter: options.hasFilter?.(column.id) ?? false,
      collapsed: collapsedColumnIds.value.has(column.id),
    })),
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

  function resetWidths(): void {
    layout.value = { ...layout.value, widths: {} }
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
    layout,
    isVisible,
    toggleVisibility,
    showAll,
    setOrder,
    moveColumn,
    moveColumnTo,
    setWidth,
    resetWidths,
    isGroupCollapsed,
    toggleGroup,
    expandAllGroups,
    collapseAllGroups,
    setPinned,
    clearPinned,
    resetLayout,
    clearStored,
  }
}
