import { describe, expect, it } from 'vitest'
import { applySortRule, nextDirection, sortRows } from '../src/core/sorting'
import { names, people, personColumns, type Person } from './fixtures'

describe('nextDirection', () => {
  it('cycles asc -> desc -> off', () => {
    expect(nextDirection(false)).toBe('asc')
    expect(nextDirection('asc')).toBe('desc')
    expect(nextDirection('desc')).toBe(false)
  })
})

describe('applySortRule', () => {
  it('replaces the whole sort on a plain click', () => {
    const sort = [{ columnId: 'name', direction: 'asc' as const }]
    expect(applySortRule(sort, 'salary', 'desc', false)).toEqual([
      { columnId: 'salary', direction: 'desc' },
    ])
  })

  it('appends on shift-click and keeps the order the user built', () => {
    let sort = applySortRule([], 'department', 'asc', true)
    sort = applySortRule(sort, 'salary', 'desc', true)
    expect(sort).toEqual([
      { columnId: 'department', direction: 'asc' },
      { columnId: 'salary', direction: 'desc' },
    ])
  })

  it('flips an existing key in place rather than moving it to the end', () => {
    const sort = [
      { columnId: 'department', direction: 'asc' as const },
      { columnId: 'salary', direction: 'asc' as const },
    ]
    expect(applySortRule(sort, 'department', 'desc', true)).toEqual([
      { columnId: 'department', direction: 'desc' },
      { columnId: 'salary', direction: 'asc' },
    ])
  })

  it('removes a key when its direction cycles off', () => {
    const sort = [
      { columnId: 'department', direction: 'asc' as const },
      { columnId: 'salary', direction: 'asc' as const },
    ]
    expect(applySortRule(sort, 'department', false, true)).toEqual([
      { columnId: 'salary', direction: 'asc' },
    ])
  })
})

describe('sortRows', () => {
  it('returns a new array and leaves the input alone', () => {
    const input = people.slice()
    const output = sortRows(input, [{ columnId: 'name', direction: 'asc' }], personColumns)
    expect(output).not.toBe(input)
    expect(names(input)).toEqual(names(people))
  })

  it('sorts text naturally: "Item 2" before "Item 10"', () => {
    const sorted = sortRows(people, [{ columnId: 'name', direction: 'asc' }], personColumns)
    const items = names(sorted).filter((name) => name.startsWith('Item'))
    expect(items).toEqual(['Item 2', 'Item 10'])
  })

  it('sorts numbers numerically', () => {
    const sorted = sortRows(people, [{ columnId: 'salary', direction: 'asc' }], personColumns)
    const salaries = sorted.map((row) => row.salary).filter((s): s is number => s !== null)
    expect(salaries).toEqual([...salaries].sort((a, b) => a - b))
  })

  it('sorts dates chronologically, not lexically', () => {
    const sorted = sortRows(people, [{ columnId: 'hiredAt', direction: 'asc' }], personColumns)
    const dates = sorted.map((row) => row.hiredAt).filter((d): d is string => d !== null)
    expect(dates[0]).toBe('2018-05-09')
    expect(dates.at(-1)).toBe('2023-02-28')
  })

  it('keeps blanks at the bottom in BOTH directions', () => {
    const ascending = sortRows(people, [{ columnId: 'salary', direction: 'asc' }], personColumns)
    const descending = sortRows(people, [{ columnId: 'salary', direction: 'desc' }], personColumns)
    expect(ascending.at(-1)!.salary).toBeNull()
    expect(descending.at(-1)!.salary).toBeNull()
  })

  it('honours nullsLast: false', () => {
    const sorted = sortRows(people, [{ columnId: 'salary', direction: 'asc' }], personColumns, {
      nullsLast: false,
    })
    expect(sorted[0]!.salary).toBeNull()
  })

  it('applies multi-sort keys in order', () => {
    const sorted = sortRows(
      people,
      [
        { columnId: 'department', direction: 'asc' },
        { columnId: 'salary', direction: 'desc' },
      ],
      personColumns,
    )
    const engineering = sorted.filter((row) => row.department === 'Engineering')
    expect(names(engineering)).toEqual(['Grace Hopper', 'Ada Lovelace'])
    // Departments themselves stay grouped and ascending (blank department last).
    const departments = sorted.map((row) => row.department).filter((d) => d !== '')
    expect(departments).toEqual([...departments].sort())
  })

  it('is stable for ties', () => {
    const tied: Person[] = [
      { ...people[0]!, id: 1, name: 'A', salary: 100 },
      { ...people[0]!, id: 2, name: 'B', salary: 100 },
      { ...people[0]!, id: 3, name: 'C', salary: 100 },
    ]
    const sorted = sortRows(tied, [{ columnId: 'salary', direction: 'desc' }], personColumns)
    expect(sorted.map((row) => row.id)).toEqual([1, 2, 3])
  })

  it('ignores sort rules pointing at unknown columns', () => {
    const sorted = sortRows(people, [{ columnId: 'nope', direction: 'asc' }], personColumns)
    expect(names(sorted)).toEqual(names(people))
  })

  it('uses a custom comparator when given', () => {
    const byLength = [{ id: 'name', type: 'text' as const, comparator: (a: unknown, b: unknown) => String(a).length - String(b).length }]
    const sorted = sortRows(people, [{ columnId: 'name', direction: 'asc' }], byLength)
    expect(sorted[0]!.name).toBe('Item 2')
  })
})
