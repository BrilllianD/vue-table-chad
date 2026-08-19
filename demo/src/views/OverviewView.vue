<script setup lang="ts">
/**
 * The preset, with every prop and slot it has wired to a control.
 *
 * Ten lines of setup buy sorting, Excel filters, paging, selection and column
 * layout. Everything below the `<DataTable>` tag is the demo's own chrome, not
 * the table's requirement.
 */
import { computed, ref, shallowRef } from 'vue'
import {
  DataTable,
  clearColumnLayout,
  useLocalDataSource,
  useTableState,
  type LocalDataSource,
  type QueryState,
  type RowId,
  type SelectionMode,
  type TableState,
  type TableStateOptions,
} from '@sandbox/vue-table'
import { employees, type Employee } from '../data/dataset'
import { employeeColumns } from '../columns'
import DemoSection from '../components/DemoSection.vue'
import StateInspector from '../components/StateInspector.vue'
import TableStatus from '../components/TableStatus.vue'

const rows = shallowRef(employees.slice(0, 800))

// Initial sort and page size come from the state, not from a prop on the
// component — so the same starting point works for any of the three layers.
const stateOptions: TableStateOptions = {
  initialSort: [{ columnId: 'department', direction: 'asc' }],
  pageSize: 10,
  initialSearch: '',
}

const state: TableState = useTableState(stateOptions)

const source: LocalDataSource<Employee> = useLocalDataSource<Employee>(
  rows,
  employeeColumns,
  state.query,
)

/* ------------------------------------------------------------- live props */

const selectable = ref<false | SelectionMode>('multiple')
const showToolbar = ref(true)
const showSearch = ref(true)
const showColumnsMenu = ref(true)
const showPagination = ref(true)
const showFooter = ref(false)
const stickyHeader = ref(true)
const customToolbar = ref(false)
const onlyActiveSelectable = ref(false)

/* ----------------------------------------------------------------- events */

const lastQuery = ref<QueryState | null>(null)
const selectedIds = ref<RowId[]>([])
const lastClicked = ref<Employee | null>(null)

/** Rows are keyed by `id` by default; this shows the hook for anything else. */
const getRowId = (row: Employee): RowId => row.id

const isRowSelectable = (row: Employee): boolean =>
  onlyActiveSelectable.value ? row.active : true

const filteredCount = computed(() => source.total.value)

/* ------------------------------------------------------------ persistence */

/**
 * One prop, and the columns this table shows — and the order they are in —
 * survive a reload. Hide a column, drag a header, then refresh the page.
 */
const LAYOUT_KEY = 'vue-table-demo:overview'

/** Remounts the table so it starts from the (now empty) saved layout. */
const tableKey = ref(0)

function forgetLayout(): void {
  clearColumnLayout({ key: LAYOUT_KEY })
  tableKey.value += 1
}
</script>

<template>
  <DemoSection
    title="Everything at once"
    blurb="One DataTable over a local array: sorting (shift-click a header to stack sort keys),
           Excel-style filters, paging, selection and column layout. Every switch below is an
           actual prop or slot of the component."
    :api="[
      'DataTable',
      'useTableState',
      'useLocalDataSource',
      'ColumnDef.accessor',
      'ColumnDef.comparator',
      'ColumnDef.format',
      'cell:* slots',
      'ColumnDef.aggregate',
      'DataTable showFooter',
      'DataTable storageKey',
    ]"
  >
    <template #controls>
      <div class="controls">
        <label>
          Selection
          <select v-model="selectable">
            <option :value="false">off</option>
            <option value="single">single</option>
            <option value="multiple">multiple</option>
          </select>
        </label>

        <label><input v-model="showToolbar" type="checkbox" /> showToolbar</label>
        <label><input v-model="showSearch" type="checkbox" /> showSearch</label>
        <label><input v-model="showColumnsMenu" type="checkbox" /> showColumnsMenu</label>
        <label><input v-model="showPagination" type="checkbox" /> showPagination</label>
        <label><input v-model="showFooter" type="checkbox" /> showFooter</label>
        <label><input v-model="stickyHeader" type="checkbox" /> stickyHeader</label>
        <label><input v-model="customToolbar" type="checkbox" /> custom #toolbar slot</label>
        <label>
          <input v-model="onlyActiveSelectable" type="checkbox" /> isRowSelectable = row.active
        </label>

        <button type="button" @click="state.reset()">state.reset()</button>
        <button type="button" @click="forgetLayout()">forget saved layout</button>
        <span class="hint">
          columns are saved to localStorage via <code>storage-key</code> — hide one, drag a header,
          then reload
        </span>
      </div>
    </template>

    <DataTable
      :key="tableKey"
      :columns="employeeColumns"
      :source="source"
      :state="state"
      :selectable="selectable"
      :get-row-id="getRowId"
      :is-row-selectable="isRowSelectable"
      :initial-layout="{ hidden: ['email'], widths: { name: 200 } }"
      :storage-key="LAYOUT_KEY"
      :show-toolbar="showToolbar"
      :show-search="showSearch"
      :show-columns-menu="showColumnsMenu"
      :show-pagination="showPagination"
      :show-footer="showFooter"
      :sticky-header="stickyHeader"
      empty-message="Nothing matches those filters — try clearing one."
      @update:query="lastQuery = $event"
      @update:selection="selectedIds = $event"
      @row-click="lastClicked = $event"
    >
      <!-- Replaces the default search + columns menu entirely. -->
      <template v-if="customToolbar" #toolbar="{ state: s }">
        <input
          class="vt-search"
          type="search"
          placeholder="Custom search…"
          :value="s.globalSearch.value"
          @input="s.setSearch(($event.target as HTMLInputElement).value)"
        />
        <!-- Defined in this demo, not the library: it injects the same context
             the built-in primitives use, which is why it needs no props. -->
        <TableStatus />
        <span class="spacer" />
        <button type="button" class="vt-btn" @click="s.clearAllFilters()">Clear filters</button>
        <button type="button" class="vt-btn" @click="s.clearSort()">Clear sort</button>
      </template>

      <!-- Cell slots get the row, the resolved column, the raw value and the
           formatted text — so a slot never has to re-derive what the column
           already knows. -->
      <template #cell:name="{ row, text }">
        <a :href="`#/people/${row.id}`" @click.stop>{{ text }}</a>
      </template>

      <template #cell:tags="{ row }">
        <span v-if="row.tags.length === 0" class="muted">—</span>
        <span v-for="tag in row.tags" :key="tag" class="chip">{{ tag }}</span>
      </template>

      <template #cell:rating="{ value }">
        <span class="meter" :title="`${Number(value).toFixed(1)} of 5`">
          <span class="meter-fill" :style="{ width: `${(Number(value) / 5) * 100}%` }" />
        </span>
      </template>

      <template #cell:active="{ value }">
        <span class="pill" :class="value ? 'pill-on' : 'pill-off'">
          {{ value ? 'Active' : 'Inactive' }}
        </span>
      </template>

      <template #empty>
        <span class="muted">
          No rows. <button type="button" class="vt-btn vt-btn-link" @click="state.reset()">
            Reset everything
          </button>
        </span>
      </template>
    </DataTable>

    <p class="hint">
      {{ filteredCount }} of {{ rows.length }} rows match ·
      {{ selectedIds.length }} selected ·
      last clicked: <strong>{{ lastClicked?.name ?? '—' }}</strong>
    </p>

    <StateInspector label="QueryState emitted by @update:query" :value="lastQuery" />
    <StateInspector label="Selected ids from @update:selection" :value="selectedIds" />

    <p class="hint note">
      Tick <strong>custom #toolbar slot</strong> above to replace the default toolbar — including
      with a status line component that this demo defines and the library does not ship.
    </p>
  </DemoSection>
</template>

<style scoped>
.spacer { flex: 1; }
.note { border-left: 2px solid var(--line); padding-left: 10px; }
.meter {
  display: inline-block;
  width: 56px;
  height: 6px;
  border-radius: 999px;
  background: rgb(127 127 127 / 0.2);
  overflow: hidden;
  vertical-align: middle;
}
.meter-fill { display: block; height: 100%; background: var(--accent); }
</style>
