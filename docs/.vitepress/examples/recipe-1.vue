<script setup lang="ts">
import { shallowRef } from 'vue'
import { DataTable, useLocalDataSource, useTableState } from '@brillliand/vue-table-chad'
import { makeRows, employeeColumns, type Employee } from '@fixtures'

// shallowRef, not ref: a plain ref proxies every row object, and every cell
// read during a filter or sort then goes through a Proxy trap.
const rows = shallowRef<Employee[]>(makeRows(300))

const state = useTableState({ pageSize: 10 })
const source = useLocalDataSource<Employee>(rows, employeeColumns, state.query)
</script>

<template>
  <DataTable :columns="employeeColumns" :source="source" :state="state" selectable>
    <template #cell:name="{ row }">
      <a :href="`/people/${row.id}`">{{ row.name }}</a>
    </template>
  </DataTable>
</template>
