<script setup lang="ts">
/**
 * The batteries-included case: local array in, full table out.
 * Sorting, Excel filters, pagination, selection and column layout — 6 lines.
 */
import { ref } from 'vue'
import { DataTable, useLocalDataSource, useTableState } from '@sandbox/vue-table'
import { employees, type Employee } from '../../mock/fakeApi'
import { employeeColumns } from '../columns'

const rows = ref(employees.slice(0, 500))
const state = useTableState({ pageSize: 25 })
const source = useLocalDataSource<Employee>(rows, employeeColumns, state.query)

const selected = ref<(string | number)[]>([])
</script>

<template>
  <section>
    <h2>Local data</h2>
    <p class="hint">
      500 rows held in memory. Shift-click a header to build a multi-sort; the funnel icon opens the
      Excel-style filter.
    </p>

    <DataTable
      :columns="employeeColumns"
      :source="source"
      :state="state"
      selectable
      @update:selection="selected = $event"
    >
      <template #cell:active="{ value }">
        <span :class="['pill', value ? 'pill-on' : 'pill-off']">{{ value ? 'Active' : 'Inactive' }}</span>
      </template>
    </DataTable>

    <p v-if="selected.length" class="hint">Selected ids: {{ selected.slice(0, 12).join(', ') }}…</p>
  </section>
</template>
