/**
 * Anchors a fixed-position panel to the trigger it belongs to, for the two
 * panels that leave the table to escape a scroll container's `overflow`.
 *
 * Internal to `components/primitives/` — not part of the public API.
 *
 * All of it is viewport arithmetic plus the two things that invalidate it: the
 * panel changing height after it opens (facets arrive, a search narrows a
 * list, a portion of options lands), and anything scrolling or resizing
 * underneath it. Both are easy to leave out and neither fails visibly until a
 * panel is opened low on a page, which is why this is one copy rather than one
 * per panel.
 */
import {
  computed,
  onBeforeUnmount,
  ref,
  toValue,
  watch,
  type ComputedRef,
  type MaybeRefOrGetter,
  type Ref,
} from 'vue'

const GAP = 4
const MARGIN = 8

/** The trigger, the panel, and how to line the second up against the first. */
export interface PopoverPositionOptions {
  /** The trigger's element. The panel is anchored to its box. */
  root: Ref<HTMLElement | null>
  /** The panel itself, once it exists. Measured for the flip decision. */
  panel: Ref<HTMLElement | null>
  open: Ref<boolean>
  /**
   * Whether to position at all. `false` for a panel rendered inline, which
   * sits in the flow and must not be given a `top`/`left` of its own.
   */
  enabled: MaybeRefOrGetter<boolean>
  /** Assumed width until the panel has been rendered and can be measured. */
  width: number
  /** `end` right-aligns the panel with the trigger, `start` left-aligns it. */
  align?: 'start' | 'end'
}

/** A `style` to bind, and the recomputation for anything this cannot observe. */
export interface PopoverPosition {
  /** `undefined` while disabled, so an inline panel binds nothing. */
  style: ComputedRef<{ top: string; left: string } | undefined>
  /** Reposition now — after the panel's content changed shape by some other route. */
  update: () => void
}

export function usePopoverPosition(options: PopoverPositionOptions): PopoverPosition {
  const align = options.align ?? 'end'
  const position = ref<{ top: number; left: number }>({ top: 0, left: 0 })

  /**
   * Under the trigger, aligned to whichever of its edges was asked for, and
   * clamped into the viewport so an edge column's panel stays fully on screen.
   * Flips above the trigger when there is no room below.
   */
  function update(): void {
    if (!toValue(options.enabled) || !options.root.value) return
    const rect = options.root.value.getBoundingClientRect()
    const width = options.panel.value?.offsetWidth || options.width
    const height = options.panel.value?.offsetHeight ?? 0
    const viewportWidth = window.innerWidth || 0
    const viewportHeight = window.innerHeight || 0

    const maxLeft = Math.max(MARGIN, viewportWidth - width - MARGIN)
    const anchor = align === 'end' ? rect.right - width : rect.left
    const left = Math.min(Math.max(anchor, MARGIN), maxLeft)

    const below = rect.bottom + GAP
    const flip = height > 0 && below + height > viewportHeight - MARGIN && rect.top - height > MARGIN
    const top = flip ? rect.top - height - GAP : below
    // Clamp as a last resort, for when the panel fits neither above nor below.
    const maxTop = Math.max(MARGIN, viewportHeight - height - MARGIN)
    position.value = { top: Math.min(Math.max(top, MARGIN), maxTop), left }
  }

  /**
   * The panel changes height after it opens. Position it again whenever that
   * happens, or a tall panel opened low on the page stays hanging off the
   * bottom of the viewport.
   */
  let resizeObserver: ResizeObserver | undefined

  watch(options.panel, (element) => {
    resizeObserver?.disconnect()
    resizeObserver = undefined
    if (!element || typeof ResizeObserver === 'undefined') return
    resizeObserver = new ResizeObserver(() => update())
    resizeObserver.observe(element)
  })

  function bindWindowListeners(active: boolean): void {
    const method = active ? 'addEventListener' : 'removeEventListener'
    // Capture, so scrolling any ancestor container repositions the panel too.
    window[method]('scroll', update, true)
    window[method]('resize', update)
  }

  watch(options.open, bindWindowListeners)

  onBeforeUnmount(() => {
    bindWindowListeners(false)
    resizeObserver?.disconnect()
  })

  return {
    style: computed(() =>
      toValue(options.enabled)
        ? { top: `${position.value.top}px`, left: `${position.value.left}px` }
        : undefined,
    ),
    update,
  }
}
