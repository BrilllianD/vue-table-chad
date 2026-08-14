import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import DataTable from '../src/components/preset/DataTable.vue'
import { useLocalDataSource } from '../src/core/useLocalDataSource'
import { useTableState } from '../src/core/useTableState'
import type { ColumnDef } from '../src/core/types'
import { people, personColumns, type Person } from './fixtures'

/** `salary` carries both backgrounds; every other column carries none. */
const columns: ColumnDef<Person>[] = personColumns.map((column) =>
  column.id === 'salary'
    ? { ...column, background: '#fff7ed', headerBackground: '#ffedd5' }
    : column,
)

function mountTable(defs: ColumnDef<Person>[] = columns) {
  const Host = defineComponent({
    setup() {
      const state = useTableState({ pageSize: 3 })
      const source = useLocalDataSource<Person>(people, defs, state.query)
      return () => h(DataTable as never, { columns: defs, source, state })
    },
  })
  return mount(Host, { attachTo: document.body })
}

const cellFor = (wrapper: ReturnType<typeof mountTable>, id: string) =>
  wrapper.findAll('tbody td').find((td) => td.attributes('data-column') === id)!

const headerFor = (wrapper: ReturnType<typeof mountTable>, id: string) =>
  wrapper.findAll('thead th').find((th) => th.attributes('data-column') === id)!

describe('ColumnDef.background', () => {
  it('paints every body cell of that column and no others', () => {
    const wrapper = mountTable()

    const salary = cellFor(wrapper, 'salary')
    expect(salary.attributes('data-column-bg')).toBe('')
    expect(salary.attributes('style')).toContain('--vt-column-bg: #fff7ed')

    const name = cellFor(wrapper, 'name')
    expect(name.attributes('data-column-bg')).toBeUndefined()
    expect(name.attributes('style') ?? '').not.toContain('--vt-column-bg')

    // Every row of the column, not just the first.
    const salaryCells = wrapper
      .findAll('tbody td')
      .filter((td) => td.attributes('data-column') === 'salary')
    expect(salaryCells).toHaveLength(3)
    expect(salaryCells.every((td) => td.attributes('data-column-bg') === '')).toBe(true)
    wrapper.unmount()
  })

  it('paints the header only when headerBackground is set', () => {
    const wrapper = mountTable()

    expect(headerFor(wrapper, 'salary').attributes('style')).toContain('--vt-column-bg: #ffedd5')
    expect(headerFor(wrapper, 'name').attributes('data-column-bg')).toBeUndefined()
    wrapper.unmount()
  })

  it('leaves the header alone when only the body background is set', () => {
    const wrapper = mountTable(
      personColumns.map((column) =>
        column.id === 'salary' ? { ...column, background: '#fff7ed' } : column,
      ),
    )

    expect(cellFor(wrapper, 'salary').attributes('data-column-bg')).toBe('')
    expect(headerFor(wrapper, 'salary').attributes('data-column-bg')).toBeUndefined()
    wrapper.unmount()
  })

  // The background travels as a custom property, never as `background:` — an
  // inline background would outrank the hover and selected rules and leave a
  // selected row looking unselected wherever the column crosses it.
  it('never writes an inline background declaration', () => {
    const wrapper = mountTable()
    const style = cellFor(wrapper, 'salary').attributes('style') ?? ''
    expect(style).not.toMatch(/(^|;)\s*background/)
    wrapper.unmount()
  })

  // Alpha is the whole reason the value travels as a custom property: the
  // preset paints it as a layer over the row's stripe, so it has something to
  // blend with. Passing it through unparsed is what makes that possible.
  it('passes a translucent colour through untouched', () => {
    const wrapper = mountTable(
      personColumns.map((column) =>
        column.id === 'salary'
          ? { ...column, background: 'rgb(249 115 22 / 0.14)' }
          : column,
      ),
    )

    expect(cellFor(wrapper, 'salary').attributes('style')).toContain(
      '--vt-column-bg: rgb(249 115 22 / 0.14)',
    )
    wrapper.unmount()
  })

  it('keeps the pin offset when a pinned column also has a background', () => {
    const wrapper = mountTable(
      personColumns.map((column) =>
        column.id === 'name'
          ? { ...column, pinned: 'left' as const, background: '#fff7ed', width: 120 }
          : column,
      ),
    )

    const style = cellFor(wrapper, 'name').attributes('style')!
    expect(style).toContain('left: 0px')
    expect(style).toContain('--vt-column-bg: #fff7ed')
    wrapper.unmount()
  })
})
