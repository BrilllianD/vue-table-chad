<script setup lang="ts">
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
 * A stand-in server: what `GET /people?…` would do, done with the library's
 * own pure functions over an array it holds. Replace the body with a `fetch`
 * — the contract is the same `query` in and `{ rows, total }` out.
 */
const ALL = makePeople(2000)
async function fetchPeople({ query, signal }: FetchParams): Promise<FetchResult<Person>> {
  await new Promise((resolve) => setTimeout(resolve, 300))
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
  const matched = filterRows(ALL, columns, query)
  const ordered = sortRows(matched, groupedSort(query.sort, query.groupBy), columns)
  const start = (query.page - 1) * query.pageSize
  return { rows: ordered.slice(start, start + query.pageSize), total: matched.length }
}

const state = useTableState({ pageSize: 10 })

// Swap `useLocalDataSource` for this and nothing above it changes: the
// columns, the state and the component never learn which one they got.
const source = useServerDataSource(fetchPeople, state.query, { debounceMs: 300 })
</script>

<template>
  <DataTable :columns="columns" :source="source" :state="state" />
</template>
