<script setup lang="ts">
import { shallowRef } from 'vue'
import { DataTable, useLocalDataSource, useTableState, type ColumnDef } from '@brillliand/vue-table-chad'
import '@brillliand/vue-table-chad/style.css'

// A `type`, not an `interface`: the components need an index signature, and
// only a type alias gets one for free. The composables take either.
type Person = { id: number; name: string; department: string; salary: number; hiredAt: string }

// `type` is what makes sorting and filtering behave: it picks the comparator
// and decides which operators the filter panel offers.
const columns: ColumnDef<Person>[] = [
  { id: 'name', header: 'Name', type: 'text', pinned: 'left' },
  { id: 'department', header: 'Department', type: 'enum', options: ['Engineering', 'Design', 'Sales', 'Support'] },
  {
    id: 'salary',
    header: 'Salary',
    type: 'number',
    align: 'right',
    aggregate: 'sum',
    format: (v) => (v == null ? '—' : `$${Number(v).toLocaleString()}`),
  },
  { id: 'hiredAt', header: 'Hired', type: 'date' },
]

// Stand-in for your own data. Deterministic, so a reload shows the same table.
function makePeople(count: number): Person[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    name: `Person ${i + 1}`,
    department: ['Engineering', 'Design', 'Sales', 'Support'][i % 4]!,
    salary: 50_000 + ((i * 7919) % 90_000),
    hiredAt: new Date(2015 + (i % 9), i % 12, 1 + (i % 28)).toISOString().slice(0, 10),
  }))
}

// shallowRef, not ref: a plain ref proxies every row object, and every cell
// read during a filter or sort then goes through a Proxy trap.
const rows = shallowRef<Person[]>(makePeople(300))
const state = useTableState({ pageSize: 10 })
const source = useLocalDataSource(rows, columns, state.query)
</script>

<template>
  <DataTable :columns="columns" :source="source" :state="state" selectable />
</template>
