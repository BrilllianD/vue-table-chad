<script setup lang="ts">
/**
 * Identical markup to LocalBasic — only the data source changed.
 *
 * That swap is the whole point of the `DataSource` contract: 10k rows behind a
 * latency-simulating API, with debounced filtering, race-safe responses and
 * server-side facets, and the component layer is none the wiser.
 */
import { ref } from 'vue'
import { DataTable, useServerDataSource, useTableState, type QueryState } from '@brillliand/vue-table-chad'
import { fetchEmployeeFacets, fetchEmployees, type Employee } from '../../mock/fakeApi'
import { employeeColumns } from '../columns'

const failureRate = ref(0)
const state = useTableState({ pageSize: 25 })

const source = useServerDataSource<Employee>(
  ({ query, signal }) =>
    fetchEmployees(query, employeeColumns, signal, { failureRate: failureRate.value }),
  state.query,
  {
    debounceMs: 300,
    fetchFacets: (columnId, { query, signal }) =>
      fetchEmployeeFacets(columnId, query, employeeColumns, signal),
  },
)

const lastQuery = ref<QueryState | null>(null)
</script>

<template>
  <section>
    <h2>Server data</h2>
    <p class="hint">
      10,000 rows behind a fake API with 350–700ms latency. Typing in a filter debounces; paging does
      not. Out-of-order responses are discarded.
    </p>

    <label class="hint">
      <input
        type="checkbox"
        :checked="failureRate > 0"
        @change="failureRate = failureRate > 0 ? 0 : 0.5"
      />
      Simulate a flaky server (50% failures) to see the error state
    </label>

    <DataTable
      :columns="employeeColumns"
      :source="source"
      :state="state"
      selectable
      @update:query="lastQuery = $event"
    />

    <details class="hint">
      <summary>Last request sent to the server</summary>
      <pre>{{ JSON.stringify(lastQuery, null, 2) }}</pre>
    </details>
  </section>
</template>
