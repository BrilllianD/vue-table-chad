<script setup lang="ts">
import { shallowRef } from 'vue'
import { DataTable, useLocalDataSource, useTableState, type ColumnDef } from '@brillliand/vue-table-chad'
import '@brillliand/vue-table-chad/style.css'

type Person = { id: number; name: string; department: string; role: string; city: string; country: string; salary: number }

/*
 * Three sizing rules in one column list. A declared `width` is exactly that.
 * `city` and `country` declare none and are measured from what they hold — a
 * country name is narrower than 160px, a `role` title is not. `role` has
 * `flex` instead and takes whatever space the rest of the table leaves over.
 */
const columns: ColumnDef<Person>[] = [
  { id: 'name', header: 'Name', type: 'text', pinned: 'left', width: 160, hideable: false },
  { id: 'department', header: 'Department', type: 'enum', options: ['Engineering', 'Design', 'Sales', 'Support'], width: 140 },
  { id: 'role', header: 'Role', type: 'text', flex: true, minWidth: 120 },
  { id: 'city', header: 'City', type: 'text' },
  { id: 'country', header: 'Country', type: 'text' },
  {
    id: 'salary',
    header: 'Salary',
    type: 'number',
    align: 'right',
    width: 120,
    format: (v) => (v == null ? '—' : `$${Number(v).toLocaleString()}`),
  },
]

function makePeople(count: number): Person[] {
  const roles = ['Senior Software Engineer', 'Product Designer', 'Account Executive', 'Support Lead']
  const places = [
    ['Berlin', 'Germany'],
    ['Lisbon', 'Portugal'],
    ['Austin', 'USA'],
    ['Toronto', 'Canada'],
    ['Osaka', 'Japan'],
  ]
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    name: `Person ${i + 1}`,
    department: ['Engineering', 'Design', 'Sales', 'Support'][i % 4]!,
    role: roles[i % 4]!,
    city: places[i % places.length]![0]!,
    country: places[i % places.length]![1]!,
    salary: 50_000 + ((i * 7919) % 90_000),
  }))
}

const rows = shallowRef<Person[]>(makePeople(300))
const state = useTableState({ pageSize: 10 })
const source = useLocalDataSource(rows, columns, state.query)
</script>

<template>
  <!--
    `name` is pinned left and cannot be hidden. Open "Columns ▾" to hide
    another, drag a header to reorder it, and drag a column edge to resize —
    `storage-key` writes every change to localStorage, so it survives a
    reload.

    Narrow the window and the flexible `role` column gives up its space first;
    widen it and the same column takes it back. Hide enough columns and the
    table stops short of the right edge rather than stretching what is left.
  -->
  <DataTable
    :columns="columns"
    :source="source"
    :state="state"
    storage-key="vue-table-chad-docs:column-layout"
  />
</template>
