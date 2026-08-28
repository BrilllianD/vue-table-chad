<script setup lang="ts">
/**
 * A server list with no pager and no end: scroll, and the next page arrives.
 *
 * The difference from **Server data** is one composable. There, a page
 * *replaces* the rows and a pager asks for the next one; here the rows
 * accumulate and the **window reaching the end of them** is what asks. The
 * table above is the same table, `virtual` and all.
 *
 * Two things are worth watching.
 *
 * **The request log.** One request per page, never two — `loadMore` is guarded,
 * so `@end-reached` can be wired straight to it and fire as often as it likes.
 * Scroll to the bottom and hold: the pages come one at a time.
 *
 * **The counter.** "N of M loaded" is `loaded` against `total`: the list on
 * screen and the list on the server are different numbers, which is exactly
 * what an infinite source is. The scrollbar describes what is loaded, so it
 * lengthens as you go — the honest shape of not knowing what you have not
 * fetched.
 *
 * `endThreshold` is how early the window asks. At 0 the last row has to be
 * rendered first; raise it and the request goes out while there are still rows
 * to scroll through, which is what hides the latency.
 */
import { computed, ref } from 'vue'
import {
  DataTable,
  INFINITE_PAGE_SIZE,
  useInfiniteDataSource,
  useTableState,
  type FetchParams,
} from '@brillliand/vue-table-chad'
import { clearRequestLog, fetchEmployeeFacets, fetchEmployees, requestLog } from '../data/fakeApi'
import type { Employee } from '../data/dataset'
import { employeeColumns } from '../columns'
import DemoSection from '../components/DemoSection.vue'

const latencyMs = ref(350)
const endThreshold = ref(10)

const state = useTableState({ pageSize: 25 })

function fetchPage({ query, signal }: FetchParams) {
  return fetchEmployees(query, employeeColumns, signal, { latencyMs: latencyMs.value })
}

const source = useInfiniteDataSource<Employee>(fetchPage, state.query, {
  pageSize: INFINITE_PAGE_SIZE,
  fetchFacets: (columnId, { query, signal }) =>
    fetchEmployeeFacets(columnId, query, employeeColumns, signal, { latencyMs: latencyMs.value }),
})

const progress = computed(
  () => `${source.loaded.value.toLocaleString()} of ${source.total.value.toLocaleString()} loaded`,
)

/** Only the row requests, which are the ones this view is about. */
const rowRequests = computed(() => requestLog.filter((entry) => entry.kind === 'rows').slice(0, 8))
</script>

<template>
  <DemoSection
    title="Infinite scroll"
    blurb="Server rows that accumulate instead of being replaced. There is no pager: the virtual
           window reaching the end of the loaded rows is what asks for the next page, and the
           source refuses to be asked twice at once. Changing a filter starts the list again,
           because what 'the next page' means changed with it."
    :api="[
      'useInfiniteDataSource',
      'INFINITE_PAGE_SIZE',
      'loadMore',
      'hasMore',
      'loaded',
      'loadingMore',
      'DataTable endThreshold',
      'DataTable endReached',
    ]"
  >
    <template #controls>
      <div class="controls">
        <label>
          Latency {{ latencyMs }}ms
          <input v-model.number="latencyMs" type="range" min="0" max="2000" step="50" />
        </label>
        <label>
          endThreshold {{ endThreshold }} rows
          <input v-model.number="endThreshold" type="range" min="0" max="60" step="5" />
        </label>
        <button type="button" @click="source.refresh()">Start over</button>
        <button type="button" @click="clearRequestLog()">Clear log</button>
      </div>

      <p class="hint">
        <strong>{{ progress }}</strong>
        <span v-if="source.loadingMore.value"> — fetching the next page…</span>
        <span v-else-if="!source.hasMore.value"> — that is all of them.</span>
      </p>
    </template>

    <DataTable
      :columns="employeeColumns"
      :source="source"
      :state="state"
      virtual
      :end-threshold="endThreshold"
      :show-pagination="false"
      @end-reached="source.loadMore()"
    />

    <ol class="log">
      <li v-for="entry in rowRequests" :key="entry.id" :class="`log-${entry.outcome}`">
        <code>{{ entry.label }}</code>
        <span>{{ entry.outcome }}{{ entry.ms ? ` · ${entry.ms}ms` : '' }}</span>
      </li>
    </ol>
  </DemoSection>
</template>

<style scoped>
.controls { display: flex; flex-wrap: wrap; gap: 16px; align-items: center; }
.controls label { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; }
.log { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 2px; }
.log li {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  font-size: 12px;
  padding: 2px 6px;
  border-radius: 4px;
  background: rgb(127 127 127 / 0.08);
}
.log-error { background: rgb(220 38 38 / 0.14); }
.log-aborted { opacity: 0.6; }
</style>
