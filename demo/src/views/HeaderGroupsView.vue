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
  columnBandEdges,
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
 * The rule between bands, as a width.
 *
 * `--vt-band-border-width` is on by default — unlike the body's column
 * separators — because it is emitted only where a boundary falls: a table
 * declaring no bands never sees it. `0px` is how you turn it off; a bare `0`
 * would not be a length and would take the whole `border-right` with it.
 */
const bandRule = ref('1px')

/**
 * The same rule again, as a prop rather than a variable.
 *
 * Three states, not two, because `undefined` is a real one: the prop then
 * emits nothing and the `--vt-band-border-width` select above governs. Pass it
 * and it wins — it arrives as an inline custom property on `.vt-datatable`,
 * which is the element the token is declared on.
 */
const bandRulesProp = ref<'unset' | 'on' | 'off'>('unset')
const bandRules = computed(() =>
  bandRulesProp.value === 'unset' ? undefined : bandRulesProp.value === 'on',
)

/** Whether *Employment record* declares styling of its own. */
const styledBand = ref(true)

/**
 * The same bands, with one of them dressed up.
 *
 * `borderColor` and `borderWidth` reach the cells either side of the boundary
 * as custom properties, so they follow the band down through the body and the
 * footer. `class` does not, and cannot: a `<td>` belongs to a column and knows
 * nothing about the bands above it, so a class can only ever reach the band's
 * own header cells.
 */
const styledBands = computed<ColumnGroupDef[]>(() =>
  employeeColumnGroups.map((band) =>
    styledBand.value && band.id === 'record'
      ? {
          ...band,
          background: 'rgb(249 115 22 / 0.14)',
          borderColor: 'rgb(249 115 22)',
          borderWidth: '2px',
          class: 'band-record',
        }
      : band,
  ),
)

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

/**
 * Where the vertical rules come from.
 *
 * A boundary belongs to a *position* in the visible order rather than to a
 * column, so it is a map keyed by the column each rule falls to the right of —
 * and the depth in it is the nesting level of the band that stops there, which
 * is what `[data-band-edge='0']` keys off to weight an outer rule heavier.
 * `useColumns().bandEdges` is this same call, made for you.
 */
const previewEdges = computed(() =>
  columnBandEdges(preview.visible.value, employeeColumnGroups),
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
      'columnGroupPaths',
      'columnBandEdges',
      'DataTable bandRules',
      'BandEdge',
    ]"
  >
    <template #controls>
      <div class="controls">
        <label><input v-model="selectable" type="checkbox" /> selectable</label>
        <label><input v-model="stickyHeader" type="checkbox" /> stickyHeader</label>
        <label>
          --vt-band-border-width
          <select v-model="bandRule">
            <option value="0px">0px</option>
            <option value="1px">1px</option>
            <option value="3px">3px</option>
          </select>
        </label>
        <label>
          band-rules
          <select v-model="bandRulesProp">
            <option value="unset">(unset)</option>
            <option value="on">true</option>
            <option value="off">false</option>
          </select>
        </label>
        <label><input v-model="styledBand" type="checkbox" /> style one band</label>

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

    <p class="note">
      A vertical rule marks where each band's run of columns ends, drawn the full height of the
      table rather than only in the header — <code>data-band-edge</code> carries the depth of the
      band that stops there, so <code>[data-band-edge='0']</code> is the outermost boundary and
      can be weighted heavier than the ones inside it. Change the width above, or let
      <strong>Employment record</strong> declare a <code>borderColor</code>,
      <code>borderWidth</code>, <code>background</code> and <code>class</code> of its own — the
      first three follow it down into the body, the class stays in the header.
    </p>

    <p class="note">
      <code>band-rules</code> is the same width as a prop. Left
      <strong>(unset)</strong> it emits nothing and the variable above governs —
      which is what lets a stylesheet keep setting its own width. Pass it and the prop wins,
      because it lands as an inline custom property on the element the token is declared on.
      <code>column-rules</code> is its counterpart for the separators between <em>all</em>
      columns, shown on the <strong>Column layout</strong> view.
    </p>

    <DataTable
      :columns="groupedEmployeeColumns"
      :column-groups="styledBands"
      :source="source"
      :state="state"
      :selectable="selectable"
      :sticky-header="stickyHeader"
      :band-rules="bandRules"
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
        <code>columnBandEdges(columns, bands)</code> — the boundary to the right of each
        column, and the depth of the band that ends there:
        <code v-for="[columnId, edge] in previewEdges" :key="columnId" class="edge">
          {{ columnId }} → {{ edge.depth }}
        </code>
      </p>
      <p class="note">
        <code>collapsedGroups</code>:
        <code>{{ JSON.stringify(preview.layout.value.collapsedGroups) }}</code>
      </p>
    </div>
  </DemoSection>
</template>

<style scoped>
/*
 * The variables are declared on `.vt-datatable` itself, so an ancestor cannot
 * win on specificity — the override has to land on that element, which is what
 * `:deep` reaches. A band's own `borderWidth` beats this in turn, because that
 * one arrives as an inline custom property on the cells at the boundary.
 */
:deep(.vt-datatable) { --vt-band-border-width: v-bind(bandRule); }

/* What `ColumnGroupDef.class` buys: a hook on the band's header cells only. */
:deep(.band-record) { font-style: italic; letter-spacing: 0.02em; }

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
.edge { margin-right: 6px; }
</style>
