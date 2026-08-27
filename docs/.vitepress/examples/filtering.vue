<script setup lang="ts">
import { shallowRef } from 'vue'
import {
  DataTable,
  useLocalDataSource,
  useTableState,
  valuesFilter,
  conditionsFilter,
} from '@brillliand/vue-table-chad'
import { makeRows, employeeColumns, type Employee } from '@fixtures'

const rows = shallowRef<Employee[]>(makeRows(500))
const state = useTableState({ pageSize: 10 })

// ~4% of rows have a blank department — `includeBlanks` is what puts them in
// their own "(Blanks)" bucket instead of dropping them silently.
state.setFilter('department', valuesFilter([], true))
state.setFilter('salary', conditionsFilter([{ operator: 'between', value: 90000, value2: 140000 }]))

const source = useLocalDataSource<Employee>(rows, employeeColumns, state.query)
</script>

<template>
  <DataTable :columns="employeeColumns" :source="source" :state="state" />
</template>
