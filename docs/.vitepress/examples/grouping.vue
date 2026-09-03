<script setup lang="ts">
import { shallowRef } from 'vue'
import { DataTable, useLocalDataSource, useTableState, type ColumnDef } from '@brillliand/vue-table-chad'
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
    // `aggregate` is what fills both the band totals and the whole-table
    // footer below.
    aggregate: 'sum',
    format: (v) => (v == null ? '—' : `$${Number(v).toLocaleString()}`),
    // `format` wants a row and a sum has none, so a total is dressed separately.
    aggregateFormat: (result) => (result.value == null ? '—' : `$${Number(result.value).toLocaleString()}`),
  },
  { id: 'hiredAt', header: 'Hired', type: 'date', aggregate: 'min' },
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

const rows = shallowRef<Person[]>(makePeople(500))
const state = useTableState({ pageSize: 10, initialGroupBy: ['department'] })
const source = useLocalDataSource(rows, columns, state.query)
</script>

<template>
  <DataTable :columns="columns" :source="source" :state="state" show-footer />
</template>
