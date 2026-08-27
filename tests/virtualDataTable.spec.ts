import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h, nextTick, ref } from 'vue'
import DataTable from '../src/components/preset/DataTable.vue'
import { useLocalDataSource } from '../src/core/useLocalDataSource'
import { useTableState } from '../src/core/useTableState'
import { useRowEditing } from '../src/core/useRowEditing'
import type { ColumnDef } from '../src/core/types'

/**
 * `virtual` mode end to end: the preset, the primitive and the composable
 * together.
 *
 * happy-dom lays nothing out, so `.vt-scroll` reports a height of 0 and
 * `VirtualBody` falls back to the viewport height it assumes — 640px, about 17
 * rows at the default 38. That is a real window rather than a mocked one, and
 * every count below is written against it rather than against a number, so a
 * change to the assumption fails these tests loudly instead of silently.
 */

interface Row extends Record<string, unknown> {
  id: number
  name: string
  team: string
}

const ROWS = 400

function makeRows(count = ROWS): Row[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    name: `Person ${String(i + 1).padStart(3, '0')}`,
    team: i % 2 === 0 ? 'Alpha' : 'Beta',
  }))
}

const columns: ColumnDef<Row>[] = [
  { id: 'name', header: 'Name', type: 'text' },
  { id: 'team', header: 'Team', type: 'enum' },
]

function mountTable(props: Record<string, unknown> = {}, rows: Row[] = makeRows()) {
  const Host = defineComponent({
    setup() {
      const state = useTableState({ pageSize: 10 })
      const source = useLocalDataSource<Row>(rows, columns, state.query, { debounceMs: 0 })
      return () =>
        h(DataTable as never, { columns, source, state, getRowId: (row: Row) => row.id, ...props })
    },
  })
  return mount(Host, { attachTo: document.body })
}

function bodyRows(wrapper: ReturnType<typeof mountTable>) {
  return wrapper.findAll('tbody tr.vt-tr')
}

function firstBodyName(wrapper: ReturnType<typeof mountTable>): string {
  return bodyRows(wrapper)[0]!.text()
}

describe('DataTable in virtual mode', () => {
  it('windows the tbody to the viewport, not to the page', () => {
    const wrapper = mountTable({ virtual: true })

    const rendered = bodyRows(wrapper).length
    // Not the page size it was given, and not the whole dataset either.
    expect(rendered).toBeGreaterThan(10)
    expect(rendered).toBeLessThan(ROWS)
    expect(firstBodyName(wrapper)).toContain('Person 001')

    wrapper.unmount()
  })

  it('virtual off renders exactly the page it always did', () => {
    const wrapper = mountTable()

    expect(bodyRows(wrapper)).toHaveLength(10)
    expect(wrapper.findAll('.vt-virtual-spacer')).toHaveLength(0)

    wrapper.unmount()
  })

  it('renders no pager in virtual mode', () => {
    const paged = mountTable()
    expect(paged.find('.vt-pagination').exists()).toBe(true)
    paged.unmount()

    const wrapper = mountTable({ virtual: true })
    expect(wrapper.find('.vt-pagination').exists()).toBe(false)
    wrapper.unmount()
  })

  it('gives the scroll box the row height it windows with', () => {
    const wrapper = mountTable({ virtual: true, rowHeight: 50 })

    expect(wrapper.find('.vt-scroll').attributes('style')).toContain('--vt-row-height: 50px')

    wrapper.unmount()
  })

  it('restores the page size when virtual mode goes back off', async () => {
    const virtual = ref(true)
    const rows = makeRows()
    const Host = defineComponent({
      setup() {
        const state = useTableState({ pageSize: 10 })
        const source = useLocalDataSource<Row>(rows, columns, state.query, { debounceMs: 0 })
        return () =>
          h(DataTable as never, {
            columns,
            source,
            state,
            getRowId: (row: Row) => row.id,
            virtual: virtual.value,
          })
      },
    })
    const wrapper = mount(Host, { attachTo: document.body })
    expect(wrapper.findAll('tbody tr.vt-tr').length).toBeLessThan(ROWS)

    virtual.value = false
    await nextTick()
    await nextTick()

    // The size the table had before, not the dataset it was given while on.
    expect(wrapper.findAll('tbody tr.vt-tr')).toHaveLength(10)

    wrapper.unmount()
  })

  it('an arrow past the window edge scrolls the window and keeps the ring', async () => {
    const wrapper = mountTable({ virtual: true, cellCursor: true })
    const box = wrapper.find('.vt-scroll').element as HTMLElement

    // Walk the cursor down past the last rendered row. The window holds about
    // 26 rows here, so forty presses is well past its edge in a table that
    // would otherwise have nothing to focus.
    for (let press = 0; press < 40; press += 1) {
      await wrapper.find('tbody .vt-td[tabindex="0"]').trigger('keydown', { key: 'ArrowDown' })
      await nextTick()
    }

    expect(box.scrollTop).toBeGreaterThan(0)
    // The ring is on row 41, and row 41 is in the document — which is the
    // whole claim: the position moved by identity, and the window followed it.
    const ringed = wrapper.find('tbody tr.vt-tr[data-cursor]')
    expect(ringed.exists()).toBe(true)
    expect(ringed.text()).toContain('Person 041')

    wrapper.unmount()
  })

  it('keeps one tab stop on a rendered cell while the cursor is scrolled away', async () => {
    const wrapper = mountTable({ virtual: true, cellCursor: true })
    const box = wrapper.find('.vt-scroll').element as HTMLElement

    // The cursor starts on the first cell; scroll far past it.
    box.scrollTop = 38 * 200
    box.dispatchEvent(new Event('scroll'))
    await nextTick()

    const tabbable = wrapper.findAll('tbody .vt-td[tabindex="0"]')
    // Exactly one, and it is one of the rows actually on screen — without the
    // rendered-row fallback the grid would have none at all and Tab would skip
    // the table entirely.
    expect(tabbable).toHaveLength(1)

    wrapper.unmount()
  })

  it('a shift-range spans rows the window never rendered', async () => {
    const wrapper = mountTable({ virtual: true, selectable: true })

    // A click, not `setValue`: the checkbox reports the *click* so it can read
    // the shift key off it, which a change event does not carry.
    await wrapper.findAll('tbody input[type="checkbox"]')[0]!.trigger('click')
    await nextTick()
    expect(wrapper.findAll('tbody tr.vt-tr[data-selected]')).toHaveLength(1)

    const box = wrapper.find('.vt-scroll').element as HTMLElement
    box.scrollTop = 38 * 100
    box.dispatchEvent(new Event('scroll'))
    await nextTick()

    const later = wrapper.findAll('tbody input[type="checkbox"]')
    await later[2]!.trigger('click', { shiftKey: true })
    await nextTick()

    // Every row in the window is now selected, because the range that reached
    // it started a hundred rows above — rows that were never in the document,
    // and which `useRowSelection` resolved out of the in-memory array without
    // reading one.
    const selected = wrapper.findAll('tbody tr.vt-tr[data-selected]')
    expect(selected.length).toBeGreaterThan(2)

    wrapper.unmount()
  })

  it('pinned columns keep their offsets inside the window', async () => {
    const pinned: ColumnDef<Row>[] = [
      { ...columns[0]!, pinned: 'left', width: 120 },
      columns[1]!,
    ]
    const wrapper = mountTable({ virtual: true, columns: pinned }, makeRows())

    const box = wrapper.find('.vt-scroll').element as HTMLElement
    box.scrollTop = 38 * 150
    box.dispatchEvent(new Event('scroll'))
    await nextTick()

    const cell = wrapper.find('tbody tr.vt-tr .vt-td[data-pinned="left"]')
    // Pinning is horizontal and per cell, so a spacer row above the window —
    // which carries one unpinned cell and nothing to pin — cannot disturb it.
    expect(cell.exists()).toBe(true)
    expect(cell.attributes('style')).toContain('left: 0px')

    wrapper.unmount()
  })

  it('stripes keep their parity across the window boundary', async () => {
    const wrapper = mountTable({ virtual: true })
    const box = wrapper.find('.vt-scroll').element as HTMLElement

    box.scrollTop = 38 * 101
    box.dispatchEvent(new Event('scroll'))
    await nextTick()

    const rows = bodyRows(wrapper)
    const parities = rows.map((row) => row.attributes('data-parity'))
    // Alternating, and keyed to the row's place in the dataset rather than to
    // its place in the window — `nth-child` would have been thrown off by the
    // spacer row above it.
    expect(new Set(parities).size).toBe(2)
    for (let i = 1; i < parities.length; i += 1) {
      expect(parities[i]).not.toBe(parities[i - 1])
    }

    wrapper.unmount()
  })

  it('collapsing a group shortens the space the window stands in for', async () => {
    const wrapper = mountTable({ virtual: true, initialGroupBy: ['team'] })

    const before = wrapper.find('.vt-virtual-spacer')
    const beforeHeight = before.exists() ? before.attributes('style') : ''

    await wrapper.find('.vt-group-toggle').trigger('click')
    await nextTick()

    const after = wrapper.find('.vt-virtual-spacer')
    const afterHeight = after.exists() ? after.attributes('style') : ''
    expect(afterHeight).not.toBe(beforeHeight)

    wrapper.unmount()
  })

  it('a draft survives its row leaving the window and coming back', async () => {
    const editableColumns: ColumnDef<Row>[] = columns.map((column) =>
      column.id === 'name' ? { ...column, editable: true } : column,
    )
    const rows = makeRows()
    let session!: ReturnType<typeof useRowEditing<Row>>

    const Host = defineComponent({
      setup() {
        const state = useTableState({ pageSize: 10 })
        const source = useLocalDataSource<Row>(rows, editableColumns, state.query, {
          debounceMs: 0,
        })
        session = useRowEditing<Row>(source, editableColumns, {
          getRowId: (row) => row.id,
          save: async () => {},
        })
        return () =>
          h(DataTable as never, {
            columns: editableColumns,
            source,
            state,
            getRowId: (row: Row) => row.id,
            virtual: true,
            editing: session,
          })
      },
    })
    const wrapper = mount(Host, { attachTo: document.body })

    session.begin(rows[0]!, 'name')
    session.setValue(rows[0]!, editableColumns[0]!, 'Edited')
    await nextTick()
    expect(wrapper.find('tbody .vt-cell-editor input').exists()).toBe(true)

    const box = wrapper.find('.vt-scroll').element as HTMLElement
    box.scrollTop = 38 * 200
    box.dispatchEvent(new Event('scroll'))
    await nextTick()
    expect(wrapper.find('tbody .vt-cell-editor input').exists()).toBe(false)

    box.scrollTop = 0
    box.dispatchEvent(new Event('scroll'))
    await nextTick()

    // The draft lives in the session, keyed by row id, so eviction is a render
    // detail it never hears about.
    const input = wrapper.find('tbody .vt-cell-editor input')
    expect(input.exists()).toBe(true)
    expect((input.element as HTMLInputElement).value).toBe('Edited')

    wrapper.unmount()
  })

  /**
   * The size a screen reader is told about.
   *
   * A windowed `<tbody>` holds about thirty rows however long the list is, so a
   * table of 400 announces itself as a table of thirty — the DOM is the only
   * thing an assistive technology can count, and here the DOM is a sample.
   * `aria-rowcount` and `aria-rowindex` are the two attributes that say
   * otherwise.
   */
  describe('what it tells a screen reader about its size', () => {
    it('counts the whole list, not the window', () => {
      const wrapper = mountTable({ virtual: true })

      // Every row plus the one header row above them.
      expect(wrapper.find('table').attributes('aria-rowcount')).toBe(String(ROWS + 1))
      wrapper.unmount()
    })

    it('numbers every rendered row over the whole table', async () => {
      const wrapper = mountTable({ virtual: true })
      await nextTick()

      // One header row, so the first body row is row 2.
      expect(wrapper.findAll('thead tr')[0]!.attributes('aria-rowindex')).toBe('1')
      expect(bodyRows(wrapper)[0]!.attributes('aria-rowindex')).toBe('2')

      const box = wrapper.find('.vt-scroll').element
      box.scrollTop = 38 * 200
      box.dispatchEvent(new Event('scroll'))
      await nextTick()

      // Scrolled, the numbers describe where in the *list* the window is —
      // which is the whole point of them, and what the count of rows in the
      // document cannot say.
      const first = bodyRows(wrapper)[0]!
      expect(first.text()).toContain('Person 197')
      expect(first.attributes('aria-rowindex')).toBe('198')
      wrapper.unmount()
    })

    it('numbers group headers too, since a screen reader counts them as rows', async () => {
      const wrapper = mountTable({ virtual: true, initialGroupBy: ['team'] })
      await nextTick()

      const rows = wrapper.findAll('tbody tr')
      const indices = rows
        .filter((row) => !row.classes('vt-virtual-spacer'))
        .map((row) => Number(row.attributes('aria-rowindex')))
      // Contiguous, group headers included: a gap would tell a reader there are
      // rows between these two that it cannot reach.
      expect(indices).toEqual(indices.map((_, offset) => indices[0]! + offset))
      wrapper.unmount()
    })

    it('says -1 while it does not know, which is what ARIA has for that', () => {
      const wrapper = mountTable({ virtual: true }, [])

      // A source that has not answered yet: `total` is 0 and nothing is
      // rendered, and "0 rows" would be a claim rather than an absence.
      expect(wrapper.find('table').attributes('aria-rowcount')).toBe('-1')
      wrapper.unmount()
    })

    it('says nothing at all when every row is rendered', () => {
      const wrapper = mountTable()

      // The document is already the truth here, and numbering the ten rows of
      // every page 1..10 would be a second, worse answer to the same question.
      expect(wrapper.find('table').attributes('aria-rowcount')).toBeUndefined()
      expect(bodyRows(wrapper)[0]!.attributes('aria-rowindex')).toBeUndefined()
      wrapper.unmount()
    })
  })
})
