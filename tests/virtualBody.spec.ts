import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h, nextTick, ref, shallowRef } from 'vue'
import VirtualBody from '../src/components/primitives/VirtualBody.vue'

/**
 * The `<tbody>` that renders a window.
 *
 * Every case passes `viewport-height` explicitly: happy-dom lays nothing out
 * and reports every height as 0, which is exactly the "not measured yet" state
 * `useVirtualRows` answers with "render everything". That the prop exists at
 * all is what makes this component testable here, and it is half of why it
 * exists — the other half being a caller who knows the geometry and would
 * rather not pay for a `ResizeObserver`.
 *
 * Scrolling is driven through a real container and a real `scroll` event
 * rather than through the exposed setter, because attaching to a container
 * that arrives *after* mount is the part most likely to break.
 */

const ROW_HEIGHT = 40
const VIEWPORT = 400

function makeItems(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `row-${i}`)
}

interface VirtualBodyApi {
  start: number
  end: number
  scrollToIndex: (index: number) => boolean
}

/**
 * What `defineExpose` put on the instance.
 *
 * Through `$.exposed` rather than off `vm`: Test Utils proxies the exposed
 * object onto `vm` for the wrapper it mounted, not for one it found. And
 * `findComponent` on a generic SFC widens to `WrapperLike`, which is the same
 * cast `tests/tableGrid.spec.ts` makes for the same reason.
 */
function api(wrapper: ReturnType<typeof mountBody>): VirtualBodyApi {
  const body = wrapper.findComponent(VirtualBody as never) as unknown as {
    vm: { $: { exposed: VirtualBodyApi } }
  }
  return body.vm.$.exposed
}

/** A host that renders the window as one `<tr>` per item, the way a caller does. */
function mountBody(props: Record<string, unknown> = {}) {
  const box = document.createElement('div')
  const scrollParent = ref<HTMLElement | null>(null)

  const Host = defineComponent({
    setup() {
      return () =>
        h('table', [
          h(
            VirtualBody as never,
            {
              items: makeItems(1000),
              rowHeight: ROW_HEIGHT,
              viewportHeight: VIEWPORT,
              scrollParent: scrollParent.value,
              ...props,
            },
            {
              default: ({ items }: { items: readonly string[] }) =>
                items.map((item) => h('tr', { 'data-row': item }, [h('td', item)])),
            },
          ),
        ])
    },
  })

  const wrapper = mount(Host, { attachTo: document.body })
  return Object.assign(wrapper, {
    box,
    attach: async () => {
      scrollParent.value = box
      await nextTick()
    },
    scrollTo: async (offset: number) => {
      box.scrollTop = offset
      box.dispatchEvent(new Event('scroll'))
      await nextTick()
    },
  })
}

function renderedRows(wrapper: { findAll: (s: string) => { attributes: (a: string) => string | undefined }[] }): string[] {
  return wrapper.findAll('tr[data-row]').map((row) => row.attributes('data-row')!)
}

function firstIndex(wrapper: ReturnType<typeof mountBody>): number {
  return Number(renderedRows(wrapper)[0]!.replace('row-', ''))
}

describe('VirtualBody', () => {
  it('renders standalone, with no table context above it', () => {
    const wrapper = mountBody()

    expect(wrapper.find('tbody.vt-tbody').exists()).toBe(true)
    expect(renderedRows(wrapper).length).toBeGreaterThan(0)

    wrapper.unmount()
  })

  it('windows to the viewport it was given', () => {
    const wrapper = mountBody()

    // Ten rows fit in 400px, the eleventh straddles the bottom edge, and
    // overscan adds a few on each side. What matters is that 1000 do not.
    expect(renderedRows(wrapper).length).toBeLessThan(25)
    expect(renderedRows(wrapper)[0]).toBe('row-0')

    wrapper.unmount()
  })

  it('renders every item when disabled, and no spacers', () => {
    const wrapper = mountBody({ enabled: false })

    expect(renderedRows(wrapper)).toHaveLength(1000)
    expect(wrapper.findAll('.vt-virtual-spacer')).toHaveLength(0)

    wrapper.unmount()
  })

  it('a list shorter than the viewport renders no spacers at all', () => {
    const wrapper = mountBody({ items: makeItems(4) })

    expect(renderedRows(wrapper)).toHaveLength(4)
    expect(wrapper.findAll('.vt-virtual-spacer')).toHaveLength(0)

    wrapper.unmount()
  })

  it('re-attaches when the scroll container arrives after mount', async () => {
    const wrapper = mountBody()
    expect(renderedRows(wrapper)[0]).toBe('row-0')

    // A template ref is null on the first render, which is when this component
    // mounts — attaching once during setup would never attach at all.
    await wrapper.attach()
    await wrapper.scrollTo(ROW_HEIGHT * 50)

    expect(firstIndex(wrapper)).toBeGreaterThan(40)

    wrapper.unmount()
  })

  it('the spacers carry the height of the rows they stand in for', async () => {
    const wrapper = mountBody()
    await wrapper.attach()
    await wrapper.scrollTo(ROW_HEIGHT * 100)

    const spacers = wrapper.findAll('.vt-virtual-spacer')
    expect(spacers).toHaveLength(2)
    expect(spacers[0]!.attributes('style')).toContain(`height: ${firstIndex(wrapper) * ROW_HEIGHT}px`)

    const rendered = renderedRows(wrapper).length
    const after = (1000 - firstIndex(wrapper) - rendered) * ROW_HEIGHT
    expect(spacers[1]!.attributes('style')).toContain(`height: ${after}px`)

    wrapper.unmount()
  })

  it('hides the spacer rows from assistive technology', async () => {
    const wrapper = mountBody()
    await wrapper.attach()
    await wrapper.scrollTo(ROW_HEIGHT * 100)

    for (const spacer of wrapper.findAll('.vt-virtual-spacer')) {
      expect(spacer.attributes('aria-hidden')).toBe('true')
      // Never `.vt-tr`: the stripe, hover and row-height rules all key on it.
      expect(spacer.classes()).not.toContain('vt-tr')
    }

    wrapper.unmount()
  })

  it('a scroll inside one row renders nothing new', async () => {
    let renders = 0
    const box = document.createElement('div')
    const Host = defineComponent({
      setup() {
        return () =>
          h('table', [
            h(
              VirtualBody as never,
              {
                items: makeItems(1000),
                rowHeight: ROW_HEIGHT,
                viewportHeight: VIEWPORT,
                scrollParent: box,
              },
              {
                default: ({ items }: { items: readonly string[] }) => {
                  renders += 1
                  return items.map((item) => h('tr', { 'data-row': item }, [h('td', item)]))
                },
              },
            ),
          ])
      },
    })
    const wrapper = mount(Host, { attachTo: document.body })

    const scroll = async (offset: number) => {
      box.scrollTop = offset
      box.dispatchEvent(new Event('scroll'))
      await nextTick()
    }

    await scroll(ROW_HEIGHT * 20)
    const before = renders

    await scroll(ROW_HEIGHT * 20 + ROW_HEIGHT - 1)
    expect(renders).toBe(before)

    await scroll(ROW_HEIGHT * 21)
    expect(renders).toBeGreaterThan(before)

    wrapper.unmount()
  })

  it('scrolls an evicted item back into the window, and says whether it had to', async () => {
    const wrapper = mountBody()
    await wrapper.attach()

    expect(api(wrapper).scrollToIndex(500)).toBe(true)
    await nextTick()
    expect(renderedRows(wrapper)).toContain('row-500')

    // Already rendered: no scroll, and the `false` is what stops a caller
    // re-asking for focus forever.
    expect(api(wrapper).scrollToIndex(500)).toBe(false)

    wrapper.unmount()
  })

  it('scrolls back up to an item above the window', async () => {
    const wrapper = mountBody()
    await wrapper.attach()
    await wrapper.scrollTo(ROW_HEIGHT * 500)

    expect(api(wrapper).scrollToIndex(3)).toBe(true)
    await nextTick()
    expect(renderedRows(wrapper)).toContain('row-3')

    wrapper.unmount()
  })

  it('has nothing to scroll when windowing is off', async () => {
    const wrapper = mountBody({ enabled: false })
    await wrapper.attach()

    expect(api(wrapper).scrollToIndex(500)).toBe(false)

    wrapper.unmount()
  })

  /**
   * The other half of anchoring. `useVirtualRows` corrects the offset it holds,
   * which fixes *which rows render*; the element that owns the scrollbar has to
   * be told too, or the box stays where it was and the next scroll event undoes
   * the correction.
   */
  it('writes the re-anchored offset back to the scroll container', async () => {
    const box = document.createElement('div')
    const items = shallowRef(makeItems(1000))
    const scrollParent = ref<HTMLElement | null>(null)

    const Host = defineComponent({
      setup() {
        return () =>
          h('table', [
            h(
              VirtualBody as never,
              {
                items: items.value,
                rowHeight: ROW_HEIGHT,
                viewportHeight: VIEWPORT,
                scrollParent: scrollParent.value,
                itemKey: (item: string) => item,
              },
              {
                default: ({ items: window }: { items: readonly string[] }) =>
                  window.map((item) => h('tr', { 'data-row': item }, [h('td', item)])),
              },
            ),
          ])
      },
    })

    const wrapper = mount(Host, { attachTo: document.body })
    scrollParent.value = box
    await nextTick()

    box.scrollTop = ROW_HEIGHT * 500
    box.dispatchEvent(new Event('scroll'))
    await nextTick()
    expect(renderedRows(wrapper)[0]).toBe(`row-${500 - 4}`)

    // Fifty rows removed from above the window — a band folding shut.
    items.value = items.value.filter((_, index) => index >= 100 || index % 2 === 0)
    await nextTick()
    await nextTick()

    expect(box.scrollTop).toBe(ROW_HEIGHT * 450)
    expect(renderedRows(wrapper)[0]).toBe(`row-${500 - 4}`)

    wrapper.unmount()
  })

  /**
   * Measured heights, through the DOM the way the prop actually works.
   *
   * happy-dom lays nothing out and reports every `offsetHeight` as 0 — which is
   * the "not a measurement" case the composable ignores — so the property is
   * stubbed for the duration. Stubbing it is what makes the test about the
   * wiring rather than about happy-dom.
   */
  describe('measure', () => {
    const TALL = 60

    function withStubbedHeights<T>(run: () => T): T {
      const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight')
      Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
        configurable: true,
        get(this: HTMLElement) {
          return this.dataset.row === 'row-0' ? TALL : ROW_HEIGHT
        },
      })
      try {
        return run()
      } finally {
        if (original) Object.defineProperty(HTMLElement.prototype, 'offsetHeight', original)
        else delete (HTMLElement.prototype as unknown as Record<string, unknown>).offsetHeight
      }
    }

    /** The spacer standing in for everything above the window, in pixels. */
    function spaceBefore(wrapper: ReturnType<typeof mountBody>): number {
      const style = wrapper.find('.vt-virtual-spacer').attributes('style') ?? ''
      return Number(/height:\s*(\d+(?:\.\d+)?)px/.exec(style)?.[1] ?? 0)
    }

    /*
     * One array, held across renders. `mountBody` builds its default inline, so
     * every render hands the composable a *different* list — and measurements
     * describe indices in a list, so a new one drops them. A caller whose rows
     * come from a computed, as the preset's do, has this for free.
     */
    const stable = makeItems(1000)

    it('follows a row that is taller than rowHeight', async () => {
      await withStubbedHeights(async () => {
        const wrapper = mountBody({ measure: true, items: stable })
        await wrapper.attach()
        await wrapper.scrollTo(ROW_HEIGHT * 500)

        // 495 rows of 40 plus the 20 extra pixels `row-0` measured. The
        // unmeasured answer is 19840, which is what the assertion below pins.
        expect(spaceBefore(wrapper)).toBe(495 * ROW_HEIGHT + (TALL - ROW_HEIGHT))
        wrapper.unmount()
      })
    })

    it('trusts rowHeight when it is off, which is the default', async () => {
      await withStubbedHeights(async () => {
        const wrapper = mountBody({ items: stable })
        await wrapper.attach()
        await wrapper.scrollTo(ROW_HEIGHT * 500)

        expect(spaceBefore(wrapper)).toBe(496 * ROW_HEIGHT)
        wrapper.unmount()
      })
    })
  })

  /**
   * The cue an infinite source runs on. `VirtualBody` knows how far down the
   * list the window is and nothing about where more rows would come from, so it
   * reports rather than acts.
   */
  describe('end-reached', () => {
    /*
     * The same cast `api()` above makes, for the same reason: `findComponent`
     * on a generic SFC widens to `WrapperLike`, which has no `emitted`.
     */
    function emissions(wrapper: ReturnType<typeof mountBody>): number {
      const body = wrapper.findComponent(VirtualBody as never) as unknown as {
        emitted: (name: string) => unknown[] | undefined
      }
      return body.emitted('endReached')?.length ?? 0
    }

    it('fires when the window reaches the end of the list, and not before', async () => {
      const wrapper = mountBody()
      await wrapper.attach()
      expect(emissions(wrapper)).toBe(0)

      await wrapper.scrollTo(ROW_HEIGHT * 500)
      expect(emissions(wrapper)).toBe(0)

      await wrapper.scrollTo(ROW_HEIGHT * 1000)
      expect(emissions(wrapper)).toBe(1)

      // A scroll that does not move the window says nothing further: `end` is a
      // computed over floored integers, so the watcher never runs.
      await wrapper.scrollTo(ROW_HEIGHT * 1000 + 3)
      expect(emissions(wrapper)).toBe(1)

      wrapper.unmount()
    })

    it('fires immediately for a list that already ends inside the viewport', () => {
      const wrapper = mountBody({ items: makeItems(4) })

      expect(emissions(wrapper)).toBe(1)
      wrapper.unmount()
    })

    it('fires early by endThreshold rows', async () => {
      const wrapper = mountBody({ endThreshold: 300 })
      await wrapper.attach()

      // The window ends around row 715, which is inside the last 300 — and that
      // is what a slow server wants: the request goes out while there is still
      // list left to scroll through.
      await wrapper.scrollTo(ROW_HEIGHT * 700)
      expect(emissions(wrapper)).toBe(1)
      wrapper.unmount()
    })

    it('says nothing at all when windowing is off', async () => {
      const wrapper = mountBody({ enabled: false })
      await wrapper.attach()

      expect(emissions(wrapper)).toBe(0)
      wrapper.unmount()
    })
  })
})
