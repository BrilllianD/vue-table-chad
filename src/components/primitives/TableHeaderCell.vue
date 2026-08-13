<script setup lang="ts">
/**
 * One `<th>`. Carries sort/pin/filter state as data-attributes and leaves all
 * interactive bits (sort trigger, filter popover, resize handle) to slots.
 */
import { computed } from 'vue'
import type { ResolvedColumn } from '../../core/types'

const props = defineProps<{
  column: ResolvedColumn<never>
}>()

const stickyStyle = computed(() => {
  if (!props.column.pinned) return undefined
  return props.column.pinned === 'left'
    ? { left: `${props.column.pinOffset}px` }
    : { right: `${props.column.pinOffset}px` }
})
</script>

<template>
  <th
    class="vt-th"
    scope="col"
    :style="stickyStyle"
    :data-column="column.id"
    :data-align="column.align ?? 'left'"
    :data-pinned="column.pinned || undefined"
    :data-sorted="column.sortDirection || undefined"
    :data-filtered="column.hasFilter || undefined"
    :aria-sort="
      column.sortDirection === 'asc'
        ? 'ascending'
        : column.sortDirection === 'desc'
          ? 'descending'
          : 'none'
    "
  >
    <div class="vt-th-inner">
      <slot :column="column">{{ column.header ?? column.id }}</slot>
    </div>
    <slot name="resize" :column="column" />
  </th>
</template>
