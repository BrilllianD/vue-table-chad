<script setup lang="ts">
/**
 * Column layout as data.
 *
 * `useColumns` folds hidden / reordered / resized / pinned state into the
 * declared defs and hands back the list to render. The layout object it owns is
 * plain JSON, which is the whole reason a "saved view" is a `localStorage.setItem`
 * away rather than a feature request — the persistence toggle below is four lines.
 *
 * Sticky offsets for pinned columns are recomputed from live widths, so dragging
 * a pinned column's edge shifts everything pinned after it.
 */
import { computed, ref, watch } from 'vue'
import {
  ColumnResizeHandle,
  DataTable,
  useColumns,
  useLocalDataSource,
  useTableState,
  type ColumnLayoutState,
  type PinSide,
  type UseColumnsOptions,
  type UseColumnsResult,
} from '@sandbox/vue-table'
import { employees, type Employee } from '../data/dataset'
import { employeeColumns } from '../columns'
import DemoSection from '../components/DemoSection.vue'
import StateInspector from '../components/StateInspector.vue'

const STORAGE_KEY = 'vue-table-demo:layout'

const rows = ref(employees.slice(0, 300))
// 10 so the preset pager's size dropdown has a matching option to show.
const state = useTableState({ pageSize: 10 })
const source = useLocalDataSource<Employee>(rows, employeeColumns, state.query)

function loadSaved(): Partial<ColumnLayoutState> | undefined {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return undefined
  try {
    return JSON.parse(raw) as Partial<ColumnLayoutState>
  } catch {
    // A corrupt saved layout must not take the whole table down with it.
    return undefined
  }
}

/**
 * A second, standalone `useColumns` — not the one inside the table. It drives
 * the control panel, which proves the composable is usable on its own; the
 * table below gets the same layout handed to it as `initialLayout`.
 */
const columnOptions: UseColumnsOptions = {
  sortFor: state.sortFor,
  sortIndexFor: state.sortIndexFor,
  hasFilter: (id) => state.filters.value[id] !== undefined,
  defaultWidth: 150,
  initialLayout: loadSaved(),
}

const columns: UseColumnsResult<Employee> = useColumns<Employee>(
  employeeColumns,
  columnOptions,
)

const persist = ref(localStorage.getItem(STORAGE_KEY) !== null)

watch(
  () => columns.layout.value,
  (layout) => {
    if (persist.value) localStorage.setItem(STORAGE_KEY, JSON.stringify(layout))
  },
  { deep: true },
)

watch(persist, (on) => {
  if (on) localStorage.setItem(STORAGE_KEY, JSON.stringify(columns.layout.value))
  else localStorage.removeItem(STORAGE_KEY)
})

function cyclePin(id: string, current: PinSide | false): void {
  columns.setPinned(id, current === false ? 'left' : current === 'left' ? 'right' : false)
}

/** Remounts the table so it picks up the panel's layout as its initial state. */
const tableKey = ref(0)
function pushToTable(): void {
  tableKey.value += 1
}

const pinned = computed(() => columns.visible.value.filter((column) => column.pinned))
</script>

<template>
  <DemoSection
    title="Column layout"
    blurb="Visibility, order, width and pinning — all in one serialisable object. The panel below
           drives a standalone useColumns; the table has its own, reachable through the built-in
           columns menu, the resize handles on each header edge, and dragging the headers
           themselves."
    :api="[
      'useColumns',
      'toggleVisibility',
      'showAll',
      'moveColumn',
      'moveColumnTo',
      'setOrder',
      'setWidth',
      'resetWidths',
      'setPinned',
      'resetLayout',
      'useColumnDnd',
      'ColumnVisibilityMenu',
      'ColumnResizeHandle',
      'ColumnDragGhost',
      'ResolvedColumn.pinOffset',
    ]"
  >
    <template #controls>
      <div class="controls">
        <button type="button" @click="columns.showAll()">showAll()</button>
        <button type="button" @click="columns.resetWidths()">resetWidths()</button>
        <button type="button" @click="columns.resetLayout()">resetLayout()</button>
        <button type="button" @click="columns.setOrder(['active', 'name', 'salary'])">
          setOrder(['active', 'name', 'salary'])
        </button>
        <label>
          <input v-model="persist" type="checkbox" />
          Persist to localStorage
        </label>
        <button type="button" @click="pushToTable()">Push layout into the table ↓</button>
      </div>
    </template>

    <div class="layout-grid">
      <table class="layout-table">
        <thead>
          <tr>
            <th>Column</th>
            <th>Visible</th>
            <th>Order</th>
            <th>Width</th>
            <th>Pin</th>
            <th>pinOffset</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(column, index) in columns.all.value" :key="column.id">
            <td>
              <strong>{{ column.header }}</strong>
              <span v-if="column.hideable === false" class="hint"> · required</span>
              <span v-if="column.resizable === false" class="hint"> · fixed width</span>
            </td>
            <td>
              <input
                type="checkbox"
                :checked="column.visible"
                :disabled="column.hideable === false"
                @change="columns.toggleVisibility(column.id)"
              />
            </td>
            <td class="nowrap">
              <button
                type="button"
                class="tiny"
                :disabled="index === 0"
                @click="columns.moveColumn(column.id, index - 1)"
              >
                ↑
              </button>
              <button
                type="button"
                class="tiny"
                :disabled="index === columns.all.value.length - 1"
                @click="columns.moveColumn(column.id, index + 1)"
              >
                ↓
              </button>
            </td>
            <td class="nowrap">
              <!-- Widths clamp to the column's own min/max — try 20 on Salary. -->
              <input
                class="width-input"
                type="number"
                step="10"
                :value="column.resolvedWidth"
                :disabled="column.resizable === false"
                @change="columns.setWidth(column.id, Number(($event.target as HTMLInputElement).value))"
              />
              <!--
                The same handle the table headers use, here with no table
                context at all: it falls back to its `resize` event, which this
                panel wires to its own `useColumns`. Drag it, or focus it and
                press ←/→.
              -->
              <span v-if="column.resizable !== false" class="grip">
                <ColumnResizeHandle
                  :column-id="column.id"
                  :width="column.resolvedWidth ?? 150"
                  :min-width="column.minWidth"
                  @resize="(id, width) => columns.setWidth(id, width)"
                />
              </span>
            </td>
            <td>
              <button type="button" class="tiny" @click="cyclePin(column.id, column.pinned)">
                {{ column.pinned || 'none' }}
              </button>
            </td>
            <td class="num">
              {{ columns.visible.value.find((c) => c.id === column.id)?.pinOffset ?? '—' }}
            </td>
          </tr>
        </tbody>
      </table>

      <div class="side">
        <p class="hint">
          {{ pinned.length }} pinned · {{ columns.visible.value.length }} of
          {{ columns.all.value.length }} visible
        </p>
        <StateInspector label="columns.layout — the whole saved view" :value="columns.layout.value" open />

        <h4>Where the built-in controls live</h4>
        <p class="hint">
          <code>ColumnVisibilityMenu</code> is the "Columns" button in the table's own toolbar
          below — it is the one primitive that genuinely requires a table context, so it cannot be
          rendered out here. The panel on the left is what you build instead when the control has
          to live somewhere else entirely.
        </p>
      </div>
    </div>

    <DataTable
      :key="tableKey"
      :columns="employeeColumns"
      :source="source"
      :state="state"
      :initial-layout="columns.layout.value"
      @update:column-order="columns.setOrder($event)"
    />

    <p class="hint">
      Drag a header <em>body</em> to move the column, or its right edge to resize it — two different
      pointer gestures on the same cell, split by a 4px threshold so a plain click still sorts.
      Dropping onto a pinned column pins the dragged one to that side. Keyboard: focus a header and
      press <kbd>Alt</kbd>+<kbd>←</kbd>/<kbd>→</kbd>; <kbd>Esc</kbd> aborts a drag. The reorder is
      reported through <code>@update:column-order</code>, which is what feeds it back into the
      panel above. Components in use here: <code>ColumnVisibilityMenu</code>,
      <code>ColumnResizeHandle</code>, <code>ColumnDragGhost</code>.
    </p>
  </DemoSection>
</template>

<style scoped>
.layout-grid { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr); gap: 20px; align-items: start; }

.layout-table { border-collapse: collapse; font-size: 13px; width: 100%; }
.layout-table th, .layout-table td {
  text-align: left;
  padding: 4px 8px 4px 0;
  border-bottom: 1px solid var(--line);
}
.layout-table th { font-weight: 600; opacity: 0.7; font-size: 12px; }
.nowrap { white-space: nowrap; }
.num { text-align: right; font-variant-numeric: tabular-nums; opacity: 0.7; }
.width-input { width: 72px; }
/* `.vt-resize` positions itself absolutely, so it needs a sized, relative host. */
.grip {
  position: relative;
  display: inline-block;
  width: 14px;
  height: 20px;
  vertical-align: middle;
  border-left: 1px solid var(--line);
}
.tiny { padding: 0 6px; font-size: 12px; }
.side h4 { margin: 12px 0 4px; font-size: 13px; }

@media (max-width: 860px) {
  .layout-grid { grid-template-columns: 1fr; }
}
</style>
