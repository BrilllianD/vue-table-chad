<script setup lang="ts">
/** One `<td>`, sharing the header's sticky/pin logic so columns stay aligned. */
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
  <td
    class="vt-td"
    :style="stickyStyle"
    :data-column="column.id"
    :data-align="column.align ?? 'left'"
    :data-pinned="column.pinned || undefined"
  >
    <slot />
  </td>
</template>
