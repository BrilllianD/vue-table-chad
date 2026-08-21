import { describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref, shallowRef } from 'vue'
import { useRowEditing, SAVE_FAILED_MESSAGE, type RowChange } from '../src/core/useRowEditing'
import { useLocalDataSource } from '../src/core/useLocalDataSource'
import { useTableState } from '../src/core/useTableState'
import { replaceRowIn } from '../src/core/editing'
import { valuesFilter } from '../src/core/filters/model'
import type { ColumnDef, EditMode } from '../src/index'
import { people, personColumns, type Person } from './fixtures'

/** Resolution under the test's control, so two saves can be interleaved by hand. */
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const columns: ColumnDef<Person>[] = personColumns.map((column) => ({ ...column, editable: true }))

const byId = (row: Person) => row.id

type Options = Parameters<typeof useRowEditing<Person>>[2]

function setup(options: Partial<Options> = {}, mode: EditMode = 'cell') {
  const scope = effectScope()
  const rows = shallowRef<Person[]>([...people])
  const editMode = ref<EditMode>(mode)
  const saves: RowChange<Person>[] = []

  const built = scope.run(() => {
    const state = useTableState({ pageSize: 3 })
    const source = useLocalDataSource<Person>(rows, columns, state.query, { debounceMs: 0 })
    const editing = useRowEditing<Person>(source, columns, {
      mode: editMode,
      save: async (change) => {
        saves.push(change)
      },
      apply: (next) => {
        rows.value = replaceRowIn(rows.value, next, byId)
      },
      ...options,
    })
    return { state, source, editing }
  })!

  const rowFor = (id: number) => rows.value.find((row) => row.id === id)!

  return { ...built, rows, rowFor, saves, editMode, dispose: () => scope.stop() }
}

const first = people[0]!

describe('a draft', () => {
  it('opens on begin and holds the parsed value, not the raw input', () => {
    const h = setup()
    h.editing.begin(first, 'salary')
    expect(h.editing.isEditing(first.id)).toBe(true)

    h.editing.setValue(first, columns[2]!, '92000')
    expect(h.editing.stateFor(first.id)!.draft).toEqual({ salary: 92000 })
    expect(h.editing.stateFor(first.id)!.inputs).toEqual({ salary: '92000' })
    h.dispose()
  })

  it('keeps the raw input on screen when it will not parse', () => {
    const h = setup()
    h.editing.begin(first, 'salary')
    h.editing.setValue(first, columns[2]!, 'abc')
    // The draft records the failure; the editor still shows what was typed.
    expect(h.editing.stateFor(first.id)!.draft.salary).toBeUndefined()
    expect(h.editing.inputFor(first, columns[2]!)).toBe('abc')
    h.dispose()
  })

  it('falls back to the cell value for an untouched column', () => {
    const h = setup()
    h.editing.begin(first, 'salary')
    expect(h.editing.inputFor(first, columns[0]!)).toBe(first.name)
    expect(h.editing.valueFor(first, columns[0]!)).toBe(first.name)
    h.dispose()
  })

  it('is dropped by cancel, and by cancelAll', () => {
    const h = setup()
    h.editing.begin(first, 'salary')
    h.editing.begin(people[1]!, 'salary')
    h.editing.cancel(first)
    expect(h.editing.isEditing(first.id)).toBe(false)
    expect(h.editing.isEditing(people[1]!.id)).toBe(true)

    h.editing.cancelAll()
    expect(h.editing.editingIds.value).toEqual([])
    h.dispose()
  })

  it('survives a re-sort and a page change, because it is keyed by row id', async () => {
    const h = setup()
    const target = people[4]!
    h.editing.begin(target, 'salary')
    h.editing.setValue(target, columns[2]!, '1')

    h.state.toggleSort('name')
    h.state.setPage(2)
    await nextTick()

    expect(h.editing.isEditing(target.id)).toBe(true)
    expect(h.editing.stateFor(target.id)!.draft).toEqual({ salary: 1 })
    h.dispose()
  })
})

describe('which cell holds the editor', () => {
  it('is only the active one in cell mode', () => {
    const h = setup({}, 'cell')
    h.editing.begin(first, 'salary')
    expect(h.editing.isEditing(first.id, 'salary')).toBe(true)
    expect(h.editing.isEditing(first.id, 'name')).toBe(false)
    h.dispose()
  })

  it('is every cell in row mode', () => {
    const h = setup({}, 'row')
    h.editing.begin(first)
    expect(h.editing.isEditing(first.id, 'salary')).toBe(true)
    expect(h.editing.isEditing(first.id, 'name')).toBe(true)
    h.dispose()
  })

  it('follows the mode when it changes, without reopening the draft', () => {
    const h = setup({}, 'cell')
    h.editing.begin(first, 'salary')
    expect(h.editing.isEditing(first.id, 'name')).toBe(false)
    h.editMode.value = 'row'
    expect(h.editing.isEditing(first.id, 'name')).toBe(true)
    h.dispose()
  })
})

describe('isEditable', () => {
  it('is false for a column that never opted in', () => {
    const h = setup()
    expect(h.editing.isEditable(first, { id: 'name' })).toBe(false)
    expect(h.editing.isEditable(first, columns[0]!)).toBe(true)
    h.dispose()
  })

  it('lets the caller veto a whole row', () => {
    const h = setup({ isEditable: (row) => row.active })
    expect(h.editing.isEditable(people.find((p) => p.active)!, columns[0]!)).toBe(true)
    expect(h.editing.isEditable(people.find((p) => !p.active)!, columns[0]!)).toBe(false)
    h.dispose()
  })

  it('is false while the row is saving', async () => {
    const gate = deferred<void>()
    const h = setup({ save: () => gate.promise })
    h.editing.begin(first, 'salary')
    h.editing.setValue(first, columns[2]!, '1')
    const pending = h.editing.commit(first)

    expect(h.editing.isEditable(first, columns[0]!)).toBe(false)
    expect(h.editing.saving.value).toBe(true)

    gate.resolve()
    await pending
    h.dispose()
  })
})

describe('commit', () => {
  it('hands the save a patch, the row, and the row it would become', async () => {
    const h = setup()
    h.editing.begin(first, 'salary')
    h.editing.setValue(first, columns[2]!, '92000')

    await expect(h.editing.commit(first)).resolves.toBe(true)

    expect(h.saves).toHaveLength(1)
    expect(h.saves[0]!.id).toBe(first.id)
    expect(h.saves[0]!.patch).toEqual({ salary: 92000 })
    expect(h.saves[0]!.nextRow.salary).toBe(92000)
    expect(h.saves[0]!.nextRow.name).toBe(first.name)
    expect(h.saves[0]!.row.salary).toBe(first.salary)
    h.dispose()
  })

  it('hands over a patch detached from the reactive draft', async () => {
    const h = setup()
    h.editing.begin(first, 'salary')
    h.editing.setValue(first, columns[2]!, '1')
    await h.editing.commit(first)
    const held = h.saves[0]!.patch

    h.editing.begin(first, 'salary')
    h.editing.setValue(first, columns[2]!, '2')
    // The object the save was given still says what it was given.
    expect(held).toEqual({ salary: 1 })
    h.dispose()
  })

  it('applies the saved row and closes the draft', async () => {
    const h = setup()
    h.editing.begin(first, 'salary')
    h.editing.setValue(first, columns[2]!, '92000')
    await h.editing.commit(first)

    expect(h.rowFor(first.id).salary).toBe(92000)
    expect(h.editing.isEditing(first.id)).toBe(false)
    h.dispose()
  })

  it('adopts the row the server sent back, over the one it computed', async () => {
    const h = setup({
      save: async ({ nextRow }) => ({ ...nextRow, salary: 50, name: 'Normalised' }),
    })
    h.editing.begin(first, 'salary')
    h.editing.setValue(first, columns[2]!, '92000')
    await h.editing.commit(first)

    expect(h.rowFor(first.id).salary).toBe(50)
    expect(h.rowFor(first.id).name).toBe('Normalised')
    h.dispose()
  })

  it('closes an untouched draft without asking the server anything', async () => {
    const h = setup()
    h.editing.begin(first, 'salary')
    await expect(h.editing.commit(first)).resolves.toBe(true)
    expect(h.saves).toHaveLength(0)
    expect(h.editing.isEditing(first.id)).toBe(false)
    h.dispose()
  })

  it('is a no-op for a row with no draft at all', async () => {
    const h = setup()
    await expect(h.editing.commit(first)).resolves.toBe(true)
    expect(h.saves).toHaveLength(0)
    h.dispose()
  })

  it('refuses to start a second save while one is in flight', async () => {
    const gate = deferred<void>()
    const h = setup({ save: () => gate.promise })
    h.editing.begin(first, 'salary')
    h.editing.setValue(first, columns[2]!, '1')

    const pending = h.editing.commit(first)
    await expect(h.editing.commit(first)).resolves.toBe(false)

    gate.resolve()
    await pending
    h.dispose()
  })

  it('falls back to source.refresh() when no apply was given', async () => {
    const scope = effectScope()
    const refresh = vi.fn()
    const rows = shallowRef<Person[]>([...people])
    const editing = scope.run(() => {
      const state = useTableState({ pageSize: 3 })
      const source = useLocalDataSource<Person>(rows, columns, state.query, { debounceMs: 0 })
      return useRowEditing<Person>(
        { ...source, refresh },
        columns,
        { save: async () => undefined },
      )
    })!

    editing.begin(first, 'salary')
    editing.setValue(first, columns[2]!, '1')
    await editing.commit(first)
    expect(refresh).toHaveBeenCalledTimes(1)
    scope.stop()
  })
})

describe('validation', () => {
  it('stops the save and names the field', async () => {
    const h = setup()
    h.editing.begin(first, 'salary')
    h.editing.setValue(first, columns[2]!, 'abc')

    await expect(h.editing.commit(first)).resolves.toBe(false)
    expect(h.saves).toHaveLength(0)
    expect(h.editing.errorFor(first.id, 'salary')).toBe('Not a number')
    expect(h.editing.stateFor(first.id)!.status).toBe('error')
    h.dispose()
  })

  it('clears a message as the user retypes', async () => {
    const h = setup()
    h.editing.begin(first, 'salary')
    h.editing.setValue(first, columns[2]!, 'abc')
    await h.editing.commit(first)
    expect(h.editing.errorFor(first.id, 'salary')).toBe('Not a number')

    h.editing.setValue(first, columns[2]!, '5')
    expect(h.editing.errorFor(first.id, 'salary')).toBeNull()
    expect(h.editing.stateFor(first.id)!.status).toBe('editing')
    h.dispose()
  })

  it('runs the cross-field rule against the row as it would be', async () => {
    const h = setup({
      validate: (next) => (next.active && next.salary === null ? 'An active row needs a salary' : null),
    })
    const active = people.find((p) => p.active && p.salary !== null)!
    h.editing.begin(active, 'salary')
    h.editing.setValue(active, columns[2]!, '')

    await expect(h.editing.commit(active)).resolves.toBe(false)
    expect(h.editing.errorFor(active.id)).toBe('An active row needs a salary')
    expect(h.saves).toHaveLength(0)
    h.dispose()
  })

  it('lets the cross-field rule blame a cell instead of the row', async () => {
    const h = setup({ validate: () => ({ salary: 'Out of band' }) })
    h.editing.begin(first, 'salary')
    h.editing.setValue(first, columns[2]!, '1')

    await h.editing.commit(first)
    expect(h.editing.errorFor(first.id, 'salary')).toBe('Out of band')
    expect(h.editing.errorFor(first.id)).toBeNull()
    h.dispose()
  })
})

describe('a rejected save', () => {
  it('keeps the draft so the edit is not lost, and can be retried', async () => {
    let attempt = 0
    const h = setup({
      save: async (change) => {
        attempt += 1
        if (attempt === 1) throw new Error('503')
        h.saves.push(change)
      },
    })
    h.editing.begin(first, 'salary')
    h.editing.setValue(first, columns[2]!, '92000')

    await expect(h.editing.commit(first)).resolves.toBe(false)
    expect(h.editing.isEditing(first.id)).toBe(true)
    expect(h.editing.stateFor(first.id)!.draft).toEqual({ salary: 92000 })
    expect(h.rowFor(first.id).salary).toBe(first.salary)

    // The same call is the retry — the draft never went anywhere.
    await expect(h.editing.commit(first)).resolves.toBe(true)
    expect(h.rowFor(first.id).salary).toBe(92000)
    h.dispose()
  })

  it('puts the messages it carries onto the right cells', async () => {
    const h = setup({
      save: async () => {
        throw { fields: { name: 'Already taken' } }
      },
    })
    h.editing.begin(first, 'name')
    h.editing.setValue(first, columns[0]!, 'Ada')

    await h.editing.commit(first)
    expect(h.editing.errorFor(first.id, 'name')).toBe('Already taken')
    // A rejection that named a field is not also a row-level failure.
    expect(h.editing.errorFor(first.id)).toBeNull()
    h.dispose()
  })

  it('shows the error message when it named no field', async () => {
    const h = setup({
      save: async () => {
        throw new Error('Simulated server error (503)')
      },
    })
    h.editing.begin(first, 'name')
    h.editing.setValue(first, columns[0]!, 'Ada')
    await h.editing.commit(first)
    expect(h.editing.errorFor(first.id)).toBe('Simulated server error (503)')
    h.dispose()
  })

  it('falls back to a message of its own when the rejection carried nothing', async () => {
    const h = setup({
      save: async () => {
        throw { status: 500 }
      },
    })
    h.editing.begin(first, 'name')
    h.editing.setValue(first, columns[0]!, 'Ada')
    await h.editing.commit(first)
    expect(h.editing.errorFor(first.id)).toBe(SAVE_FAILED_MESSAGE)
    h.dispose()
  })

  it('reports through onError, and a success through onSaved', async () => {
    const onError = vi.fn()
    const onSaved = vi.fn()
    let fail = true
    const h = setup({
      onError,
      onSaved,
      save: async () => {
        if (fail) throw new Error('nope')
      },
    })
    h.editing.begin(first, 'salary')
    h.editing.setValue(first, columns[2]!, '1')
    await h.editing.commit(first)
    expect(onError).toHaveBeenCalledTimes(1)
    expect(onSaved).not.toHaveBeenCalled()

    fail = false
    await h.editing.commit(first)
    expect(onSaved).toHaveBeenCalledTimes(1)
    expect((onSaved.mock.calls[0]![0] as Person).salary).toBe(1)
    h.dispose()
  })

  it('takes a caller mapping over its own', async () => {
    const h = setup({
      save: async () => {
        throw { code: 'DUP', column: 'name' }
      },
      mapError: (error) => ({ fields: { [(error as { column: string }).column]: 'Mapped' } }),
    })
    h.editing.begin(first, 'name')
    h.editing.setValue(first, columns[0]!, 'Ada')
    await h.editing.commit(first)
    expect(h.editing.errorFor(first.id, 'name')).toBe('Mapped')
    h.dispose()
  })
})

describe('optimistic', () => {
  it('applies before the server answers, and keeps it when the save succeeds', async () => {
    const gate = deferred<void>()
    const h = setup({ optimistic: true, save: () => gate.promise })
    h.editing.begin(first, 'salary')
    h.editing.setValue(first, columns[2]!, '92000')

    const pending = h.editing.commit(first)
    expect(h.rowFor(first.id).salary).toBe(92000)

    gate.resolve()
    await pending
    expect(h.rowFor(first.id).salary).toBe(92000)
    expect(h.editing.isEditing(first.id)).toBe(false)
    h.dispose()
  })

  it('rolls the row back when the save fails', async () => {
    const gate = deferred<void>()
    const h = setup({ optimistic: true, save: () => gate.promise })
    h.editing.begin(first, 'salary')
    h.editing.setValue(first, columns[2]!, '92000')

    const pending = h.editing.commit(first)
    expect(h.rowFor(first.id).salary).toBe(92000)

    gate.reject(new Error('503'))
    await pending
    expect(h.rowFor(first.id).salary).toBe(first.salary)
    expect(h.editing.isEditing(first.id)).toBe(true)
    h.dispose()
  })

  it('still lets the server correct what it applied', async () => {
    const h = setup({
      optimistic: true,
      save: async ({ nextRow }) => ({ ...nextRow, salary: 7 }),
    })
    h.editing.begin(first, 'salary')
    h.editing.setValue(first, columns[2]!, '92000')
    await h.editing.commit(first)
    expect(h.rowFor(first.id).salary).toBe(7)
    h.dispose()
  })
})

describe('a save that outlives its draft', () => {
  it('is ignored once the row has been cancelled', async () => {
    const gate = deferred<void>()
    const h = setup({ save: () => gate.promise })
    h.editing.begin(first, 'salary')
    h.editing.setValue(first, columns[2]!, '92000')
    const pending = h.editing.commit(first)

    h.editing.cancel(first)
    gate.resolve()

    await expect(pending).resolves.toBe(false)
    // Nothing was written: the user took the edit back before it landed.
    expect(h.rowFor(first.id).salary).toBe(first.salary)
    h.dispose()
  })

  it('is aborted, so a save that watches the signal can stop early', async () => {
    const signals: AbortSignal[] = []
    const gate = deferred<void>()
    const h = setup({
      save: ({ signal }) => {
        signals.push(signal)
        return gate.promise
      },
    })
    h.editing.begin(first, 'salary')
    h.editing.setValue(first, columns[2]!, '1')
    const pending = h.editing.commit(first)

    expect(signals[0]!.aborted).toBe(false)
    h.editing.cancel(first)
    expect(signals[0]!.aborted).toBe(true)

    gate.resolve()
    await pending
    h.dispose()
  })

  it('is aborted when the scope goes away', async () => {
    const signals: AbortSignal[] = []
    const gate = deferred<void>()
    const h = setup({
      save: ({ signal }) => {
        signals.push(signal)
        return gate.promise
      },
    })
    h.editing.begin(first, 'salary')
    h.editing.setValue(first, columns[2]!, '1')
    const pending = h.editing.commit(first)

    h.dispose()
    expect(signals[0]!.aborted).toBe(true)
    gate.resolve()
    await expect(pending).resolves.toBe(false)
  })
})

describe('an edit that changes which rows match', () => {
  it('lets the row leave the filtered set, rather than pinning it in place', async () => {
    const h = setup()
    h.state.setFilter('department', valuesFilter([first.department]))
    await nextTick()
    expect(h.source.filteredRows.value.some((row) => row.id === first.id)).toBe(true)

    h.editing.begin(first, 'department')
    h.editing.setValue(first, columns[1]!, 'Somewhere Else')
    await h.editing.commit(first)
    await nextTick()

    expect(h.source.filteredRows.value.some((row) => row.id === first.id)).toBe(false)
    h.dispose()
  })
})
