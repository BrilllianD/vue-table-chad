<script setup lang="ts">
/**
 * The proof that the decomposition holds.
 *
 * No `DataTable`, and no `<table>` element at all — rows render as cards. The
 * sort triggers, the Excel filter popovers, the active-filter chips, the
 * columns menu and the pager are the *same* primitives the preset uses, just
 * arranged completely differently. Nothing here reaches into internals or
 * reimplements filtering.
 *
 * `TableStatus` is a component this demo wrote itself, sitting in the same
 * context alongside the built-ins — which is the actual test of whether the
 * context is a public seam or an implementation detail.
 */
import { ref } from 'vue'
import {
  ActiveFilters,
  ColumnFilterPopover,
  ColumnVisibilityMenu,
  SelectionCheckbox,
  SortTrigger,
  TablePagination,
  TableRoot,
  useLocalDataSource,
  useTableState,
} from '@sandbox/vue-table'
import { employees, type Employee } from '../data/dataset'
import { columnFor, employeeColumns } from '../columns'
import DemoSection from '../components/DemoSection.vue'
import TableStatus from '../components/TableStatus.vue'
import MiniRoot from '../components/MiniRoot.vue'

const rows = ref(employees.slice(0, 240))
const state = useTableState({ pageSize: 6 })
const source = useLocalDataSource<Employee>(rows, employeeColumns, state.query)

const sortable = ['name', 'role', 'salary', 'hiredAt', 'rating']
const filterable = ['department', 'role', 'country', 'active']

/* ------------------------------------------- a root of our own making */

const miniRows = employees.slice(0, 60)
const miniColumns = employeeColumns.filter((column) =>
  ['name', 'role', 'salary'].includes(column.id),
)
</script>

<template>
  <DemoSection
    title="Composed from primitives"
    blurb="Same composables, same primitives, no table markup. This is what 'not a god component'
           buys you: when the preset stops fitting, you drop one layer down and rebuild the
           surface without giving up the behaviour."
    :api="[
      'TableRoot',
      'SortTrigger',
      'ColumnFilterPopover',
      'ActiveFilters',
      'ColumnVisibilityMenu',
      'TablePagination',
      'SelectionCheckbox',
      'useTableContext',
    ]"
  >
    <TableRoot
      v-slot="{ rows: pageRows, columns: cols, state: s, selection, total, getCellText }"
      :columns="employeeColumns"
      :source="source"
      :state="state"
      selectable
    >
      <div class="composed">
        <div class="bar">
          <span class="bar-label">Sort</span>
          <SortTrigger
            v-for="id in sortable"
            :key="id"
            :column-id="id"
            :label="columnFor(id).header"
          />

          <span class="bar-label">Filter</span>
          <span v-for="id in filterable" :key="id" class="bar-filter">
            {{ columnFor(id).header }}
            <ColumnFilterPopover
              :column-id="id"
              :type="columnFor(id).type"
              :label="columnFor(id).header"
            />
          </span>

          <span class="spacer" />
          <ColumnVisibilityMenu label="Fields" />
        </div>

        <!-- Chips for whatever is filtered, wherever the control happens to be. -->
        <ActiveFilters />

        <div class="bar">
          <SelectionCheckbox
            :checked="selection?.headerState.value === 'all'"
            :indeterminate="selection?.headerState.value === 'some'"
            label="Select every card on this page"
            @change="selection?.toggleAllOnPage()"
          />
          <span class="hint">Select page</span>
          <span class="spacer" />
          <TableStatus />
        </div>

        <div class="cards">
          <article
            v-for="row in pageRows"
            :key="row.id"
            class="card"
            :data-selected="selection?.isSelected(row) || undefined"
            @click="selection?.toggle(row)"
          >
            <header>
              <h3>{{ row.name }}</h3>
              <span class="pill" :class="row.active ? 'pill-on' : 'pill-off'">
                {{ row.active ? 'Active' : 'Inactive' }}
              </span>
            </header>
            <p class="card-meta">
              {{ row.department || '—' }} · {{ row.role }} · {{ row.location.city }}
            </p>
            <dl>
              <!-- The visible column list drives the card body, so hiding a
                   field in the columns menu hides it here too. -->
              <div v-for="column in cols.filter((c) => !['name', 'active'].includes(c.id))" :key="column.id">
                <dt>{{ column.header }}</dt>
                <dd>{{ getCellText(row, column) || '—' }}</dd>
              </div>
            </dl>
          </article>

          <p v-if="pageRows.length === 0" class="hint">Nothing matches those filters.</p>
        </div>

        <div class="bar">
          <button
            v-if="s.hasActiveFilters.value"
            type="button"
            class="vt-btn vt-btn-link"
            @click="s.clearAllFilters()"
          >
            Reset filters
          </button>
          <span class="hint">{{ total }} matching</span>
          <span class="spacer" />
          <!-- Same pager as the preset, told to offer different page sizes. -->
          <TablePagination :page-sizes="[3, 6, 12]" :sibling-count="2" />
        </div>
      </div>
    </TableRoot>

    <!-- ---------------------------------------------- a root of our own -->

    <div class="mini">
      <h3>…and the root itself is replaceable</h3>
      <p class="hint">
        <code>MiniRoot.vue</code> in this demo assembles a <code>TableContext</code> by hand and
        calls <code>provideTableContext</code>. The primitives inside it are the same imports as
        everywhere above — they cannot tell that the component hosting them is not the library's
        own <code>TableRoot</code>.
      </p>

      <MiniRoot v-slot="{ rows: miniPage, selection }" :columns="miniColumns" :rows="miniRows" :page-size="4">
        <div class="bar">
          <SortTrigger column-id="name" label="Name" />
          <SortTrigger column-id="salary" label="Salary" />
          <ColumnFilterPopover column-id="role" type="enum" label="Role" />
          <span class="spacer" />
          <TableStatus />
        </div>
        <ul class="mini-list">
          <li
            v-for="row in miniPage"
            :key="row.id"
            :data-selected="selection.isSelected(row) || undefined"
            @click="selection.toggle(row)"
          >
            <span>{{ row.name }}</span>
            <span class="muted">{{ row.role }}</span>
          </li>
        </ul>
        <TablePagination :page-sizes="[4, 8]" />
      </MiniRoot>
    </div>
  </DemoSection>
</template>

<style scoped>
.composed { display: flex; flex-direction: column; gap: 12px; }

.bar {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  padding: 8px;
  border: 1px solid var(--line);
  border-radius: 8px;
}

.bar-label {
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  opacity: 0.6;
  margin-left: 8px;
}
.bar-label:first-child { margin-left: 0; }

.bar-filter {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 4px 6px;
  border: 1px solid var(--line);
  border-radius: 999px;
  font-size: 13px;
}

.spacer { flex: 1; }

.cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 10px; }

.card {
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 12px;
  cursor: pointer;
  transition: border-color 0.15s;
}
.card:hover { border-color: var(--accent); }
.card[data-selected] { border-color: var(--accent); background: rgb(37 99 235 / 0.08); }
.card > header { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.card h3 { margin: 0; font-size: 15px; }
.card-meta { margin: 2px 0 8px; opacity: 0.65; font-size: 13px; }
.card dl { margin: 0; display: grid; gap: 2px; font-size: 13px; }
.card dl > div { display: flex; justify-content: space-between; gap: 8px; }
.card dt { opacity: 0.6; }
.card dd { margin: 0; font-variant-numeric: tabular-nums; text-align: right; }

.mini {
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.mini h3 { margin: 0; font-size: 14px; }
.mini-list { margin: 0; padding: 0; list-style: none; display: grid; gap: 2px; font-size: 13px; }
.mini-list li {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  padding: 4px 8px;
  border-radius: 5px;
  cursor: pointer;
}
.mini-list li:hover { background: rgb(127 127 127 / 0.1); }
.mini-list li[data-selected] { background: rgb(37 99 235 / 0.14); }
</style>
