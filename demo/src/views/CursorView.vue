<script setup lang="ts">
/**
 * The cell cursor: a focused cell you move with the arrow keys, and edit
 * without ever reaching for the mouse.
 *
 * Four things here are worth doing rather than reading about.
 *
 * **Tab into the table once.** One stop for the whole grid, not one per
 * editable cell. That is what a roving tabindex buys, and it is why the edit
 * button every editable cell carries *without* a cursor is gone here — the cell
 * itself is the focus target now.
 *
 * **Reload with the ring already on the first cell.** The table starts the
 * cursor rather than waiting to be clicked, and does it silently: the ring is
 * there, but the caret never left whatever you were doing. `initialCursor`
 * moves the start somewhere else — the toggle remounts the table, because
 * where a cursor *starts* is a question asked once.
 *
 * **Type Enter, edit, Enter again.** You land one row down, read-only. Shift
 * for up, Ctrl for right, both for left. Run a column of numbers that way and
 * you never touch the pointer.
 *
 * **Sort by Salary while the cursor is somewhere.** The ring stays on the row
 * it was on, which has moved. The position is a row id and a column id, never a
 * pair of indices — the same reason an open draft survives a re-sort.
 *
 * **Hold Ctrl and press → a few times.** The page turns and the ring keeps its
 * height on the screen — third row of page 2, third row of page 3. Paging is
 * reading, and the eye is already somewhere. `PageDown` is the other thing, and
 * still means ten rows *within* the page.
 *
 * **Hold Shift and press → a few times.** The table scrolls sideways a column a press and the
 * ring does not move. Three meanings for one pair of keys, told apart by the modifier alone: bare
 * moves the cursor, Ctrl turns the page, Shift moves the viewport. Reaching a far column used to
 * mean walking the cursor onto it and losing your place.
 *
 * **Group by Department and arrow down through a band boundary.** The cursor
 * steps from the last row of one band to the first of the next and never onto
 * a band header, because it walks the rendered rows rather than the page the
 * source returned.
 *
 * Salary is worth one warning here, because this view edits against the same
 * fake server the Editing view does: its payroll rounds to the nearest hundred,
 * so that column will not keep the exact number you type. That is `fakeApi.ts`,
 * not the table — every other editable column round-trips what you typed.
 *
 * The counters at the bottom are the claim the invalidation suite makes, made
 * where you can watch it: moving the cursor is layout, and reaches the row
 * pipeline exactly as often as a column resize does — never.
 */
import { computed, ref, shallowRef } from 'vue'
import {
  DataTable,
  replaceRowIn,
  useLocalDataSource,
  useRowEditing,
  useTableState,
  type RowChange,
} from '@sandbox/vue-table'
import { employeeColumns } from '../columns'
import { employees, type Employee } from '../data/dataset'
import { saveEmployee } from '../data/fakeApi'
import DemoSection from '../components/DemoSection.vue'

const rows = shallowRef(employees.slice(0, 200))

const state = useTableState({ pageSize: 8 })
const source = useLocalDataSource<Employee>(rows, employeeColumns, state.query)

const cellCursor = ref(true)
const stickyHeader = ref(true)
const groupBy = ref<string[]>([])

/** Off: the table starts on its own first cell. On: it is told where to start. */
const seeded = ref(false)
const initialCursor = computed(() =>
  seeded.value ? { rowId: rows.value[2]!.id, columnId: 'salary' } : undefined,
)

/** The three theme knobs the cursor adds, live. */
const ringWidth = ref(2)
const rowDelta = ref(4)
const columnDelta = ref(4)

const cursorStyle = computed(() => ({
  '--vt-cursor-border-width': `${ringWidth.value}px`,
  '--vt-cursor-row-delta': `${rowDelta.value}%`,
  '--vt-cursor-column-delta': `${columnDelta.value}%`,
}))

const editing = useRowEditing<Employee>(source, employeeColumns, {
  save: ({ id, patch, signal }: RowChange<Employee>) =>
    saveEmployee(Number(id), patch, signal, { latencyMs: 250, failureRate: 0 }),
  apply: (next) => {
    rows.value = replaceRowIn(rows.value, next, (row) => row.id)
  },
})

const saved = ref<string[]>([])
function onRowSaved(row: Employee): void {
  // One entry per save. Two appearing for one Enter is the double-commit bug
  // the blur guard exists to stop, and it would show up right here.
  saved.value = [`${row.name} · ${new Date().toLocaleTimeString()}`, ...saved.value].slice(0, 6)
}
</script>

<template>
  <DemoSection
    title="Cell cursor"
    blurb="A focused cell you move with the arrow keys, ringed and crossed by a tint down its
           row and its column. Enter opens the editor on a cell that has one; Enter again
           commits and steps down, Shift up, Ctrl right, Ctrl+Shift left. Shift and a horizontal
           arrow scrolls the box instead, leaving the ring where it is. One tab stop for the
           whole grid, and the cursor reaches the row pipeline not at all."
    :api="[
      'DataTable cellCursor',
      'useCellCursor',
      'cursorMoveFor',
      'commitMoveFor',
      'pageMoveFor',
      'scrollMoveFor',
      'nextPosition',
      'nextScrollLeft',
      'CellPosition',
      'CellCursorMark',
      'PAGE_MOVE_ROWS',
    ]"
  >
    <template #controls>
      <div class="controls">
        <label><input v-model="cellCursor" type="checkbox" /> cellCursor</label>
        <label><input v-model="stickyHeader" type="checkbox" /> stickyHeader</label>
        <label><input v-model="seeded" type="checkbox" /> initialCursor</label>

        <span class="divider" />

        <label>
          <input
            type="checkbox"
            :checked="groupBy.length > 0"
            @change="groupBy = groupBy.length > 0 ? [] : ['department']"
          />
          group by department
        </label>

        <span class="divider" />

        <label>ring {{ ringWidth }}px
          <input v-model.number="ringWidth" type="range" min="0" max="4" />
        </label>
        <label>row {{ rowDelta }}%
          <input v-model.number="rowDelta" type="range" min="0" max="16" />
        </label>
        <label>column {{ columnDelta }}%
          <input v-model.number="columnDelta" type="range" min="0" max="16" />
        </label>
      </div>
    </template>

    <p class="note">
      The ring is already on the first cell — a table asked for a keyboard looks like it has
      one before you press a key, and <em>initialCursor</em> puts it somewhere else instead.
      Press Tab to take it, or click any cell. Then <kbd>↑</kbd> <kbd>↓</kbd> <kbd>←</kbd> <kbd>→</kbd>,
      <kbd>Home</kbd>/<kbd>End</kbd> for the ends of a row, <kbd>Ctrl</kbd>+<kbd>Home</kbd>/
      <kbd>End</kbd> for the corners, <kbd>PageUp</kbd>/<kbd>PageDown</kbd> for ten rows,
      <kbd>Ctrl</kbd>+<kbd>←</kbd>/<kbd>→</kbd> to turn the page and take the ring with you, and
      <kbd>Shift</kbd>+<kbd>←</kbd>/<kbd>→</kbd> to scroll sideways to a far column
      <em>without</em> the ring moving at all — this table is wider than its box, so it has
      somewhere to go.
      <kbd>Enter</kbd> or <kbd>F2</kbd> opens an editor — Salary is the one column that will not
      keep your exact number, because this demo's payroll rounds to the nearest hundred.
      <kbd>Esc</kbd> puts the cell back and
      hands the focus to the cell. Turn <em>cellCursor</em> off and the table goes back to what
      it renders without one, edit buttons and all.
    </p>

    <div :style="cursorStyle">
      <DataTable
        :columns="employeeColumns"
        :source="source"
        :state="state"
        :editing="editing"
        :cell-cursor="cellCursor"
        :sticky-header="stickyHeader"
        :initial-group-by="groupBy"
        :initial-cursor="initialCursor"
        :key="`${groupBy.join('|')}/${seeded}`"
        @row-saved="onRowSaved"
      />
    </div>

    <div class="panel">
      <h3>Saved rows</h3>
      <p class="note">
        One entry per commit. A second appearing for one <kbd>Enter</kbd> would be the blur
        that follows the cursor out of the cell being counted as a second save.
      </p>
      <ol class="saved">
        <li v-for="entry in saved" :key="entry">{{ entry }}</li>
        <li v-if="saved.length === 0" class="muted">nothing yet</li>
      </ol>
    </div>
  </DemoSection>
</template>

<style scoped>
.divider { width: 1px; align-self: stretch; background: var(--line); }
.note { border-left: 2px solid var(--line); padding-left: 10px; }

kbd {
  border: 1px solid var(--line);
  border-radius: 3px;
  padding: 0 4px;
  font-size: 12px;
  font-family: inherit;
}

.panel {
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.panel h3 { margin: 0; font-size: 14px; }

.saved { margin: 0; padding: 0; list-style: none; font-size: 13px; display: grid; gap: 2px; }
.muted { color: var(--muted); }
</style>
