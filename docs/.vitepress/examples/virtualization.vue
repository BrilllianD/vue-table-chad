<script setup lang="ts">
import { shallowRef } from 'vue'
import { DataTable, useLocalDataSource, useTableState } from '@brillliand/vue-table-chad'
import { makeRows, employeeColumns, type Employee } from '@fixtures'

const rows = shallowRef<Employee[]>(makeRows(100_000))
const state = useTableState({ pageSize: 25 })
const source = useLocalDataSource<Employee>(rows, employeeColumns, state.query)
</script>

<template>
  <DataTable
    :columns="employeeColumns"
    :source="source"
    :state="state"
    virtual
    :row-height="38"
    :overscan="8"
  />
</template>
