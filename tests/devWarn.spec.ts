import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { effectScope, ref, shallowRef } from 'vue'
import { useColumns, useLocalDataSource, useTable, useTableState, type ColumnDef } from '@brillliand/vue-table-chad'
import { resetDevWarnings } from '../src/core/devWarn'
import { people, personColumns, type Person } from './fixtures'

/**
 * The diagnostics, which exist because the library had four `throw`s and no
 * warnings at all — leaving a class of authoring mistakes that corrupt the
 * table silently rather than failing.
 *
 * `resetDevWarnings` between cases because the warner dedupes by message for
 * the life of the module: right in a running app, wrong across tests that each
 * want the same warning fresh.
 */
interface Row {
  name: string
  dept: string
}

let warn: MockInstance<(...args: unknown[]) => void>

beforeEach(() => {
  resetDevWarnings()
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {}) as typeof warn
})
afterEach(() => {
  warn.mockRestore()
})

const messages = (): string[] => warn.mock.calls.map((call) => String(call[0]))

describe('development diagnostics', () => {
  it('warns about a duplicate column id, naming it', () => {
    const columns: ColumnDef<Row>[] = [
      { id: 'name' },
      { id: 'name', header: 'Same id' },
      { id: 'dept' },
    ]
    const result = useColumns(ref(columns))
    // Touch the computed: the check rides the same evaluation the table does.
    expect(result.all.value).toHaveLength(3)

    expect(messages()).toHaveLength(1)
    expect(messages()[0]).toContain('Duplicate column id "name"')
  })

  it('warns about a column with no id', () => {
    const columns = [{ id: '' }, { id: 'dept' }] as ColumnDef<Row>[]
    const result = useColumns(ref(columns))
    expect(result.all.value).toHaveLength(2)
    expect(messages()[0]).toContain('no `id`')
  })

  it('says nothing about a clean column set', () => {
    const result = useColumns(ref<ColumnDef<Row>[]>([{ id: 'name' }, { id: 'dept' }]))
    expect(result.all.value).toHaveLength(2)
    expect(messages()).toEqual([])
  })

  it('warns once per problem, not once per re-evaluation', () => {
    // The check sits inside a computed, so a naive implementation would repeat
    // the warning every time anything re-read the columns.
    const columns = ref<ColumnDef<Row>[]>([{ id: 'name' }, { id: 'name' }])
    const result = useColumns(columns)
    void result.all.value
    columns.value = [...columns.value]
    void result.all.value
    columns.value = [...columns.value]
    void result.all.value

    expect(messages()).toHaveLength(1)
  })

  it('distinguishes two different duplicates', () => {
    const result = useColumns(
      ref<ColumnDef<Row>[]>([{ id: 'name' }, { id: 'name' }, { id: 'dept' }, { id: 'dept' }]),
    )
    void result.all.value
    expect(messages()).toHaveLength(2)
    expect(messages().join('\n')).toContain('"dept"')
  })
})

describe('a query naming a column nobody declared', () => {
  /** A table assembled the way `useTable`'s own spec does — nothing mounted. */
  function setup() {
    const scope = effectScope()
    const state = scope.run(() => useTableState({ pageSize: 3 }))!
    scope.run(() => {
      const source = useLocalDataSource<Person>(shallowRef(people), personColumns, state.query, {
        debounceMs: 0,
      })
      return useTable<Person>({ columns: () => personColumns, source: () => source, state })
    })
    return { state, dispose: () => scope.stop() }
  }

  it('warns when a sort names an unknown column, and says it is ignored', async () => {
    const { state, dispose } = setup()
    state.setSort('naem', 'asc')
    await Promise.resolve()

    expect(messages().join('\n')).toContain('Sorting by "naem"')
    dispose()
  })

  it('says nothing when the sort names a real column', async () => {
    const { state, dispose } = setup()
    state.setSort('name', 'asc')
    await Promise.resolve()

    expect(messages()).toEqual([])
    dispose()
  })
})
