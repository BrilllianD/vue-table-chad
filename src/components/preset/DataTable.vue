<script setup lang="ts" generic="TRow extends Record<string, unknown>">
/**
 * The batteries-included preset: every region a named slot, and the one
 * component that imports the default stylesheet. Deliberately NOT a god
 * component.
 *
 * It owns no logic of its own: every capability here comes from a primitive or
 * a composable, and every region is a named slot. If it does not fit, drop to
 * `<TableRoot>` and assemble the same pieces differently (see
 * `playground/src/examples/ComposedCustom.vue`).
 */
import { computed, ref } from 'vue'
import type {
  ColumnDef,
  ColumnGroupDef,
  DataSource,
  GroupMode,
  PinSide,
  QueryState,
  ResolvedColumn,
  RowId,
  SelectionMode,
} from '../../core/types'
import type { ColumnLayoutState } from '../../core/useColumns'
import {
  commitMoveFor,
  nextScrollLeft,
  type CellPosition,
} from '../../core/cellCursor'
import type { UsePagination } from '../../core/usePagination'
import type { UseCellCursor } from '../../core/useCellCursor'
import type { ColumnLayoutField } from '../../core/columnStorage'
import type { TableState } from '../../core/useTableState'
import type { UseRowEditing } from '../../core/useRowEditing'
import TableRoot from '../primitives/TableRoot.vue'
import TableGrid from '../primitives/TableGrid.vue'
import ColumnDragGhost from '../primitives/ColumnDragGhost.vue'
import ColumnVisibilityMenu from '../primitives/ColumnVisibilityMenu.vue'
import RowGroupMenu from '../primitives/RowGroupMenu.vue'
import ActiveFilters from '../primitives/ActiveFilters.vue'
import TablePagination from '../primitives/TablePagination.vue'
import DataTableHeader from './DataTableHeader.vue'
import DataTableBody from './DataTableBody.vue'
import DataTableFooter from './DataTableFooter.vue'

// The preset owns the preset theme, so `DataTable` is styled out of the box
// while the primitives stay CSS-free.
import './table.css'

const props = withDefaults(
  defineProps<{
    columns: ColumnDef<TRow>[]
    source: DataSource<TRow>
    state?: TableState
    selectable?: boolean | SelectionMode
    getRowId?: (row: TRow) => RowId
    isRowSelectable?: (row: TRow) => boolean
    /**
     * Header bands, giving a multi-row header with a collapse control on each.
     *
     * Optional even when columns declare a `group` — a band forms because a
     * column claims it, and these supply the label, the nesting and how it
     * folds. With no column declaring one, the header stays a single row.
     */
    columnGroups?: ColumnGroupDef[]
    initialLayout?: Partial<ColumnLayoutState>
    /** Remembers the column layout across reloads under this `localStorage` key. */
    storageKey?: string
    /** Which parts of the layout to remember. Defaults to visibility, order, widths and pins. */
    storageFields?: ColumnLayoutField[]
    /** Rows per page. Defaults to 10, from `useTableState` — see `DEFAULT_PAGE_SIZE`. */
    pageSize?: number
    /** Drag column headers to reorder them. */
    reorderable?: boolean
    /**
     * Bands rows by these columns on first render, outermost level first.
     * Seeds a supplied `state` too, unless it already carries a grouping.
     */
    initialGroupBy?: string[]
    /**
     * Who performs the grouping. `'client'` (the default) bands the rows that
     * are already loaded and never touches the query, so nothing refetches and
     * no server hears about it. `'server'` puts it in `QueryState.groupBy` for
     * the data source to perform, keeping groups whole across pages.
     */
    groupMode?: GroupMode
    /** Renders every band folded shut until the user opens it. */
    groupsCollapsed?: boolean
    /** Header text for the band holding rows with no value. */
    blankGroupLabel?: string
    /**
     * Renders a footer row aggregating every loaded row, using the same
     * per-column `aggregate` declarations the group rows use. Off by default:
     * declaring an aggregate should not add a row nobody asked for.
     */
    showFooter?: boolean
    /** Text for the footer's leading cell. */
    footerLabel?: string
    showToolbar?: boolean
    showSearch?: boolean
    showColumnsMenu?: boolean
    showGroupMenu?: boolean
    showPagination?: boolean
    stickyHeader?: boolean
    emptyMessage?: string
    /** Text shown beside the spinner while the source is fetching. */
    loadingMessage?: string
    /**
     * An editing session from `useRowEditing`. Without one every cell renders
     * read-only, and the table costs exactly what it always did.
     *
     * The session owns the mode, so there is no `editMode` prop here to
     * disagree with it: `'cell'` commits each field as you leave it, `'row'`
     * opens every editable cell at once behind one Save.
     */
    editing?: UseRowEditing<TRow>
    /**
     * A keyboard cell cursor: arrows move a focused cell, Enter opens its
     * editor when it has one, and Enter again commits and steps on.
     *
     * Off by default, and off means off — no `role="grid"`, no `tabindex`, no
     * cursor attributes, and editable cells keep the button that is their only
     * keyboard route without one.
     */
    cellCursor?: boolean
    /**
     * Where the cursor starts. Defaults to the first rendered cell, so a table
     * asked for a keyboard looks like it has one before you press a key.
     */
    initialCursor?: CellPosition
    /**
     * Take the caret on load, instead of waiting for a Tab or a click.
     *
     * Off by default: a table that grabbed the focus on mount would scroll
     * itself into view and swallow the first keystroke on every page where the
     * table is not the point. Turn it on for the pages where it is. Asked for
     * once, when there is first a cell to give the focus to — a server source
     * has none at mount — and never again.
     */
    autofocusCursor?: boolean
  }>(),
  {
    selectable: false,
    cellCursor: false,
    autofocusCursor: false,
    reorderable: true,
    showFooter: false,
    footerLabel: 'Total',
    showToolbar: true,
    showSearch: true,
    showColumnsMenu: true,
    showGroupMenu: true,
    showPagination: true,
    stickyHeader: true,
    emptyMessage: 'No rows match the current filters.',
    loadingMessage: 'Loading…',
  },
)

const emit = defineEmits<{
  'update:query': [query: QueryState]
  'update:selection': [ids: RowId[]]
  'update:columnOrder': [order: string[]]
  rowClick: [row: TRow, event: MouseEvent]
  /** A row reached the server. Carries the row as it now stands. */
  rowSaved: [row: TRow]
  rowSaveError: [row: TRow, error: unknown]
}>()

/**
 * Whether to render the selection column at all. The *mode* is passed to
 * `TableRoot` untouched — collapsing it to a boolean here would silently turn
 * `selectable="single"` into multi-select.
 */
const selectable = computed(() => props.selectable !== false)

/**
 * Row mode needs somewhere to put Save and Cancel, so it takes a trailing
 * column. Cell mode has no such controls — Enter and Escape are the whole
 * interface — so it adds no column and the table keeps the width it had.
 */
const rowMode = computed(() => props.editing?.mode.value === 'row')
const actionsColumn = computed(() => Boolean(props.editing) && rowMode.value)

/** Extra leading and trailing cells, for the rows that have to span them all. */
const extraColumns = computed(() => (selectable.value ? 1 : 0) + (actionsColumn.value ? 1 : 0))

/**
 * `Ctrl`/`Cmd` + `←`/`→`: turn the page, and take the cursor along.
 *
 * It keeps its offset and its column — the third row of page 2 becomes the
 * third row of page 3 — rather than re-anchoring to the top. Paging is reading,
 * and the eye is already at a height on the screen; putting the ring back at
 * the top would make every page turn cost a second gesture to get back to it.
 *
 * The offset is read *before* the page changes, because afterwards there is
 * nothing left to read it from. `anchorAt` then resolves it whenever the new
 * rows arrive, which is the same tick for a local source and some tick later
 * for a server one — the reason this is not simply a `moveTo` on the next line.
 *
 * A clamped page change moves nothing at all. `pagination.go` already refuses
 * to step past either end, and asking the cursor to re-anchor anyway would
 * yank it to the top of a page it never left.
 *
 * Works whether or not `show-pagination` renders a pager: a keyboard route
 * that only exists when a control is on screen is not a keyboard route.
 */
function pageMove(
  pages: number,
  cursor: UseCellCursor<TRow> | undefined,
  pagination: UsePagination,
): void {
  if (!cursor) return
  const offset = Math.max(0, cursor.rowOffset.value)
  const columnId = cursor.columnId.value ?? cursor.tabStop.value?.columnId
  const before = pagination.page.value
  pagination.go(before + pages)
  if (pagination.page.value === before) return
  cursor.anchorAt(offset, columnId, { focus: true })
}

/**
 * The scroll box, so `Shift`+`←`/`→` has something to scroll.
 *
 * The preset owns it — `.vt-scroll` is the element that overflows, and no
 * primitive has one — which is why `TableGrid` reports the gesture instead of
 * performing it.
 */
const scrollBox = ref<HTMLElement | null>(null)

/**
 * `Shift` + `←`/`→`: scroll one column sideways, and leave the cursor alone.
 *
 * The geometry is **measured**, not derived from `cols[].resolvedWidth`, and
 * that is not paranoia: the preset's `<colgroup>` also carries
 * `.vt-col-selection` and `.vt-col-actions`, which are 40px and 150px of CSS
 * and are not columns at all. Declared widths would put every boundary off by
 * the checkbox column on every selectable table. Measuring is also what makes
 * a resize, a pin and a folded band come out right without any of them being
 * known about here.
 *
 * The header row rather than a body row, because every column has exactly one
 * `<th>` — a band member spanning rows included — and a header exists even when
 * the body is empty or still loading.
 *
 * One `getBoundingClientRect` sweep per key press, so one forced layout, and it
 * reads header cells rather than rows: nothing here can reach the pipeline, and
 * `tests/invalidation.spec.ts` says so.
 */
function scrollColumns(direction: number): void {
  const box = scrollBox.value
  if (!box) return

  // The *padding* box, which is where `scrollLeft` is measured from.
  // `getBoundingClientRect` gives the border box, and `.vt-scroll` carries a
  // border: without `clientLeft` every boundary comes out a border-width too
  // far right, and scrolling to the very start lands at 1px instead of 0.
  const boxLeft = box.getBoundingClientRect().left + box.clientLeft
  let inset = 0
  const boundaries: number[] = []

  for (const cell of box.querySelectorAll<HTMLElement>('.vt-th[data-column]')) {
    const rect = cell.getBoundingClientRect()
    // Left-pinned cells are `position: sticky`, so they sit over the content
    // permanently: their combined width is dead space a column must not be
    // scrolled under. Their own rects are the stuck positions rather than the
    // laid-out ones, which is the other reason they are no use as boundaries.
    if (cell.dataset.pinned === 'left') inset += rect.width
    // Right-pinned cells eat space at the far edge, but nothing is ever
    // scrolled *to* them, so they are simply not boundaries.
    else if (!cell.dataset.pinned) boundaries.push(rect.left - boxLeft + box.scrollLeft)
  }

  const next = nextScrollLeft(
    box.scrollLeft,
    inset,
    boundaries,
    direction < 0 ? -1 : 1,
    box.scrollWidth - box.clientWidth,
  )
  // A direct assignment rather than `scrollTo({ behavior: 'smooth' })`: key
  // repeat against a running smooth scroll queues animations that fight each
  // other, and an instant jump has no `prefers-reduced-motion` question to
  // answer.
  if (next !== undefined) box.scrollLeft = next
}

/**
 * How wide the pinned band on one side is, in CSS pixels, for the scroll box to
 * inset its idea of "in view" by.
 *
 * Pinned cells are `position: sticky` and so sit *over* the content rather than
 * beside it. The browser's scroll-into-view knows nothing about that, so a cell
 * it scrolled flush against the left edge of the box lands underneath the
 * left-pinned band and is not visible at all — which is why walking the cursor
 * leftwards looked like a table that had stopped scrolling. `scroll-padding`
 * on `.vt-scroll` is the fix, and this is the number it needs; the sticky
 * header already had the same problem solved the same way one axis over, with
 * `--vt-header-rows` and `scroll-margin-top`.
 *
 * Declared widths rather than a measurement, because these are the very numbers
 * `useColumns` accumulates into `pinOffset` to *place* the sticky cells. Derived
 * any other way the padding and the pin could disagree, and the cell would land
 * beside a band of the wrong width. (`scrollColumns` above measures instead,
 * for a reason that does not apply here: it needs the boundaries of the
 * *unpinned* columns, and the preset's own `<colgroup>` entries put those out of
 * step with the declared widths.)
 *
 * A string with its unit, so the template can hand it straight to a custom
 * property — a bare number would be an invalid `scroll-padding`.
 */
function pinnedWidth(cols: ResolvedColumn<TRow>[], side: PinSide): string {
  let total = 0
  for (const column of cols) if (column.pinned === side) total += column.resolvedWidth ?? 0
  return `${total}px`
}

/**
 * Enter, F2 or a double-click on the cursor cell.
 *
 * `TableGrid` reports the gesture rather than acting on it, because opening an
 * editor needs a session it may not have. Here we do have one, so: open the
 * editor if this cell has one, and otherwise let Enter mean what it means
 * everywhere else in the grid — move on. `commitMoveFor` returns nothing for
 * F2 and nothing for a double-click, so neither of those moves a read-only
 * cell, which is right: F2 asks to edit and nothing else.
 */
function onActivate(
  position: CellPosition,
  event: Event,
  rows: TRow[],
  cols: ResolvedColumn<TRow>[],
  cursor: UseCellCursor<TRow> | undefined,
): void {
  const session = props.editing
  const row = rows.find((entry) => cursor?.getRowId(entry) === position.rowId)
  const column = cols.find((entry) => entry.id === position.columnId)
  if (session && row && column && session.isEditable(row, column)) {
    session.begin(row, column.id)
    return
  }
  // A `KeyboardEvent` satisfies `CursorKeyGesture` structurally; anything else
  // has no `key` and is not a move.
  const move = 'key' in event ? commitMoveFor(event as unknown as KeyboardEvent) : undefined
  if (move) cursor?.move(move)
}
</script>

<template>
  <TableRoot
    v-slot="{
      rows,
      columns: cols,
      headerRows,
      state: tableState,
      selection,
      cursor,
      pagination,
      source: src,
      loading,
      error,
      total,
      displayRows,
      overallAggregates,
      getRowKey: rowKey,
    }"
    :columns="columns"
    :source="source"
    :state="state"
    :selectable="props.selectable"
    :get-row-id="getRowId"
    :is-row-selectable="isRowSelectable"
    :column-groups="columnGroups"
    :initial-layout="initialLayout"
    :storage-key="storageKey"
    :storage-fields="storageFields"
    :page-size="pageSize"
    :reorderable="reorderable"
    :initial-group-by="initialGroupBy"
    :group-mode="groupMode"
    :groups-collapsed="groupsCollapsed"
    :blank-group-label="blankGroupLabel"
    :editing="editing"
    :cell-cursor="cellCursor"
    :initial-cursor="initialCursor"
    :autofocus-cursor="autofocusCursor"
    @update:query="$emit('update:query', $event)"
    @update:selection="$emit('update:selection', $event)"
    @update:column-order="$emit('update:columnOrder', $event)"
  >
    <div
      class="vt-datatable"
      :data-loading="loading || undefined"
      :aria-busy="loading || undefined"
    >
      <!--
        The live region is mounted unconditionally and only its *text* changes.
        A region that appears at the same moment as its content is unreliably
        announced — screen readers watch existing regions for mutations — which
        is what the previous `role="status"` on the `v-if`'d overlay was doing.
      -->
      <span class="vt-visually-hidden" role="status" aria-live="polite">
        {{ loading ? loadingMessage : '' }}
      </span>

      <div v-if="showToolbar" class="vt-toolbar">
        <slot name="toolbar" :state="tableState" :selection="selection" :total="total">
          <input
            v-if="showSearch"
            class="vt-search"
            type="search"
            placeholder="Search…"
            :value="tableState.globalSearch.value"
            aria-label="Search all columns"
            @input="tableState.setSearch(($event.target as HTMLInputElement).value)"
          />
          <span v-if="selection && !selection.isEmpty.value" class="vt-selection-summary">
            {{ selection.count.value }} selected
            <button type="button" class="vt-btn vt-btn-link" @click="selection.clear()">
              Clear
            </button>
          </span>
          <span class="vt-toolbar-spacer" />
          <RowGroupMenu v-if="showGroupMenu" />
          <ColumnVisibilityMenu v-if="showColumnsMenu" />
        </slot>
      </div>

      <ActiveFilters />

      <!--
        "Select all N matching" — offered only once the visible page is fully
        checked, so it never fires before the user means it.
      -->
      <div
        v-if="selection && selection.headerState.value === 'all' && total > rows.length"
        class="vt-selectall-banner"
      >
        <template v-if="selection.isAllMatching.value">
          All {{ selection.count.value }} rows matching the current filters are selected.
          <button type="button" class="vt-btn vt-btn-link" @click="selection.clear()">
            Clear selection
          </button>
        </template>
        <template v-else>
          All {{ rows.length }} rows on this page are selected.
          <button type="button" class="vt-btn vt-btn-link" @click="selection.selectAllMatching()">
            Select all {{ total }} matching rows
          </button>
        </template>
      </div>

      <!--
        A frame around the scroll box purely so the loading overlay has an
        anchor that does not scroll. An absolutely positioned child of an
        `overflow: auto` element is laid out against the padding box at scroll
        origin and then translates with the content, so inside `.vt-scroll` the
        scrim and the spinner slid off the top the moment you scrolled past
        `max-height`. Out here they stay over the part you are looking at.
      -->
      <div class="vt-scroll-frame">
        <!--
          Three numbers the stylesheet cannot work out for itself, all saying
          the same thing: the browser's scroll-into-view knows nothing about
          `position: sticky`, so anything stuck has to declare how much of an
          edge it has already spoken for. `--vt-header-rows` covers the sticky
          header (via `scroll-margin-top`), `--vt-pin-*` the two pinned bands
          (via `scroll-padding`).
        -->
        <div
          ref="scrollBox"
          class="vt-scroll"
          :data-sticky="stickyHeader || undefined"
          :style="{
            '--vt-header-rows': headerRows.length,
            '--vt-pin-left': pinnedWidth(cols, 'left'),
            '--vt-pin-right': pinnedWidth(cols, 'right'),
          }"
        >
          <TableGrid
            :columns="cols"
            :selection-column="selectable"
            :actions-column="actionsColumn"
            :cursor="cursor"
            @activate="(position, event) => onActivate(position, event, rows, cols, cursor)"
            @page-move="(pages) => pageMove(pages, cursor, pagination)"
            @scroll-move="scrollColumns"
          >
            <!--
              One `<tr>` per header row. With no band declared `headerRows` is a
              single row of column cells spanning one row each, which is exactly
              the markup this emitted before bands existed.

              The selection and actions cells belong to the first row only, and
              span the rest: they head a column, not a band, and a second copy
              in row two would push every real column one place to the right.
            -->
            <DataTableHeader
              :header-rows="headerRows"
              :selectable="selectable"
              :selection-mode="props.selectable"
              :selection="selection"
              :cursor="cursor"
              :actions-column="actionsColumn"
            >
              <template v-if="$slots.headerGroup" #headerGroup="bandProps">
                <slot name="headerGroup" v-bind="bandProps" />
              </template>
            </DataTableHeader>

            <DataTableBody
              :columns="cols"
              :rows="rows"
              :display-rows="displayRows"
              :source="src"
              :loading="loading"
              :error="error"
              :selection="selection"
              :cursor="cursor"
              :editing="props.editing"
              :row-key="rowKey"
              :selectable="selectable"
              :row-mode="rowMode"
              :actions-column="actionsColumn"
              :extra-columns="extraColumns"
              :empty-message="emptyMessage"
              @row-click="(row, event) => $emit('rowClick', row, event)"
              @row-saved="(row) => $emit('rowSaved', row)"
              @row-save-error="(row, err) => $emit('rowSaveError', row, err)"
            >
              <!--
                Every slot, forwarded wholesale rather than named one at a time.
                Two of the body's slots carry a column id in the name —
                `cell:<id>` and `editor:<id>` — so there is no list to write, and
                a list would go stale the moment a column is added anyway.

                Iterating this component's own `$slots` means only the slots a
                caller actually passed are forwarded, which is what keeps the
                body's own fallback content — the empty message, the default
                group header, the plain cell text — working.
              -->
              <template v-for="(_, name) in $slots" #[name]="slotProps">
                <slot :name="name" v-bind="slotProps ?? {}" />
              </template>
            </DataTableBody>

            <!--
              After `</tbody>`, which is where HTML wants it, and inside the same
              `TableGrid` slot — the grid is a bare `<slot />`, so a footer needs
              nothing from it but the `<colgroup>` widths it already applies.
            -->
            <DataTableFooter
              v-if="showFooter"
              :columns="cols"
              :aggregates="overallAggregates"
              :label="footerLabel"
              :selectable="selectable"
              :actions-column="actionsColumn"
            >
              <template v-if="$slots.footer" #footer="footerProps">
                <slot name="footer" v-bind="footerProps" />
              </template>
            </DataTableFooter>
          </TableGrid>
        </div>

        <div v-if="loading" class="vt-loading-overlay">
          <slot name="loading">
            <span class="vt-loading-pill">
              <!--
                Hidden from assistive tech, not labelled: the word beside it is
                real text now, so an `aria-label` here would be read twice.
              -->
              <span class="vt-spinner" aria-hidden="true" />
              {{ loadingMessage }}
            </span>
          </slot>
        </div>
      </div>

      <ColumnDragGhost v-if="reorderable" />

      <slot name="pagination" :state="tableState" :total="total">
        <TablePagination v-if="showPagination" />
      </slot>
    </div>
  </TableRoot>
</template>
