<script setup lang="ts">
import {
  DataTable,
  INFINITE_PAGE_SIZE,
  useInfiniteDataSource,
  useTableState,
  type FetchParams,
} from '@brillliand/vue-table-chad'
import { employeeColumns, type Employee } from '@fixtures'
// The same fake server the demo talks to — a promise and a delay, no network.
import { fetchEmployees } from '../../../demo/src/data/fakeApi'

const state = useTableState({ pageSize: 25 })

/**
 * The rows accumulate instead of being replaced, so there is no pager: the
 * virtual window reaching the end of what is loaded is what asks for more.
 * `loadMore` is guarded, so wiring `@end-reached` straight to it is safe
 * however often the window fires.
 */
const source = useInfiniteDataSource<Employee>(
  ({ query, signal }: FetchParams) =>
    fetchEmployees(query, employeeColumns, signal, { latencyMs: 300 }),
  state.query,
  { pageSize: INFINITE_PAGE_SIZE },
)
</script>

<template>
  <p>
    <strong>{{ source.loaded.value.toLocaleString() }}</strong> of
    {{ source.total.value.toLocaleString() }} loaded
    <span v-if="source.loadingMore.value">— fetching the next page…</span>
    <span v-else-if="!source.hasMore.value">— that is all of them.</span>
  </p>

  <DataTable
    :columns="employeeColumns"
    :source="source"
    :state="state"
    virtual
    :end-threshold="10"
    :show-pagination="false"
    @end-reached="source.loadMore()"
  />
</template>
