import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import TableHeaderCell from '../src/components/primitives/TableHeaderCell.vue'
import TableHeaderGroupCell from '../src/components/primitives/TableHeaderGroupCell.vue'
import { buildHeaderRows } from '../src/core/columnGroups'
import type { HeaderGroupCell, HeaderRow, ResolvedColumn } from '../src/core/types'
import { groupedPersonColumns, personColumnGroups } from './fixtures'

/**
 * Columns over a plain record rather than a `Person`, the way
 * `dataTable.spec.ts` does for `TableRow`: these primitives are generic over
 * `Record<string, unknown>`, and mounting one gives the inference nothing to
 * narrow from. The row shape is not what is under test here anyway.
 */
type Row = Record<string, unknown>

function resolved(id: string, group?: string): ResolvedColumn<Row> {
  return {
    id,
    header: id,
    group,
    visible: true,
    collapsed: false,
    order: 0,
    resolvedWidth: 100,
    pinned: false,
    pinOffset: 0,
    sortDirection: false,
    sortIndex: 0,
    hasFilter: false,
  }
}

/** Narrows one cell of a built header to a band, or fails the test loudly. */
function groupCell(rows: HeaderRow<Row>[], level: number, index = 0): HeaderGroupCell<Row> {
  const cell = rows[level]?.[index]
  if (cell?.kind !== 'group') throw new Error(`no band cell at row ${level}, index ${index}`)
  return cell
}

/** The first band cell of a header built from the banded fixtures. */
function bandCell(): HeaderGroupCell<Row> {
  const columns = groupedPersonColumns.map((column) => resolved(column.id, column.group))
  return groupCell(buildHeaderRows(columns, personColumnGroups), 0)
}

describe('TableHeaderGroupCell as a primitive', () => {
  it('renders standalone, with no table context above it', () => {
    // The property every primitive here is meant to have. A band cell that
    // needed a `<TableRoot>` could not be assembled into a custom `<thead>`.
    const wrapper = mount(TableHeaderGroupCell, {
      props: { cell: bandCell(), collapsed: false },
    })

    const th = wrapper.find('th')
    expect(th.attributes('colspan')).toBe('2')
    expect(th.attributes('scope')).toBe('colgroup')
    expect(th.attributes('data-column-group')).toBe('identity')
    expect(th.text()).toContain('Identity')
    wrapper.unmount()
  })

  it('labels an undeclared band with its own id', () => {
    const cell = groupCell(buildHeaderRows([resolved('a', 'mystery')]), 0)
    const wrapper = mount(TableHeaderGroupCell, { props: { cell, collapsed: false } })

    expect(wrapper.find('th').text()).toContain('mystery')
    wrapper.unmount()
  })

  it('emits its toggle with the next state, without a context to write to', () => {
    const wrapper = mount(TableHeaderGroupCell, {
      props: { cell: bandCell(), collapsed: false },
    })

    wrapper.find('button').trigger('click')
    expect(wrapper.emitted('toggle')).toEqual([['identity', true]])
    wrapper.unmount()
  })

  it('reports its state through aria-expanded and data-collapsed', () => {
    const open = mount(TableHeaderGroupCell, { props: { cell: bandCell(), collapsed: false } })
    expect(open.find('button').attributes('aria-expanded')).toBe('true')
    expect(open.find('th').attributes('data-collapsed')).toBeUndefined()
    open.unmount()

    const shut = mount(TableHeaderGroupCell, { props: { cell: bandCell(), collapsed: true } })
    expect(shut.find('button').attributes('aria-expanded')).toBe('false')
    expect(shut.find('th').attributes('data-collapsed')).toBe('true')
    // The label has to say which way the button goes, not just which band it is.
    expect(shut.find('button').attributes('aria-label')).toBe('Expand Identity columns')
    shut.unmount()
  })

  it('offers no toggle for a band declaring collapsible: false', () => {
    const cell = { ...bandCell(), group: { id: 'identity', collapsible: false } }
    const wrapper = mount(TableHeaderGroupCell, { props: { cell, collapsed: false } })

    expect(wrapper.find('button').exists()).toBe(false)
    wrapper.unmount()
  })

  it('offers no toggle for an open band covering one column', () => {
    const cell = groupCell(buildHeaderRows([resolved('salary', 'money')], personColumnGroups), 1)
    const wrapper = mount(TableHeaderGroupCell, { props: { cell, collapsed: false } })

    // Folding it could hide nothing — every column it covers would have to
    // stay — so the control would be a button that visibly does nothing.
    expect(wrapper.find('button').exists()).toBe(false)
    wrapper.unmount()
  })

  it('keeps the toggle on a band already folded down to one column', () => {
    const cell = groupCell(buildHeaderRows([resolved('salary', 'money')], personColumnGroups), 1)
    const wrapper = mount(TableHeaderGroupCell, { props: { cell, collapsed: true } })

    // Otherwise there would be no way back out of the fold.
    expect(wrapper.find('button').exists()).toBe(true)
    wrapper.unmount()
  })

  it('carries its pin side, offset and header row into the style', () => {
    const cell: HeaderGroupCell<Row> = {
      ...bandCell(),
      pinned: 'left',
      pinOffset: 40,
      depth: 1,
    }
    const wrapper = mount(TableHeaderGroupCell, { props: { cell, collapsed: false } })

    const style = wrapper.find('th').attributes('style')!
    expect(style).toContain('left: 40px')
    // Without this the second header row would stick at `top: 0`, on top of
    // the first.
    expect(style).toContain('--vt-header-row: 1')
    expect(wrapper.find('th').attributes('data-pinned')).toBe('left')
    wrapper.unmount()
  })
})

describe('TableHeaderCell spanning header rows', () => {
  it('emits no rowspan for a single-row header', () => {
    const wrapper = mount(TableHeaderCell, { props: { column: resolved('name'), rowspan: 1 } })

    // The pre-band markup, unchanged: a table using no bands must render
    // exactly what it always rendered.
    expect(wrapper.find('th').attributes('rowspan')).toBeUndefined()
    expect(wrapper.find('th').attributes('style')).toBeUndefined()
    wrapper.unmount()
  })

  it('spans down to the body when it sits above the deepest band', () => {
    const wrapper = mount(TableHeaderCell, { props: { column: resolved('active'), rowspan: 3 } })

    expect(wrapper.find('th').attributes('rowspan')).toBe('3')
    wrapper.unmount()
  })

  it('sticks to its own header row', () => {
    const wrapper = mount(TableHeaderCell, {
      props: { column: resolved('salary'), rowspan: 1, depth: 2 },
    })

    expect(wrapper.find('th').attributes('style')).toContain('--vt-header-row: 2')
    wrapper.unmount()
  })
})
