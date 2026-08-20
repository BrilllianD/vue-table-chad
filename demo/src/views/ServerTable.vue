<script setup lang="ts">
/**
 * Split out from `ServerView` so its props can be captured once at setup and
 * the whole source can be recreated by remounting, rather than pretending
 * `debounceMs` is reactive when it is not.
 *
 * Note what is *not* here: nothing about debouncing, aborting or facet scoping.
 * That all lives in `useServerDataSource`; this file just hands it a fetcher.
 */
import { ref } from 'vue'
import {
  DataTable,
  useServerDataSource,
  useTableState,
  type FetchParams,
  type QueryState,
  type ServerDataSource,
  type ServerDataSourceOptions,
} from '@sandbox/vue-table'
import { fetchEmployeeFacets, fetchEmployees } from '../data/fakeApi'
import type { Employee } from '../data/dataset'
import { employeeColumns } from '../columns'
import StateInspector from '../components/StateInspector.vue'

const props = defineProps<{
  latencyMs: number
  failureRate: number
  debounceMs: number
  keepPreviousData: boolean
  immediate: boolean
}>()

const state = useTableState({ pageSize: 10 })
const lastError = ref<string | null>(null)
const lastQuery = ref<QueryState | null>(null)

// Latency and failure rate are read at call time, so those two *are* live.
function fetchPage({ query, signal }: FetchParams) {
  return fetchEmployees(query, employeeColumns, signal, {
    latencyMs: props.latencyMs,
    failureRate: props.failureRate,
  })
}

const sourceOptions: ServerDataSourceOptions = {
  debounceMs: props.debounceMs,
  keepPreviousData: props.keepPreviousData,
  immediate: props.immediate,
  // The column's own filter is stripped from `query` before this runs, which
  // is what keeps a checklist from erasing the value you just unchecked.
  fetchFacets: (columnId, { query, signal }) =>
    fetchEmployeeFacets(columnId, query, employeeColumns, signal, {
      latencyMs: Math.min(props.latencyMs, 400),
    }),
  onError: (error) => {
    lastError.value = error instanceof Error ? error.message : String(error)
  },
}

const source: ServerDataSource<Employee> = useServerDataSource<Employee>(
  fetchPage,
  state.query,
  sourceOptions,
)
</script>

<template>
  <div class="server-table">
    <p class="hint">
      <span class="pill" :class="source.loading.value ? 'pill-on' : 'pill-off'">
        {{ source.loading.value ? 'loading' : 'idle' }}
      </span>
      <span class="pill" :class="source.initialLoading.value ? 'pill-on' : 'pill-off'">
        initialLoading
      </span>
      <span class="pill pill-off">remote: {{ source.remote }}</span>
      <span>{{ source.total.value }} rows match</span>
      <button type="button" class="vt-btn vt-btn-link" @click="source.refresh()">
        refresh() — also drops the facet cache
      </button>
    </p>

    <DataTable
      :columns="employeeColumns"
      :source="source"
      :state="state"
      selectable
      @update:query="lastQuery = $event"
    >
      <!-- `error` is a DataTable slot with a default, overridden here to show
           what it receives. The `loading` slot is deliberately *not* overridden:
           what you see while a request is in flight is the preset's own
           indicator, so the demo shows what a consumer actually gets. -->
      <template #error="{ refresh }">
        <span class="vt-error">
          {{ lastError ?? 'Request failed' }} —
          <button type="button" class="vt-btn vt-btn-link" @click="refresh()">Try again</button>
        </span>
      </template>

      <!-- The pagination slot replaces the default pager entirely. -->
      <template #pagination="{ state: s, total }">
        <div class="pager">
          <button type="button" class="vt-btn" :disabled="s.page.value <= 1" @click="s.setPage(1)">
            ⏮ first
          </button>
          <button
            type="button"
            class="vt-btn"
            :disabled="s.page.value <= 1"
            @click="s.setPage(s.page.value - 1)"
          >
            ← prev
          </button>
          <span class="hint">
            page {{ s.page.value }} of {{ Math.max(1, Math.ceil(total / s.pageSize.value)) }}
          </span>
          <button
            type="button"
            class="vt-btn"
            :disabled="s.page.value >= Math.ceil(total / s.pageSize.value)"
            @click="s.setPage(s.page.value + 1)"
          >
            next →
          </button>
          <select
            :value="s.pageSize.value"
            @change="s.setPageSize(Number(($event.target as HTMLSelectElement).value))"
          >
            <option v-for="size in [10, 25, 50]" :key="size" :value="size">{{ size }} / page</option>
          </select>
        </div>
      </template>
    </DataTable>

    <StateInspector label="Query sent to the server" :value="lastQuery" />
  </div>
</template>

<style scoped>
.server-table { display: flex; flex-direction: column; gap: 10px; }
.server-table > .hint { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.pager { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
</style>
