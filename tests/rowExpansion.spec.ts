import { describe, expect, it } from 'vitest'
import { effectScope, nextTick, watch } from 'vue'
import { useRowExpansion } from '../src/core/useRowExpansion'
import { withDetailRows } from '../src/core/expansion'
import type { DisplayRow, RowGroup, RowId } from '../src/core/types'
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

describe('useRowExpansion with loadDetail', () => {
  interface Assignment {
    project: string
  }

  /** A load whose settling each case controls, so a race can be written down. */
  function deferred() {
    const pending = new Map<RowId, { resolve: (value: Assignment[]) => void; reject: (error: unknown) => void }>()
    const calls: RowId[] = []
    const loadDetail = (row: Person) =>
      new Promise<Assignment[]>((resolve, reject) => {
        calls.push(row.id)
        pending.set(row.id, { resolve, reject })
      })
    return { pending, calls, loadDetail }
  }

  function setupAsync(loadDetail: (row: Person) => Promise<Assignment[]>) {
    const scope = effectScope()
    const expansion = scope.run(() => useRowExpansion<Person, Assignment[]>({ loadDetail }))!
    return { expansion, dispose: () => scope.stop() }
  }

  it('fetches on the expand transition and reports each state in turn', async () => {
    const { pending, loadDetail } = deferred()
    const { expansion, dispose } = setupAsync(loadDetail)

    expect(expansion.detailFor(people[0]!).status).toBe('idle')

    expansion.toggle(people[0]!)
    expect(expansion.detailFor(people[0]!).status).toBe('loading')

    pending.get(1)!.resolve([{ project: 'Atlas' }])
    await nextTick()

    const state = expansion.detailFor(people[0]!)
    expect(state.status).toBe('ready')
    expect(state.data).toEqual([{ project: 'Atlas' }])
    dispose()
  })

  it('reports a rejection rather than dropping it', async () => {
    const { pending, loadDetail } = deferred()
    const { expansion, dispose } = setupAsync(loadDetail)

    expansion.toggle(people[0]!)
    pending.get(1)!.reject(new Error('nope'))
    await nextTick()

    const state = expansion.detailFor(people[0]!)
    expect(state.status).toBe('error')
    expect((state.error as Error).message).toBe('nope')
    dispose()
  })

  /*
   * Once per id, and the cache outlives a collapse: reopening a panel the user
   * already looked at is what a second request here would cost.
   */
  it('fetches once per row, collapse and reopen included', async () => {
    const { pending, calls, loadDetail } = deferred()
    const { expansion, dispose } = setupAsync(loadDetail)

    expansion.toggle(people[0]!)
    pending.get(1)!.resolve([])
    await nextTick()

    expansion.toggle(people[0]!, false)
    expansion.toggle(people[0]!, true)
    // And an explicit expand on an already-open row is not a transition either.
    expansion.toggle(people[0]!, true)

    expect(calls).toEqual([1])
    expect(expansion.detailFor(people[0]!).status).toBe('ready')
    dispose()
  })

  it('asks again on reload, and keeps the newer answer', async () => {
    const { pending, calls, loadDetail } = deferred()
    const { expansion, dispose } = setupAsync(loadDetail)

    expansion.toggle(people[0]!)
    const first = pending.get(1)!
    expansion.reload(people[0]!)
    const second = pending.get(1)!

    // Out of order: the superseded request settles last and must be discarded,
    // or the panel ends up showing what it asked for two answers ago.
    second.resolve([{ project: 'Beacon' }])
    await nextTick()
    first.resolve([{ project: 'Atlas' }])
    await nextTick()

    expect(calls).toEqual([1, 1])
    expect(expansion.detailFor(people[0]!).data).toEqual([{ project: 'Beacon' }])
    dispose()
  })

  it('discards a failure that lost the same race', async () => {
    const { pending, loadDetail } = deferred()
    const { expansion, dispose } = setupAsync(loadDetail)

    expansion.toggle(people[0]!)
    const first = pending.get(1)!
    expansion.reload(people[0]!)
    pending.get(1)!.resolve([{ project: 'Beacon' }])
    await nextTick()

    first.reject(new Error('too late'))
    await nextTick()

    expect(expansion.detailFor(people[0]!).status).toBe('ready')
    dispose()
  })

  it('opens every row it is handed and asks for each one once', async () => {
    const { pending, calls, loadDetail } = deferred()
    const { expansion, dispose } = setupAsync(loadDetail)
    const rows = people.slice(0, 3)

    expansion.expandAll(rows)
    expect(calls).toEqual([1, 2, 3])
    for (const row of rows) pending.get(row.id)!.resolve([])
    await nextTick()

    expansion.collapseAll()
    expansion.expandAll(rows)
    expect(calls).toEqual([1, 2, 3])
    dispose()
  })

  /*
   * The synchronous path from F6 has to stay one code path, so a panel that
   * needs no fetch reads `ready` rather than a fourth branch for "there is
   * nothing to load".
   */
  it('reports ready with no data when nothing loads', () => {
    const { expansion, dispose } = setup()
    expect(expansion.detailFor(people[0]!)).toEqual({ status: 'ready' })
    expansion.toggle(people[0]!)
    expect(expansion.detailFor(people[0]!).status).toBe('ready')
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
