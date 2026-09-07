<script setup lang="ts">
/**
 * Split out from `ServerView` so its props can be captured once at setup and
 * the whole source can be recreated by remounting, rather than pretending
 * `debounceMs` is reactive when it is not.
 *
 * Note what is *not* here: nothing about debouncing, aborting or facet scoping.
 * That all lives in `useServerDataSource`; this file just hands it a fetcher.
 *
 * The cursor is on, and deliberately without `autofocusCursor` — a view should
 * not take the caret merely by being opened. It is here because a page turn
 * against a source that answers later is the one case the local views cannot
 * show: turn up the latency and the ring waits with you.
 */
import { ref } from 'vue'
import {
  DataTable,
  usePagination,
  useServerDataSource,
  useTableState,
  type FetchParams,
  type QueryState,
  type ServerDataSource,
  type ServerDataSourceOptions,
  type UsePagination,
} from '@brillliand/vue-table-chad'
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

/**
 * The page arithmetic for the custom `#pagination` slot below.
 *
 * Spelling it out by hand — `Math.ceil(total / pageSize)` at every use site —
 * is what this replaces: `go` clamps, so a page beyond the end of a result set
 * that just shrank cannot be asked for, and `items` gives the numbered links
 * with their ellipsis gaps already worked out. At 1000 pages that is the
 * difference between reachable and not: a first/prev/next pager can only walk.
 *
 * It reads `state` and `source.total` rather than the slot's props, because a
 * composable belongs in setup. The slot's `state` and `total` are the same two
 * values — the slot is what a consumer with no setup of their own would use.
 */
const pagination: UsePagination = usePagination(
  state.page,
  state.pageSize,
  source.total,
  { onChange: (page) => state.setPage(page) },
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
      cell-cursor
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
      <template #pagination="{ total }">
        <div class="pager">
          <button
            type="button"
            class="vt-btn"
            :disabled="!pagination.canPrev.value"
            @click="pagination.first()"
          >
            « first
          </button>
          <button
            type="button"
            class="vt-btn"
            :disabled="!pagination.canPrev.value"
            @click="pagination.prev()"
          >
            ‹ prev
          </button>

          <!-- `items` is `PageItem[]`: page numbers with 'ellipsis' where the
               run is broken, so the markup is a v-for and no arithmetic. -->
          <template v-for="(item, index) in pagination.items.value">
            <span v-if="item === 'ellipsis'" :key="`gap-${index}`" class="gap">…</span>
            <button
              v-else
              :key="item"
              type="button"
              class="vt-btn"
              :class="{ current: item === pagination.page.value }"
              :aria-current="item === pagination.page.value ? 'page' : undefined"
              @click="pagination.go(item)"
            >
              {{ item }}
            </button>
          </template>

          <button
            type="button"
            class="vt-btn"
            :disabled="!pagination.canNext.value"
            @click="pagination.next()"
          >
            next ›
          </button>
          <button
            type="button"
            class="vt-btn"
            :disabled="!pagination.canNext.value"
            @click="pagination.last()"
          >
            last »
          </button>

          <select
            :value="state.pageSize.value"
            aria-label="Rows per page"
            @change="state.setPageSize(Number(($event.target as HTMLSelectElement).value))"
          >
            <option v-for="size in [10, 25, 50]" :key="size" :value="size">{{ size }} / page</option>
          </select>

          <span class="hint">
            {{ pagination.firstRow.value }}–{{ pagination.lastRow.value }} of {{ total }} ·
            page {{ pagination.page.value }} of {{ pagination.pageCount.value }}
          </span>
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
.pager .current { font-weight: 700; border-color: var(--accent); color: var(--accent); }
.pager .gap { opacity: 0.5; padding: 0 2px; }
</style>
