<script setup lang="ts">
/**
 * Zero components from the library. Not one.
 *
 * This whole view is the core layer driving hand-written markup: `filterRows`,
 * `sortRows` and `computeFacets` are pure functions over arrays, and
 * `usePagination` is page arithmetic with no data in it at all. If you want the
 * logic and none of the markup, this is the entire surface you need.
 */
import { computed, ref } from 'vue'
import {
  applySortRule,
  compareBoolean,
  compareDate,
  compareNumber,
  compareText,
  comparatorFor,
  compileFilter,
  computeFacets,
  conditionsFilter,
  createQueryState,
  facetKey,
  filterRows,
  isBlank,
  matchesRule,
  matchesSearch,
  nextDirection,
  readValue,
  sortRows,
  startOfDay,
  toBoolean,
  toFilterValue,
  toIsoDate,
  toNumber,
  toTime,
  usePagination,
  type ColumnDataType,
  type ColumnFilter,
  type PageItem,
  type SortDirection,
  type SortOptions,
  type SortRule,
  type UsePagination,
  type UsePaginationOptions,
} from '@sandbox/vue-table'
import { employees, type Employee } from '../data/dataset'
import { columnFor, employeeColumns } from '../columns'
import DemoSection from '../components/DemoSection.vue'
import StateInspector from '../components/StateInspector.vue'

const all = employees.slice(0, 600)

/* --------------------------------------------- hand-rolled query, no state */

// `createQueryState` builds the same object `useTableState` would own — useful
// when the state lives somewhere else entirely (a store, a route, a worker).
const seed = createQueryState({ pageSize: 5, initialSort: [{ columnId: 'salary', direction: 'desc' }] })

const search = ref('')
const sort = ref<SortRule[]>(seed.sort)
const minSalary = ref('')
const nullsLast = ref(true)
const page = ref(1)
const pageSize = ref(seed.pageSize)

const shown = ['name', 'department', 'role', 'salary', 'hiredAt', 'active'].map(columnFor)

const filters = computed<Record<string, ColumnFilter>>(() => {
  const out: Record<string, ColumnFilter> = {}
  if (minSalary.value !== '') {
    out.salary = conditionsFilter([{ operator: 'gte', value: Number(minSalary.value) }])
  }
  return out
})

/** filter → sort → slice, exactly what `useLocalDataSource` does internally. */
const filtered = computed(() =>
  filterRows(all, employeeColumns, { filters: filters.value, globalSearch: search.value }),
)

/** Blanks sink to the bottom in both directions unless you say otherwise. */
const sortOptions = computed<SortOptions>(() => ({ nullsLast: nullsLast.value }))

const sorted = computed(() =>
  sortRows(filtered.value, sort.value, employeeColumns, sortOptions.value),
)

const paginationOptions: UsePaginationOptions = {
  siblingCount: 1,
  onChange: (next) => {
    page.value = next
  },
}

const pagination: UsePagination = usePagination(
  page,
  pageSize,
  () => filtered.value.length,
  paginationOptions,
)

const pageRows = computed(() => {
  const start = (pagination.page.value - 1) * pageSize.value
  return sorted.value.slice(start, start + pageSize.value)
})

/** Header click: cycle asc → desc → off, shift to stack keys. */
function onHeaderClick(columnId: string, event: MouseEvent): void {
  const current = sort.value.find((rule) => rule.columnId === columnId)?.direction ?? false
  sort.value = applySortRule(sort.value, columnId, nextDirection(current), event.shiftKey)
  page.value = 1
}

function directionOf(columnId: string): string {
  const direction: SortDirection | undefined = sort.value.find(
    (entry) => entry.columnId === columnId,
  )?.direction
  if (!direction) return '⇅'
  return direction === 'asc' ? '▲' : '▼'
}

/** `items` hands back page numbers with `'ellipsis'` gaps already worked out. */
function isGap(item: PageItem): boolean {
  return item === 'ellipsis'
}

/* ----------------------------------------------------------------- facets */

const facetColumnId = ref('department')
const facetType = computed<ColumnDataType>(() => columnFor(facetColumnId.value).type ?? 'text')
const facets = computed(() =>
  computeFacets(all, employeeColumns, columnFor(facetColumnId.value), {
    filters: filters.value,
    globalSearch: search.value,
  }),
)

/* ------------------------------------------- the predicate layer, exposed */

const compiled = computed(() =>
  compileFilter(conditionsFilter([{ operator: 'gte', value: 100000 }]), 'number'),
)

const predicateSamples = computed(() =>
  all.slice(0, 4).map((row) => ({
    name: row.name,
    salary: row.salary,
    // `compileFilter` builds the test once; `matchesRule` judges one value
    // against one rule with no filter wrapper at all.
    compiled: compiled.value(row.salary),
    matchesRule: matchesRule(row.salary, { operator: 'gte', value: 100000 }, 'number'),
    matchesSearch: matchesSearch([row.name, row.department], search.value),
    readValue: String(readValue(row, columnFor('city'))),
  })),
)

/* ------------------------------------------------- comparators, side by side */

const comparatorDemo = [
  { fn: 'compareText', a: 'item 2', b: 'item 10', result: compareText('item 2', 'item 10') },
  { fn: 'compareNumber', a: '5', b: 'null', result: compareNumber(5, null) },
  { fn: 'compareDate', a: '2020-01-02', b: '2020-01-10', result: compareDate('2020-01-02', '2020-01-10') },
  { fn: 'compareBoolean', a: 'false', b: 'true', result: compareBoolean(false, true) },
  { fn: "comparatorFor('number')", a: '2', b: '10', result: comparatorFor('number')(2, 10) },
]

/* --------------------------------------------------- the value utilities */

const utilInput = ref('2020-03-05')

const utils = computed(() => {
  const raw: unknown = utilInput.value
  return [
    { fn: 'isBlank', out: isBlank(raw) },
    { fn: 'toNumber', out: toNumber(raw) },
    { fn: 'toTime', out: toTime(raw) },
    { fn: 'startOfDay', out: startOfDay(raw) },
    { fn: 'toIsoDate', out: toIsoDate(raw) },
    { fn: 'toBoolean', out: toBoolean(raw) },
    { fn: "toFilterValue(_, 'date')", out: toFilterValue(raw, 'date') },
    { fn: "toFilterValue(_, 'number')", out: toFilterValue(raw, 'number') },
    { fn: 'facetKey', out: facetKey(toFilterValue(raw, 'text')) },
  ]
})

const cell = (row: Employee, id: string): string => {
  const column = columnFor(id)
  const value = readValue(row, column)
  return column.format ? column.format(value, row) : String(value ?? '—')
}
</script>

<template>
  <DemoSection
    title="Core only — no components"
    blurb="The table below is a plain <table> element. Every behaviour in it comes from a pure
           function you can call from a test, a worker, or a Node script. usePagination has no
           data in it at all; it is page arithmetic, usable for any list."
    :api="[
      'filterRows',
      'sortRows',
      'computeFacets',
      'compileFilter',
      'matchesRule',
      'matchesSearch',
      'readValue',
      'applySortRule',
      'nextDirection',
      'comparatorFor',
      'compareText',
      'compareNumber',
      'compareDate',
      'compareBoolean',
      'usePagination',
      'createQueryState',
      'isBlank',
      'toNumber',
      'toTime',
      'startOfDay',
      'toIsoDate',
      'toBoolean',
      'toFilterValue',
      'facetKey',
      'compileSearch',
      'sortKeyFor',
    ]"
  >
    <template #controls>
      <div class="controls">
        <label>Search <input v-model="search" type="search" placeholder="name, dept…" /></label>
        <label>Min salary <input v-model="minSalary" type="number" step="5000" /></label>
        <label><input v-model="nullsLast" type="checkbox" /> sortRows nullsLast</label>
        <span class="hint">Shift-click a header to stack sort keys.</span>
      </div>
    </template>

    <table class="raw">
      <thead>
        <tr>
          <th v-for="column in shown" :key="column.id">
            <button type="button" @click="onHeaderClick(column.id, $event)">
              {{ column.header }} <span class="dir">{{ directionOf(column.id) }}</span>
            </button>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in pageRows" :key="row.id">
          <td v-for="column in shown" :key="column.id" :data-align="column.align ?? 'left'">
            {{ cell(row, column.id) }}
          </td>
        </tr>
        <tr v-if="pageRows.length === 0">
          <td :colspan="shown.length" class="hint">No rows.</td>
        </tr>
      </tbody>
    </table>

    <!-- usePagination gives you the page numbers with ellipsis gaps already
         worked out; rendering them is the caller's business. -->
    <nav class="pager">
      <button type="button" :disabled="!pagination.canPrev.value" @click="pagination.first()">⏮</button>
      <button type="button" :disabled="!pagination.canPrev.value" @click="pagination.prev()">←</button>
      <template v-for="(item, index) in pagination.items.value" :key="`${item}-${index}`">
        <span v-if="isGap(item)" class="gap">…</span>
        <button
          v-else
          type="button"
          :data-current="item === pagination.page.value || undefined"
          @click="pagination.go(Number(item))"
        >
          {{ item }}
        </button>
      </template>
      <button type="button" :disabled="!pagination.canNext.value" @click="pagination.next()">→</button>
      <button type="button" :disabled="!pagination.canNext.value" @click="pagination.last()">⏭</button>
      <span class="hint">
        rows {{ pagination.firstRow.value }}–{{ pagination.lastRow.value }} of
        {{ filtered.length }} · page {{ pagination.page.value }}/{{ pagination.pageCount.value }}
      </span>
      <select v-model.number="pageSize">
        <option v-for="size in [5, 10, 25]" :key="size" :value="size">{{ size }} / page</option>
      </select>
    </nav>

    <StateInspector label="sort — built by applySortRule + nextDirection" :value="sort" />

    <div class="grids">
      <div class="panel">
        <h3>computeFacets</h3>
        <label>
          Column
          <select v-model="facetColumnId">
            <option
              v-for="column in employeeColumns.filter((c) => c.filterable !== false)"
              :key="column.id"
              :value="column.id"
            >
              {{ column.header }}
            </option>
          </select>
          <span class="hint">type: <code>{{ facetType }}</code></span>
        </label>
        <p class="hint">
          Counts respect the search and the salary filter above, but never the chosen column's own
          filter. Blanks sort last, as one bucket. The column's type decides how the values are
          bucketed and sorted.
        </p>
        <ul class="facets">
          <li v-for="facet in facets.slice(0, 12)" :key="facetKey(facet.value)">
            <span>{{ facet.value === null ? '(Blanks)' : facet.value }}</span>
            <span class="count">{{ facet.count }}</span>
          </li>
        </ul>
      </div>

      <div class="panel">
        <h3>Predicates</h3>
        <p class="hint">
          <code>compileFilter</code> builds the test once per filter instead of once per row —
          the difference between O(rows) and O(rows × values) on a 10k array.
        </p>
        <table class="raw small">
          <thead>
            <tr>
              <th>Row</th><th>salary</th><th>compiled</th><th>matchesRule</th><th>matchesSearch</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="sample in predicateSamples" :key="sample.name">
              <td>{{ sample.name }}</td>
              <td>{{ sample.salary ?? 'null' }}</td>
              <td :class="sample.compiled ? 'yes' : 'no'">{{ sample.compiled }}</td>
              <td :class="sample.matchesRule ? 'yes' : 'no'">{{ sample.matchesRule }}</td>
              <td :class="sample.matchesSearch ? 'yes' : 'no'">{{ sample.matchesSearch }}</td>
            </tr>
          </tbody>
        </table>
        <p class="hint">
          <code>readValue</code> on the nested City column of row 1:
          <code>{{ predicateSamples[0]?.readValue }}</code>
        </p>
      </div>

      <div class="panel">
        <h3>Comparators</h3>
        <table class="raw small">
          <thead><tr><th>Call</th><th>a</th><th>b</th><th>result</th></tr></thead>
          <tbody>
            <tr v-for="entry in comparatorDemo" :key="entry.fn">
              <td><code>{{ entry.fn }}</code></td>
              <td>{{ entry.a }}</td>
              <td>{{ entry.b }}</td>
              <td class="num">{{ entry.result }}</td>
            </tr>
          </tbody>
        </table>
        <p class="hint">
          Text compares naturally, so "item 2" precedes "item 10". Blanks always return positive,
          which is what keeps them at the bottom in both sort directions.
        </p>
      </div>

      <div class="panel">
        <h3>Value utilities</h3>
        <label>
          Input
          <input v-model="utilInput" type="text" />
        </label>
        <p class="hint">
          Try <code>2020-03-05</code>, <code>''</code>, <code>yes</code>, <code>42</code>. A bare
          <code>YYYY-MM-DD</code> parses as <em>local</em> midnight — <code>Date.parse</code>
          treats it as UTC, which shifts the calendar day for anyone west of Greenwich.
        </p>
        <table class="raw small">
          <tbody>
            <tr v-for="util in utils" :key="util.fn">
              <td><code>{{ util.fn }}</code></td>
              <td><code>{{ JSON.stringify(util.out) ?? 'undefined' }}</code></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </DemoSection>
</template>

<style scoped>
.raw { border-collapse: collapse; font-size: 13px; width: 100%; }
.raw th, .raw td { text-align: left; padding: 5px 10px 5px 0; border-bottom: 1px solid var(--line); }
.raw td[data-align='right'] { text-align: right; font-variant-numeric: tabular-nums; }
.raw td[data-align='center'] { text-align: center; }
.raw th button {
  border: 0;
  background: none;
  font: inherit;
  font-weight: 600;
  color: inherit;
  padding: 0;
  cursor: pointer;
}
.raw.small { font-size: 12px; }
.dir { opacity: 0.5; font-size: 11px; }

.pager { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
.pager button { min-width: 30px; padding: 3px 7px; }
.pager button[data-current] { font-weight: 700; border-color: var(--accent); color: var(--accent); }
.gap { opacity: 0.5; padding: 0 2px; }

.grids { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 14px; }
.panel {
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.panel h3 { margin: 0; font-size: 14px; }

.facets { margin: 0; padding: 0; list-style: none; font-size: 13px; display: grid; gap: 2px; }
.facets li { display: flex; justify-content: space-between; gap: 8px; }
.count { opacity: 0.6; font-variant-numeric: tabular-nums; }

.num { text-align: right; font-variant-numeric: tabular-nums; }
.yes { color: var(--ok); font-weight: 600; }
.no { color: var(--bad); font-weight: 600; }
</style>
