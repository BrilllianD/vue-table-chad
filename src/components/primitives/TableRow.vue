<script setup lang="ts" generic="TRow extends Record<string, unknown>">
/**
 * One body row: the cells of a row, under the columns that read it.
 *
 * The counterpart to `TableGroupRow`, which existed on its own for a while —
 * the band header was a component while the rows it banded were markup inlined
 * in the preset. Giving rows the same standing is what lets a caller assemble
 * a `<tbody>` from primitives without hand-writing pin offsets and indents.
 *
 * It resolves each cell's value and text **once** per render and hands both to
 * the slot. Inlined in a template, `getCellValue` and `getCellText` were called
 * to build the slot props and `getCellText` called again for the fallback
 * content — and it calls `getCellValue` internally — so every cell paid three
 * accessor reads and two `format()` calls to display one value.
 *
 * Like the other primitives it works with or without a `<TableRoot>` above it:
 * pass `columns` and it needs no context at all.
 */
import { computed } from 'vue'
import { useTableContext } from '../../core/context'
import { readValue } from '../../core/sorting'
import type { CellCursorMark } from '../../core/cellCursor'
import type { UseCellCursor } from '../../core/useCellCursor'
import type { BandEdge } from '../../core/columnGroups'
import type { ColumnDef, ResolvedColumn, RowId } from '../../core/types'
import TableCell from './TableCell.vue'

const props = withDefaults(
  defineProps<{
    row: TRow
    /** Columns to render. Defaults to the injected visible ones. */
    columns?: ResolvedColumn<TRow>[]
    /**
     * Band boundaries, keyed by the column each falls to the right of.
     * Defaults to the injected ones; pass an empty map to draw none.
     */
    bandEdges?: ReadonlyMap<string, BandEdge>
    /**
     * The row's position in the array it came from — not in the rendered list,
     * so group headers interleaving cannot upset the stripe parity.
     */
    index?: number
    /** How many group levels sit above this row; `0` when nothing is grouped. */
    depth?: number
    /**
     * This row's 1-based position in the **whole** table, header rows included
     * — `aria-rowindex`.
     *
     * For a body that renders a window rather than the list: without it a
     * screen reader counts the rows in the document and announces a table of
     * thirty. Left `undefined` when every row is rendered, where the count in
     * the document is already the truth and the attribute would be noise.
     */
    rowIndex?: number
    /** Overrides the injected selection state. */
    selected?: boolean
    /**
     * Whether this row's detail panel is open, as a style and test hook.
     * Reaches the DOM as `data-expanded`.
     *
     * The panel itself is a separate `<tr>` the caller renders after this one —
     * a row cannot contain another row — so all this does is say which way the
     * disclosure points.
     */
    expanded?: boolean
    /**
     * How this row stands with the server, as a style and test hook. Reaches
     * the DOM as `data-row-state`; absent means an ordinary, untouched row.
     */
    state?: 'dirty' | 'saving' | 'error'
    /**
     * A cell cursor from `useCellCursor`. Given one, this row marks its cells
     * and carries `data-row-id` so the grid can find them again; given none,
     * it emits exactly the attributes it always did.
     *
     * The composable itself, not its position: this row subscribes to four
     * *fields* of it, so a move that changes none of them costs a pointer
     * compare, and the parent that passed it never re-renders because the
     * reference never changes. The same reason the pipeline stages depend on
     * query fields rather than on the query object.
     */
    cursor?: UseCellCursor<TRow>
    /**
     * The column the pointer is in, so this row tints its cell there.
     *
     * A plain id rather than a composable, unlike `cursor`: there is one scalar
     * to read and no predicates to call, and the id changes only when the
     * pointer crosses a column boundary — a move inside one column re-renders
     * nothing. Whoever owns the pointer decides what it means; this row only
     * paints it.
     */
    hoverColumnId?: string
    /** Overrides the id this row is known by. Defaults to the cursor's own `getRowId`. */
    rowId?: RowId
  }>(),
  {
    index: 0,
    depth: 0,
    selected: undefined,
    expanded: false,
    columns: undefined,
    bandEdges: undefined,
    state: undefined,
    cursor: undefined,
    hoverColumnId: undefined,
    rowId: undefined,
  },
)

/*
 * Declared rather than left to fall through. An undeclared `@click` would land
 * in `attrs`, and Vue clones a component's root vnode to apply fallthrough
 * attrs — a fresh vnode every render, for a listener that never changes.
 */
const emit = defineEmits<{
  click: [event: MouseEvent]
  /**
   * Declared for the same reason `click` is, and needed because a shift-click
   * has to be cancelled *before* the browser extends a text range from it —
   * which is a `mousedown` decision, not a `click` one.
   */
  mousedown: [event: MouseEvent]
}>()

const context = useTableContext<TRow>()

const columns = computed<ResolvedColumn<TRow>[]>(
  () => props.columns ?? ((context?.visibleColumns.value ?? []) as ResolvedColumn<TRow>[]),
)

const bandEdges = computed<ReadonlyMap<string, BandEdge> | undefined>(
  () => props.bandEdges ?? context?.columns.bandEdges.value,
)

const selected = computed(
  () => props.selected ?? context?.selection?.value?.isSelected(props.row) ?? false,
)

/**
 * Value and display text per column, resolved once.
 *
 * Falls back to the column's own `accessor`/`format` when there is no context,
 * which is the same pair `TableRoot` implements — a primitive used standalone
 * must not render `[object Object]` where a table would have formatted it.
 */
const cells = computed(() =>
  columns.value.map((column) => {
    const value = context
      ? context.getCellValue(props.row, column)
      : readValue(props.row, column as ColumnDef<TRow>)
    const text = context
      ? context.getCellText(props.row, column)
      : column.format
        ? column.format(value, props.row)
        : value === null || value === undefined
          ? ''
          : String(value)
    // Folded in here rather than resolved from the template like `cursorFor`:
    // band edges move only when the columns do, which is exactly when this
    // computed already re-runs, so it costs nothing extra. The cursor moves on
    // its own cadence, which is why that one is a function.
    return { column, value, text, bandEdge: bandEdges.value?.get(column.id) }
  }),
)

/**
 * This row's identity, derived only when something needs it.
 *
 * Through the cursor's own `getRowId` rather than the context's, because a
 * table with no cursor has no reason to pay for it — and `defaultRowId` throws
 * for a row with no `id`, which would turn "renders a table" into "crashes"
 * for a caller who never asked for a cursor at all.
 */
const rowId = computed<RowId | undefined>(() =>
  props.rowId ?? (props.cursor ? props.cursor.getRowId(props.row) : undefined),
)

/*
 * Four scalar computeds, not one read of `cursor.position`.
 *
 * A vertical move leaves both column ids identical, and a computed that
 * recomputes to the same value does not propagate — so on an ArrowDown, 23 of
 * 25 rows re-evaluate two string compares and stop there, and only the two
 * rows that actually changed re-render. Reading the position object instead
 * would re-render the whole page for every keystroke.
 */
const cursorColumnId = computed(() => props.cursor?.position.value?.columnId)
const tabStopColumnId = computed(() => props.cursor?.tabStop.value?.columnId)
const isCursorRow = computed(
  () => rowId.value !== undefined && props.cursor?.position.value?.rowId === rowId.value,
)
const isTabStopRow = computed(
  () => rowId.value !== undefined && props.cursor?.tabStop.value?.rowId === rowId.value,
)

/**
 * How the cursor touches one of this row's cells.
 *
 * A function called from the template, and deliberately **not** folded into
 * `cells`: that computed resolves an accessor and a `format()` per column, and
 * letting it depend on the cursor would re-derive every value in the row and
 * re-run every format to change one attribute on one arrow press.
 *
 * The cursor and the tab stop are the same cell whenever there is a cursor on
 * screen. They come apart in exactly two situations, and both are why `entry`
 * exists: before anything has set a cursor, and while the cursor's row has been
 * filtered off the page. In both the ring must not be drawn, but a way into the
 * grid still has to exist.
 */
function cursorFor(columnId: string): CellCursorMark | undefined {
  if (!props.cursor) return undefined
  if (isCursorRow.value && columnId === cursorColumnId.value) return 'cell'
  if (isTabStopRow.value && columnId === tabStopColumnId.value) return 'entry'
  if (columnId === cursorColumnId.value) return 'column'
  return 'none'
}
</script>

<template>
  <!--
    `:data-row-id="rowId"` with no `|| undefined` after it, unlike every other
    attribute here. `0` is a perfectly good row id and so is `''`, and `||`
    would erase both; Vue drops the attribute for `undefined` on its own, which
    is the only case that should drop it.
  -->
  <tr
    class="vt-tr"
    :data-row-id="rowId"
    :data-cursor="isCursorRow || undefined"
    :data-selected="selected || undefined"
    :data-expanded="expanded || undefined"
    :data-row-state="state"
    :data-parity="index % 2 === 0 ? 'odd' : 'even'"
    :aria-rowindex="rowIndex"
    @click="emit('click', $event)"
    @mousedown="emit('mousedown', $event)"
  >
    <!--
      The selection checkbox's cell, when the caller has one to put there. The
      `<td>` belongs to the row rather than to the slot so that a caller cannot
      accidentally break the grid alignment the `<colgroup>` set up.
    -->
    <td v-if="$slots.leading" class="vt-td vt-td-selection">
      <slot name="leading" :row="row" :selected="selected" />
    </td>

    <TableCell
      v-for="(cell, cellIndex) in cells"
      :key="cell.column.id"
      :column="cell.column"
      :band-edge="cell.bandEdge"
      :cursor="cursorFor(cell.column.id)"
      :column-hovered="cell.column.id === hoverColumnId"
    >
      <!--
        The first cell carries the group indent, so rows sit visibly inside
        their band without an extra spacer column.
      -->
      <span
        v-if="cellIndex === 0 && depth > 0"
        class="vt-group-indent"
        :style="{ '--vtc-group-depth': depth }"
        aria-hidden="true"
      />
      <slot
        name="cell"
        :row="row"
        :column="cell.column"
        :value="cell.value"
        :text="cell.text"
        :index="index"
      >
        {{ cell.text }}
      </slot>
    </TableCell>

    <!--
      Per-row controls — Save and Cancel while a row draft is open. Its `<td>`
      belongs to the row for the same reason the leading one does: the
      `<colgroup>` allotted it, and letting the slot own it would let a caller
      knock the grid out of alignment.
    -->
    <td v-if="$slots.trailing" class="vt-td vt-td-actions">
      <slot name="trailing" :row="row" :state="state" />
    </td>
  </tr>
</template>
