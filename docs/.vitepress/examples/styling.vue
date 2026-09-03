<script setup lang="ts">
import { shallowRef } from 'vue'
import { DataTable, useLocalDataSource, useTableState, type ColumnDef } from '@brillliand/vue-table-chad'
import '@brillliand/vue-table-chad/style.css'

type Person = { id: number; name: string; department: string; salary: number; hiredAt: string }

const columns: ColumnDef<Person>[] = [
  { id: 'name', header: 'Name', type: 'text', pinned: 'left', width: 160 },
  { id: 'department', header: 'Department', type: 'enum', options: ['Engineering', 'Design', 'Sales', 'Support'], width: 200 },
  {
    id: 'salary',
    header: 'Salary',
    type: 'number',
    align: 'right',
    width: 200,
    format: (v) => (v == null ? '—' : `$${Number(v).toLocaleString()}`),
  },
  { id: 'hiredAt', header: 'Hired', type: 'date', width: 200 },
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

const rows = shallowRef<Person[]>(makePeople(60))
const state = useTableState({ pageSize: 10, initialSort: [{ columnId: 'name', direction: 'asc' }] })
const source = useLocalDataSource(rows, columns, state.query)
</script>

<template>
  <!--
    Every override lives on the wrapping element, not on DataTable — the
    stylesheet hangs entirely off custom properties, so a component never
    needs to know a theme exists. `name` is pinned left: scroll the table
    sideways to watch its background stay opaque over the stripe scrolling
    underneath it.
  -->
  <div
    style="
      --vtc-accent: #7c3aed;
      --vtc-row-even-bg: #f4f0fb;
      --vtc-radius: 10px;
    "
  >
    <DataTable :columns="columns" :source="source" :state="state" />
  </div>
</template>
