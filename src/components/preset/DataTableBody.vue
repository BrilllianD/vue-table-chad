<script setup lang="ts" generic="TRow extends Record<string, unknown>">
/**
 * The preset's `<tbody>`: the message rows, the group bands, the data rows, and
 * everything about editing a cell inside one.
 *
 * The editing helpers live here rather than in `DataTable` because this is the
 * only place that calls them — they are all "this row, this cell", and a shell
 * that also owns them is a shell you have to read to understand a cell.
 * `DataTable` keeps what the shell is actually about: the scroll geometry, the
 * toolbar, the header and footer, the pager.
 *
 * Internal to the preset — not exported, not a primitive. It renders a
 * `<tbody>` as its root, so it must stay a direct child of `TableGrid`'s
 * `<table>`.
 *
 * Every slot it renders belongs to `DataTable`'s public API, so `DataTable`
 * forwards them down wholesale. Two of them — `cell:<id>` and `editor:<id>` —
 * carry a column id in the name, which is why that forwarding is a generic
 * `v-for` over the slots rather than a list of names.
 */
import { computed, nextTick, ref, watch } from 'vue'
import CellEditor from '../primitives/CellEditor.vue'
import VirtualBody from '../primitives/VirtualBody.vue'
import TableRow from '../primitives/TableRow.vue'
import TableGroupRow from '../primitives/TableGroupRow.vue'
import SelectionCheckbox from '../primitives/SelectionCheckbox.vue'
import type { DataSource, DisplayRow, ResolvedColumn, RowId } from '../../core/types'
import type { UseRowSelection } from '../../core/useRowSelection'
import type { UseRowEditing } from '../../core/useRowEditing'
import type { UseCellCursor } from '../../core/useCellCursor'
import type { CommitOrigin, CursorMove } from '../../core/cellCursor'

const props = defineProps<{
  columns: ResolvedColumn<TRow>[]
  /** The source's page, for the "nothing matched" test. */
  rows: TRow[]
  /** The same rows with group headers folded in — what actually renders. */
  displayRows: DisplayRow<TRow>[]
  source: DataSource<TRow>
  loading: boolean
  error: unknown
  selection: UseRowSelection<TRow> | undefined
  cursor: UseCellCursor<TRow> | undefined
  editing: UseRowEditing<TRow> | undefined
  rowKey: (row: TRow, index: number) => RowId
  selectable: boolean
  /** Shift- and Ctrl/Cmd-click on the row itself, not just on its checkbox. */
  rowClickSelect: boolean
  /**
   * Row mode against cell mode. Passed rather than derived: `DataTable` needs
   * it too, for the header and the footer, and one computed in two files is one
   * more thing that can drift.
   */
  rowMode: boolean
  actionsColumn: boolean
  /** Leading and trailing cells, for the rows that have to span them all. */
  extraColumns: number
  emptyMessage: string
  /**
   * Renders only the rows the viewport can show. Off, every display row is
   * rendered and the `<tbody>` is exactly what it always was.
   */
  virtual: boolean
  /** The height one row is laid out at, which windowing has to agree with. */
  rowHeight: number
  /** Rows kept beyond each edge of the viewport. */
  overscan?: number
  /** Measure each rendered row rather than trusting `rowHeight`. */
  measureRows?: boolean
  /** How close to the end of the list the window must come for `endReached`. */
  endThreshold?: number
  /**
   * How many header rows sit above the body, so a windowed row can number
   * itself over the whole table. `undefined` means "do not number" — which is
   * the right answer when every row is rendered.
   */
  headerRowCount?: number
  /** The element that scrolls. `null` until `DataTable`'s template ref lands. */
  scrollParent: HTMLElement | null
}>()

const emit = defineEmits<{
  rowClick: [row: TRow, event: MouseEvent]
  /** A row reached the server. Carries the row as it now stands. */
  rowSaved: [row: TRow]
  rowSaveError: [row: TRow, error: unknown]
  /** The window reached the end of the list — an infinite source's cue. */
  endReached: []
  /**
   * Which rows the window actually rendered.
   *
   * Travels up because the cursor's roving tabindex has to land on a cell that
   * exists, and only the body knows which rows those are. Ungrouped or not,
   * windowed or not, it is always "what a Tab can reach".
   */
  'update:renderedRowIds': [ids: RowId[]]
}>()

/**
 * What `VirtualBody` exposes, spelled out.
 *
 * `InstanceType<typeof VirtualBody>` does not work on a generic SFC — the
 * component is a function with a type parameter rather than a constructor —
 * and the two members below are all this component asks of it.
 */
interface VirtualBodyView {
  start: number
  end: number
  scrollToIndex: (index: number) => boolean
}

const body = ref<VirtualBodyView | null>(null)

/**
 * A display row's identity — the same string the `v-for` below keys on.
 *
 * `VirtualBody` uses it to keep the scroll offset pointing at the row it
 * pointed at before the list changed, which is what makes collapsing a band
 * while scrolled deep land somewhere the user recognises: the band's own header
 * row, since every row it was holding has just left the list.
 */
function displayRowKey(item: DisplayRow<TRow>, _index: number): unknown {
  return item.kind === 'group' ? `group:${item.group.key}` : props.rowKey(item.row, item.index)
}

/**
 * The window, as row identities, reported upwards whenever it moves.
 *
 * Only under a cursor: nothing else reads it, and asking every row in the
 * window for an id would make a read-only table pay for a feature it did not
 * turn on — `getRowId` throws for a row with no `id`, so it would be worse
 * than a waste.
 *
 * Read off `VirtualBody`'s exposed range rather than out of its slot, because
 * a slot is a render and this is a side effect: emitting from inside one would
 * write during the parent's own render pass.
 */
watch(
  () => {
    const view = body.value
    if (!props.cursor || !view) return undefined
    return [view.start, view.end, props.displayRows] as const
  },
  (window) => {
    const cursor = props.cursor
    if (!window || !cursor) return
    const [start, end, rows] = window
    const ids: RowId[] = []
    for (let index = start; index < end; index += 1) {
      const item = rows[index]
      if (item?.kind === 'row') ids.push(cursor.getRowId(item.row))
    }
    emit('update:renderedRowIds', ids)
  },
  { flush: 'post', immediate: true },
)

/**
 * Where each row sits in the display list, for finding the cursor's row when
 * the window has evicted it.
 *
 * `cursor.rowOffset` is the wrong number here: it counts data rows, and the
 * window counts display rows, so a table with group headers in it would scroll
 * to the wrong place by however many bands are above.
 *
 * Built only when there is something to look up with — a virtual table with a
 * cursor. At 100k rows this is a map the size of the dataset, and no table
 * without both needs it at all.
 */
const rowIndexById = computed(() => {
  const map = new Map<RowId, number>()
  const cursor = props.cursor
  if (!props.virtual || !cursor) return map
  const rows = props.displayRows
  for (let index = 0; index < rows.length; index += 1) {
    const item = rows[index]!
    if (item.kind === 'row') map.set(cursor.getRowId(item.row), index)
  }
  return map
})

/*
 * The cursor bridge.
 *
 * A cursor position is an identity, so moving it onto a row the window has
 * evicted is legal and does exactly the right thing to the model — but
 * `TableGrid` focuses by querying the DOM for `[data-row-id]`, and an evicted
 * row is not there to find, so the ring would walk off screen invisibly.
 *
 * So: scroll the window to it, then ask for focus again. Asking again rather
 * than reaching for `focusCursorCell` keeps this ignorant of how focus is
 * done; `requestFocus` is the same call every other mover here makes.
 *
 * `scrollToIndex` returning `false` — already rendered, or nothing to scroll —
 * is what stops this asking forever.
 */
watch(
  () => (props.cursor ? props.cursor.focusRequests.value : 0),
  () => {
    const cursor = props.cursor
    if (!props.virtual || !cursor) return
    const rowId = cursor.position.value?.rowId
    if (rowId === undefined) return
    const index = rowIndexById.value.get(rowId)
    if (index === undefined) return
    if (!body.value?.scrollToIndex(index)) return
    void nextTick(() => cursor.requestFocus())
  },
  { flush: 'post' },
)

function canEdit(row: TRow, column: ResolvedColumn<TRow>): boolean {
  return props.editing?.isEditable(row, column) ?? false
}

/** Whether *this* cell is the one showing an editor right now. */
function editorOpen(row: TRow, column: ResolvedColumn<TRow>): boolean {
  const session = props.editing
  if (!session) return false
  return session.isEditing(session.getRowId(row), column.id) && canEdit(row, column)
}

/**
 * The message this cell should carry: its own, or the row's when this is the
 * cell the user was last in.
 *
 * A row-level failure has nowhere of its own to go in cell mode — there is no
 * actions column to hold it — so it lands on the cell that caused it rather
 * than disappearing.
 */
function cellError(row: TRow, column: ResolvedColumn<TRow>): string | null {
  const session = props.editing
  if (!session) return null
  const id = session.getRowId(row)
  const field = session.errorFor(id, column.id)
  if (field) return field
  return session.stateFor(id)?.activeColumnId === column.id ? session.errorFor(id) : null
}

function rowState(row: TRow): 'dirty' | 'saving' | 'error' | undefined {
  const session = props.editing
  if (!session) return undefined
  const id = session.getRowId(row)
  const state = session.stateFor(id)
  if (!state) return undefined
  if (state.status === 'saving') return 'saving'
  if (state.status === 'error') return 'error'
  return session.isDirty(id) ? 'dirty' : undefined
}

/**
 * Controls a click has to be left alone by, and the selection cell above all.
 *
 * The checkbox's own click bubbles to the `<tr>`, so without this a click on it
 * would toggle the row twice and land back where it started. The rest are the
 * things rows genuinely contain: an open cell editor, row-mode Save and Cancel,
 * a link in a formatted cell. A click on one of those is a click on *it*.
 *
 * `closest` rather than a check on the target itself, because the click lands
 * on whatever is innermost — the `<span>` inside a button, the text node's
 * parent inside the label wrapping the checkbox.
 */
const INTERACTIVE = 'button, input, select, textarea, a, label, [contenteditable]'

function isInteractiveTarget(event: MouseEvent): boolean {
  const target = event.target
  if (!(target instanceof Element)) return false
  return Boolean(target.closest(`${INTERACTIVE}, .vt-td-selection`))
}

/**
 * Shift-click, before the browser gets to it.
 *
 * A shift-click extends the *text* selection from wherever the caret last was,
 * which drags a blue smear across half the table on every range gesture. Only
 * that case is cancelled: an unmodified click still focuses the cell it landed
 * in, so the cell cursor behaves exactly as it did before this prop existed.
 */
function onRowMouseDown(event: MouseEvent): void {
  if (!props.rowClickSelect || !event.shiftKey) return
  if (isInteractiveTarget(event)) return
  event.preventDefault()
}

/**
 * `rowClick` fires first and unconditionally — it is a report of what the user
 * did, and a table that also selects on it has not stopped reporting.
 */
function onRowClick(row: TRow, event: MouseEvent): void {
  emit('rowClick', row, event)
  if (!props.rowClickSelect || !props.selection) return
  if (isInteractiveTarget(event)) return
  props.selection.selectFromClick(row, event)
}

/**
 * Commits one row, and says whether it was persisted — so a caller can decide
 * whether to move on.
 *
 * The guard is the load-bearing line. A row with nothing open is not a save:
 * `useRowEditing.commit` resolves `true` for it, having nothing to reject, and
 * emitting `rowSaved` off that turns a stray blur into a second "saved" for a
 * row already saved. The stray blur is not hypothetical — Enter commits, the
 * draft closes, the editor unmounts and focus moves to the next cell, so the
 * blur arrives with the draft already gone. Whether it arrives at all is
 * browser-dependent, which is the second reason the test lives here rather
 * than as a flag on the blur path: this one does not care.
 *
 * Guarding here also covers Tab, and covers clicking away from a cell some
 * other route already committed. One test instead of one per caller.
 */
async function commitRow(row: TRow): Promise<boolean> {
  const session = props.editing
  if (!session) return false
  const id = session.getRowId(row)
  if (!session.isEditing(id)) return false
  const saved = await session.commit(row)
  if (saved) emit('rowSaved', row)
  else if (session.stateFor(id)?.status === 'error') {
    emit('rowSaveError', row, session.errorFor(id))
  }
  return saved
}

/**
 * Leaving a cell finishes the edit — but only in cell mode. With a whole row
 * open, moving between its fields is navigation, not a decision to save.
 *
 * The column test is what makes the blur safe now that finishing a cell can
 * open another one *in the same row*: Enter and Tab both close this draft and
 * begin the next, and the blur then arrives with a draft open again, on a
 * different column. `commitRow`'s "nothing open is not a save" guard cannot
 * see the difference — the row is editing either way — so it would commit the
 * editor that just opened, closing it a frame after it appeared. Asking
 * whether *this* cell is still the active one answers exactly that: it is not,
 * so this blur refers to a draft that is already gone.
 */
function onCellBlur(row: TRow, column: ResolvedColumn<TRow>): void {
  if (props.rowMode) return
  const session = props.editing
  if (!session) return
  if (session.stateFor(session.getRowId(row))?.activeColumnId !== column.id) return
  void commitRow(row)
}

/**
 * Tab: finish this cell, then open the next editable one along.
 *
 * A failed commit stays put rather than moving on, because moving would hide
 * the message explaining why it failed. In row mode this never runs — every
 * cell is already an editor, so Tab is left to reach the next one itself.
 */
async function moveEdit(
  row: TRow,
  column: ResolvedColumn<TRow>,
  delta: number,
  cols: ResolvedColumn<TRow>[],
): Promise<void> {
  const session = props.editing
  if (!session) return
  // Through `commitRow` rather than `session.commit` directly, so Tab inherits
  // the "a row with nothing open is not a save" guard and stops emitting
  // `rowSaved` from a second place.
  if (!(await commitRow(row))) return
  const editable = cols.filter((entry) => canEdit(row, entry))
  const index = editable.findIndex((entry) => entry.id === column.id)
  const next = editable[index + delta]
  if (next) session.begin(row, next.id)
}

/**
 * Enter or an arrow in an open editor: commit, then step the cursor if the save
 * took.
 *
 * A failed commit stays put, matching the rule `moveEdit` follows for Tab —
 * moving would scroll the message explaining the failure out from under the
 * user.
 *
 * What happens at the destination depends on which gesture asked, which is
 * why `CellEditor` reports the origin. **Enter opens the cell it lands on**, so
 * a column of values is typed with Enter alone rather than a keystroke between
 * each — the gesture said "this one is finished", and the only thing left to do
 * in the next one is edit it. An **arrow** lands read-only: it is navigation
 * that happened to start inside an editor, and opening every cell it passes
 * through would leave no way to cross the table without editing it.
 *
 * A destination that cannot be edited — a read-only column, or a row the
 * session vetoes — is simply moved onto. No hunting for the next editable cell
 * beyond it: the cursor goes where the key said, the same as everywhere else,
 * and a cursor whose path depended on editability would be one nobody could
 * predict.
 */
async function commitCell(
  row: TRow,
  next: CursorMove | undefined,
  origin: CommitOrigin | undefined,
  cursor: UseCellCursor<TRow> | undefined,
): Promise<void> {
  if (!(await commitRow(row))) return
  if (!next || !cursor) return
  // `false` for a move that landed nowhere — the edge of the table — and there
  // is then nothing new to open.
  if (!cursor.move(next)) return
  if (origin !== 'enter' || props.rowMode) return
  const session = props.editing
  const landed = cursor.position.value
  if (!session || !landed) return
  const destination = rowById(landed.rowId)
  const column = props.columns.find((entry) => entry.id === landed.columnId)
  if (!destination || !column || !canEdit(destination, column)) return
  session.begin(destination, column.id)
}

/** The rendered row a cursor position names, or `undefined` once it has scrolled out. */
function rowById(rowId: RowId): TRow | undefined {
  const getRowId = props.cursor?.getRowId
  if (!getRowId) return undefined
  for (const item of props.displayRows) {
    if (item.kind === 'row' && getRowId(item.row) === rowId) return item.row
  }
  return undefined
}

/** Escape: put the cell back, and give the cell itself the focus the editor had. */
function cancelCell(row: TRow, cursor: UseCellCursor<TRow> | undefined): void {
  props.editing?.cancel(row)
  cursor?.requestFocus()
}

</script>

<template>
  <!--
    `VirtualBody` renders the `<tbody>` itself, so this component's root is the
    same element it always was — and with `enabled: false` it renders every
    item it is handed and no spacers, which is why there is one loop below
    rather than a virtual branch and an ordinary one.

    The slot's `items` is the whole display list when windowing is off, so the
    only difference between the two modes is how long that list is.
  -->
  <VirtualBody
    ref="body"
    :items="displayRows"
    :row-height="rowHeight"
    :overscan="overscan"
    :scroll-parent="scrollParent"
    :enabled="virtual"
    :item-key="displayRowKey"
    :measure="measureRows"
    :end-threshold="endThreshold"
    @end-reached="$emit('endReached')"
    :colspan="columns.length + extraColumns"
  >
    <template #default="{ items, start }">
      <tr v-if="error" class="vt-row-message">
        <td :colspan="columns.length + extraColumns">
          <slot name="error" :error="error" :refresh="source.refresh">
            <span class="vt-error">
              Failed to load data.
              <button type="button" class="vt-btn vt-btn-link" @click="source.refresh()">
                Retry
              </button>
            </span>
          </slot>
        </td>
      </tr>

      <tr v-else-if="rows.length === 0 && !loading" class="vt-row-message">
        <td :colspan="columns.length + extraColumns">
          <slot name="empty">{{ emptyMessage }}</slot>
        </td>
      </tr>

      <!--
        Iterates the display list, not `rows`: with nothing grouped the
        two hold the same rows in the same order, so there is only one
        code path to keep correct.
      -->
      <!--
        `offset` is the item's place in the *window*; `start` is where the
        window begins, and `headerRowCount` is what sits above the body. Their
        sum plus one is `aria-rowindex`, which is 1-based over the whole table.
      -->
      <template v-for="(item, offset) in items" v-else>
        <TableGroupRow
          v-if="item.kind === 'group'"
          :key="`group:${item.group.key}`"
          :row-index="headerRowCount === undefined ? undefined : headerRowCount + start + offset + 1"
          :group="item.group"
          :columns="columns"
          :leading="selectable ? 1 : 0"
          :trailing-cells="actionsColumn ? 1 : 0"
        >
          <template #default="slotProps">
            <slot name="group" v-bind="slotProps">
              <span class="vt-group-column">{{ slotProps.columnLabel }}</span>
              <span class="vt-group-label">{{ slotProps.group.label }}</span>
              <span class="vt-group-count">{{ slotProps.group.totalCount }}</span>
            </slot>
          </template>
          <template #aggregate="slotProps">
            <slot name="groupAggregate" v-bind="slotProps">{{ slotProps.text }}</slot>
          </template>
        </TableGroupRow>

        <TableRow
          v-else
          :key="rowKey(item.row, item.index)"
          :row-index="headerRowCount === undefined ? undefined : headerRowCount + start + offset + 1"
          :row="item.row"
          :columns="columns"
          :index="item.index"
          :depth="item.depth"
          :selected="selection ? selection.isSelected(item.row) : false"
          :state="rowState(item.row)"
          :cursor="cursor"
          @click="onRowClick(item.row, $event)"
          @mousedown="onRowMouseDown"
        >
          <template v-if="selectable" #leading>
            <SelectionCheckbox
              v-if="selection"
              :checked="selection.isSelected(item.row)"
              :disabled="!selection.isSelectable(item.row)"
              label="Select row"
              @change="
                (_checked, event) =>
                  event.shiftKey
                    ? selection?.toggleRange(item.row)
                    : selection?.toggle(item.row)
              "
            />
          </template>

          <!--
            Forwards each cell to this component's own `cell:<id>` slot,
            so the preset's slot API is exactly what it always was while
            the row markup lives in the primitive.

            Three branches rather than one wrapper around the slot: a
            table with no editing session must not pay an extra DOM node
            per cell for a feature it is not using, and the read-only
            branch at the bottom is exactly what it always rendered.
          -->
          <template #cell="{ row, column, value, text }">
            <CellEditor
              v-if="props.editing && editorOpen(row, column)"
              :column="column"
              :row="row"
              :value="props.editing.inputFor(row, column)"
              :error="cellError(row, column)"
              :label="column.header ?? column.id"
              :trap-tab="!rowMode"
              :arrow-move="Boolean(cursor) && !rowMode"
              :autofocus="props.editing.stateFor(props.editing.getRowId(row))?.activeColumnId === column.id"
              @update:value="props.editing.setValue(row, column, $event)"
              @commit="(next, origin) => commitCell(row, next, origin, cursor)"
              @cancel="cancelCell(row, cursor)"
              @blur="onCellBlur(row, column)"
              @move="moveEdit(row, column, $event, columns)"
            >
              <template v-if="$slots[`editor:${column.id}`]" #default="editorProps">
                <slot
                  :name="`editor:${column.id}`"
                  v-bind="editorProps"
                  :row="row"
                  :column="column"
                />
              </template>
            </CellEditor>

            <!--
              A real button, not a click handler on the cell: a cell you
              can only reach with a pointer is a cell half the users
              cannot edit at all.

              Only without a cursor, though. With one the `<td>` is
              itself the focus target and Enter opens the editor, so
              this button would add a second tab stop per editable cell
              — which is exactly what a roving tabindex exists to avoid,
              and it would nest a focusable inside a gridcell besides.
            -->
            <button
              v-else-if="canEdit(row, column) && !cursor"
              type="button"
              class="vt-cell-trigger"
              :aria-label="`Edit ${column.header ?? column.id}`"
              @click="props.editing?.begin(row, column.id)"
            >
              <slot
                :name="`cell:${column.id}`"
                :row="row"
                :column="column"
                :value="value"
                :text="text"
              >
                {{ text }}
              </slot>
            </button>

            <!--
              The same cell under a cursor. No button, but not bare
              either: the pointer is the one thing the button carried
              that is still worth having, because it is what says "you
              can type here" before you try.
            -->
            <span v-else-if="canEdit(row, column)" class="vt-cell-editable">
              <slot
                :name="`cell:${column.id}`"
                :row="row"
                :column="column"
                :value="value"
                :text="text"
              >
                {{ text }}
              </slot>
            </span>

            <slot
              v-else
              :name="`cell:${column.id}`"
              :row="row"
              :column="column"
              :value="value"
              :text="text"
            >
              {{ text }}
            </slot>
          </template>

          <template v-if="actionsColumn" #trailing="{ row }">
            <slot name="rowActions" :row="row" :state="rowState(row)" :editing="props.editing">
              <span
                v-if="props.editing && props.editing.isEditing(props.editing.getRowId(row))"
                class="vt-row-actions"
              >
                <button
                  type="button"
                  class="vt-btn vt-btn-primary"
                  :disabled="rowState(row) === 'saving'"
                  @click="commitRow(row)"
                >
                  Save
                </button>
                <button
                  type="button"
                  class="vt-btn"
                  :disabled="rowState(row) === 'saving'"
                  @click="props.editing.cancel(row)"
                >
                  Cancel
                </button>
                <span
                  v-if="props.editing.errorFor(props.editing.getRowId(row))"
                  class="vt-row-error"
                  role="alert"
                  :title="props.editing.errorFor(props.editing.getRowId(row)) ?? undefined"
                >
                  {{ props.editing.errorFor(props.editing.getRowId(row)) }}
                </span>
              </span>
            </slot>
          </template>
        </TableRow>
      </template>
    </template>
  </VirtualBody>
</template>
