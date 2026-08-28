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
      --vtc-accent: #7c3aed;
      --vtc-bg: #ffffff;
      --vtc-bg-header: #faf5ff;
      --vtc-text: #1f2937;
      --vtc-text-muted: #6b7280;
      --vtc-border: #e5e7eb;
      --vtc-row-height: 40px;
      --vtc-radius: 8px;
      /* Row striping is two variables; equal values mean no stripes. */
      --vtc-bg-row-odd: #ffffff;
      --vtc-bg-row-even: #fafafa;
    "
  >
    <DataTable :columns="employeeColumns" :source="source" :state="state" />
  </div>
</template>
