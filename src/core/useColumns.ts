import { computed, ref, type ComputedRef, type MaybeRefOrGetter, type Ref } from 'vue'
import { toValue } from 'vue'
import type { ColumnDef, PinSide, ResolvedColumn, SortDirection } from './types'

export interface ColumnLayoutState {
  hidden: string[]
  order: string[]
  widths: Record<string, number>
  pinned: Record<string, PinSide>
}

export interface UseColumnsOptions {
  /** Reports the current sort direction for a column, if any. */
  sortFor?: (columnId: string) => SortDirection | false
  sortIndexFor?: (columnId: string) => number
  hasFilter?: (columnId: string) => boolean
  defaultWidth?: number
  initialLayout?: Partial<ColumnLayoutState>
}

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

  setWidth: (columnId: string, width: number) => void
  resetWidths: () => void

  setPinned: (columnId: string, side: PinSide | false) => void
  resetLayout: () => void
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

  const layout = ref<ColumnLayoutState>({
    hidden: options.initialLayout?.hidden ? [...options.initialLayout.hidden] : [],
    order: options.initialLayout?.order ? [...options.initialLayout.order] : [],
    widths: { ...(options.initialLayout?.widths ?? {}) },
    pinned: { ...(options.initialLayout?.pinned ?? {}) },
  })

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

  function resolvedWidthOf(column: ColumnDef<TRow>): number {
    return layout.value.widths[column.id] ?? column.width ?? defaultWidth
  }

  function pinnedOf(column: ColumnDef<TRow>): PinSide | false {
    const override = layout.value.pinned[column.id]
    if (override) return override
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
    })),
  )

  /**
   * Visible columns with pinned ones hoisted to the edges and their sticky
   * offsets accumulated from live widths — resizing a pinned column has to
   * shift everything pinned after it, so this cannot be precomputed config.
   */
  const visible = computed<ResolvedColumn<TRow>[]>(() => {
    // Copy rather than mutate: these objects also belong to `all`, and writing
    // pinOffset through them would make `all`'s contents depend on whether
    // `visible` had been evaluated yet.
    const shown = all.value.filter((column) => column.visible).map((column) => ({ ...column }))

    const left = shown.filter((column) => column.pinned === 'left')
    const right = shown.filter((column) => column.pinned === 'right')
    const middle = shown.filter((column) => !column.pinned)

    let offset = 0
    for (const column of left) {
      column.pinOffset = offset
      offset += column.resolvedWidth ?? defaultWidth
    }

    // Right-pinned offsets accumulate from the far edge inwards.
    offset = 0
    for (let i = right.length - 1; i >= 0; i -= 1) {
      const column = right[i]!
      column.pinOffset = offset
      offset += column.resolvedWidth ?? defaultWidth
    }

    return [...left, ...middle, ...right]
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

  function setPinned(columnId: string, side: PinSide | false): void {
    const pinned = { ...layout.value.pinned }
    if (side === false) delete pinned[columnId]
    else pinned[columnId] = side
    layout.value = { ...layout.value, pinned }
  }

  function resetLayout(): void {
    layout.value = { hidden: [], order: [], widths: {}, pinned: {} }
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
    setWidth,
    resetWidths,
    setPinned,
    resetLayout,
  }
}
