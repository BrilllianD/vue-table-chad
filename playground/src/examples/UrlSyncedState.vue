<script setup lang="ts">
/**
 * Hoisting the query out of the table.
 *
 * `QueryState` is plain JSON by design, so it round-trips through the URL hash
 * — reload the page and the sort, filters and page all come back. The same
 * mechanism works for a Pinia store or a router query.
 */
import { ref, shallowRef, watch } from 'vue'
import {
  DataTable,
  createQueryState,
  useLocalDataSource,
  useTableState,
  type QueryState,
} from '@brillliand/vue-table-chad'
import { employees, type Employee } from '../../mock/fakeApi'
import { employeeColumns } from '../columns'

function readHash(): QueryState {
  const raw = window.location.hash.replace(/^#q=/, '')
  if (!raw) return createQueryState({ pageSize: 10 })
  try {
    return { ...createQueryState({ pageSize: 10 }), ...JSON.parse(decodeURIComponent(raw)) }
  } catch {
    return createQueryState({ pageSize: 10 })
  }
}

const external = ref<QueryState>(readHash())
const state = useTableState({ state: external })

const rows = shallowRef(employees.slice(0, 400))
const source = useLocalDataSource<Employee>(rows, employeeColumns, state.query)

watch(
  external,
  (query) => {
    const encoded = encodeURIComponent(JSON.stringify(query))
    window.history.replaceState(null, '', `#q=${encoded}`)
  },
  { deep: true },
)
</script>

<template>
  <section>
    <h2>State hoisted into the URL</h2>
    <p class="hint">
      The table owns no state here — it reads and writes the ref above. Sort or filter, then reload:
      everything is restored from the address bar.
    </p>

    <DataTable :columns="employeeColumns" :source="source" :state="state" :page-size="10" />

    <details class="hint">
      <summary>Current QueryState</summary>
      <pre>{{ JSON.stringify(external, null, 2) }}</pre>
    </details>
  </section>
</template>
