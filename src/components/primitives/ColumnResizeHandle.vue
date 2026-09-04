<script setup lang="ts">
/**
 * Pointer and keyboard column resizing, exposed as a `separator` role so it
 * is reachable without a mouse.
 *
 * Uses pointer capture so the drag keeps tracking even when the cursor leaves
 * the handle — without it, a fast drag drops the column mid-resize.
 */
import { ref } from 'vue'
import { useTableContext, useTableLabels } from '../../core/context'

const props = defineProps<{
  columnId: string
  /**
   * The column's current width, when the caller knows it. Left off — which is
   * what a column taking the leftover space has to do — the drag starts from
   * the header cell's measured width instead.
   */
  width?: number
  minWidth?: number
}>()

const emit = defineEmits<{ resize: [columnId: string, width: number] }>()

const context = useTableContext()
const labels = useTableLabels()
const dragging = ref(false)

let startX = 0
let startWidth = 0

/**
 * Where a gesture starts from: the declared width, or the width on screen.
 *
 * A flex column has no width of its own, so there is nothing to hand down and a
 * constant would make the first drag jump. The handle lives inside the `<th>`
 * it resizes, so the fallback is one rect read on one element, on a gesture
 * that is about to read the pointer anyway.
 */
function widthAt(target: EventTarget | null): number {
  if (typeof props.width === 'number') return props.width
  const cell = (target as HTMLElement | null)?.closest('th')
  return cell?.getBoundingClientRect().width ?? 0
}

function apply(width: number): void {
  const next = Math.max(width, props.minWidth ?? 60)
  emit('resize', props.columnId, next)
  context?.columns.setWidth(props.columnId, next)
}

function onPointerDown(event: PointerEvent): void {
  event.preventDefault()
  event.stopPropagation()
  dragging.value = true
  startX = event.clientX
  startWidth = widthAt(event.currentTarget)
  const target = event.currentTarget as HTMLElement
  target.setPointerCapture(event.pointerId)
}

function onPointerMove(event: PointerEvent): void {
  if (!dragging.value) return
  apply(startWidth + (event.clientX - startX))
}

function onPointerUp(event: PointerEvent): void {
  if (!dragging.value) return
  dragging.value = false
  ;(event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId)
}

/**
 * Double-click puts the column back to the width it declared — or to the
 * default when it declared none.
 *
 * Clearing the stored width rather than writing one: a number written here
 * would be a number the column never asked for, and it would leave the column
 * with no way back to its own. The emit is the second half of it — a caller
 * mirroring widths into a store of its own hears about a drag and has to hear
 * about this the same way, or the two quietly disagree.
 */
function onDoubleClick(): void {
  if (!context) return
  context.columns.resetWidth(props.columnId)
  const restored = context.columns.all.value.find((column) => column.id === props.columnId)
  if (restored?.resolvedWidth !== undefined) emit('resize', props.columnId, restored.resolvedWidth)
}

/** Keyboard resizing, so this is not mouse-only. */
function onKeydown(event: KeyboardEvent): void {
  const step = event.shiftKey ? 40 : 10
  if (event.key === 'ArrowLeft') {
    event.preventDefault()
    apply(widthAt(event.currentTarget) - step)
  } else if (event.key === 'ArrowRight') {
    event.preventDefault()
    apply(widthAt(event.currentTarget) + step)
  }
}
</script>

<template>
  <span
    class="vt-resize"
    role="separator"
    tabindex="0"
    aria-orientation="vertical"
    :aria-label="labels.resizeColumn(columnId)"
    :data-dragging="dragging || undefined"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerUp"
    @keydown="onKeydown"
    @dblclick.stop="onDoubleClick"
  />
</template>
