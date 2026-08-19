<script setup lang="ts">
/**
 * The filter model, taken apart.
 *
 * Two kinds per column, matching Excel's two halves — a checkbox list of
 * values, and operator rules — plus the pure functions that decide whether a
 * filter is complete, empty, or worth serialising at all.
 */
import { computed, ref, shallowRef } from 'vue'
import {
  ColumnFilterPopover,
  ConditionFilter,
  DataTable,
  OPERATOR_LABELS,
  ValueListFilter,
  conditionsFilter,
  defaultOperator,
  filterRows,
  isBinaryOperator,
  isEmptyFilter,
  isIncompleteRule,
  isUnaryOperator,
  matchesFilter,
  normalizeFilter,
  operatorsFor,
  pruneFilters,
  useLocalDataSource,
  useTableState,
  valuesFilter,
  type ColumnFilter,
  type ConditionOperator,
  type ConditionRule,
  type ConditionsFilter,
  type FilterValue,
  type ValuesFilter,
} from '@sandbox/vue-table'
import { employees, type Employee } from '../data/dataset'
import { columnFor, employeeColumns } from '../columns'
import DemoSection from '../components/DemoSection.vue'
import StateInspector from '../components/StateInspector.vue'

const rows = shallowRef(employees.slice(0, 1200))
// 10 to match the preset pager's own size options — DataTable renders
// `TablePagination` with its defaults, and an unlisted size shows as blank.
const state = useTableState({ pageSize: 10 })
const source = useLocalDataSource<Employee>(rows, employeeColumns, state.query)

/* ------------------------------------------------------ programmatic sets */

const presets: Array<{ label: string; note: string; apply: () => void }> = [
  {
    label: 'Two departments',
    note: "valuesFilter(['Engineering', 'Research'])",
    apply: () => state.setFilter('department', valuesFilter(['Engineering', 'Research'])),
  },
  {
    label: 'Blanks only',
    note: 'valuesFilter([], true) — the "(Blanks)" bucket on its own',
    apply: () => state.setFilter('department', valuesFilter([], true)),
  },
  {
    label: 'Salary 90k–140k',
    note: "conditionsFilter([{ operator: 'between', value: 90000, value2: 140000 }])",
    apply: () =>
      state.setFilter(
        'salary',
        conditionsFilter([{ operator: 'between', value: 90000, value2: 140000 }]),
      ),
  },
  {
    label: 'Missing salary',
    note: "operator 'empty' takes no operand at all",
    apply: () => state.setFilter('salary', conditionsFilter([{ operator: 'empty' }])),
  },
  {
    label: 'Hired before 2018 OR after 2023',
    note: "op: 'or' across two date rules",
    apply: () =>
      state.setFilter(
        'hiredAt',
        conditionsFilter(
          [
            { operator: 'before', value: '2018-01-01' },
            { operator: 'after', value: '2023-01-01' },
          ],
          'or',
        ),
      ),
  },
  {
    label: 'Name contains "a" and not "e"',
    note: "op: 'and' across two text rules",
    apply: () =>
      state.setFilter(
        'name',
        conditionsFilter([
          { operator: 'contains', value: 'a' },
          { operator: 'notContains', value: 'e' },
        ]),
      ),
  },
]

/* ---------------------------------------------------------- rule builder */

const builderColumnId = ref('salary')
const builderColumn = computed(() => columnFor(builderColumnId.value))
const builderType = computed(() => builderColumn.value.type ?? 'text')

const operator = ref<ConditionOperator>('between')
const value = ref('')
const value2 = ref('')
const joiner = ref<'and' | 'or'>('and')

/** Reset the operator when the column type stops offering the current one. */
function onColumnChange(): void {
  const available = operatorsFor(builderType.value)
  if (!available.includes(operator.value)) operator.value = defaultOperator(builderType.value)
}

const rule = computed<ConditionRule>(() => {
  const base: ConditionRule = { operator: operator.value }
  if (isUnaryOperator(operator.value)) return base
  base.value = value.value === '' ? '' : coerce(value.value)
  if (isBinaryOperator(operator.value)) base.value2 = value2.value === '' ? '' : coerce(value2.value)
  return base
})

/** Numbers stay numbers so the filter round-trips through JSON unchanged. */
function coerce(raw: string): FilterValue {
  if (builderType.value === 'number') {
    const n = Number(raw)
    return Number.isNaN(n) ? raw : n
  }
  if (builderType.value === 'boolean') return raw === 'true'
  return raw
}

const builtFilter = computed<ConditionsFilter>(() => conditionsFilter([rule.value], joiner.value))

const analysis = computed(() => {
  const filter = builtFilter.value
  return {
    isUnaryOperator: isUnaryOperator(operator.value),
    isBinaryOperator: isBinaryOperator(operator.value),
    isIncompleteRule: isIncompleteRule(rule.value),
    isEmptyFilter: isEmptyFilter(filter),
    normalizeFilter: normalizeFilter(filter) ?? null,
    matchingRows: filterRows(rows.value, employeeColumns, {
      filters: { [builderColumnId.value]: filter },
      globalSearch: '',
    }).length,
  }
})

/** Three sample rows judged against the rule, one at a time. */
const samples = computed(() =>
  rows.value.slice(0, 3).map((row) => {
    const column = builderColumn.value
    const raw = column.accessor ? column.accessor(row) : row[column.id]
    return {
      name: row.name,
      raw: raw ?? null,
      matches: matchesFilter(raw, builtFilter.value, builderType.value),
    }
  }),
)

function applyBuilt(): void {
  state.setFilter(builderColumnId.value, builtFilter.value)
}

/* ------------------------------------------- primitives used stand-alone */

const standaloneValues = ref<ValuesFilter | undefined>(undefined)
const standaloneConditions = ref<ConditionsFilter | undefined>(undefined)
const popoverFilter = ref<ColumnFilter | undefined>(undefined)

/** Local sources compute facets synchronously — no await needed. */
const departmentFacets = computed(() => source.facetsSync('department'))
const roleFacets = computed(() => source.facetsSync('role'))

const formatFacet = (v: FilterValue): string => (v === null ? '(Blanks)' : String(v))

const serialized = computed(() => pruneFilters(state.filters.value))
</script>

<template>
  <DemoSection
    title="Filters"
    blurb="Excel's two halves — a checkbox list of values, and operator rules — plus the pure
           functions that decide when a filter is complete, empty, or worth serialising. Blanks
           are their own bucket, and an incomplete rule keeps every row rather than blanking the
           table mid-keystroke."
    :api="[
      'valuesFilter',
      'conditionsFilter',
      'operatorsFor',
      'defaultOperator',
      'OPERATOR_LABELS',
      'isUnaryOperator',
      'isBinaryOperator',
      'isIncompleteRule',
      'isEmptyFilter',
      'normalizeFilter',
      'pruneFilters',
      'matchesFilter',
      'filterRows',
      'ValueListFilter',
      'ConditionFilter',
      'ColumnFilterPopover',
    ]"
  >
    <template #controls>
      <div class="controls">
        <span class="hint">Apply programmatically:</span>
        <button
          v-for="preset in presets"
          :key="preset.label"
          type="button"
          :title="preset.note"
          @click="preset.apply()"
        >
          {{ preset.label }}
        </button>
        <button type="button" @click="state.clearAllFilters()">clearAllFilters()</button>
      </div>
    </template>

    <DataTable :columns="employeeColumns" :source="source" :state="state" />

    <StateInspector
      label="pruneFilters(state.filters) — what would go in the URL"
      :value="serialized"
    />

    <!-- ------------------------------------------------------ rule builder -->

    <div class="panel">
      <h3>Rule builder</h3>
      <p class="hint">
        The operator list is not hardcoded here — it comes from
        <code>operatorsFor(column.type)</code>, which is the same call the filter popover makes.
      </p>

      <div class="controls">
        <label>
          Column
          <select v-model="builderColumnId" @change="onColumnChange()">
            <option
              v-for="column in employeeColumns.filter((c) => c.filterable !== false)"
              :key="column.id"
              :value="column.id"
            >
              {{ column.header }} ({{ column.type ?? 'text' }})
            </option>
          </select>
        </label>

        <label>
          Operator
          <select v-model="operator">
            <option v-for="op in operatorsFor(builderType)" :key="op" :value="op">
              {{ OPERATOR_LABELS[op] }}
            </option>
          </select>
        </label>

        <!-- Unary operators take no operand; binary ones take two. -->
        <label v-if="!analysis.isUnaryOperator">
          Value
          <input v-model="value" :type="builderType === 'number' ? 'number' : 'text'" />
        </label>
        <label v-if="analysis.isBinaryOperator">
          and
          <input v-model="value2" :type="builderType === 'number' ? 'number' : 'text'" />
        </label>

        <label>
          Join
          <select v-model="joiner">
            <option value="and">and</option>
            <option value="or">or</option>
          </select>
        </label>

        <button type="button" @click="applyBuilt()">Apply to the table above</button>
      </div>

      <div class="analysis">
        <ul>
          <li>
            <code>isIncompleteRule</code>
            <span :class="analysis.isIncompleteRule ? 'yes' : 'no'">
              {{ analysis.isIncompleteRule }}
            </span>
            <span class="hint">— true means the rule is ignored, keeping every row</span>
          </li>
          <li>
            <code>isEmptyFilter</code>
            <span :class="analysis.isEmptyFilter ? 'yes' : 'no'">{{ analysis.isEmptyFilter }}</span>
            <span class="hint">— true means it never reaches the QueryState</span>
          </li>
          <li>
            <code>filterRows(…).length</code>
            <strong>{{ analysis.matchingRows }}</strong>
            <span class="hint">of {{ rows.length }} rows</span>
          </li>
        </ul>

        <table class="samples">
          <thead>
            <tr><th>Row</th><th>Raw value</th><th><code>matchesFilter</code></th></tr>
          </thead>
          <tbody>
            <tr v-for="sample in samples" :key="sample.name">
              <td>{{ sample.name }}</td>
              <td><code>{{ JSON.stringify(sample.raw) }}</code></td>
              <td :class="sample.matches ? 'yes' : 'no'">{{ sample.matches }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <StateInspector label="normalizeFilter(builtFilter)" :value="analysis.normalizeFilter" />
    </div>

    <!-- ---------------------------------------------- standalone primitives -->

    <div class="panel">
      <h3>The filter primitives, outside any table</h3>
      <p class="hint">
        Each takes explicit props that stand in for the injected context, so they work with no
        <code>&lt;TableRoot&gt;</code> anywhere — useful for a filter sidebar, or a saved-view
        editor.
      </p>

      <div class="standalone">
        <div>
          <h4>ValueListFilter</h4>
          <ValueListFilter
            v-model="standaloneValues"
            :facets="departmentFacets"
            :format="formatFacet"
          />
          <StateInspector label="v-model" :value="standaloneValues ?? null" open />
        </div>

        <div>
          <h4>ConditionFilter</h4>
          <ConditionFilter v-model="standaloneConditions" type="number" :max-rules="3" />
          <StateInspector label="v-model" :value="standaloneConditions ?? null" open />
        </div>

        <div>
          <h4>ColumnFilterPopover</h4>
          <p class="hint">
            Fed facets directly instead of fetching them from a source.
            <ColumnFilterPopover
              v-model="popoverFilter"
              column-id="role"
              type="enum"
              label="Role"
              :facets="roleFacets"
              :format="formatFacet"
            />
          </p>
          <StateInspector label="v-model" :value="popoverFilter ?? null" open />
        </div>
      </div>
    </div>
  </DemoSection>
</template>

<style scoped>
.panel {
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.panel h3 { margin: 0; font-size: 15px; }
.panel h4 { margin: 0 0 6px; font-size: 13px; opacity: 0.8; }

.analysis { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; align-items: start; }
.analysis ul { margin: 0; padding: 0; list-style: none; display: grid; gap: 6px; font-size: 13px; }
.analysis li { display: flex; align-items: baseline; gap: 6px; flex-wrap: wrap; }

.samples { border-collapse: collapse; font-size: 12.5px; width: 100%; }
.samples th, .samples td { text-align: left; padding: 3px 8px 3px 0; border-bottom: 1px solid var(--line); }

.yes { color: var(--ok); font-weight: 600; }
.no { color: var(--bad); font-weight: 600; }

.standalone { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 16px; }

@media (max-width: 720px) {
  .analysis { grid-template-columns: 1fr; }
}
</style>
