<script setup lang="ts">
/**
 * Picks which columns rows are grouped by, and in which order.
 *
 * Hidden columns are offered too: grouping by a column and then hiding it is
 * the usual way to stop repeating the same value in every row of a band.
 */
import { computed, ref } from 'vue'
import { requireTableContext, useTableLabels } from '../../core/context'
import SelectionCheckbox from './SelectionCheckbox.vue'
import { refocusAfterMove, useMenuDismiss } from './useMenuDismiss'

const props = defineProps<{
  /** The trigger's text. Defaults to the table's `groupBy` label. */
  label?: string
}>()

const context = requireTableContext('RowGroupMenu')
const labels = useTableLabels()
/** The prop wins; the record is only where its default comes from. */
const triggerLabel = computed(() => props.label ?? labels.value.groupBy)
const open = ref(false)
const root = ref<HTMLElement | null>(null)

const state = context.state

const candidates = computed(() =>
  context.columns.all.value.filter((column) => column.groupable !== false),
)

/** The active levels, outermost first — the order the panel lets you shuffle. */
const levels = computed(() =>
  state.groupBy.value.map((columnId) => ({
    columnId,
    label:
      context.columns.all.value.find((column) => column.id === columnId)?.header ?? columnId,
  })),
)

async function move(event: MouseEvent, columnId: string, delta: number): Promise<void> {
  const order = [...state.groupBy.value]
  const index = order.indexOf(columnId)
  const target = index + delta
  if (index === -1 || target < 0 || target >= order.length) return
  order.splice(index, 1)
  order.splice(target, 0, columnId)
  state.setGroupBy(order)
  // Reordering re-inserts this level, which costs the button its focus.
  await refocusAfterMove(event.currentTarget as HTMLElement, delta)
}

const onFocusOut = useMenuDismiss(open, (node) => Boolean(root.value?.contains(node)))
</script>

<template>
  <div ref="root" class="vt-group-menu" @focusout="onFocusOut" @keydown.esc="open = false">
    <div class="vt-group-trigger">
      <button
        type="button"
        class="vt-btn"
        :data-active="state.hasGrouping.value || undefined"
        :aria-expanded="open"
        @click="open = !open"
      >
        {{ triggerLabel }}
        <span v-if="state.hasGrouping.value" class="vt-group-badge">{{
          state.groupBy.value.length
        }}</span>
        ▾
      </button>

      <!--
        Expanding or collapsing every band is the gesture that gets repeated, so it sits
        outside the panel: behind the dropdown it costs an open and a dismiss every time.
        The panel keeps its worded copies, which is where the first-time reader looks.
      -->
      <button
        type="button"
        class="vt-btn vt-btn-icon"
        :disabled="!state.hasGrouping.value"
        :aria-label="labels.expandAllGroups"
        @click="context.grouping?.expandAll()"
      >
        +
      </button>
      <button
        type="button"
        class="vt-btn vt-btn-icon"
        :disabled="!state.hasGrouping.value"
        :aria-label="labels.collapseAllGroups"
        @click="context.grouping?.collapseAll()"
      >
        −
      </button>
    </div>

    <div v-if="open" class="vt-group-panel" role="dialog" :aria-label="labels.groupingOptions">
      <!-- The actions lead, because the option list below grows with the column count. -->
      <div class="vt-group-actions">
        <button
          type="button"
          class="vt-btn vt-btn-link"
          :disabled="!state.hasGrouping.value"
          @click="context.grouping?.expandAll()"
        >
          {{ labels.expandAll }}
        </button>
        <button
          type="button"
          class="vt-btn vt-btn-link"
          :disabled="!state.hasGrouping.value"
          @click="context.grouping?.collapseAll()"
        >
          {{ labels.collapseAll }}
        </button>
        <button
          type="button"
          class="vt-btn vt-btn-link"
          :disabled="!state.hasGrouping.value"
          @click="state.clearGrouping()"
        >
          {{ labels.clear }}
        </button>
      </div>

      <!-- Active levels next, because their order is the thing being edited. -->
      <ol v-if="state.hasGrouping.value" class="vt-group-levels">
        <li v-for="(level, index) in levels" :key="level.columnId" class="vt-group-level">
          <span class="vt-group-level-index">{{ index + 1 }}</span>
          <span class="vt-group-level-label">{{ level.label }}</span>
          <button
            type="button"
            class="vt-btn vt-btn-icon"
            :disabled="index === 0"
            :aria-label="labels.moveUpLevel"
            @click="move($event, level.columnId, -1)"
          >
            ↑
          </button>
          <button
            type="button"
            class="vt-btn vt-btn-icon"
            :disabled="index === levels.length - 1"
            :aria-label="labels.moveDownLevel"
            @click="move($event, level.columnId, 1)"
          >
            ↓
          </button>
          <button
            type="button"
            class="vt-btn vt-btn-icon"
            :aria-label="labels.stopGroupingBy(level.label)"
            @click="state.removeGroup(level.columnId)"
          >
            ×
          </button>
        </li>
      </ol>

      <div class="vt-group-options">
        <div v-for="column in candidates" :key="column.id" class="vt-group-option">
          <SelectionCheckbox
            :checked="state.isGrouped(column.id)"
            :label="labels.groupByColumn(column.header ?? column.id)"
            @change="state.toggleGroup(column.id)"
          />
          <span class="vt-group-option-label">{{ column.header ?? column.id }}</span>
        </div>
      </div>
    </div>
  </div>
</template>
