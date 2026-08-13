import { describe, expect, it } from 'vitest'
import { compileFilter, matchesFilter, matchesSearch } from '../src/core/filters/predicates'
import { conditionsFilter, isEmptyFilter, normalizeFilter, valuesFilter } from '../src/core/filters/model'
import { toFilterValue, toIsoDate, toTime } from '../src/core/utils/values'

describe('values filter', () => {
  it('keeps everything when include is null', () => {
    expect(matchesFilter('anything', valuesFilter(null), 'text')).toBe(true)
  })

  it('keeps only listed values', () => {
    const filter = valuesFilter(['Engineering', 'Research'])
    expect(matchesFilter('Engineering', filter, 'text')).toBe(true)
    expect(matchesFilter('Support', filter, 'text')).toBe(false)
  })

  it('treats empty string, null and undefined as one blank bucket', () => {
    const including = valuesFilter(['Engineering'], true)
    const excluding = valuesFilter(['Engineering'], false)
    for (const blank of ['', null, undefined]) {
      expect(matchesFilter(blank, including, 'text')).toBe(true)
      expect(matchesFilter(blank, excluding, 'text')).toBe(false)
    }
  })

  it('excludes blanks by default — ticking values must not smuggle blanks in', () => {
    expect(matchesFilter('', valuesFilter(['Engineering']), 'text')).toBe(false)
    expect(matchesFilter(null, valuesFilter(['Engineering']), 'text')).toBe(false)
  })

  it('does not confuse the string "null" with a real blank', () => {
    const filter = valuesFilter(['null'], false)
    expect(matchesFilter('null', filter, 'text')).toBe(true)
    expect(matchesFilter(null, filter, 'text')).toBe(false)
  })

  it('matches numbers by value, not by string form', () => {
    const filter = valuesFilter([120000], false)
    expect(matchesFilter(120000, filter, 'number')).toBe(true)
    expect(matchesFilter('120000', filter, 'number')).toBe(true)
  })
})

describe('text conditions', () => {
  it('is case-insensitive', () => {
    expect(matchesFilter('Ada Lovelace', conditionsFilter([{ operator: 'contains', value: 'ADA' }]), 'text')).toBe(true)
  })

  it.each([
    ['startsWith', 'Ada', true],
    ['startsWith', 'Lovelace', false],
    ['endsWith', 'lace', true],
    ['eq', 'ada lovelace', true],
    ['neq', 'ada lovelace', false],
    ['notContains', 'zzz', true],
  ] as const)('%s %s -> %s', (operator, value, expected) => {
    expect(matchesFilter('Ada Lovelace', conditionsFilter([{ operator, value }]), 'text')).toBe(expected)
  })

  it('handles empty / notEmpty without an operand', () => {
    expect(matchesFilter('', conditionsFilter([{ operator: 'empty' }]), 'text')).toBe(true)
    expect(matchesFilter('x', conditionsFilter([{ operator: 'empty' }]), 'text')).toBe(false)
    expect(matchesFilter(null, conditionsFilter([{ operator: 'notEmpty' }]), 'text')).toBe(false)
  })

  it('excludes blanks from positive matches', () => {
    expect(matchesFilter(null, conditionsFilter([{ operator: 'contains', value: 'a' }]), 'text')).toBe(false)
  })
})

describe('number conditions', () => {
  it.each([
    ['gt', 100, true],
    ['gte', 120000, true],
    ['lt', 100, false],
    ['lte', 120000, true],
    ['eq', 120000, true],
    ['neq', 120000, false],
  ] as const)('%s %s -> %s', (operator, value, expected) => {
    expect(matchesFilter(120000, conditionsFilter([{ operator, value }]), 'number')).toBe(expected)
  })

  it('treats between as inclusive and order-independent', () => {
    const ascending = conditionsFilter([{ operator: 'between', value: 100, value2: 200 }])
    const descending = conditionsFilter([{ operator: 'between', value: 200, value2: 100 }])
    for (const filter of [ascending, descending]) {
      expect(matchesFilter(100, filter, 'number')).toBe(true)
      expect(matchesFilter(200, filter, 'number')).toBe(true)
      expect(matchesFilter(201, filter, 'number')).toBe(false)
    }
  })
})

describe('date conditions', () => {
  it('compares at calendar-day granularity', () => {
    const filter = conditionsFilter([{ operator: 'on', value: '2021-03-05' }])
    expect(matchesFilter('2021-03-05T23:59:00', filter, 'date')).toBe(true)
    expect(matchesFilter('2021-03-06T00:01:00', filter, 'date')).toBe(false)
  })

  it('parses bare YYYY-MM-DD as local midnight, not UTC', () => {
    // Date.parse would read this as UTC and shift the day west of Greenwich.
    const parsed = new Date(toTime('2021-03-05')!)
    expect(parsed.getFullYear()).toBe(2021)
    expect(parsed.getMonth()).toBe(2)
    expect(parsed.getDate()).toBe(5)
    expect(toIsoDate('2021-03-05')).toBe('2021-03-05')
  })

  it('handles before / after / between', () => {
    expect(matchesFilter('2020-01-15', conditionsFilter([{ operator: 'before', value: '2021-01-01' }]), 'date')).toBe(true)
    expect(matchesFilter('2022-01-15', conditionsFilter([{ operator: 'after', value: '2021-01-01' }]), 'date')).toBe(true)
    const between = conditionsFilter([{ operator: 'between', value: '2020-01-01', value2: '2021-12-31' }])
    expect(matchesFilter('2021-03-05', between, 'date')).toBe(true)
    expect(matchesFilter('2023-03-05', between, 'date')).toBe(false)
  })
})

describe('combining rules', () => {
  it('ands by default and ors on request', () => {
    const rules = [
      { operator: 'gt' as const, value: 100000 },
      { operator: 'lt' as const, value: 130000 },
    ]
    expect(matchesFilter(120000, conditionsFilter(rules, 'and'), 'number')).toBe(true)
    expect(matchesFilter(145000, conditionsFilter(rules, 'and'), 'number')).toBe(false)
    expect(matchesFilter(145000, conditionsFilter(rules, 'or'), 'number')).toBe(true)
  })

  it('ignores incomplete rules instead of blanking the table', () => {
    const halfTyped = conditionsFilter([{ operator: 'contains', value: '' }])
    expect(matchesFilter('anything', halfTyped, 'text')).toBe(true)
    expect(isEmptyFilter(halfTyped)).toBe(true)
    expect(normalizeFilter(halfTyped)).toBeUndefined()

    const halfRange = conditionsFilter([{ operator: 'between', value: 100 }])
    expect(matchesFilter(500, halfRange, 'number')).toBe(true)
  })
})

describe('compileFilter', () => {
  it('agrees with matchesFilter', () => {
    const filters = [
      valuesFilter(['Engineering'], false),
      valuesFilter(null),
      conditionsFilter([{ operator: 'contains', value: 'e' }]),
      conditionsFilter([{ operator: 'empty' }]),
    ]
    const samples = ['Engineering', 'Support', '', null, undefined]
    for (const filter of filters) {
      const compiled = compileFilter(filter, 'text')
      for (const sample of samples) {
        expect(compiled(sample)).toBe(matchesFilter(sample, filter, 'text'))
      }
    }
  })
})

describe('global search', () => {
  it('matches any column and ignores blanks', () => {
    expect(matchesSearch(['Ada', null, 120000], 'ada')).toBe(true)
    expect(matchesSearch(['Ada', null, 120000], '1200')).toBe(true)
    expect(matchesSearch(['Ada', null], 'zzz')).toBe(false)
  })

  it('treats an empty query as no filter', () => {
    expect(matchesSearch([null], '   ')).toBe(true)
  })
})

describe('toFilterValue', () => {
  it('normalises per column type', () => {
    expect(toFilterValue('42', 'number')).toBe(42)
    expect(toFilterValue('2021-03-05T10:00:00', 'date')).toBe('2021-03-05')
    expect(toFilterValue('yes', 'boolean')).toBe(true)
    expect(toFilterValue(7, 'text')).toBe('7')
    expect(toFilterValue('', 'text')).toBeNull()
  })
})
