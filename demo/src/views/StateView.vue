<script setup lang="ts">
/**
 * Hoisting the query out of the table.
 *
 * Pass a ref and `useTableState` stops owning anything — it reads and writes
 * yours. Mirroring is synchronous in both directions, so reading
 * `external.value` immediately after `setPage(3)` gives you page 3, not the old
 * page. That is what makes the URL the source of truth rather than a laggy
 * copy of it.
 */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import {
  DataTable,
  createQueryState,
  pruneFilters,
  useLocalDataSource,
  useTableState,
  valuesFilter,
  type QueryState,
} from '@sandbox/vue-table'
import { employees, type Employee } from '../data/dataset'
import { employeeColumns } from '../columns'
import DemoSection from '../components/DemoSection.vue'
import StateInspector from '../components/StateInspector.vue'

const rows = ref(employees.slice(0, 600))

/* ------------------------------------------------------------ URL <-> ref */

const HASH_PREFIX = '#q='

function readFromUrl(): QueryState {
  const hash = location.hash
  if (hash.startsWith(HASH_PREFIX)) {
    try {
      return { ...createQueryState({ pageSize: 10 }), ...JSON.parse(decodeURIComponent(hash.slice(HASH_PREFIX.length))) }
    } catch {
      // A hand-edited or truncated URL must not brick the page.
    }
  }
  return createQueryState({ pageSize: 10 })
}

/** The single source of truth. The table only ever mirrors this. */
const external = ref<QueryState>(readFromUrl())

const state = useTableState({ state: external })
const source = useLocalDataSource<Employee>(rows, employeeColumns, state.query)

const serialized = computed(() =>
  encodeURIComponent(JSON.stringify({ ...external.value, filters: pruneFilters(external.value.filters) })),
)

const syncUrl = ref(true)

watch(
  serialized,
  (value) => {
    if (syncUrl.value) history.replaceState(null, '', `${HASH_PREFIX}${value}`)
  },
  { immediate: true },
)

/** The other direction: back/forward, or someone pasting a link. */
function onHashChange(): void {
  external.value = readFromUrl()
}
onMounted(() => window.addEventListener('hashchange', onHashChange))
onUnmounted(() => window.removeEventListener('hashchange', onHashChange))

/* -------------------------------------------------- writing from outside */

/** Proof the ref is the real owner: this bypasses the table entirely. */
function setFromOutside(): void {
  external.value = {
    sort: [{ columnId: 'rating', direction: 'desc' }],
    filters: { department: valuesFilter(['Design']) },
    page: 2,
    pageSize: 5,
    globalSearch: 'a',
  }
}

const copied = ref(false)
async function copyLink(): Promise<void> {
  await navigator.clipboard.writeText(`${location.origin}${location.pathname}${HASH_PREFIX}${serialized.value}`)
  copied.value = true
  setTimeout(() => (copied.value = false), 1500)
}

/** Read straight after a write, to show the mirroring really is synchronous. */
const roundTrip = ref<string>('—')
function proveSync(): void {
  state.setPage(3)
  roundTrip.value = `setPage(3) → external.value.page === ${external.value.page}`
}

const readouts = computed(() => ({
  'sortFor("salary")': state.sortFor('salary'),
  'sortIndexFor("salary")': state.sortIndexFor('salary'),
  'filterFor("department")': state.filterFor('department') ?? null,
  activeFilterIds: state.activeFilterIds.value,
  hasActiveFilters: state.hasActiveFilters.value,
}))
</script>

<template>
  <DemoSection
    title="Hoisted state"
    blurb="The QueryState lives in a ref that this view owns, mirrored into the URL hash. Sort,
           filter or page the table and the address bar follows; edit the URL, or hit back, and
           the table follows. Nothing in the table knows the URL exists."
    :api="[
      'useTableState({ state })',
      'createQueryState',
      'toggleSort',
      'setSort',
      'clearSort',
      'sortFor',
      'sortIndexFor',
      'setFilter',
      'clearFilter',
      'clearAllFilters',
      'filterFor',
      'activeFilterIds',
      'hasActiveFilters',
      'setPage',
      'setPageSize',
      'setSearch',
      'reset',
      'pruneFilters',
    ]"
  >
    <template #controls>
      <div class="controls">
        <label><input v-model="syncUrl" type="checkbox" /> Write to the URL</label>
        <button type="button" @click="copyLink()">{{ copied ? 'Copied ✓' : 'Copy link' }}</button>
        <button type="button" @click="setFromOutside()">Write the ref from outside</button>
        <button type="button" @click="proveSync()">Prove the sync is synchronous</button>
        <span v-if="roundTrip !== '—'" class="hint"><code>{{ roundTrip }}</code></span>
      </div>
    </template>

    <div class="controls">
      <span class="hint">Imperative API:</span>
      <button type="button" @click="state.toggleSort('salary')">toggleSort('salary')</button>
      <button type="button" @click="state.toggleSort('rating', true)">
        toggleSort('rating', additive)
      </button>
      <button type="button" @click="state.setSort('name', 'asc')">setSort('name', 'asc')</button>
      <button type="button" @click="state.clearSort()">clearSort()</button>
      <button type="button" @click="state.setFilter('role', valuesFilter(['Staff', 'Principal']))">
        setFilter('role', …)
      </button>
      <button type="button" @click="state.clearFilter('role')">clearFilter('role')</button>
      <button type="button" @click="state.clearAllFilters()">clearAllFilters()</button>
      <button type="button" @click="state.setSearch('ada')">setSearch('ada')</button>
      <button type="button" @click="state.setPage(4)">setPage(4)</button>
      <button type="button" @click="state.setPageSize(5)">setPageSize(5)</button>
      <button type="button" @click="state.reset()">reset()</button>
    </div>

    <DataTable :columns="employeeColumns" :source="source" :state="state" selectable />

    <div class="panels">
      <StateInspector label="external ref — the single source of truth" :value="external" open />
      <StateInspector label="Derived readouts" :value="readouts" />
    </div>

    <p class="hint">
      Note that <code>setFilter</code> and <code>setSearch</code> reset the page to 1 on your
      behalf. Page 7 of a result set that just shrank to 3 pages renders empty, and that reads as
      a bug every time.
    </p>
  </DemoSection>
</template>

<style scoped>
.panels { display: grid; gap: 8px; }
</style>
