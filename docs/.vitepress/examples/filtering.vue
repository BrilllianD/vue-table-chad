<script setup lang="ts">
import { shallowRef } from 'vue'
import {
  DataTable,
  conditionsFilter,
  useLocalDataSource,
  useTableState,
  valuesFilter,
  type ColumnDef,
} from '@brillliand/vue-table-chad'
import '@brillliand/vue-table-chad/style.css'

type Person = { id: number; name: string; department: string; salary: number; hiredAt: string }

// `type` decides the operators the popover offers: `contains` for text,
// `between` for numbers, `before`/`after` for dates, a checklist for enums.
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
    // Every 25th department is blank, so the "(Blanks)" bucket has members.
    department: i % 25 === 0 ? '' : ['Engineering', 'Design', 'Sales', 'Support'][i % 4]!,
    salary: 50_000 + ((i * 7919) % 90_000),
    hiredAt: new Date(2015 + (i % 9), i % 12, 1 + (i % 28)).toISOString().slice(0, 10),
  }))
}

const rows = shallowRef<Person[]>(makePeople(500))
const state = useTableState({ pageSize: 10 })

// `includeBlanks` is what puts the blank departments in their own
// "(Blanks)" bucket instead of dropping them silently.
state.setFilter('department', valuesFilter([], true))
state.setFilter('salary', conditionsFilter([{ operator: 'between', value: 90000, value2: 140000 }]))

const source = useLocalDataSource(rows, columns, state.query)
</script>

<template>
  <DataTable :columns="columns" :source="source" :state="state" />
</template>
