import type { PinSide } from './types'
import type { ColumnLayoutState } from './useColumns'

/** The parts of a layout that can be saved independently. */
export type ColumnLayoutField = keyof ColumnLayoutState

/**
 * The slice of the `Storage` DOM interface this needs. Typed structurally so a
 * plain object works in tests and on the server.
 */
export interface StorageLike {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
  removeItem: (key: string) => void
}

/** Storage key, which fields to keep, and where to keep them. */
export interface ColumnStorageOptions {
  key: string
  /**
   * Which parts of the layout to save. Defaults to all of them — a user who
   * pins or resizes a column expects that to stick just as much as hiding one.
   * Narrow it when some part is per-screen rather than per-user, e.g.
   * `fields: ['hidden', 'order']` to let widths follow the viewport.
   */
  fields?: readonly ColumnLayoutField[]
  /** Defaults to `window.localStorage`. Pass `sessionStorage`, or a stub. */
  storage?: StorageLike | (() => StorageLike | undefined)
}

/** The four layout fields persisted unless you narrow them. */
export const DEFAULT_COLUMN_LAYOUT_FIELDS: readonly ColumnLayoutField[] = [
  'hidden',
  'order',
  'widths',
  'pinned',
]

/**
 * Resolves the backing store, tolerating every way it can be unavailable:
 * server rendering (no `window`), and browsers that throw on the property
 * access itself when storage is disabled.
 */
function resolveStorage(options: ColumnStorageOptions): StorageLike | undefined {
  const source = options.storage
  try {
    if (typeof source === 'function') return source()
    if (source) return source
    if (typeof window === 'undefined') return undefined
    return window.localStorage ?? undefined
  } catch {
    return undefined
  }
}

function stringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  // Dedupe: a repeated id in `order` would place the column twice.
  return [...new Set(value.filter((entry): entry is string => typeof entry === 'string'))]
}

function widthMap(value: unknown): Record<string, number> | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  const result: Record<string, number> = {}
  for (const [id, width] of Object.entries(value)) {
    if (typeof width === 'number' && Number.isFinite(width) && width > 0) result[id] = width
  }
  return result
}

function pinMap(value: unknown): Record<string, PinSide | false> | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  const result: Record<string, PinSide | false> = {}
  for (const [id, side] of Object.entries(value)) {
    if (side === 'left' || side === 'right' || side === false) result[id] = side
  }
  return result
}

/**
 * Drops anything malformed from a stored layout rather than trusting it.
 *
 * Only well-formed entries of the requested fields survive. Unknown column ids
 * are deliberately kept: `useColumns` already ignores ids it cannot resolve,
 * and dropping them here would erase a saved layout for anyone whose column
 * set is built asynchronously.
 */
export function sanitizeColumnLayout(
  raw: unknown,
  fields: readonly ColumnLayoutField[] = DEFAULT_COLUMN_LAYOUT_FIELDS,
): Partial<ColumnLayoutState> | undefined {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return undefined
  const input = raw as Record<string, unknown>
  const layout: Partial<ColumnLayoutState> = {}

  if (fields.includes('hidden')) {
    const hidden = stringList(input.hidden)
    if (hidden) layout.hidden = hidden
  }
  if (fields.includes('order')) {
    const order = stringList(input.order)
    if (order) layout.order = order
  }
  if (fields.includes('widths')) {
    const widths = widthMap(input.widths)
    if (widths) layout.widths = widths
  }
  if (fields.includes('pinned')) {
    const pinned = pinMap(input.pinned)
    if (pinned) layout.pinned = pinned
  }

  return Object.keys(layout).length > 0 ? layout : undefined
}

/**
 * Reads a saved layout. Returns `undefined` for anything unusable — a missing,
 * corrupt or foreign entry must not take the table down with it.
 */
export function readColumnLayout(
  options: ColumnStorageOptions,
): Partial<ColumnLayoutState> | undefined {
  const storage = resolveStorage(options)
  if (!storage) return undefined

  let raw: string | null
  try {
    raw = storage.getItem(options.key)
  } catch {
    return undefined
  }
  if (!raw) return undefined

  try {
    return sanitizeColumnLayout(JSON.parse(raw), options.fields ?? DEFAULT_COLUMN_LAYOUT_FIELDS)
  } catch {
    return undefined
  }
}

/** Saves the requested fields. Storage failures (quota, private mode) are ignored. */
export function writeColumnLayout(
  layout: ColumnLayoutState,
  options: ColumnStorageOptions,
): void {
  const storage = resolveStorage(options)
  if (!storage) return

  const fields = options.fields ?? DEFAULT_COLUMN_LAYOUT_FIELDS
  const payload: Partial<ColumnLayoutState> = {}
  for (const field of fields) {
    // Assigning through a union of value types needs the widening cast; the
    // field list itself is what keeps the keys honest.
    ;(payload as Record<string, unknown>)[field] = layout[field]
  }

  try {
    storage.setItem(options.key, JSON.stringify(payload))
  } catch {
    /* Storage is full or unavailable — the layout stays in memory. */
  }
}

/** Forgets the saved layout. The in-memory one is untouched. */
export function clearColumnLayout(options: ColumnStorageOptions): void {
  const storage = resolveStorage(options)
  if (!storage) return
  try {
    storage.removeItem(options.key)
  } catch {
    /* Nothing to do — the entry is unreachable either way. */
  }
}

/**
 * Resolves the storage options into a concrete key, field list and
 * `StorageLike`.
 *
 * `storage: 'my-table'` is shorthand for `storage: { key: 'my-table' }`.
 */
export function normalizeColumnStorage(
  storage: string | ColumnStorageOptions | undefined,
): ColumnStorageOptions | undefined {
  if (!storage) return undefined
  return typeof storage === 'string' ? { key: storage } : storage
}
