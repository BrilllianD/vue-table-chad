<script setup lang="ts">
import { DataTable, useServerDataSource, useTableState, type FetchParams } from '@brillliand/vue-table-chad'
import { employeeColumns, type Employee } from '@fixtures'
// A stand-in "server": the same rows any of this page's other examples would
// generate, filtered/sorted/paged the way a real endpoint would be.
import { fetchEmployees } from '../../../demo/src/data/fakeApi'

const state = useTableState({ pageSize: 10 })

const source = useServerDataSource<Employee>(
  ({ query, signal }: FetchParams) => fetchEmployees(query, employeeColumns, signal, { latencyMs: 300 }),
  state.query,
  { debounceMs: 300 },
)
</script>

<template>
  <DataTable :columns="employeeColumns" :source="source" :state="state" />
</template>
