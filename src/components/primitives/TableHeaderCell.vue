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
import { paintBandEdge, type BandEdge } from '../../core/columnGroups'
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
     * Set while the pointer is somewhere in this column, so the header takes
     * the hover tint with the body cells under it. Independent of `cursor`: the
     * two highlights answer to different devices and a column can be in both.
     */
    columnHovered?: boolean
    /**
     * The band boundary falling to this cell's right. Defaults to the injected
     * one for this column, so a `<th>` under a `<TableRoot>` needs nothing
     * passed and a standalone one can still be told.
     */
    bandEdge?: BandEdge
    /**
     * Whether this column is one the rows are grouped by. Defaults to the
     * injected grouping, so a `<th>` under a `<TableRoot>` needs nothing passed.
     *
     * A grouped column's header is not a sort control: clicking it folds the
     * bands that column produced. Sorting stays on the columns underneath it.
     */
    grouped?: boolean
    /** Whether every band this column produced is folded shut. */
    groupsCollapsed?: boolean
  }>(),
  // Vue casts an absent boolean prop to `false`; the explicit `undefined`
  // default keeps "not passed" distinguishable from "passed as false" — which
  // for `grouped` would read as "not grouped" and shadow the context for good.
  { reorderable: undefined, grouped: undefined, groupsCollapsed: undefined },
)

const emit = defineEmits<{
  sort: [columnId: string, additive: boolean]
  toggleGroups: [columnId: string, collapsed: boolean]
}>()

const context = useTableContext()

const grouped = computed(
  () => props.grouped ?? context?.state.isGrouped(props.column.id) ?? false,
)

const groupsCollapsed = computed(
  () => props.groupsCollapsed ?? context?.grouping?.isColumnCollapsed(props.column.id) ?? false,
)

/**
 * What a click on the cell itself does. Grouped wins over sortable: the two
 * would otherwise both want the same gesture, and a column the rows are
 * grouped by is a fold control, not a sort one.
 */
const action = computed<'group' | 'sort' | undefined>(() => {
  if (grouped.value) return 'group'
  return props.column.sortable !== false ? 'sort' : undefined
})

const bandEdge = computed(
  () => props.bandEdge ?? context?.columns.bandEdges.value.get(props.column.id),
)

/** Pin offset plus the column's header background, as a custom property. */
const cellStyle = computed(() => {
  const style: Record<string, string> = {}
  if (props.column.pinned) {
    style[props.column.pinned === 'left' ? 'left' : 'right'] = `${props.column.pinOffset}px`
  }
  if (props.column.headerBackground) style['--vtc-column-bg'] = props.column.headerBackground
  // Only written when this cell is part of a multi-row header. A single-row
  // header emits no custom property at all, and the stylesheet's `0` fallback
  // keeps it sticking exactly where it always did.
  if (props.depth) style['--vtc-header-row'] = String(props.depth)
  paintBandEdge(style, bandEdge.value)
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

/**
 * Where the pointer went down, so a drag that ends over this cell does not also
 * read as a click on it. `dnd.dragging` is already false by the time `click`
 * fires, so the distance has to be remembered rather than asked for.
 */
let pressedAt: { x: number; y: number } | undefined

/** Past this many pixels the gesture was a drag, whatever it ended up doing. */
const CLICK_SLOP = 4

function onPointerDown(event: PointerEvent): void {
  pressedAt = { x: event.clientX, y: event.clientY }
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
 * Folds this column's bands, or opens them. Handed to the default slot as well,
 * so the control a caller renders inside the cell drives the same action rather
 * than reaching for the context a second time — the cell ignores clicks that
 * came from a control, so exactly one of the two runs.
 */
function fold(): void {
  const next = !groupsCollapsed.value
  emit('toggleGroups', props.column.id, next)
  context?.grouping?.toggleColumn(props.column.id, next)
}

/**
 * The whole cell acts, not just the control inside it: a header that shows a
 * pointer cursor has to do something when the padding around its label is
 * clicked.
 *
 * The controls it contains keep their own clicks — each of them bubbles up to
 * here, and acting on those too would sort twice per click, or sort while the
 * user was opening a filter.
 */
function onClick(event: MouseEvent): void {
  if (event.button !== 0 || action.value === undefined) return

  const moved = pressedAt
    ? Math.abs(event.clientX - pressedAt.x) > CLICK_SLOP ||
      Math.abs(event.clientY - pressedAt.y) > CLICK_SLOP
    : false
  pressedAt = undefined
  if (moved) return

  const target = event.target as HTMLElement | null
  // `.vt-filter` is the popover root rather than a control: its panel is full
  // of inputs and labels, and it is inside this cell.
  if (
    target?.closest(
      'button, a, input, select, textarea, label, [role="separator"], [role="button"], .vt-filter',
    )
  ) {
    return
  }

  if (action.value === 'group') {
    fold()
    return
  }

  // The same modifier rule as `SortTrigger`, so the two routes to a sort stay
  // one gesture.
  const additive = event.shiftKey || event.ctrlKey || event.metaKey
  emit('sort', props.column.id, additive)
  context?.state.toggleSort(props.column.id, additive)
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
  <!--
    `data-sortable` and `data-filterable` are capability, next to the state pair
    beside them: `data-sorted` says this column *is* sorted, `data-sortable` that
    it can be. The preset styles the cursor off the capability, because a header
    that acts on a click has to say so before the click.

    `data-filterable` reads `!== false` rather than a truthiness test — it
    defaults to on, and a column def says otherwise by saying so. `data-sortable`
    goes through `action` instead, because a grouped column is sortable by its
    definition and still does not sort here: its click folds its bands, and
    `data-grouped` is what says so.
  -->
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
    :data-sortable="action === 'sort' || undefined"
    :data-grouped="grouped || undefined"
    :data-groups-collapsed="(grouped && groupsCollapsed) || undefined"
    :data-filterable="column.filterable !== false || undefined"
    :data-reorderable="draggable || undefined"
    :data-dragging="dnd?.isDragged(column.id) || undefined"
    :data-drop="dnd?.dropSideFor(column.id) || undefined"
    :data-band-edge="bandEdge?.depth"
    :data-cursor="cursor"
    :data-column-hover="columnHovered || undefined"
    :aria-sort="
      column.sortDirection === 'asc'
        ? 'ascending'
        : column.sortDirection === 'desc'
          ? 'descending'
          : 'none'
    "
    @click="onClick"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerleave="onPointerLeave"
    @keydown="onKeydown"
  >
    <div class="vt-th-inner">
      <slot :column="column" :grouped="grouped" :groups-collapsed="groupsCollapsed" :fold="fold">
        {{ column.header ?? column.id }}
      </slot>
    </div>
    <slot name="resize" :column="column" />
  </th>
</template>
