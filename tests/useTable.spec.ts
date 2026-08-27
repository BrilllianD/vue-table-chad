import { describe, expect, it } from 'vitest'
import { effectScope, shallowRef } from 'vue'
import { useTable, type UseTableOptions } from '../src/core/useTable'
import { useLocalDataSource } from '../src/core/useLocalDataSource'
import { useTableState } from '../src/core/useTableState'
import { people, personColumns, personColumnGroups, groupedPersonColumns, type Person } from './fixtures'

/**
 * The point of these: none of them mount anything.
 *
 * All of this wiring used to live inside `TableRoot.vue`, where the only way to
 * ask it a question was to render a component and read the DOM back. The rules
 * below are about state, not markup, and this is what they cost to check now.
 */
function setup(options: Partial<UseTableOptions<Person>> = {}) {
  const scope = effectScope()
  const table = scope.run(() => {
    const state = options.state ?? useTableState({ pageSize: 3 })
    const columns = options.columns ?? (() => personColumns)
    const source = useLocalDataSource<Person>(shallowRef(people), columns(), state.query, {
      debounceMs: 0,
    })
    return useTable<Person>({ columns, source: () => source, ...options, state })
  })!
  return { table, dispose: () => scope.stop() }
}

describe('useTable without a component', () => {
  it('assembles a context from nothing but options', () => {
    const { table, dispose } = setup()

    expect(table.rows.value.length).toBe(3)
    expect(table.visibleColumns.value.map((column) => column.id)).toEqual([
      'name',
      'department',
      'salary',
      'hiredAt',
      'active',
    ])
    expect(table.pagination.pageCount.value).toBe(3)
    expect(table.getCellText(table.rows.value[0]!, table.columnDefs.value[0]!)).toBe('Ada Lovelace')
    dispose()
  })

  // Both were built unconditionally inside TableRoot and gated on the way out,
  // so that flipping the option on later finds something already behind it.
  it('builds selection and the cursor even when neither was asked for', () => {
    const { table, dispose } = setup()

    expect(table.selection.value).toBeUndefined()
    expect(table.cursor.value).toBeUndefined()
    // ...but the ungated ones exist, which is what makes the flip work.
    expect(table.rowSelection).toBeDefined()
    expect(table.cellCursor).toBeDefined()
    dispose()
  })

  it('reveals selection the moment the option turns on', () => {
    const selectable = shallowRef<boolean>(false)
    const { table, dispose } = setup({ selectable: () => selectable.value })

    expect(table.selection.value).toBeUndefined()
    selectable.value = true
    expect(table.selection.value).toBe(table.rowSelection)
    dispose()
  })
})

describe('useTable grouping options', () => {
  it('writes groupMode through to a state built elsewhere', () => {
    const state = useTableState({ pageSize: 3 })
    const { table, dispose } = setup({ state, groupMode: () => 'server' })

    expect(table.state.groupMode.value).toBe('server')
    dispose()
  })

  // The option is a default, and a caller's own state outranks a default.
  it('seeds initialGroupBy into a supplied state that carries no grouping', () => {
    const state = useTableState({ pageSize: 3 })
    const { table, dispose } = setup({ state, initialGroupBy: ['department'] })

    expect(table.state.groupBy.value).toEqual(['department'])
    dispose()
  })

  it('leaves a supplied state that already carries a grouping alone', () => {
    const state = useTableState({ pageSize: 3 })
    state.setGroupBy(['active'])
    const { table, dispose } = setup({ state, initialGroupBy: ['department'] })

    expect(table.state.groupBy.value).toEqual(['active'])
    dispose()
  })

  it('bands the loaded rows once a grouping is set', () => {
    const state = useTableState({ pageSize: 100 })
    const { table, dispose } = setup({ state, initialGroupBy: ['department'] })

    const kinds = table.displayRows.value.map((item) => item.kind)
    expect(kinds).toContain('group')
    dispose()
  })
})

describe('useTable row identity', () => {
  it('getRowId refuses to guess, getRowKey falls back to the index', () => {
    const anonymous = [{ name: 'no id' }] as unknown as Person[]
    const { table, dispose } = setup({ columns: () => personColumns })

    expect(() => table.getRowId(anonymous[0]!)).toThrow()
    // A missing id is a rendering inconvenience, not a reason to blow up.
    expect(table.getRowKey(anonymous[0]!, 7)).toBe(7)
    dispose()
  })

  it('honours a supplied getRowId in both', () => {
    const getRowId = (row: Person) => `p${row.id}`
    const { table, dispose } = setup({ getRowId })

    expect(table.getRowId(people[0]!)).toBe('p1')
    expect(table.getRowKey(people[0]!, 7)).toBe('p1')
    dispose()
  })
})

describe('useTable column layout', () => {
  it('drops a folded band out of the visible columns and the header rows', () => {
    const { table, dispose } = setup({
      columns: () => groupedPersonColumns,
      columnGroups: () => personColumnGroups,
    })

    expect(table.headerRows.value.length).toBeGreaterThan(1)
    expect(table.visibleColumns.value.map((column) => column.id)).toContain('department')

    // `identity` holds name + department and names no `collapseTo`, so folding
    // it keeps the first member and withholds the rest. (`money` holds only
    // `salary` and collapses *to* it, so folding that one withholds nothing —
    // which is correct, and is why it is not the band under test here.)
    table.columns.toggleGroup('identity', true)
    expect(table.visibleColumns.value.map((column) => column.id)).toContain('name')
    expect(table.visibleColumns.value.map((column) => column.id)).not.toContain('department')
    dispose()
  })

  // `grouping` and `dnd` are optional on TableContext because a hand-built one
  // may omit them; useTable always builds both.
  it('always builds grouping and dnd', () => {
    const { table, dispose } = setup()

    expect(table.grouping).toBeDefined()
    expect(table.dnd).toBeDefined()
    dispose()
  })
})
