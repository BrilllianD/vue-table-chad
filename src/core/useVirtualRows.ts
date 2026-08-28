import {
  computed,
  shallowRef,
  toValue,
  watch,
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
export interface UseVirtualRowsOptions<TItem = unknown> {
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
  /**
   * Identity for an item, which turns the scroll offset into a *place in the
   * list* rather than a number of pixels.
   *
   * Supply it and the offset is corrected whenever the list changes under the
   * window: a band collapsing 600k pixels above the viewport otherwise leaves
   * the same `scrollTop` pointing at a row a thousand rows further down. An
   * item whose key is `undefined` is not an anchor, so a caller can key some
   * items and not others; with no `itemKey` at all nothing is watched and the
   * composable stays the pure arithmetic it is without one.
   *
   * A plain function rather than a `MaybeRefOrGetter`, because `toValue` cannot
   * tell a getter from the function it would be returning.
   */
  itemKey?: (item: TItem, index: number) => unknown
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
  /**
   * Report what item `index` actually measured, in CSS pixels.
   *
   * The escape hatch from uniform heights: a group header that lays out a pixel
   * taller than a data row makes every offset below it wrong by a pixel, and
   * the error grows with the number of them above the window. Report the real
   * height and every offset below it moves.
   *
   * A height equal to `rowHeight` is not recorded, so a list where every row is
   * the height it was declared to be keeps the pure arithmetic and allocates
   * nothing. Measurements are dropped when the list changes — they were taken
   * against items that are no longer at those indices.
   */
  measureItem: (index: number, height: number) => void
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
  options: UseVirtualRowsOptions<TItem>,
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

  /*
   * Measured heights, and the two things that keep them from costing anything
   * until a caller reports one.
   *
   * The map is mutated in place and announced through `revision`, because a
   * fresh `Map` per `measureItem` would be O(measured) per row per frame — the
   * "derive per row, not per comparison" argument, one level up again.
   * `measuredFor` is the list the measurements describe: indices mean nothing
   * once the list changes under them, and comparing the array identity is how
   * that is noticed without a watcher.
   */
  const heights = new Map<number, number>()
  const revision = shallowRef(0)
  let measuredFor: readonly TItem[] | undefined

  /**
   * Running offsets, one per item plus a final total — or `undefined` while
   * every item is the height it was declared to be, which is the common case
   * and the fast one.
   */
  const offsets = computed<number[] | undefined>(() => {
    revision.value
    if (heights.size === 0 || measuredFor !== all.value) return undefined
    const count = all.value.length
    const base = rowHeight.value
    const running = new Array<number>(count + 1)
    running[0] = 0
    for (let index = 0; index < count; index += 1) {
      running[index + 1] = running[index]! + (heights.get(index) ?? base)
    }
    return running
  })

  /*
   * Functions rather than arithmetic a caller could do itself, and
   * `spaceBefore`/`spaceAfter` as opaque pixel totals rather than `start *
   * rowHeight`. This is why: with a measurement reported, both become a
   * prefix-sum lookup and a binary search, and every caller that had done the
   * multiplication by hand would have been a place that had to change.
   */
  function offsetFor(index: number): number {
    const running = offsets.value
    const clamped = Math.max(0, Math.min(index, all.value.length))
    return running ? running[clamped]! : clamped * rowHeight.value
  }

  function indexAt(offset: number): number {
    const last = Math.max(0, all.value.length - 1)
    const target = Math.max(0, offset)
    const running = offsets.value
    if (!running) {
      if (rowHeight.value <= 0) return 0
      return Math.min(Math.floor(target / rowHeight.value), last)
    }
    // The item whose span covers `target`: the last one whose offset is at or
    // below it. A binary search rather than a walk, because this runs per
    // scroll event and the list is as long as the dataset.
    let low = 0
    let high = last
    while (low < high) {
      const middle = (low + high + 1) >> 1
      if (running[middle]! <= target) low = middle
      else high = middle - 1
    }
    return low
  }

  function measureItem(index: number, height: number): void {
    if (!(height > 0) || index < 0) return
    if (measuredFor !== all.value) {
      heights.clear()
      measuredFor = all.value
    }
    // Against the declared height when nothing is stored, so a row that is
    // exactly as tall as it was declared to be records nothing and the whole
    // measured path stays switched off.
    const known = heights.get(index) ?? rowHeight.value
    // Half a pixel: `offsetHeight` rounds and `getBoundingClientRect` does not,
    // so a caller reading either must not be able to make this thrash.
    if (Math.abs(known - height) < 0.5) return
    heights.set(index, height)
    revision.value += 1
  }

  const start = computed(() => {
    if (!windowed.value) return 0
    const first = indexAt(scrollOffset.value) - overscan.value
    // Clamped against the list rather than against zero alone: a filter that
    // shortens the list under a deep scroll would otherwise leave `start` past
    // the end and render an empty window until the browser corrects the scroll.
    return Math.min(Math.max(0, first), Math.max(0, all.value.length - 1))
  })

  const end = computed(() => {
    if (!windowed.value) return all.value.length
    /*
     * How many items a viewport covers, counted from the **top of the first
     * visible item** rather than from the scroll offset itself.
     *
     * That is load-bearing, not tidiness. Counted from the offset, a scroll of
     * one pixel inside a row can move the item straddling the bottom edge, so
     * the window would grow and shrink by one on a scroll that must propagate
     * nothing at all — the invariant `tests/invalidation.spec.ts` holds this to.
     * Measured from an item's own top it only changes when the window does.
     *
     * The `- 1` asks which item covers the viewport's last pixel and the `+ 2`
     * adds that item and one spare, which is exactly `ceil(viewport /
     * rowHeight) + 1` while every item is the declared height.
     */
    const first = indexAt(scrollOffset.value)
    const visible = indexAt(offsetFor(first) + viewportHeight.value - 1) - first + 2
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

  const totalSize = computed(() => offsetFor(all.value.length))
  const spaceBefore = computed(() => (windowed.value ? offsetFor(start.value) : 0))
  const spaceAfter = computed(() =>
    windowed.value ? Math.max(0, totalSize.value - offsetFor(end.value)) : 0,
  )

  /**
   * Keeps the offset pointing at the item it pointed at before the list changed.
   *
   * The pixel the user scrolled to means "row 4,300", and only while the rows
   * above it stay where they are. Fold a band shut and every row below it moves
   * up by the height the band was holding — the browser leaves `scrollTop` alone,
   * so the viewport silently lands somewhere else in the data.
   *
   * Two outcomes, and the second is the one that matters. If the row that was at
   * the top of the viewport still exists, it goes back to the top of the
   * viewport, down to the pixel it was scrolled past by. If it does not — it was
   * *inside* the band that just closed — the search walks back up the old list
   * for the nearest item that does still exist, which is that band's own header
   * row, and puts that at the top instead. Landing on the band you just folded is
   * the right answer to "where did I go".
   *
   * Nothing happens when the anchor cannot be found at all (every candidate
   * gone, as after a filter that matches none of them) or when the list was
   * already at the top, where the offset means the same thing either way.
   */
  function reanchor(next: readonly TItem[], previous: readonly TItem[]): void {
    const keyOf = options.itemKey
    if (!keyOf || !windowed.value || next.length === 0 || previous.length === 0) return

    const height = rowHeight.value
    const firstVisible = Math.min(Math.floor(scrollOffset.value / height), previous.length - 1)
    if (firstVisible <= 0) return
    // How far the row at the top of the viewport is scrolled past, which is
    // preserved exactly when that row survives.
    const withinRow = scrollOffset.value - firstVisible * height
    if (keyOf(previous[firstVisible]!, firstVisible) === undefined) return

    const positions = new Map<unknown, number>()
    next.forEach((item, index) => {
      const key = keyOf(item, index)
      // First wins: a duplicated key is a caller's bug, and the earlier item is
      // the one the old offset was nearer to.
      if (key !== undefined && !positions.has(key)) positions.set(key, index)
    })

    for (let index = firstVisible; index >= 0; index -= 1) {
      const found = positions.get(keyOf(previous[index]!, index))
      if (found === undefined) continue
      // The row that was at the top, back where it was — or, when that row is
      // gone, the surviving item above it brought to the top of the viewport.
      const offset = index === firstVisible ? found * height + withinRow : found * height
      scrollOffset.value = Math.max(0, offset)
      return
    }
  }

  /*
   * Only when a caller asked for it. Without an `itemKey` this composable
   * installs no effect at all: `all` stays lazy, and a caller that never reads
   * the window never walks the list.
   */
  if (options.itemKey) {
    watch(all, (next, previous) => {
      if (previous) reanchor(next, previous)
    })
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
    measureItem,
  }
}
