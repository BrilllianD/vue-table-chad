<script setup lang="ts" generic="TRow extends Record<string, unknown>">
/**
 * The right-click menu over a cell or a header cell.
 *
 * Five actions, each one call into state the table already owns: filter by the
 * cell's value, sort either way, group by the column, hide it, copy the cell.
 * This component decides only *which* of them to show and what to call them —
 * every mutation is `TableState` or `useColumns`, so there is no second way to
 * filter a column and nothing here to keep in step with the filter panel.
 *
 * **Requires a `<TableRoot>` above it**, the fourth primitive that does. It
 * reads the whole column, filter and grouping model rather than taking it as
 * props, exactly like `ColumnVisibilityMenu`, `RowGroupMenu` and
 * `ActiveFilters`: the alternative is a prop per mutator, which is the model
 * again, spelled out by hand at every call site.
 */
import { computed, nextTick, ref, watch } from 'vue'
import { requireTableContext, useTableLabels, useTableTheme } from '../../core/context'
import { valuesFilter } from '../../core/filters/model'
import { isBlank, toFilterValue } from '../../core/utils/values'
import type { ColumnDataType, ResolvedColumn, RowId } from '../../core/types'
import { useMenuDismiss } from './useMenuDismiss'
import { usePopoverPosition } from './usePopoverPosition'

const props = withDefaults(
  defineProps<{
    /** Whether the panel is up. Owned by the caller, so one menu serves every cell. */
    open?: boolean
    /**
     * The `<td>` or `<th>` the gesture landed on. The panel hangs off its
     * bottom-left corner, which is where a menu opened by either route — the
     * pointer or `Shift`+`F10` — belongs: the keyboard has no pointer to open
     * under, and a menu that moved depending on which one was used would be
     * two behaviours wearing one name.
     */
    anchor?: HTMLElement | null
    /** The column the gesture was on. */
    columnId: string
    /**
     * The row, or nothing for a header cell.
     *
     * Absent, the two value-dependent items — filter by this value, and copy —
     * are not rendered at all. A header has no cell to read, and an item that
     * could not say what it would do is worse than one that is not there.
     */
    rowId?: RowId
    /**
     * Teleport the panel to `<body>`. On by default, so no ancestor's
     * `overflow` — the scroll box, a `<td>` — can clip it.
     */
    teleport?: boolean
  }>(),
  { open: false, anchor: null, teleport: true },
)

const emit = defineEmits<{ 'update:open': [open: boolean] }>()

const context = requireTableContext<TRow>('TableContextMenu')
const labels = useTableLabels()

/*
  Teleported, the panel is no longer under the table, so a forced theme has to
  be stamped on the wrapper — the same reason `.vt-portal` re-declares the
  palette at all, and the same stamp `ColumnFilterPopover` carries.
*/
const theme = useTableTheme()
const themeAttribute = computed(() => (!theme || theme.value === 'system' ? undefined : theme.value))

/** Named apart from the `teleport` prop so the template cannot confuse them. */
const teleported = computed(() => props.teleport)

const panel = ref<HTMLElement | null>(null)

/**
 * The open state as a `Ref`, because `useMenuDismiss` writes to it.
 *
 * Writes travel back out as `update:open` rather than being kept here: the
 * caller decides which cell the menu is on, so it has to hear about a dismissal
 * to stop pointing at one.
 */
const open = computed({
  get: () => props.open,
  set: (value: boolean) => emit('update:open', value),
})

const anchorRef = computed(() => props.anchor)

const MENU_WIDTH = 220

/*
  Bottom-left of the clicked cell. `align: 'start'` is the whole difference from
  the filter panel, which right-aligns to its trigger the way Excel does: a menu
  reads left to right from the corner it was opened at, and a right-aligned one
  would drift away from the cell on a wide column.
*/
const { style: panelStyle, update: updatePosition } = usePopoverPosition({
  root: anchorRef,
  panel,
  open,
  enabled: teleported,
  width: MENU_WIDTH,
  align: 'start',
})

const column = computed<ResolvedColumn<TRow> | undefined>(() =>
  context.columns.all.value.find((candidate) => candidate.id === props.columnId),
)

/**
 * The row the menu was opened on, by id.
 *
 * Compared as strings because the id may have made a round trip through a
 * `data-row-id` attribute, where a numeric key comes back as `'7'` — a table
 * with no cell cursor has nothing else to map it back through.
 */
const row = computed<TRow | undefined>(() => {
  if (props.rowId === undefined) return undefined
  const key = String(props.rowId)
  return context.rows.value.find((candidate) => String(context.getRowId(candidate)) === key)
})

const state = context.state

/** One menu item: what it says, whether it can be pressed, and the one call it makes. */
interface MenuItem {
  id: string
  label: string
  disabled?: boolean
  run: () => void
}

/**
 * Narrow the column to the value under the cursor.
 *
 * The *raw* value through `toFilterValue`, not the formatted text: a values
 * filter matches what `filterRows` compares, and a formatted date would match
 * nothing. A blank cell filters to blanks, which is the same checkbox the
 * filter panel calls "(Blanks)".
 */
function filterByValue(): void {
  const target = column.value
  const currentRow = row.value
  if (!target || !currentRow) return
  const value = context.getCellValue(currentRow, target)
  const type: ColumnDataType = target.type ?? 'text'
  state.setFilter(
    props.columnId,
    isBlank(value) ? valuesFilter([], true) : valuesFilter([toFilterValue(value, type)]),
  )
}

/**
 * The cell's **displayed** text on the clipboard, which is what the grid's own
 * `Ctrl`/`Cmd`+`C` writes.
 *
 * `navigator.clipboard` rather than `DataTable`'s copy handler: that one writes
 * through a native `ClipboardEvent`'s `clipboardData`, and a menu click has no
 * such event to write into. The text is the same either way, so the two
 * gestures cannot disagree about what copying a cell means.
 */
function copyCell(): void {
  const target = column.value
  const currentRow = row.value
  if (!target || !currentRow) return
  void navigator.clipboard?.writeText(context.getCellText(currentRow, target))
}

const items = computed<MenuItem[]>(() => {
  const target = column.value
  if (!target) return []
  const result: MenuItem[] = []

  // The two that need a cell to read. A header cell has none, and says so by
  // leaving them out rather than by disabling them.
  if (row.value) {
    result.push({
      id: 'filter',
      label: labels.value.filterByValue,
      disabled: target.filterable === false,
      run: filterByValue,
    })
  }

  result.push(
    {
      id: 'sort-asc',
      label: labels.value.sortAscending,
      disabled: target.sortable === false,
      run: () => state.setSort(props.columnId, 'asc'),
    },
    {
      id: 'sort-desc',
      label: labels.value.sortDescending,
      disabled: target.sortable === false,
      run: () => state.setSort(props.columnId, 'desc'),
    },
    {
      id: 'group',
      // One item, two wordings: the gesture is a toggle, and a second item that
      // was only ever live when the first was dead would read as a menu that
      // cannot make up its mind.
      label: state.isGrouped(props.columnId)
        ? labels.value.stopGroupingByThisColumn
        : labels.value.groupByThisColumn,
      disabled: target.groupable === false,
      run: () => state.toggleGroup(props.columnId),
    },
    {
      id: 'hide',
      label: labels.value.hideColumn,
      disabled: target.hideable === false,
      run: () => context.columns.toggleVisibility(props.columnId, false),
    },
  )

  if (row.value) {
    result.push({ id: 'copy', label: labels.value.copyCell, run: copyCell })
  }

  return result
})

function close(): void {
  open.value = false
}

function activate(item: MenuItem): void {
  if (item.disabled) return
  item.run()
  close()
}

function contains(node: Node): boolean {
  return Boolean(panel.value?.contains(node))
}

const onFocusOut = useMenuDismiss(open, contains)

/** The items as elements, in document order — what the arrow keys walk. */
function itemButtons(): HTMLElement[] {
  const buttons = panel.value?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])')
  return buttons ? [...buttons] : []
}

/**
 * `↑`/`↓` move the focus, and wrap.
 *
 * Wrapping is what a menu does and a grid does not: there is no "further down"
 * to ask for here, so the press that would fall off the end has only one useful
 * meaning left.
 */
function onKeydown(event: KeyboardEvent): void {
  const delta = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0
  if (delta === 0) return
  const buttons = itemButtons()
  if (buttons.length === 0) return
  event.preventDefault()
  const index = buttons.indexOf(document.activeElement as HTMLElement)
  const next = index === -1 ? 0 : (index + delta + buttons.length) % buttons.length
  buttons[next]?.focus()
}

watch(
  () => props.open,
  (isOpen) => {
    if (!isOpen) return
    updatePosition()
    void nextTick(() => {
      // Again now that the panel has a measurable height, so the flip decision
      // is made against its real size rather than against zero.
      updatePosition()
      // The focus is what makes Esc and the arrow keys reach the panel at all —
      // opened by `Shift`+`F10`, the caret is still on the cell otherwise.
      itemButtons()[0]?.focus()
    })
  },
  // Immediate, because a caller may mount this already open — `DataTable` does
  // not, but a hand-assembled table that renders it only while a menu is up
  // would otherwise get a panel nobody positioned and nobody focused.
  { immediate: true },
)

/*
  A menu anchored to a cell that scrolled away, or a column that was just
  hidden, is a menu pointing at nothing. Both are reachable from the menu's own
  items — hiding the column the menu is on is one press — so it closes itself
  rather than leaving a panel hanging over the table.
*/
watch(column, (current) => {
  if (!current) close()
})
</script>

<template>
  <Teleport to="body" :disabled="!teleported">
    <div
      v-if="open"
      ref="panel"
      class="vt-context-menu"
      :class="{ 'vt-portal': teleported }"
      :data-theme="teleported ? themeAttribute : undefined"
      :data-inline="!teleported || undefined"
      :style="panelStyle"
      role="menu"
      :aria-label="labels.contextMenu"
      @focusout="onFocusOut"
      @keydown.esc.stop="close"
      @keydown="onKeydown"
    >
      <button
        v-for="item in items"
        :key="item.id"
        type="button"
        class="vt-context-item"
        role="menuitem"
        :disabled="item.disabled"
        :data-action="item.id"
        @click="activate(item)"
      >
        {{ item.label }}
      </button>

      <!--
        A consumer's own items, after the built-ins and inside the same panel so
        they share the dismissal, the arrow keys and the theme. `close` is given
        rather than assumed: an item that opens a dialog of its own decides for
        itself when the menu is done.
      -->
      <slot v-bind="{ columnId, rowId, close }" />
    </div>
  </Teleport>
</template>
