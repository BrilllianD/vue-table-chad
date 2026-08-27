<script setup lang="ts">
/**
 * A hundred thousand rows, one scroll, and about thirty `<tr>`s.
 *
 * Everything else in this demo caps the DOM with `pageSize`. This view removes
 * the cap and puts a window in its place: the page becomes the whole result
 * set, and the `<tbody>` renders the slice the scroll box can show, with two
 * spacer rows standing in for the height of everything else.
 *
 * Three things are worth doing rather than reading about.
 *
 * **Watch the counter while you scroll.** It says how many rows are in the
 * document. It does not move. The `<table>` is nearly two million pixels tall
 * and about thirty of them are real.
 *
 * **Turn the cursor on and hold the down arrow.** The ring walks past the
 * bottom of the window and the window follows it. A cursor position is a row id
 * — scrolling does not change which row it names — so the body scrolls the row
 * back into the document and asks for the focus again. Then scroll away with
 * the mouse and press Tab: exactly one cell is still reachable, because the
 * tab stop falls to a rendered row rather than to a row that is no longer
 * there.
 *
 * **Group it, then collapse a band.** The virtual height shrinks by the rows
 * the band was holding. Folding does not rebuild the group tree — that is
 * P1-6's split, and `tests/invalidation.spec.ts` holds it to it — so a collapse
 * at 100k costs a walk, not a regroup.
 *
 * What it costs is worth being straight about: virtual mode is a page size of
 * everything, so the filter, the sort and the grouping all run over the whole
 * dataset on every change rather than over a page. The scroll is free; the
 * pipeline underneath is the same pipeline, doing the same work at full size.
 *
 * **Turn selection on and click a row.** It used to be off here: the header
 * checkbox's tri-state asked "are all of these selected" over every row on
 * every click, which is 8.2ms at 100k. It now counts from the selection — a
 * list as long as your own clicks — rather than from the rows, so the click
 * costs the same here as it does on a page of 25.
 */
import { computed, ref, shallowRef } from 'vue'
import {
  DataTable,
  OVERSCAN_ROWS,
  useLocalDataSource,
  useTableState,
  type TableState,
} from '@brillliand/vue-table-chad'
import { makeRows, type Employee } from '../data/dataset'
import { employeeColumns } from '../columns'
import DemoSection from '../components/DemoSection.vue'

const count = ref(100_000)
const rows = shallowRef<Employee[]>(makeRows(count.value))

const virtual = ref(true)
const grouped = ref(false)
const cursor = ref(false)
const selectable = ref(false)
const rowHeight = ref(38)

const state: TableState = useTableState({ pageSize: 25 })
const source = useLocalDataSource<Employee>(rows, employeeColumns, state.query)

/** Regenerating is not free, and is deliberately not part of anything timed. */
function setCount(next: number): void {
  count.value = next
  rows.value = makeRows(next)
  state.setPage(1)
}

function toggleGrouping(): void {
  grouped.value = !grouped.value
  state.setGroupBy(grouped.value ? ['department', 'role'] : [])
}

/**
 * How many rows are actually in the document.
 *
 * Read off the DOM rather than derived, because the derived number would be
 * this view agreeing with itself. It is refreshed on a timer rather than on
 * scroll: reading `querySelectorAll` from a scroll handler would be this page
 * making the thing it is measuring slower.
 */
const rendered = ref(0)
const virtualHeight = ref(0)
setInterval(() => {
  rendered.value = document.querySelectorAll('.vt-tbody .vt-tr').length
  virtualHeight.value = Math.round(
    document.querySelector('.vt-tbody')?.getBoundingClientRect().height ?? 0,
  )
}, 500)

const windowSize = computed(() => `${OVERSCAN_ROWS} beyond each edge`)
</script>

<template>
  <DemoSection
    title="Virtual rows"
    blurb="A hundred thousand rows as one continuous scroll. The page size becomes the whole result
           set and the tbody renders only what the box can show — two spacer rows stand in for the
           height of everything else, so the scrollbar is honest and the DOM is not."
    :api="[
      'DataTable virtual',
      'DataTable rowHeight',
      'DataTable overscan',
      'useVirtualRows',
      'VirtualBody',
      'OVERSCAN_ROWS',
    ]"
  >
    <template #controls>
      <div class="virtual-controls">
        <label>
          <input v-model="virtual" type="checkbox" />
          Virtual
        </label>
        <label>
          <input v-model="cursor" type="checkbox" />
          Cell cursor
        </label>
        <label>
          <input v-model="selectable" type="checkbox" />
          Selectable
        </label>
        <label>
          <input v-model="grouped" type="checkbox" @change="toggleGrouping" />
          Group by department + role
        </label>
        <label>
          Row height
          <input v-model.number="rowHeight" type="number" min="24" max="80" step="2" />
        </label>
        <span class="virtual-group">
          <button
            v-for="size in [10_000, 100_000]"
            :key="size"
            type="button"
            :data-current="size === count || undefined"
            @click="setCount(size)"
          >
            {{ (size / 1000).toFixed(0) }}k rows
          </button>
        </span>
      </div>

      <p class="hint">
        <strong>{{ rendered }}</strong> rows in the document, out of
        {{ source.total.value.toLocaleString() }} matching —
        {{ virtual ? `a window plus ${windowSize}` : 'one page at a time' }}. The
        <code>&lt;tbody&gt;</code> is {{ virtualHeight.toLocaleString() }}px tall either way.
      </p>
    </template>

    <DataTable
      :columns="employeeColumns"
      :source="source"
      :state="state"
      :virtual="virtual"
      :row-height="rowHeight"
      :cell-cursor="cursor"
      :selectable="selectable"
      :group-mode="'client'"
    />
  </DemoSection>
</template>

<style scoped>
.virtual-controls {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  align-items: center;
}
.virtual-controls label { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; }
.virtual-controls input[type='number'] { width: 62px; }
.virtual-group { display: inline-flex; gap: 6px; }
.virtual-group button[data-current] { outline: 2px solid var(--vt-accent, #2563eb); }
</style>
