import { describe, expect, it } from 'vitest'
import {
  countGroups,
  flattenGroups,
  groupPathKey,
  groupSortRules,
  groupValueOf,
  groupedSort,
} from '../src/core/grouping'
import { sortRows } from '../src/core/sorting'
import type { ColumnDef, DisplayRow } from '../src/core/types'
import { names, people, personColumns, type Person } from './fixtures'

/** The shape a grouped body renders as, flattened to strings for comparison. */
function outline(items: DisplayRow<Person>[]): string[] {
  return items.map((item) =>
    item.kind === 'group'
      ? `${'  '.repeat(item.group.depth)}[${item.group.label}] ${item.group.count}`
      : `${'  '.repeat(item.depth)}${item.row.name}`,
  )
}

/** Rows ordered the way a group-aware data source would deliver them. */
function grouped(groupBy: string[], sort: { columnId: string; direction: 'asc' | 'desc' }[] = []) {
  return sortRows(people, groupedSort(sort, groupBy), personColumns)
}

describe('groupedSort', () => {
  it('is the sort unchanged when nothing is grouped', () => {
    const sort = [{ columnId: 'name', direction: 'asc' as const }]
    expect(groupedSort(sort, [])).toEqual(sort)
  })

  it('puts grouped columns first, in grouping order', () => {
    expect(groupedSort([{ columnId: 'name', direction: 'asc' }], ['department', 'active'])).toEqual([
      { columnId: 'department', direction: 'asc' },
      { columnId: 'active', direction: 'asc' },
      { columnId: 'name', direction: 'asc' },
    ])
  })

  it('keeps the direction a grouped column was already sorted by', () => {
    // Clicking a grouped header to flip it has to flip the order the groups
    // come out in, not silently do nothing.
    expect(groupedSort([{ columnId: 'department', direction: 'desc' }], ['department'])).toEqual([
      { columnId: 'department', direction: 'desc' },
    ])
  })

  it('does not leave a grouped column duplicated further down the sort', () => {
    const result = groupedSort(
      [
        { columnId: 'salary', direction: 'desc' },
        { columnId: 'department', direction: 'asc' },
      ],
      ['department'],
    )
    expect(result.filter((rule) => rule.columnId === 'department')).toHaveLength(1)
    expect(result[0]).toEqual({ columnId: 'department', direction: 'asc' })
  })
})

describe('groupSortRules', () => {
  it('is the leading part of groupedSort, without the user keys', () => {
    const sort = [
      { columnId: 'department', direction: 'desc' as const },
      { columnId: 'salary', direction: 'asc' as const },
    ]
    expect(groupSortRules(sort, ['department'])).toEqual([
      { columnId: 'department', direction: 'desc' },
    ])
    // Dropping the user keys is the point: sorting by these alone gathers rows
    // into bands and leaves the order inside each band as it arrived.
    expect(groupedSort(sort, ['department']).slice(0, 1)).toEqual(
      groupSortRules(sort, ['department']),
    )
  })

  it('gathers bands while preserving the incoming order inside them', () => {
    const byName = sortRows(people, [{ columnId: 'name', direction: 'asc' }], personColumns)
    const banded = sortRows(byName, groupSortRules([], ['department']), personColumns)
    expect(banded.map((row) => row.department)).toEqual([
      'Engineering',
      'Engineering',
      'Research',
      'Research',
      'Support',
      'Support',
      '',
    ])
    expect(names(banded).slice(0, 2)).toEqual(['Ada Lovelace', 'Grace Hopper'])
  })
})

describe('groupPathKey', () => {
  it('separates levels so concatenated values cannot collide', () => {
    expect(groupPathKey(['a', 'b'])).not.toBe(groupPathKey(['astring:b']))
  })

  it('does not let a blank collide with the string "null"', () => {
    expect(groupPathKey([null])).not.toBe(groupPathKey(['null']))
  })
})

describe('groupValueOf', () => {
  it('collapses every flavour of blank into one bucket', () => {
    const column: ColumnDef<Person> = { id: 'department' }
    expect(groupValueOf({ department: '' } as unknown as Person, column)).toBeNull()
    expect(groupValueOf({ department: null } as unknown as Person, column)).toBeNull()
    expect(groupValueOf({} as unknown as Person, column)).toBeNull()
  })

  it('prefers an explicit groupValue over the cell', () => {
    const column: ColumnDef<Person> = {
      id: 'hiredAt',
      type: 'date',
      groupValue: (row) => row.hiredAt?.slice(0, 4) ?? null,
    }
    expect(groupValueOf(people[0]!, column)).toBe('2021')
  })
})

describe('flattenGroups', () => {
  it('returns plain rows when nothing is grouped', () => {
    const items = flattenGroups(people, [], personColumns)
    expect(items).toHaveLength(people.length)
    expect(items.every((item) => item.kind === 'row')).toBe(true)
    expect(items.every((item) => item.kind === 'row' && item.depth === 0)).toBe(true)
  })

  it('emits a header per group, with its rows beneath it', () => {
    // Blanks sink to the bottom, the same way `sortRows` puts them there — a
    // grouped table must not float "no department" to the top of the list.
    expect(outline(flattenGroups(grouped(['department']), ['department'], personColumns))).toEqual([
      '[Engineering] 2',
      '  Ada Lovelace',
      '  Grace Hopper',
      '[Research] 2',
      '  Alan Turing',
      '  Katherine Johnson',
      '[Support] 2',
      '  Item 10',
      '  Item 2',
      '[Blank] 1',
      '  Barbara Liskov',
    ])
  })

  it('nests a second level inside the first', () => {
    const rows = grouped(['department', 'active'])
    const items = flattenGroups(rows, ['department', 'active'], personColumns)
    expect(outline(items)).toEqual([
      '[Engineering] 2',
      '  [true] 2',
      '    Ada Lovelace',
      '    Grace Hopper',
      '[Research] 2',
      '  [false] 1',
      '    Alan Turing',
      '  [true] 1',
      '    Katherine Johnson',
      '[Support] 2',
      '  [false] 1',
      '    Item 10',
      '  [true] 1',
      '    Item 2',
      '[Blank] 1',
      '  [true] 1',
      '    Barbara Liskov',
    ])
  })

  it('hides a collapsed group’s rows and its subgroups, but not its header', () => {
    const rows = grouped(['department', 'active'])
    const engineering = flattenGroups(rows, ['department', 'active'], personColumns).find(
      (item) => item.kind === 'group' && item.group.label === 'Engineering',
    )
    const key = engineering!.kind === 'group' ? engineering!.group.key : ''

    const items = flattenGroups(rows, ['department', 'active'], personColumns, {
      isCollapsed: (candidate) => candidate === key,
    })
    const lines = outline(items)
    expect(lines).toContain('[Engineering] 2')
    expect(lines).not.toContain('    Ada Lovelace')
    // The nested level goes with it: the line after the header is already the
    // next department, not Engineering's own `active` subgroup.
    expect(lines[lines.indexOf('[Engineering] 2') + 1]).toBe('[Research] 2')
    // Every other department is untouched.
    expect(lines).toContain('    Alan Turing')
    expect(lines).toContain('    Barbara Liskov')
  })

  it('labels a group through format, and a blank through blankLabel', () => {
    const columns: ColumnDef<Person>[] = [
      { id: 'department', format: (value) => `Dept ${String(value)}` },
    ]
    const items = flattenGroups(grouped(['department']), ['department'], columns, {
      blankLabel: 'No department',
    })
    const labels = items.filter((item) => item.kind === 'group').map((item) => item.group.label)
    expect(labels).toEqual(['Dept Engineering', 'Dept Research', 'Dept Support', 'No department'])
  })

  it('prefers groupLabel, and skips format when groupValue is overridden', () => {
    const columns: ColumnDef<Person>[] = [
      {
        id: 'hiredAt',
        type: 'date',
        format: () => 'never used',
        groupValue: (row) => row.hiredAt?.slice(0, 4) ?? null,
        groupLabel: (value) => `Class of ${String(value)}`,
      },
    ]
    const rows = grouped(['hiredAt'])
    const labels = flattenGroups(rows, ['hiredAt'], columns)
      .filter((item) => item.kind === 'group')
      .map((item) => item.group.label)
    expect(labels).toContain('Class of 2021')
    expect(labels).not.toContain('never used')
  })

  it('takes true counts from `totals` when a source supplies them', () => {
    // A page holding only the first of Engineering's two rows.
    const page = grouped(['department']).slice(0, 1)
    const totals = countGroups(people, ['department'], personColumns)
    const items = flattenGroups(page, ['department'], personColumns, { totals })
    const engineering = items.find(
      (item) => item.kind === 'group' && item.group.label === 'Engineering',
    )
    expect(engineering!.kind === 'group' && engineering!.group.count).toBe(1)
    // Only one Engineering row fits on this slice, but the group holds two.
    expect(engineering!.kind === 'group' && engineering!.group.totalCount).toBe(2)
  })

  it('reports each row’s position among rows, not among rendered lines', () => {
    const items = flattenGroups(grouped(['department']), ['department'], personColumns)
    const indexes = items.filter((item) => item.kind === 'row').map((item) => item.index)
    expect(indexes).toEqual([0, 1, 2, 3, 4, 5, 6])
  })

  it('ignores a groupBy naming a column that no longer exists', () => {
    const items = flattenGroups(people, ['nope'], personColumns)
    expect(items.every((item) => item.kind === 'row')).toBe(true)
  })

  it('buckets by value even when the rows arrive unsorted', () => {
    // Group-key sorting is what makes runs contiguous; without it a naive
    // run-detector would emit one header per run rather than one per value.
    const items = flattenGroups(people, ['department'], personColumns)
    const headers = items.filter((item) => item.kind === 'group')
    expect(headers).toHaveLength(4)
  })
})

describe('countGroups', () => {
  it('counts every level of the path', () => {
    const counts = countGroups(people, ['department', 'active'], personColumns)
    expect(counts.get(groupPathKey(['Engineering']))).toBe(2)
    expect(counts.get(groupPathKey(['Engineering', true]))).toBe(2)
    expect(counts.get(groupPathKey(['Research', false]))).toBe(1)
    expect(counts.get(groupPathKey([null]))).toBe(1)
  })

  it('is empty when nothing is grouped', () => {
    expect(countGroups(people, [], personColumns).size).toBe(0)
  })
})
