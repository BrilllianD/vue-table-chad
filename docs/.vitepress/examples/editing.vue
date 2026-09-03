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

// `editable` opens a cell; `required` and `validate` are checked in the
// draft, before `validate` below and long before `save` runs.
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
    validate: (value) => (Number(value) < 0 ? 'Cannot be negative' : null),
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
    city: `${cities[i % cities.length]} ${Math.floor(i / cities.length) + 1}`,
    salary: 50_000 + ((i * 7919) % 90_000),
  }))
}

const rows = shallowRef<Person[]>(makePeople(200))
const state = useTableState({ pageSize: 10 })
const source = useLocalDataSource(rows, columns, state.query)

const editing = useRowEditing(source, columns, {
  mode: 'row',
  // A cross-field check on the row the draft would become. Caught here,
  // before a request is even sent.
  validate: (next) => (next.city.trim() === '' ? 'City cannot be blank' : null),
  save,
  apply: (next) => {
    rows.value = replaceRowIn(rows.value, next, (row) => row.id)
  },
})

// The one thing the client cannot check itself: whether the city is already
// taken by a different person. Give two people the same city to see it.
function save({ id, nextRow }: RowChange<Person>): Promise<Person> {
  const taken = rows.value.some((r) => r.id !== id && r.city === nextRow.city)
  if (taken) return Promise.reject(new Error(`${nextRow.city} is already taken`))
  return Promise.resolve(nextRow)
}
</script>

<template>
  <DataTable :columns="columns" :source="source" :state="state" :editing="editing" />
</template>
