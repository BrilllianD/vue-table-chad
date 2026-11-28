import { describe, expect, it } from 'vitest'
import { ref } from 'vue'
import { createQueryState, useTableState } from '../src/core/useTableState'
import { valuesFilter } from '../src/core/filters/model'

/**
 * `reset()` puts the query back to what the options started it with.
 *
 * It reassigns from `createQueryState(options)`, and moves a client-side
 * grouping back to where that mode keeps it. Nothing else asserts either, so a
 * reset that kept a stale field, aliased the options' arrays or forgot the
 * external ref would go unnoticed.
 */
describe('useTableState().reset()', () => {
  function makeOptions() {
    return {
      initialSort: [{ columnId: 'name', direction: 'asc' as const }],
      initialFilters: { department: valuesFilter(['Engineering']) },
      initialPage: 2,
      pageSize: 25,
      initialSearch: 'ada',
      initialGroupBy: ['department'],
    }
  }

  function scribble(state: ReturnType<typeof useTableState>) {
    state.setSort('salary', 'desc')
    state.setFilter('role', valuesFilter(['Lead']))
    state.setSearch('grace')
    state.setPageSize(50)
    state.setPage(4)
    state.setGroupBy(['role'])
  }

  it('puts every query field back where the options started it', () => {
    const options = makeOptions()
    const state = useTableState(options)
    scribble(state)

    state.reset()
    const expected = { ...createQueryState(options), groupBy: [] }
    expect(state.query.value).toEqual(expected)
    expect(state.groupBy.value).toEqual(['department'])

    state.setSort('salary', 'desc')
    state.reset()
    expect(state.query.value).toEqual(expected)
    expect(options.initialSort).toEqual([{ columnId: 'name', direction: 'asc' }])
  })

  it('under server grouping, restores the grouping into the query', () => {
    const state = useTableState({ ...makeOptions(), groupMode: 'server' })
    state.setGroupBy(['role'])

    state.reset()
    expect(state.query.value.groupBy).toEqual(['department'])
    expect(state.groupBy.value).toEqual(['department'])
  })

  it('writes the reset through to an external state ref', () => {
    const external = ref(createQueryState({ pageSize: 25 }))
    const state = useTableState({ pageSize: 25, state: external })
    state.setSort('name', 'asc')
    state.setSearch('x')
    state.setPage(3)
    expect(external.value.page).toBe(3)

    state.reset()
    expect(external.value.page).toBe(1)
    expect(external.value.sort).toEqual([])
    expect(external.value.globalSearch).toBe('')
  })
})
