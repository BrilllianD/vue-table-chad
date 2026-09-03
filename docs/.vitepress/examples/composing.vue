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
  type ColumnDef,
} from '@brillliand/vue-table-chad'

type Person = { id: number; name: string; department: string; salary: number; hiredAt: string }

const columns: ColumnDef<Person>[] = [
  { id: 'name', header: 'Name', type: 'text' },
  { id: 'department', header: 'Department', type: 'enum', options: ['Engineering', 'Design', 'Sales', 'Support'] },
  { id: 'salary', header: 'Salary', type: 'number' },
  { id: 'hiredAt', header: 'Hired', type: 'date' },
]

function makePeople(count: number): Person[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    name: `Person ${i + 1}`,
    department: ['Engineering', 'Design', 'Sales', 'Support'][i % 4]!,
    salary: 50_000 + ((i * 7919) % 90_000),
    hiredAt: new Date(2015 + (i % 9), i % 12, 1 + (i % 28)).toISOString().slice(0, 10),
  }))
}

const rows = shallowRef<Person[]>(makePeople(120))
const state = useTableState({ pageSize: 10 })
const source = useLocalDataSource(rows, columns, state.query)
</script>

<template>
  <TableRoot v-slot="{ rows: pageRows, total }" :columns="columns" :source="source" :state="state">
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
