<script setup lang="ts">
/**
 * Grouping, and what the grouped rows add up to.
 *
 * The one control that matters here is `groupMode`. Everything else on this
 * page is a way of watching what it changes: whether the grouping is a thing
 * the table does to the rows it was handed, or a thing it asks the data source
 * to do — and therefore whether a band describes the page or the whole group.
 */
import { computed, ref, shallowRef } from 'vue'
import {
  BLANK_GROUP_LABEL,
  DataTable,
  ROOT_GROUP_KEY,
  RowGroupMenu,
  aggregateGroups,
  countGroups,
  flattenGroups,
  formatAggregate,
  groupKeys,
  useLocalDataSource,
  useTableState,
  type AggregateFn,
  type AggregateResult,
  type ColumnDef,
  type DisplayRow,
  type GroupMode,
  type GroupingOptions,
  type LocalDataSource,
  type RowGroup,
  type TableState,
} from '@brillliand/vue-table-chad'
import { employees, type Employee } from '../data/dataset'
import { columnFor, employeeColumns } from '../columns'
import DemoSection from '../components/DemoSection.vue'

const rows = shallowRef(employees.slice(0, 800))

const state: TableState = useTableState({
  pageSize: 10,
  // Arrives grouped, so the view shows what it is about before you touch it.
  initialGroupBy: ['department'],
})

/* ------------------------------------------------------ live aggregates */

/**
 * Which aggregate each column runs. Held here rather than edited in place:
 * `employeeColumns` is one shared array that every view reads, and mutating it
 * would leak this page's controls into all of them.
 *
 * Seeded from what `columns.ts` already declares, so the picker starts out
 * agreeing with the rest of the demo.
 */
const picks = ref<Record<string, AggregateFn | ''>>({
  salary: 'sum',
  hiredAt: 'min',
  rating: 'avg',
  active: '',
})

const PICKABLE = ['salary', 'hiredAt', 'rating', 'active'] as const
const FUNCTIONS: AggregateFn[] = ['sum', 'avg', 'min', 'max']

const columns = computed<ColumnDef<Employee>[]>(() =>
  employeeColumns.map((column) => {
    const fn = picks.value[column.id]
    // `undefined` means "this column is not on the picker" — leave it alone.
    return fn === undefined ? column : { ...column, aggregate: fn || undefined }
  }),
)

const source: LocalDataSource<Employee> = useLocalDataSource<Employee>(
  rows,
  columns,
  state.query,
)

/* ---------------------------------------------------------- live props */

const groupMode = ref<GroupMode>('client')
const showFooter = ref(true)
const groupsCollapsed = ref(false)

/** What the current mode actually means, in this page's numbers. */
const explanation = computed(() =>
  groupMode.value === 'client'
    ? `client · the table bands the ${source.rows.value.length} rows on this page. ` +
      `Nothing enters the query, so no source is asked to do anything.`
    : `server · the source sorts all ${source.total.value} matching rows by the grouped ` +
      `columns and totals each whole group, so a band outlives the page break.`,
)

/* -------------------------------------------- the same numbers, no table */

/**
 * The figures above, recomputed from the exported pure functions over the full
 * filtered set. Nothing here renders a table or touches a component — which is
 * the claim being checked: the grouping in `DataTable` is these functions and
 * nothing more.
 */
const byHand = computed(() => {
  const groupBy = state.groupBy.value
  const all = source.filteredRows.value
  const counts = countGroups(all, groupBy, columns.value)
  const totals = aggregateGroups(all, groupBy, columns.value)

  const aggregated = columns.value.filter((column) => column.aggregate)
  const describe = (entry: Record<string, AggregateResult<Employee>> | undefined): string =>
    aggregated
      .map((column) => {
        const result = entry?.[column.id]
        return `${column.header}: ${result ? formatAggregate(result, column) : '—'}`
      })
      .join(' · ')

  /**
   * Bands come out of `flattenGroups` rather than off the keys of `counts`: a
   * group key is an opaque path, and picking it apart to recover a label would
   * mean reading an internal encoding. The flattener already knows the label,
   * and `RowGroup.key` is what looks the count back up.
   */
  const options: GroupingOptions<Employee> = {
    // The library's own default, next to the override the table above uses —
    // so both spellings of the blank bucket appear on the one page.
    blankLabel: BLANK_GROUP_LABEL,
  }
  const bands: DisplayRow<Employee>[] = flattenGroups(all, groupBy, columns.value, options)

  return {
    bands: groupKeys(all, groupBy, columns.value).length,
    rows: all.length,
    whole: describe(totals.get(ROOT_GROUP_KEY)),
    // The outermost level only, and only the first few: an illustration, not a
    // second rendering of the table.
    levels: bands
      .filter(
        (item): item is { kind: 'group'; group: RowGroup<Employee> } =>
          item.kind === 'group' && item.group.depth === 0,
      )
      .slice(0, 4)
      .map(({ group }) => ({
        key: group.key,
        label: group.label,
        count: counts.get(group.key) ?? group.count,
        summary: describe(totals.get(group.key)),
      })),
  }
})

/** Typed only to name the export — `#group` hands the same object to a slot. */
function bandLabel(group: RowGroup<Employee>): string {
  return `${group.label} (${group.totalCount})`
}
</script>

<template>
  <DemoSection
    title="Grouping"
    blurb="Rows banded by one column or nested under several, with each band showing what its
           rows add up to. The groupMode switch is the whole story: client bands the rows the
           table already has, server puts the grouping in the query and lets the data source
           perform it. Same table, same data, one prop."
    :api="[
      'DataTable initialGroupBy',
      'DataTable groupMode',
      'DataTable showFooter',
      'ColumnDef.aggregate',
      'ColumnDef.aggregateFormat',
      'RowGroupMenu',
      'aggregateGroups',
      'countGroups',
      'formatAggregate',
      'groupKeys',
      'ROOT_GROUP_KEY',
      'BLANK_GROUP_LABEL',
      'aggregateValue',
      'aggregateRow',
      'groupValueOf',
      'groupPathKey',
      'groupSortRules',
      'buildGroupTree',
      'flattenTree',
      'TableGroupRow',
    ]"
  >
    <template #controls>
      <div class="controls">
        <label>
          groupMode
          <select v-model="groupMode">
            <option value="client">client</option>
            <option value="server">server</option>
          </select>
        </label>

        <label><input v-model="showFooter" type="checkbox" /> showFooter</label>
        <label><input v-model="groupsCollapsed" type="checkbox" /> groupsCollapsed</label>

        <span class="divider" />

        <!--
          Editing `aggregate` at runtime, which is the point: it is a column
          field like any other, not a construction-time decision.
        -->
        <label v-for="id in PICKABLE" :key="id">
          {{ columnFor(id).header }}
          <select v-model="picks[id]">
            <option value="">none</option>
            <option v-for="fn in FUNCTIONS" :key="fn" :value="fn">{{ fn }}</option>
          </select>
        </label>
      </div>
    </template>

    <DataTable
      :columns="columns"
      :source="source"
      :state="state"
      :group-mode="groupMode"
      :show-footer="showFooter"
      :groups-collapsed="groupsCollapsed"
      footer-label="All 800"
      blank-group-label="No department"
    >
      <!--
        Replaces the default toolbar so `RowGroupMenu` is rendered by this file
        rather than by the preset — it takes no props, because it reads the same
        context every built-in primitive does.

        Expand/collapse live here too: the collapse state belongs to the
        grouping composable on the context, which a slot can reach and the page
        around the table cannot.
      -->
      <template #toolbar="{ state: s }">
        <input
          class="vt-search"
          type="search"
          placeholder="Search…"
          :value="s.globalSearch.value"
          aria-label="Search all columns"
          @input="s.setSearch(($event.target as HTMLInputElement).value)"
        />
        <span class="spacer" />
        <RowGroupMenu />
      </template>

      <!-- The band label, with the count folded into it. -->
      <template #group="{ group, columnLabel }">
        <span class="vt-group-column">{{ columnLabel }}</span>
        <span class="vt-group-label">{{ bandLabel(group) }}</span>
      </template>

      <template #cell:active="{ value }">
        <span class="pill" :class="value ? 'pill-on' : 'pill-off'">
          {{ value ? 'Active' : 'Inactive' }}
        </span>
      </template>
    </DataTable>

    <p class="hint">{{ explanation }}</p>

    <div class="panel">
      <h3>The same numbers, computed without a table</h3>
      <p class="hint">
        Straight from the exported functions over all {{ byHand.rows }} filtered rows —
        {{ byHand.bands }} bands at every level. Under <code>groupMode: 'server'</code> the
        table's own figures match these exactly, because that is where they come from. Under
        <code>client</code> they will not, and should not: a band up there describes the page.
      </p>
      <ul class="bands">
        <li v-for="band in byHand.levels" :key="band.key">
          <strong>{{ band.label }}</strong>
          <span class="muted">{{ band.count }} rows</span>
          <span>{{ band.summary || '—' }}</span>
        </li>
      </ul>
      <p class="hint">
        Whole set (<code>ROOT_GROUP_KEY</code>): {{ byHand.whole || 'no aggregates selected' }}
      </p>
    </div>

    <p class="hint note">
      Group by <strong>Role</strong> alone: the bands come out Junior → Mid → Senior → Staff →
      Principal → Manager, not alphabetically (which would put Manager second). Grouping sorts by
      the grouped column, and that column carries its own <code>comparator</code> — so the bands
      inherit it. Add <strong>Department</strong> above it to nest the two.
    </p>
  </DemoSection>
</template>

<style scoped>
.spacer { flex: 1; }
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

.bands { margin: 0; padding: 0; list-style: none; font-size: 13px; display: grid; gap: 3px; }
.bands li { display: flex; gap: 10px; align-items: baseline; flex-wrap: wrap; }
.bands strong { min-width: 110px; }
.bands .muted { min-width: 70px; font-variant-numeric: tabular-nums; }
</style>
