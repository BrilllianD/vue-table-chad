<script setup lang="ts">
import { shallowRef } from 'vue'
import { DataTable, useLocalDataSource, useTableState, type ColumnDef } from '@brillliand/vue-table-chad'
import '@brillliand/vue-table-chad/style.css'

type Person = { id: number; name: string; department: string; email: string; salary: number }

const columns: ColumnDef<Person>[] = [
  { id: 'name', header: 'Name', type: 'text' },
  { id: 'department', header: 'Department', type: 'enum', options: ['Engineering', 'Design', 'Sales', 'Support'] },
  { id: 'salary', header: 'Salary', type: 'number', align: 'right', format: (v) => `$${Number(v).toLocaleString()}` },
]

function makePeople(count: number): Person[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    name: `Person ${i + 1}`,
    department: ['Engineering', 'Design', 'Sales', 'Support'][i % 4]!,
    email: `person${i + 1}@example.com`,
    salary: 50_000 + ((i * 7919) % 90_000),
  }))
}

const rows = shallowRef<Person[]>(makePeople(60))
const state = useTableState({ pageSize: 6 })
const source = useLocalDataSource(rows, columns, state.query)
</script>

<template>
  <!-- `expandable` puts the disclosure column in and lets the table own which
       rows are open; the `#detail` slot is what fills the panel. -->
  <DataTable :columns="columns" :source="source" :state="state" expandable>
    <template #detail="{ row }">
      <p class="detail">
        <strong>{{ row.name }}</strong> — {{ row.email }}, {{ row.department }}
      </p>
    </template>
  </DataTable>
</template>

<style scoped>
.detail { margin: 0; font-size: 13px; }
</style>
