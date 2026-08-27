<script setup lang="ts">
// No preset, no stylesheet import — this page's own CSS (below, scoped) is
// the only styling anywhere in this file, which is the whole "headless buys
// you zero CSS" contract from CLAUDE.md.
import { shallowRef } from 'vue'
import {
  ColumnFilterPopover,
  SortTrigger,
  TablePagination,
  TableRoot,
  useLocalDataSource,
  useTableState,
} from '@brillliand/vue-table-chad'
import { makeRows, employeeColumns, type Employee } from '@fixtures'

const rows = shallowRef<Employee[]>(makeRows(120))
const state = useTableState({ pageSize: 6 })
const source = useLocalDataSource<Employee>(rows, employeeColumns, state.query)
</script>

<template>
  <TableRoot v-slot="{ rows: pageRows, total }" :columns="employeeColumns" :source="source" :state="state">
    <header class="toolbar">
      <SortTrigger column-id="salary" label="Salary" />
      <ColumnFilterPopover column-id="department" type="enum" />
      <span>{{ total }} rows</span>
    </header>

    <!-- Cards, not a <table> — the primitives do not care what wraps them. -->
    <article v-for="row in pageRows" :key="row.id" class="card">
      <strong>{{ row.name }}</strong> — {{ row.department }}
    </article>

    <TablePagination />
  </TableRoot>
</template>

<style scoped>
.toolbar {
  display: flex;
  gap: 12px;
  align-items: center;
  margin-bottom: 8px;
}
.card {
  border: 1px solid #ddd;
  border-radius: 6px;
  padding: 8px 12px;
  margin-bottom: 6px;
}
</style>
