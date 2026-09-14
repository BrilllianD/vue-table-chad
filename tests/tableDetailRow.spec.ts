import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { h } from 'vue'
import TableDetailRow from '../src/components/primitives/TableDetailRow.vue'
import type { ResolvedColumn } from '../src/core/types'

/*
 * A plain record rather than a `Person`: the primitive is generic over
 * `Record<string, unknown>`, and these cases are about a panel rendering with
 * nothing above it, not about any particular row shape.
 */
const row: Record<string, unknown> = { id: 1, name: 'Ada Lovelace' }

function resolved(id: string): ResolvedColumn<Record<string, unknown>> {
  return {
    id,
    header: id,
    visible: true,
    collapsed: false,
    order: 0,
    resolvedWidth: undefined,
    pinned: false,
    pinOffset: 0,
    sortDirection: false,
    sortIndex: 0,
    hasFilter: false,
  }
}

describe('TableDetailRow', () => {
  it('renders standalone, with no table context above it', () => {
    const wrapper = mount(TableDetailRow, {
      props: { row, columns: [resolved('name'), resolved('salary')] },
      slots: { default: () => h('p', 'two children') },
    })

    expect(wrapper.find('tr').classes()).toContain('vt-detail-row')
    expect(wrapper.find('p').text()).toBe('two children')
    wrapper.unmount()
  })

  /*
   * The span is the whole width or the `<colgroup>` below goes out of
   * alignment, so the leading and trailing columns have to be counted too.
   */
  it('spans every column, the leading and trailing ones included', () => {
    const wrapper = mount(TableDetailRow, {
      props: {
        row,
        columns: [resolved('name'), resolved('salary')],
        leading: 1,
        trailingCells: 1,
      },
    })

    expect(wrapper.find('td').attributes('colspan')).toBe('4')
    wrapper.unmount()
  })

  it('takes an explicit colspan, for a caller with no columns to count', () => {
    const wrapper = mount(TableDetailRow, { props: { row, colspan: 9 } })
    expect(wrapper.find('td').attributes('colspan')).toBe('9')
    wrapper.unmount()
  })

  /*
   * The panel stripes and indents as one line with the row above it, so both
   * come from the parent's numbers rather than from the panel's own position.
   */
  it('carries its parent row’s parity and depth', () => {
    const wrapper = mount(TableDetailRow, {
      props: { row, colspan: 1, index: 3, depth: 2, rowIndex: 12 },
    })

    const tr = wrapper.find('tr')
    expect(tr.attributes('data-parity')).toBe('even')
    expect(tr.attributes('data-depth')).toBe('2')
    expect(tr.attributes('aria-rowindex')).toBe('12')
    expect(wrapper.find('td').attributes('style')).toContain('--vtc-group-depth: 2')
    wrapper.unmount()
  })

  it('hands the slot its row', () => {
    const wrapper = mount(TableDetailRow, {
      props: { row, colspan: 1, index: 4, depth: 1 },
      slots: {
        default: (props: { row: Record<string, unknown>; index: number; depth: number }) =>
          h('span', `${String(props.row.name)} ${props.index} ${props.depth}`),
      },
    })

    expect(wrapper.find('span').text()).toBe('Ada Lovelace 4 1')
    wrapper.unmount()
  })
})
