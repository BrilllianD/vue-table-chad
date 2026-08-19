import { describe, expect, it } from 'vitest'
import { makeRows } from '@fixtures'

/**
 * The fixture underpins every benchmark, so its determinism is not a nicety:
 * a generator that drifted between runs would turn every bench delta into
 * noise and every perf regression into a coin flip.
 */
describe('makeRows', () => {
  it('produces byte-identical rows across calls', () => {
    expect(makeRows(500)).toEqual(makeRows(500))
  })

  it('produces the same prefix at every size', () => {
    // What lets 10k and 100k be read as one workload at two scales rather than
    // as two unrelated datasets.
    const small = makeRows(1_000)
    const large = makeRows(10_000)
    expect(large.slice(0, 1_000)).toEqual(small)
  })

  it('generates the row count it was asked for', () => {
    expect(makeRows(0)).toHaveLength(0)
    expect(makeRows(37)).toHaveLength(37)
    expect(makeRows()).toHaveLength(10_000)
  })

  it('keeps the shapes the pipeline is meant to be exercised by', () => {
    const rows = makeRows(2_000)
    // Both kinds of blank, a nested value, and an array cell — the cases a
    // fixture of tidy rows would quietly stop covering.
    expect(rows.some((row) => row.department === '')).toBe(true)
    expect(rows.some((row) => row.salary === null)).toBe(true)
    expect(rows.some((row) => row.hiredAt === null)).toBe(true)
    expect(rows.every((row) => typeof row.location.city === 'string')).toBe(true)
    expect(rows.some((row) => row.tags.length > 0)).toBe(true)
  })
})
