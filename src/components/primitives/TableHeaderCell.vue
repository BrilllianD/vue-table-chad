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
import type { BandEdge } from '../../core/columnGroups'
import type { ResolvedColumn } from '../../core/types'

const props = withDefaults(
  defineProps<{
    column: ResolvedColumn<TRow>
    /** Forces drag-to-reorder off for this cell, whatever the column def says. */
    reorderable?: boolean
    /**
     * How many header rows this cell spans. A column under no band, in a
     * header two rows deep, spans both — otherwise the row beneath it is a
     * cell short and every column after it slides out of place.
     */
    rowspan?: number
    /** Which header row it sits in, 0-based, for the sticky offset. */
    depth?: number
    /**
     * Set when this column is the cell cursor's, so the header takes the same
     * tint as the column beneath it. Only ever `'column'`: the cursor lives in
     * the body and never enters the header, so a `<th>` is never the ring.
     */
    cursor?: 'column'
    /**
     * The band boundary falling to this cell's right. Defaults to the injected
     * one for this column, so a `<th>` under a `<TableRoot>` needs nothing
     * passed and a standalone one can still be told.
     */
    bandEdge?: BandEdge
  }>(),
  // Vue casts an absent boolean prop to `false`; the explicit `undefined`
  // default keeps "not passed" distinguishable from "passed as false".
  { reorderable: undefined },
)

const context = useTableContext()

const bandEdge = computed(
  () => props.bandEdge ?? context?.columns.bandEdges.value.get(props.column.id),
)

/** Pin offset plus the column's header background, as a custom property. */
const cellStyle = computed(() => {
  const style: Record<string, string> = {}
  if (props.column.pinned) {
    style[props.column.pinned === 'left' ? 'left' : 'right'] = `${props.column.pinOffset}px`
  }
  if (props.column.headerBackground) style['--vt-column-bg'] = props.column.headerBackground
  // Only written when this cell is part of a multi-row header. A single-row
  // header emits no custom property at all, and the stylesheet's `0` fallback
  // keeps it sticking exactly where it always did.
  if (props.depth) style['--vt-header-row'] = String(props.depth)
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
    :rowspan="rowspan !== undefined && rowspan > 1 ? rowspan : undefined"
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
    :data-band-edge="bandEdge?.depth"
    :data-cursor="cursor"
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
