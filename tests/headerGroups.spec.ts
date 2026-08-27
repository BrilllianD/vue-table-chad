import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h, nextTick } from 'vue'
import DataTable from '../src/components/preset/DataTable.vue'
import { useLocalDataSource } from '../src/core/useLocalDataSource'
import { useTableState } from '../src/core/useTableState'
import TableHeaderCell from '../src/components/primitives/TableHeaderCell.vue'
import TableHeaderGroupCell from '../src/components/primitives/TableHeaderGroupCell.vue'
import { buildHeaderRows } from '../src/core/columnGroups'
import type {
  ColumnGroupDef,
  HeaderGroupCell,
  HeaderRow,
  ResolvedColumn,
} from '../src/core/types'
import {
  groupedPersonColumns,
  people,
  personColumnGroups,
  personColumns,
  type Person,
} from './fixtures'

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

  it('offers a toggle to a band the pin boundary split into one-column cells', () => {
    const left = resolved('name', 'identity')
    left.pinned = 'left'
    const cell = groupCell(buildHeaderRows([left, resolved('email', 'identity')], personColumnGroups), 0)

    expect(cell.colspan).toBe(1)
    expect(cell.totalColumns).toBe(2)
    const wrapper = mount(TableHeaderGroupCell, { props: { cell, collapsed: false } })

    // Asking each half whether *it* has anything to hide would leave the band
    // unfoldable from either one.
    expect(wrapper.find('button').exists()).toBe(true)
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

  it('takes a band’s own border overrides and class through to the cell', () => {
    const cell: HeaderGroupCell<Row> = {
      ...bandCell(),
      group: { id: 'identity', header: 'Identity', class: 'accented' },
    }
    const wrapper = mount(TableHeaderGroupCell, {
      props: {
        cell,
        collapsed: false,
        bandEdge: { depth: 0, color: 'rebeccapurple', width: '3px' },
      },
    })

    // Custom properties rather than `border-color` and `border-width` directly:
    // the stylesheet keeps ownership of whether the rule is drawn at all, so a
    // zeroed `--vt-band-border-width` on the table still wins over a band that
    // named a colour.
    const th = wrapper.find('th')
    expect(th.attributes('style')).toContain('--vt-band-border-color: rebeccapurple')
    expect(th.attributes('style')).toContain('--vt-band-border-width: 3px')
    expect(th.classes()).toContain('accented')
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

describe('DataTable with header bands', () => {
  function mountTable(props: Record<string, unknown> = {}) {
    const Host = defineComponent({
      setup() {
        const state = useTableState({ pageSize: 3 })
        const source = useLocalDataSource<Person>(people, groupedPersonColumns, state.query, {
          debounceMs: 0,
        })
        return () =>
          h(DataTable as never, {
            columns: groupedPersonColumns,
            columnGroups: personColumnGroups,
            source,
            state,
            ...props,
          })
      },
    })
    return mount(Host, { attachTo: document.body })
  }

  /** Column ids in the order the header puts them, across every header row. */
  const headerColumns = (wrapper: ReturnType<typeof mountTable>) =>
    wrapper.findAll('thead th[data-column]').map((th) => th.attributes('data-column'))

  const bandCells = (wrapper: ReturnType<typeof mountTable>) =>
    wrapper.findAll('thead th[data-column-group]')

  /**
   * Every row's cell count, spans included, against the `<colgroup>`.
   *
   * The invariant the whole grid rests on, and the one a multi-row header is
   * most able to break: a row one cell short drags every column after it out
   * of place, and nothing else in the suite would notice.
   */
  function gridIsSquare(wrapper: ReturnType<typeof mountTable>): void {
    const width = wrapper.findAll('colgroup col').length

    for (const body of wrapper.findAll('tbody tr, tfoot tr')) {
      const cells = body.findAll('td, th')
      const span = cells.reduce((sum, cell) => sum + Number(cell.attributes('colspan') ?? 1), 0)
      expect(span).toBe(width)
    }

    // Header rows are counted together, since a rowspan reaches down into the
    // rows beneath it and only the total has to come out square.
    const rows = wrapper.findAll('thead tr')
    let cellArea = 0
    for (const row of rows) {
      for (const cell of row.findAll('th')) {
        cellArea +=
          Number(cell.attributes('colspan') ?? 1) * Number(cell.attributes('rowspan') ?? 1)
      }
    }
    expect(cellArea).toBe(width * rows.length)
  }

  it('renders one row per band level', () => {
    const wrapper = mountTable()

    // `money` nests inside `record`, so the fixtures are three deep.
    expect(wrapper.findAll('thead tr')).toHaveLength(3)
    expect(bandCells(wrapper).map((th) => th.attributes('data-column-group'))).toEqual([
      'identity',
      'record',
      'money',
    ])
    gridIsSquare(wrapper)
    wrapper.unmount()
  })

  it('spans a band over its columns and an unbanded column down to the body', () => {
    const wrapper = mountTable()

    const identity = wrapper.find('thead th[data-column-group="identity"]')
    expect(identity.attributes('colspan')).toBe('2')
    expect(identity.attributes('scope')).toBe('colgroup')

    // `active` is in no band, so it is placed in the first row and reaches the
    // body from there.
    const active = wrapper.find('thead th[data-column="active"]')
    expect(active.attributes('rowspan')).toBe('3')
    wrapper.unmount()
  })

  it('keeps every control a banded column header had before', async () => {
    const wrapper = mountTable()
    // The deepest column in the fixtures, so its cell is the one furthest from
    // the shape the header used to have.
    const salary = wrapper.find('thead th[data-column="salary"]')

    expect(salary.find('button.vt-sort').exists()).toBe(true)
    expect(salary.find('.vt-filter-trigger').exists()).toBe(true)
    expect(salary.find('.vt-resize').exists()).toBe(true)

    await salary.find('button.vt-sort').trigger('click')
    expect(wrapper.find('thead th[data-column="salary"]').attributes('data-sorted')).toBe('asc')
    wrapper.unmount()
  })

  it('withholds a band’s columns from header, colgroup and body together', async () => {
    const wrapper = mountTable()
    const before = wrapper.findAll('colgroup col').length

    await wrapper.find('thead th[data-column-group="identity"] button').trigger('click')
    await nextTick()

    expect(headerColumns(wrapper)).not.toContain('department')
    expect(wrapper.findAll('colgroup col').length).toBe(before - 1)
    expect(wrapper.findAll('tbody tr')[0]!.findAll('td')).toHaveLength(before - 1)
    // The band keeps its first member, so it never folds out of existence.
    expect(headerColumns(wrapper)).toContain('name')
    gridIsSquare(wrapper)
    wrapper.unmount()
  })

  it('flips aria-expanded and folds back open', async () => {
    const wrapper = mountTable()
    const toggle = () => wrapper.find('thead th[data-column-group="identity"] button')

    expect(toggle().attributes('aria-expanded')).toBe('true')
    await toggle().trigger('click')
    await nextTick()
    expect(toggle().attributes('aria-expanded')).toBe('false')

    await toggle().trigger('click')
    await nextTick()
    expect(headerColumns(wrapper)).toContain('department')
    gridIsSquare(wrapper)
    wrapper.unmount()
  })

  it('spans the selection and actions cells down the whole header', () => {
    const wrapper = mountTable({ selectable: true })

    const selection = wrapper.find('thead th.vt-th-selection')
    expect(selection.attributes('rowspan')).toBe('3')
    // And exactly one of them: a second copy in row two would push every real
    // column one place to the right.
    expect(wrapper.findAll('thead th.vt-th-selection')).toHaveLength(1)
    gridIsSquare(wrapper)
    wrapper.unmount()
  })

  it('renders a single-row header when no column declares a band', () => {
    const Host = defineComponent({
      setup() {
        const state = useTableState({ pageSize: 3 })
        const source = useLocalDataSource<Person>(people, personColumns, state.query, {
          debounceMs: 0,
        })
        return () => h(DataTable as never, { columns: personColumns, source, state })
      },
    })
    const wrapper = mount(Host, { attachTo: document.body })

    expect(wrapper.findAll('thead tr')).toHaveLength(1)
    expect(wrapper.findAll('thead th[data-column-group]')).toHaveLength(0)
    // The markup a table without bands emitted before any of this existed.
    expect(wrapper.find('thead th[data-column="name"]').attributes('rowspan')).toBeUndefined()
    wrapper.unmount()
  })

  /** `data-band-edge` per column, from whichever section is asked about. */
  const edgesIn = (wrapper: ReturnType<typeof mountTable>, section: string) =>
    Object.fromEntries(
      wrapper
        .findAll(`${section} [data-column][data-band-edge]`)
        .map((cell) => [cell.attributes('data-column'), cell.attributes('data-band-edge')]),
    )

  it('draws a band boundary down the header, the body and the footer alike', () => {
    const wrapper = mountTable({ showFooter: true })

    // `identity` gives way to `record` after `department`, so that boundary is
    // outermost; `money` gives way to plain `record` after `salary`, one level
    // in; and `record` gives way to unbanded `active` after `hiredAt`. `active`
    // is last and gets nothing — its right edge is the table's own frame.
    const expected = { department: '0', salary: '1', hiredAt: '0' }
    expect(edgesIn(wrapper, 'thead')).toEqual(expected)
    expect(edgesIn(wrapper, 'tbody tr:first-child')).toEqual(expected)
    expect(edgesIn(wrapper, 'tfoot')).toEqual(expected)

    wrapper.unmount()
  })

  it('puts a band cell’s rule at the end of the run it actually covers', () => {
    const wrapper = mountTable()
    const edgeOf = (groupId: string) =>
      wrapper.find(`thead th[data-column-group="${groupId}"]`).attributes('data-band-edge')

    // Each band cell asks about its own last column, which is what keeps a band
    // split into several runs from drawing a rule inside itself.
    expect(edgeOf('identity')).toBe('0')
    expect(edgeOf('record')).toBe('0')
    expect(edgeOf('money')).toBe('1')

    wrapper.unmount()
  })

  it('moves the boundary when a fold takes the column it sat beside', async () => {
    const wrapper = mountTable()
    expect(edgesIn(wrapper, 'thead')).toHaveProperty('department', '0')

    await wrapper.find('thead th[data-column-group="identity"] button').trigger('click')
    await nextTick()

    // `department` is gone, so the band now ends at the column it folded to.
    expect(edgesIn(wrapper, 'thead')).toEqual({ name: '0', salary: '1', hiredAt: '0' })
    expect(edgesIn(wrapper, 'tbody tr:first-child')).toEqual({
      name: '0',
      salary: '1',
      hiredAt: '0',
    })

    wrapper.unmount()
  })

  it('marks nothing at all when no column claims a band', () => {
    const Host = defineComponent({
      setup() {
        const state = useTableState({ pageSize: 3 })
        const source = useLocalDataSource<Person>(people, personColumns, state.query, {
          debounceMs: 0,
        })
        return () => h(DataTable as never, { columns: personColumns, source, state })
      },
    })
    const wrapper = mount(Host, { attachTo: document.body })

    expect(wrapper.findAll('[data-band-edge]')).toHaveLength(0)
    wrapper.unmount()
  })

  it('follows a band’s border override down into the body and the footer', () => {
    const styled: ColumnGroupDef[] = personColumnGroups.map((band) =>
      band.id === 'identity' ? { ...band, borderColor: 'rebeccapurple', borderWidth: '3px' } : band,
    )
    const wrapper = mountTable({ columnGroups: styled, showFooter: true })

    // `identity` ends after `department`, so that is the boundary it owns —
    // in the header, in every row and in the footer, since a rule that stopped
    // at the header would not read as one line.
    for (const section of ['thead', 'tbody tr:first-child', 'tfoot']) {
      const style = wrapper.find(`${section} [data-column="department"]`).attributes('style')!
      expect(style).toContain('--vt-band-border-color: rebeccapurple')
      expect(style).toContain('--vt-band-border-width: 3px')
    }

    // Not the boundaries other bands own.
    expect(wrapper.find('tbody [data-column="salary"]').attributes('style') ?? '').not.toContain(
      '--vt-band-border-color',
    )
    wrapper.unmount()
  })

  it('takes the header rows through the headerGroup slot', () => {
    const Host = defineComponent({
      setup() {
        const state = useTableState({ pageSize: 3 })
        const source = useLocalDataSource<Person>(people, groupedPersonColumns, state.query, {
          debounceMs: 0,
        })
        return () =>
          h(
            DataTable as never,
            {
              columns: groupedPersonColumns,
              columnGroups: personColumnGroups,
              source,
              state,
            },
            {
              headerGroup: ({ label }: { label: string }) => h('em', { class: 'custom' }, label),
            },
          )
      },
    })
    const wrapper = mount(Host, { attachTo: document.body })

    expect(wrapper.find('thead em.custom').text()).toBe('Identity')
    wrapper.unmount()
  })
})
