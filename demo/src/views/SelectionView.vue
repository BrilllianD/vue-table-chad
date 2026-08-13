<script setup lang="ts">
/**
 * Selection in full, built on `<TableRoot>` rather than `<DataTable>` so the
 * whole `UseRowSelection` object is in scope and can be shown live.
 *
 * The interesting case is "select all 6,000 matching". That cannot be an id
 * list, so it is modelled as a predicate — `{ mode: 'all-matching', excluded }`
 * — and deselecting a row inside it records an exclusion instead of collapsing
 * the whole thing back into ids. Watch the state panel while you click.
 */
import { computed, ref } from 'vue'
import {
  SelectionCheckbox,
  SortTrigger,
  TableCell,
  TableGrid,
  TableHeaderCell,
  TablePagination,
  TableRoot,
  useLocalDataSource,
  useTableState,
  type HeaderCheckboxState,
  type RowId,
  type SelectionMode,
  type SelectionState,
} from '@sandbox/vue-table'
import { employees, type Employee } from '../data/dataset'
import { employeeColumns } from '../columns'
import DemoSection from '../components/DemoSection.vue'
import StateInspector from '../components/StateInspector.vue'

const rows = ref(employees.slice(0, 400))
const state = useTableState({ pageSize: 8 })
const source = useLocalDataSource<Employee>(rows, employeeColumns, state.query)

const mode = ref<SelectionMode>('multiple')
const onlyActiveSelectable = ref(true)

// `useRowSelection` is created once inside TableRoot, so switching modes has to
// remount it. Keying on the mode makes that explicit instead of silent.
const rootKey = computed(() => `${mode.value}-${onlyActiveSelectable.value}`)

const isRowSelectable = (row: Employee): boolean =>
  onlyActiveSelectable.value ? row.active : true

/** The default is `row.id`; passing it explicitly shows where the hook lives. */
const getRowId = (row: Employee): RowId => row.id

/** Both shapes are plain JSON, so a selection survives a round trip anywhere. */
function describeSelection(selectionState: SelectionState): string {
  return selectionState.mode === 'ids'
    ? `${selectionState.ids.length} explicit ids`
    : `everything matching, minus ${selectionState.excluded.length} exclusions`
}

function describeHeader(header: HeaderCheckboxState): string {
  return header === 'all' ? 'checked' : header === 'some' ? 'indeterminate' : 'unchecked'
}

/** Only the first few columns, to keep the focus on the checkboxes. */
const shown = employeeColumns.filter((column) =>
  ['name', 'department', 'role', 'salary', 'active'].includes(column.id),
)
</script>

<template>
  <DemoSection
    title="Selection"
    blurb="Single or multiple, shift-click ranges, a tri-state header checkbox, selection that
           survives paging, unselectable rows, and 'select all matching' as a predicate rather
           than an id list."
    :api="[
      'useRowSelection',
      'SelectionCheckbox',
      'toggleRange',
      'toggleAllOnPage',
      'selectAllMatching',
      'headerState',
      'isAllMatching',
      'isRowSelectable',
      'getRowId',
    ]"
  >
    <template #controls>
      <div class="controls">
        <label>
          Mode
          <select v-model="mode">
            <option value="multiple">multiple</option>
            <option value="single">single</option>
          </select>
        </label>
        <label>
          <input v-model="onlyActiveSelectable" type="checkbox" />
          Only active rows selectable
        </label>
        <span class="hint">Shift-click a checkbox to select a range.</span>
      </div>
    </template>

    <TableRoot
      :key="rootKey"
      v-slot="{ rows: pageRows, columns: cols, selection, total, getCellText }"
      :columns="shown"
      :source="source"
      :state="state"
      :selectable="mode"
      :get-row-id="getRowId"
      :is-row-selectable="isRowSelectable"
    >
      <div class="vt-datatable">
        <div class="vt-toolbar">
          <span v-if="selection">
            <strong>{{ selection.count.value }}</strong> selected
            <template v-if="selection.isAllMatching.value">
              — stored as a predicate, not {{ selection.count.value }} ids
            </template>
          </span>
          <span class="vt-toolbar-spacer" />
          <button
            v-if="selection && mode === 'multiple'"
            type="button"
            class="vt-btn"
            @click="selection.toggleAllOnPage()"
          >
            toggleAllOnPage()
          </button>
          <button
            v-if="selection && mode === 'multiple'"
            type="button"
            class="vt-btn"
            @click="selection.selectAllMatching()"
          >
            selectAllMatching() — {{ total }} rows
          </button>
          <button
            v-if="selection && pageRows[0]"
            type="button"
            class="vt-btn"
            @click="selection.select(pageRows[0]!, true)"
          >
            select(firstRow)
          </button>
          <button v-if="selection" type="button" class="vt-btn" @click="selection.clear()">
            clear()
          </button>
        </div>

        <div class="vt-scroll" data-sticky>
          <TableGrid :columns="cols" selection-column>
            <thead class="vt-thead">
              <tr>
                <th class="vt-th vt-th-selection" scope="col">
                  <!-- Tri-state: `indeterminate` is the "some but not all" case
                       that a plain boolean cannot express. -->
                  <SelectionCheckbox
                    v-if="selection && mode === 'multiple'"
                    :checked="selection.headerState.value === 'all'"
                    :indeterminate="selection.headerState.value === 'some'"
                    label="Select all rows on this page"
                    @change="selection.toggleAllOnPage()"
                  />
                </th>
                <TableHeaderCell v-for="column in cols" :key="column.id" :column="column">
                  <SortTrigger :column-id="column.id" :label="column.header" />
                </TableHeaderCell>
              </tr>
            </thead>

            <tbody class="vt-tbody">
              <tr
                v-for="row in pageRows"
                :key="row.id"
                class="vt-tr"
                :data-selected="selection?.isSelected(row) || undefined"
              >
                <td class="vt-td vt-td-selection">
                  <SelectionCheckbox
                    v-if="selection"
                    :checked="selection.isSelected(row)"
                    :disabled="!selection.isSelectable(row)"
                    label="Select row"
                    @change="
                      (_checked, event) =>
                        event.shiftKey ? selection.toggleRange(row) : selection.toggle(row)
                    "
                  />
                </td>
                <!-- `getCellText` honours the column's accessor and format, so
                     a hand-rolled table renders identically to the preset. -->
                <TableCell v-for="column in cols" :key="column.id" :column="column">
                  {{ getCellText(row, column) }}
                </TableCell>
              </tr>
            </tbody>
          </TableGrid>
        </div>

        <TablePagination :page-sizes="[8, 16, 32]" />
      </div>

      <div class="panels">
        <StateInspector label="selection.state — the serialisable shape" :value="selection?.state.value" open />
        <StateInspector
          label="Derived values"
          :value="{
            count: selection?.count.value,
            isEmpty: selection?.isEmpty.value,
            isAllMatching: selection?.isAllMatching.value,
            shape: selection ? describeSelection(selection.state.value) : undefined,
            headerCheckbox: selection ? describeHeader(selection.headerState.value) : undefined,
            selectedIds: selection?.selectedIds.value.slice(0, 20),
            selectedOnPage: selection?.selectedOnPage.value.map((r) => r.name),
          }"
        />
      </div>
    </TableRoot>
  </DemoSection>
</template>

<style scoped>
.panels { display: grid; gap: 8px; margin-top: 12px; }
</style>
