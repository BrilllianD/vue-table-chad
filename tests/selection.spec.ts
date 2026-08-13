import { describe, expect, it } from 'vitest'
import { effectScope, ref } from 'vue'
import { useRowSelection } from '../src/core/useRowSelection'
import { people, type Person } from './fixtures'

function setup(rows: Person[] = people, options = {}) {
  const scope = effectScope()
  const pageRows = ref(rows)
  const selection = scope.run(() =>
    useRowSelection<Person>(pageRows, () => 120, options),
  )!
  return { selection, pageRows, dispose: () => scope.stop() }
}

describe('useRowSelection', () => {
  it('toggles a row on and off', () => {
    const { selection, dispose } = setup()
    selection.toggle(people[0]!)
    expect(selection.isSelected(people[0]!)).toBe(true)
    expect(selection.count.value).toBe(1)

    selection.toggle(people[0]!)
    expect(selection.isSelected(people[0]!)).toBe(false)
    expect(selection.isEmpty.value).toBe(true)
    dispose()
  })

  it('keeps at most one row in single mode', () => {
    const { selection, dispose } = setup(people, { mode: 'single' })
    selection.toggle(people[0]!)
    selection.toggle(people[1]!)
    expect(selection.selectedIds.value).toEqual([2])
    dispose()
  })

  it('reports a tri-state header checkbox', () => {
    const { selection, dispose } = setup()
    expect(selection.headerState.value).toBe('none')

    selection.toggle(people[0]!)
    expect(selection.headerState.value).toBe('some')

    selection.toggleAllOnPage(true)
    expect(selection.headerState.value).toBe('all')

    selection.toggleAllOnPage()
    expect(selection.headerState.value).toBe('none')
    dispose()
  })

  it('selects a range on shift-click', () => {
    const { selection, dispose } = setup()
    selection.toggle(people[1]!)
    selection.toggleRange(people[4]!)
    expect(selection.selectedIds.value.sort()).toEqual([2, 3, 4, 5])
    dispose()
  })

  it('selects a range backwards too', () => {
    const { selection, dispose } = setup()
    selection.toggle(people[4]!)
    selection.toggleRange(people[1]!)
    expect(selection.selectedIds.value.sort()).toEqual([2, 3, 4, 5])
    dispose()
  })

  it('falls back to a plain toggle when there is no anchor', () => {
    const { selection, dispose } = setup()
    selection.toggleRange(people[3]!)
    expect(selection.selectedIds.value).toEqual([4])
    dispose()
  })

  it('survives a page change', () => {
    const { selection, pageRows, dispose } = setup(people.slice(0, 3))
    selection.toggle(people[0]!)
    pageRows.value = people.slice(3)
    // The row is off-screen, but still selected.
    expect(selection.selectedIds.value).toEqual([1])
    expect(selection.headerState.value).toBe('none')
    dispose()
  })

  it('respects isSelectable', () => {
    const { selection, dispose } = setup(people, {
      isSelectable: (row: Person) => row.active,
    })
    selection.toggle(people[2]!) // Alan Turing, inactive
    expect(selection.isEmpty.value).toBe(true)

    selection.toggleAllOnPage(true)
    expect(selection.selectedIds.value).not.toContain(3)
    dispose()
  })

  it('uses a custom getRowId', () => {
    const { selection, dispose } = setup(people, {
      getRowId: (row: Person) => row.name,
    })
    selection.toggle(people[0]!)
    expect(selection.selectedIds.value).toEqual(['Ada Lovelace'])
    dispose()
  })

  it('throws a useful error when a row has no id', () => {
    const { selection, dispose } = setup()
    expect(() => selection.isSelected({} as Person)).toThrow(/getRowId/)
    dispose()
  })
})

describe('select-all-matching', () => {
  it('counts every matching row without materialising ids', () => {
    const { selection, dispose } = setup()
    selection.selectAllMatching()
    expect(selection.isAllMatching.value).toBe(true)
    expect(selection.count.value).toBe(120)
    expect(selection.selectedIds.value).toEqual([])
    // Rows not on this page are selected too.
    expect(selection.isSelected(people[6]!)).toBe(true)
    dispose()
  })

  it('records exclusions instead of collapsing to an id list', () => {
    const { selection, dispose } = setup()
    selection.selectAllMatching()
    selection.toggle(people[0]!)

    expect(selection.isSelected(people[0]!)).toBe(false)
    expect(selection.isSelected(people[1]!)).toBe(true)
    expect(selection.count.value).toBe(119)
    expect(selection.state.value).toEqual({ mode: 'all-matching', excluded: [1] })
    dispose()
  })

  it('re-including an excluded row restores it', () => {
    const { selection, dispose } = setup()
    selection.selectAllMatching()
    selection.toggle(people[0]!)
    selection.toggle(people[0]!)
    expect(selection.count.value).toBe(120)
    expect(selection.state.value).toEqual({ mode: 'all-matching', excluded: [] })
    dispose()
  })

  it('clear() drops back to an empty id selection', () => {
    const { selection, dispose } = setup()
    selection.selectAllMatching()
    selection.clear()
    expect(selection.isAllMatching.value).toBe(false)
    expect(selection.count.value).toBe(0)
    dispose()
  })

  it('is unavailable in single mode', () => {
    const { selection, dispose } = setup(people, { mode: 'single' })
    selection.selectAllMatching()
    expect(selection.isAllMatching.value).toBe(false)
    dispose()
  })
})
