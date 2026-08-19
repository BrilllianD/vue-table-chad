import { describe, expect, it } from 'vitest'
import { aggregateValue } from '../src/core/aggregation'
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

/*
 * `sortRows` projects number, date and boolean columns to a numeric key once
 * per row instead of deriving one inside the comparator on every comparison.
 * These pin the corners where the two paths could disagree — a fast path that
 * quietly reorders anything is worse than no fast path.
 */
describe('sortRows key projection', () => {
  it('orders an unparseable value exactly as the comparator did — last', () => {
    // `compareNumber` and `compareDate` both return 1 for an operand that will
    // not coerce, so a non-blank piece of nonsense sorts after everything real.
    // The projection maps it to +Infinity, which has to mean the same thing.
    const rows = [
      { id: 1, n: 5, d: '2020-01-01' },
      { id: 2, n: 'not a number', d: 'not a date' },
      { id: 3, n: 1, d: '2019-01-01' },
    ]
    const columns = [
      { id: 'n', type: 'number' as const },
      { id: 'd', type: 'date' as const },
    ]

    expect(sortRows(rows, [{ columnId: 'n', direction: 'asc' }], columns).map((r) => r.id)).toEqual([
      3, 1, 2,
    ])
    expect(sortRows(rows, [{ columnId: 'd', direction: 'asc' }], columns).map((r) => r.id)).toEqual([
      3, 1, 2,
    ])
  })

  it('ties two unparseable values rather than producing NaN', () => {
    // Both project to +Infinity. Subtracting them would give NaN and leave the
    // order at the mercy of the engine's sort; comparing makes it a tie, so the
    // incoming order stands.
    const rows = [
      { id: 1, n: 'x' },
      { id: 2, n: 'y' },
      { id: 3, n: 2 },
    ]
    const columns = [{ id: 'n', type: 'number' as const }]
    expect(sortRows(rows, [{ columnId: 'n', direction: 'asc' }], columns).map((r) => r.id)).toEqual([
      3, 1, 2,
    ])
  })

  it('sorts booleans false before true, blanks aside', () => {
    const rows = [
      { id: 1, ok: true },
      { id: 2, ok: false },
      { id: 3, ok: true },
    ]
    const columns = [{ id: 'ok', type: 'boolean' as const }]
    expect(sortRows(rows, [{ columnId: 'ok', direction: 'asc' }], columns).map((r) => r.id)).toEqual(
      [2, 1, 3],
    )
    expect(
      sortRows(rows, [{ columnId: 'ok', direction: 'desc' }], columns).map((r) => r.id),
    ).toEqual([1, 3, 2])
  })

  it('leaves a custom comparator in charge of its own column', () => {
    // The projection must not shadow an override, or a column sorting by a
    // bespoke rule would silently start sorting numerically.
    const order = ['medium', 'low', 'high']
    const rows = [{ size: 'high' }, { size: 'low' }, { size: 'medium' }]
    const columns = [
      {
        id: 'size',
        type: 'number' as const,
        comparator: (a: unknown, b: unknown) => order.indexOf(String(a)) - order.indexOf(String(b)),
      },
    ]
    expect(
      sortRows(rows, [{ columnId: 'size', direction: 'asc' }], columns).map((r) => r.size),
    ).toEqual(['medium', 'low', 'high'])
  })

  it('reads an accessor once per row, not once per comparison', () => {
    let reads = 0
    const rows = Array.from({ length: 40 }, (_, i) => ({ nested: { n: 40 - i } }))
    const columns = [
      {
        id: 'n',
        type: 'number' as const,
        accessor: (row: { nested: { n: number } }) => {
          reads += 1
          return row.nested.n
        },
      },
    ]

    sortRows(rows, [{ columnId: 'n', direction: 'asc' }], columns)
    // Comparisons run O(n log n) times; cells number exactly n.
    expect(reads).toBe(rows.length)
  })
})

describe('aggregate extremes use the same ordering as the sort', () => {
  it('reports the earliest date, blanks skipped', () => {
    const rows = [
      { id: 1, d: '2021-06-01' },
      { id: 2, d: null },
      { id: 3, d: '2019-02-14' },
      { id: 4, d: '2020-01-01' },
    ]
    const column = { id: 'd', type: 'date' as const, aggregate: 'min' as const }
    const result = aggregateValue(rows, column)
    expect(result?.value).toBe('2019-02-14')
    expect(result?.row).toBe(rows[2])
    expect(result?.sampleCount).toBe(3)
  })

  it('counts an unparseable value and still lets it win a max', () => {
    // Exactly what the comparator did before the projection: a non-blank value
    // that will not coerce counts as a sample and sorts above everything. Odd,
    // but it is the established behaviour and the fast path must not change it.
    const rows = [{ id: 1, n: 10 }, { id: 2, n: 'junk' }, { id: 3, n: 2 }]
    const column = { id: 'n', type: 'number' as const, aggregate: 'max' as const }
    const result = aggregateValue(rows, column)
    expect(result?.value).toBe('junk')
    expect(result?.sampleCount).toBe(3)
  })

  it('still defers to a custom comparator', () => {
    const order = ['medium', 'low', 'high']
    const rows = [{ size: 'high' }, { size: 'low' }, { size: 'medium' }]
    const column = {
      id: 'size',
      type: 'number' as const,
      aggregate: 'min' as const,
      comparator: (a: unknown, b: unknown) => order.indexOf(String(a)) - order.indexOf(String(b)),
    }
    expect(aggregateValue(rows, column)?.value).toBe('medium')
  })
})
