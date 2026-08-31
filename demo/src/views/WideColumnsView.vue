<script setup lang="ts">
/**
 * A table wider than its box: 34 columns, none of them declaring a `width`.
 *
 * The Column layout view shows the sizing defaults on three columns, which is
 * enough to say what the rule is; this one runs the rule at a scale where its
 * consequences are what you actually see — the 160px cap on the two free-text
 * columns, a horizontal scroll rather than eleven columns sharing a page, and a
 * `flex` column with nothing left over to take.
 *
 * The panel underneath reads the resolved widths back off the `<colgroup>`,
 * because what the browser was handed is the only honest answer here: the
 * numbers `useColumns` holds are the input to layout, not its result.
 */
import { computed, nextTick, onMounted, ref, shallowRef, useTemplateRef } from 'vue'
import { DataTable, useLocalDataSource, useTableState, type ColumnDef } from '@brillliand/vue-table-chad'
import { makeProducts, wideProductColumns, type Product } from '../data/wideProducts'
import DemoSection from '../components/DemoSection.vue'

/**
 * The same 34 with `notes` taking the slack instead of being capped — the only
 * shape in which a table this wide can end flush with its box.
 */
const flexColumns: ColumnDef<Product>[] = wideProductColumns.map((column) =>
  column.id === 'notes' ? { ...column, flex: true } : column,
)

const variant = ref<'measured' | 'flex'>('measured')
const columns = computed(() => (variant.value === 'flex' ? flexColumns : wideProductColumns))

const rows = shallowRef(makeProducts())
const state = useTableState({ pageSize: 25 })
// The columns are a computed because the toggle swaps one entry, and the source
// reads accessors and formats from them — never widths, so the swap costs a
// layout pass and no pipeline pass.
const source = useLocalDataSource<Product>(rows, columns, state.query)

const host = useTemplateRef<HTMLElement>('host')

const measured = ref<{ id: string; width: string }[]>([])
const totalWidth = ref(0)

/** What the browser was actually handed, read back off the `<colgroup>`. */
async function readWidths(): Promise<void> {
  await nextTick()
  // Two frames: the width probe writes its measurements after layout, so
  // reading in the same frame reports the pre-measurement fallback instead.
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  const table = host.value?.querySelector<HTMLTableElement>('.vt-table')
  if (!table) return
  const cols = Array.from(table.querySelectorAll<HTMLTableColElement>('colgroup col'))
  // `data-column`, not the header's text: the label carries the sort glyph.
  const headers = Array.from(table.querySelectorAll<HTMLElement>('thead tr:last-child th'))
  measured.value = cols.map((col, index) => ({
    id: headers[index]?.dataset.column ?? `col ${index}`,
    width: col.style.width || 'auto (fill)',
  }))
  totalWidth.value = Math.round(table.getBoundingClientRect().width)
}

function show(next: 'measured' | 'flex'): void {
  variant.value = next
  void readWidths()
}

onMounted(readWidths)
</script>

<template>
  <DemoSection
    title="Wide table"
    blurb="34 columns, not one declared width. Each is measured once from what it holds and clamped
      into [minWidth, maxWidth ?? 160] — minWidth is 40 here, below the default floor of 60, so the
      widths below are measurements rather than the clamp. Nothing is measured again on a page turn
      or a scroll."
    :api="['DataTable', 'useLocalDataSource', 'useTableState', 'ColumnDef.flex', 'ColumnDef.minWidth']"
  >
    <template #controls>
      <div class="controls">
        <button type="button" :data-active="variant === 'measured' || undefined" @click="show('measured')">
          All measured
        </button>
        <button type="button" :data-active="variant === 'flex' || undefined" @click="show('flex')">
          Notes takes the slack (flex)
        </button>
        <button type="button" @click="readWidths()">Re-read widths</button>
      </div>
    </template>

    <p v-if="variant === 'flex'" class="hint">
      34 measured columns already overflow the page, so there is no slack for <code>notes</code> to
      take: it renders as a bare <code>&lt;col&gt;</code> and the table stays scrollable. Hide
      columns from the <b>Columns</b> menu until the table fits and it fills the rest.
    </p>

    <div ref="host">
      <DataTable :columns="columns" :source="source" :state="state" />
    </div>

    <div class="widths">
      <h3>Resolved &lt;col&gt; widths — {{ totalWidth }}px in total</h3>
      <ol>
        <li v-for="entry in measured" :key="entry.id">
          <span>{{ entry.id }}</span><b>{{ entry.width }}</b>
        </li>
      </ol>
    </div>
  </DemoSection>
</template>

<style scoped>
/* `.controls` itself is the shared strip in styles.css; only the active state
   of a segmented button is local. */
.controls button[data-active] { border-color: var(--accent); color: var(--accent); font-weight: 600; }
.widths h3 { margin: 0; font-size: 13px; font-weight: 600; }
.widths ol {
  list-style: none;
  margin: 8px 0 0;
  padding: 0;
  display: grid;
  gap: 2px 16px;
  grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
  font-size: 12.5px;
}
.widths li {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  padding: 2px 0;
  border-bottom: 1px dotted var(--line);
}
.widths b { font-variant-numeric: tabular-nums; }
</style>
