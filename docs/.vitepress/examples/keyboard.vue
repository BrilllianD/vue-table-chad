<script setup lang="ts">
import { shallowRef } from 'vue'
import {
  DataTable,
  replaceRowIn,
  useLocalDataSource,
  useRowEditing,
  useTableState,
  type ColumnDef,
  type RowChange,
} from '@brillliand/vue-table-chad'
import '@brillliand/vue-table-chad/style.css'

type Person = { id: number; name: string; email: string; department: string; city: string; salary: number }

// Enter or any printable character opens an `editable` cell; the cursor
// moves through the others without opening anything.
const columns: ColumnDef<Person>[] = [
  { id: 'name', header: 'Name', type: 'text', pinned: 'left', editable: true, required: true },
  {
    id: 'email',
    header: 'Email',
    type: 'text',
    editable: true,
    validate: (value) => (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(value)) ? null : 'Not an email address'),
  },
  { id: 'department', header: 'Department', type: 'enum', options: ['Engineering', 'Design', 'Sales', 'Support'], editable: true },
  { id: 'city', header: 'City', type: 'text', editable: true },
  {
    id: 'salary',
    header: 'Salary',
    type: 'number',
    align: 'right',
    editable: true,
    format: (v) => (v == null ? '—' : `$${Number(v).toLocaleString()}`),
  },
]

function makePeople(count: number): Person[] {
  const cities = ['Berlin', 'Lisbon', 'Austin', 'Toronto', 'Osaka', 'Warsaw', 'Oslo', 'Lima']
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    name: `Person ${i + 1}`,
    email: `person${i + 1}@example.com`,
    department: ['Engineering', 'Design', 'Sales', 'Support'][i % 4]!,
    city: cities[i % cities.length]!,
    salary: 50_000 + ((i * 7919) % 90_000),
  }))
}

const rows = shallowRef<Person[]>(makePeople(200))
const state = useTableState({ pageSize: 10 })
const source = useLocalDataSource(rows, columns, state.query)

const editing = useRowEditing(source, columns, {
  mode: 'cell',
  save,
  apply: (next) => {
    rows.value = replaceRowIn(rows.value, next, (row) => row.id)
  },
})

// Nothing remote here — the draft is already the value the table wants.
function save({ id, patch }: RowChange<Person>): Promise<Person> {
  const row = rows.value.find((r) => r.id === id)!
  return Promise.resolve({ ...row, ...patch })
}
</script>

<template>
  <!-- Tab into the table, then use the arrow keys. Enter opens the cell, a
       second Enter commits and steps down. -->
  <DataTable
    :columns="columns"
    :source="source"
    :state="state"
    :editing="editing"
    cell-cursor
    autofocus-cursor
  />
</template>
