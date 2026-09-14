<script setup lang="ts" generic="TRow extends Record<string, unknown>">
/**
 * A small table over rows held in memory: state, source and `DataTable` in one
 * component.
 *
 * It exists because a nested table cannot be assembled in a slot — `DataTable`
 * takes a `DataSource`, and a source is a composable, which a template cannot
 * call. One component per subtable is the shape this always takes.
 */
import { computed, toRef } from 'vue'
import {
  DataTable,
  useLocalDataSource,
  useTableState,
  type ColumnDef,
} from '@brillliand/vue-table-chad'

const props = defineProps<{
  rows: TRow[]
  columns: ColumnDef<TRow>[]
  pageSize?: number
}>()

const state = useTableState({ pageSize: props.pageSize ?? 5 })
const rows = toRef(props, 'rows')
const columns = computed(() => props.columns)
const source = useLocalDataSource<TRow>(rows, columns, state.query)
</script>

<template>
  <DataTable :columns="props.columns" :source="source" :state="state" class="nested" />
</template>

<style scoped>
.nested { font-size: 12px; }
</style>
