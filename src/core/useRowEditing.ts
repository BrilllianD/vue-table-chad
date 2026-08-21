import {
  computed,
  onScopeDispose,
  reactive,
  shallowRef,
  toValue,
  type ComputedRef,
  type MaybeRefOrGetter,
  type ShallowRef,
} from 'vue'
import type { ColumnDef, DataSource, RowId } from './types'
import {
  isColumnEditable,
  parseCellInput,
  validateDraft,
  type CellErrors,
} from './editing'
import { readValue } from './sorting'
import { defaultRowId } from './useRowSelection'

/** `'cell'` commits each field on its own; `'row'` commits a whole draft at once. */
export type EditMode = 'cell' | 'row'

/** Shown when a save rejected with nothing that could be turned into a message. */
export const SAVE_FAILED_MESSAGE = 'Could not save'

/** What a `save` receives: the row, what changed, what it would become. */
export interface RowChange<TRow> {
  id: RowId
  /** The row as it is now, before the edit. */
  row: TRow
  /**
   * Only the fields that changed, keyed by **column id** and already parsed to
   * the column's own type. A plain object, detached from the reactive draft, so
   * a `save` can hold it or serialise it without it shifting underneath.
   */
  patch: Record<string, unknown>
  /** The row as it would be — `patch` applied through each column's `setValue`. */
  nextRow: TRow
  /** Aborted when a newer save for the same row starts, or the scope goes away. */
  signal: AbortSignal
}

/** A rejected save, unpacked: a row-level message and/or per-field messages. */
export interface RowSaveFailure {
  message?: string
  /** Keyed by column id, so a server rejection lands in the same slot a validator would. */
  fields?: CellErrors
}

/** One row's open draft: what changed, what is wrong with it, and where it is. */
export interface RowEditState {
  /** Parsed values by column id. `undefined` means the input would not coerce. */
  draft: Record<string, unknown>
  /**
   * Exactly what each editor produced, by column id. Kept beside `draft`
   * because a value that will not parse still has to stay on screen — a number
   * box that silently emptied itself when you mistyped would be unusable.
   */
  inputs: Record<string, unknown>
  errors: CellErrors
  /** A cross-field failure, or a save rejection that named no field. */
  error: string | null
  status: 'editing' | 'saving' | 'error'
  /** Which cell holds the editor in `'cell'` mode; `null` in `'row'` mode. */
  activeColumnId: string | null
}

/** getRowId, mode, optimistic, validate, save, apply, mapError and the two callbacks. */
export interface UseRowEditingOptions<TRow> {
  /** Stable identity for a row. Defaults to `row.id`. */
  getRowId?: (row: TRow) => RowId
  /** Accepts a ref or getter, so a table can switch modes without remounting. */
  mode?: MaybeRefOrGetter<EditMode>
  /**
   * Apply the edit before the server answers, and roll it back if the save
   * fails. Off by default: waiting lets the row adopt whatever the server
   * returns — a normalised value, a computed field — in one visible change
   * rather than two.
   */
  optimistic?: boolean
  /** Rows the user may not edit at all, whatever their columns say. */
  isEditable?: (row: TRow) => boolean
  /**
   * The cross-field rule, handed the row **as it would be** so it can read
   * fields the draft did not touch. Return per-field messages to blame
   * particular cells, a string to blame the row, or `null` to allow it.
   */
  validate?: (next: TRow, draft: Record<string, unknown>) => CellErrors | string | null
  /**
   * Persists one row's change. Reject to fail the save — reject with an object
   * carrying `fields` to put messages on particular cells.
   */
  save: (change: RowChange<TRow>) => Promise<TRow | void>
  /**
   * Writes the saved row back into the data, because the table does not own it.
   *
   * Defaults to `source.refresh()`, which is right for a server source: it
   * refetches and the new row arrives. A local source holds the array *you*
   * gave it and cannot see a change you have not made, so pass an `apply` that
   * replaces the row:
   *
   *   apply: (next) => { rows.value = replaceRowIn(rows.value, next, getRowId) }
   */
  apply?: (next: TRow, previous: TRow) => void
  /** Turns a rejection into messages. Defaults to reading `error.fields` and `error.message`. */
  mapError?: (error: unknown) => RowSaveFailure
  onSaved?: (row: TRow) => void
  onError?: (error: unknown, row: TRow) => void
}

/** Draft state, cell predicates, and the begin/cancel/commit mutators. */
export interface UseRowEditing<TRow> {
  /** Open drafts by row id. Replaced, never mutated, when a row opens or closes. */
  drafts: Readonly<ShallowRef<Map<RowId, RowEditState>>>
  mode: ComputedRef<EditMode>
  /** True while any row is being saved. */
  saving: ComputedRef<boolean>
  /** Ids of every row holding a draft — open, failed or in flight. */
  editingIds: ComputedRef<RowId[]>

  stateFor: (id: RowId) => RowEditState | undefined
  /** Whether a draft is open — for a particular cell, when given a column id. */
  isEditing: (id: RowId, columnId?: string) => boolean
  /** Whether this cell accepts an edit right now. False while the row saves. */
  isEditable: (row: TRow, column: ColumnDef<TRow>) => boolean
  /** True once a draft holds a value that differs from nothing at all. */
  isDirty: (id: RowId) => boolean
  /** What the editor should show: the raw input if touched, else the cell value. */
  inputFor: (row: TRow, column: ColumnDef<TRow>) => unknown
  /** What the cell would hold if the draft were applied: the parsed value, else the cell's. */
  valueFor: (row: TRow, column: ColumnDef<TRow>) => unknown
  /** A cell's message, or the row's when no column id is given. */
  errorFor: (id: RowId, columnId?: string) => string | null

  begin: (row: TRow, columnId?: string) => void
  setValue: (row: TRow, column: ColumnDef<TRow>, input: unknown) => void
  cancel: (row: TRow) => void
  cancelAll: () => void
  /** Validates, saves, applies. Resolves `true` only when the row was persisted. */
  commit: (row: TRow) => Promise<boolean>
  getRowId: (row: TRow) => RowId
}

/** Reads `fields` and `message` off a rejection, which is what most APIs throw. */
function defaultMapError(error: unknown): RowSaveFailure {
  const thrown = error as { fields?: unknown; message?: unknown } | null
  const fields =
    thrown && typeof thrown === 'object' && thrown.fields && typeof thrown.fields === 'object'
      ? (thrown.fields as CellErrors)
      : undefined
  const message =
    error instanceof Error ? error.message : typeof error === 'string' ? error : undefined
  return { fields, message }
}

/**
 * Inline editing: a draft per row, validated, persisted, and written back.
 *
 * Drafts are keyed by row id rather than by position, which is what lets one
 * survive a re-sort, a re-filter or a page change while it is open — the row
 * moves and the edit goes with it.
 *
 * Nothing here touches the data pipeline. Typing, validating and failing to
 * save all leave `filterRows`, `sortRows` and the aggregates entirely alone;
 * only a *successful* save moves rows, and it does so by handing the new row to
 * `apply`, which is the one place the table's data changes.
 */
export function useRowEditing<TRow>(
  source: DataSource<TRow>,
  columns: MaybeRefOrGetter<ColumnDef<TRow>[]>,
  options: UseRowEditingOptions<TRow>,
): UseRowEditing<TRow> {
  const getRowId = options.getRowId ?? defaultRowId<TRow>
  const mode = computed<EditMode>(() => toValue(options.mode) ?? 'cell')
  const mapError = options.mapError ?? defaultMapError
  const apply = options.apply ?? (() => source.refresh())
  const columnsOf = () => toValue(columns) ?? []

  /**
   * `shallowRef` around a Map of `reactive` states, and the split is the whole
   * performance story.
   *
   * The Map's identity changes only when a row opens or closes a draft, so a
   * keystroke does not invalidate every cell in the table. The per-row object
   * *is* deeply reactive, so the one row being typed into re-renders — and only
   * it. Holding plain objects in the shallowRef instead would re-render all
   * `pageSize` rows per character; holding the whole thing in a deep `ref`
   * would proxy every draft value twice over.
   */
  const drafts = shallowRef<Map<RowId, RowEditState>>(new Map())

  /**
   * One abort controller per row in flight.
   *
   * `useServerDataSource` needs a monotonic sequence *as well as* an abort,
   * because a query change can start a second fetch while the first is still
   * running. Here it cannot: `commit` refuses outright to start a second save
   * for a row already saving, and every other route to a new save — cancel,
   * re-edit — goes through `close`, which aborts first. So the only way a stale
   * response can arrive is through a controller that is already aborted, and
   * `signal.aborted` catches every one of them.
   */
  const controllers = new Map<RowId, AbortController>()

  function stateFor(id: RowId): RowEditState | undefined {
    return drafts.value.get(id)
  }

  function open(id: RowId): RowEditState {
    const existing = drafts.value.get(id)
    if (existing) return existing
    const state = reactive<RowEditState>({
      draft: {},
      inputs: {},
      errors: {},
      error: null,
      status: 'editing',
      activeColumnId: null,
    })
    const next = new Map(drafts.value)
    next.set(id, state)
    drafts.value = next
    return state
  }

  function close(id: RowId): void {
    if (!drafts.value.has(id)) return
    const next = new Map(drafts.value)
    next.delete(id)
    drafts.value = next
    controllers.get(id)?.abort()
    controllers.delete(id)
  }

  function begin(row: TRow, columnId?: string): void {
    const state = open(getRowId(row))
    // In row mode every editable cell is open at once, so there is no one
    // active cell to name; in cell mode this is the cell holding the editor.
    state.activeColumnId = mode.value === 'row' ? null : (columnId ?? null)
  }

  function setValue(row: TRow, column: ColumnDef<TRow>, input: unknown): void {
    const state = open(getRowId(row))
    state.inputs[column.id] = input
    state.draft[column.id] = parseCellInput(input, column, row)
    // A message describes a value that is no longer there. Clearing both as the
    // user retypes is what stops a corrected cell from still looking wrong.
    delete state.errors[column.id]
    state.error = null
    if (state.status === 'error') state.status = 'editing'
  }

  function isEditing(id: RowId, columnId?: string): boolean {
    const state = drafts.value.get(id)
    if (!state) return false
    if (columnId === undefined) return true
    return mode.value === 'row' || state.activeColumnId === columnId
  }

  function isEditable(row: TRow, column: ColumnDef<TRow>): boolean {
    if (!isColumnEditable(column, row)) return false
    if (options.isEditable && !options.isEditable(row)) return false
    return drafts.value.get(getRowId(row))?.status !== 'saving'
  }

  function isDirty(id: RowId): boolean {
    const state = drafts.value.get(id)
    return state ? Object.keys(state.draft).length > 0 : false
  }

  function inputFor(row: TRow, column: ColumnDef<TRow>): unknown {
    const state = drafts.value.get(getRowId(row))
    if (state && column.id in state.inputs) return state.inputs[column.id]
    return readValue(row, column)
  }

  function valueFor(row: TRow, column: ColumnDef<TRow>): unknown {
    const state = drafts.value.get(getRowId(row))
    if (state && column.id in state.draft) return state.draft[column.id]
    return readValue(row, column)
  }

  function errorFor(id: RowId, columnId?: string): string | null {
    const state = drafts.value.get(id)
    if (!state) return null
    if (columnId === undefined) return state.error
    return state.errors[columnId] ?? null
  }

  function cancel(row: TRow): void {
    close(getRowId(row))
  }

  function cancelAll(): void {
    for (const id of drafts.value.keys()) {
      controllers.get(id)?.abort()
      controllers.delete(id)
    }
    drafts.value = new Map()
  }

  async function commit(row: TRow): Promise<boolean> {
    const id = getRowId(row)
    const state = drafts.value.get(id)
    if (!state) return true
    if (state.status === 'saving') return false

    // Detached from the reactive state before it crosses into user code, for
    // the reason `useServerDataSource` clones its query: a caller must be able
    // to hold or serialise this without it shifting underneath.
    const patch = { ...state.draft }
    if (Object.keys(patch).length === 0) {
      close(id)
      return true
    }

    const result = validateDraft(row, patch, columnsOf(), options.validate)
    state.errors = result.fields
    state.error = result.error
    if (!result.nextRow) {
      state.status = 'error'
      return false
    }
    const nextRow = result.nextRow

    controllers.get(id)?.abort()
    const controller = new AbortController()
    controllers.set(id, controller)

    state.status = 'saving'
    if (options.optimistic) apply(nextRow, row)

    try {
      const saved = await options.save({ id, row, patch, nextRow, signal: controller.signal })
      if (controller.signal.aborted) return false

      // The server's row wins when it sent one back: it may have normalised a
      // value or filled a field only it can compute.
      const finalRow = (saved as TRow | undefined | void) ?? nextRow
      if (options.optimistic) {
        if (finalRow !== nextRow) apply(finalRow as TRow, nextRow)
      } else {
        apply(finalRow as TRow, row)
      }

      close(id)
      options.onSaved?.(finalRow as TRow)
      return true
    } catch (caught) {
      if (controller.signal.aborted) return false
      // Put the row back the way it was before anyone saw the optimistic edit.
      if (options.optimistic) apply(row, nextRow)

      const failure = mapError(caught)
      const fields = failure.fields ?? {}
      state.errors = fields
      state.error =
        failure.message ?? (Object.keys(fields).length > 0 ? null : SAVE_FAILED_MESSAGE)
      state.status = 'error'
      options.onError?.(caught, row)
      return false
    } finally {
      // Only the newest save may release the row; a straggler resolving late
      // must not clear the controller of one still in flight.
      if (controllers.get(id) === controller) controllers.delete(id)
    }
  }

  onScopeDispose(() => {
    for (const controller of controllers.values()) controller.abort()
    controllers.clear()
  })

  return {
    drafts,
    mode,
    saving: computed(() => {
      for (const state of drafts.value.values()) if (state.status === 'saving') return true
      return false
    }),
    editingIds: computed(() => [...drafts.value.keys()]),
    stateFor,
    isEditing,
    isEditable,
    isDirty,
    inputFor,
    valueFor,
    errorFor,
    begin,
    setValue,
    cancel,
    cancelAll,
    commit,
    getRowId,
  }
}
