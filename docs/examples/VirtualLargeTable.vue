<!--
  100k rows, virtual, two pinned columns and a collapsed group all at once —
  the combination P2-6's acceptance run measured (bench/BASELINE.md, "What
  the browser said"): 16.5ms median frame time scrolling continuously,
  against a 16.4ms flat baseline with nothing pinned or grouped. Pinning and
  a collapsed group cost nothing over the flat case, because pinning is a
  per-cell offset the scroll window never reads, and a collapsed band is
  simply a shorter list for the window to slice.
-->
<script setup lang="ts">
import { shallowRef } from 'vue'
import { DataTable, useLocalDataSource, useTableState } from '@brillliand/vue-table-chad'
import { makeRows, groupedEmployeeColumns, employeeColumnGroups, type Employee } from '@fixtures'

const rows = shallowRef<Employee[]>(makeRows(100_000))

const state = useTableState({ pageSize: 25, initialGroupBy: ['department'] })
const source = useLocalDataSource<Employee>(rows, groupedEmployeeColumns, state.query)
</script>

<template>
  <DataTable
    :columns="groupedEmployeeColumns"
    :column-groups="employeeColumnGroups"
    :source="source"
    :state="state"
    virtual
    :row-height="38"
    :overscan="8"
    :initial-layout="{ collapsedGroups: ['record'] }"
  />
</template>
