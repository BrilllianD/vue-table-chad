import {
  computed,
  shallowRef,
  toValue,
  type ComputedRef,
  type MaybeRefOrGetter,
  type ShallowRef,
} from 'vue'

/**
 * Rows kept rendered beyond each edge of the viewport.
 *
 * Four rather than zero because a scroll of a single pixel exposes the row
 * about to come into view, and a window that ends exactly at the viewport edge
 * paints blank space for the one frame between the scroll event and the patch.
 * Four rather than forty because every one of them is a rendered row, and the
 * whole point of the window is that there are few of them.
 */
export const OVERSCAN_ROWS = 4

/** rowHeight, viewportHeight, and the two knobs that turn windowing off. */
export interface UseVirtualRowsOptions {
  /**
   * The height of one item, in CSS pixels. Uniform: every item is assumed to
   * be exactly this tall, which is what makes the window two integer divisions
   * rather than a measured layout.
   */
  rowHeight: MaybeRefOrGetter<number>
  /**
   * The height of the scrolling viewport, in CSS pixels.
   *
   * `0` — which is what an element reports before it has been laid out, and
   * what every element reports under happy-dom — means "not measured yet" and
   * renders everything. See the note on the return type.
   */
  viewportHeight: MaybeRefOrGetter<number>
  /** Items rendered beyond each edge. Defaults to `OVERSCAN_ROWS`. */
  overscan?: MaybeRefOrGetter<number | undefined>
  /** Off renders every item, by the reference it was handed. Defaults to on. */
  enabled?: MaybeRefOrGetter<boolean | undefined>
}

/** The window, the space standing in for what is outside it, and the scroll offset. */
export interface UseVirtualRows<TItem> {
  /** Index of the first rendered item, inclusive. */
  start: ComputedRef<number>
  /** One past the last rendered item. */
  end: ComputedRef<number>
  /** The window itself — the array a `v-for` iterates. */
  items: ComputedRef<readonly TItem[]>
  /** Pixels of empty space standing in for the items above the window. */
  spaceBefore: ComputedRef<number>
  /** Pixels of empty space standing in for the items below it. */
  spaceAfter: ComputedRef<number>
  /** The height the list would have with every item rendered. */
  totalSize: ComputedRef<number>
  /** How far the container is scrolled. Written through `setScrollOffset`. */
  scrollOffset: Readonly<ShallowRef<number>>
  /** Report a new scroll position — one call per scroll event. */
  setScrollOffset: (offset: number) => void
  /** Where item `index` begins, in pixels from the top of the list. */
  offsetFor: (index: number) => number
  /** Which item covers `offset`. The inverse of `offsetFor`. */
  indexAt: (offset: number) => number
}

/**
 * A windowed range over a list of equal-height items — what to render, and how
 * much empty space stands in for the rest.
 *
 * Pure arithmetic over three numbers: how tall an item is, how tall the
 * viewport is, and how far it has been scrolled. It holds no element, reads no
 * layout and knows nothing about tables — a list, a grid or a `<tbody>` are all
 * the same problem to it, the way `usePagination` is page arithmetic for any
 * paginated list rather than for this one.
 *
 * **`start` and `end` are floored integers, and that is the performance story.**
 * A scroll event that moves less than one row writes the offset, recomputes two
 * divisions, arrives at the same pair of integers — and a computed returning the
 * same value does not propagate, so nothing downstream re-renders. That is the
 * same mechanism the pipeline's field-level query dependencies rest on, and it
 * is why there is no debounce here and must not be one: debouncing would trade
 * a free non-update for a late update.
 *
 * ```ts
 * const virtual = useVirtualRows(displayRows, {
 *   rowHeight: 38,
 *   viewportHeight: () => box.value?.clientHeight ?? 0,
 * })
 * box.value.addEventListener('scroll', () => virtual.setScrollOffset(box.value.scrollTop))
 * ```
 */
export function useVirtualRows<TItem>(
  items: MaybeRefOrGetter<readonly TItem[]>,
  options: UseVirtualRowsOptions,
): UseVirtualRows<TItem> {
  const all = computed<readonly TItem[]>(() => toValue(items) ?? [])
  const rowHeight = computed(() => Math.max(0, toValue(options.rowHeight) || 0))
  const viewportHeight = computed(() => Math.max(0, toValue(options.viewportHeight) || 0))
  const overscan = computed(() => Math.max(0, toValue(options.overscan) ?? OVERSCAN_ROWS))

  /*
   * Three ways to mean "render everything", and they are one condition on
   * purpose.
   *
   * `enabled: false` is the caller's own switch, and the two zeroes are the
   * states where a window would be a wrong answer rather than a cheap one: an
   * unmeasured viewport windows to nothing and the table flashes empty on its
   * first paint, and a zero row height divides by zero and windows to
   * everything anyway. Answering "everything" for all three keeps the
   * unmeasured first frame *correct* rather than merely non-crashing, and the
   * measured second frame narrows it.
   */
  const windowed = computed(
    () => (toValue(options.enabled) ?? true) && rowHeight.value > 0 && viewportHeight.value > 0,
  )

  const scrollOffset = shallowRef(0)

  const start = computed(() => {
    if (!windowed.value) return 0
    const first = Math.floor(scrollOffset.value / rowHeight.value) - overscan.value
    // Clamped against the list rather than against zero alone: a filter that
    // shortens the list under a deep scroll would otherwise leave `start` past
    // the end and render an empty window until the browser corrects the scroll.
    return Math.min(Math.max(0, first), Math.max(0, all.value.length - 1))
  })

  const end = computed(() => {
    if (!windowed.value) return all.value.length
    // `+ 1` because a viewport is almost never a whole number of rows: the row
    // straddling the bottom edge is half visible and must still be rendered.
    const visible = Math.ceil(viewportHeight.value / rowHeight.value) + 1
    return Math.min(all.value.length, start.value + visible + overscan.value * 2)
  })

  /*
   * The unwindowed case returns the source array itself, not a copy. A caller
   * that has switched windowing off is a caller rendering the list it already
   * had, and handing it a fresh array per read would make every downstream
   * `v-for` see a new identity on every unrelated change.
   */
  const windowItems = computed<readonly TItem[]>(() =>
    windowed.value ? all.value.slice(start.value, end.value) : all.value,
  )

  const totalSize = computed(() => all.value.length * rowHeight.value)
  const spaceBefore = computed(() => (windowed.value ? start.value * rowHeight.value : 0))
  const spaceAfter = computed(() =>
    windowed.value ? Math.max(0, (all.value.length - end.value) * rowHeight.value) : 0,
  )

  /*
   * Functions rather than arithmetic the caller could do itself, and
   * `spaceBefore`/`spaceAfter` as opaque pixel totals rather than `start *
   * rowHeight`. Variable row heights turn both into a prefix-sum lookup and a
   * binary search; expose the multiplication instead and every caller doing it
   * by hand becomes a place that has to change.
   */
  function offsetFor(index: number): number {
    return Math.max(0, Math.min(index, all.value.length)) * rowHeight.value
  }

  function indexAt(offset: number): number {
    if (rowHeight.value <= 0) return 0
    const index = Math.floor(Math.max(0, offset) / rowHeight.value)
    return Math.min(index, Math.max(0, all.value.length - 1))
  }

  return {
    start,
    end,
    items: windowItems,
    spaceBefore,
    spaceAfter,
    totalSize,
    scrollOffset,
    setScrollOffset: (offset: number) => {
      scrollOffset.value = Math.max(0, offset)
    },
    offsetFor,
    indexAt,
  }
}
