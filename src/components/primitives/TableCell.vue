<script setup lang="ts" generic="TRow extends Record<string, unknown>">
/** One `<td>`, sharing the header's sticky/pin logic so columns stay aligned. */
import { computed } from 'vue'
import type { ResolvedColumn } from '../../core/types'

const props = defineProps<{
  column: ResolvedColumn<TRow>
}>()

/**
 * Pin offsets and the column's own background, in one object. The background
 * travels as a custom property rather than `background:` directly, so the
 * stylesheet decides where it sits in the cascade — an inline background would
 * outrank hover and selection and leave the row looking dead.
 */
const cellStyle = computed(() => {
  const style: Record<string, string> = {}
  if (props.column.pinned) {
    style[props.column.pinned === 'left' ? 'left' : 'right'] = `${props.column.pinOffset}px`
  }
  if (props.column.background) style['--vt-column-bg'] = props.column.background
  return Object.keys(style).length > 0 ? style : undefined
})
</script>

<template>
  <td
    class="vt-td"
    :style="cellStyle"
    :data-column="column.id"
    :data-align="column.align ?? 'left'"
    :data-pinned="column.pinned || undefined"
    :data-column-bg="column.background ? '' : undefined"
  >
    <slot />
  </td>
</template>
