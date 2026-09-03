<!--
  useServerDataSource against a fetcher, with the loading and error states
  DataTable does not draw for you unless you say where — the toolbar slot
  and the paragraph below are what fill them in.

  Every DataSource, local or server, carries the same `loading` and `error`
  refs. Only a server source ever has them read `true` / non-null for more
  than a tick, which is why this is the port worth writing out in full.
-->
<script setup lang="ts">
import { computed } from 'vue'
import {
  DataTable,
  filterRows,
  groupedSort,
  sortRows,
  useServerDataSource,
  useTableState,
  type ColumnDef,
  type FetchParams,
  type FetchResult,
} from '@brillliand/vue-table-chad'
import '@brillliand/vue-table-chad/style.css'

type Person = { id: number; name: string; department: string; salary: number; hiredAt: string }

const columns: ColumnDef<Person>[] = [
  { id: 'name', header: 'Name', type: 'text', pinned: 'left' },
  { id: 'department', header: 'Department', type: 'enum', options: ['Engineering', 'Design', 'Sales', 'Support'] },
  {
    id: 'salary',
    header: 'Salary',
    type: 'number',
    align: 'right',
    format: (v) => (v == null ? '—' : `$${Number(v).toLocaleString()}`),
  },
  { id: 'hiredAt', header: 'Hired', type: 'date' },
]

function makePeople(count: number): Person[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    name: `Person ${i + 1}`,
    department: ['Engineering', 'Design', 'Sales', 'Support'][i % 4]!,
    salary: 50_000 + ((i * 7919) % 90_000),
    hiredAt: new Date(2015 + (i % 9), i % 12, 1 + (i % 28)).toISOString().slice(0, 10),
  }))
}

/**
 * A stand-in server that fails 15% of the time, so the error path below gets
 * exercised. ADAPT: replace the body with your own endpoint — same `query`
 * in, same `{ rows, total }` out.
 */
const ALL = makePeople(2000)
async function fetchPeople({ query, signal }: FetchParams): Promise<FetchResult<Person>> {
  await new Promise((resolve) => setTimeout(resolve, 400))
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
  if (Math.random() < 0.15) throw new Error('503 Service Unavailable')
  const matched = filterRows(ALL, columns, query)
  const ordered = sortRows(matched, groupedSort(query.sort, query.groupBy), columns)
  const start = (query.page - 1) * query.pageSize
  return { rows: ordered.slice(start, start + query.pageSize), total: matched.length }
}

const state = useTableState({ pageSize: 20 })

const source = useServerDataSource(fetchPeople, state.query, { debounceMs: 300, keepPreviousData: true })

const errorMessage = computed(() =>
  source.error.value instanceof Error ? source.error.value.message : null,
)
</script>

<template>
  <DataTable :columns="columns" :source="source" :state="state">
    <template #toolbar>
      <span v-if="source.loading.value">Loading…</span>
    </template>
  </DataTable>

  <p v-if="errorMessage" role="alert">
    {{ errorMessage }}
    <button type="button" @click="source.refresh()">Retry</button>
  </p>
</template>
