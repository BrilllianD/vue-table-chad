<script setup lang="ts">
import { shallowRef } from 'vue'
import { DataTable, useLocalDataSource, useTableState } from '@brillliand/vue-table-chad'
import { makeRows, employeeColumns, type Employee } from '@fixtures'

const rows = shallowRef<Employee[]>(makeRows(60))
const state = useTableState({ pageSize: 10 })
const source = useLocalDataSource<Employee>(rows, employeeColumns, state.query)
</script>

<template>
  <div
    class="my-table"
    style="
      --vt-accent: #7c3aed;
      --vt-bg: #ffffff;
      --vt-bg-header: #faf5ff;
      --vt-text: #1f2937;
      --vt-text-muted: #6b7280;
      --vt-border: #e5e7eb;
      --vt-row-height: 40px;
      --vt-radius: 8px;
      /* Row striping is two variables; equal values mean no stripes. */
      --vt-bg-row-odd: #ffffff;
      --vt-bg-row-even: #fafafa;
    "
  >
    <DataTable :columns="employeeColumns" :source="source" :state="state" />
  </div>
</template>
