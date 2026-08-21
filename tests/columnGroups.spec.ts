import { describe, expect, it } from 'vitest'
import { buildHeaderRows, columnGroupPath } from '../src/core/columnGroups'
import type { ColumnGroupDef, HeaderRow, PinSide, ResolvedColumn } from '../src/core/types'
import { groupedPersonColumns, personColumnGroups, type Person } from './fixtures'

/**
 * A column as `useColumns().visible` would hand it over. Written out here
 * rather than run through `useColumns`, because these tests are about the
 * builder's arithmetic and nothing else — a header row is wrong or right for
 * the list it was given.
 */
function resolved(
  id: string,
  group?: string,
  extra: Partial<ResolvedColumn<Person>> = {},
): ResolvedColumn<Person> {
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
    ...extra,
  }
}

/** Compact shape of a row, so an expectation reads like the header looks. */
function shape(row: HeaderRow<Person>): string[] {
  return row.map((cell) =>
    cell.kind === 'group'
      ? `${cell.group.id}:${cell.colspan}`
      : `${cell.column.id}^${cell.rowspan}`,
  )
}

describe('columnGroupPath', () => {
  it('walks parent links outermost first', () => {
    const path = columnGroupPath({ id: 'salary', group: 'money' }, personColumnGroups)
    expect(path.map((group) => group.id)).toEqual(['record', 'money'])
  })

  it('resolves a band nobody declared, headed by its own id', () => {
    const path = columnGroupPath({ id: 'salary', group: 'mystery' }, personColumnGroups)
    expect(path).toEqual([{ id: 'mystery' }])
  })

  it('returns an empty path for a column in no band', () => {
    expect(columnGroupPath({ id: 'active' }, personColumnGroups)).toEqual([])
  })

  it('truncates a parent cycle rather than hanging', () => {
    const cyclic: ColumnGroupDef[] = [
      { id: 'a', parent: 'b' },
      { id: 'b', parent: 'a' },
    ]
    // The guarantee is termination; which end it stops at is an implementation
    // detail, so this asserts only that the path is finite and holds each once.
    const path = columnGroupPath({ id: 'x', group: 'a' }, cyclic)
    expect(path.map((group) => group.id).sort()).toEqual(['a', 'b'])
  })
})

describe('buildHeaderRows', () => {
  it('returns a single flat row when no column declares a band', () => {
    const rows = buildHeaderRows([resolved('name'), resolved('salary')])

    expect(rows).toHaveLength(1)
    // The pre-band shape, which every existing spec and demo view still asserts
    // against: one cell per column, spanning one row.
    expect(shape(rows[0]!)).toEqual(['name^1', 'salary^1'])
  })

  it('spans a band over its columns and drops the leaves to the row below', () => {
    const rows = buildHeaderRows(
      [resolved('name', 'identity'), resolved('department', 'identity'), resolved('active')],
      personColumnGroups,
    )

    expect(rows).toHaveLength(2)
    // `active` is in no band, so it is placed in row 0 and spans both rows —
    // otherwise row 1 would be a cell short and the grid would shear.
    expect(shape(rows[0]!)).toEqual(['identity:2', 'active^2'])
    expect(shape(rows[1]!)).toEqual(['name^1', 'department^1'])
  })

  it('builds a three-row header from a nested band', () => {
    const columns = groupedPersonColumns.map((column) => resolved(column.id, column.group))
    const rows = buildHeaderRows(columns, personColumnGroups)

    expect(rows).toHaveLength(3)
    expect(shape(rows[0]!)).toEqual(['identity:2', 'record:2', 'active^3'])
    // `hiredAt` sits directly under `record`, one level shallower than `salary`,
    // so it is placed here and spans down past the `money` row.
    expect(shape(rows[1]!)).toEqual(['name^2', 'department^2', 'money:1', 'hiredAt^2'])
    expect(shape(rows[2]!)).toEqual(['salary^1'])
  })

  it('emits one cell per run when a reorder splits a band', () => {
    const rows = buildHeaderRows(
      [resolved('name', 'identity'), resolved('active'), resolved('department', 'identity')],
      personColumnGroups,
    )

    // Two separate cells with the same label, rather than one cell spanning a
    // column that is not its own. The header describes the order that exists.
    expect(shape(rows[0]!)).toEqual(['identity:1', 'active^2', 'identity:1'])
    expect(rows[0]![0]!.key).not.toBe(rows[0]![2]!.key)
  })

  it('splits a band across the pin boundary', () => {
    const pinned = (id: string, side: PinSide | false, pinOffset = 0) =>
      resolved(id, 'identity', { pinned: side, pinOffset })

    const rows = buildHeaderRows(
      [pinned('name', 'left'), pinned('department', false), pinned('active', 'right')],
      personColumnGroups,
    )

    // `visible` hoists pinned columns to the edges, so these three are already
    // three runs on screen; one spanning cell would stretch across the scroll
    // gap between them.
    expect(shape(rows[0]!)).toEqual(['identity:1', 'identity:1', 'identity:1'])
    expect(rows[0]!.map((cell) => cell.kind === 'group' && cell.pinned)).toEqual([
      'left',
      false,
      'right',
    ])
  })

  it('takes a right-pinned band offset from its last member', () => {
    const rows = buildHeaderRows(
      [
        resolved('hiredAt', 'identity', { pinned: 'right', pinOffset: 100 }),
        resolved('active', 'identity', { pinned: 'right', pinOffset: 0 }),
      ],
      personColumnGroups,
    )

    const cell = rows[0]![0]!
    expect(cell.kind).toBe('group')
    // Right-pinned offsets accumulate from the far edge inwards, so the band
    // sticks at its rightmost column's offset, not its leftmost.
    expect(cell.kind === 'group' && cell.pinOffset).toBe(0)
  })

  it('never merges two bands that share an id under different parents', () => {
    const groups: ColumnGroupDef[] = [
      { id: 'left', header: 'Left' },
      { id: 'right', header: 'Right' },
      { id: 'detail-l', header: 'Detail', parent: 'left' },
      { id: 'detail-r', header: 'Detail', parent: 'right' },
    ]
    const rows = buildHeaderRows(
      [resolved('a', 'detail-l'), resolved('b', 'detail-r')],
      groups,
    )

    expect(shape(rows[0]!)).toEqual(['left:1', 'right:1'])
    expect(shape(rows[1]!)).toEqual(['detail-l:1', 'detail-r:1'])
  })

  it('gives every row the same column count once spans are counted', () => {
    const columns = groupedPersonColumns.map((column) => resolved(column.id, column.group))
    const rows = buildHeaderRows(columns, personColumnGroups)

    // The invariant the whole grid rests on: read down any header row, adding
    // each cell's colspan plus every span reaching into it from above, and you
    // must arrive at the column count. A row that does not is a sheared table.
    for (let level = 0; level < rows.length; level += 1) {
      let width = 0
      for (const row of rows.slice(0, level + 1)) {
        for (const cell of row) {
          const reaches = cell.kind === 'group' ? cell.depth === level : cell.depth + cell.rowspan > level
          if (reaches) width += cell.kind === 'group' ? cell.colspan : 1
        }
      }
      expect(width).toBe(columns.length)
    }
  })

  it('handles an empty column list', () => {
    expect(buildHeaderRows<Person>([], personColumnGroups)).toEqual([[]])
  })
})
