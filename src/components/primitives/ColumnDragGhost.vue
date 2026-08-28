<script setup lang="ts">
/**
 * The label that follows the pointer while a column is being dragged.
 *
 * Teleported to `<body>` because the header it starts in is `overflow: hidden`
 * on the scroll container and sticky besides — a ghost rendered in place would
 * be clipped the moment it left the cell.
 */
import { computed } from 'vue'
import { useTableContext, useTableTheme } from '../../core/context'

const props = withDefaults(defineProps<{ offsetX?: number; offsetY?: number }>(), {
  offsetX: 14,
  offsetY: 14,
})

const context = useTableContext()
const dnd = computed(() => context?.dnd)

/*
  The ghost lands in `<body>`, outside the table it came from, so a forced
  theme has to travel with it. `undefined` with no table above, which leaves
  the media query in charge — what this wrapper did before the prop existed.
*/
const theme = useTableTheme()
const themeAttribute = computed(() =>
  !theme || theme.value === 'system' ? undefined : theme.value,
)

const column = computed(() => {
  const id = dnd.value?.activeId.value
  if (!id) return undefined
  return context?.columns.all.value.find((entry) => entry.id === id)
})

const style = computed(() => {
  const pointer = dnd.value?.pointer.value ?? { x: 0, y: 0 }
  return { transform: `translate(${pointer.x + props.offsetX}px, ${pointer.y + props.offsetY}px)` }
})
</script>

<template>
  <Teleport v-if="column" to="body">
    <div class="vt-portal" :data-theme="themeAttribute">
      <div class="vt-drag-ghost" :style="style" aria-hidden="true">
        <slot :column="column">{{ column.header ?? column.id }}</slot>
      </div>
    </div>
  </Teleport>
</template>
