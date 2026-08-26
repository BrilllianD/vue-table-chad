<script setup lang="ts">
/**
 * A primitive the library does not ship — written here to prove the context is
 * a real extension seam, not an internal detail.
 *
 * It injects the same `TableContext` every built-in primitive uses, so it drops
 * into any `<TableRoot>` (and therefore into `<DataTable>`'s slots) with no
 * props at all. `useTableContext` rather than `requireTableContext`, so it
 * degrades to a hint instead of throwing when someone misplaces it.
 */
import { computed } from 'vue'
import { useTableContext } from '@brillliand/vue-table-chad'
import type { Employee } from '../data/dataset'

const context = useTableContext<Employee>()

const summary = computed(() => {
  if (!context) return undefined
  const { state, source, selection, pagination, columns } = context
  return {
    showing: `${pagination.firstRow.value}–${pagination.lastRow.value} of ${source.total.value}`,
    sort:
      state.sort.value.length === 0
        ? 'unsorted'
        : state.sort.value.map((rule) => `${rule.columnId} ${rule.direction}`).join(' → '),
    filters: state.activeFilterIds.value.length,
    selected: selection.value?.count.value ?? 0,
    hidden: columns.all.value.filter((column) => !column.visible).length,
    remote: source.remote,
  }
})
</script>

<template>
  <p v-if="summary" class="status">
    <span>{{ summary.showing }}</span>
    <span>·</span>
    <span>{{ summary.sort }}</span>
    <span>·</span>
    <span>{{ summary.filters }} filters</span>
    <span>·</span>
    <span>{{ summary.selected }} selected</span>
    <span>·</span>
    <span>{{ summary.hidden }} columns hidden</span>
    <span class="tag">{{ summary.remote ? 'server' : 'local' }}</span>
  </p>
  <p v-else class="status">TableStatus needs a &lt;TableRoot&gt; ancestor.</p>
</template>

<style scoped>
.status {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin: 0;
  font-size: 12.5px;
  opacity: 0.75;
  font-variant-numeric: tabular-nums;
}
.tag {
  margin-left: 4px;
  padding: 0 6px;
  border-radius: 999px;
  background: rgb(37 99 235 / 0.15);
  color: var(--accent);
  opacity: 1;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
</style>
