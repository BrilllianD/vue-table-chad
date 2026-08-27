import { computed, toValue, type ComputedRef, type MaybeRefOrGetter } from 'vue'


/** siblingCount around the current page, and an onChange callback. */
export interface UsePaginationOptions {
  /**
   * How many numbered links to show around the current page. Defaults to 1.
   *
   * The getter may return `undefined` — that is "no opinion, use the default",
   * which is what the `?? 1` below has always done. The type says so, so a
   * caller forwarding an optional of its own does not have to re-state the
   * default just to satisfy it.
   */
  siblingCount?: MaybeRefOrGetter<number | undefined>
  onChange?: (page: number) => void
}

/** A page number or an ellipsis, ready to render. */
export type PageItem = number | 'ellipsis'

/** Current page, bounds, the item list, and the navigation calls. */
export interface UsePagination {
  page: ComputedRef<number>
  pageCount: ComputedRef<number>
  /** 1-based index of the first row on this page (0 when empty). */
  firstRow: ComputedRef<number>
  lastRow: ComputedRef<number>
  canPrev: ComputedRef<boolean>
  canNext: ComputedRef<boolean>
  /** Page numbers with `'ellipsis'` gaps, ready to render as buttons. */
  items: ComputedRef<PageItem[]>
  go: (page: number) => void
  prev: () => void
  next: () => void
  first: () => void
  last: () => void
}

function range(start: number, end: number): number[] {
  return Array.from({ length: Math.max(0, end - start + 1) }, (_, i) => start + i)
}

/**
 * Pure page arithmetic — no data, no fetching. Usable standalone for any
 * paginated list, not just this table.
 */
export function usePagination(
  page: MaybeRefOrGetter<number>,
  pageSize: MaybeRefOrGetter<number>,
  total: MaybeRefOrGetter<number>,
  options: UsePaginationOptions = {},
): UsePagination {
  const siblingCount = computed(() => toValue(options.siblingCount) ?? 1)

  const size = computed(() => Math.max(1, toValue(pageSize) || 1))
  const totalCount = computed(() => Math.max(0, toValue(total) || 0))
  const pageCount = computed(() => Math.max(1, Math.ceil(totalCount.value / size.value)))

  // Clamped, so a stale page index from a wider result set cannot render blank.
  const current = computed(() => Math.min(Math.max(1, toValue(page) || 1), pageCount.value))

  const firstRow = computed(() =>
    totalCount.value === 0 ? 0 : (current.value - 1) * size.value + 1,
  )
  const lastRow = computed(() => Math.min(current.value * size.value, totalCount.value))

  const items = computed<PageItem[]>(() => {
    const last = pageCount.value
    const siblings = siblingCount.value
    // 2 edges + 2 ellipses + current + siblings on both sides
    const maxVisible = siblings * 2 + 5
    if (last <= maxVisible) return range(1, last)

    const left = Math.max(current.value - siblings, 1)
    const right = Math.min(current.value + siblings, last)
    const showLeftEllipsis = left > 2
    const showRightEllipsis = right < last - 1

    if (!showLeftEllipsis && showRightEllipsis) {
      return [...range(1, siblings * 2 + 3), 'ellipsis', last]
    }
    if (showLeftEllipsis && !showRightEllipsis) {
      return [1, 'ellipsis', ...range(last - (siblings * 2 + 2), last)]
    }
    return [1, 'ellipsis', ...range(left, right), 'ellipsis', last]
  })

  function go(target: number): void {
    const next = Math.min(Math.max(1, Math.floor(target)), pageCount.value)
    if (next !== current.value) options.onChange?.(next)
  }

  return {
    page: current,
    pageCount,
    firstRow,
    lastRow,
    canPrev: computed(() => current.value > 1),
    canNext: computed(() => current.value < pageCount.value),
    items,
    go,
    prev: () => go(current.value - 1),
    next: () => go(current.value + 1),
    first: () => go(1),
    last: () => go(pageCount.value),
  }
}
