<script setup lang="ts">
import { shallowRef } from 'vue'
import { DataTable, useLocalDataSource, useTableState } from '@brillliand/vue-table-chad'
import { makeRows, employeeColumns, type Employee } from '@fixtures'

const rows = shallowRef<Employee[]>(makeRows(300))

// `role` carries its own `comparator` in employeeColumns — SENIORITY is not
// alphabetical, so the default text sort would put "Junior" above "Senior".
const state = useTableState({
  pageSize: 10,
  initialSort: [{ columnId: 'role', direction: 'asc' }],
})
const source = useLocalDataSource<Employee>(rows, employeeColumns, state.query)
</script>

<template>
  <DataTable :columns="employeeColumns" :source="source" :state="state" />
</template>
