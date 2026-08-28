<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'
import {
  DataTable,
  createQueryState,
  pruneFilters,
  useLocalDataSource,
  useTableState,
  type QueryState,
} from '@brillliand/vue-table-chad'
import { makeRows, employeeColumns, type Employee } from '@fixtures'

const rows = shallowRef<Employee[]>(makeRows(600))

/*
 * `?q=` rather than the hash: this page is one of many on a VitePress site,
 * and writing the hash would send the reader to whatever anchor it named.
 * `replaceState` writes the URL without navigating either way.
 */
const PARAM = 'q'

function readFromUrl(): QueryState {
  const raw = new URLSearchParams(location.search).get(PARAM)
  if (raw) {
    try {
      return { ...createQueryState({ pageSize: 10 }), ...JSON.parse(raw) }
    } catch {
      // A hand-edited or truncated URL must not brick the page.
    }
  }
  return createQueryState({ pageSize: 10 })
}

/**
 * The single source of truth. `useTableState({ state })` stops owning anything
 * and mirrors this ref instead — both ways, and synchronously, so reading it
 * straight after `state.setPage(3)` gives you page 3 rather than the old one.
 */
const external = ref<QueryState>(createQueryState({ pageSize: 10 }))

const state = useTableState({ state: external })
const source = useLocalDataSource<Employee>(rows, employeeColumns, state.query)

/** `pruneFilters` drops the cleared ones, so the URL carries no empty filters. */
const serialized = computed(() =>
  JSON.stringify({ ...external.value, filters: pruneFilters(external.value.filters) }),
)

watch(serialized, (value) => {
  const params = new URLSearchParams(location.search)
  params.set(PARAM, value)
  history.replaceState(null, '', `${location.pathname}?${params}`)
})

/** The other direction: back, forward, or someone pasting a link. */
function onPopState(): void {
  external.value = readFromUrl()
}

/*
 * The URL is read on mount rather than during setup: this page is prerendered,
 * and `location` does not exist on the server. Reading it here means the first
 * client render matches the server's and the URL is applied a tick later.
 */
onMounted(() => {
  external.value = readFromUrl()
  window.addEventListener('popstate', onPopState)
})
onUnmounted(() => window.removeEventListener('popstate', onPopState))

/** Proof the ref is the real owner: this bypasses the table entirely. */
function jumpToPage3(): void {
  external.value = { ...external.value, page: 3 }
}
</script>

<template>
  <p>
    <button type="button" @click="jumpToPage3()">Write page 3 into the ref</button>
    <code>{{ serialized }}</code>
  </p>

  <!-- Nothing below knows the URL exists. -->
  <DataTable :columns="employeeColumns" :source="source" :state="state" />
</template>
