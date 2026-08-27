<script setup lang="ts" generic="TRow extends Record<string, unknown>">
/**
 * A band's spanning `<th>`: its label, and the control that folds it shut.
 *
 * Takes a cell that `buildHeaderRows` already shaped, so it never has to work
 * out its own span — how many columns a band covers is a property of the whole
 * header row, not of one cell, and deriving it twice is how the two disagree.
 *
 * Collapse state lives in `useColumns` rather than here, for the same reason a
 * row band's lives in the grouping composable: the layout is one object, it is
 * what `storageKey` persists, and a fold has to survive this cell being torn
 * down and rebuilt by the very reorder that split the band in two.
 */
import { computed } from 'vue'
import { useTableContext } from '../../core/context'
import type { BandEdge } from '../../core/columnGroups'
import type { HeaderGroupCell } from '../../core/types'

const props = withDefaults(
  defineProps<{
    /** The band cell, as `buildHeaderRows` produced it. */
    cell: HeaderGroupCell<TRow>
    /** Overrides the injected collapse state. */
    collapsed?: boolean
    /** Forces the toggle off, whatever the band declares. */
    collapsible?: boolean
    /**
     * The band boundary falling to this cell's right. Defaults to the injected
     * edge of the *last column this cell covers*, which is what keeps a band
     * split by a pin or a drag from drawing a rule inside itself: each run asks
     * about the column it actually ends on.
     */
    bandEdge?: BandEdge
  }>(),
  // Vue casts an absent boolean prop to `false`, which would read as "this band
  // is open" and shadow the injected state for good. The explicit `undefined`
  // keeps "not passed" distinguishable from "passed as false".
  { collapsed: undefined, collapsible: undefined },
)

const emit = defineEmits<{ toggle: [groupId: string, collapsed: boolean] }>()

const context = useTableContext<TRow>()

const label = computed(() => props.cell.group.header ?? props.cell.group.id)

const bandEdge = computed(() => {
  if (props.bandEdge) return props.bandEdge
  const last = props.cell.columns[props.cell.columns.length - 1]
  return last ? context?.columns.bandEdges.value.get(last.id) : undefined
})

const collapsed = computed(
  () => props.collapsed ?? context?.columns.isGroupCollapsed(props.cell.group.id) ?? false,
)

/**
 * Whether to offer the fold at all.
 *
 * A band with nothing to hide is not collapsible, however it was declared:
 * every column it covers would have to stay, so the control would be a button
 * that visibly does nothing. Collapsed bands stay controllable, or there would
 * be no way back.
 */
const collapsible = computed(() => {
  if (props.collapsible !== undefined) return props.collapsible
  if (props.cell.group.collapsible === false) return false
  // `totalColumns`, not `colspan`: a band split by the pin boundary or by a
  // reorder is several cells of one column each, and asking each of them
  // whether *it* has anything to hide would leave the band unfoldable.
  return collapsed.value || props.cell.totalColumns > 1
})

/** Pin offset, the band's own background, and which header row it sticks to. */
const cellStyle = computed(() => {
  const style: Record<string, string> = {}
  if (props.cell.pinned) {
    style[props.cell.pinned === 'left' ? 'left' : 'right'] = `${props.cell.pinOffset}px`
  }
  if (props.cell.group.background) style['--vt-column-bg'] = props.cell.group.background
  // Which row of the header this is, for the sticky offset. A second header row
  // stuck at `top: 0` would sit on top of the first.
  style['--vt-header-row'] = String(props.cell.depth)
  return style
})

function toggle(): void {
  const next = !collapsed.value
  context?.columns.toggleGroup(props.cell.group.id, next)
  emit('toggle', props.cell.group.id, next)
}
</script>

<template>
  <th
    class="vt-th vt-th-group"
    :colspan="cell.colspan"
    :scope="cell.colspan > 1 ? 'colgroup' : 'col'"
    :style="cellStyle"
    :data-column-group="cell.group.id"
    :data-depth="cell.depth"
    :data-pinned="cell.pinned || undefined"
    :data-column-bg="cell.group.background ? '' : undefined"
    :data-band-edge="bandEdge?.depth"
    :data-collapsed="collapsed || undefined"
    :data-collapsible="collapsible || undefined"
  >
    <!--
      The label stays put while the cell scrolls: a band spanning four columns
      is wider than the viewport as often as not, and its label is the only
      thing saying what those columns have in common.
    -->
    <div class="vt-th-inner vt-th-group-inner">
      <span class="vt-th-group-sticky">
        <button
          v-if="collapsible"
          type="button"
          class="vt-th-group-toggle"
          :aria-expanded="!collapsed"
          :aria-label="`${collapsed ? 'Expand' : 'Collapse'} ${label} columns`"
          @click="toggle"
        >
          <span class="vt-group-caret" aria-hidden="true">▸</span>
        </button>
        <slot :cell="cell" :collapsed="collapsed" :label="label">
          <span class="vt-th-label">{{ label }}</span>
        </slot>
      </span>
    </div>
  </th>
</template>
