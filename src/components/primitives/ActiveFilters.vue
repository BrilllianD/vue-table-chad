<script setup lang="ts">
/**
 * Chips summarising what is currently filtered. Without this, a filter set on a
 * column that later got hidden or scrolled away is invisible and unexplainable.
 */
import { computed } from 'vue'
import { requireTableContext } from '../../core/context'
import type { ColumnFilter } from '../../core/types'
import { OPERATOR_LABELS, isUnaryOperator } from '../../core/filters/model'

const context = requireTableContext('ActiveFilters')

const chips = computed(() =>
  context.state.activeFilterIds.value.map((columnId) => {
    const column = context.columns.all.value.find((entry) => entry.id === columnId)
    return {
      columnId,
      label: column?.header ?? columnId,
      summary: describe(context.state.filters.value[columnId]!),
    }
  }),
)

function describe(filter: ColumnFilter): string {
  if (filter.kind === 'values') {
    const count = filter.include?.length ?? 0
    if (count === 0) return filter.includeBlanks ? 'blanks only' : 'none'
    if (count <= 2) return filter.include!.map((v) => String(v)).join(', ')
    return `${count} values`
  }
  return filter.rules
    .map((rule) =>
      isUnaryOperator(rule.operator)
        ? OPERATOR_LABELS[rule.operator]
        : `${OPERATOR_LABELS[rule.operator]} ${rule.value}${
            rule.value2 !== undefined && rule.value2 !== '' ? ` and ${rule.value2}` : ''
          }`,
    )
    .join(` ${filter.op} `)
}
</script>

<template>
  <div v-if="chips.length" class="vt-chips">
    <span
      v-for="chip in chips"
      :key="chip.columnId"
      class="vt-chip"
      :title="`${chip.label}: ${chip.summary}`"
    >
      <strong>{{ chip.label }}</strong>
      <span class="vt-chip-summary">{{ chip.summary }}</span>
      <button
        type="button"
        class="vt-chip-remove"
        :aria-label="`Clear filter on ${chip.label}`"
        @click="context.state.clearFilter(chip.columnId)"
      >
        ×
      </button>
    </span>
    <button type="button" class="vt-btn vt-btn-link" @click="context.state.clearAllFilters()">
      Clear all
    </button>
  </div>
</template>
