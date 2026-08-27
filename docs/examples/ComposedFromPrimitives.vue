<!--
  The standalone-primitive contract (CLAUDE.md, "Every primitive works
  standalone") end to end: no <DataTable>, no <TableRoot>, no stylesheet
  import. Every primitive below takes its state as an explicit prop instead
  of reading an injected context — CLAUDE.md names TableRow and TableGrid
  among the primitives `tests/tableGrid.spec.ts` and friends pin to this.

  This is what "headless" buys: the markup, right down to the <table>
  element, is entirely this file's.
-->
<script setup lang="ts">
import { computed, shallowRef } from 'vue'
import {
  SortTrigger,
  TableGrid,
  TableHeaderCell,
  TablePagination,
  TableRow,
  applySortRule,
  filterRows,
  nextDirection,
  sortRows,
  useColumns,
  type ColumnDef,
  type SortRule,
} from '@brillliand/vue-table-chad'
import { makeRows, employeeColumns, type Employee } from '@fixtures'

const shown: ColumnDef<Employee>[] = employeeColumns.filter((c) =>
  ['name', 'department', 'role', 'salary'].includes(c.id),
)
// useColumns is a composable, not a component — it works with no TableRoot
// above it, and is what turns a ColumnDef[] into the ResolvedColumn[] every
// primitive below wants (pin offsets, sort state, and the rest).
const { visible: resolved } = useColumns<Employee>(shown)

const all = shallowRef<Employee[]>(makeRows(300))
const sort = shallowRef<SortRule[]>([])
const page = shallowRef(1)
const pageSize = 10

const filtered = computed(() => filterRows(all.value, shown, { filters: {}, globalSearch: '' }))
const sorted = computed(() => sortRows(filtered.value, sort.value, shown))
const pageRows = computed(() => {
  const start = (page.value - 1) * pageSize
  return sorted.value.slice(start, start + pageSize)
})

function directionFor(columnId: string): 'asc' | 'desc' | false {
  return sort.value.find((rule) => rule.columnId === columnId)?.direction ?? false
}

function onToggle(columnId: string, additive: boolean): void {
  sort.value = applySortRule(sort.value, columnId, nextDirection(directionFor(columnId)), additive)
}
</script>

<template>
  <table>
    <TableGrid :columns="resolved">
      <thead>
        <tr>
          <TableHeaderCell v-for="column in resolved" :key="column.id" :column="column">
            <SortTrigger
              :column-id="column.id"
              :label="column.header ?? column.id"
              :direction="directionFor(column.id)"
              @toggle="onToggle"
            />
          </TableHeaderCell>
        </tr>
      </thead>
      <tbody>
        <TableRow
          v-for="(row, index) in pageRows"
          :key="row.id"
          :row="row"
          :columns="resolved"
          :index="index"
        />
      </tbody>
    </TableGrid>
  </table>

  <TablePagination
    :page="page"
    :page-size="pageSize"
    :total="filtered.length"
    @update:page="page = $event"
  />
</template>
