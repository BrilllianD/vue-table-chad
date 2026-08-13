<script setup lang="ts">
/**
 * The `<table>` element itself, plus a `<colgroup>` driven by resolved widths
 * so column sizing survives resizing and pinning without per-cell inline styles.
 */
import { computed } from 'vue'
import { useTableContext } from '../../core/context'
import type { ResolvedColumn } from '../../core/types'

const props = defineProps<{
  /** Overrides the injected columns, for standalone use. */
  columns?: ResolvedColumn<never>[]
  /** Adds a leading narrow column for selection checkboxes. */
  selectionColumn?: boolean
  layout?: 'auto' | 'fixed'
}>()

const context = useTableContext()
const columns = computed(() => props.columns ?? context?.visibleColumns.value ?? [])
</script>

<template>
  <table class="vt-table" :data-layout="layout ?? 'fixed'">
    <colgroup>
      <col v-if="selectionColumn" class="vt-col-selection" />
      <col
        v-for="column in columns"
        :key="column.id"
        :style="column.resolvedWidth ? { width: `${column.resolvedWidth}px` } : undefined"
      />
    </colgroup>
    <slot />
  </table>
</template>
