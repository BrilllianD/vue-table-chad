<script setup lang="ts">
import { shallowRef } from 'vue'
import { DataTable, useLocalDataSource, useTableState } from '@brillliand/vue-table-chad'
import { makeRows, employeeColumns, type Employee } from '@fixtures'

const rows = shallowRef<Employee[]>(makeRows(400))
const state = useTableState({ pageSize: 8 })
const source = useLocalDataSource<Employee>(rows, employeeColumns, state.query)
</script>

<template>
  <DataTable :columns="employeeColumns" :source="source" :state="state" selectable="multiple">
    <template #toolbar="{ selection }">
      <strong>{{ selection?.count.value ?? 0 }} selected</strong>
      — tick a row's checkbox, then shift-click another to take the range in
      between. Clicking the row itself does not select; that gesture is left to
      the caller. The header checkbox goes indeterminate as soon as some, but
      not all, of the page is selected.
    </template>
  </DataTable>
</template>
