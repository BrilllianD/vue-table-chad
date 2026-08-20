/**
 * Dismissal for the dropdown panels (`ColumnVisibilityMenu`, `RowGroupMenu`),
 * and the focus bookkeeping their ↑/↓ reorder buttons need.
 *
 * Internal to `components/primitives/` — not part of the public API.
 */
import { nextTick, onBeforeUnmount, watch, type Ref } from 'vue'

/**
 * Close `open` when the user leaves the panel for real.
 *
 * "For real" is the whole point. A `focusout` carrying a null `relatedTarget` is *not* evidence
 * that the user is done: the browser also sends one when the focused element is detached — which
 * Vue does to a keyed row every time the list reorders — and when a focused button becomes
 * `disabled`, which is what an ↑ button does on reaching the top. Treating those as "focus left"
 * closed the panel on the first press of ↑. So a null target is left to the outside-pointerdown
 * listener instead, the same split `ColumnFilterPopover` makes.
 */
export function useMenuDismiss(
  open: Ref<boolean>,
  contains: (node: Node) => boolean,
): (event: FocusEvent) => void {
  function onPointerDownOutside(event: Event): void {
    const target = event.target as Node | null
    if (target && contains(target)) return
    open.value = false
  }

  function bind(active: boolean): void {
    if (typeof document === 'undefined') return
    // Capture, so a handler that stops propagation cannot strand the panel open.
    const method = active ? 'addEventListener' : 'removeEventListener'
    document[method]('pointerdown', onPointerDownOutside, true)
  }

  // Only listen while the panel is up; a closed menu has nothing to dismiss.
  watch(open, bind)
  onBeforeUnmount(() => bind(false))

  return function onFocusOut(event: FocusEvent): void {
    const next = event.relatedTarget as Node | null
    if (!next || contains(next)) return
    open.value = false
  }
}

/**
 * Put focus back on the reorder button that was just pressed, so ↑ can be pressed again without
 * hunting for it — Vue moves the row by detaching and re-inserting it, and the browser drops focus
 * to `<body>` when it does.
 *
 * `delta` picks the fallback for the case where the move ran the column into an edge and disabled
 * the button under the cursor: the *other* arrow, which is the next sibling after ↑ and the
 * previous one before ↓. Direction matters because the arrows are not symmetrically surrounded —
 * ↓ is followed by the pin button in `ColumnVisibilityMenu` and by "stop grouping" in
 * `RowGroupMenu`.
 */
export async function refocusAfterMove(button: HTMLElement, delta: number): Promise<void> {
  await nextTick()

  const fallback = delta < 0 ? button.nextElementSibling : button.previousElementSibling
  const target = focusable(button) ? button : fallback

  if (target instanceof HTMLElement && focusable(target)) target.focus()
}

function focusable(element: Element): boolean {
  if (!(element instanceof HTMLElement) || !element.isConnected) return false
  return !(element instanceof HTMLButtonElement && element.disabled)
}
