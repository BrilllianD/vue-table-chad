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

describe('useColumns flexible columns', () => {
  function widthOf(result: ReturnType<typeof setup>['columns'], id: string) {
    return result.all.value.find((column) => column.id === id)?.resolvedWidth
  }

  it('gives a flex column no width of its own', () => {
    const { columns, dispose } = setup(
      personColumns.map((column) => (column.id === 'name' ? { ...column, flex: true } : column)),
    )

    // Not the default, and not zero: the `<col>` has to carry no width at all
    // for fixed layout to hand it the leftover space.
    expect(widthOf(columns, 'name')).toBeUndefined()
    expect(widthOf(columns, 'salary')).toBe(160)
    dispose()
  })

  it('lets a declared width and a resize both outrank it', () => {
    const { columns, dispose } = setup(
      personColumns.map((column) =>
        column.id === 'name' ? { ...column, flex: true, width: 240 } : column,
      ),
    )
    expect(widthOf(columns, 'name')).toBe(240)

    const resized = setup(
      personColumns.map((column) => (column.id === 'name' ? { ...column, flex: true } : column)),
    )
    resized.columns.setWidth('name', 300)
    expect(widthOf(resized.columns, 'name')).toBe(300)

    // And letting go of the resize hands the column back to the leftover.
    resized.columns.resetWidth('name')
    expect(widthOf(resized.columns, 'name')).toBeUndefined()
    resized.dispose()
    dispose()
  })

  it('refuses to be flexible while pinned, however the pin arrived', () => {
    const { columns, dispose } = setup(
      personColumns.map((column) =>
        column.id === 'name' ? { ...column, flex: true, pinned: 'left' as const } : column,
      ),
    )
    // A sticky offset is the sum of the widths before it, so a pinned column
    // has to have one.
    expect(widthOf(columns, 'name')).toBe(160)
    dispose()

    const late = setup(
      personColumns.map((column) => (column.id === 'name' ? { ...column, flex: true } : column)),
    )
    expect(widthOf(late.columns, 'name')).toBeUndefined()
    late.columns.setPinned('name', 'left')
    expect(widthOf(late.columns, 'name')).toBe(160)
    late.dispose()
  })

  it('keeps the pin offsets behind it correct', () => {
    const { columns, dispose } = setup(
      personColumns.map((column) =>
        column.id === 'name'
          ? { ...column, pinned: 'left' as const, width: 120 }
          : column.id === 'department'
            ? { ...column, pinned: 'left' as const, flex: true }
            : column,
      ),
    )

    const pinned = columns.visible.value.filter((column) => column.pinned === 'left')
    expect(pinned.map((column) => [column.id, column.pinOffset])).toEqual([
      ['name', 0],
      ['department', 120],
    ])
    dispose()
  })
})

describe('useColumns measured widths', () => {
  function widthOf(result: ReturnType<typeof setup>['columns'], id: string) {
    return result.all.value.find((column) => column.id === id)?.resolvedWidth
  }

  it('sizes an undeclared column to what was measured, clamped', () => {
    const { columns, dispose } = setup()

    columns.setAutoWidths({ name: 92.4, department: 12, salary: 900 })

    expect(widthOf(columns, 'name')).toBe(92)
    // The floor and the ceiling: 60 by default, and the default width, which is
    // the flat 160 every undeclared column used to get. Nothing gets wider than
    // it was before this existed.
    expect(widthOf(columns, 'department')).toBe(60)
    expect(widthOf(columns, 'salary')).toBe(160)
    dispose()
  })

  it('honours the column\'s own min and max, and the option\'s ceiling', () => {
    const { columns, dispose } = setup(
      personColumns.map((column) =>
        column.id === 'name'
          ? { ...column, minWidth: 100 }
          : column.id === 'salary'
            ? { ...column, maxWidth: 80 }
            : column,
      ),
      { defaultWidth: 150 },
    )

    columns.setAutoWidths({ name: 70, salary: 200, department: 400 })
    expect(widthOf(columns, 'name')).toBe(100)
    expect(widthOf(columns, 'salary')).toBe(80)
    expect(widthOf(columns, 'department')).toBe(150)
    dispose()
  })

  it('writes each id once, so a later window cannot move a column', () => {
    const { columns, dispose } = setup()

    columns.setAutoWidths({ name: 90 })
    columns.setAutoWidths({ name: 140 })
    expect(widthOf(columns, 'name')).toBe(90)
    dispose()
  })

  it('ignores what nothing would read, and measures nothing from a dead layout', () => {
    const { columns, dispose } = setup(
      personColumns.map((column) =>
        column.id === 'name'
          ? { ...column, width: 220 }
          : column.id === 'department'
            ? { ...column, flex: true }
            : column,
      ),
    )

    const before = columns.all.value
    // A declared width and a flex column both outrank a measurement; zero is
    // what an element with no layout reports, which is every element under
    // jsdom, and is what keeps the rest of this suite on the fallback.
    columns.setAutoWidths({ name: 90, department: 90, salary: 0, nonesuch: 90 })

    expect(widthOf(columns, 'name')).toBe(220)
    expect(widthOf(columns, 'department')).toBeUndefined()
    expect(widthOf(columns, 'salary')).toBe(160)
    // Same object: a pass that measured nothing new must not invalidate
    // everything computed off the columns.
    expect(columns.all.value).toBe(before)
    dispose()
  })

  it('stays out of the layout the user owns and the storage saves', () => {
    const { columns, dispose } = setup()

    const before = columns.layout.value
    columns.setAutoWidths({ name: 90 })
    expect(columns.layout.value).toBe(before)
    expect(columns.layout.value.widths).toEqual({})
    dispose()
  })

  it('lets a resize outrank a measurement, and resetting land back on it', () => {
    const { columns, dispose } = setup()

    columns.setAutoWidths({ name: 90 })
    columns.setWidth('name', 300)
    expect(widthOf(columns, 'name')).toBe(300)

    // Back to the measured width rather than to a number the column never
    // asked for, which is what "reset" has always meant here.
    columns.resetWidth('name')
    expect(widthOf(columns, 'name')).toBe(90)

    columns.resetLayout()
    expect(widthOf(columns, 'name')).toBe(90)
    dispose()
  })

  it('forgets every measurement on request', () => {
    const { columns, dispose } = setup()

    columns.setAutoWidths({ name: 90 })
    columns.clearAutoWidths()
    expect(widthOf(columns, 'name')).toBe(160)

    // And a second clear changes nothing, so it cannot invalidate anything.
    const before = columns.all.value
    columns.clearAutoWidths()
    expect(columns.all.value).toBe(before)
    dispose()
  })
})

describe('useColumns width reset', () => {
  /** One column declaring a width and one leaving it to the default. */
  const widthDefs: ColumnDef<Person>[] = personColumns.map((column) =>
    column.id === 'name' ? { ...column, width: 220 } : column,
  )

  function widthOf(result: ReturnType<typeof setup>['columns'], id: string) {
    return result.all.value.find((column) => column.id === id)?.resolvedWidth
  }

  it('puts a resized column back to the width it declared', () => {
    const { columns, dispose } = setup(widthDefs)

    columns.setWidth('name', 400)
    expect(widthOf(columns, 'name')).toBe(400)

    columns.resetWidth('name')
    expect(widthOf(columns, 'name')).toBe(220)
    dispose()
  })

  it('puts a column that declared no width back to the default', () => {
    const { columns, dispose } = setup(widthDefs)

    columns.setWidth('salary', 400)
    columns.resetWidth('salary')
    expect(widthOf(columns, 'salary')).toBe(160)
    dispose()
  })

  // The single-column version, so resetting one leaves the others resized —
  // which is the whole difference from `resetWidths`.
  it('leaves the other columns alone', () => {
    const { columns, dispose } = setup(widthDefs)

    columns.setWidth('name', 400)
    columns.setWidth('salary', 300)
    columns.resetWidth('name')

    expect(widthOf(columns, 'salary')).toBe(300)
    expect(columns.layout.value.widths).toEqual({ salary: 300 })
    dispose()
  })

  it('is a no-op for a column that was never resized', () => {
    const { columns, dispose } = setup(widthDefs)

    const before = columns.layout.value
    columns.resetWidth('name')
    // Same object, not merely an equal one: an untouched layout must not
    // invalidate everything computed off it.
    expect(columns.layout.value).toBe(before)
    dispose()
  })

  it('ignores a column id it does not know', () => {
    const { columns, dispose } = setup(widthDefs)

    columns.setWidth('name', 400)
    columns.resetWidth('nonesuch')
    expect(widthOf(columns, 'name')).toBe(400)
    dispose()
  })
})
