import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h, nextTick, shallowRef } from 'vue'
import DataTable from '../src/components/preset/DataTable.vue'
import { useLocalDataSource } from '../src/core/useLocalDataSource'
import { useTableState } from '../src/core/useTableState'
import { useRowEditing, type RowChange } from '../src/core/useRowEditing'
import { replaceRowIn } from '../src/core/editing'
import type { ColumnDef } from '../src/core/types'
import { people, personColumns, type Person } from './fixtures'

/**
 * Copy and paste on the cursor cell, end to end through the preset.
 *
 * One cell, not a range: the cursor is a single cell and there is no cell
 * selection to paste a block into. `hiredAt` stays read-only throughout,
 * because half of what is asserted here is the difference between a cell that
 * accepts a paste and one that does not — and that a copy makes no such
 * distinction.
 */

const columns: ColumnDef<Person>[] = personColumns.map((column) => {
  // A formatted column, so "copies what it shows" is testable at all: the
  // value is a number and what the cell renders is not.
  if (column.id === 'salary') {
    return {
      ...column,
      editable: true,
      format: (value: unknown) => (value === null ? '—' : `$${Number(value).toLocaleString('en-US')}`),
    }
  }
  if (column.id === 'name') return { ...column, editable: true, required: true }
  return column
})

type SessionOptions = Partial<Parameters<typeof useRowEditing<Person>>[2]>

function mountTable(options: { editable?: boolean; session?: SessionOptions } = {}) {
  const rows = shallowRef<Person[]>([...people])
  const saves: RowChange<Person>[] = []

  const Host = defineComponent({
    setup() {
      const state = useTableState({ pageSize: 25 })
      const source = useLocalDataSource<Person>(rows, columns, state.query, { debounceMs: 0 })
      const session = useRowEditing<Person>(source, columns, {
        save: async (change) => {
          saves.push(change)
        },
        apply: (next) => {
          rows.value = replaceRowIn(rows.value, next, (row) => row.id)
        },
        ...options.session,
      })
      return () =>
        h(DataTable as never, {
          columns,
          source,
          state,
          cellCursor: true,
          // A table with a cursor and no editing session at all: copy must
          // still work, since copying is a read.
          ...(options.editable === false ? {} : { editing: session }),
        })
    },
  })

  return { wrapper: mount(Host, { attachTo: document.body }), rows, saves }
}

type Wrapper = ReturnType<typeof mountTable>['wrapper']

function cell(wrapper: Wrapper, rowId: number, columnId: string) {
  return wrapper.get(`tbody tr[data-row-id="${rowId}"] td[data-column="${columnId}"]`)
}

/**
 * A `copy` or `paste` carrying a clipboard, dispatched onto a cell.
 *
 * Built by hand rather than triggered: jsdom's `ClipboardEvent` has a
 * `clipboardData` of `null`, and the payload is the whole point here. The
 * returned event doubles as the record of whether the default was suppressed.
 */
function clipboardEvent(type: 'copy' | 'paste', text = '') {
  const store = new Map<string, string>([['text/plain', text]])
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'clipboardData', {
    value: {
      getData: (format: string) => store.get(format) ?? '',
      setData: (format: string, value: string) => store.set(format, value),
    },
  })
  return { event, read: () => store.get('text/plain') ?? '' }
}

/** Puts the cursor on a cell the way focus does, then acts on it. */
async function clipboardAt(
  wrapper: Wrapper,
  rowId: number,
  columnId: string,
  type: 'copy' | 'paste',
  text = '',
) {
  const target = cell(wrapper, rowId, columnId)
  await target.trigger('focusin')
  const gesture = clipboardEvent(type, text)
  target.element.dispatchEvent(gesture.event)
  await nextTick()
  await nextTick()
  return gesture
}

describe('copy', () => {
  it('puts the text the cell shows on the clipboard, not the value behind it', async () => {
    const { wrapper } = mountTable()
    const { event, read } = await clipboardAt(wrapper, 1, 'salary', 'copy')

    // `column.format` and nothing else: a copy that handed back `120000` would
    // be handing back something the user never saw.
    expect(read()).toBe('$120,000')
    expect(event.defaultPrevented).toBe(true)
    wrapper.unmount()
  })

  it('copies a read-only cell too', async () => {
    const { wrapper } = mountTable()
    const { read, event } = await clipboardAt(wrapper, 1, 'hiredAt', 'copy')

    // Only paste is gated by `isEditable`. A table whose cells could be read on
    // screen but not onto the clipboard would teach people to retype them.
    expect(read()).toBe('2021-03-05')
    expect(event.defaultPrevented).toBe(true)
    wrapper.unmount()
  })

  it('copies with no editing session at all', async () => {
    const { wrapper } = mountTable({ editable: false })
    const { read } = await clipboardAt(wrapper, 1, 'name', 'copy')

    expect(read()).toBe('Ada Lovelace')
    wrapper.unmount()
  })
})

describe('paste', () => {
  it('parses the text and saves the cell', async () => {
    const { wrapper, rows, saves } = mountTable()
    const { event } = await clipboardAt(wrapper, 1, 'salary', 'paste', '150000')

    expect(event.defaultPrevented).toBe(true)
    // Through `parseCellInput`, the same route a typed edit takes: a number
    // column stores a number, not the string that arrived.
    expect(saves).toHaveLength(1)
    expect(saves[0]!.patch).toEqual({ salary: 150000 })
    expect(rows.value[0]!.salary).toBe(150000)
    // And the draft closed, so the cell is no longer an editor.
    expect(cell(wrapper, 1, 'salary').find('input').exists()).toBe(false)
    wrapper.unmount()
  })

  it('drops the newline a spreadsheet appends, and only that one', async () => {
    const { wrapper, saves } = mountTable()
    await clipboardAt(wrapper, 1, 'name', 'paste', 'Ada L\r\n')

    // Nobody typed it and nobody wants it stored. Anything else in the payload
    // is used verbatim — splitting on tabs and newlines would be block paste,
    // which needs a range to paste into.
    expect(saves[0]!.patch).toEqual({ name: 'Ada L' })
    wrapper.unmount()
  })

  it('leaves a read-only cell to the browser', async () => {
    const { wrapper, rows, saves } = mountTable()
    const { event } = await clipboardAt(wrapper, 1, 'hiredAt', 'paste', '2024-01-01')

    // Not claimed, so the paste is still the browser's — which will do nothing
    // to a `<td>`, and that is the honest outcome.
    expect(event.defaultPrevented).toBe(false)
    expect(saves).toEqual([])
    expect(rows.value[0]!.hiredAt).toBe('2021-03-05')
    wrapper.unmount()
  })

  it('does nothing at all without an editing session', async () => {
    const { wrapper, rows } = mountTable({ editable: false })
    const { event } = await clipboardAt(wrapper, 1, 'name', 'paste', 'Nobody')

    expect(event.defaultPrevented).toBe(false)
    expect(rows.value[0]!.name).toBe('Ada Lovelace')
    wrapper.unmount()
  })

  it('leaves the editor open on the message when the value does not validate', async () => {
    const { wrapper, rows, saves } = mountTable()
    await clipboardAt(wrapper, 1, 'name', 'paste', '')

    // A clipboard value fails the way a typed one does: the draft stays open
    // holding the message, and Escape still puts the cell back.
    expect(saves).toEqual([])
    expect(rows.value[0]!.name).toBe('Ada Lovelace')
    const input = cell(wrapper, 1, 'name').find('input')
    expect(input.exists()).toBe(true)
    expect(input.attributes('title')).toBe('Required')
    wrapper.unmount()
  })

  it('reports a rejected save on the cell, like any other save', async () => {
    const { wrapper, rows } = mountTable({
      session: {
        save: async () => {
          throw new Error('Simulated server error (503)')
        },
      },
    })
    await clipboardAt(wrapper, 1, 'salary', 'paste', '150000')

    expect(rows.value[0]!.salary).toBe(120000)
    expect(cell(wrapper, 1, 'salary').find('input').attributes('title')).toBe(
      'Simulated server error (503)',
    )
    wrapper.unmount()
  })
})
