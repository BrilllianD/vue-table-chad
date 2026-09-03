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

type Person = { id: number; name: string; email: string; department: string; role: string; salary: number; hiredAt: string }

// Two bands. `collapseTo` names what a folded band still shows; without it
// the band's first declared column stands in.
const columnGroups: ColumnGroupDef[] = [
  { id: 'person', header: 'Person' },
  { id: 'record', header: 'Employment record', collapseTo: 'salary' },
]

// `group` is the band a column sits under. A column with no `group` gets a
// header cell that spans every band row.
const columns: ColumnDef<Person>[] = [
  { id: 'name', header: 'Name', type: 'text', group: 'person' },
  { id: 'email', header: 'Email', type: 'text', group: 'person' },
  { id: 'department', header: 'Department', type: 'enum', options: ['Engineering', 'Design', 'Sales', 'Support'], group: 'record' },
  { id: 'role', header: 'Role', type: 'enum', options: ['Junior', 'Mid', 'Senior', 'Staff'], group: 'record' },
  {
    id: 'salary',
    header: 'Salary',
    type: 'number',
    align: 'right',
    group: 'record',
    format: (v) => (v == null ? '—' : `$${Number(v).toLocaleString()}`),
  },
  { id: 'hiredAt', header: 'Hired', type: 'date', group: 'record' },
]

function makePeople(count: number): Person[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    name: `Person ${i + 1}`,
    email: `person${i + 1}@example.com`,
    department: ['Engineering', 'Design', 'Sales', 'Support'][i % 4]!,
    role: ['Junior', 'Mid', 'Senior', 'Staff'][(i * 7) % 4]!,
    salary: 50_000 + ((i * 7919) % 90_000),
    hiredAt: new Date(2015 + (i % 9), i % 12, 1 + (i % 28)).toISOString().slice(0, 10),
  }))
}

const rows = shallowRef<Person[]>(makePeople(300))
const state = useTableState({ pageSize: 10 })
const source = useLocalDataSource(rows, columns, state.query)
</script>

<template>
  <!-- "Employment record" starts folded — click its header to open it back up. -->
  <DataTable
    :columns="columns"
    :column-groups="columnGroups"
    :source="source"
    :state="state"
    :initial-layout="{ collapsedGroups: ['record'] }"
  />
</template>
