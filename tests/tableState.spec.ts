import { describe, expect, it } from 'vitest'
import { createQueryState, DEFAULT_PAGE_SIZE, useTableState } from '../src/core/useTableState'

/**
 * The query's defaults, which no other spec asserts because every other spec
 * passes them explicitly.
 *
 * `pageSize` in particular is read from four places — `createQueryState`,
 * `TableRoot`, `DataTable` and a standalone `TablePagination` — and three of
 * them get there by declaring no default at all. That only stays true if
 * something checks the fourth.
 */
describe('query defaults', () => {
  it('pages ten rows at a time', () => {
    expect(DEFAULT_PAGE_SIZE).toBe(10)
    expect(createQueryState().pageSize).toBe(DEFAULT_PAGE_SIZE)
    expect(useTableState().pageSize.value).toBe(DEFAULT_PAGE_SIZE)
  })

  it('lets a caller say otherwise', () => {
    expect(createQueryState({ pageSize: 25 }).pageSize).toBe(25)
    expect(useTableState({ pageSize: 25 }).pageSize.value).toBe(25)
  })

  it('starts on the first page, unsorted, unfiltered and ungrouped', () => {
    // The rest of the shape, so a stray default added later has to be
    // deliberate rather than merely unnoticed.
    expect(createQueryState()).toEqual({
      sort: [],
      filters: {},
      groupBy: [],
      page: 1,
      pageSize: DEFAULT_PAGE_SIZE,
      globalSearch: '',
    })
  })
})
