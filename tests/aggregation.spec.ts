import { describe, expect, it } from 'vitest'
import {
  aggregateGroups,
  aggregateRow,
  aggregateValue,
  formatAggregate,
} from '../src/core/aggregation'
import { ROOT_GROUP_KEY, groupPathKey } from '../src/core/grouping'
import type { ColumnDef } from '../src/core/types'
import { people, personColumns, type Person } from './fixtures'

function column(id: string, extra: Partial<ColumnDef<Person>> = {}): ColumnDef<Person> {
  return { ...personColumns.find((entry) => entry.id === id)!, ...extra }
}

const engineering = people.filter((row) => row.department === 'Engineering')
const research = people.filter((row) => row.department === 'Research')

describe('aggregateValue', () => {
  it('returns nothing for a column that declares no aggregate', () => {
    expect(aggregateValue(people, column('salary'))).toBeUndefined()
  })

  it('sums a column', () => {
    const result = aggregateValue(engineering, column('salary', { aggregate: 'sum' }))!
    expect(result).toMatchObject({ fn: 'sum', value: 265000, sampleCount: 2 })
  })

  it('skips blanks, and divides an average by what actually contributed', () => {
    // Research is Alan Turing (130000) and Katherine Johnson (null).
    const result = aggregateValue(research, column('salary', { aggregate: 'avg' }))!
    expect(result.value).toBe(130000)
    // Two rows, one number: the mean is over the number, not over the rows.
    expect(result.sampleCount).toBe(1)
  })

  it('reports null rather than zero when nothing was aggregable', () => {
    // A sum of nothing is not 0 — that would claim every row contributed and
    // they happened to cancel out.
    const blank = [{ ...people[3]! }]
    const result = aggregateValue(blank, column('salary', { aggregate: 'sum' }))!
    expect(result.value).toBeNull()
    expect(result.sampleCount).toBe(0)

    const avg = aggregateValue(blank, column('salary', { aggregate: 'avg' }))!
    expect(avg.value).toBeNull()
    expect(Number.isNaN(avg.value as number)).toBe(false)
  })

  it('reports null for min/max over an empty set', () => {
    const result = aggregateValue([], column('salary', { aggregate: 'min' }))!
    expect(result).toMatchObject({ fn: 'min', value: null, sampleCount: 0 })
    expect(result.row).toBeUndefined()
  })

  it('returns the winning cell and its row for min and max', () => {
    const min = aggregateValue(people, column('salary', { aggregate: 'min' }))!
    expect(min.value).toBe(60000)
    expect((min.row as Person).name).toBe('Item 10')

    const max = aggregateValue(people, column('salary', { aggregate: 'max' }))!
    expect(max.value).toBe(150000)
    expect((max.row as Person).name).toBe('Barbara Liskov')
  })

  it('keeps a date column a date rather than a timestamp', () => {
    const result = aggregateValue(people, column('hiredAt', { aggregate: 'min' }))!
    // The cell's own value, so the column's `format` can still render it.
    expect(result.value).toBe('2018-05-09')
    expect((result.row as Person).name).toBe('Barbara Liskov')
    // The blank `hiredAt` on Item 10 is skipped, not treated as the earliest.
    expect(result.sampleCount).toBe(6)
  })

  it('honours a column comparator, the same way sorting does', () => {
    // Reversed: the "smallest" is now the highest-paid.
    const reversed = column('salary', {
      aggregate: 'min',
      comparator: (a, b) => (b as number) - (a as number),
    })
    expect(aggregateValue(people, reversed)!.value).toBe(150000)
  })

  it('counts booleans as numbers, since toNumber already does', () => {
    const result = aggregateValue(people, column('active', { aggregate: 'sum' }))!
    expect(result.value).toBe(5)
  })
})

describe('aggregateRow', () => {
  it('covers every declared column and skips the rest', () => {
    const columns = [
      column('name'),
      column('salary', { aggregate: 'sum' }),
      column('hiredAt', { aggregate: 'max' }),
    ]
    const result = aggregateRow(engineering, columns)
    expect(Object.keys(result).sort()).toEqual(['hiredAt', 'salary'])
    expect(result.salary!.value).toBe(265000)
    expect(result.hiredAt!.value).toBe('2021-03-05')
  })

  it('is empty when no column declares one', () => {
    expect(aggregateRow(people, personColumns)).toEqual({})
  })
})

describe('aggregateGroups', () => {
  const columns = [
    column('department'),
    column('salary', { aggregate: 'sum' }),
    column('active'),
  ]

  it('keys buckets the way RowGroup does, at every depth', () => {
    const result = aggregateGroups(people, ['department', 'active'], columns)
    expect(result.get(groupPathKey(['Engineering']))!.salary!.value).toBe(265000)
    expect(result.get(groupPathKey(['Engineering', true]))!.salary!.value).toBe(265000)
    expect(result.get(groupPathKey(['Research', false]))!.salary!.value).toBe(130000)
    // The blank department is a bucket like any other.
    expect(result.get(groupPathKey([null]))!.salary!.value).toBe(150000)
  })

  it('carries the whole set under the root key', () => {
    const result = aggregateGroups(people, ['department'], columns)
    expect(result.get(ROOT_GROUP_KEY)!.salary!.value).toBe(670000)
  })

  it('still answers the root when nothing is grouped', () => {
    const result = aggregateGroups(people, [], columns)
    expect(result.get(ROOT_GROUP_KEY)!.salary!.value).toBe(670000)
    expect(result.size).toBe(1)
  })

  it('is empty when no column declares an aggregate', () => {
    expect(aggregateGroups(people, ['department'], personColumns).size).toBe(0)
  })

  it('ignores a groupBy naming a column that no longer exists', () => {
    const result = aggregateGroups(people, ['nope'], columns)
    expect(result.size).toBe(1)
    expect(result.get(ROOT_GROUP_KEY)!.salary!.value).toBe(670000)
  })
})

describe('formatAggregate', () => {
  it('prefers aggregateFormat', () => {
    const salary = column('salary', {
      aggregate: 'sum',
      aggregateFormat: (result) => `$${result.value} over ${result.sampleCount}`,
    })
    expect(formatAggregate(aggregateValue(engineering, salary)!, salary)).toBe(
      '$265000 over 2',
    )
  })

  it('falls back to format for a min/max, which knows its row', () => {
    const hired = column('hiredAt', {
      aggregate: 'min',
      format: (value) => `hired ${String(value)}`,
    })
    expect(formatAggregate(aggregateValue(people, hired)!, hired)).toBe('hired 2018-05-09')
  })

  it('does not reach for format on a sum, which has no row to hand it', () => {
    const salary = column('salary', {
      aggregate: 'sum',
      format: (value) => `never ${String(value)}`,
    })
    const text = formatAggregate(aggregateValue(engineering, salary)!, salary)
    expect(text).not.toContain('never')
    // Grouped thousands from the shared Intl formatter.
    expect(text.replace(/\D/g, '')).toBe('265000')
  })

  it('renders an empty aggregate as empty text, not "null"', () => {
    const salary = column('salary', { aggregate: 'sum' })
    expect(formatAggregate(aggregateValue([], salary)!, salary)).toBe('')
  })

  it('rounds an average rather than printing its full expansion', () => {
    const rating = { id: 'r', type: 'number', aggregate: 'avg' } as ColumnDef<{ r: number }>
    const rows = [{ r: 1 }, { r: 2 }, { r: 2 }]
    expect(formatAggregate(aggregateValue(rows, rating)!, rating)).toBe('1.67')
  })
})
