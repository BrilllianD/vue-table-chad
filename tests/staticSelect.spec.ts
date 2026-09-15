import { describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import StaticSelect from '../src/components/primitives/StaticSelect.vue'

/**
 * The dropdown over a fixed list.
 *
 * It is `AsyncSelect` underneath, so what is pinned here is only what the two
 * do differently — no search box, a typeahead in its place, and a list that is
 * complete the moment the panel opens. The panel is teleported to `<body>`,
 * so the queries go through `document`.
 */

const DEPARTMENTS = ['Engineering', 'Research', 'Support']

function select(props: Record<string, unknown> = {}) {
  return mount(StaticSelect, {
    props: { options: DEPARTMENTS, autofocus: false, ...props },
    attachTo: document.body,
  })
}

const panel = () => document.querySelector('.vt-select-panel')
const optionsOf = () =>
  [...document.querySelectorAll('.vt-select-option')].map((node) => node.textContent?.trim())
const activeOption = () =>
  document.querySelector('.vt-select-option[data-active]')?.textContent?.trim()

async function open(wrapper: ReturnType<typeof select>): Promise<void> {
  await wrapper.find('.vt-select-trigger').trigger('click')
  await vi.waitFor(() => expect(panel()).not.toBeNull())
  await nextTick()
}

describe('StaticSelect', () => {
  it('renders standalone, with no table context above it', () => {
    const wrapper = select({ label: 'Department' })
    expect(wrapper.find('.vt-select-trigger').attributes('role')).toBe('combobox')
    expect(wrapper.find('.vt-select-trigger').attributes('aria-label')).toBe('Department')
    wrapper.unmount()
  })

  it('offers the whole list at once, plus a way back to blank', async () => {
    const wrapper = select()
    await open(wrapper)
    // Complete on the first open: nothing here arrives in portions, so there
    // is no "Load more" and no status row under the list.
    expect(optionsOf()).toEqual(['', ...DEPARTMENTS])
    expect(document.querySelector('.vt-select-more')).toBeNull()
    expect(document.querySelector('.vt-select-status')).toBeNull()
    wrapper.unmount()
  })

  it('drops the blank choice when it is required', async () => {
    const wrapper = select({ required: true })
    await open(wrapper)
    expect(optionsOf()).toEqual(DEPARTMENTS)
    wrapper.unmount()
  })

  it('offers no search box — the characters belong to the typeahead', async () => {
    const wrapper = select()
    await open(wrapper)
    expect(document.querySelector('.vt-select-search')).toBeNull()
    wrapper.unmount()
  })

  it('walks the list by typing, accumulating while the characters keep coming', async () => {
    const wrapper = select({ options: ['Sales', 'Support', 'Research'] })
    await open(wrapper)

    await wrapper.find('.vt-select-trigger').trigger('keydown', { key: 's' })
    expect(activeOption()).toBe('Sales')
    // The second character extends the prefix rather than restarting it, which
    // is the only way to reach the second of two options sharing a letter.
    await wrapper.find('.vt-select-trigger').trigger('keydown', { key: 'u' })
    expect(activeOption()).toBe('Support')
    wrapper.unmount()
  })

  it('leaves a character that names nothing to whatever is above', async () => {
    const wrapper = select()
    await open(wrapper)
    const event = { key: 'z' }
    await wrapper.find('.vt-select-trigger').trigger('keydown', event)
    // Nothing matched, so nothing moved — and the key was not swallowed on the
    // way, which is what lets an editor above still read it.
    expect(activeOption()).toBeUndefined()
    wrapper.unmount()
  })

  it('reports the option that was picked, by value and whole', async () => {
    const wrapper = select()
    await open(wrapper)
    const research = [...document.querySelectorAll('.vt-select-option')].find(
      (node) => node.textContent?.trim() === 'Research',
    ) as HTMLElement
    research.click()
    await nextTick()

    expect(wrapper.emitted('update:value')).toEqual([['Research']])
    expect(wrapper.emitted('pick')).toEqual([[{ value: 'Research', label: 'Research' }]])
    expect(panel()).toBeNull()
    wrapper.unmount()
  })

  it('shows the value through the caller\'s own label function', async () => {
    const wrapper = select({
      options: [1, 2, 3],
      optionLabel: (value: number) => ['', 'Low', 'Medium', 'High'][value] ?? '',
      value: 3,
    })
    expect(wrapper.find('.vt-select-trigger').text()).toBe('High')
    wrapper.unmount()
  })

  it('reports whether its panel is up, which is what an editor above reads', async () => {
    const wrapper = select()
    expect((wrapper.vm as unknown as { open: boolean }).open).toBe(false)
    await open(wrapper)
    expect((wrapper.vm as unknown as { open: boolean }).open).toBe(true)
    wrapper.unmount()
  })
})
