<script setup lang="ts">
/**
 * Column layout as data.
 *
 * `useColumns` folds hidden / reordered / resized / pinned state into the
 * declared defs and hands back the list to render. The layout object it owns is
 * plain JSON, so saving a view is `storage-key` on the table — or, when you want
 * to own the writes (as the panel's toggle does), the exported read/write helpers.
 *
 * Sticky offsets for pinned columns are recomputed from live widths, so dragging
 * a pinned column's edge shifts everything pinned after it.
 */
import { computed, ref, shallowRef, watch } from 'vue'
import {
  ColumnResizeHandle,
  DataTable,
  clearColumnLayout,
  readColumnLayout,
  useColumns,
  useLocalDataSource,
  useTableState,
  writeColumnLayout,
  type ColumnDef,
  type PinSide,
  type UseColumnsOptions,
  type UseColumnsResult,
} from '@brillliand/vue-table-chad'
import { employees, type Employee } from '../data/dataset'
import { columnFor, employeeColumns, sizedEmployeeColumns } from '../columns'
import DemoSection from '../components/DemoSection.vue'
import ControlGroup from '../components/ControlGroup.vue'
import ToggleControl from '../components/ToggleControl.vue'
import ChoiceControl from '../components/ChoiceControl.vue'
import StateInspector from '../components/StateInspector.vue'

/**
 * Two independent saved layouts, because this view has two independent
 * `useColumns` instances: the panel's, saved by hand so its toggle can stop
 * saving, and the table's, saved by the `storage-key` prop alone. Both keep
 * the default field set — visibility, order, widths and pins.
 */
const PANEL_STORAGE = { key: 'vue-table-chad-demo:panel-layout' }
const TABLE_STORAGE = { key: 'vue-table-chad-demo:table-layout' }

const rows = shallowRef(employees.slice(0, 300))
// 10 so the preset pager's size dropdown has a matching option to show.
const state = useTableState({ pageSize: 10 })
const source = useLocalDataSource<Employee>(rows, employeeColumns, state.query)

/**
 * The sizing defaults, which the shared fixture hides: it declares a width on
 * all eleven columns, so nothing here used to show what happens when a column
 * declares none. The derived set lives in `../columns` because the Overview
 * view shows the same three columns behind a toggle.
 */
const sizedState = useTableState({ pageSize: 5 })
const sizedSource = useLocalDataSource<Employee>(rows, sizedEmployeeColumns, sizedState.query)

/**
 * `flex`, with room to actually take.
 *
 * Six columns rather than eleven, because the surplus is the whole point and
 * the full set has none: their declared widths add up to 910px inside a page
 * that is 1240px wide. The table above shows the opposite case — a flexible
 * column in a table that already overflows gives its space up first and sits at
 * its minimum.
 */
const FLEX_TABLE_IDS = ['name', 'department', 'role', 'city', 'tags', 'salary']

/** None, one flexible column, or two — which is how equal shares get shown. */
const flexMode = ref<'none' | 'one' | 'two'>('one')

const flexIds = computed<string[]>(() =>
  flexMode.value === 'none' ? [] : flexMode.value === 'one' ? ['role'] : ['role', 'tags'],
)

const flexColumns = computed<ColumnDef<Employee>[]>(() =>
  FLEX_TABLE_IDS.map((id) => {
    const column = columnFor(id)
    // `width: undefined` as well as `flex`, because a declared width outranks
    // flex in `resolvedWidth` — the fixture declares one on every column.
    return flexIds.value.includes(id) ? { ...column, width: undefined, flex: true } : column
  }),
)

const flexState = useTableState({ pageSize: 5 })
// The full column set, not the six on screen: the pipeline reads accessors and
// formats, never widths, so the toggle is a layout change and must not hand the
// source a new columns identity to re-filter and re-sort behind.
const flexSource = useLocalDataSource<Employee>(rows, employeeColumns, flexState.query)

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
  // Restored by hand rather than via `storage`, because the toggle below has to
  // be able to stop saving: `storage` wires the watcher for the whole lifetime.
  initialLayout: readColumnLayout(PANEL_STORAGE),
}

const columns: UseColumnsResult<Employee> = useColumns<Employee>(
  employeeColumns,
  columnOptions,
)

/**
 * On by default, so the panel behaves like the table below it: edit something,
 * reload, and it is still there. Unticking it drops the saved entry — that is
 * the whole point of owning the writes by hand instead of passing `storage`.
 */
/** `column-rules`: vertical separators between every pair of columns. */
const columnRules = ref(false)

const persist = ref(true)

watch(
  () => columns.layout.value,
  (layout) => {
    if (persist.value) writeColumnLayout(layout, PANEL_STORAGE)
  },
  { deep: true },
)

watch(persist, (on) => {
  if (on) writeColumnLayout(columns.layout.value, PANEL_STORAGE)
  else clearColumnLayout(PANEL_STORAGE)
})

function cyclePin(id: string, current: PinSide | false): void {
  columns.setPinned(id, current === false ? 'left' : current === 'left' ? 'right' : false)
}

/**
 * Hands the panel's layout to the table through the table's own saved entry,
 * then remounts it — `storage-key` is read once at setup, so the remount is
 * what makes the new entry take effect.
 */
const tableKey = ref(0)
function pushToTable(): void {
  writeColumnLayout(columns.layout.value, TABLE_STORAGE)
  tableKey.value += 1
}

/** Drops the table's saved layout and puts it back to the declared defs. */
function forgetTableLayout(): void {
  clearColumnLayout(TABLE_STORAGE)
  tableKey.value += 1
}

const pinned = computed(() => columns.visible.value.filter((column) => column.pinned))
</script>

<template>
  <DemoSection
    title="Column layout"
    :try-it="[
      'Hide a column in the panel, then Push layout into the table: the table takes the panel\'s layout.',
      'Drag a header in the table onto another, reload, and it is still there — storage-key kept it.',
      'Set flexible columns to none and narrow the window: the table stops short instead of squeezing.',
    ]"
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
      'resetWidth',
      'resetWidths',
      'setPinned',
      'resetLayout',
      'DataTable storageKey',
      'DataTable columnRules',
      'readColumnLayout',
      'writeColumnLayout',
      'useColumnDnd',
      'ColumnVisibilityMenu',
      'ColumnResizeHandle',
      'ColumnDragGhost',
      'ResolvedColumn.pinOffset',
      'ColumnDef.flex',
      'ColumnDef.minWidth',
      'ColumnDef.maxWidth',
      'sanitizeColumnLayout',
      'normalizeColumnStorage',
      'DEFAULT_COLUMN_LAYOUT_FIELDS',
    ]"
  >
    <template #controls>
      <ControlGroup legend="useColumns mutators" hint="Each button is one call on the standalone instance driving the panel.">
        <button type="button" @click="columns.showAll()">showAll()</button>
        <button type="button" @click="columns.resetWidth('name')">resetWidth('name')</button>
        <button type="button" @click="columns.resetWidths()">resetWidths()</button>
        <button type="button" @click="columns.resetLayout()">resetLayout()</button>
        <button type="button" @click="columns.setOrder(['active', 'name', 'salary'])">
          setOrder(['active', 'name', 'salary'])
        </button>
      </ControlGroup>

      <ControlGroup legend="Persistence">
        <ToggleControl
          v-model="persist"
          label="persist to localStorage"
          hint="the panel's layout survives a reload while this is on"
        />
        <button type="button" @click="pushToTable()">Push layout into the table ↓</button>
        <button type="button" @click="forgetTableLayout()">Forget the table's saved layout</button>
      </ControlGroup>

      <!--
        The prop form of `--vtc-body-border-vertical-width`, which is `0px` by
        default. Off is what the table always looked like; on is the
        separators without reaching for the variable.
      -->
      <ControlGroup legend="Cell rules">
        <ToggleControl
          v-model="columnRules"
          label="column-rules"
          code
          hint="vertical separators; the table below does the same with one prop"
        />
      </ControlGroup>
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

    <!--
      No `initial-layout` here: this table remembers its own layout under
      `storage-key`, and "Push layout into the table ↓" writes the panel's
      layout into that same entry before remounting.
    -->
    <DataTable
      :key="tableKey"
      :columns="employeeColumns"
      :source="source"
      :state="state"
      :storage-key="TABLE_STORAGE.key"
      :column-rules="columnRules"
      @update:column-order="columns.setOrder($event)"
    />

    <h3 class="sizing-heading">Widths, when a column does not declare one</h3>

    <DataTable :columns="sizedEmployeeColumns" :source="sizedSource" :state="sizedState" />

    <p class="hint">
      <code>city</code> and <code>country</code> declare no <code>width</code>, so each is measured
      once from what it holds and clamped into <code>[minWidth ?? 60, maxWidth ?? 160]</code> — a
      country name needs less than the flat 160 every column used to get. <code>role</code> is
      <code>flex: true</code> and takes whatever the others leave over: narrow the window and it
      gives space up first. Every other column declares a width and renders at exactly that, which
      is the part that used to be untrue — the table sized itself to its box and the browser shared
      the surplus over all eleven. With no flexible column at all the table simply stops short of
      the right edge.
    </p>

    <p class="hint">
      <code>role</code> is a sliver up there because eleven declared widths already add up to more
      than this page is wide, and the flexible column is the one that gives its space up first. The
      table below has six columns and 330px going spare, which is what <code>flex</code> looks like
      when there is room to take.
    </p>

    <h3 class="sizing-heading">A column that takes the leftover</h3>

    <ControlGroup legend="ColumnDef.flex" hint="Declared widths total 910px; the page gives the table 1240px.">
      <ChoiceControl
        v-model="flexMode"
        label="flexible columns"
        :options="[
          { value: 'none', label: 'none' },
          { value: 'one', label: 'role' },
          { value: 'two', label: 'role + tags' },
        ]"
      />
    </ControlGroup>

    <DataTable :columns="flexColumns" :source="flexSource" :state="flexState" />

    <p class="hint">
      With <strong>none</strong>, every column renders at exactly its declared width: the table is
      910px wide and stops short of the right edge, because it sizes to <code>max-content</code> and
      nothing hands the surplus back. Make <code>role</code> flexible and it gives up its declared
      130 for everything the other five leave — 458px of the 1238 on offer. Make <code>tags</code>
      flexible too and the two take 314px each, split evenly, because <code>flex</code> is a boolean
      rather than an <code>fr</code> weight: a flexible column resolves to no width at all,
      renders as a bare <code>&lt;col&gt;</code>, and fixed table layout is what shares the leftover
      between exactly those. Drag a flexible column's edge and it stops being flexible — a resize
      writes a real width, which outranks everything. <code>flex</code> is refused on a pinned
      column, checked at read time because a pin can arrive later through <code>setPinned</code>.
    </p>

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
.sizing-heading { margin: 28px 0 8px; font-size: 15px; }
.side h4 { margin: 12px 0 4px; font-size: 13px; }

@media (max-width: 860px) {
  .layout-grid { grid-template-columns: 1fr; }
}
</style>
