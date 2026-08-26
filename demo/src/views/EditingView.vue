<script setup lang="ts">
/**
 * Editing, end to end: a draft per row, validated, sent to a server that can
 * refuse it, and written back.
 *
 * Four things here are worth watching rather than reading about.
 *
 * **`city` writes through a `setValue`.** It reads `row.location.city` via an
 * accessor, and an accessor cannot be run backwards, so the column has to say
 * where an edit lands. Edit a city, then sort by City: it moves.
 *
 * **The server's row wins.** Payroll rounds salaries to the nearest hundred —
 * `saveEmployee` in `fakeApi.ts` does it, not the table. Type 92 345 and the
 * cell settles on 92 300 in one paint, because the table waits for the response
 * and adopts what came back. Turn *optimistic* on and it takes two: your
 * number, then the server's. It is on the page's blurb too, because a value
 * that changes on save reads as a bug to anyone who has not read this file.
 *
 * **A rejection knows which cell it means.** Change an email to one another row
 * already has. The server throws `{ message, fields: { email } }`; the message
 * lands on the row and "Already taken" lands on that cell.
 *
 * **A failed save never loses the edit.** Turn the failure rate up. The draft
 * stays exactly where it was, and the same Save is the retry.
 */
import { computed, ref, shallowRef } from 'vue'
import {
  DataTable,
  replaceRowIn,
  useLocalDataSource,
  useRowEditing,
  useTableState,
  type EditMode,
  type RowChange,
} from '@sandbox/vue-table'
import { employees, type Employee } from '../data/dataset'
import { employeeColumns } from '../columns'
import { clearRequestLog, requestLog, saveEmployee } from '../data/fakeApi'
import DemoSection from '../components/DemoSection.vue'
import StateInspector from '../components/StateInspector.vue'

/**
 * `shallowRef`, and here it is load-bearing twice over: the pipeline reads raw
 * rows rather than proxies, and `apply` below replaces the array rather than
 * writing into it, which is the only change a `shallowRef` can see.
 */
const rows = shallowRef(employees.slice(0, 200))

const state = useTableState({ pageSize: 8 })
const source = useLocalDataSource<Employee>(rows, employeeColumns, state.query)

const mode = ref<EditMode>('cell')
const optimistic = ref(false)
const latencyMs = ref(450)
const failureRate = ref(0)

/**
 * A local source, so the rows are already here and only the *write* is remote —
 * which is why `apply` has work to do. A server source would drop `apply`
 * entirely and let the default `source.refresh()` refetch the row.
 */
const editing = useRowEditing<Employee>(source, employeeColumns, {
  mode,
  // Read through a getter, so the toggle takes effect on the next save rather
  // than only after a remount.
  get optimistic() {
    return optimistic.value
  },
  isEditable: (row) => row.active || allowInactive.value,
  validate: (next) =>
    next.role === 'Manager' && next.department === ''
      ? 'A manager has to belong to a department'
      : null,
  save,
  apply: (next) => {
    rows.value = replaceRowIn(rows.value, next, (row) => row.id)
  },
})

const allowInactive = ref(true)

/**
 * Annotated rather than inferred, so the shape a save is handed is written out
 * where a reader can see it: the row id, only the fields that changed keyed by
 * column id, and a signal that aborts if the edit is taken back.
 */
function save({ id, patch, signal }: RowChange<Employee>): Promise<Employee> {
  return saveEmployee(Number(id), patch, signal, {
    latencyMs: latencyMs.value,
    failureRate: failureRate.value,
  })
}

const saved = ref<string[]>([])
function onRowSaved(row: Employee): void {
  saved.value = [`${row.name} · ${new Date().toLocaleTimeString()}`, ...saved.value].slice(0, 6)
}

/** The drafts, flattened for display — a Map does not survive `JSON.stringify`. */
const openDrafts = computed(() =>
  [...editing.drafts.value.entries()].map(([id, draft]) => ({
    id,
    status: draft.status,
    draft: draft.draft,
    errors: draft.errors,
    error: draft.error,
  })),
)

const editableColumns = computed(() =>
  employeeColumns.filter((column) => column.editable).map((column) => column.id),
)
</script>

<template>
  <DemoSection
    title="Editing"
    blurb="Click any cell with a value to edit it. Every column is opt-in — Tags stays read-only
           because a list needs an editor of its own. Watch the request log: a save is one request,
           and in row mode it is one request for the whole row however many fields changed.
           Salary is the one column that will not keep what you type: this demo's payroll rounds
           to the nearest hundred, and the table shows the row the server sent back."
    :api="[
      'useRowEditing',
      'CellEditor',
      'replaceRowIn',
      'applyPatch',
      'validateDraft',
      'parseCellInput',
      'editorFor',
      'EditMode',
      'RowChange',
      'validateCell',
      'applyCellValue',
      'isColumnEditable',
      'REQUIRED_MESSAGE',
      'SAVE_FAILED_MESSAGE',
    ]"
  >
    <template #controls>
      <div class="controls">
        <label>
          Mode
          <select v-model="mode">
            <option value="cell">cell — commit each field</option>
            <option value="row">row — one Save for the lot</option>
          </select>
        </label>
        <label>
          <input v-model="optimistic" type="checkbox" />
          Optimistic
        </label>
        <label>
          Latency {{ latencyMs }}ms
          <input v-model.number="latencyMs" type="range" min="0" max="2000" step="50" />
        </label>
        <label>
          <input
            type="checkbox"
            :checked="failureRate > 0"
            @change="failureRate = failureRate > 0 ? 0 : 0.5"
          />
          Flaky server (50% failures)
        </label>
        <label>
          <input v-model="allowInactive" type="checkbox" />
          Inactive rows editable
        </label>
        <span class="hint">
          Editable: {{ editableColumns.join(', ') }}.
          Try a negative salary, a blank name, or an email another row already has.
        </span>
      </div>
    </template>

    <DataTable
      :columns="employeeColumns"
      :source="source"
      :state="state"
      :editing="editing"
      :page-size="8"
      show-footer
      @row-saved="onRowSaved"
    />

    <div class="panels">
      <StateInspector label="Open drafts" :value="openDrafts" open />
      <StateInspector label="Saved" :value="saved" />
      <StateInspector
        label="Request log"
        :value="requestLog.map((entry) => `${entry.kind} · ${entry.label} · ${entry.outcome} · ${entry.ms}ms`)"
      />
    </div>
    <button type="button" class="tiny" @click="clearRequestLog()">Clear request log</button>
  </DemoSection>
</template>

<style scoped>
.panels { display: grid; gap: 8px; margin-top: 12px; }
</style>
