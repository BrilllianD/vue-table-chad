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
 * moves the start somewhere else, and `autofocusCursor` is the opt-in that
 * does take the caret — both toggles remount the table, because where a cursor
 * starts and whether it grabs the focus are questions asked once.
 *
 * **Type Enter, edit, Enter again.** You land one row down with that cell's
 * editor already open, so the column keeps going on Enter alone. Shift for up,
 * Ctrl for right, both for left. A destination with no editor — a read-only
 * column — is landed on closed rather than skipped past.
 *
 * **Or just start typing.** No gesture opens the editor first: the character
 * you typed is the new value, the old one gone the way it is in a spreadsheet,
 * and Delete opens the cell empty instead. An arrow out of the open editor
 * commits and opens its destination too: it came out of an editor, so the user
 * is already editing. An arrow on a closed cell still only moves. The save log
 * below stays one line per cell, not one per key.
 *
 * **Type `R` on a Department cell.** A list has no cell to type into, so the
 * character picks rather than seeds: the editor opens on Research, the option
 * the letter names, matched against the label on screen before the value
 * behind it. It used to open on a draft holding `"R"` — not a member of the
 * column's options, so the only outcome that keystroke had was the validator
 * refusing it. A character that names no option opens the cell unchanged.
 *
 * **Then press ↓ on that closed Department cell.** The ring moves, exactly as
 * it does on a text column. What keeps the arrows is an *open* dropdown panel
 * walking its own listbox, not the fact that the column is a list: a closed one
 * is a button with a label on it, and exempting it by kind left the cell with
 * no arrow way out at all — Enter, Tab and Escape were the only exits. `Alt`+`↓`
 * is the gesture that opens the panel, and from there the arrows are the
 * listbox's until it closes.
 *
 * **Sort by Salary while the cursor is somewhere.** The ring keeps the height
 * it had — third row before, third row after. A sort sends the table back to
 * page 1, so the row it was on is usually not on the page that comes back, and
 * re-placing it at the offset is the same rule a page turn follows. The caret
 * stays on the sort button, because a second Enter is how you reverse the
 * direction it just set.
 *
 * **Hold Ctrl and press → a few times.** The page turns and the ring keeps its
 * height on the screen — third row of page 2, third row of page 3. Paging is
 * reading, and the eye is already somewhere. `PageDown` is the other thing, and
 * still means ten rows *within* the page.
 *
 * **Now click the pager instead, or change the rows-per-page.** The same
 * restore, and the caret lands on the new cell: any explicit page change is a
 * page turn, whichever control asked for it. Typing in the search box moves the
 * ring the same way and leaves your caret in the box, because you are still
 * typing in it.
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
 * Name is worth one warning here, because this view edits against the same fake
 * server the Editing view does: it stores names trimmed, so that column will not
 * keep surrounding spaces. That is `fakeApi.ts`, not the table — every other
 * editable column round-trips what you typed.
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
} from '@brillliand/vue-table-chad'
import { employeeColumns } from '../columns'
import { employees, type Employee } from '../data/dataset'
import { saveEmployee } from '../data/fakeApi'
import DemoSection from '../components/DemoSection.vue'
import ControlGroup from '../components/ControlGroup.vue'
import ToggleControl from '../components/ToggleControl.vue'
import RangeControl from '../components/RangeControl.vue'

const rows = shallowRef(employees.slice(0, 200))

const state = useTableState({ pageSize: 8 })
const source = useLocalDataSource<Employee>(rows, employeeColumns, state.query)

const cellCursor = ref(true)
const stickyHeader = ref(true)
const groupBy = ref<string[]>([])

/** Off: the table starts on its own first cell. On: it is told where to start. */
const seeded = ref(false)

/**
 * Off: the ring is there and the caret is wherever you left it. On: the table
 * takes the caret as it mounts, so the arrows work on the first press.
 *
 * Only observable at mount, which is why the toggle is in the remount key
 * below alongside `initialCursor`.
 */
const autofocus = ref(false)
const initialCursor = computed(() =>
  seeded.value ? { rowId: rows.value[2]!.id, columnId: 'salary' } : undefined,
)

/** The three theme knobs the cursor adds, live. */
const ringWidth = ref(2)
const rowDelta = ref(4)
const columnDelta = ref(4)

const cursorStyle = computed(() => ({
  '--vtc-cursor-border-width': `${ringWidth.value}px`,
  '--vtc-cursor-row-delta': `${rowDelta.value}%`,
  '--vtc-cursor-column-delta': `${columnDelta.value}%`,
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
    :try-it="[
      'Click a cell, then use the arrow keys; Enter opens an editable cell and a second Enter commits and steps down.',
      'Copy a Salary cell with Ctrl/Cmd+C and paste it into another: it lands formatted and is saved in one gesture.',
      'Turn on group by department and arrow through a band row: Enter folds it.',
      'Type R on a Department cell: the letter picks Research rather than becoming the value, and \u2193 on that cell still moves the ring \u2014 Alt+\u2193 is what opens the list.',
    ]"
    blurb="A focused cell you move with the arrow keys, ringed and crossed by a tint down its
           row and its column. Enter, one left click, or simply typing opens the editor on a
           cell that has one — the character you typed becomes the value. Enter again
           commits and opens the cell below, Shift above, Ctrl right, Ctrl+Shift left, and an
           arrow out of an open editor commits and opens the cell that way. On a list column
           the character typeaheads to the option it names instead, and the arrows stay the
           cursor's until Alt+down opens the panel. Shift and a horizontal
           arrow scrolls the box instead, leaving the ring where it is, and Ctrl with a vertical
           one scrolls it a screenful. One tab stop for the
           whole grid, and the cursor reaches the row pipeline not at all."
    :api="[
      'DataTable cellCursor',
      'DataTable autofocusCursor',
      'useCellCursor',
      'cursorMoveFor',
      'commitMoveFor',
      'editSeedFor',
      'editorMoveFor',
      'pageMoveFor',
      'scrollMoveFor',
      'viewportMoveFor',
      'nextPosition',
      'nextScrollLeft',
      'nextScrollTop',
      'CellPosition',
      'CellCursorMark',
      'PAGE_MOVE_ROWS',
    ]"
  >
    <template #controls>
      <ControlGroup legend="DataTable props">
        <ToggleControl v-model="cellCursor" label="cellCursor" code hint="off: the arrows do nothing" />
        <ToggleControl v-model="stickyHeader" label="stickyHeader" code />
        <ToggleControl
          v-model="seeded"
          label="initialCursor"
          code
          hint="start on a given cell instead of none"
        />
        <ToggleControl
          v-model="autofocus"
          label="autofocusCursor"
          code
          hint="focus the grid on mount, so the keys work without a click"
        />
        <ToggleControl
          :model-value="groupBy.length > 0"
          label="group by department"
          hint="the cursor skips band rows; Enter on one folds it"
          @update:model-value="groupBy = $event ? ['department'] : []"
        />
      </ControlGroup>

      <ControlGroup legend="Cursor theme tokens">
        <RangeControl v-model="ringWidth" label="--vtc-cursor-border-width" code :min="0" :max="4" unit="px" />
        <RangeControl v-model="rowDelta" label="--vtc-cursor-row-delta" code :min="0" :max="16" unit="%" />
        <RangeControl v-model="columnDelta" label="--vtc-cursor-column-delta" code :min="0" :max="16" unit="%" />
      </ControlGroup>
    </template>

    <p class="note">
      The ring is already on the first cell — a table asked for a keyboard looks like it has
      one before you press a key, and <em>initialCursor</em> puts it somewhere else instead.
      Press Tab to take it, or click any cell — or turn on <em>autofocusCursor</em>, which hands
      the table the caret as it mounts and is the one way the cursor is allowed to move it. Then <kbd>↑</kbd> <kbd>↓</kbd> <kbd>←</kbd> <kbd>→</kbd>,
      <kbd>Home</kbd>/<kbd>End</kbd> for the ends of a row, <kbd>Ctrl</kbd>+<kbd>Home</kbd>/
      <kbd>End</kbd> for the corners, <kbd>PageUp</kbd>/<kbd>PageDown</kbd> for ten rows,
      <kbd>Ctrl</kbd>+<kbd>←</kbd>/<kbd>→</kbd> to turn the page and take the ring with you, and
      <kbd>Shift</kbd>+<kbd>←</kbd>/<kbd>→</kbd> to scroll sideways to a far column
      <em>without</em> the ring moving at all — this table is wider than its box, so it has
      somewhere to go.
      <kbd>Enter</kbd> or <kbd>F2</kbd> opens an editor — Name is the one column that will not
      keep your text verbatim, because this demo's server trims it. So does one left click,
      the same single click that opens a cell on a table with no cursor at all. So does
      just typing: the character starts the edit and replaces what was there, and
      <kbd>Delete</kbd> or <kbd>Backspace</kbd> opens the cell empty. From inside an open editor
      both <kbd>Enter</kbd> and the arrows commit and open the cell they land on — so a column of
      numbers is typed straight down and a row across, with no keystroke between them. An arrow on
      a closed cell only moves — a closed dropdown included, since it is a button with a label
      on it; <kbd>Alt</kbd>+<kbd>↓</kbd> opens its panel and the arrows are the listbox's for as
      long as it is up. A textarea keeps its own throughout. On a list column the typed character
      typeaheads to the option it names — <kbd>R</kbd> on Department opens on Research —
      rather than becoming a value the column's options do not contain.
      <kbd>Esc</kbd> puts the cell back and
      hands the focus to the cell. <kbd>Ctrl</kbd>+<kbd>C</kbd> copies the cell's text as it is
      shown, formatting and all — Salary copies with its currency — and <kbd>Ctrl</kbd>+<kbd>V</kbd>
      pastes into a cell and saves it in one gesture, parsed the same way typing would be. Tags is
      read-only, so it copies but refuses a paste. Sort a column, search, or group, and the ring
      keeps the height it had rather than vanishing: each of those sends the table back to page 1,
      so the row it was on is usually gone, and the offset is what it is re-placed at — the same
      rule a page turn follows. The caret stays in the search box or on the sort button, since you
      are still using it. Turn <em>cellCursor</em> off and the table goes back to what
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
        :autofocus-cursor="autofocus"
        :key="`${groupBy.join('|')}/${seeded}/${autofocus}`"
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
