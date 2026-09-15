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

function mailTo(row: Person | undefined): void {
  if (row) window.open(`mailto:${row.email}`)
}
</script>

<template>
  <!-- `context-menu` claims the right-click; `cell-cursor` is what gives
       Shift+F10 a cell to open the same menu on. -->
  <DataTable :columns="columns" :source="source" :state="state" context-menu cell-cursor>
    <!-- Items of your own, after the five built-in ones. `close` is handed in
         rather than assumed: an item that opens something else decides for
         itself when the menu is done. -->
    <template #contextMenu="{ rowId, close }">
      <button
        type="button"
        class="vt-context-item"
        role="menuitem"
        @click="mailTo(rows.find((row) => row.id === rowId)), close()"
      >
        Email this person
      </button>
    </template>
  </DataTable>
</template>
