<script setup lang="ts">
/**
 * Show/hide columns, reorder them, and pin them to either edge. Reordering is
 * button-driven rather than drag-only so it stays keyboard-accessible.
 */
import { computed, ref } from 'vue'
import { requireTableContext, useTableLabels } from '../../core/context'
import type { PinSide } from '../../core/types'
import SelectionCheckbox from './SelectionCheckbox.vue'
import { refocusAfterMove, useMenuDismiss } from './useMenuDismiss'

const props = defineProps<{
  /** The trigger's text. Defaults to the table's `columns` label. */
  label?: string
}>()

const context = requireTableContext('ColumnVisibilityMenu')
const labels = useTableLabels()
/** The prop wins; the record is only where its default comes from. */
const triggerLabel = computed(() => props.label ?? labels.value.columns)
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

async function move(event: MouseEvent, columnId: string, delta: number): Promise<void> {
  const order = columns.value.map((column) => column.id)
  const index = order.indexOf(columnId)
  context.columns.moveColumn(columnId, index + delta)
  // Reordering re-inserts this row, which costs the button its focus.
  await refocusAfterMove(event.currentTarget as HTMLElement, delta)
}

function cyclePin(columnId: string, current: PinSide | false): void {
  const next: PinSide | false = current === false ? 'left' : current === 'left' ? 'right' : false
  context.columns.setPinned(columnId, next)
}

const onFocusOut = useMenuDismiss(open, (node) => Boolean(root.value?.contains(node)))
</script>

<template>
  <div ref="root" class="vt-columns-menu" @focusout="onFocusOut" @keydown.esc="open = false">
    <button type="button" class="vt-btn" :aria-expanded="open" @click="open = !open">
      {{ triggerLabel }} ▾
    </button>

    <div v-if="open" class="vt-columns-panel" role="dialog" :aria-label="labels.columnOptions">
      <!-- The actions lead, because the row list below grows with the column count. -->
      <div class="vt-columns-actions">
        <button type="button" class="vt-btn vt-btn-link" @click="context.columns.showAll()">
          {{ labels.showAll }}
        </button>
        <button type="button" class="vt-btn vt-btn-link" @click="context.columns.resetLayout()">
          {{ labels.resetLayout }}
        </button>
      </div>

      <div v-for="(column, index) in columns" :key="column.id" class="vt-columns-row">
        <SelectionCheckbox
          :checked="column.visible"
          :disabled="!canHide(column.id)"
          :label="labels.showColumn(column.header ?? column.id)"
          @change="context.columns.toggleVisibility(column.id)"
        />
        <span class="vt-columns-label">{{ column.header ?? column.id }}</span>

        <button
          type="button"
          class="vt-btn vt-btn-icon"
          :disabled="index === 0"
          :aria-label="labels.moveUp"
          @click="move($event, column.id, -1)"
        >
          ↑
        </button>
        <button
          type="button"
          class="vt-btn vt-btn-icon"
          :disabled="index === columns.length - 1"
          :aria-label="labels.moveDown"
          @click="move($event, column.id, 1)"
        >
          ↓
        </button>
        <button
          type="button"
          class="vt-btn vt-btn-icon"
          :data-active="!!column.pinned || undefined"
          :title="labels.pinState(column.pinned || 'none')"
          :aria-label="labels.pinColumn(column.header ?? column.id)"
          @click="cyclePin(column.id, column.pinned)"
        >
          {{ column.pinned === 'left' ? '⇤' : column.pinned === 'right' ? '⇥' : '⇔' }}
        </button>
      </div>
    </div>
  </div>
</template>
