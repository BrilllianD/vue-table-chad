import { describe, expect, it } from 'vitest'
import { effectScope, watch } from 'vue'
import { useRowExpansion } from '../src/core/useRowExpansion'
import { withDetailRows } from '../src/core/expansion'
import type { DisplayRow, RowGroup } from '../src/core/types'
import { people, type Person } from './fixtures'

function setup(options = {}) {
  const scope = effectScope()
  const expansion = scope.run(() => useRowExpansion<Person>(options))!
  return { expansion, dispose: () => scope.stop() }
}

/** A display list of plain rows, in the shape `flattenTree` emits ungrouped. */
function rowsOf(...items: Person[]): DisplayRow<Person>[] {
  return items.map((row, index) => ({ kind: 'row', row, index, depth: 0 }))
}

function group(key: string): RowGroup<Person> {
  return {
    key,
    columnId: 'department',
    value: key,
    path: [key],
    depth: 0,
    label: key,
    rows: [],
    count: 0,
    totalCount: 0,
    aggregates: {},
  }
}

/** One line per item, so a list reads as a shape rather than as objects. */
function outline(items: DisplayRow<Person>[]): string[] {
  return items.map((item) =>
    item.kind === 'group' ? `group:${item.group.key}` : `${item.kind}:${item.row.id}`,
  )
}

describe('useRowExpansion', () => {
  it('opens a row and shuts it again', () => {
    const { expansion, dispose } = setup()
    expect(expansion.isExpanded(people[0]!)).toBe(false)

    expansion.toggle(people[0]!)
    expect(expansion.isExpanded(people[0]!)).toBe(true)
    expect(expansion.expanded.value).toEqual([1])

    expansion.toggle(people[0]!)
    expect(expansion.isExpanded(people[0]!)).toBe(false)
    expect(expansion.expanded.value).toEqual([])
    dispose()
  })

  it('honours an explicit direction, so a held key is idempotent', () => {
    const { expansion, dispose } = setup()
    expansion.toggle(people[0]!, true)
    expansion.toggle(people[0]!, true)
    expect(expansion.expanded.value).toEqual([1])

    expansion.toggle(people[0]!, false)
    expansion.toggle(people[0]!, false)
    expect(expansion.expanded.value).toEqual([])
    dispose()
  })

  it('starts from `initial`', () => {
    const { expansion, dispose } = setup({ initial: [2, 3] })
    expect(expansion.isExpanded(people[1]!)).toBe(true)
    expect(expansion.isExpanded(people[2]!)).toBe(true)
    expect(expansion.isExpanded(people[0]!)).toBe(false)
    dispose()
  })

  /*
   * One write, not one per row. Reassigning the ref per row would make every
   * downstream walk of the display list run once per row opened.
   */
  it('opens every row it is handed in a single write', () => {
    const { expansion, dispose } = setup()
    let notifications = 0
    const scope = effectScope()
    scope.run(() => {
      watch(expansion.expanded, () => {
        notifications += 1
      }, { flush: 'sync' })
    })

    expansion.expandAll(people)
    expect(expansion.expanded.value).toHaveLength(people.length)
    expect(notifications).toBe(1)

    expansion.collapseAll()
    expect(expansion.expanded.value).toEqual([])
    expect(notifications).toBe(2)

    scope.stop()
    dispose()
  })

  it('tracks ids, so a refetch that reallocates rows keeps panels open', () => {
    const { expansion, dispose } = setup()
    expansion.toggle(people[0]!)

    const refetched: Person = { ...people[0]! }
    expect(refetched).not.toBe(people[0])
    expect(expansion.isExpanded(refetched)).toBe(true)
    dispose()
  })

  it('takes a `getRowId` for rows keyed by something else', () => {
    const { expansion, dispose } = setup({ getRowId: (row: Person) => row.name })
    expansion.toggle(people[0]!)
    expect(expansion.expanded.value).toEqual(['Ada Lovelace'])
    dispose()
  })
})

describe('withDetailRows', () => {
  it('puts a detail line after every open row', () => {
    const items = rowsOf(people[0]!, people[1]!, people[2]!)
    const open = new Set([people[1]])
    expect(outline(withDetailRows(items, (row) => open.has(row)))).toEqual([
      'row:1',
      'row:2',
      'detail:2',
      'row:3',
    ])
  })

  it('leaves group headers alone', () => {
    const items: DisplayRow<Person>[] = [
      { kind: 'group', group: group('Engineering') },
      { kind: 'row', row: people[0]!, index: 0, depth: 1 },
    ]
    expect(outline(withDetailRows(items, () => true))).toEqual([
      'group:Engineering',
      'row:1',
      'detail:1',
    ])
  })

  it('carries the parent row’s index and depth, so the pair stripes as one', () => {
    const items: DisplayRow<Person>[] = [{ kind: 'row', row: people[0]!, index: 7, depth: 2 }]
    const detail = withDetailRows(items, () => true)[1]!
    expect(detail.kind).toBe('detail')
    expect(detail.kind === 'detail' && detail.index).toBe(7)
    expect(detail.kind === 'detail' && detail.depth).toBe(2)
  })

  /*
   * The reference identity is the contract, not an implementation detail: a
   * computed returning the same reference does not propagate, which is what
   * keeps a table with every panel shut from re-rendering its body.
   */
  it('returns its input by reference when nothing is open', () => {
    const items = rowsOf(people[0]!, people[1]!)
    expect(withDetailRows(items, () => false)).toBe(items)
  })

  it('returns a fresh list once anything is open', () => {
    const items = rowsOf(people[0]!, people[1]!)
    expect(withDetailRows(items, (row) => row.id === 1)).not.toBe(items)
  })
})
