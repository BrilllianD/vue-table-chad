import { describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import CellEditor from '../src/components/primitives/CellEditor.vue'
import type { ColumnDef } from '../src/core/types'

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

describe('the control it picks', () => {
  it('follows the column type', () => {
    expect(editor(text).find('input').attributes('type')).toBe('text')
    expect(editor(number).find('input').attributes('type')).toBe('number')
    expect(editor(date).find('input').attributes('type')).toBe('date')
    expect(editor(boolean).find('input').attributes('type')).toBe('checkbox')
    expect(editor(enumeration).find('select').exists()).toBe(true)
  })

  it('lets the number box hold any number the column will take', () => {
    // Without a `step` the browser invents `step="1"` off whatever value the
    // control started with, which makes a decimal `:invalid` and lets the
    // native spinner snap a rating's fraction away. No `ColumnDef` field
    // declares a precision, so there is nothing here to derive a grid from.
    expect(editor(number).find('input').attributes('step')).toBe('any')
    // Only the number box. `step` on a date input means days, and one there
    // would quietly restrict which dates a calendar offers.
    expect(editor(date).find('input').attributes('step')).toBeUndefined()
    expect(editor(text).find('input').attributes('step')).toBeUndefined()
  })

  it('offers every option, plus a way back to blank', () => {
    const options = editor(enumeration).findAll('option')
    expect(options).toHaveLength(3)
    expect(options[0]!.attributes('value')).toBe('')
    expect(options.map((option) => option.text())).toEqual(['', 'Design', 'Sales'])
  })

  it('drops the blank option when the column is required', () => {
    const options = editor({ ...enumeration, required: true }).findAll('option')
    expect(options.map((option) => option.text())).toEqual(['Design', 'Sales'])
  })

  it('renders a blank rather than the word "null"', () => {
    expect((editor(text, { value: null }).find('input').element as HTMLInputElement).value).toBe('')
    expect(
      (editor(text, { value: undefined }).find('input').element as HTMLInputElement).value,
    ).toBe('')
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
