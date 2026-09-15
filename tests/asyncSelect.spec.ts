import { describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import AsyncSelect from '../src/components/primitives/AsyncSelect.vue'
import { useAsyncOptions } from '../src/core/useAsyncOptions'
import type { AsyncOptionFetcher, AsyncOptionSource } from '../src/core/types'

/**
 * The control over a list that arrives in portions.
 *
 * The panel is teleported to `<body>`, so every query below goes through
 * `document` rather than through the wrapper — the same arrangement
 * `dataTable.spec.ts` uses for the filter panel. That is not a detail of the
 * test: it is exactly why the focus rule this file pins has to exist at all.
 */

const LABELS = ['Anna', 'Boris', 'Clara', 'Dmitri', 'Elena', 'Fyodor']

function source(options: Record<string, unknown> = {}): {
  source: AsyncOptionSource
  calls: number[]
  dispose: () => void
} {
  const calls: number[] = []
  const fetcher: AsyncOptionFetcher = async ({ loaded }) => {
    calls.push(loaded)
    const slice = LABELS.slice(loaded, loaded + 2)
    return {
      options: slice.map((label, index) => ({ value: loaded + index, label })),
      total: LABELS.length,
    }
  }
  const scope = effectScope()
  const made = scope.run(() => useAsyncOptions(fetcher, { debounceMs: 5, ...options }))!
  return { source: made, calls, dispose: () => scope.stop() }
}

function select(props: Record<string, unknown> = {}) {
  const made = source()
  const wrapper = mount(AsyncSelect, {
    props: { source: made.source, ...props },
    attachTo: document.body,
  })
  return { ...made, wrapper }
}

const panel = () => document.querySelector('.vt-select-panel')
const optionsOf = () =>
  [...document.querySelectorAll('.vt-select-option')].map((node) => node.textContent?.trim())

async function open(wrapper: ReturnType<typeof mount>): Promise<void> {
  await wrapper.find('.vt-select-trigger').trigger('click')
  await vi.waitFor(() => expect(panel()).not.toBeNull())
  await nextTick()
}

describe('AsyncSelect', () => {
  it('renders standalone, with no table context above it', () => {
    const { wrapper, dispose } = select({ label: 'Manager' })
    expect(wrapper.find('.vt-select-trigger').exists()).toBe(true)
    expect(wrapper.find('.vt-select-trigger').attributes('role')).toBe('combobox')
    wrapper.unmount()
    dispose()
  })

  it('shows the placeholder until a value has a label', async () => {
    const { wrapper, source: made, dispose } = select({ placeholder: 'Pick one' })
    expect(wrapper.find('.vt-select-trigger').text()).toBe('Pick one')

    await wrapper.setProps({ value: 1 })
    // A value whose portion has not loaded reads as itself rather than as a
    // blank — the library never fetches a label of its own to fill it.
    expect(wrapper.find('.vt-select-trigger').text()).toBe('1')

    made.remember({ value: 1, label: 'Boris' })
    await nextTick()
    expect(wrapper.find('.vt-select-trigger').text()).toBe('Boris')
    wrapper.unmount()
    dispose()
  })

  it('asks for the first portion when it opens, not before', async () => {
    const { wrapper, calls, dispose } = select()
    expect(calls).toHaveLength(0)

    await open(wrapper)
    await vi.waitFor(() => expect(optionsOf()).toContain('Anna'))
    expect(calls).toEqual([0])
    wrapper.unmount()
    dispose()
  })

  it('asks for one more portion when the list is scrolled to the end', async () => {
    const { wrapper, calls, dispose } = select()
    await open(wrapper)
    await vi.waitFor(() => expect(calls).toEqual([0]))

    const list = document.querySelector('.vt-select-list') as HTMLElement
    // happy-dom lays nothing out, so the geometry the handler reads is staged
    // here: a list scrolled to within the threshold of its own bottom.
    Object.defineProperty(list, 'scrollHeight', { value: 400, configurable: true })
    Object.defineProperty(list, 'clientHeight', { value: 200, configurable: true })
    Object.defineProperty(list, 'scrollTop', { value: 190, writable: true, configurable: true })
    list.dispatchEvent(new Event('scroll'))

    await vi.waitFor(() => expect(calls).toEqual([0, 2]))
    wrapper.unmount()
    dispose()
  })

  it('leaves the list alone for a scroll that is nowhere near the end', async () => {
    const { wrapper, calls, dispose } = select()
    await open(wrapper)
    await vi.waitFor(() => expect(calls).toEqual([0]))

    const list = document.querySelector('.vt-select-list') as HTMLElement
    Object.defineProperty(list, 'scrollHeight', { value: 400, configurable: true })
    Object.defineProperty(list, 'clientHeight', { value: 200, configurable: true })
    Object.defineProperty(list, 'scrollTop', { value: 0, writable: true, configurable: true })
    list.dispatchEvent(new Event('scroll'))
    await nextTick()

    expect(calls).toEqual([0])
    wrapper.unmount()
    dispose()
  })

  it('offers a button too, for a list too short to scroll and for a keyboard', async () => {
    const { wrapper, calls, dispose } = select()
    await open(wrapper)
    await vi.waitFor(() => expect(optionsOf()).toContain('Anna'))

    const more = document.querySelector('.vt-select-more') as HTMLButtonElement
    expect(more).not.toBeNull()
    more.click()
    await vi.waitFor(() => expect(calls).toEqual([0, 2]))
    wrapper.unmount()
    dispose()
  })

  describe('choosing', () => {
    it('reports the option and remembers its label', async () => {
      const { wrapper, source: made, dispose } = select()
      await open(wrapper)
      await vi.waitFor(() => expect(optionsOf()).toContain('Anna'))

      const anna = [...document.querySelectorAll('.vt-select-option')].find(
        (node) => node.textContent?.trim() === 'Anna',
      ) as HTMLElement
      anna.click()
      await nextTick()

      expect(wrapper.emitted('update:value')?.[0]).toEqual([0])
      expect(made.labelFor(0)).toBe('Anna')
      // Choosing closes the panel; the trigger takes focus back.
      expect(panel()).toBeNull()
      wrapper.unmount()
      dispose()
    })

    it('offers the way back to blank, unless the caller refuses one', async () => {
      const { wrapper, dispose } = select()
      await open(wrapper)
      await vi.waitFor(() => expect(optionsOf()).toContain('Anna'))
      expect(document.querySelectorAll('.vt-select-option')[0]?.textContent?.trim()).toBe('')
      wrapper.unmount()
      dispose()

      const required = select({ required: true })
      await open(required.wrapper)
      await vi.waitFor(() => expect(optionsOf()).toContain('Anna'))
      expect(optionsOf()).not.toContain('')
      required.wrapper.unmount()
      required.dispose()
    })
  })

  describe('the keyboard', () => {
    it('walks the list and chooses with Enter', async () => {
      const { wrapper, dispose } = select()
      await open(wrapper)
      await vi.waitFor(() => expect(optionsOf()).toContain('Anna'))

      const box = panel() as HTMLElement
      box.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
      await nextTick()
      box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
      await nextTick()

      expect(wrapper.emitted('update:value')?.[0]).toEqual([0])
      wrapper.unmount()
      dispose()
    })

    it('closes on Escape without letting it reach anything above', async () => {
      const { wrapper, dispose } = select()
      await open(wrapper)

      const event = new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
        cancelable: true,
      })
      const stopped = vi.spyOn(event, 'stopPropagation')
      ;(panel() as HTMLElement).dispatchEvent(event)
      await nextTick()

      // The edit above this control survives the first Escape; the second one
      // finds the panel closed and reaches the editor, which cancels it.
      expect(panel()).toBeNull()
      expect(stopped).toHaveBeenCalled()
      wrapper.unmount()
      dispose()
    })

    it('opens on Alt and an arrow, and leaves every other key to the editor above', async () => {
      const { wrapper, dispose } = select()
      const trigger = wrapper.find('.vt-select-trigger')

      await trigger.trigger('keydown', { key: 'Enter' })
      expect(panel()).toBeNull()

      // A bare arrow goes up now. Closed, this control is a button with a
      // label on it and has no use for one — and swallowing it left a cell
      // cursor above with no way out of the cell at all.
      await trigger.trigger('keydown', { key: 'ArrowDown' })
      expect(panel()).toBeNull()

      await trigger.trigger('keydown', { key: 'ArrowDown', altKey: true })
      await vi.waitFor(() => expect(panel()).not.toBeNull())

      // The same gesture both ways, so it is a toggle rather than a one-way
      // door — and Escape is still the other way out.
      await trigger.trigger('keydown', { key: 'ArrowUp', altKey: true })
      await vi.waitFor(() => expect(panel()).toBeNull())
      wrapper.unmount()
      dispose()
    })
  })

  describe('what counts as leaving', () => {
    it('says nothing when focus moves into its own panel', async () => {
      const { wrapper, dispose } = select()
      await open(wrapper)

      const search = document.querySelector('.vt-select-search') as HTMLElement
      wrapper.find('.vt-select').element.dispatchEvent(
        new FocusEvent('focusout', { relatedTarget: search, bubbles: true }),
      )
      await nextTick()

      // The panel is teleported, so this focusout is indistinguishable from
      // leaving the cell — and a cell editor reads leaving as a save.
      expect(wrapper.emitted('blur')).toBeUndefined()
      expect(panel()).not.toBeNull()
      wrapper.unmount()
      dispose()
    })

    it('reports a blur for focus that really left', async () => {
      const { wrapper, dispose } = select()
      await open(wrapper)

      const elsewhere = document.createElement('button')
      document.body.append(elsewhere)
      wrapper.find('.vt-select').element.dispatchEvent(
        new FocusEvent('focusout', { relatedTarget: elsewhere, bubbles: true }),
      )
      await nextTick()

      expect(wrapper.emitted('blur')).toHaveLength(1)
      expect(panel()).toBeNull()
      elsewhere.remove()
      wrapper.unmount()
      dispose()
    })
  })
})
