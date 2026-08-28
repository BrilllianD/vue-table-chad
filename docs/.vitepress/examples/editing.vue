<script setup lang="ts">
import { shallowRef } from 'vue'
import {
  DataTable,
  replaceRowIn,
  useLocalDataSource,
  useRowEditing,
  useTableState,
  type RowChange,
} from '@brillliand/vue-table-chad'
import { makeRows, employeeColumns, type Employee } from '@fixtures'

const rows = shallowRef<Employee[]>(makeRows(200))
const state = useTableState({ pageSize: 8 })
const source = useLocalDataSource<Employee>(rows, employeeColumns, state.query)

const editing = useRowEditing<Employee>(source, employeeColumns, {
  mode: 'row',
  // `city` and `country` are accessor columns (`row.location.city`), so they
  // need `setValue` to write back — `nextRow` below is `patch` already run
  // through it. Caught here, before a request is even sent.
  validate: (next) => (next.location.city.trim() === '' ? 'City cannot be blank' : null),
  save,
  apply: (next) => {
    rows.value = replaceRowIn(rows.value, next, (row) => row.id)
  },
})

// The one thing the client cannot check itself: whether the city is already
// taken by a different employee. Rename two people to the same city to see it.
function save({ id, nextRow }: RowChange<Employee>): Promise<Employee> {
  const taken = rows.value.some((r) => r.id !== id && r.location.city === nextRow.location.city)
  if (taken) return Promise.reject(new Error(`${nextRow.location.city} is already taken`))
  return Promise.resolve(nextRow)
}
</script>

<template>
  <DataTable :columns="employeeColumns" :source="source" :state="state" :editing="editing" />
</template>
