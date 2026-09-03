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

// Rows are identified by `row.id`; pass `get-row-id` when yours are keyed
// by something else, since selection remembers ids and not objects.
const rows = shallowRef<Person[]>(makePeople(400))
const state = useTableState({ pageSize: 10 })
const source = useLocalDataSource(rows, columns, state.query)
</script>

<template>
  <DataTable :columns="columns" :source="source" :state="state" selectable="multiple">
    <template #toolbar="{ selection }">
      <strong>{{ selection?.count.value ?? 0 }} selected</strong>
      — tick a row's checkbox, then shift-click another to take the range in
      between. Clicking the row itself does not select; that gesture is left to
      the caller. The header checkbox goes indeterminate as soon as some, but
      not all, of the page is selected.
    </template>
  </DataTable>
</template>
