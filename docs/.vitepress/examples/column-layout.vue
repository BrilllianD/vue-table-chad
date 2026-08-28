<script setup lang="ts">
import { shallowRef } from 'vue'
import { DataTable, useLocalDataSource, useTableState } from '@brillliand/vue-table-chad'
import { makeRows, employeeColumns, type Employee } from '@fixtures'

const rows = shallowRef<Employee[]>(makeRows(300))
const state = useTableState({ pageSize: 10 })
const source = useLocalDataSource<Employee>(rows, employeeColumns, state.query)
</script>

<template>
  <!--
    `name` is `pinned: 'left'` in employeeColumns. Open "Columns ▾" to hide
    one, drag a header to reorder it, and drag a column edge to resize —
    `storage-key` writes every change to localStorage, so it survives a
    reload.
  -->
  <DataTable
    :columns="employeeColumns"
    :source="source"
    :state="state"
    storage-key="vue-table-chad-docs:column-layout"
  />
</template>
