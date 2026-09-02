import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h, nextTick, ref, shallowRef } from 'vue'
import DataTable from '../src/components/preset/DataTable.vue'
import { useLocalDataSource } from '../src/core/useLocalDataSource'
import { useTableState } from '../src/core/useTableState'
import { useRowEditing, type EditMode, type RowChange } from '../src/core/useRowEditing'
import { replaceRowIn } from '../src/core/editing'
import { toDisplayNumber, toMachineNumber } from '../src/core/numberMask'
import type { ColumnDef } from '../src/core/types'
import { people, personColumns, type Person } from './fixtures'

/**
 * What the preset renders once it is handed an editing session — and, first of
 * all, that it renders exactly what it always did when it is not.
 */

const DEPARTMENTS = ['Engineering', 'Research', 'Support']

const columns: ColumnDef<Person>[] = personColumns.map((column) => {
  if (column.id === 'department') return { ...column, editable: true, options: DEPARTMENTS }
  if (column.id === 'name') return { ...column, editable: true, required: true }
  if (column.id === 'salary') return { ...column, editable: true }
  if (column.id === 'active') return { ...column, editable: true }
  // `hiredAt` stays read-only on purpose: something has to prove the plain path.
  return column
})

type SessionOptions = Partial<Parameters<typeof useRowEditing<Person>>[2]>

function mountEditable(sessionOptions: SessionOptions = {}, mode: EditMode = 'cell') {
  const rows = shallowRef<Person[]>([...people])
  const editMode = ref<EditMode>(mode)
  const saves: RowChange<Person>[] = []
  let session!: ReturnType<typeof useRowEditing<Person>>

  const Host = defineComponent({
    setup() {
      const state = useTableState({ pageSize: 3 })
      const source = useLocalDataSource<Person>(rows, columns, state.query, { debounceMs: 0 })
      session = useRowEditing<Person>(source, columns, {
        mode: editMode,
        save: async (change) => {
          saves.push(change)
        },
        apply: (next) => {
          rows.value = replaceRowIn(rows.value, next, (row) => row.id)
        },
        ...sessionOptions,
      })
      return () => h(DataTable as never, { columns, source, state, editing: session })
    },
  })

  const wrapper = mount(Host, { attachTo: document.body })
  return { wrapper, rows, saves, editMode, session: () => session }
}

/** The `<td>` under a column, in the first body row. */
function cell(wrapper: ReturnType<typeof mountEditable>['wrapper'], columnId: string) {
  return wrapper.find(`tbody tr:first-child td[data-column="${columnId}"]`)
}

async function openEditor(
  wrapper: ReturnType<typeof mountEditable>['wrapper'],
  columnId: string,
) {
  await cell(wrapper, columnId).find('.vt-cell-trigger').trigger('click')
  await nextTick()
}

describe('a table with no editing session', () => {
  it('renders each cell exactly as it always did — no wrapper, no trigger', () => {
    const Host = defineComponent({
      setup() {
        const state = useTableState({ pageSize: 3 })
        const source = useLocalDataSource<Person>(people, columns, state.query, { debounceMs: 0 })
        return () => h(DataTable as never, { columns, source, state })
      },
    })
    const wrapper = mount(Host, { attachTo: document.body })

    expect(wrapper.find('.vt-cell-trigger').exists()).toBe(false)
    expect(wrapper.find('.vt-cell-editor').exists()).toBe(false)
    expect(wrapper.find('.vt-col-actions').exists()).toBe(false)
    expect(wrapper.find('tbody tr:first-child td[data-column="name"]').text()).toBe('Ada Lovelace')
    wrapper.unmount()
  })
})

describe('cell mode', () => {
  it('offers a trigger on editable columns only', () => {
    const h = mountEditable()
    expect(cell(h.wrapper, 'name').find('.vt-cell-trigger').exists()).toBe(true)
    expect(cell(h.wrapper, 'salary').find('.vt-cell-trigger').exists()).toBe(true)
    expect(cell(h.wrapper, 'hiredAt').find('.vt-cell-trigger').exists()).toBe(false)
    h.wrapper.unmount()
  })

  it('adds no actions column — Enter and Escape are the whole interface', () => {
    const h = mountEditable()
    expect(h.wrapper.find('.vt-col-actions').exists()).toBe(false)
    expect(h.wrapper.find('.vt-th-actions').exists()).toBe(false)
    h.wrapper.unmount()
  })

  it('opens one editor, on the cell that was clicked', async () => {
    const h = mountEditable()
    await openEditor(h.wrapper, 'salary')

    // Text with `inputmode`, not `type="number"`: the editor masks a number
    // column into thousands, which a number input's value cannot hold.
    const salary = cell(h.wrapper, 'salary').find('input')
    expect(salary.attributes('type')).toBe('text')
    expect(salary.attributes('inputmode')).toBe('decimal')
    // The others stay as they were.
    expect(cell(h.wrapper, 'name').find('input').exists()).toBe(false)
    expect(h.wrapper.findAll('.vt-cell-editor')).toHaveLength(1)
    h.wrapper.unmount()
  })

  it('picks the control from the column type', async () => {
    const h = mountEditable()
    await openEditor(h.wrapper, 'department')
    const select = cell(h.wrapper, 'department').find('select')
    expect(select.exists()).toBe(true)
    expect(select.findAll('option').map((option) => option.text())).toEqual(['', ...DEPARTMENTS])

    await openEditor(h.wrapper, 'active')
    expect(cell(h.wrapper, 'active').find('input').attributes('type')).toBe('checkbox')
    h.wrapper.unmount()
  })

  it('saves on Enter and puts the new value in the cell', async () => {
    const h = mountEditable()
    await openEditor(h.wrapper, 'salary')

    const input = cell(h.wrapper, 'salary').find('input')
    await input.setValue('99000')
    await input.trigger('keydown', { key: 'Enter' })
    await nextTick()
    await nextTick()

    expect(h.saves).toHaveLength(1)
    expect(h.saves[0]!.patch).toEqual({ salary: 99000 })
    expect(h.rows.value.find((row) => row.id === 1)!.salary).toBe(99000)
    expect(cell(h.wrapper, 'salary').find('input').exists()).toBe(false)
    h.wrapper.unmount()
  })

  it('stores a decimal exactly as it was typed', async () => {
    // The library's own path is lossless end to end — `target.value` untouched,
    // `Number(trimmed)` to parse, the patch written straight through. What
    // rounds a saved number is a formatter on the way back out, or a server
    // normalising it, and neither is the table doing it. Asserted here because
    // "the value changed after I saved it" is the report, and this is the line
    // that says the change came from somewhere else.
    const h = mountEditable()
    await openEditor(h.wrapper, 'salary')

    const input = cell(h.wrapper, 'salary').find('input')
    await input.setValue('96367.42')
    await input.trigger('keydown', { key: 'Enter' })
    await nextTick()
    await nextTick()

    expect(h.saves[0]!.patch).toEqual({ salary: 96367.42 })
    expect(h.rows.value.find((row) => row.id === 1)!.salary).toBe(96367.42)

    // And the editor seeds from the raw value rather than from the cell's
    // rendered text: what comes back is that number under the editor's own
    // thousands mask — every digit of it — not the column's `format`, which
    // would have rounded it into currency.
    await openEditor(h.wrapper, 'salary')
    const reopened = cell(h.wrapper, 'salary').find('input').element.value
    expect(reopened).toBe(toDisplayNumber('96367.42'))
    expect(toMachineNumber(reopened)).toBe('96367.42')
    h.wrapper.unmount()
  })

  it('saves when focus leaves the cell', async () => {
    const h = mountEditable()
    await openEditor(h.wrapper, 'salary')
    const input = cell(h.wrapper, 'salary').find('input')
    await input.setValue('1')
    await input.trigger('blur')
    await nextTick()

    expect(h.saves).toHaveLength(1)
    h.wrapper.unmount()
  })

  it('throws the edit away on Escape', async () => {
    const h = mountEditable()
    await openEditor(h.wrapper, 'salary')
    const input = cell(h.wrapper, 'salary').find('input')
    await input.setValue('99000')
    await input.trigger('keydown', { key: 'Escape' })
    await nextTick()

    expect(h.saves).toHaveLength(0)
    expect(h.rows.value.find((row) => row.id === 1)!.salary).toBe(120000)
    expect(cell(h.wrapper, 'salary').find('input').exists()).toBe(false)
    h.wrapper.unmount()
  })

  it('keeps an invalid value on screen instead of saving it', async () => {
    const h = mountEditable()
    await openEditor(h.wrapper, 'name')

    const input = cell(h.wrapper, 'name').find('input')
    await input.setValue('')
    await input.trigger('keydown', { key: 'Enter' })
    await nextTick()
    await nextTick()

    expect(h.saves).toHaveLength(0)
    const still = cell(h.wrapper, 'name').find('input')
    expect(still.exists()).toBe(true)
    expect(still.attributes('aria-invalid')).toBe('true')
    expect(still.attributes('title')).toBe('Required')
    expect(cell(h.wrapper, 'name').find('[role="alert"]').text()).toBe('Required')
    h.wrapper.unmount()
  })

  it('shows a rejected save on the cell that caused it', async () => {
    const h = mountEditable({
      save: async () => {
        throw new Error('Simulated server error (503)')
      },
    })
    await openEditor(h.wrapper, 'salary')
    const input = cell(h.wrapper, 'salary').find('input')
    await input.setValue('1')
    await input.trigger('keydown', { key: 'Enter' })
    await nextTick()
    await nextTick()

    const still = cell(h.wrapper, 'salary').find('input')
    expect(still.attributes('title')).toBe('Simulated server error (503)')
    expect(h.wrapper.find('tbody tr:first-child').attributes('data-row-state')).toBe('error')
    h.wrapper.unmount()
  })

  it('moves to the next editable cell on Tab, skipping the read-only one', async () => {
    const h = mountEditable()
    await openEditor(h.wrapper, 'salary')
    const input = cell(h.wrapper, 'salary').find('input')
    await input.setValue('1')
    await input.trigger('keydown', { key: 'Tab' })
    await nextTick()
    await nextTick()

    // `hiredAt` sits between salary and active and is not editable.
    expect(cell(h.wrapper, 'hiredAt').find('input').exists()).toBe(false)
    expect(cell(h.wrapper, 'active').find('input').exists()).toBe(true)
    h.wrapper.unmount()
  })

  it('stays put when Tab would carry a failed edit away from its message', async () => {
    const h = mountEditable()
    await openEditor(h.wrapper, 'name')
    const input = cell(h.wrapper, 'name').find('input')
    await input.setValue('')
    await input.trigger('keydown', { key: 'Tab' })
    await nextTick()
    await nextTick()

    expect(cell(h.wrapper, 'name').find('input').exists()).toBe(true)
    expect(cell(h.wrapper, 'department').find('select').exists()).toBe(false)
    h.wrapper.unmount()
  })

  it('marks a row that has been typed into but not yet saved', async () => {
    const h = mountEditable()
    await openEditor(h.wrapper, 'salary')
    expect(h.wrapper.find('tbody tr:first-child').attributes('data-row-state')).toBeUndefined()

    await cell(h.wrapper, 'salary').find('input').setValue('1')
    await nextTick()
    expect(h.wrapper.find('tbody tr:first-child').attributes('data-row-state')).toBe('dirty')
    h.wrapper.unmount()
  })

  it('opens a clicked cell with its value selected', async () => {
    const h = mountEditable()
    await openEditor(h.wrapper, 'name')
    await nextTick()

    const element = cell(h.wrapper, 'name').find('input').element as HTMLInputElement
    expect(element.value).toBe('Ada Lovelace')
    expect(element.selectionStart).toBe(0)
    expect(element.selectionEnd).toBe(element.value.length)
    h.wrapper.unmount()
  })
})

describe('row mode', () => {
  it('opens every editable cell at once, and adds a column for Save', async () => {
    const h = mountEditable({}, 'row')
    await openEditor(h.wrapper, 'salary')

    expect(cell(h.wrapper, 'name').find('input').exists()).toBe(true)
    expect(cell(h.wrapper, 'department').find('select').exists()).toBe(true)
    expect(cell(h.wrapper, 'active').find('input').exists()).toBe(true)
    expect(cell(h.wrapper, 'hiredAt').find('input').exists()).toBe(false)

    expect(h.wrapper.find('.vt-th-actions').exists()).toBe(true)
    expect(h.wrapper.find('.vt-row-actions').exists()).toBe(true)
    h.wrapper.unmount()
  })

  it('keeps every row the same width as its colgroup', async () => {
    const h = mountEditable({}, 'row')
    await openEditor(h.wrapper, 'salary')

    const cols = h.wrapper.findAll('colgroup col').length
    for (const row of h.wrapper.findAll('tbody tr')) {
      const cells = row.findAll('td').reduce((total, td) => {
        const span = Number(td.attributes('colspan') ?? 1)
        return total + span
      }, 0)
      expect(cells).toBe(cols)
    }
    h.wrapper.unmount()
  })

  it('sends every changed field in one save', async () => {
    const h = mountEditable({}, 'row')
    await openEditor(h.wrapper, 'salary')

    await cell(h.wrapper, 'salary').find('input').setValue('77000')
    await cell(h.wrapper, 'name').find('input').setValue('Ada L.')
    await cell(h.wrapper, 'department').find('select').setValue('Research')
    await h.wrapper.find('.vt-row-actions .vt-btn-primary').trigger('click')
    await nextTick()
    await nextTick()

    expect(h.saves).toHaveLength(1)
    expect(h.saves[0]!.patch).toEqual({
      salary: 77000,
      name: 'Ada L.',
      department: 'Research',
    })
    h.wrapper.unmount()
  })

  it('leaves each field caret-at-end, because Tab between them is navigation', async () => {
    const h = mountEditable({}, 'row')
    await openEditor(h.wrapper, 'name')
    await nextTick()

    const element = cell(h.wrapper, 'name').find('input').element as HTMLInputElement
    // A whole row open at once: selecting every value on the way past would
    // leave each of them one keystroke from being wiped.
    expect(element.selectionStart).toBe(element.value.length)
    expect(element.selectionEnd).toBe(element.value.length)
    h.wrapper.unmount()
  })

  it('does not save when focus moves between the row own fields', async () => {
    const h = mountEditable({}, 'row')
    await openEditor(h.wrapper, 'salary')
    await cell(h.wrapper, 'salary').find('input').setValue('1')
    await cell(h.wrapper, 'salary').find('input').trigger('blur')
    await nextTick()

    // Tabbing through a form is navigation, not a decision to save.
    expect(h.saves).toHaveLength(0)
    expect(cell(h.wrapper, 'salary').find('input').exists()).toBe(true)
    h.wrapper.unmount()
  })

  it('leaves Tab alone, so it reaches the next editor by itself', async () => {
    const h = mountEditable({}, 'row')
    await openEditor(h.wrapper, 'salary')
    expect(cell(h.wrapper, 'salary').find('input').attributes()).toBeDefined()
    await cell(h.wrapper, 'salary').find('input').trigger('keydown', { key: 'Tab' })
    await nextTick()
    // Nothing committed, nothing closed — the browser moves focus on its own.
    expect(h.saves).toHaveLength(0)
    expect(h.wrapper.findAll('.vt-cell-editor').length).toBeGreaterThan(1)
    h.wrapper.unmount()
  })

  it('drops the whole draft on Cancel', async () => {
    const h = mountEditable({}, 'row')
    await openEditor(h.wrapper, 'salary')
    await cell(h.wrapper, 'salary').find('input').setValue('1')
    await h.wrapper.findAll('.vt-row-actions .vt-btn')[1]!.trigger('click')
    await nextTick()

    expect(h.saves).toHaveLength(0)
    expect(h.wrapper.find('.vt-cell-editor').exists()).toBe(false)
    expect(h.rows.value.find((row) => row.id === 1)!.salary).toBe(120000)
    h.wrapper.unmount()
  })

  it('shows a rejected save beside the buttons, and disables them while saving', async () => {
    const h = mountEditable(
      {
        save: async () => {
          throw { fields: { salary: 'Too low' }, message: 'Rejected' }
        },
      },
      'row',
    )
    await openEditor(h.wrapper, 'salary')
    await cell(h.wrapper, 'salary').find('input').setValue('1')
    await h.wrapper.find('.vt-row-actions .vt-btn-primary').trigger('click')
    await nextTick()
    await nextTick()

    expect(h.wrapper.find('.vt-row-error').text()).toBe('Rejected')
    expect(cell(h.wrapper, 'salary').find('input').attributes('title')).toBe('Too low')
    h.wrapper.unmount()
  })
})

describe('the editor slot', () => {
  it('replaces the control while keeping the commit contract', async () => {
    const rows = shallowRef<Person[]>([...people])
    const saves: RowChange<Person>[] = []
    const Host = defineComponent({
      setup() {
        const state = useTableState({ pageSize: 3 })
        const source = useLocalDataSource<Person>(rows, columns, state.query, { debounceMs: 0 })
        const session = useRowEditing<Person>(source, columns, {
          save: async (change) => {
            saves.push(change)
          },
          apply: (next) => {
            rows.value = replaceRowIn(rows.value, next, (row) => row.id)
          },
        })
        return () =>
          h(
            DataTable as never,
            { columns, source, state, editing: session },
            {
              'editor:salary': (slotProps: { update: (v: unknown) => void; commit: () => void }) =>
                h(
                  'button',
                  {
                    class: 'raise',
                    onClick: () => {
                      slotProps.update('500000')
                      slotProps.commit()
                    },
                  },
                  'Raise',
                ),
            },
          )
      },
    })
    const wrapper = mount(Host, { attachTo: document.body })

    await wrapper
      .find('tbody tr:first-child td[data-column="salary"] .vt-cell-trigger')
      .trigger('click')
    await nextTick()

    expect(wrapper.find('.raise').exists()).toBe(true)
    // The default control is gone entirely — the slot replaced it.
    expect(wrapper.find('td[data-column="salary"] input').exists()).toBe(false)

    await wrapper.find('.raise').trigger('click')
    await nextTick()
    await nextTick()
    expect(saves[0]!.patch).toEqual({ salary: 500000 })
    wrapper.unmount()
  })
})
