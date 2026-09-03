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

const rows = shallowRef<Person[]>(makePeople(60))
const state = useTableState({ pageSize: 10 })
const source = useLocalDataSource(rows, columns, state.query)
</script>

<template>
  <!-- Every override lives on the wrapper. The stylesheet hangs entirely off
       custom properties, so no component needs to know a theme exists. A
       palette is a set: override the header colour and the text colour
       together, or a dark-mode value leaks through the light one. -->
  <div
    class="my-table"
    style="
      --vtc-accent: #7c3aed;
      --vtc-bg: #ffffff;
      --vtc-header-bg: #faf5ff;
      --vtc-text: #1f2937;
      --vtc-text-muted: #6b7280;
      --vtc-border: #e5e7eb;
      --vtc-row-height: 40px;
      --vtc-radius: 8px;
      /* Row striping is two variables; equal values mean no stripes. */
      --vtc-row-odd-bg: #ffffff;
      --vtc-row-even-bg: #fafafa;
    "
  >
    <DataTable :columns="columns" :source="source" :state="state" />
  </div>
</template>
