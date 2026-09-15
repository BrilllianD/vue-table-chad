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
  type TableExportPayload,
  type TableState,
  type TableStateOptions,
} from '@brillliand/vue-table-chad'
import { employees, type Employee } from '../data/dataset'
import { employeeColumns, sizedEmployeeColumns } from '../columns'
import DemoSection from '../components/DemoSection.vue'
import ControlGroup from '../components/ControlGroup.vue'
import ToggleControl from '../components/ToggleControl.vue'
import ChoiceControl from '../components/ChoiceControl.vue'
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

// The declared set, always — even when the table below is rendering the other
// one. Width is not a pipeline input, so handing the source a fresh columns
// identity on a layout toggle would buy a filter and a sort pass for nothing.
const source: LocalDataSource<Employee> = useLocalDataSource<Employee>(
  rows,
  employeeColumns,
  state.query,
)

/* ------------------------------------------------------------- live props */

const selectable = ref<false | SelectionMode>('multiple')
/** Shift- and Ctrl/Cmd-click on the row itself, not only on its checkbox. */
const rowClickSelect = ref(false)
const showToolbar = ref(true)
const showSearch = ref(true)
const showColumnsMenu = ref(true)
const showGroupMenu = ref(true)
const contextMenu = ref(true)
const showPagination = ref(true)
const showFooter = ref(false)
const showExport = ref(true)
const stickyHeader = ref(true)
/** Drag a header onto another to move the column. Off leaves every other layout route working. */
const reorderable = ref(true)
/** Ticked, `@export` calls `preventDefault()` and nothing reaches the disk. */
const interceptExport = ref(false)
const customToolbar = ref(false)
const onlyActiveSelectable = ref(false)
/** Swaps in the three columns that declare no `width` — see `sizedEmployeeColumns`. */
const sizingDefaults = ref(false)

const tableColumns = computed(() =>
  sizingDefaults.value ? sizedEmployeeColumns : employeeColumns,
)

/* ----------------------------------------------------------------- events */

const lastQuery = ref<QueryState | null>(null)
const selectedIds = ref<RowId[]>([])
const lastClicked = ref<Employee | null>(null)
const lastOrder = ref<string[] | null>(null)

/**
 * The last export, as the payload described it.
 *
 * `@export` fires before the download, so a handler that calls `preventDefault`
 * replaces it rather than racing it — which is what the intercept switch does.
 * Only the first three lines are kept: the point is the shape, and the file is
 * every filtered row.
 */
const lastExport = ref<{ filename: string; rows: number; head: string } | null>(null)

function onExport(payload: TableExportPayload): void {
  const lines = payload.text.split('\n')
  lastExport.value = {
    filename: payload.filename,
    // Minus the header row, and minus the trailing newline's empty last entry.
    rows: Math.max(lines.length - 2, 0),
    head: lines.slice(0, 3).join('\n'),
  }
  if (interceptExport.value) payload.preventDefault()
}

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
const LAYOUT_KEY = 'vue-table-chad-demo:overview'

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
    :try-it="[
      'Switch selectable to single, then tick two rows: the second replaces the first.',
      'Turn on @export and click Export in the toolbar: the payload lands below the table instead of a file.',
      'Turn on reorderable and drag a header onto another; then reload — storage-key kept the order.',
    ]"
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
      'DataTable showExport',
      'DataTable showGroupMenu',
      'DataTable contextMenu',
      'DataTable reorderable',
      'exportRows',
      'downloadText',
      'TableExportPayload',
      'DataTable storageKey',
      'DataTable rowClickSelect',
      'ColumnDef.flex',
      'ColumnDef.minWidth',
      'ColumnDef.maxWidth',
      'TableRow',
    ]"
  >
    <template #controls>
      <ControlGroup legend="Selection">
        <ChoiceControl
          v-model="selectable"
          label="selectable"
          code
          :options="[
            { value: false, label: 'off' },
            { value: 'single', label: 'single' },
            { value: 'multiple', label: 'multiple' },
          ]"
        />
        <ToggleControl
          v-model="rowClickSelect"
          label="rowClickSelect"
          code
          hint="click a row to select it; shift-click for a range, ctrl/cmd-click for one"
        />
        <ToggleControl
          v-model="onlyActiveSelectable"
          label="isRowSelectable"
          code
          hint="inactive rows get a disabled checkbox and are skipped by ranges"
        />
      </ControlGroup>

      <ControlGroup legend="Chrome">
        <ToggleControl v-model="showToolbar" label="showToolbar" code />
        <ToggleControl v-model="showSearch" label="showSearch" code />
        <ToggleControl v-model="showColumnsMenu" label="showColumnsMenu" code />
        <ToggleControl v-model="showGroupMenu" label="showGroupMenu" code />
        <ToggleControl
          v-model="contextMenu"
          label="contextMenu"
          code
          hint="right-click a cell, or Shift+F10"
        />
        <ToggleControl v-model="showPagination" label="showPagination" code />
        <ToggleControl v-model="showFooter" label="showFooter" code hint="the aggregate row" />
        <ToggleControl v-model="stickyHeader" label="stickyHeader" code />
        <ToggleControl
          v-model="customToolbar"
          label="#toolbar slot"
          code
          hint="replaces the built-in toolbar with this view's own"
        />
      </ControlGroup>

      <ControlGroup legend="Export">
        <ToggleControl
          v-model="showExport"
          label="showExport"
          code
          hint="writes every filtered row, not the page"
        />
        <ToggleControl
          v-model="interceptExport"
          label="@export"
          code
          hint="preventDefault() — the payload shows below instead of a file"
        />
      </ControlGroup>

      <ControlGroup
        legend="Columns"
        hint="Column layout is saved to localStorage via storage-key — hide one, drag a header, then reload."
      >
        <ToggleControl
          v-model="reorderable"
          label="reorderable"
          code
          hint="drag a header onto another; the Columns menu still reorders"
        />
        <ToggleControl
          v-model="sizingDefaults"
          label="width defaults"
          hint="city and country measured from what they hold, role flexible"
        />
        <button type="button" @click="forgetLayout()">forget saved layout</button>
      </ControlGroup>

      <ControlGroup legend="State">
        <button type="button" @click="state.reset()">state.reset()</button>
      </ControlGroup>
    </template>

    <DataTable
      :key="tableKey"
      :columns="tableColumns"
      :source="source"
      :state="state"
      :selectable="selectable"
      :row-click-select="rowClickSelect"
      :get-row-id="getRowId"
      :is-row-selectable="isRowSelectable"
      :initial-layout="{ hidden: ['email'], widths: { name: 200 } }"
      :storage-key="LAYOUT_KEY"
      :show-toolbar="showToolbar"
      :show-search="showSearch"
      :show-columns-menu="showColumnsMenu"
      :show-group-menu="showGroupMenu"
      :context-menu="contextMenu"
      :show-pagination="showPagination"
      :show-footer="showFooter"
      :show-export="showExport"
      export-filename="employees.csv"
      :sticky-header="stickyHeader"
      :reorderable="reorderable"
      empty-message="Nothing matches those filters — try clearing one."
      @update:query="lastQuery = $event"
      @update:selection="selectedIds = $event"
      @update:column-order="lastOrder = $event"
      @row-click="lastClicked = $event"
      @export="onExport"
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

    <p class="hint">
      With <strong>width defaults</strong> on, <code>city</code> and <code>country</code> declare no
      <code>width</code>: each is measured once from what it holds and clamped into
      <code>[minWidth ?? 60, maxWidth ?? 160]</code> — city comes out around 102px rather than the
      flat 160 every undeclared column used to get. <code>role</code> is <code>flex: true</code> and
      takes whatever the other columns leave over, which on this page is nothing: the declared
      widths already add up to more than the 1240px the demo gives them, so the flexible column is
      the one that gives its space up first and sits at a sliver until something frees space. Hide
      a couple of columns from the <strong>Columns</strong> menu and watch it take the room back. A
      width you dragged yourself outranks both and is saved, so <strong>forget saved layout</strong>
      is what puts the measurement back.
    </p>

    <p class="hint">
      <strong>Export</strong> writes every row the filters and the search left, in the sort order on
      screen and with each column's own <code>format</code> applied — the file matches what you are
      reading rather than the page you happen to be on. It is off by default on a real table:
      <code>show-export</code> is the one <code>show*</code> prop that writes to the reader's disk.
      Tick <strong>intercept @export</strong> and the handler calls <code>preventDefault()</code>,
      so nothing downloads and the payload below is all that happens — that is the hook for POSTing
      the text or naming the file from the query instead.
    </p>

    <StateInspector label="QueryState emitted by @update:query" :value="lastQuery" />
    <StateInspector label="Selected ids from @update:selection" :value="selectedIds" />
    <StateInspector label="Column order from @update:columnOrder" :value="lastOrder" />
    <StateInspector label="TableExportPayload from @export" :value="lastExport" />

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
