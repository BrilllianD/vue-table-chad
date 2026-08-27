<script setup lang="ts">
import { shallowRef } from 'vue'
import { DataTable, useLocalDataSource, useTableState } from '@brillliand/vue-table-chad'
import { makeRows, employeeColumns, type Employee } from '@fixtures'

const rows = shallowRef<Employee[]>(makeRows(500))

// `salary` already carries `aggregate: 'sum'` in employeeColumns, so grouping
// by department fills in both the band totals and the footer for free.
const state = useTableState({ pageSize: 25, initialGroupBy: ['department'] })
const source = useLocalDataSource<Employee>(rows, employeeColumns, state.query)
</script>

<template>
  <DataTable :columns="employeeColumns" :source="source" :state="state" show-footer />
</template>
