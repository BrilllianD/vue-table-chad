<script setup lang="ts">
import { ref, shallowRef } from 'vue'
import {
  DataTable,
  createQueryState,
  useLocalDataSource,
  useTableState,
  type QueryState,
} from '@brillliand/vue-table-chad'
import { makeRows, employeeColumns, type Employee } from '@fixtures'

const rows = shallowRef<Employee[]>(makeRows(200))

// A stand-in for a router's `route.query.q` — a real app would mirror this
// ref to/from the URL instead. `useTableState` writes straight through to
// whatever ref it is handed, so the table owns nothing of its own.
const hoisted = ref<QueryState>(createQueryState({ pageSize: 10 }))
const state = useTableState({ state: hoisted })
const source = useLocalDataSource<Employee>(rows, employeeColumns, state.query)
</script>

<template>
  <DataTable :columns="employeeColumns" :source="source" :state="state" />
  <p><code>{{ JSON.stringify(hoisted) }}</code></p>
</template>
