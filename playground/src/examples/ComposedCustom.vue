<script setup lang="ts">
/**
 * The proof that the decomposition holds.
 *
 * No `DataTable`, and no `<table>` element at all — rows render as cards. The
 * sort controls, the Excel filter popovers and the pager are the *same*
 * primitives the preset uses, just arranged completely differently. Nothing
 * here reaches into internals or reimplements filtering.
 */
import { shallowRef } from 'vue'
import {
  ColumnFilterPopover,
  SortTrigger,
  TablePagination,
  TableRoot,
  useLocalDataSource,
  useTableState,
} from '@brillliand/vue-table-chad'
import { employees, type Employee } from '../../mock/fakeApi'
import { employeeColumns } from '../columns'

const rows = shallowRef(employees.slice(0, 300))
const state = useTableState({ pageSize: 6 })
const source = useLocalDataSource<Employee>(rows, employeeColumns, state.query)

const sortable = ['name', 'salary', 'hiredAt', 'rating'] as const
const filterable = ['department', 'role', 'active'] as const

function columnFor(id: string) {
  return employeeColumns.find((column) => column.id === id)!
}
</script>

<template>
  <section>
    <h2>Composed from primitives</h2>
    <p class="hint">
      Same composables and same primitives as the preset — but rendered as cards, with the sort and
      filter controls lifted out into a toolbar. This is what "not a god component" buys you.
    </p>

    <TableRoot
      v-slot="{ rows: pageRows, state: tableState, selection, total, getCellText }"
      :columns="employeeColumns"
      :source="source"
      :state="state"
      selectable
    >
      <div class="composed">
        <div class="composed-bar">
          <span class="composed-label">Sort</span>
          <SortTrigger
            v-for="id in sortable"
            :key="id"
            :column-id="id"
            :label="columnFor(id).header"
          />

          <span class="composed-label">Filter</span>
          <span v-for="id in filterable" :key="id" class="composed-filter">
            {{ columnFor(id).header }}
            <ColumnFilterPopover
              :column-id="id"
              :type="columnFor(id).type"
              :label="columnFor(id).header"
            />
          </span>

          <button
            v-if="tableState.hasActiveFilters.value"
            type="button"
            class="vt-btn vt-btn-link"
            @click="tableState.clearAllFilters()"
          >
            Reset filters
          </button>
        </div>

        <p class="hint">{{ total }} matching · {{ selection?.count.value ?? 0 }} selected</p>

        <div class="cards">
          <article
            v-for="row in pageRows"
            :key="row.id"
            class="card"
            :data-selected="selection?.isSelected(row) || undefined"
            @click="selection?.toggle(row)"
          >
            <h3>{{ row.name }}</h3>
            <p class="card-meta">{{ row.department || '—' }} · {{ row.role }}</p>
            <dl>
              <div><dt>Salary</dt><dd>{{ getCellText(row, columnFor('salary')) }}</dd></div>
              <div><dt>Hired</dt><dd>{{ getCellText(row, columnFor('hiredAt')) }}</dd></div>
              <div><dt>Rating</dt><dd>{{ getCellText(row, columnFor('rating')) }}</dd></div>
            </dl>
          </article>

          <p v-if="pageRows.length === 0" class="hint">Nothing matches those filters.</p>
        </div>

        <TablePagination :page-sizes="[3, 6, 12]" />
      </div>
    </TableRoot>
  </section>
</template>

<style scoped>
.composed { display: flex; flex-direction: column; gap: 12px; }

.composed-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  padding: 8px;
  border: 1px solid var(--line);
  border-radius: 8px;
}

.composed-label {
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  opacity: 0.6;
  margin-left: 8px;
}

.composed-label:first-child { margin-left: 0; }

.composed-filter {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 4px 6px;
  border: 1px solid var(--line);
  border-radius: 999px;
  font-size: 13px;
}

.cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
  gap: 10px;
}

.card {
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 12px;
  cursor: pointer;
  transition: border-color 0.15s;
}

.card:hover { border-color: #2563eb; }
.card[data-selected] { border-color: #2563eb; background: rgb(37 99 235 / 0.08); }
.card h3 { margin: 0 0 2px; font-size: 15px; }
.card-meta { margin: 0 0 8px; opacity: 0.65; font-size: 13px; }
.card dl { margin: 0; display: grid; gap: 2px; font-size: 13px; }
.card dl > div { display: flex; justify-content: space-between; gap: 8px; }
.card dt { opacity: 0.6; }
.card dd { margin: 0; font-variant-numeric: tabular-nums; }
</style>
