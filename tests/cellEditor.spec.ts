import { describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import CellEditor from '../src/components/primitives/CellEditor.vue'
import { useAsyncOptions } from '../src/core/useAsyncOptions'
import type { ColumnDef } from '../src/core/types'
import { toDisplayNumber, toMachineNumber } from '../src/core/numberMask'

/**
 * The component reads its separators from `Intl` at the runtime's own locale,
 * so the expectations do too — a literal `1,234` here would be an assertion
 * about which ICU data the test runner shipped.
 */
const display = (value: string) => toDisplayNumber(value)
const machine = (value: string) => toMachineNumber(value)

/**
 * `mount` cannot infer an SFC's own generic, so the columns are declared at the
 * component's default row type. None of them use an accessor, so nothing is
 * lost — and the accessor case has its own coverage in `editing.spec.ts`.
 */
type Row = Record<string, unknown>

/**
 * Mounted with explicit props and no `<TableRoot>` anywhere, which is the
 * standalone contract every primitive is held to — and here it is also the
 * cheapest way to test the keyboard rules, which are the point of the
 * component.
 */
function editor(column: ColumnDef<Row>, props: Record<string, unknown> = {}) {
  return mount(CellEditor, {
    props: { column, value: null, ...props },
    attachTo: document.body,
  })
}

/**
 * The option labels a select is offering, panel opened.
 *
 * Read off `document` rather than the wrapper because the panel is teleported
 * to `<body>` — which is the point of it, since a `<td>`'s `overflow` would
 * otherwise clip the list.
 */
async function optionsOf(wrapper: ReturnType<typeof editor>): Promise<string[]> {
  await wrapper.get('.vt-select-trigger').trigger('click')
  await nextTick()
  return Array.from(document.querySelectorAll('.vt-select-panel .vt-select-option')).map(
    (node) => node.textContent?.trim() ?? '',
  )
}

const text: ColumnDef<Row> = { id: 'name', header: 'Name', type: 'text' }
const number: ColumnDef<Row> = { id: 'salary', header: 'Salary', type: 'number' }
const date: ColumnDef<Row> = { id: 'hiredAt', header: 'Hired', type: 'date' }
const boolean: ColumnDef<Row> = { id: 'active', header: 'Active', type: 'boolean' }
const enumeration: ColumnDef<Row> = {
  id: 'department',
  header: 'Department',
  type: 'enum',
  options: ['Design', 'Sales'],
}

/** A column whose options arrive in portions rather than being declared. */
function asyncColumn(): { column: ColumnDef<Row>; dispose: () => void } {
  const scope = effectScope()
  const source = scope.run(() =>
    useAsyncOptions(async () => ({
      options: [{ value: 1, label: 'Anna' }],
      hasMore: false,
    })),
  )!
  return {
    column: { id: 'manager', header: 'Manager', asyncOptions: source },
    dispose: () => scope.stop(),
  }
}

describe('the control it picks', () => {
  it('follows the column type', () => {
    expect(editor(text).find('input').attributes('type')).toBe('text')
    // A number column masks into a text box; `inputmode` is what makes it a
    // number to a touch keyboard. See the grouping tests below.
    expect(editor(number).find('input').attributes('type')).toBe('text')
    expect(editor(date).find('input').attributes('type')).toBe('date')
    expect(editor(boolean).find('input').attributes('type')).toBe('checkbox')
    expect(editor(enumeration).find('.vt-select-trigger').exists()).toBe(true)
  })

  it('asks for a numeric keyboard without asking for a number input', () => {
    // The mask is why the control is text: `input[type=number]` only accepts a
    // bare float as its value, so a grouped one reads back as empty. What is
    // left to say "this is a number" is `inputmode`.
    expect(editor(number).find('input').attributes('inputmode')).toBe('decimal')
    expect(editor(text).find('input').attributes('inputmode')).toBeUndefined()
    expect(editor(date).find('input').attributes('inputmode')).toBeUndefined()
    // And with no number input there is no spinner to restrict: `step` used to
    // be `any` here precisely because nothing in `ColumnDef` declares a
    // precision. `step` on a date input means days, so it stays off there too.
    expect(editor(number).find('input').attributes('step')).toBeUndefined()
    expect(editor(date).find('input').attributes('step')).toBeUndefined()
  })

  it('offers every option, plus a way back to blank', async () => {
    const wrapper = editor(enumeration, { autofocus: false })
    expect(await optionsOf(wrapper)).toEqual(['', 'Design', 'Sales'])
    wrapper.unmount()
  })

  it('drops the blank option when the column is required', async () => {
    const wrapper = editor({ ...enumeration, required: true }, { autofocus: false })
    expect(await optionsOf(wrapper)).toEqual(['Design', 'Sales'])
    wrapper.unmount()
  })

  it('renders a blank rather than the word "null"', () => {
    expect((editor(text, { value: null }).find('input').element as HTMLInputElement).value).toBe('')
    expect(
      (editor(text, { value: undefined }).find('input').element as HTMLInputElement).value,
    ).toBe('')
  })

  it('picks the paged dropdown for a column whose options are fetched', () => {
    const { column, dispose } = asyncColumn()
    const wrapper = editor(column, { autofocus: false })
    // Whatever its `type`: the list is the reason for the control, and a
    // column of ids is as often typed `number` as `enum`.
    expect(wrapper.find('.vt-select-trigger').exists()).toBe(true)
    expect(wrapper.find('.vt-cell-editor').attributes('data-kind')).toBe('async-select')
    wrapper.unmount()
    dispose()
  })

  it('takes an explicit editor over the type', () => {
    expect(editor({ ...text, editor: 'textarea' }).find('textarea').exists()).toBe(true)
  })

  it('labels itself from the column header', () => {
    expect(editor(number).find('input').attributes('aria-label')).toBe('Salary')
    expect(editor(number, { label: 'Yearly pay' }).find('input').attributes('aria-label')).toBe(
      'Yearly pay',
    )
  })
})

describe('what it emits', () => {
  it('reports a typed value, and a checkbox reports a boolean', async () => {
    const wrapper = editor(number)
    await wrapper.find('input').setValue('92000')
    expect(wrapper.emitted('update:value')![0]).toEqual(['92000'])

    const box = editor(boolean, { value: false })
    await box.find('input').setValue(true)
    expect(box.emitted('update:value')![0]).toEqual([true])
  })

  it('groups a number as it is typed, and still reports a machine string', async () => {
    const wrapper = editor(number)
    const input = wrapper.find('input')
    await input.setValue('1234000')

    // What the draft gets is what a native number box gave: bare digits, so
    // `parseCellInput` and any `column.parse` are unaffected by the mask.
    expect(wrapper.emitted('update:value')![0]).toEqual(['1234000'])
    // What the person sees is grouped, in the separators this runtime's `Intl`
    // uses — asserting on a comma would be asserting on the runner's ICU data.
    expect((input.element as HTMLInputElement).value).toBe(display('1234000'))

    await wrapper.setProps({ value: '1234000' })
    expect((input.element as HTMLInputElement).value).toBe(display('1234000'))
  })

  it('keeps the caret where the typing was, not where the index was', async () => {
    const wrapper = editor(number, { value: '123' })
    const input = wrapper.find('input')
    const element = input.element as HTMLInputElement
    // Let the focus watcher run first: it selects the value, and a selection
    // still standing when the typing starts would swallow the assertion below.
    await nextTick()

    // The fourth digit, typed at the end of "123": the value regroups and a
    // separator appears *before* the caret, so an index restored as-is would
    // leave it one place short.
    element.value = '1234'
    element.setSelectionRange(4, 4)
    await input.trigger('input')

    expect(element.value).toBe(display('1234'))
    expect(element.selectionStart).toBe(element.value.length)
  })

  it('takes a pasted number apart rather than refusing it', async () => {
    const wrapper = editor(number)
    // Currency, grouping and all — dropped down to the number it meant.
    await wrapper.find('input').setValue('$1,234.50')
    expect(wrapper.emitted('update:value')!.at(-1)).toEqual([machine('$1,234.50')])
  })

  it('leaves the text of every other control alone', async () => {
    const wrapper = editor(text)
    await wrapper.find('input').setValue('1234000')
    // No mask on a text column: `1234000` is a string that happens to be
    // digits, and grouping it would rewrite the value.
    expect(wrapper.emitted('update:value')![0]).toEqual(['1234000'])
    expect((wrapper.find('input').element as HTMLInputElement).value).toBe('1234000')
  })

  it('commits on Enter and cancels on Escape', async () => {
    const wrapper = editor(text, { value: 'Ada' })
    await wrapper.find('input').trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('commit')).toHaveLength(1)

    await wrapper.find('input').trigger('keydown', { key: 'Escape' })
    expect(wrapper.emitted('cancel')).toHaveLength(1)
  })

  it('reports a blur without deciding what it means', async () => {
    // What leaving a cell means depends on the table: finishing a single-cell
    // edit, or tabbing between the fields of one open row. The cell says only
    // that focus left.
    const wrapper = editor(text, { value: 'Ada' })
    await wrapper.find('input').trigger('blur')
    expect(wrapper.emitted('blur')).toHaveLength(1)
    expect(wrapper.emitted('commit')).toBeUndefined()
  })

  it('moves on Tab, in the direction Shift asks for', async () => {
    const wrapper = editor(text)
    await wrapper.find('input').trigger('keydown', { key: 'Tab' })
    expect(wrapper.emitted('move')![0]).toEqual([1])

    await wrapper.find('input').trigger('keydown', { key: 'Tab', shiftKey: true })
    expect(wrapper.emitted('move')![1]).toEqual([-1])
  })

  it('leaves Tab alone when the neighbouring cells are editors too', async () => {
    const wrapper = editor(text, { trapTab: false })
    await wrapper.find('input').trigger('keydown', { key: 'Tab' })
    expect(wrapper.emitted('move')).toBeUndefined()
  })

  it('commits and says where to go when an arrow leaves the cell', async () => {
    const wrapper = editor(text, { value: 'Ada', arrowMove: true })
    // The same payload Enter sends, and deliberately nothing more: the table
    // treats the two commits alike, so an origin flag would be a distinction
    // no caller is allowed to act on.
    await wrapper.find('input').trigger('keydown', { key: 'ArrowDown' })
    expect(wrapper.emitted('commit')![0]).toEqual([{ kind: 'by', rows: 1, columns: 0 }])

    await wrapper.find('input').trigger('keydown', { key: 'ArrowRight' })
    expect(wrapper.emitted('commit')![1]).toEqual([{ kind: 'by', rows: 0, columns: 1 }])
  })

  it('leaves the arrows to the caret unless asked', async () => {
    // Off by default: with no cell cursor over the table there is nowhere for
    // an arrow to move to, and taking the key would only cost the caret.
    const wrapper = editor(text, { value: 'Ada' })
    await wrapper.find('input').trigger('keydown', { key: 'ArrowDown' })
    expect(wrapper.emitted('commit')).toBeUndefined()
  })

  it('leaves the arrows to a select and a textarea even when asked', async () => {
    const list = editor(enumeration, { arrowMove: true })
    await list.find('.vt-select-trigger').trigger('keydown', { key: 'ArrowDown' })
    // The arrows are how a select is changed at all, and how a caret crosses a
    // line in a textarea. Claiming them takes the control's own operation away.
    expect(list.emitted('commit')).toBeUndefined()

    const area = editor({ ...text, editor: 'textarea' }, { arrowMove: true })
    await area.find('textarea').trigger('keydown', { key: 'ArrowDown' })
    expect(area.emitted('commit')).toBeUndefined()
  })

  it('leaves the arrows to the paged dropdown as well', async () => {
    const { column, dispose } = asyncColumn()
    const wrapper = editor(column, { arrowMove: true, autofocus: false })
    // Same reason as the select: the arrows are how the listbox is walked, so
    // claiming them would take the control's own operation away.
    await wrapper.find('.vt-select-trigger').trigger('keydown', { key: 'ArrowDown' })
    expect(wrapper.emitted('commit')).toBeUndefined()
    wrapper.unmount()
    dispose()
  })

  it('hears Enter from the dropdown only once its panel is closed', async () => {
    const { column, dispose } = asyncColumn()
    const wrapper = editor(column, { autofocus: false })
    const trigger = wrapper.find('.vt-select-trigger')

    // Closed, Enter is the commit it always was.
    await trigger.trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('commit')).toHaveLength(1)

    await trigger.trigger('click')
    await vi.waitFor(() =>
      expect(document.querySelector('.vt-select-panel')).not.toBeNull(),
    )
    // Open, Enter is the choice — and the panel is teleported, so it never
    // reaches this component at all.
    document
      .querySelector('.vt-select-panel')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await nextTick()
    expect(wrapper.emitted('commit')).toHaveLength(1)
    wrapper.unmount()
    dispose()
  })

  it('leaves Enter to a textarea, and takes Ctrl+Enter instead', async () => {
    const wrapper = editor({ ...text, editor: 'textarea' })
    await wrapper.find('textarea').trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('commit')).toBeUndefined()

    await wrapper.find('textarea').trigger('keydown', { key: 'Enter', ctrlKey: true })
    expect(wrapper.emitted('commit')).toHaveLength(1)
  })

  it('keeps Escape to itself, so cancelling an edit closes nothing above it', async () => {
    let bubbled = 0
    const wrapper = mount(
      {
        components: { CellEditor },
        setup: () => ({ column: text, onEsc: () => (bubbled += 1) }),
        template:
          '<div @keydown.esc="onEsc"><CellEditor :column="column" :value="null" /></div>',
      },
      { attachTo: document.body },
    )
    await wrapper.find('input').trigger('keydown', { key: 'Escape' })
    expect(bubbled).toBe(0)
  })
})

describe('an invalid cell', () => {
  it('marks the control and announces the message in a region of its own', () => {
    // The message cannot render under the input — `.vt-td` clips to the row
    // height — so it travels as a title for a pointer and an alert for a reader.
    const wrapper = editor(number, { value: 'abc', error: 'Not a number' })
    const input = wrapper.find('input')
    expect(input.attributes('aria-invalid')).toBe('true')
    expect(input.attributes('title')).toBe('Not a number')

    const message = wrapper.find('[role="alert"]')
    expect(message.text()).toBe('Not a number')
    expect(input.attributes('aria-errormessage')).toBe(message.attributes('id'))
    expect(wrapper.find('.vt-cell-editor').attributes('data-invalid')).toBe('')
  })

  it('says nothing at all when the value is fine', () => {
    const wrapper = editor(number, { value: 1 })
    expect(wrapper.find('input').attributes('aria-invalid')).toBeUndefined()
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    expect(wrapper.find('.vt-cell-editor').attributes('data-invalid')).toBeUndefined()
  })
})

describe('focus and substitution', () => {
  it('focuses itself, because the cell was just clicked', async () => {
    const wrapper = editor(text, { value: 'Ada' })
    await nextTick()
    expect(document.activeElement).toBe(wrapper.find('input').element)
    wrapper.unmount()
  })

  it('stays put when autofocus is off', async () => {
    const wrapper = editor(text, { value: 'Ada', autofocus: false })
    await nextTick()
    expect(document.activeElement).not.toBe(wrapper.find('input').element)
    wrapper.unmount()
  })

  it('opens with the value selected, so the first keystroke replaces it', async () => {
    const wrapper = editor(text, { value: 'Ada' })
    await nextTick()
    const element = wrapper.find('input').element as HTMLInputElement
    expect(element.selectionStart).toBe(0)
    expect(element.selectionEnd).toBe(3)
    wrapper.unmount()
  })

  it('selects the masked number too, separators and all', async () => {
    const wrapper = editor(number, { value: '1234000' })
    await nextTick()
    const element = wrapper.find('input').element as HTMLInputElement
    // The grouped string, not the machine one: what is on screen is what a
    // keystroke would replace.
    expect(element.value).toBe(display('1234000'))
    expect(element.selectionStart).toBe(0)
    expect(element.selectionEnd).toBe(element.value.length)
    wrapper.unmount()
  })

  it('puts the caret past a seeded value instead of selecting it', async () => {
    // What a cell opened by typing holds: the character just typed. Selected,
    // the next keystroke would eat it.
    const wrapper = editor(text, { value: 'A', selectOnFocus: false })
    await nextTick()
    const element = wrapper.find('input').element as HTMLInputElement
    expect(element.selectionStart).toBe(1)
    expect(element.selectionEnd).toBe(1)
    wrapper.unmount()
  })

  it('only focuses the controls with no text selection to speak of', async () => {
    // `setSelectionRange` throws an `InvalidStateError` on a date input, and a
    // select and a checkbox have nothing to select at all.
    const dated = editor(date, { value: '2024-01-01' })
    await nextTick()
    expect(document.activeElement).toBe(dated.find('input').element)
    dated.unmount()

    const chosen = editor(enumeration, { value: 'Design' })
    await nextTick()
    await nextTick()
    // The dropdown manages its own focus, trigger then panel. What is asserted
    // here is only that `setSelectionRange` stayed away from a control with no
    // text to select — it throws on a date input and means nothing on a list.
    expect(document.activeElement?.closest('.vt-select, .vt-select-panel')).not.toBeNull()
    chosen.unmount()

    const checked = editor(boolean, { value: true })
    await nextTick()
    expect(document.activeElement).toBe(checked.find('input').element)
    checked.unmount()
  })

  it('hands the slot everything it needs to behave the same way', async () => {
    const wrapper = mount(CellEditor, {
      props: { column: text, value: 'Ada', error: 'Nope' },
      slots: {
        default: `<template #default="s">
          <button class="mine" :data-error="s.error" :data-kind="s.kind" @click="s.commit()">
            {{ s.value }}
          </button>
        </template>`,
      },
      attachTo: document.body,
    })
    const button = wrapper.find('.mine')
    expect(button.text()).toBe('Ada')
    expect(button.attributes('data-kind')).toBe('text')
    expect(button.attributes('data-error')).toBe('Nope')
    // No default control rendered at all — the slot replaced it.
    expect(wrapper.find('input').exists()).toBe(false)

    await button.trigger('click')
    expect(wrapper.emitted('commit')).toHaveLength(1)
  })
})
