<script setup lang="ts">
/**
 * Pointer and keyboard column resizing, exposed as a `separator` role so it
 * is reachable without a mouse.
 *
 * Uses pointer capture so the drag keeps tracking even when the cursor leaves
 * the handle — without it, a fast drag drops the column mid-resize.
 */
import { ref } from 'vue'
import { useTableContext } from '../../core/context'

const props = defineProps<{
  columnId: string
  width: number
  minWidth?: number
}>()

const emit = defineEmits<{ resize: [columnId: string, width: number] }>()

const context = useTableContext()
const dragging = ref(false)

let startX = 0
let startWidth = 0

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
  startWidth = props.width
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

/** Keyboard resizing, so this is not mouse-only. */
function onKeydown(event: KeyboardEvent): void {
  const step = event.shiftKey ? 40 : 10
  if (event.key === 'ArrowLeft') {
    event.preventDefault()
    apply(props.width - step)
  } else if (event.key === 'ArrowRight') {
    event.preventDefault()
    apply(props.width + step)
  }
}
</script>

<template>
  <span
    class="vt-resize"
    role="separator"
    tabindex="0"
    aria-orientation="vertical"
    :aria-label="`Resize column ${columnId}`"
    :data-dragging="dragging || undefined"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerUp"
    @keydown="onKeydown"
    @dblclick.stop="context?.columns.setWidth(columnId, 160)"
  />
</template>
