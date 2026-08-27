<script setup lang="ts" generic="TRow extends Record<string, unknown>">
/** One `<td>`, sharing the header's sticky/pin logic so columns stay aligned. */
import { computed } from 'vue'
import type { CellCursorMark } from '../../core/cellCursor'
import type { BandEdge } from '../../core/columnGroups'
import type { ResolvedColumn } from '../../core/types'

const props = defineProps<{
  column: ResolvedColumn<TRow>
  /**
   * How the cell cursor touches this cell, or `undefined` when the table has
   * no cursor — in which case the two attributes below are not emitted at all
   * and the cell renders exactly the markup it always did.
   *
   * `TableRow` works this out; a cell has no row identity of its own to work
   * it out from.
   */
  cursor?: CellCursorMark
  /**
   * The band boundary falling to this cell's right, or `undefined` when none
   * does. Positional rather than a property of the column, so the row works it
   * out and hands it down — a cell has no idea what sits beside it.
   */
  bandEdge?: BandEdge
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

/**
 * The roving tabindex: exactly one `0` in the whole grid, `-1` everywhere else.
 *
 * `entry` is a `0` as well as `cell`, which is what stops an untouched table
 * from falling out of the tab order entirely — with no cursor set yet there is
 * no `cell`, so some cell has to nominate itself as the way in.
 */
const tabIndex = computed(() => {
  if (!props.cursor) return undefined
  return props.cursor === 'cell' || props.cursor === 'entry' ? 0 : -1
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
    :data-cursor="cursor === 'cell' || cursor === 'column' ? cursor : undefined"
    :data-band-edge="bandEdge?.depth"
    :tabindex="tabIndex"
  >
    <slot />
  </td>
</template>
