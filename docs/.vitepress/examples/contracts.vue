<script setup lang="ts">
import {
  conditionsFilter,
  createQueryState,
  filterRows,
  sortRows,
  type ColumnDef,
} from '@brillliand/vue-table-chad'

// No component, no stylesheet: this file is the two pure functions and the
// query object they read, which is all `useTableState` does on every change.
type Person = { id: number; name: string; department: string; salary: number; hiredAt: string }

const columns: ColumnDef<Person>[] = [
  { id: 'name', header: 'Name', type: 'text' },
  { id: 'department', header: 'Department', type: 'enum', options: ['Engineering', 'Design', 'Sales', 'Support'] },
  { id: 'salary', header: 'Salary', type: 'number' },
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

const all = makePeople(50)

// The same shape `useTableState` owns internally.
const query = createQueryState({
  initialSort: [{ columnId: 'salary', direction: 'desc' }],
  initialFilters: { department: conditionsFilter([{ operator: 'eq', value: 'Engineering' }]) },
})

const filtered = filterRows(all, columns, query)
const rows = sortRows(filtered, query.sort, columns)
</script>

<template>
  <table>
    <thead>
      <tr>
        <th>Name</th>
        <th>Department</th>
        <th>Salary</th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="row in rows" :key="row.id">
        <td>{{ row.name }}</td>
        <td>{{ row.department }}</td>
        <td>{{ row.salary }}</td>
      </tr>
    </tbody>
  </table>
</template>
