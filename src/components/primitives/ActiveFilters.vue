<script setup lang="ts">
/**
 * Chips summarising what is currently filtered. Without this, a filter set on a
 * column that later got hidden or scrolled away is invisible and unexplainable.
 */
import { computed } from 'vue'
import { requireTableContext, useTableLabels } from '../../core/context'
import type { ColumnFilter } from '../../core/types'
import { isUnaryOperator } from '../../core/filters/model'

const context = requireTableContext('ActiveFilters')
const labels = useTableLabels()

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
  const words = labels.value
  if (filter.kind === 'values') {
    const count = filter.include?.length ?? 0
    if (count === 0) return filter.includeBlanks ? words.filterBlanksOnly : words.filterNone
    if (count <= 2) return filter.include!.map((v) => String(v)).join(', ')
    return words.valueCount(count)
  }
  return filter.rules
    .map((rule) =>
      isUnaryOperator(rule.operator)
        ? words.operators[rule.operator]
        : `${words.operators[rule.operator]} ${rule.value}${
            rule.value2 !== undefined && rule.value2 !== ''
              ? ` ${words.conditionAnd} ${rule.value2}`
              : ''
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
      :title="labels.filterChip(chip.label, chip.summary)"
    >
      <strong>{{ chip.label }}</strong>
      <span class="vt-chip-summary">{{ chip.summary }}</span>
      <button
        type="button"
        class="vt-chip-remove"
        :aria-label="labels.clearFilterOn(chip.label)"
        @click="context.state.clearFilter(chip.columnId)"
      >
        ×
      </button>
    </span>
    <button type="button" class="vt-btn vt-btn-link" @click="context.state.clearAllFilters()">
      {{ labels.clearAll }}
    </button>
  </div>
</template>
