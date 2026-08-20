import { describe, expect, it } from 'vitest'
import { computeFacets, filterRows } from '../src/core/filters/facets'
import { valuesFilter } from '../src/core/filters/model'
import type { ColumnDef } from '../src/core/types'

interface Row {
  name: string
  department: string
}

const rows: Row[] = [
  { name: 'Ada', department: 'Engineering' },
  { name: 'Grace', department: 'Engineering' },
  { name: 'Barbara', department: 'Research' },
]

/** Every column opted out of search, but still filterable by an explicit filter. */
const unsearchable: ColumnDef<Row>[] = [
  { id: 'name', header: 'Name', searchable: false },
  { id: 'department', header: 'Department', searchable: false },
]

describe('filterRows', () => {
  it('ignores a search when no column is searchable, filter or no filter', () => {
    /*
     * The two halves of the guard, which have to agree.
     *
     * A search with nothing to search cannot match anything, so testing it
     * against zero columns would reject every row. Whether it does used to
     * depend on an unrelated column filter being active — one path returned
     * every row, the other returned none.
     */
    const search = { filters: {}, globalSearch: 'engineering' }
    expect(filterRows(rows, unsearchable, search)).toHaveLength(3)

    const searchAndFilter = {
      filters: { department: valuesFilter(['Engineering']) },
      globalSearch: 'engineering',
    }
    expect(filterRows(rows, unsearchable, searchAndFilter).map((row) => row.name)).toEqual([
      'Ada',
      'Grace',
    ])
  })

  it('still applies the search when a column can take it', () => {
    const columns: ColumnDef<Row>[] = [{ id: 'name' }, { id: 'department' }]
    const query = { filters: {}, globalSearch: 'grace' }
    expect(filterRows(rows, columns, query).map((row) => row.name)).toEqual(['Grace'])
  })

  it('scopes a column facets to every other column filter', () => {
    const columns: ColumnDef<Row>[] = [{ id: 'name' }, { id: 'department' }]
    const facets = computeFacets(rows, columns, columns[1]!, {
      filters: { name: valuesFilter(['Ada']) },
      globalSearch: '',
    })
    expect(facets.map((facet) => [facet.value, facet.count])).toEqual([['Engineering', 1]])
  })
})
