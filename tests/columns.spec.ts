import { describe, expect, it } from 'vitest'
import { effectScope, ref } from 'vue'
import { useColumns } from '../src/core/useColumns'
import type { ColumnDef } from '../src/core/types'
import type { Person } from './fixtures'
import { groupedPersonColumns, personColumnGroups, personColumns } from './fixtures'

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

describe('useColumns header band collapse', () => {
  /** The banded fixtures, wired the way `TableRoot` wires them. */
  function banded(columns = groupedPersonColumns) {
    return setup(columns, { groups: personColumnGroups })
  }

  const shown = (result: ReturnType<typeof setup>['columns']) =>
    result.visible.value.map((column) => column.id)

  it('withholds a band’s columns but the one it folds to', () => {
    const { columns, dispose } = banded()
    expect(shown(columns)).toEqual(['name', 'department', 'salary', 'hiredAt', 'active'])

    columns.toggleGroup('identity')
    // `identity` declares no `collapseTo`, so it keeps its first member in
    // declared order.
    expect(shown(columns)).toEqual(['name', 'salary', 'hiredAt', 'active'])
    dispose()
  })

  it('keeps the column a band declares as its collapseTo', () => {
    const { columns, dispose } = banded()

    columns.toggleGroup('record')
    // `record` reaches through the nested `money` band, so it covers `salary`
    // and `hiredAt` both. It declares no `collapseTo` of its own and falls back
    // to its first member; `active`, in no band at all, is not its to withhold.
    expect(shown(columns)).toEqual(['name', 'department', 'salary', 'active'])
    dispose()
  })

  it('folds nested bands along with the band above them', () => {
    const { columns, dispose } = banded()

    columns.toggleGroup('money')
    // `money` covers only `salary`, which is also what it folds to — so a
    // band of one is a no-op rather than a column vanishing.
    expect(shown(columns)).toEqual(['name', 'department', 'salary', 'hiredAt', 'active'])
    dispose()
  })

  it('never withholds a column that declares hideable: false', () => {
    const unhideable = groupedPersonColumns.map((column) =>
      column.id === 'department' ? { ...column, hideable: false } : column,
    )
    const { columns, dispose } = banded(unhideable)

    columns.toggleGroup('identity')
    // A band is no more entitled to take the row's identity away than the
    // column menu is.
    expect(shown(columns)).toEqual(['name', 'department', 'salary', 'hiredAt', 'active'])
    dispose()
  })

  it('keeps collapse and the user’s own hiding apart', () => {
    const { columns, dispose } = banded()

    columns.toggleVisibility('department', false)
    columns.toggleGroup('identity')
    columns.toggleGroup('identity')

    // Expanding the band must not resurrect a column the user switched off.
    expect(shown(columns)).toEqual(['name', 'salary', 'hiredAt', 'active'])
    expect(columns.isVisible('department')).toBe(false)
    dispose()
  })

  it('reports a withheld column as visible but collapsed', () => {
    const { columns, dispose } = banded()
    columns.toggleGroup('identity')

    const department = columns.all.value.find((column) => column.id === 'department')!
    // What the column menu reads, so its checkbox keeps reporting the user's
    // choice rather than the band's current posture.
    expect(department.visible).toBe(true)
    expect(department.collapsed).toBe(true)
    dispose()
  })

  it('toggles explicitly in both directions', () => {
    const { columns, dispose } = banded()

    columns.toggleGroup('identity', false)
    expect(columns.isGroupCollapsed('identity')).toBe(false)
    columns.toggleGroup('identity', true)
    columns.toggleGroup('identity', true)
    expect(columns.layout.value.collapsedGroups).toEqual(['identity'])
    dispose()
  })

  it('collapses and expands every band at once', () => {
    const { columns, dispose } = banded()

    columns.collapseAllGroups()
    expect(columns.layout.value.collapsedGroups.sort()).toEqual(['identity', 'money', 'record'])
    expect(shown(columns)).toEqual(['name', 'salary', 'active'])

    columns.expandAllGroups()
    expect(shown(columns)).toEqual(['name', 'department', 'salary', 'hiredAt', 'active'])
    dispose()
  })

  it('leaves a band declaring collapsible: false out of collapseAllGroups', () => {
    const groups = personColumnGroups.map((group) =>
      group.id === 'identity' ? { ...group, collapsible: false } : group,
    )
    const { columns, dispose } = setup(groupedPersonColumns, { groups })

    columns.collapseAllGroups()
    expect(columns.layout.value.collapsedGroups).not.toContain('identity')
    dispose()
  })

  it('falls back to the first member when collapseTo names nothing in the band', () => {
    const groups = personColumnGroups.map((group) =>
      group.id === 'identity' ? { ...group, collapseTo: 'nonesuch' } : group,
    )
    const { columns, dispose } = setup(groupedPersonColumns, { groups })

    columns.toggleGroup('identity')
    // Honouring it literally would fold the band out of existence, breaking the
    // promise that a band always leaves one column standing.
    expect(shown(columns)).toEqual(['name', 'salary', 'hiredAt', 'active'])
    dispose()
  })

  it('keeps the folded column stable when the display order changes', () => {
    const { columns, dispose } = banded()

    columns.moveColumnTo('department', 'name', 'before')
    columns.toggleGroup('identity')
    // `collapseTo` defaults to declared order, not display order, so dragging
    // a column about cannot change which one a folded band shows.
    expect(shown(columns)).toEqual(['name', 'salary', 'hiredAt', 'active'])
    dispose()
  })

  it('resetLayout expands every band', () => {
    const { columns, dispose } = banded()

    columns.collapseAllGroups()
    columns.resetLayout()
    expect(columns.layout.value.collapsedGroups).toEqual([])
    expect(shown(columns)).toEqual(['name', 'department', 'salary', 'hiredAt', 'active'])
    dispose()
  })

  it('ignores a band no column belongs to', () => {
    const { columns, dispose } = banded()

    columns.toggleGroup('nonesuch')
    expect(shown(columns)).toEqual(['name', 'department', 'salary', 'hiredAt', 'active'])
    dispose()
  })
})
