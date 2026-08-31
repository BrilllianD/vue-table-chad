<script setup lang="ts">
import { shallowRef } from 'vue'
import { DataTable, useLocalDataSource, useTableState } from '@brillliand/vue-table-chad'
import { makeRows, employeeColumns, type Employee } from '@fixtures'

const rows = shallowRef<Employee[]>(makeRows(300))
const state = useTableState({ pageSize: 10 })

/*
 * The shared fixture declares a width on all eleven columns, which is exactly
 * why the sizing defaults used to be invisible. Three columns here do not:
 * `city` and `country` are measured from what they hold — a country name is
 * narrower than 160px, a `role` title is not — and `role` takes whatever space
 * the rest of the table leaves over.
 */
const columns = employeeColumns.map((column) =>
  column.id === 'role'
    ? { ...column, width: undefined, flex: true }
    : column.id === 'city' || column.id === 'country'
      ? { ...column, width: undefined }
      : column,
)

const source = useLocalDataSource<Employee>(rows, columns, state.query)
</script>

<template>
  <!--
    `name` is `pinned: 'left'` in employeeColumns. Open "Columns ▾" to hide
    one, drag a header to reorder it, and drag a column edge to resize —
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
