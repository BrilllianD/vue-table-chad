import { describe, expect, it } from 'vitest'
import { computed, effectScope, ref } from 'vue'
import { useLocalDataSource } from '../src/core/useLocalDataSource'
import { useTableState } from '../src/core/useTableState'
import { computeFacets } from '../src/core/filters/facets'
import { conditionsFilter, valuesFilter } from '../src/core/filters/model'
import { names, people, personColumns } from './fixtures'

function setup() {
  const scope = effectScope()
  const result = scope.run(() => {
    const state = useTableState({ pageSize: 3 })
    const source = useLocalDataSource(people, personColumns, state.query)
    return { state, source }
  })!
  return { ...result, dispose: () => scope.stop() }
}

describe('useLocalDataSource', () => {
  it('paginates and reports the unpaginated total', () => {
    const { state, source, dispose } = setup()
    expect(source.total.value).toBe(7)
    expect(source.rows.value).toHaveLength(3)

    state.setPage(3)
    expect(source.rows.value).toHaveLength(1)
    dispose()
  })

  it('clamps a page index left over from a bigger result set', () => {
    const { state, source, dispose } = setup()
    state.setPage(3)
    state.setFilter('department', valuesFilter(['Engineering']))
    // setFilter resets to page 1; force the stale index back to prove clamping.
    state.page.value = 9
    expect(source.rows.value.length).toBeGreaterThan(0)
    expect(names(source.rows.value)).toEqual(['Ada Lovelace', 'Grace Hopper'])
    dispose()
  })

  it('applies filter then sort then slice', () => {
    const { state, source, dispose } = setup()
    state.setFilter('salary', conditionsFilter([{ operator: 'gte', value: 120000 }]))
    state.setSort('salary', 'desc')
    expect(source.total.value).toBe(4)
    expect(names(source.rows.value)).toEqual(['Barbara Liskov', 'Grace Hopper', 'Alan Turing'])
    dispose()
  })

  it('combines filters across columns with AND', () => {
    const { state, source, dispose } = setup()
    state.setFilter('department', valuesFilter(['Engineering', 'Research']))
    state.setFilter('active', valuesFilter([true]))
    expect(names(source.filteredRows.value)).toEqual([
      'Ada Lovelace',
      'Grace Hopper',
      'Katherine Johnson',
    ])
    dispose()
  })

  it('searches across every column', () => {
    const { state, source, dispose } = setup()
    state.setSearch('research')
    expect(source.total.value).toBe(2)
    dispose()
  })

  it('reacts to the underlying array changing', () => {
    const scope = effectScope()
    const rows = ref([...people])
    const { source } = scope.run(() => {
      const state = useTableState({ pageSize: 100 })
      return { source: useLocalDataSource(rows, personColumns, state.query) }
    })!
    expect(source.total.value).toBe(7)
    rows.value = rows.value.slice(0, 2)
    expect(source.total.value).toBe(2)
    scope.stop()
  })

  it('recomputes on refresh() when rows were mutated in place', () => {
    const scope = effectScope()
    const rows = [...people]
    const { source } = scope.run(() => {
      const state = useTableState({ pageSize: 100 })
      return { source: useLocalDataSource(() => rows, personColumns, state.query) }
    })!
    expect(source.total.value).toBe(7)
    rows.pop()
    source.refresh()
    expect(source.total.value).toBe(6)
    scope.stop()
  })

  it('exposes itself as a local source', () => {
    const { source, dispose } = setup()
    expect(source.remote).toBe(false)
    expect(source.loading.value).toBe(false)
    dispose()
  })
})

describe('facets', () => {
  const departmentColumn = personColumns.find((c) => c.id === 'department')!
  const salaryColumn = personColumns.find((c) => c.id === 'salary')!

  it('lists distinct values with counts, blanks last', () => {
    const facets = computeFacets(people, personColumns, departmentColumn, {
      filters: {},
      globalSearch: '',
    })
    expect(facets.map((f) => f.value)).toEqual(['Engineering', 'Research', 'Support', null])
    expect(facets.find((f) => f.value === 'Engineering')!.count).toBe(2)
    expect(facets.at(-1)!.count).toBe(1)
  })

  it('narrows when ANOTHER column is filtered', () => {
    const facets = computeFacets(people, personColumns, departmentColumn, {
      filters: { active: valuesFilter([false]) },
      globalSearch: '',
    })
    // Only Alan (Research) and Item 10 (Support) are inactive.
    expect(facets.map((f) => f.value)).toEqual(['Research', 'Support'])
  })

  it('ignores the column\'s OWN filter, so unchecked values stay re-checkable', () => {
    const facets = computeFacets(people, personColumns, departmentColumn, {
      filters: { department: valuesFilter(['Engineering'], false) },
      globalSearch: '',
    })
    // Support and Research must still be offered even though they are filtered out.
    expect(facets.map((f) => f.value)).toEqual(['Engineering', 'Research', 'Support', null])
  })

  it('sorts numeric facets numerically', () => {
    const facets = computeFacets(people, personColumns, salaryColumn, {
      filters: {},
      globalSearch: '',
    })
    const values = facets.map((f) => f.value).filter((v): v is number => typeof v === 'number')
    expect(values).toEqual([...values].sort((a, b) => a - b))
  })

  it('keeps declared enum options that no row currently uses', () => {
    const withOptions = { ...departmentColumn, options: ['Engineering', 'Research', 'Support', 'Legal'] }
    const facets = computeFacets(people, personColumns, withOptions, { filters: {}, globalSearch: '' })
    const legal = facets.find((f) => f.value === 'Legal')
    expect(legal).toBeDefined()
    expect(legal!.count).toBe(0)
  })

  it('is available through the data source', async () => {
    const { source, dispose } = setup()
    const facets = await source.facets('department')
    expect(facets.map((f) => f.value)).toContain('Engineering')
    expect(source.facetsSync('nope')).toEqual([])
    dispose()
  })
})

describe('useTableState', () => {
  it('resets to page 1 whenever the result shape changes', () => {
    const scope = effectScope()
    const state = scope.run(() => useTableState({ pageSize: 3 }))!
    state.setPage(3)
    state.setFilter('department', valuesFilter(['Engineering']))
    expect(state.page.value).toBe(1)

    state.setPage(3)
    state.setSearch('x')
    expect(state.page.value).toBe(1)

    state.setPage(3)
    state.setSort('name', 'asc')
    expect(state.page.value).toBe(1)
    scope.stop()
  })

  it('drops no-op filters instead of storing them', () => {
    const scope = effectScope()
    const state = scope.run(() => useTableState())!
    state.setFilter('name', valuesFilter(null))
    expect(state.filters.value.name).toBeUndefined()
    expect(state.hasActiveFilters.value).toBe(false)

    state.setFilter('name', valuesFilter(['Ada Lovelace']))
    expect(state.activeFilterIds.value).toEqual(['name'])

    state.clearAllFilters()
    expect(state.hasActiveFilters.value).toBe(false)
    scope.stop()
  })

  it('tracks multi-sort direction and position per column', () => {
    const scope = effectScope()
    const state = scope.run(() => useTableState())!
    state.toggleSort('department', true)
    state.toggleSort('salary', true)
    expect(state.sortFor('department')).toBe('asc')
    expect(state.sortIndexFor('salary')).toBe(2)
    expect(state.sortIndexFor('name')).toBe(0)
    scope.stop()
  })

  it('mirrors an external state ref both ways', () => {
    const scope = effectScope()
    const external = ref({ sort: [], filters: {}, page: 2, pageSize: 10, globalSearch: '' })
    const state = scope.run(() => useTableState({ state: external }))!
    expect(state.page.value).toBe(2)

    state.setPage(5)
    expect(external.value.page).toBe(5)
    scope.stop()
  })

  it('exposes a query object that stays reactive', () => {
    const scope = effectScope()
    const { state, seen } = scope.run(() => {
      const s = useTableState({ pageSize: 5 })
      const seen = computed(() => s.query.value.pageSize)
      return { state: s, seen }
    })!
    expect(seen.value).toBe(5)
    state.setPageSize(50)
    expect(seen.value).toBe(50)
    scope.stop()
  })
})
