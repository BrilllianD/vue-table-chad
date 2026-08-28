<!--
  useServerDataSource against a real fetcher, with the loading and error
  states DataTable does not draw for you unless you say where — the
  toolbar slot and #error, below, are what fill them in.

  Every DataSource, local or server, carries the same `loading` and `error`
  refs. Only a server source ever has them read `true` / non-null for more
  than a tick, which is why this is the port worth writing out in full.
-->
<script setup lang="ts">
import { computed } from 'vue'
import { DataTable, useServerDataSource, useTableState, type FetchParams } from '@brillliand/vue-table-chad'
import { employeeColumns, type Employee } from '@fixtures'
import { fetchEmployees } from '../../demo/src/data/fakeApi'

const state = useTableState({ pageSize: 20 })

const source = useServerDataSource<Employee>(
  ({ query, signal }: FetchParams) =>
    // ADAPT: replace with your own endpoint — same query, same {rows, total} shape.
    fetchEmployees(query, employeeColumns, signal, { latencyMs: 400, failureRate: 0.15 }),
  state.query,
  { debounceMs: 300, keepPreviousData: true },
)

const errorMessage = computed(() =>
  source.error.value instanceof Error ? source.error.value.message : null,
)
</script>

<template>
  <DataTable :columns="employeeColumns" :source="source" :state="state">
    <template #toolbar>
      <span v-if="source.loading.value">Loading…</span>
    </template>
  </DataTable>

  <p v-if="errorMessage" role="alert">
    {{ errorMessage }}
    <button type="button" @click="source.refresh()">Retry</button>
  </p>
</template>
