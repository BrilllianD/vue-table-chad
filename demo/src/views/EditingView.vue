<script setup lang="ts">
/**
 * Editing, end to end: a draft per row, validated, sent to a server that can
 * refuse it, and written back.
 *
 * Six things here are worth watching rather than reading about.
 *
 * **`city` writes through a `setValue`.** It reads `row.location.city` via an
 * accessor, and an accessor cannot be run backwards, so the column has to say
 * where an edit lands. Edit a city, then sort by City: it moves.
 *
 * **The server's row wins.** Names are stored trimmed — `saveEmployee` in
 * `fakeApi.ts` does it, not the table. Type `  Ada  ` and the cell settles on
 * `Ada` in one paint, because the table waits for the response and adopts what
 * came back. Turn *optimistic* on and it takes two: your text, then the
 * server's. It is on the page's blurb too, because a value that changes on save
 * reads as a bug to anyone who has not read this file.
 *
 * **A rejection knows which cell it means.** Change an email to one another row
 * already has. The server throws `{ message, fields: { email } }`; the message
 * lands on the row and "Already taken" lands on that cell.
 *
 * **A failed save never loses the edit.** Turn the failure rate up. The draft
 * stays exactly where it was, and the same Save is the retry.
 *
 * **Edit Salary and watch the digits.** The number control is a text box rather
 * than `input[type=number]`: it groups as you type, in whatever separators the
 * runtime's locale uses, so a six-figure salary stays legible mid-edit instead
 * of an unbroken run of digits. The draft underneath still holds the bare
 * number — Open drafts below shows it — which is why `parse` and `validate` see
 * exactly what they saw before, and why `-1` still fails on "A salary cannot be
 * negative".
 *
 * **Manager is a list nobody could send whole.** Any of 10,000 people can be
 * one, so the column declares `asyncOptions` instead of `options` and the
 * dropdown asks for 25 at a time — scroll it, or type, and watch the request
 * log. The ids the rows already hold are labelled by `resolveOptions`, in one
 * request for the whole page rather than one per cell; page forward and watch
 * the log show exactly one more.
 */
import { computed, ref, shallowRef } from 'vue'
import {
  DataTable,
  replaceRowIn,
  useAsyncOptions,
  useLocalDataSource,
  useRowEditing,
  useTableState,
  type ColumnDef,
  type EditMode,
  type RowChange,
} from '@brillliand/vue-table-chad'
import { employees, type Employee } from '../data/dataset'
import { employeeColumns } from '../columns'
import {
  clearRequestLog,
  fetchManagers,
  fetchManagersByIds,
  requestLog,
  saveEmployee,
} from '../data/fakeApi'
import DemoSection from '../components/DemoSection.vue'
import ControlGroup from '../components/ControlGroup.vue'
import ToggleControl from '../components/ToggleControl.vue'
import ChoiceControl from '../components/ChoiceControl.vue'
import RangeControl from '../components/RangeControl.vue'
import StateInspector from '../components/StateInspector.vue'

/**
 * `shallowRef`, and here it is load-bearing twice over: the pipeline reads raw
 * rows rather than proxies, and `apply` below replaces the array rather than
 * writing into it, which is the only change a `shallowRef` can see.
 */
const rows = shallowRef<Employee[]>(
  // Each row starts out reporting to somebody, so the Manager column has ids to
  // label — spread across the whole 10k so most of them are on a portion the
  // dropdown has never fetched.
  employees.slice(0, 200).map((row, index) => ({
    ...row,
    managerId: employees[(index * 37) % employees.length]!.id,
  })),
)

/**
 * The 10,000 possible managers, 25 at a time.
 *
 * One source for the whole column rather than one per row: the portions it has
 * loaded are also the labels every cell reads, so a source per row would fetch
 * the same page 200 times and still know nothing about the other 199 rows.
 */
const managers = useAsyncOptions(
  (request) => fetchManagers(request, { latencyMs: latencyMs.value }),
  {
    // The ids already in the rows, labelled in one request rather than left
    // reading as numbers until somebody scrolls past each of them.
    resolveOptions: (values, { signal }) =>
      fetchManagersByIds(values, signal, { latencyMs: latencyMs.value }),
  },
)

const managerColumn: ColumnDef<Employee> = {
  id: 'managerId',
  header: 'Manager',
  type: 'number',
  editable: true,
  width: 190,
  asyncOptions: managers,
}

const columns: ColumnDef<Employee>[] = [...employeeColumns, managerColumn]

const state = useTableState({ pageSize: 8 })
const source = useLocalDataSource<Employee>(rows, columns, state.query)

const mode = ref<EditMode>('cell')
const optimistic = ref(false)
const latencyMs = ref(450)
const failureRate = ref(0)

/**
 * A local source, so the rows are already here and only the *write* is remote —
 * which is why `apply` has work to do. A server source would drop `apply`
 * entirely and let the default `source.refresh()` refetch the row.
 */
const editing = useRowEditing<Employee>(source, columns, {
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
  return saveEmployee(
    Number(id),
    patch,
    signal,
    { latencyMs: latencyMs.value, failureRate: failureRate.value },
    // Including `managerId`, which the shared column list does not carry.
    columns,
  )
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
  columns.filter((column) => column.editable).map((column) => column.id),
)
</script>

<template>
  <DemoSection
    title="Editing"
    :try-it="[
      'Click a salary and type a negative number: the column validator refuses it before any save.',
      'Give a row an email another row already has — that is the server refusing, after the latency.',
      'Switch mode to row, change two cells, then press Escape: the whole draft is cancelled, not just the cell.',
    ]"
    blurb="Click any cell with a value to edit it. Every column is opt-in — Tags stays read-only
           because a list needs an editor of its own. Watch the request log: a save is one request,
           and in row mode it is one request for the whole row however many fields changed.
           Name is the one column that will not keep what you type verbatim: this demo's server
           trims it, and the table shows the row the server sent back. Salary edits in a masked
           text box that groups thousands while the draft keeps the bare number.
           Manager is the other shape of column: 10,000 possible values, fetched 25 at a time as
           the dropdown is scrolled or searched."
    :api="[
      'useRowEditing',
      'CellEditor',
      'useAsyncOptions',
      'AsyncSelect',
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
      <ControlGroup legend="useRowEditing">
        <ChoiceControl
          v-model="mode"
          label="mode"
          code
          :options="[
            { value: 'cell', label: 'cell', title: 'commit each field on its own' },
            { value: 'row', label: 'row', title: 'one Save for the whole row' },
          ]"
          hint="cell commits each field; row keeps a draft until Save"
        />
        <ToggleControl
          v-model="optimistic"
          label="optimistic"
          code
          hint="show the new value before the save resolves, revert if it fails"
        />
        <ToggleControl
          v-model="allowInactive"
          label="isEditable"
          code
          hint="off: inactive rows refuse to open a cell"
        />
        <template #hint>
          Editable: {{ editableColumns.join(', ') }}. Copy and paste are on the
          <strong>Cell cursor</strong> tab: they belong to a focused cell, and this table renders
          none.
        </template>
      </ControlGroup>

      <ControlGroup legend="The fake server">
        <RangeControl v-model="latencyMs" label="latency" :min="0" :max="2000" :step="50" unit="ms" />
        <ToggleControl
          :model-value="failureRate > 0"
          label="flaky"
          hint="half of all saves are rejected — the cell shows the error and keeps the draft"
          @update:model-value="failureRate = $event ? 0.5 : 0"
        />
      </ControlGroup>
    </template>

    <DataTable
      :columns="columns"
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
