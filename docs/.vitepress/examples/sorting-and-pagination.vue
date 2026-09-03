<script setup lang="ts">
import { shallowRef } from 'vue'
import { DataTable, useLocalDataSource, useTableState, type ColumnDef } from '@brillliand/vue-table-chad'
import '@brillliand/vue-table-chad/style.css'

type Person = { id: number; name: string; department: string; role: string; salary: number; hiredAt: string }

// Not alphabetical, so the default text sort would put "Junior" above
// "Senior". A `comparator` takes over sorting for that column entirely; the
// `type` still decides the filter operators and the editor.
const SENIORITY = ['Junior', 'Mid', 'Senior', 'Staff', 'Principal', 'Manager']

const columns: ColumnDef<Person>[] = [
  { id: 'name', header: 'Name', type: 'text', pinned: 'left' },
  { id: 'department', header: 'Department', type: 'enum', options: ['Engineering', 'Design', 'Sales', 'Support'] },
  {
    id: 'role',
    header: 'Role',
    type: 'enum',
    options: SENIORITY,
    comparator: (a, b) => SENIORITY.indexOf(String(a)) - SENIORITY.indexOf(String(b)),
  },
  {
    id: 'salary',
    header: 'Salary',
    type: 'number',
    align: 'right',
    format: (v) => (v == null ? '—' : `$${Number(v).toLocaleString()}`),
  },
  { id: 'hiredAt', header: 'Hired', type: 'date' },
]

function makePeople(count: number): Person[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    name: `Person ${i + 1}`,
    department: ['Engineering', 'Design', 'Sales', 'Support'][i % 4]!,
    role: SENIORITY[(i * 5) % SENIORITY.length]!,
    salary: 50_000 + ((i * 7919) % 90_000),
    hiredAt: new Date(2015 + (i % 9), i % 12, 1 + (i % 28)).toISOString().slice(0, 10),
  }))
}

const rows = shallowRef<Person[]>(makePeople(300))

// Click a header to sort, shift-click a second one to sort within the first.
const state = useTableState({
  pageSize: 10,
  initialSort: [{ columnId: 'role', direction: 'asc' }],
})
const source = useLocalDataSource(rows, columns, state.query)
</script>

<template>
  <DataTable :columns="columns" :source="source" :state="state" />
</template>
