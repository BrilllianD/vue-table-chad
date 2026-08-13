import { describe, expect, it } from 'vitest'
import { effectScope, ref } from 'vue'
import { useColumns } from '../src/core/useColumns'
import type { ColumnDef } from '../src/core/types'
import type { Person } from './fixtures'
import { personColumns } from './fixtures'

/** Runs a composable inside a scope so its effects can be disposed. */
function setup(
  columns: ColumnDef<Person>[] = personColumns,
  options: Parameters<typeof useColumns>[1] = {},
) {
  const scope = effectScope()
  const result = scope.run(() => useColumns<Person>(columns, options))!
  return { columns: result, dispose: () => scope.stop() }
}

function pinnedOf(result: ReturnType<typeof setup>['columns'], id: string) {
  return result.all.value.find((column) => column.id === id)?.pinned
}

describe('useColumns pinning', () => {
  it('pins and unpins a column that declares no pin of its own', () => {
    const { columns, dispose } = setup()

    columns.setPinned('name', 'left')
    expect(pinnedOf(columns, 'name')).toBe('left')

    columns.setPinned('name', false)
    expect(pinnedOf(columns, 'name')).toBe(false)
    dispose()
  })

  // A pin declared on the ColumnDef is a *default*, not a lock. Without an
  // explicit "unpinned" entry in the layout state, clearing the override falls
  // straight back to the declared side and the column can never be unpinned —
  // which is the third click of ColumnVisibilityMenu's left → right → off cycle.
  it('unpins a column that declares `pinned` in its def', () => {
    const defs: ColumnDef<Person>[] = personColumns.map((column) =>
      column.id === 'name' ? { ...column, pinned: 'left' as const } : column,
    )
    const { columns, dispose } = setup(defs)

    expect(pinnedOf(columns, 'name')).toBe('left')

    columns.setPinned('name', 'right')
    expect(pinnedOf(columns, 'name')).toBe('right')

    columns.setPinned('name', false)
    expect(pinnedOf(columns, 'name')).toBe(false)
    // And it rejoins the unpinned middle group rather than staying at an edge.
    expect(columns.visible.value.map((column) => column.id)).toEqual(
      personColumns.map((column) => column.id),
    )
    dispose()
  })

  it('restores the declared pin after resetLayout', () => {
    const defs: ColumnDef<Person>[] = personColumns.map((column) =>
      column.id === 'name' ? { ...column, pinned: 'left' as const } : column,
    )
    const { columns, dispose } = setup(defs)

    columns.setPinned('name', false)
    expect(pinnedOf(columns, 'name')).toBe(false)

    columns.resetLayout()
    expect(pinnedOf(columns, 'name')).toBe('left')
    dispose()
  })

  it('accumulates sticky offsets from live widths', () => {
    const { columns, dispose } = setup()
    columns.setPinned('name', 'left')
    columns.setPinned('department', 'left')
    columns.setWidth('name', 200)

    const left = columns.visible.value.filter((column) => column.pinned === 'left')
    expect(left.map((column) => column.pinOffset)).toEqual([0, 200])
    dispose()
  })

  it('tracks a reactive column list', () => {
    const defs = ref<ColumnDef<Person>[]>(personColumns.slice(0, 2))
    const scope = effectScope()
    const columns = scope.run(() => useColumns<Person>(defs))!

    expect(columns.all.value).toHaveLength(2)
    defs.value = personColumns
    expect(columns.all.value).toHaveLength(personColumns.length)
    scope.stop()
  })
})
