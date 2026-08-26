<script setup lang="ts">
/**
 * Header bands, and what folding one actually does.
 *
 * The thing worth watching on this page is the *column count*. Folding a band
 * does not draw a narrower header over the same table — it takes those columns
 * out of `useColumns().visible`, which is the one list the header, the
 * `<colgroup>`, every body row and the footer all read. So the header, the
 * widths and the cells go together, and nothing had to be told about bands to
 * make that true.
 *
 * The inspector below reads the same layout object `storageKey` persists, so
 * you can watch `collapsedGroups` fill up as you click.
 */
import { computed, ref, shallowRef } from 'vue'
import {
  DataTable,
  buildHeaderRows,
  useColumns,
  useLocalDataSource,
  useTableState,
  type ColumnGroupDef,
  type TableState,
} from '@brillliand/vue-table-chad'
import { employeeColumnGroups, groupedEmployeeColumns } from '../columns'
import { employees, type Employee } from '../data/dataset'
import DemoSection from '../components/DemoSection.vue'

const rows = shallowRef(employees.slice(0, 400))

const state: TableState = useTableState({ pageSize: 8 })
const source = useLocalDataSource<Employee>(rows, groupedEmployeeColumns, state.query)

const selectable = ref(false)
const stickyHeader = ref(true)

/**
 * A second, standalone `useColumns` over the same declarations.
 *
 * Not the one the table below is using — this is the point the "Core only"
 * view makes about every composable here, made again for bands: the header
 * shape is a pure function of a column list and a set of band defs, reachable
 * with no component in sight.
 */
const preview = useColumns<Employee>(groupedEmployeeColumns, { groups: employeeColumnGroups })
const previewRows = computed(() =>
  buildHeaderRows(preview.visible.value, employeeColumnGroups),
)

/** Every band the columns claim, for the fold-them-by-hand controls. */
const bands = computed<ColumnGroupDef[]>(() => employeeColumnGroups)

function toggle(band: ColumnGroupDef): void {
  preview.toggleGroup(band.id)
}
</script>

<template>
  <DemoSection
    title="Header bands"
    blurb="Columns banded under a shared header, nested as deep as you like, each band with a
           control that folds it down to one column. Folding is a subtraction from the visible
           column list — the same list the header, the colgroup, the rows and the footer all
           read — so a fold moves all four together and reaches the row pipeline not at all."
    :api="[
      'DataTable columnGroups',
      'ColumnDef.group',
      'ColumnGroupDef',
      'buildHeaderRows',
      'columnGroupPath',
      'TableHeaderGroupCell',
      'useColumns groups',
      'ColumnLayoutState.collapsedGroups',
    ]"
  >
    <template #controls>
      <div class="controls">
        <label><input v-model="selectable" type="checkbox" /> selectable</label>
        <label><input v-model="stickyHeader" type="checkbox" /> stickyHeader</label>

        <span class="divider" />

        <!--
          The same folds the header's own carets perform, driven from outside
          instead — collapse state lives in the column layout, not in the cell,
          so anything holding the composable can move it.
        -->
        <label v-for="band in bands" :key="band.id">
          <input
            type="checkbox"
            :checked="preview.isGroupCollapsed(band.id)"
            @change="toggle(band)"
          />
          {{ band.header ?? band.id }}
        </label>

        <span class="divider" />

        <button type="button" @click="preview.collapseAllGroups()">Fold all</button>
        <button type="button" @click="preview.expandAllGroups()">Unfold all</button>
      </div>
    </template>

    <p class="note">
      <strong>Identity</strong>, <strong>Organisation</strong> and <strong>Location</strong>
      nest inside <strong>Personal details</strong>, making the header three rows deep, while
      <strong>Employment record</strong> sits at the top level and its columns one row
      shallower. <code>tags</code> and <code>active</code> are in no band at all and span down
      through every row. Because <code>name</code> is pinned left, both
      <strong>Identity</strong> and <strong>Personal details</strong> are split by the pin
      hoisting and render as two cells carrying one label — scroll sideways to see why that has
      to be, since a single spanning cell would have to stretch across the scroll gap between
      them. Drag a column out of its band to split one yourself.
    </p>

    <DataTable
      :columns="groupedEmployeeColumns"
      :column-groups="employeeColumnGroups"
      :source="source"
      :state="state"
      :selectable="selectable"
      :sticky-header="stickyHeader"
      storage-key="vt-demo-header-bands"
      show-footer
      footer-label="All 400"
    />

    <div class="panel">
      <h3>The same header, built with no component at all</h3>
      <p class="note">
        <code>buildHeaderRows(columns, bands)</code> over a standalone
        <code>useColumns</code>. The checkboxes above drive this one; the table's own carets
        drive its own. Two independent layouts over one set of declarations.
      </p>
      <ol class="rows">
        <li v-for="(headerRow, level) in previewRows" :key="level">
          <strong>row {{ level }}</strong>
          <span v-for="cell in headerRow" :key="cell.key" class="cell">
            {{ cell.kind === 'group' ? cell.group.header ?? cell.group.id : cell.column.id }}
            <em v-if="cell.kind === 'group'">colspan {{ cell.colspan }}</em>
            <em v-else-if="cell.rowspan > 1">rowspan {{ cell.rowspan }}</em>
          </span>
        </li>
      </ol>
      <p class="note">
        <code>collapsedGroups</code>:
        <code>{{ JSON.stringify(preview.layout.value.collapsedGroups) }}</code>
      </p>
    </div>
  </DemoSection>
</template>

<style scoped>
.divider { width: 1px; align-self: stretch; background: var(--line); }
.note { border-left: 2px solid var(--line); padding-left: 10px; }

.panel {
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.panel h3 { margin: 0; font-size: 14px; }

.rows { margin: 0; padding: 0; list-style: none; font-size: 13px; display: grid; gap: 4px; }
.rows li { display: flex; gap: 8px; align-items: baseline; flex-wrap: wrap; }
.rows strong { min-width: 60px; }
.cell {
  border: 1px solid var(--line);
  border-radius: 4px;
  padding: 1px 6px;
  display: inline-flex;
  gap: 6px;
}
.cell em { color: var(--muted); font-style: normal; font-variant-numeric: tabular-nums; }
</style>
