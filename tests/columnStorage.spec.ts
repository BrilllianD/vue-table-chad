import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, effectScope, h, nextTick } from 'vue'
import { useColumns } from '../src/core/useColumns'
import { useLocalDataSource } from '../src/core/useLocalDataSource'
import { useTableState } from '../src/core/useTableState'
import DataTable from '../src/components/preset/DataTable.vue'
import {
  clearColumnLayout,
  readColumnLayout,
  sanitizeColumnLayout,
  writeColumnLayout,
  type ColumnStorageOptions,
  type StorageLike,
} from '../src/core/columnStorage'
import type { Person } from './fixtures'
import { people, personColumns } from './fixtures'

const KEY = 'vue-table:test'

/** An in-memory `Storage`, so a test never depends on the environment's one. */
function memoryStorage(seed: Record<string, string> = {}): StorageLike & { map: Map<string, string> } {
  const map = new Map(Object.entries(seed))
  return {
    map,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
  }
}

function setup(options: Parameters<typeof useColumns>[1] = {}) {
  const scope = effectScope()
  const result = scope.run(() => useColumns<Person>(personColumns, options))!
  return { columns: result, dispose: () => scope.stop() }
}

function saved(storage: StorageLike): unknown {
  const raw = storage.getItem(KEY)
  return raw === null ? null : JSON.parse(raw)
}

describe('useColumns persistence', () => {
  it('restores hidden columns and order from storage', () => {
    const storage = memoryStorage({
      [KEY]: JSON.stringify({ hidden: ['salary'], order: ['active', 'name'] }),
    })
    const { columns, dispose } = setup({ storage: { key: KEY, storage } })

    expect(columns.isVisible('salary')).toBe(false)
    expect(columns.visible.value.map((column) => column.id)).toEqual([
      'active',
      'name',
      'department',
      'hiredAt',
    ])
    dispose()
  })

  it('writes visibility and order back on every change', async () => {
    const storage = memoryStorage()
    const { columns, dispose } = setup({ storage: { key: KEY, storage } })

    columns.toggleVisibility('email', false)
    columns.toggleVisibility('salary')
    await nextTick()
    expect(saved(storage)).toMatchObject({ hidden: ['email', 'salary'], order: [] })

    columns.moveColumnTo('active', 'name', 'before')
    await nextTick()
    expect(saved(storage)).toMatchObject({
      hidden: ['email', 'salary'],
      order: ['active', 'name', 'department', 'salary', 'hiredAt'],
    })
    dispose()
  })

  // Pinning or resizing a column is as deliberate as hiding one, so the default
  // payload is the whole layout.
  it('saves widths and pins by default', async () => {
    const storage = memoryStorage()
    const { columns, dispose } = setup({ storage: { key: KEY, storage } })

    columns.setWidth('name', 300)
    columns.setPinned('name', 'left')
    await nextTick()

    expect(saved(storage)).toEqual({
      hidden: [],
      order: [],
      widths: { name: 300 },
      pinned: { name: 'left' },
    })
    dispose()
  })

  it('restores widths and pins', () => {
    const storage = memoryStorage({
      [KEY]: JSON.stringify({ widths: { name: 300 }, pinned: { salary: 'right' } }),
    })
    const { columns, dispose } = setup({ storage: { key: KEY, storage } })

    const byId = (id: string) => columns.all.value.find((column) => column.id === id)!
    expect(byId('name').resolvedWidth).toBe(300)
    expect(byId('salary').pinned).toBe('right')
    // Pinned columns are hoisted to their edge, which is the visible proof.
    expect(columns.visible.value.at(-1)!.id).toBe('salary')
    dispose()
  })

  it('narrows the payload to the requested fields', async () => {
    const storage = memoryStorage()
    const { columns, dispose } = setup({
      storage: { key: KEY, storage, fields: ['hidden', 'order'] },
    })

    columns.setWidth('name', 300)
    columns.setPinned('name', 'left')
    await nextTick()

    expect(saved(storage)).toEqual({ hidden: [], order: [] })
    dispose()
  })

  it('lets a saved layout win over initialLayout, field by field', () => {
    const storage = memoryStorage({ [KEY]: JSON.stringify({ hidden: ['salary'] }) })
    const { columns, dispose } = setup({
      initialLayout: { hidden: ['name'], order: ['active', 'name'] },
      storage: { key: KEY, storage },
    })

    // `hidden` came from storage; `order` had no saved entry, so the initial
    // layout still supplies it rather than being discarded wholesale.
    expect(columns.isVisible('salary')).toBe(false)
    expect(columns.isVisible('name')).toBe(true)
    expect(columns.all.value.map((column) => column.id).slice(0, 2)).toEqual(['active', 'name'])
    dispose()
  })

  it('ignores a corrupt entry instead of throwing', () => {
    const storage = memoryStorage({ [KEY]: '{ not json' })
    const { columns, dispose } = setup({ storage: { key: KEY, storage } })

    expect(columns.all.value.map((column) => column.id)).toEqual(
      personColumns.map((column) => column.id),
    )
    dispose()
  })

  it('drops malformed fields but keeps the well-formed ones', () => {
    const storage = memoryStorage({
      [KEY]: JSON.stringify({ hidden: ['salary', 42, null], order: 'name,active' }),
    })
    const { columns, dispose } = setup({ storage: { key: KEY, storage } })

    expect(columns.layout.value.hidden).toEqual(['salary'])
    expect(columns.layout.value.order).toEqual([])
    dispose()
  })

  it('accepts a bare key as shorthand and defaults to localStorage', async () => {
    localStorage.removeItem(KEY)
    const { columns, dispose } = setup({ storage: KEY })

    columns.toggleVisibility('salary', false)
    await nextTick()
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual({
      hidden: ['salary'],
      order: [],
      widths: {},
      pinned: {},
    })

    dispose()
    localStorage.removeItem(KEY)
  })

  it('writes nothing when no storage is configured', async () => {
    const { columns, dispose } = setup()
    columns.toggleVisibility('salary', false)
    await nextTick()
    expect(localStorage.getItem(KEY)).toBeNull()
    dispose()
  })

  it('clearStored forgets the entry without changing the live layout', async () => {
    const storage = memoryStorage()
    const { columns, dispose } = setup({ storage: { key: KEY, storage } })

    columns.toggleVisibility('salary', false)
    await nextTick()
    columns.clearStored()

    expect(storage.getItem(KEY)).toBeNull()
    expect(columns.isVisible('salary')).toBe(false)
    dispose()
  })

  it('survives a storage that throws on every access', async () => {
    const throwing: StorageLike = {
      getItem: () => {
        throw new Error('denied')
      },
      setItem: () => {
        throw new Error('quota')
      },
      removeItem: () => {
        throw new Error('denied')
      },
    }
    const { columns, dispose } = setup({ storage: { key: KEY, storage: throwing } })

    columns.toggleVisibility('salary', false)
    await nextTick()
    expect(columns.isVisible('salary')).toBe(false)
    dispose()
  })
})

describe('DataTable storage-key', () => {
  function mountTable(props: Record<string, unknown> = {}) {
    const Host = defineComponent({
      setup() {
        const state = useTableState({ pageSize: 3 })
        const source = useLocalDataSource<Person>(people, personColumns, state.query)
        return () => h(DataTable as never, { columns: personColumns, source, state, ...props })
      },
    })
    return mount(Host, { attachTo: document.body })
  }

  const headerIds = (wrapper: ReturnType<typeof mountTable>) =>
    wrapper.findAll('thead th[data-column]').map((th) => th.attributes('data-column'))

  const columnsApi = (wrapper: ReturnType<typeof mountTable>) =>
    (wrapper.findComponent({ name: 'TableRoot' }).vm as unknown as {
      columns: ReturnType<typeof useColumns<Person>>
    }).columns

  it('survives a remount with the columns hidden and reordered', async () => {
    localStorage.removeItem(KEY)

    const first = mountTable({ storageKey: KEY })
    // `TableRoot` exposes the composable the header UI drives.
    const api = columnsApi(first)
    api.toggleVisibility('salary', false)
    api.moveColumnTo('active', 'name', 'before')
    await nextTick()
    first.unmount()

    const second = mountTable({ storageKey: KEY })
    expect(headerIds(second)).toEqual(['active', 'name', 'department', 'hiredAt'])
    second.unmount()
    localStorage.removeItem(KEY)
  })

  it('stays in memory when no storage-key is given', async () => {
    localStorage.removeItem(KEY)
    const wrapper = mountTable()
    columnsApi(wrapper).toggleVisibility('salary', false)
    await nextTick()

    expect(localStorage.getItem(KEY)).toBeNull()
    wrapper.unmount()
  })
})

describe('column layout storage helpers', () => {
  const options = (storage: StorageLike): ColumnStorageOptions => ({ key: KEY, storage })

  it('round-trips a layout through read/write', () => {
    const storage = memoryStorage()
    const layout = { hidden: ['a'], order: ['b', 'a'], widths: { a: 120 }, pinned: { a: 'left' as const } }
    writeColumnLayout(layout, options(storage))
    expect(readColumnLayout(options(storage))).toEqual(layout)
  })

  it('writes only the requested fields', () => {
    const storage = memoryStorage()
    writeColumnLayout(
      { hidden: ['a'], order: ['b', 'a'], widths: { a: 120 }, pinned: { a: 'left' } },
      { key: KEY, storage, fields: ['hidden'] },
    )
    expect(JSON.parse(storage.getItem(KEY)!)).toEqual({ hidden: ['a'] })
  })

  it('returns undefined for a missing entry', () => {
    expect(readColumnLayout(options(memoryStorage()))).toBeUndefined()
  })

  it('clears an entry', () => {
    const storage = memoryStorage({ [KEY]: '{}' })
    clearColumnLayout(options(storage))
    expect(storage.getItem(KEY)).toBeNull()
  })

  it('resolves a lazy storage getter', () => {
    const storage = memoryStorage({ [KEY]: JSON.stringify({ hidden: ['a'] }) })
    const get = vi.fn(() => storage)
    expect(readColumnLayout({ key: KEY, storage: get })).toEqual({ hidden: ['a'] })
    expect(get).toHaveBeenCalled()
  })

  it('sanitizes untrusted input', () => {
    expect(sanitizeColumnLayout(null)).toBeUndefined()
    expect(sanitizeColumnLayout([])).toBeUndefined()
    expect(sanitizeColumnLayout({ nothing: true })).toBeUndefined()
    // Duplicate ids would place a column twice.
    expect(sanitizeColumnLayout({ order: ['a', 'a', 'b'] })).toEqual({ order: ['a', 'b'] })
    expect(
      sanitizeColumnLayout({ widths: { a: 0, b: -5, c: 'wide', d: 120 } }, ['widths']),
    ).toEqual({ widths: { d: 120 } })
    expect(
      sanitizeColumnLayout({ pinned: { a: 'left', b: false, c: 'middle' } }, ['pinned']),
    ).toEqual({ pinned: { a: 'left', b: false } })
  })
})
