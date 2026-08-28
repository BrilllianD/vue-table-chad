<script setup lang="ts">
import { createQueryState, filterRows, sortRows, conditionsFilter } from '@brillliand/vue-table-chad'
import { makeRows, employeeColumns, type Employee } from '@fixtures'

const all: Employee[] = makeRows(50)

// The same shape `useTableState` owns internally — no component in sight,
// just the two pure functions it calls on every change.
const query = createQueryState({
  initialSort: [{ columnId: 'salary', direction: 'desc' }],
  initialFilters: { department: conditionsFilter([{ operator: 'eq', value: 'Engineering' }]) },
})

const filtered = filterRows(all, employeeColumns, query)
const rows = sortRows(filtered, query.sort, employeeColumns)
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
