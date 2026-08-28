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
  mode: 'cell',
  save,
  apply: (next) => {
    rows.value = replaceRowIn(rows.value, next, (row) => row.id)
  },
})

// Nothing remote here — the draft is already the value the table wants.
function save({ id, patch }: RowChange<Employee>): Promise<Employee> {
  const row = rows.value.find((r) => r.id === id)!
  return Promise.resolve({ ...row, ...patch })
}
</script>

<template>
  <!-- Tab into the table, then use the arrow keys. Enter opens `city` (it has
       a setValue), a second Enter commits and steps down. -->
  <DataTable
    :columns="employeeColumns"
    :source="source"
    :state="state"
    :editing="editing"
    cell-cursor
    autofocus-cursor
  />
</template>
