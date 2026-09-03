<script setup lang="ts">
import {
  DataTable,
  INFINITE_PAGE_SIZE,
  filterRows,
  groupedSort,
  sortRows,
  useInfiniteDataSource,
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
 * A stand-in server — a promise and a delay, no network. The query it gets
 * carries the page the source wants next, so the same fetcher would serve a
 * paged table too; only what happens to the rows on arrival differs.
 */
const ALL = makePeople(10_000)
async function fetchPeople({ query, signal }: FetchParams): Promise<FetchResult<Person>> {
  await new Promise((resolve) => setTimeout(resolve, 300))
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
  const matched = filterRows(ALL, columns, query)
  const ordered = sortRows(matched, groupedSort(query.sort, query.groupBy), columns)
  const start = (query.page - 1) * query.pageSize
  return { rows: ordered.slice(start, start + query.pageSize), total: matched.length }
}

const state = useTableState({ pageSize: 25 })

/**
 * The rows accumulate instead of being replaced, so there is no pager: the
 * virtual window reaching the end of what is loaded is what asks for more.
 * `loadMore` is guarded, so wiring `@end-reached` straight to it is safe
 * however often the window fires.
 */
const source = useInfiniteDataSource(fetchPeople, state.query, { pageSize: INFINITE_PAGE_SIZE })
</script>

<template>
  <p>
    <strong>{{ source.loaded.value.toLocaleString() }}</strong> of
    {{ source.total.value.toLocaleString() }} loaded
    <span v-if="source.loadingMore.value">— fetching the next page…</span>
    <span v-else-if="!source.hasMore.value">— that is all of them.</span>
  </p>

  <DataTable
    :columns="columns"
    :source="source"
    :state="state"
    virtual
    :end-threshold="10"
    :show-pagination="false"
    @end-reached="source.loadMore()"
  />
</template>
