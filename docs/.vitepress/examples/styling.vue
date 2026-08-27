<script setup lang="ts">
import { shallowRef } from 'vue'
import { DataTable, useLocalDataSource, useTableState } from '@brillliand/vue-table-chad'
import { makeRows, employeeColumns, type Employee } from '@fixtures'

const rows = shallowRef<Employee[]>(makeRows(60))
const state = useTableState({ pageSize: 10, initialSort: [{ columnId: 'name', direction: 'asc' }] })
const source = useLocalDataSource<Employee>(rows, employeeColumns, state.query)
</script>

<template>
  <!--
    Every override lives on the wrapping element, not on DataTable — the
    stylesheet hangs entirely off custom properties, so a component never
    needs to know a theme exists. `name` is `pinned: 'left'` in
    employeeColumns: scroll the table sideways to watch its background stay
    opaque over the stripe scrolling underneath it.
  -->
  <div
    style="
      --vt-accent: #7c3aed;
      --vt-bg-row-even: #f4f0fb;
      --vt-radius: 10px;
    "
  >
    <DataTable :columns="employeeColumns" :source="source" :state="state" />
  </div>
</template>
