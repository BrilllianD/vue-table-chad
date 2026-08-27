<script setup lang="ts" generic="TItem">
/**
 * A `<tbody>` that renders only the rows the viewport can show, with empty
 * space standing in for the rest.
 *
 * It owns the `<tbody>` element and the two spacer rows, and yields the window
 * through its default slot — **the caller writes the `v-for`**. That is
 * deliberate: a `v-for` this component owned would put every row inside one
 * slot function, which is exactly the shape `v-memo` cannot help (one cache
 * slot shared across every iteration, the thing P1-8 verified with a probe).
 * Yielding the window costs nothing today and leaves that door open.
 *
 * Given `enabled: false` it renders every item it was handed and no spacers at
 * all, so a caller has one code path rather than a virtual fork — and the
 * non-virtual DOM is unchanged by construction rather than by inspection.
 *
 * It never calls `useTableContext`. Rows, height and viewport all arrive as
 * props, so it works with no `TableRoot` above it, and windowing a list that
 * is not this library's table is a supported use rather than an accident.
 */
import { computed, onMounted, onScopeDispose, onUpdated, ref, watch } from 'vue'
import { useVirtualRows } from '../../core/useVirtualRows'

/**
 * The viewport height assumed until the container has been measured.
 *
 * A first render happens before any element can be measured, and
 * `useVirtualRows` answers "not measured yet" with "render everything" — right
 * for correctness, wrong for a 100k table, which would build every row once
 * before the observer fires. Guessing high costs a slower first paint; guessing
 * low shows a visible fill-in on the next frame. 640 is roughly the 70vh the
 * preset's scroll box defaults to on a laptop.
 */
const ASSUMED_VIEWPORT_HEIGHT = 640

const props = withDefaults(
  defineProps<{
    /** Everything there is to render, windowed or not. */
    items: readonly TItem[]
    /** The height of one rendered row, in CSS pixels. Uniform. */
    rowHeight: number
    /**
     * The element that scrolls. `null` until the caller's template ref lands,
     * which is why this is watched rather than read once.
     */
    scrollParent?: HTMLElement | null
    /**
     * Overrides the measured viewport height. The injection point for tests —
     * happy-dom reports every height as 0 — and for a caller who knows the
     * geometry and would rather not pay for an observer.
     */
    viewportHeight?: number
    /** Rows kept beyond each edge. Defaults to `OVERSCAN_ROWS`. */
    overscan?: number
    /** Off renders every item and no spacers. */
    enabled?: boolean
    /**
     * Identity for an item, which keeps the scroll offset pointing at the same
     * item when the list changes under it. See `UseVirtualRowsOptions.itemKey`
     * — the `v-for` key the caller already writes is usually the right one.
     */
    itemKey?: (item: TItem, index: number) => unknown
    /**
     * Measure each rendered row and report its real height, so the spacers and
     * the window follow rows that are not the declared height — a group header
     * laying out taller than a data row being the case it exists for.
     *
     * Off by default, and deliberately: it is one forced layout per update, on
     * about thirty rows. `rowHeight` alone costs none, and its error is bounded
     * by the window rather than accumulating.
     */
    measure?: boolean
    /**
     * How close to the end of the list the window has to come for
     * `end-reached`, in items. `0` means the last item is rendered; a larger
     * number fires earlier, which is what a slow request wants.
     */
    endThreshold?: number
    /** How many cells one spacer row spans. */
    colspan?: number
  }>(),
  {
    scrollParent: null,
    viewportHeight: undefined,
    overscan: undefined,
    enabled: true,
    measure: false,
    endThreshold: 0,
    colspan: 1,
    itemKey: undefined,
  },
)

const emit = defineEmits<{
  /**
   * The window has reached the end of the list — an infinite source's cue to
   * load the next page.
   *
   * Reported rather than acted on: this component knows how far down the list
   * the window is and nothing whatever about where more rows would come from.
   * It fires when the window *moves* to the end rather than on every scroll
   * event, so a handler can be `source.loadMore` with nothing around it.
   */
  endReached: []
}>()

const measured = ref(ASSUMED_VIEWPORT_HEIGHT)

const virtual = useVirtualRows<TItem>(
  () => props.items,
  {
    rowHeight: () => props.rowHeight,
    viewportHeight: () => props.viewportHeight ?? measured.value,
    overscan: () => props.overscan,
    enabled: () => props.enabled,
    // Forwarded through a lambda rather than by reference, so a caller passing
    // a different function later is honoured. An item with no key is not an
    // anchor, which is what a caller passing none at all means.
    itemKey: (item, index) => props.itemKey?.(item, index),
  },
)

/*
 * One passive scroll listener and one ResizeObserver, both re-attached when the
 * container changes.
 *
 * Passive because this handler never calls `preventDefault` and a non-passive
 * scroll listener blocks the compositor from scrolling until it returns — the
 * one thing that would make a virtual list feel worse than the paginated one it
 * replaces.
 */
let detach: (() => void) | undefined

function onScroll(event: Event): void {
  virtual.setScrollOffset((event.currentTarget as HTMLElement).scrollTop)
}

watch(
  () => props.scrollParent,
  (box) => {
    detach?.()
    detach = undefined
    if (!box) return

    box.addEventListener('scroll', onScroll, { passive: true })
    virtual.setScrollOffset(box.scrollTop)
    measured.value = box.clientHeight || ASSUMED_VIEWPORT_HEIGHT

    // Guarded rather than assumed: happy-dom provides a ResizeObserver that
    // never fires, and a caller may be rendering somewhere that has none at
    // all. `viewportHeight` is the way out for both, so a missing observer
    // degrades to the assumed height rather than to a broken table.
    const observer =
      typeof ResizeObserver === 'undefined'
        ? undefined
        : new ResizeObserver(() => {
            measured.value = box.clientHeight || ASSUMED_VIEWPORT_HEIGHT
          })
    observer?.observe(box)

    detach = () => {
      box.removeEventListener('scroll', onScroll)
      observer?.disconnect()
    }
  },
  { immediate: true },
)

onScopeDispose(() => detach?.())

/*
 * The corrected offset, written back to the element that owns the scrollbar.
 *
 * `useVirtualRows` re-anchors by moving `scrollOffset`, which is enough to fix
 * *which rows render* — but the box would still be scrolled where it was, so
 * the two would disagree and the next scroll event would undo the correction.
 * Assigning `scrollTop` fires a scroll event that reports the number just
 * written, so this settles rather than loops.
 */
watch(virtual.scrollOffset, (offset) => {
  const box = props.scrollParent
  if (!box || props.enabled === false) return
  if (Math.abs(box.scrollTop - offset) < 1) return
  box.scrollTop = offset
})

/*
 * The end of the list, announced once per arrival rather than once per scroll.
 *
 * `end` is a computed over floored integers, so a scroll that does not move the
 * window does not re-run this at all — the same mechanism that makes scrolling
 * free makes this cheap. The guard is against the *list* growing: an appended
 * page leaves the window where it was and must not read as a second arrival.
 */
watch(
  () => [virtual.end.value, props.items.length] as const,
  ([end, count]) => {
    if (props.enabled === false || count === 0) return
    if (end >= count - Math.max(0, props.endThreshold)) emit('endReached')
  },
  { immediate: true },
)

const tbody = ref<HTMLElement | null>(null)

/**
 * What the rows this `<tbody>` just rendered actually measured.
 *
 * `offsetHeight` rather than `getBoundingClientRect`, because it is what a row
 * *occupies* — the fractional rect of a row inside a table with collapsed
 * borders is not the number the spacers need to agree with.
 *
 * The count guard is what keeps it honest through a caller's own extra rows: a
 * slot may render a message row instead of the window (the preset's "nothing
 * matched" is one), and measuring that as item `start` would report a row that
 * is not there. When the two disagree, nothing is measured and the declared
 * height stands.
 */
function measureRendered(): void {
  const element = tbody.value
  if (!props.measure || props.enabled === false || !element) return

  const rows: HTMLElement[] = []
  for (const child of element.children) {
    if (!child.classList.contains('vt-virtual-spacer')) rows.push(child as HTMLElement)
  }
  if (rows.length !== virtual.items.value.length) return

  const first = virtual.start.value
  rows.forEach((row, offset) => virtual.measureItem(first + offset, row.offsetHeight))
}

onMounted(measureRendered)
// After the patch, which is the only moment the rendered rows and the window
// they came from are the same thing.
onUpdated(measureRendered)

const spaceBefore = computed(() => virtual.spaceBefore.value)
const spaceAfter = computed(() => virtual.spaceAfter.value)

/**
 * Scroll the container until item `index` is one of the rendered ones, and say
 * whether that took a scroll.
 *
 * For callers that address items the window has evicted — a cell cursor being
 * the reason this exists. Getting the item *rendered* is all it does; where
 * exactly it lands is then the browser's own scroll-into-view, which knows
 * about sticky headers and pinned bands through `scroll-margin` and
 * `scroll-padding` and would only be fought by a second opinion here.
 *
 * The boolean is the caller's guard against a loop: re-ask for focus when it
 * is `true`, and stop when it is `false`.
 */
function scrollToIndex(index: number): boolean {
  const box = props.scrollParent
  if (!box || props.enabled === false) return false
  if (index >= virtual.start.value && index < virtual.end.value) return false

  const viewport = props.viewportHeight ?? measured.value
  const top = virtual.offsetFor(index)
  // Above the window, scroll to its top edge; below it, bring its *bottom*
  // edge to the bottom of the viewport — scrolling to the top there would jump
  // a whole screen for a one-row move.
  const next =
    index < virtual.start.value ? top : Math.max(0, top - viewport + props.rowHeight)

  box.scrollTop = next
  // Written through as well as set: a programmatic scroll fires its event on a
  // later frame, and the caller is about to ask which rows are rendered *now*.
  virtual.setScrollOffset(next)
  return true
}

defineSlots<{
  /** The window, and where it sits in the whole list. */
  default: (props: { items: readonly TItem[]; start: number; end: number }) => unknown
}>()

defineExpose({
  start: virtual.start,
  end: virtual.end,
  offsetFor: virtual.offsetFor,
  indexAt: virtual.indexAt,
  setScrollOffset: virtual.setScrollOffset,
  scrollToIndex,
})
</script>

<template>
  <tbody ref="tbody" class="vt-tbody">
    <!--
      A spacer row rather than padding on the `<tbody>` or a transform:
      `padding` does not apply to a `table-row-group` box at all, and a
      transform would make this element the containing block for its positioned
      descendants — which is every `position: sticky` pinned cell inside it.

      Its own class, and neither `.vt-tr` nor `.vt-td`: those carry the row
      height, a border and the hover and stripe layers, all of which would fight
      the one thing this row is for. Everything it needs is inline geometry, the
      way `TableCell` places a pin.

      Hidden from assistive technology, because it is not a row. That the
      remaining rows still lie about how many there are is P2-5's `aria-rowcount`.
    -->
    <tr
      v-if="spaceBefore > 0"
      class="vt-virtual-spacer"
      aria-hidden="true"
      :style="{ height: `${spaceBefore}px` }"
    >
      <td :colspan="colspan" :style="{ height: `${spaceBefore}px`, padding: '0', border: '0' }" />
    </tr>

    <slot :items="virtual.items.value" :start="virtual.start.value" :end="virtual.end.value" />

    <tr
      v-if="spaceAfter > 0"
      class="vt-virtual-spacer"
      aria-hidden="true"
      :style="{ height: `${spaceAfter}px` }"
    >
      <td :colspan="colspan" :style="{ height: `${spaceAfter}px`, padding: '0', border: '0' }" />
    </tr>
  </tbody>
</template>
