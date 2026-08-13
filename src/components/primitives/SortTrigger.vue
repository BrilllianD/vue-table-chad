<script setup lang="ts">
/**
 * Header button that cycles asc → desc → unsorted.
 *
 * Shift-click (or ctrl/cmd) appends to the multi-sort instead of replacing it,
 * and the badge shows the column's position in that ordering.
 */
import { computed } from 'vue'
import { useTableContext } from '../../core/context'
import type { SortDirection } from '../../core/types'

const props = defineProps<{
  columnId: string
  label?: string
  /** Stand-ins for the context, so this works outside a TableRoot. */
  direction?: SortDirection | false
  index?: number
  disabled?: boolean
}>()

const emit = defineEmits<{ toggle: [columnId: string, additive: boolean] }>()

const context = useTableContext()

const direction = computed(() => props.direction ?? context?.state.sortFor(props.columnId) ?? false)
const index = computed(() => props.index ?? context?.state.sortIndexFor(props.columnId) ?? 0)
/** Only worth showing a rank when more than one key is active. */
const showIndex = computed(() => index.value > 0 && (context?.state.sort.value.length ?? 0) > 1)

function onClick(event: MouseEvent | KeyboardEvent): void {
  if (props.disabled) return
  const additive = event.shiftKey || event.ctrlKey || event.metaKey
  emit('toggle', props.columnId, additive)
  context?.state.toggleSort(props.columnId, additive)
}
</script>

<template>
  <button
    type="button"
    class="vt-sort"
    :disabled="disabled"
    :data-direction="direction || 'none'"
    :title="`Sort by ${label ?? columnId} (shift-click to add to multi-sort)`"
    @click="onClick"
  >
    <span class="vt-sort-label"><slot>{{ label ?? columnId }}</slot></span>
    <span class="vt-sort-icon" aria-hidden="true">
      <template v-if="direction === 'asc'">▲</template>
      <template v-else-if="direction === 'desc'">▼</template>
      <template v-else>⇅</template>
    </span>
    <span v-if="showIndex" class="vt-sort-index">{{ index }}</span>
  </button>
</template>
