import { describe, expect, it } from 'vitest'
import { effectScope, ref, shallowRef, watch } from 'vue'
import { OVERSCAN_ROWS, useVirtualRows } from '../src/core/useVirtualRows'

/**
 * The windowing arithmetic, with nothing mounted.
 *
 * `useVirtualRows` holds no element and reads no layout — the viewport height
 * is a number it is handed — so every case here is three numbers in and a range
 * out. That is the whole reason the composable takes the geometry rather than
 * measuring it: a test can state the viewport, and so can a caller whose
 * element has not been laid out yet.
 */

const ROW_HEIGHT = 40
const VIEWPORT = 400

/** Ten rows fit, plus the one straddling the bottom edge. */
const VISIBLE = Math.ceil(VIEWPORT / ROW_HEIGHT) + 1

function setup(count: number, options: Record<string, unknown> = {}) {
  const scope = effectScope()
  const items = shallowRef(Array.from({ length: count }, (_, i) => `row-${i}`))
  const virtual = scope.run(() =>
    useVirtualRows(items, {
      rowHeight: ROW_HEIGHT,
      viewportHeight: VIEWPORT,
      ...options,
    }),
  )!
  return { virtual, items, dispose: () => scope.stop() }
}

describe('useVirtualRows', () => {
  it('windows to the viewport plus overscan on both edges', () => {
    const { virtual, dispose } = setup(1000)

    virtual.setScrollOffset(ROW_HEIGHT * 100)

    expect(virtual.start.value).toBe(100 - OVERSCAN_ROWS)
    expect(virtual.end.value).toBe(100 - OVERSCAN_ROWS + VISIBLE + OVERSCAN_ROWS * 2)
    expect(virtual.items.value).toHaveLength(virtual.end.value - virtual.start.value)
    expect(virtual.items.value[0]).toBe(`row-${100 - OVERSCAN_ROWS}`)

    dispose()
  })

  it('renders everything when disabled, and hands back the same array reference', () => {
    const { virtual, items, dispose } = setup(1000, { enabled: false })

    virtual.setScrollOffset(ROW_HEIGHT * 100)

    expect(virtual.start.value).toBe(0)
    expect(virtual.end.value).toBe(1000)
    // The array itself, not a copy: a caller who turned windowing off is
    // rendering the list it already had, and a fresh identity per read would
    // make its `v-for` re-key on every unrelated change.
    expect(virtual.items.value).toBe(items.value)
    expect(virtual.spaceBefore.value).toBe(0)
    expect(virtual.spaceAfter.value).toBe(0)

    dispose()
  })

  it('renders everything when the viewport has not been measured yet', () => {
    // What an element reports before layout, and what every element reports
    // under happy-dom. A window of nothing would flash an empty table.
    const { virtual, dispose } = setup(500, { viewportHeight: 0 })

    expect(virtual.items.value).toHaveLength(500)
    expect(virtual.spaceBefore.value).toBe(0)

    dispose()
  })

  it('renders everything when the row height is zero', () => {
    const { virtual, dispose } = setup(500, { rowHeight: 0 })

    expect(virtual.items.value).toHaveLength(500)
    expect(virtual.totalSize.value).toBe(0)

    dispose()
  })

  it('the spacers plus the window always add up to the full height', () => {
    const { virtual, dispose } = setup(1000)

    for (const offset of [0, 37, ROW_HEIGHT * 12, ROW_HEIGHT * 999, ROW_HEIGHT * 5000]) {
      virtual.setScrollOffset(offset)
      const rendered = (virtual.end.value - virtual.start.value) * ROW_HEIGHT
      expect(virtual.spaceBefore.value + rendered + virtual.spaceAfter.value).toBe(
        virtual.totalSize.value,
      )
    }

    dispose()
  })

  it('a scroll inside one row leaves the window alone, and notifies nobody', () => {
    const { virtual, dispose } = setup(1000)
    virtual.setScrollOffset(ROW_HEIGHT * 20)

    let renders = 0
    const scope = effectScope()
    scope.run(() => watch(virtual.items, () => (renders += 1), { flush: 'sync' }))

    // Nine pixels short of the next row: the offset moves, the floored start
    // does not, and a computed returning the same value does not propagate.
    virtual.setScrollOffset(ROW_HEIGHT * 20 + ROW_HEIGHT - 1)
    expect(virtual.start.value).toBe(20 - OVERSCAN_ROWS)
    expect(renders).toBe(0)

    virtual.setScrollOffset(ROW_HEIGHT * 21)
    expect(virtual.start.value).toBe(21 - OVERSCAN_ROWS)
    expect(renders).toBe(1)

    scope.stop()
    dispose()
  })

  it('clamps the window at both ends of the list', () => {
    const { virtual, dispose } = setup(50)

    virtual.setScrollOffset(-500)
    expect(virtual.start.value).toBe(0)

    // Scrolled far past the end — which a browser will not do, but a caller
    // restoring a saved offset against a shorter list will.
    virtual.setScrollOffset(ROW_HEIGHT * 5000)
    expect(virtual.end.value).toBe(50)
    expect(virtual.start.value).toBeLessThan(50)
    expect(virtual.items.value.at(-1)).toBe('row-49')

    dispose()
  })

  it('an empty list windows to nothing rather than to a negative range', () => {
    const { virtual, dispose } = setup(0)

    virtual.setScrollOffset(ROW_HEIGHT * 10)

    expect(virtual.start.value).toBe(0)
    expect(virtual.end.value).toBe(0)
    expect(virtual.items.value).toEqual([])
    expect(virtual.totalSize.value).toBe(0)

    dispose()
  })

  it('a shorter list after a filter pulls the window back into range', () => {
    const { virtual, items, dispose } = setup(1000)
    virtual.setScrollOffset(ROW_HEIGHT * 900)
    expect(virtual.start.value).toBe(900 - OVERSCAN_ROWS)

    items.value = items.value.slice(0, 20)

    // The scroll offset is still 900 rows down — the browser corrects it a
    // frame later, and until it does the window must name rows that exist.
    expect(virtual.end.value).toBe(20)
    expect(virtual.start.value).toBeLessThan(20)
    expect(virtual.items.value.every((row) => row !== undefined)).toBe(true)

    dispose()
  })

  it('offsetFor and indexAt are inverses', () => {
    const { virtual, dispose } = setup(1000)

    for (const index of [0, 1, 17, 999]) {
      expect(virtual.indexAt(virtual.offsetFor(index))).toBe(index)
    }
    // Anywhere inside a row resolves to that row, not just its top edge.
    expect(virtual.indexAt(ROW_HEIGHT * 17 + ROW_HEIGHT - 1)).toBe(17)
    expect(virtual.indexAt(-100)).toBe(0)
    expect(virtual.indexAt(ROW_HEIGHT * 100_000)).toBe(999)

    dispose()
  })

  it('follows a viewport that grows after being measured', () => {
    const viewportHeight = ref(0)
    const { virtual, dispose } = setup(1000, { viewportHeight })

    expect(virtual.items.value).toHaveLength(1000)

    viewportHeight.value = VIEWPORT
    expect(virtual.items.value).toHaveLength(VISIBLE + OVERSCAN_ROWS * 2)

    dispose()
  })

  it('takes an overscan of its own', () => {
    const { virtual, dispose } = setup(1000, { overscan: 0 })

    virtual.setScrollOffset(ROW_HEIGHT * 100)

    expect(virtual.start.value).toBe(100)
    expect(virtual.end.value).toBe(100 + VISIBLE)

    dispose()
  })
})
