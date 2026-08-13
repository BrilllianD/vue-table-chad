import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import SelectionCheckbox from '../src/components/primitives/SelectionCheckbox.vue'

/**
 * A real browser mutates a checkbox behind Vue's back: it flips `checked` as
 * part of the click's activation behaviour, before any handler runs. Test
 * environments do not reproduce that faithfully — happy-dom's ordering differs
 * from Chrome's for trusted clicks — so these tests stage the out-of-band flip
 * explicitly and then assert the invariant that matters:
 *
 *   after a click settles, `input.checked` equals what the model says.
 *
 * Both failure modes this guards against were seen in Chrome, not here.
 */
function mountBox(props: { checked: boolean; indeterminate?: boolean; disabled?: boolean }) {
  const wrapper = mount(SelectionCheckbox, { props, attachTo: document.body })
  const input = wrapper.find('input')
  return { wrapper, input, element: input.element as HTMLInputElement }
}

describe('SelectionCheckbox', () => {
  it('puts the box back when the parent ignores the change', async () => {
    const { wrapper, input, element } = mountBox({ checked: false })

    element.checked = true // the browser's own toggle
    await input.trigger('click')
    await nextTick()

    // The parent never changed `checked`, so the box must not claim otherwise.
    expect(element.checked).toBe(false)
    expect(wrapper.emitted('change')).toHaveLength(1)
    wrapper.unmount()
  })

  it('follows the model when the parent accepts the change', async () => {
    const { wrapper, input, element } = mountBox({ checked: false })

    element.checked = true
    await input.trigger('click')
    await wrapper.setProps({ checked: true })
    await nextTick()

    expect(element.checked).toBe(true)
    wrapper.unmount()
  })

  /**
   * Drift is cumulative if it is not corrected on every click, so run a
   * realistic alternating sequence: the browser flips the box each time, the
   * parent accepts some clicks and refuses others.
   */
  it('stays in step across a run of accepted and refused clicks', async () => {
    let model = false
    const { wrapper, input, element } = mountBox({ checked: model })

    for (const accept of [true, true, false, true, false, false]) {
      element.checked = !element.checked // the browser's own toggle
      await input.trigger('click')
      if (accept) {
        model = !model
        await wrapper.setProps({ checked: model })
      }
      await nextTick()
      expect(element.checked).toBe(model)
    }
    wrapper.unmount()
  })

  it('tracks the indeterminate property, which no attribute can express', async () => {
    const { wrapper, element } = mountBox({ checked: false, indeterminate: true })
    await nextTick()
    expect(element.indeterminate).toBe(true)

    await wrapper.setProps({ indeterminate: false })
    expect(element.indeterminate).toBe(false)
    wrapper.unmount()
  })

  it('emits nothing while disabled', async () => {
    const { wrapper, input } = mountBox({ checked: false, disabled: true })
    await input.trigger('click')
    expect(wrapper.emitted('change')).toBeUndefined()
    wrapper.unmount()
  })
})
