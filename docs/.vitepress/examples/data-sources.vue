<script setup lang="ts">
import { ref, shallowRef } from 'vue'
import {
  DataTable,
  filterRows,
  groupedSort,
  sortRows,
  useLocalDataSource,
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

const state = useTableState({ pageSize: 10 })

const rows = shallowRef<Person[]>(makePeople(2000))
const local = useLocalDataSource(rows, columns, state.query)

/**
 * A stand-in server over the same 2000 rows, so switching sources below
 * shows the same table either way. It does what `GET /people?…` would: the
 * library's own filter and sort over the whole set, then one page of it.
 * Replace the body with a `fetch` — the contract is the same `query` in and
 * `{ rows, total }` out.
 */
async function fetchPeople({ query, signal }: FetchParams): Promise<FetchResult<Person>> {
  await new Promise((resolve) => setTimeout(resolve, 300))
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
  const matched = filterRows(rows.value, columns, query)
  const ordered = sortRows(matched, groupedSort(query.sort, query.groupBy), columns)
  const start = (query.page - 1) * query.pageSize
  return { rows: ordered.slice(start, start + query.pageSize), total: matched.length }
}

const server = useServerDataSource(fetchPeople, state.query)

const useServer = ref(false)
</script>

<template>
  <label>
    <input v-model="useServer" type="checkbox" />
    Fetch from the fake server instead of the local array
  </label>

  <!-- Same columns, same state, same DataTable markup either way — only the
       object bound to `source` changes. -->
  <DataTable :columns="columns" :source="useServer ? server : local" :state="state" />
</template>
