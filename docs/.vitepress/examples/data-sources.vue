<script setup lang="ts">
import { ref, shallowRef } from 'vue'
import {
  DataTable,
  useLocalDataSource,
  useServerDataSource,
  useTableState,
  type FetchParams,
} from '@brillliand/vue-table-chad'
import { makeRows, employeeColumns, type Employee } from '@fixtures'
// The fake API reads its own fixed 10k rows — the same `makeRows()` default,
// same seed — so the server source below shows exactly the local rows too.
import { fetchEmployees } from '../../../demo/src/data/fakeApi'

const state = useTableState({ pageSize: 10 })

const rows = shallowRef<Employee[]>(makeRows())
const local = useLocalDataSource<Employee>(rows, employeeColumns, state.query)

const server = useServerDataSource<Employee>(
  ({ query, signal }: FetchParams) => fetchEmployees(query, employeeColumns, signal, { latencyMs: 300 }),
  state.query,
)

const useServer = ref(false)
</script>

<template>
  <label>
    <input v-model="useServer" type="checkbox" />
    Fetch from the fake server instead of the local array
  </label>

  <!-- Same columns, same state, same DataTable markup either way — only the
       object bound to `source` changes. -->
  <DataTable :columns="employeeColumns" :source="useServer ? server : local" :state="state" />
</template>
