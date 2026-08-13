<script setup lang="ts">
/**
 * Show/hide columns, reorder them, and pin them to either edge. Reordering is
 * button-driven rather than drag-only so it stays keyboard-accessible.
 */
import { computed, ref } from 'vue'
import { requireTableContext } from '../../core/context'
import type { PinSide } from '../../core/types'
import SelectionCheckbox from './SelectionCheckbox.vue'

const props = withDefaults(defineProps<{ label?: string }>(), { label: 'Columns' })

const context = requireTableContext('ColumnVisibilityMenu')
const open = ref(false)
const root = ref<HTMLElement | null>(null)

const columns = computed(() => context.columns.all.value)
/** Never let the user hide the last visible column. */
const visibleCount = computed(() => columns.value.filter((column) => column.visible).length)

function canHide(columnId: string): boolean {
  const column = columns.value.find((entry) => entry.id === columnId)
  if (!column) return false
  if (column.hideable === false) return false
  return !(column.visible && visibleCount.value <= 1)
}

function move(columnId: string, delta: number): void {
  const order = columns.value.map((column) => column.id)
  const index = order.indexOf(columnId)
  context.columns.moveColumn(columnId, index + delta)
}

function cyclePin(columnId: string, current: PinSide | false): void {
  const next: PinSide | false = current === false ? 'left' : current === 'left' ? 'right' : false
  context.columns.setPinned(columnId, next)
}

function onFocusOut(event: FocusEvent): void {
  const next = event.relatedTarget as Node | null
  if (next && root.value?.contains(next)) return
  open.value = false
}
</script>

<template>
  <div ref="root" class="vt-columns-menu" @focusout="onFocusOut" @keydown.esc="open = false">
    <button type="button" class="vt-btn" :aria-expanded="open" @click="open = !open">
      {{ props.label }} ▾
    </button>

    <div v-if="open" class="vt-columns-panel" role="dialog" aria-label="Column options">
      <div v-for="(column, index) in columns" :key="column.id" class="vt-columns-row">
        <SelectionCheckbox
          :checked="column.visible"
          :disabled="!canHide(column.id)"
          :label="`Show ${column.header ?? column.id}`"
          @change="context.columns.toggleVisibility(column.id)"
        />
        <span class="vt-columns-label">{{ column.header ?? column.id }}</span>

        <button
          type="button"
          class="vt-btn vt-btn-icon"
          :disabled="index === 0"
          aria-label="Move up"
          @click="move(column.id, -1)"
        >
          ↑
        </button>
        <button
          type="button"
          class="vt-btn vt-btn-icon"
          :disabled="index === columns.length - 1"
          aria-label="Move down"
          @click="move(column.id, 1)"
        >
          ↓
        </button>
        <button
          type="button"
          class="vt-btn vt-btn-icon"
          :data-active="!!column.pinned || undefined"
          :title="`Pin: ${column.pinned || 'none'}`"
          :aria-label="`Pin ${column.header ?? column.id}`"
          @click="cyclePin(column.id, column.pinned)"
        >
          {{ column.pinned === 'left' ? '⇤' : column.pinned === 'right' ? '⇥' : '⇔' }}
        </button>
      </div>

      <div class="vt-columns-actions">
        <button type="button" class="vt-btn vt-btn-link" @click="context.columns.showAll()">
          Show all
        </button>
        <button type="button" class="vt-btn vt-btn-link" @click="context.columns.resetLayout()">
          Reset layout
        </button>
      </div>
    </div>
  </div>
</template>
