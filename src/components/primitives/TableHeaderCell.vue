<script setup lang="ts" generic="TRow extends Record<string, unknown>">
/**
 * One `<th>`. Carries sort/pin/filter state as data-attributes and leaves all
 * interactive bits (sort trigger, filter popover, resize handle) to slots.
 *
 * It is also the drag source *and* the drop zone for column reordering: the
 * whole cell is grabbable, and it hit-tests drops against its own bounding box
 * rather than making the table search the DOM for what is under the pointer.
 */
import { computed } from 'vue'
import { useTableContext } from '../../core/context'
import type { ResolvedColumn } from '../../core/types'

const props = withDefaults(
  defineProps<{
    column: ResolvedColumn<TRow>
    /** Forces drag-to-reorder off for this cell, whatever the column def says. */
    reorderable?: boolean
  }>(),
  // Vue casts an absent boolean prop to `false`; the explicit `undefined`
  // default keeps "not passed" distinguishable from "passed as false".
  { reorderable: undefined },
)

const context = useTableContext()

/** Pin offset plus the column's header background, as a custom property. */
const cellStyle = computed(() => {
  const style: Record<string, string> = {}
  if (props.column.pinned) {
    style[props.column.pinned === 'left' ? 'left' : 'right'] = `${props.column.pinOffset}px`
  }
  if (props.column.headerBackground) style['--vt-column-bg'] = props.column.headerBackground
  return Object.keys(style).length > 0 ? style : undefined
})

const dnd = computed(() => context?.dnd)

const draggable = computed(
  () => props.reorderable !== false && (dnd.value?.canDrag(props.column.id) ?? false),
)

/** Which half of this cell the pointer is in — the edge the drop lands on. */
function sideOf(event: PointerEvent): 'before' | 'after' {
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  return event.clientX < rect.left + rect.width / 2 ? 'before' : 'after'
}

function onPointerDown(event: PointerEvent): void {
  if (!draggable.value) return
  // No preventDefault: the sort button and filter trigger still need their
  // click. A drag only actually starts once the pointer clears the threshold.
  dnd.value?.start(props.column.id, event)
}

function onPointerMove(event: PointerEvent): void {
  const drag = dnd.value
  if (!drag?.dragging.value) return
  drag.over(props.column.id, sideOf(event))
}

function onPointerLeave(): void {
  // Only clears if *this* cell is still the target — the next cell's
  // pointermove may already have claimed it.
  dnd.value?.clearOver(props.column.id)
}

/**
 * Keyboard parity for the drag, since a pointer-only reorder is unreachable
 * for anyone not using one. Alt keeps it clear of caret and scroll bindings.
 */
function onKeydown(event: KeyboardEvent): void {
  if (!draggable.value || !event.altKey) return
  const delta = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0
  if (delta === 0) return
  event.preventDefault()
  dnd.value?.moveBy(props.column.id, delta)
}
</script>

<template>
  <th
    class="vt-th"
    scope="col"
    :style="cellStyle"
    :data-column="column.id"
    :data-align="column.align ?? 'left'"
    :data-pinned="column.pinned || undefined"
    :data-column-bg="column.headerBackground ? '' : undefined"
    :data-sorted="column.sortDirection || undefined"
    :data-filtered="column.hasFilter || undefined"
    :data-reorderable="draggable || undefined"
    :data-dragging="dnd?.isDragged(column.id) || undefined"
    :data-drop="dnd?.dropSideFor(column.id) || undefined"
    :aria-sort="
      column.sortDirection === 'asc'
        ? 'ascending'
        : column.sortDirection === 'desc'
          ? 'descending'
          : 'none'
    "
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerleave="onPointerLeave"
    @keydown="onKeydown"
  >
    <div class="vt-th-inner">
      <slot :column="column">{{ column.header ?? column.id }}</slot>
    </div>
    <slot name="resize" :column="column" />
  </th>
</template>
