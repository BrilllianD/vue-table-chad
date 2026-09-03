<script setup lang="ts">
import { ref, shallowRef } from 'vue'
import {
  DataTable,
  createQueryState,
  useLocalDataSource,
  useTableState,
  type ColumnDef,
  type QueryState,
} from '@brillliand/vue-table-chad'
import '@brillliand/vue-table-chad/style.css'

type Person = { id: number; name: string; department: string; salary: number; hiredAt: string }

const columns: ColumnDef<Person>[] = [
  { id: 'name', header: 'Name', type: 'text', pinned: 'left' },
  { id: 'department', header: 'Department', type: 'enum', options: ['Engineering', 'Design', 'Sales', 'Support'] },
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
    salary: 50_000 + ((i * 7919) % 90_000),
    hiredAt: new Date(2015 + (i % 9), i % 12, 1 + (i % 28)).toISOString().slice(0, 10),
  }))
}

const rows = shallowRef<Person[]>(makePeople(200))

// A stand-in for a router's `route.query` or a store field — a real app
// would mirror this ref to and from the URL. `useTableState` writes straight
// through to whatever ref it is handed, so the table owns nothing of its own.
const hoisted = ref<QueryState>(createQueryState({ pageSize: 10 }))
const state = useTableState({ state: hoisted })
const source = useLocalDataSource(rows, columns, state.query)
</script>

<template>
  <DataTable :columns="columns" :source="source" :state="state" />
  <p><code>{{ JSON.stringify(hoisted) }}</code></p>
</template>
