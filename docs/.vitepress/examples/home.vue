<script setup lang="ts">
import { shallowRef } from 'vue'
import { DataTable, useLocalDataSource, useTableState, type ColumnDef } from '@brillliand/vue-table-chad'
import '@brillliand/vue-table-chad/style.css'

type Person = { id: number; name: string; department: string; salary: number; hiredAt: string }

// `type` is the whole configuration here: it picks the comparator a header
// click sorts with, the operators the filter popover offers, and the way a
// value is read when the search box matches against it.
const columns: ColumnDef<Person>[] = [
  // A declared width, where the other pages let the measurement decide: the
  // measured clamp sizes to the cells, and "Person 1" comes out one pixel
  // narrower than the header's own label plus its sort and filter controls, so
  // "Name" renders ellipsised. One pixel, and invisible anywhere but the
  // first table a reader sees.
  { id: 'name', header: 'Name', type: 'text', width: 140, pinned: 'left' },
  { id: 'department', header: 'Department', type: 'enum', options: ['Engineering', 'Design', 'Sales', 'Support'] },
  {
    id: 'salary',
    header: 'Salary',
    type: 'number',
    align: 'right',
    // `aggregate` is what gives the footer and any group row a number to show.
    aggregate: 'sum',
    format: (v) => (v == null ? '—' : `$${Number(v).toLocaleString()}`),
    // `format` cannot stand in for a sum — it is handed a row, and a sum has
    // none — so the currency has to be said a second time for the total.
    aggregateFormat: (r) => `$${Number(r.value).toLocaleString()}`,
  },
  { id: 'hiredAt', header: 'Hired', type: 'date' },
]

// Stand-in for your own data. Deterministic, so a reload shows the same table.
function makePeople(count: number): Person[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    name: `Person ${i + 1}`,
    department: ['Engineering', 'Design', 'Sales', 'Support'][i % 4]!,
    salary: 50_000 + ((i * 7919) % 90_000),
    hiredAt: new Date(2015 + (i % 9), i % 12, 1 + (i % 28)).toISOString().slice(0, 10),
  }))
}

// shallowRef, not ref: a plain ref proxies every row object, and every cell
// read during a filter or sort then goes through a Proxy trap.
const rows = shallowRef<Person[]>(makePeople(200))
// No `pageSize`: the default 10 is also the first option the rows-per-page
// select offers, and a size that is not one of its options leaves the select
// showing a number the table is not using.
const state = useTableState()
const source = useLocalDataSource(rows, columns, state.query)
</script>

<template>
  <!--
    The toolbar, the search box, the columns and group menus and the pager are
    all on by default, so the props here are only the three that are not:
    checkboxes, the aggregate footer, and draggable headers.
  -->
  <DataTable
    :columns="columns"
    :source="source"
    :state="state"
    selectable
    show-footer
    reorderable
  />
</template>
