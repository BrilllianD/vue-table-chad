<script setup lang="ts">
import { shallowRef } from 'vue'
import {
  ColumnFilterPopover,
  SortTrigger,
  TableGrid,
  TableGroupRow,
  TableHeaderCell,
  TablePagination,
  TableRoot,
  TableRow,
  useLocalDataSource,
  useTableState,
} from '@brillliand/vue-table-chad'
import { makeRows, employeeColumns, type Employee } from '@fixtures'

const shown = employeeColumns.filter((c) => ['name', 'department', 'role', 'salary'].includes(c.id))

const rows = shallowRef<Employee[]>(makeRows(200))
const state = useTableState({ pageSize: 10 })
const source = useLocalDataSource<Employee>(rows, shown, state.query)
</script>

<template>
  <TableRoot
    v-slot="{ displayRows, columns }"
    :columns="shown"
    :source="source"
    :state="state"
    selectable
  >
    <TableGrid :columns="columns" selection-column>
      <thead>
        <tr>
          <TableHeaderCell v-for="column in columns" :key="column.id" :column="column">
            <SortTrigger :column-id="column.id" :label="column.header ?? column.id" />
            <ColumnFilterPopover :column-id="column.id" :type="column.type ?? 'text'" />
          </TableHeaderCell>
        </tr>
      </thead>
      <tbody>
        <template v-for="item in displayRows" :key="item.kind === 'group' ? item.group.key : item.row.id">
          <TableGroupRow v-if="item.kind === 'group'" :group="item.group" />
          <TableRow v-else :row="item.row" :columns="columns" :index="item.index" :depth="item.depth" />
        </template>
      </tbody>
    </TableGrid>
    <TablePagination />
  </TableRoot>
</template>
