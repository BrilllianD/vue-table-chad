import { describe, expect, it } from 'vitest'
import { DEFAULT_LABELS, type TableLabels } from '../src/core/labels'
import { es, ja, ru, zhCN } from '../src/locales'

/**
 * The ratchet on the shipped locales: each one is a *whole* record.
 *
 * The type already says so for the flat keys — `const ru: TableLabels` fails to
 * compile with one missing — but not for the two nested maps, where a missing
 * operator is `undefined` at render time rather than a type error, and not for
 * a key that was filled in with the English it was supposed to replace. Both
 * are the failure a locale must not have: a table rendering half a language
 * with nothing saying which half.
 *
 * Named rather than counted, in the style of `tests/apiSurface.spec.ts`: a
 * failure says which locale and which key.
 */

const LOCALES: Array<[name: string, labels: TableLabels]> = [
  ['ru', ru],
  ['es', es],
  ['ja', ja],
  ['zhCN', zhCN],
]

/**
 * Sample arguments for every key that is a function, by arity and meaning.
 *
 * `pinState` is deliberately absent: its argument is a side that the locale is
 * *supposed* to translate, so the "did it interpolate what it was handed" check
 * would read a correct translation as a dropped argument. It has its own test.
 */
const SAMPLES: Record<string, unknown[]> = {
  clearFilterOn: ['Salary'],
  filterChip: ['Salary', '3 values'],
  filterColumn: ['Salary'],
  resizeColumn: ['Salary'],
  pinColumn: ['Salary'],
  showColumn: ['Salary'],
  groupByColumn: ['Salary'],
  stopGroupingBy: ['Salary'],
  sortByColumn: ['Salary'],
  editCell: ['Salary'],
  searchIn: ['Salary'],
  valueCount: [3],
  rowRange: [1, 10, 240],
  pageSizeOption: [25],
  selectedCount: [3],
  allMatchingSelected: [240],
  allOnPageSelected: [10],
  selectAllMatching: [240],
  expandGroup: ['Department', 'Design'],
  collapseGroup: ['Department', 'Design'],
  expandBand: ['Identity'],
  collapseBand: ['Identity'],
  expandColumnGroups: ['Department'],
  collapseColumnGroups: ['Department'],
}

describe('shipped locales', () => {
  it('gives every locale every key the default record has', () => {
    const missing: string[] = []

    for (const [name, labels] of LOCALES) {
      for (const key of Object.keys(DEFAULT_LABELS)) {
        if (!(key in labels)) missing.push(`${name}: ${key}`)
      }
    }

    expect(missing, 'shipped locales missing a key of DEFAULT_LABELS').toEqual([])
  })

  /*
   * The half the compiler cannot see. `operators` and `parse` are indexed at
   * render time, so a key left out of one is `undefined` in a filter dropdown
   * rather than a build error.
   */
  it('fills both nested maps in every locale', () => {
    const missing: string[] = []

    for (const [name, labels] of LOCALES) {
      for (const map of ['operators', 'parse'] as const) {
        for (const key of Object.keys(DEFAULT_LABELS[map])) {
          const value = (labels[map] as Record<string, string | undefined>)[key]
          if (!value) missing.push(`${name}: ${map}.${key}`)
        }
      }
    }

    expect(missing, 'shipped locales missing an operator or parse message').toEqual([])
  })

  it('keeps every key the shape the default record declares', () => {
    const wrong: string[] = []

    for (const [name, labels] of LOCALES) {
      for (const [key, expected] of Object.entries(DEFAULT_LABELS)) {
        const actual = labels[key as keyof TableLabels]
        if (typeof actual !== typeof expected) {
          wrong.push(`${name}: ${key} is ${typeof actual}, not ${typeof expected}`)
        }
      }
    }

    expect(wrong, 'shipped locales with a key of the wrong shape').toEqual([])
  })

  /*
   * A function that ignores its arguments is the way a translation loses a
   * count: `rowRange: () => 'Страницы'` type-checks and renders a page summary
   * with no numbers in it.
   */
  it('interpolates every argument it is given', () => {
    const dropped: string[] = []

    for (const [name, labels] of LOCALES) {
      for (const [key, args] of Object.entries(SAMPLES)) {
        const fn = labels[key as keyof TableLabels] as (...a: unknown[]) => string
        const rendered = fn(...args)
        if (!rendered.trim()) dropped.push(`${name}: ${key} rendered nothing`)
        for (const arg of args) {
          if (!rendered.includes(String(arg))) dropped.push(`${name}: ${key} dropped ${arg}`)
        }
      }
    }

    expect(dropped, 'locale label functions dropping an argument they were handed').toEqual([])
  })

  /*
   * `searchIn` is the one label with an optional argument, and the branch that
   * takes none is the one a translation forgets.
   */
  it('translates the no-argument branch of searchIn', () => {
    const untranslated = LOCALES.filter(
      ([, labels]) => labels.searchIn(undefined) === DEFAULT_LABELS.searchIn(undefined),
    ).map(([name]) => name)

    expect(untranslated, 'locales whose bare searchIn still reads English').toEqual([])
  })

  /*
   * `pinState` interpolates a side, and a side is English until the locale
   * translates it — the one place a label function's *argument* needs a
   * translation of its own.
   */
  it('translates every pin side', () => {
    const untranslated: string[] = []

    for (const [name, labels] of LOCALES) {
      for (const side of ['left', 'right', 'none'] as const) {
        if (labels.pinState(side).includes(side)) untranslated.push(`${name}: ${side}`)
      }
    }

    expect(untranslated, 'locales rendering an English pin side').toEqual([])
  })
})
