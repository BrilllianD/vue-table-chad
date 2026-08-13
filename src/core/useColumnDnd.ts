import { computed, onScopeDispose, ref, toValue, type ComputedRef, type MaybeRefOrGetter, type Ref } from 'vue'

/** Which edge of the hovered column the dragged one lands on. */
export type DropSide = 'before' | 'after'

export interface ColumnDropTarget {
  columnId: string
  side: DropSide
}

export interface UseColumnDndOptions {
  /** Column ids in display order. Drives keyboard moves; drags don't need it. */
  columnIds: MaybeRefOrGetter<string[]>
  /** Applies the reorder. This composable never mutates layout state itself. */
  move: (columnId: string, targetId: string, side: DropSide) => void
  canDrag?: (columnId: string) => boolean
  canDrop?: (columnId: string, targetId: string) => boolean
  /** Pixels the pointer must travel before a press counts as a drag. */
  threshold?: number
  onDragStart?: (columnId: string) => void
  onDrop?: (columnId: string, targetId: string, side: DropSide) => void
}

export interface UseColumnDnd {
  /** The column being dragged — null until the press clears the threshold. */
  activeId: Readonly<Ref<string | null>>
  target: Readonly<Ref<ColumnDropTarget | null>>
  /** Latest pointer position, for rendering a drag ghost. */
  pointer: Readonly<Ref<{ x: number; y: number }>>
  dragging: ComputedRef<boolean>

  canDrag: (columnId: string) => boolean
  isDragged: (columnId: string) => boolean
  /** The drop indicator side to paint on a column, or `false` for none. */
  dropSideFor: (columnId: string) => DropSide | false

  /** Arms a drag from a pointerdown. Does not begin one until the pointer moves. */
  start: (columnId: string, event: PointerEvent) => void
  /** Reports which column (and which half of it) the pointer is over. */
  over: (columnId: string, side: DropSide) => void
  /** Drops the target, optionally only if it is still `columnId`. */
  clearOver: (columnId?: string) => void
  drop: () => void
  cancel: () => void

  /** Keyboard equivalent: shift a column `delta` positions in display order. */
  moveBy: (columnId: string, delta: number) => void
}

/**
 * A press this short is a click, not a drag — without the slack, sorting by
 * clicking a header would reorder it by a pixel instead.
 */
const DEFAULT_THRESHOLD = 4

/**
 * Pointer-driven column reordering.
 *
 * Deliberately not the HTML5 drag-and-drop API: that one cannot render a
 * usable drag image for a table column, fires no events over the element you
 * started on, and is unusable on touch. Pointer events give one code path for
 * mouse, pen and touch.
 *
 * Hit testing lives in the header cells, which report `over()` from their own
 * bounding boxes — cheaper and more accurate than `elementFromPoint`, and it
 * keeps this composable testable without layout.
 */
export function useColumnDnd(options: UseColumnDndOptions): UseColumnDnd {
  const threshold = options.threshold ?? DEFAULT_THRESHOLD

  const activeId = ref<string | null>(null)
  const target = ref<ColumnDropTarget | null>(null)
  const pointer = ref({ x: 0, y: 0 })

  /** Set on pointerdown, promoted into `activeId` once the pointer travels. */
  let pending: { columnId: string; x: number; y: number; pointerId: number } | null = null
  let listening = false
  let previousCursor = ''
  let previousUserSelect = ''

  const dragging = computed(() => activeId.value !== null)

  function canDrag(columnId: string): boolean {
    return options.canDrag?.(columnId) ?? true
  }

  function canDrop(columnId: string, targetId: string): boolean {
    if (columnId === targetId) return false
    return options.canDrop?.(columnId, targetId) ?? true
  }

  function isDragged(columnId: string): boolean {
    return activeId.value === columnId
  }

  function dropSideFor(columnId: string): DropSide | false {
    const current = target.value
    if (!current || current.columnId !== columnId) return false
    return current.side
  }

  function start(columnId: string, event: PointerEvent): void {
    if (dragging.value || pending) return
    // Right/middle clicks open menus; they must never pick a column up.
    if (event.pointerType === 'mouse' && event.button !== 0) return
    if (!canDrag(columnId)) return

    // Touch pointers are implicitly captured by the pointerdown target, which
    // would stop every *other* header from ever seeing a pointermove. Releasing
    // restores normal dispatch so hit testing works the same on touch.
    const origin = (event.currentTarget ?? event.target) as Element | null
    if (origin && typeof origin.hasPointerCapture === 'function') {
      if (origin.hasPointerCapture(event.pointerId)) origin.releasePointerCapture(event.pointerId)
    }

    pending = { columnId, x: event.clientX, y: event.clientY, pointerId: event.pointerId }
    pointer.value = { x: event.clientX, y: event.clientY }
    listen()
  }

  function begin(): void {
    if (!pending) return
    activeId.value = pending.columnId
    lockDocument()
    options.onDragStart?.(pending.columnId)
  }

  function over(columnId: string, side: DropSide): void {
    const active = activeId.value
    if (!active) return
    if (!canDrop(active, columnId)) {
      target.value = null
      return
    }
    const current = target.value
    if (current && current.columnId === columnId && current.side === side) return
    target.value = { columnId, side }
  }

  function clearOver(columnId?: string): void {
    if (!target.value) return
    if (columnId !== undefined && target.value.columnId !== columnId) return
    target.value = null
  }

  function drop(): void {
    const active = activeId.value
    const landing = target.value
    // Reset first: `move` re-renders the header, and leaving stale drag state
    // in place while that happens paints indicators on the wrong columns.
    reset()
    if (!active || !landing) return
    if (!canDrop(active, landing.columnId)) return
    options.move(active, landing.columnId, landing.side)
    options.onDrop?.(active, landing.columnId, landing.side)
  }

  function cancel(): void {
    reset()
  }

  function reset(): void {
    const wasDragging = activeId.value !== null
    pending = null
    activeId.value = null
    target.value = null
    unlisten()
    if (!wasDragging) return
    unlockDocument()
    suppressNextClick()
  }

  function moveBy(columnId: string, delta: number): void {
    if (delta === 0 || !canDrag(columnId)) return
    const ids = toValue(options.columnIds)
    const index = ids.indexOf(columnId)
    if (index === -1) return
    const targetIndex = index + delta
    if (targetIndex < 0 || targetIndex >= ids.length) return
    const targetId = ids[targetIndex]!
    if (!canDrop(columnId, targetId)) return
    options.move(columnId, targetId, delta > 0 ? 'after' : 'before')
    options.onDrop?.(columnId, targetId, delta > 0 ? 'after' : 'before')
  }

  /* ---------------------------------------------------------- window events */

  function onPointerMove(event: PointerEvent): void {
    if (!pending || event.pointerId !== pending.pointerId) return
    pointer.value = { x: event.clientX, y: event.clientY }

    if (!dragging.value) {
      const dx = event.clientX - pending.x
      const dy = event.clientY - pending.y
      if (Math.hypot(dx, dy) < threshold) return
      begin()
    }

    // Keeps the browser from turning the drag into a text selection.
    if (event.cancelable) event.preventDefault()
  }

  function onPointerUp(event: PointerEvent): void {
    if (pending && event.pointerId !== pending.pointerId) return
    if (dragging.value) drop()
    else reset()
  }

  function onKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Escape' || !dragging.value) return
    event.preventDefault()
    cancel()
  }

  function listen(): void {
    if (listening || typeof window === 'undefined') return
    listening = true
    window.addEventListener('pointermove', onPointerMove, { passive: false })
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', cancel)
    window.addEventListener('keydown', onKeydown)
  }

  function unlisten(): void {
    if (!listening || typeof window === 'undefined') return
    listening = false
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', onPointerUp)
    window.removeEventListener('pointercancel', cancel)
    window.removeEventListener('keydown', onKeydown)
  }

  function lockDocument(): void {
    if (typeof document === 'undefined') return
    previousCursor = document.body.style.cursor
    previousUserSelect = document.body.style.userSelect
    document.body.style.cursor = 'grabbing'
    document.body.style.userSelect = 'none'
  }

  function unlockDocument(): void {
    if (typeof document === 'undefined') return
    document.body.style.cursor = previousCursor
    document.body.style.userSelect = previousUserSelect
  }

  /**
   * A drag that ends on a header would otherwise be followed by a `click`,
   * which the sort trigger under the pointer would happily act on. Swallow
   * exactly one — and drop the listener on the next tick, so a drag that ended
   * where no click follows cannot eat an unrelated one later.
   */
  function suppressNextClick(): void {
    if (typeof window === 'undefined') return
    const swallow = (event: MouseEvent): void => {
      event.stopPropagation()
      event.preventDefault()
    }
    window.addEventListener('click', swallow, { capture: true, once: true })
    window.setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 0)
  }

  onScopeDispose(() => {
    unlisten()
    if (activeId.value !== null) unlockDocument()
  })

  return {
    activeId,
    target,
    pointer,
    dragging,
    canDrag,
    isDragged,
    dropSideFor,
    start,
    over,
    clearOver,
    drop,
    cancel,
    moveBy,
  }
}
