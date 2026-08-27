<script setup lang="ts">
import { shallowRef } from 'vue'
import { DataTable, useLocalDataSource, useTableState } from '@brillliand/vue-table-chad'
import { makeRows, employeeColumnGroups, groupedEmployeeColumns, type Employee } from '@fixtures'

const rows = shallowRef<Employee[]>(makeRows(300))
const state = useTableState({ pageSize: 8 })
const source = useLocalDataSource<Employee>(rows, groupedEmployeeColumns, state.query)
</script>

<template>
  <!-- "Employment record" starts folded — click its header to open it back up. -->
  <DataTable
    :columns="groupedEmployeeColumns"
    :column-groups="employeeColumnGroups"
    :source="source"
    :state="state"
    :initial-layout="{ collapsedGroups: ['record'] }"
  />
</template>
