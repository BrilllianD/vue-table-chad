<script setup lang="ts">
/**
 * Expandable detail rows: a row opens to show the entities that hang off it.
 *
 * Two shapes, because they answer different questions. The first is a table
 * inside a table — the row's children, with their own columns, sorting and
 * empty state. The second is a hand-assembled panel: no nested table at all,
 * just the row's own fields laid out, built from the primitives so the parts
 * `DataTable` hides are visible.
 *
 * What both have in common is that the panel is **a row of the table**, not a
 * decoration attached to the row above it. That is what lets a windowed body
 * count and measure it — see the `virtual` note in the docs page.
 */
import { computed, ref, shallowRef } from 'vue'
import {
  DataTable,
  TableDetailRow,
  TableGrid,
  TableHeaderCell,
  TableRoot,
  TableRow,
  SortTrigger,
  detailToggleFor,
  useLocalDataSource,
  useRowExpansion,
  useTableState,
  withDetailRows,
  type ColumnDef,
  type DisplayRow,
} from '@brillliand/vue-table-chad'
import { employees, type Employee } from '../data/dataset'
import { employeeColumns } from '../columns'
import DemoSection from '../components/DemoSection.vue'
import AssignmentsTable from '../components/AssignmentsTable.vue'

/* ------------------------------------------------- the child entities */

interface Assignment extends Record<string, unknown> {
  id: string
  project: string
  role: string
  share: number
  since: string
}

const PROJECTS = ['Atlas', 'Beacon', 'Cinder', 'Delta', 'Ember', 'Fathom']

/**
 * A deterministic child list per employee, derived rather than stored: the
 * point of the view is the panel, and a row whose children changed on every
 * render would make it impossible to tell a re-render from a refetch.
 *
 * Synchronous here. Loading these when the row opens is `loadDetail`, which the
 * docs page covers.
 */
function assignmentsFor(row: Employee): Assignment[] {
  const count = row.id % 4
  return Array.from({ length: count }, (_, i) => ({
    id: `${row.id}-${i}`,
    project: PROJECTS[(row.id + i) % PROJECTS.length]!,
    role: row.role,
    share: [10, 25, 50][(row.id + i) % 3]!,
    since: row.hiredAt ?? '—',
  }))
}

const assignmentColumns: ColumnDef<Assignment>[] = [
  { id: 'project', header: 'Project', type: 'text', width: 140 },
  { id: 'role', header: 'Role', type: 'text', width: 160 },
  { id: 'share', header: 'Share', type: 'number', format: (value) => `${String(value)}%`, width: 90 },
  { id: 'since', header: 'Since', type: 'date', width: 120 },
]

/* --------------------------------------------- a table inside a table */

const rows = shallowRef(employees.slice(0, 200))
const state = useTableState({ pageSize: 8 })
const source = useLocalDataSource<Employee>(rows, employeeColumns, state.query)

/**
 * Handed in rather than left to `expandable`, so the buttons below can drive it
 * and the open ids are visible. `expandable` alone is the short form and makes
 * the table own one of these internally.
 */
const expansion = useRowExpansion<Employee>()

const shown = employeeColumns.filter((column) =>
  ['name', 'department', 'role', 'hiredAt'].includes(column.id),
)

/* ------------------------------------------- the hand-assembled panel */

const panelState = useTableState({ pageSize: 6 })
const panelSource = useLocalDataSource<Employee>(rows, employeeColumns, panelState.query)
const panelExpansion = useRowExpansion<Employee>({ initial: [employees[0]!.id] })

/**
 * The interleave `DataTable` does for you, spelled out: a flat list of lines,
 * with a `detail` line after each open row. A function rather than a computed
 * because the page comes in through the slot; in a component that owned its
 * rows this would be one `computed`.
 */
function linesFor(pageRows: Employee[]): DisplayRow<Employee>[] {
  const lines: DisplayRow<Employee>[] = pageRows.map((row, index) => ({
    kind: 'row',
    row,
    index,
    depth: 0,
  }))
  return withDetailRows(lines, panelExpansion.isExpanded)
}

/**
 * `Alt` + `↓`/`↑` on a row, decoded by the same function `DataTable` uses. The
 * pair is unclaimed by every other cursor gesture, which is why it is the one
 * the library spends on this.
 */
function onRowKeydown(event: KeyboardEvent, row: Employee): void {
  const toggle = detailToggleFor(event)
  if (!toggle) return
  event.preventDefault()
  panelExpansion.toggle(row, toggle === 'expand')
}

const openCount = computed(() => expansion.expanded.value.length)
const nested = ref(true)
</script>

<template>
  <DemoSection
    title="Detail rows"
    blurb="A row opens to show what hangs off it: a nested table of child entities, or a panel of
           the row's own fields. The panel is a row of the table rather than something attached to
           one — which is what lets a virtual body count it, and why virtual needs measureRows
           here. Click a caret, or press Alt+Down and Alt+Up on a focused row."
    :api="[
      'DataTable expansion',
      'DataTable #detail',
      'useRowExpansion',
      'withDetailRows',
      'TableDetailRow',
      'detailToggleFor',
      'expandAll',
      'collapseAll',
    ]"
  >
    <template #controls>
      <div class="controls">
        <button type="button" class="vt-btn" @click="expansion.expandAll(source.rows.value)">
          expandAll(page)
        </button>
        <button type="button" class="vt-btn" @click="expansion.collapseAll()">collapseAll()</button>
        <label>
          <input v-model="nested" type="checkbox" />
          Nested table in the panel
        </label>
        <span class="hint">{{ openCount }} open — ids, so they survive a page turn</span>
      </div>
    </template>

    <DataTable
      :columns="shown"
      :source="source"
      :state="state"
      :expansion="expansion"
      cell-cursor
    >
      <template #detail="{ row }">
        <!-- A table inside a table: its own columns, its own empty state. -->
        <div v-if="nested" class="detail-table">
          <strong class="detail-title">{{ row.name }} — assignments</strong>
          <p v-if="assignmentsFor(row).length === 0" class="hint">No assignments.</p>
          <AssignmentsTable
            v-else
            :key="row.id"
            :columns="assignmentColumns"
            :rows="assignmentsFor(row)"
          />
        </div>

        <!-- The same data, laid out rather than tabulated. -->
        <dl v-else class="detail-fields">
          <div v-for="assignment in assignmentsFor(row)" :key="assignment.id">
            <dt>{{ assignment.project }}</dt>
            <dd>{{ assignment.share }}% since {{ assignment.since }}</dd>
          </div>
          <p v-if="assignmentsFor(row).length === 0" class="hint">No assignments.</p>
        </dl>
      </template>
    </DataTable>
  </DemoSection>

  <DemoSection
    title="The same thing, assembled by hand"
    blurb="No DataTable: the display list is built here, withDetailRows interleaves the panels, and
           TableDetailRow renders each one. This is the shape to copy when the table markup is
           yours — the panel still has to be a sibling row spanning every column, or the colgroup
           above it goes out of alignment."
    :api="['withDetailRows', 'TableDetailRow', 'detailToggleFor', 'TableRoot', 'TableGrid']"
  >
    <TableRoot
      v-slot="{ rows: pageRows, columns: cols }"
      :columns="shown"
      :source="panelSource"
      :state="panelState"
    >
      <div class="vt-datatable">
        <div class="vt-scroll" data-sticky>
          <TableGrid :columns="cols" selection-column>
            <thead class="vt-thead">
              <tr>
                <th class="vt-th vt-th-selection" scope="col"></th>
                <TableHeaderCell v-for="column in cols" :key="column.id" :column="column">
                  <SortTrigger :column-id="column.id" :label="column.header" />
                </TableHeaderCell>
              </tr>
            </thead>

            <tbody class="vt-tbody">
              <template v-for="line in linesFor(pageRows)">
                <TableDetailRow
                  v-if="line.kind === 'detail'"
                  :key="`detail:${line.row.id}`"
                  :row="line.row"
                  :columns="cols"
                  :index="line.index"
                  :leading="1"
                >
                  <template #default="{ row }">
                    <p class="panel">
                      <strong>{{ row.name }}</strong> — {{ row.email }} · {{ row.location.city }},
                      {{ row.location.country }} · rating {{ row.rating }}
                    </p>
                  </template>
                </TableDetailRow>

                <TableRow
                  v-else-if="line.kind === 'row'"
                  :key="line.row.id"
                  :row="line.row"
                  :columns="cols"
                  :index="line.index"
                  :expanded="panelExpansion.isExpanded(line.row)"
                  tabindex="0"
                  @keydown="(event: KeyboardEvent) => onRowKeydown(event, line.row)"
                >
                  <template #leading>
                    <button
                      type="button"
                      class="vt-detail-toggle"
                      :aria-expanded="panelExpansion.isExpanded(line.row)"
                      :aria-label="
                        panelExpansion.isExpanded(line.row) ? 'Hide details' : 'Show details'
                      "
                      @click.stop="panelExpansion.toggle(line.row)"
                    >
                      <span class="vt-detail-caret" aria-hidden="true">▸</span>
                    </button>
                  </template>
                </TableRow>
              </template>
            </tbody>
          </TableGrid>
        </div>
      </div>
    </TableRoot>
  </DemoSection>
</template>

<style scoped>
.controls { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; }
.detail-table { display: flex; flex-direction: column; gap: 8px; }
.detail-title { font-size: 12.5px; }
.detail-fields { display: flex; flex-wrap: wrap; gap: 14px; margin: 0; }
.detail-fields dt { font-weight: 600; font-size: 12px; }
.detail-fields dd { margin: 0; font-size: 12px; }
.panel { margin: 0; font-size: 12.5px; }
</style>
