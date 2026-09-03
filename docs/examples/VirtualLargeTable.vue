<!--
  100k rows, virtual, a pinned column and a collapsed band all at once — the
  combination P2-6's acceptance run measured (bench/BASELINE.md, "What the
  browser said"): 16.5ms median frame time scrolling continuously, against a
  16.4ms flat baseline with nothing pinned or grouped. Pinning and a collapsed
  band cost nothing over the flat case, because pinning is a per-cell offset
  the scroll window never reads, and a collapsed band is simply a shorter list
  for the window to slice.
-->
<script setup lang="ts">
import { shallowRef } from 'vue'
import {
  DataTable,
  useLocalDataSource,
  useTableState,
  type ColumnDef,
  type ColumnGroupDef,
} from '@brillliand/vue-table-chad'
import '@brillliand/vue-table-chad/style.css'

type Person = { id: number; name: string; email: string; department: string; salary: number; hiredAt: string }

const columnGroups: ColumnGroupDef[] = [
  { id: 'person', header: 'Person' },
  { id: 'record', header: 'Employment record', collapseTo: 'salary' },
]

const columns: ColumnDef<Person>[] = [
  { id: 'name', header: 'Name', type: 'text', pinned: 'left', group: 'person' },
  { id: 'email', header: 'Email', type: 'text', group: 'person' },
  { id: 'department', header: 'Department', type: 'enum', options: ['Engineering', 'Design', 'Sales', 'Support'], group: 'record' },
  {
    id: 'salary',
    header: 'Salary',
    type: 'number',
    align: 'right',
    aggregate: 'sum',
    group: 'record',
    format: (v) => (v == null ? '—' : `$${Number(v).toLocaleString()}`),
    aggregateFormat: (result) => (result.value == null ? '—' : `$${Number(result.value).toLocaleString()}`),
  },
  { id: 'hiredAt', header: 'Hired', type: 'date', group: 'record' },
]

function makePeople(count: number): Person[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    name: `Person ${i + 1}`,
    email: `person${i + 1}@example.com`,
    department: ['Engineering', 'Design', 'Sales', 'Support'][i % 4]!,
    salary: 50_000 + ((i * 7919) % 90_000),
    hiredAt: new Date(2015 + (i % 9), i % 12, 1 + (i % 28)).toISOString().slice(0, 10),
  }))
}

const rows = shallowRef<Person[]>(makePeople(100_000))

const state = useTableState({ pageSize: 25, initialGroupBy: ['department'] })
const source = useLocalDataSource(rows, columns, state.query)
</script>

<template>
  <DataTable
    :columns="columns"
    :column-groups="columnGroups"
    :source="source"
    :state="state"
    virtual
    :row-height="38"
    :overscan="8"
    :initial-layout="{ collapsedGroups: ['record'] }"
  />
</template>
