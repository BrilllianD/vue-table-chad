<script setup lang="ts">
/**
 * `TableRoot`, rebuilt again — this time in three lines.
 *
 * `MiniRoot.vue` beside this one assembles a `TableContext` field by field, to
 * show that it is a plain object with no ceremony behind it. This is the other
 * end of the same seam: `useTable()` builds that whole object in one call, and
 * it lives in `core/`, so none of the wiring involves a component.
 *
 * Which leaves a component with exactly two jobs, and they are the two things
 * only a component can do: `provide`, and turning a change into an emit. That
 * is all the library's own `TableRoot` is, too.
 */
import {
  provideTableContext,
  useLocalDataSource,
  useTable,
  useTableState,
  type ColumnDef,
} from '@brillliand/vue-table-chad'
import { toRef } from 'vue'
import type { Employee } from '../data/dataset'

const props = defineProps<{
  columns: ColumnDef<Employee>[]
  rows: Employee[]
  pageSize?: number
}>()

const state = useTableState({ pageSize: props.pageSize ?? 4 })
const source = useLocalDataSource<Employee>(
  toRef(props, 'rows'),
  () => props.columns,
  state.query,
)

const table = useTable<Employee>({
  columns: () => props.columns,
  source: () => source,
  state,
  selectable: () => true,
  getRowId: (row) => row.id,
})

provideTableContext(table)
</script>

<template>
  <slot :rows="table.rows.value" :selection="table.rowSelection" :table="table" />
</template>
