<script setup lang="ts">
/**
 * The claim, measured in a browser.
 *
 * `bench/` times JavaScript. It cannot see layout, paint, or Vue's patch, and
 * a table can be fast in all three and still feel slow. This view times the
 * round trip an actual user waits through: from the click to the frame after
 * the DOM settled.
 *
 * Two things it has to do to be worth trusting:
 *
 *  - **Measure to the frame, not to the tick.** `await nextTick()` returns once
 *    the DOM is patched, which is before the browser has laid it out or painted
 *    anything. A double `requestAnimationFrame` lands after the frame that
 *    showed the change, so the number covers the work the user actually waited
 *    on.
 *  - **Report the spread, not one lucky run.** Each button runs the interaction
 *    several times and shows the median with the worst case beside it, because
 *    the worst case is what a user notices.
 *
 * It is also the proving ground for virtualization, and now measures it
 * directly. Turn the page size up to 5000 and the numbers stop being about the
 * pipeline and start being about the DOM — which is exactly the point where
 * pagination stops being enough. Then turn **Virtual** on, put the row count up
 * to 100k, and scroll: the window renders about thirty rows however many there
 * are, so the number that used to grow with the page size stops growing at all.
 */
import { computed, nextTick, ref, shallowRef } from 'vue'
import { DataTable, useLocalDataSource, useTableState, valuesFilter } from '@brillliand/vue-table-chad'
import { makeRows, type Employee } from '../data/dataset'
import { employeeColumns } from '../columns'
import DemoSection from '../components/DemoSection.vue'
import ControlGroup from '../components/ControlGroup.vue'
import ChoiceControl from '../components/ChoiceControl.vue'

/** The whole 10k, not a slice — every other view trims, this one must not. */
const rows = shallowRef<Employee[]>(makeRows(10_000))

const pageSize = ref(25)
const grouped = ref(false)
const virtual = ref(false)

/**
 * The dataset size, switchable, because virtualization's whole claim is about
 * the size pagination was hiding. Generating 100k takes a moment and is not
 * part of any measurement — it happens on the click, before anything is timed.
 */
function setRowCount(count: number): void {
  rows.value = makeRows(count)
  state.setPage(1)
}

const state = useTableState({ pageSize: pageSize.value })
const source = useLocalDataSource<Employee>(rows, employeeColumns, state.query, {
  // Off, so a keystroke here measures the filter rather than the timer.
  debounceMs: 0,
})

/** A filter and a sort, so the pipeline has real work to redo. */
function loadTheTable(): void {
  state.setFilter('department', valuesFilter(['Engineering', 'Research', 'Design']))
  state.setSort('name', 'asc')
}
loadTheTable()

interface Measurement {
  label: string
  median: number
  worst: number
  runs: number
}

const results = ref<Measurement[]>([])
const running = ref(false)
const blocked = ref('')

/**
 * Resolves after the frame that painted the pending DOM change.
 *
 * The timeout is not a fallback measurement, it is a liveness floor: a hidden
 * tab never fires `requestAnimationFrame` at all, and without this a run
 * started just before switching tabs would hang forever with every button
 * disabled. `measure` refuses to start in a hidden tab for the same reason —
 * this only covers a tab hidden partway through.
 */
function afterPaint(): Promise<void> {
  return new Promise((resolve) => {
    const bail = setTimeout(resolve, 500)
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        clearTimeout(bail)
        resolve()
      }),
    )
  })
}

async function measure(label: string, runs: number, step: (run: number) => void): Promise<void> {
  if (document.hidden) {
    // Timing a tab that is not painting would produce a number, and the number
    // would be a lie. Say so instead.
    blocked.value = 'Bring this tab to the front — a hidden tab never paints, so there is nothing to time.'
    return
  }

  blocked.value = ''
  running.value = true
  const samples: number[] = []

  try {
    for (let run = 0; run < runs; run += 1) {
      // A frame of quiet first, so the previous run's paint is not billed here.
      await afterPaint()
      const start = performance.now()
      step(run)
      await nextTick()
      await afterPaint()
      samples.push(performance.now() - start)
    }
  } finally {
    // Whatever happened, the controls come back.
    running.value = false
  }

  samples.sort((a, b) => a - b)
  const median = samples[Math.floor(samples.length / 2)] ?? 0
  results.value = [
    { label, median, worst: samples[samples.length - 1] ?? 0, runs },
    ...results.value.filter((entry) => entry.label !== label),
  ]
}

const lastPage = computed(() => Math.max(1, Math.ceil(source.total.value / state.pageSize.value)))

function measurePaging(): void {
  void measure('Next page', 12, (run) => state.setPage((run % lastPage.value) + 1))
}

function measureSearch(): void {
  const terms = ['a', 'an', 'ana', 'anab', 'ada', 'adam']
  void measure('Search keystroke', terms.length, (run) => state.setSearch(terms[run]!))
}

function measureSort(): void {
  void measure('Sort a text column', 8, () => state.toggleSort('name'))
}

function measurePageSize(next: number): void {
  pageSize.value = next
  state.setPageSize(next)
  void measure(`Render ${next} rows`, 5, () => {
    // Re-slicing the same page is the render, with none of the pipeline: the
    // filter and sort are untouched, so what is left is DOM and paint.
    state.setPage(state.page.value === 1 ? 2 : 1)
  })
}

/**
 * Scrolling, which is the interaction virtual mode exists for and the one no
 * other button here covers.
 *
 * It scrolls the box rather than paging, so what is being timed is the window
 * moving and the rows being patched — the pipeline is untouched by a scroll and
 * must stay that way (`tests/invalidation.spec.ts` says so).
 */
function measureScroll(rowsPerRun = 2000): void {
  const box = document.querySelector<HTMLElement>('.vt-scroll')
  if (!box) {
    blocked.value = 'No scroll box on screen yet.'
    return
  }
  let top = 0
  void measure(`Scroll ${rowsPerRun} rows`, 12, () => {
    top += rowsPerRun * 38
    if (top > box.scrollHeight - box.clientHeight) top = 0
    box.scrollTop = top
  })
}

function toggleVirtual(): void {
  virtual.value = !virtual.value
}

function toggleGrouping(): void {
  grouped.value = !grouped.value
  state.setGroupBy(grouped.value ? ['department', 'role'] : [])
}

function reset(): void {
  results.value = []
  blocked.value = ''
}
</script>

<template>
  <DemoSection
    title="Performance"
    :try-it="[
      'Foreground this tab first — a hidden tab refuses to measure.',
      'Click Next page, then Sort: paging should be far under sorting, because it redoes nothing.',
      'Push pageSize to 5000 with virtual off, then turn virtual on and try again.',
    ]"
    blurb="The whole 10 000 rows, timed in the browser rather than in a benchmark. Each button runs
           its interaction several times and reports the median with the worst case beside it —
           measured to the frame after the paint, not to the tick after the patch."
    :api="['useLocalDataSource', 'debounceMs', 'DataTable pageSize', 'useTableState']"
  >
    <template #controls>
      <ControlGroup legend="Interactions" hint="Each one runs several times and adds a row to the table below.">
        <button type="button" :disabled="running" @click="measurePaging">Next page</button>
        <button type="button" :disabled="running" @click="measureSearch">Search keystroke</button>
        <button type="button" :disabled="running" @click="measureSort">Sort</button>
        <button type="button" :disabled="running" @click="toggleGrouping">
          {{ grouped ? 'Ungroup' : 'Group by department + role' }}
        </button>
        <button type="button" :disabled="running" @click="measureScroll()">Scroll 2000 rows</button>
        <button type="button" :disabled="running" @click="reset">Clear results</button>
      </ControlGroup>

      <ControlGroup legend="Shape">
        <ChoiceControl
          :model-value="virtual"
          label="virtual"
          code
          :disabled="running"
          :options="[
            { value: false, label: 'off — paginated' },
            { value: true, label: 'on — one page, windowed' },
          ]"
          @update:model-value="toggleVirtual"
        />
        <ChoiceControl
          :model-value="rows.length"
          label="rows"
          :disabled="running"
          :options="[
            { value: 10_000, label: '10k' },
            { value: 100_000, label: '100k' },
          ]"
          @update:model-value="setRowCount"
        />
        <ChoiceControl
          :model-value="pageSize"
          label="pageSize"
          code
          :disabled="running"
          hint="picking one is itself measured: the render of that many rows"
          :options="[25, 100, 500, 1000, 5000].map((size) => ({ value: size, label: String(size) }))"
          @update:model-value="measurePageSize"
        />
      </ControlGroup>

      <p v-if="blocked" class="perf-blocked">{{ blocked }}</p>

      <table v-if="results.length" class="perf-results">
        <thead>
          <tr>
            <th scope="col">Interaction</th>
            <th scope="col">Median</th>
            <th scope="col">Worst</th>
            <th scope="col">Runs</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="result in results" :key="result.label">
            <td>{{ result.label }}</td>
            <td class="perf-number">{{ result.median.toFixed(1) }} ms</td>
            <td class="perf-number">{{ result.worst.toFixed(1) }} ms</td>
            <td class="perf-number">{{ result.runs }}</td>
          </tr>
        </tbody>
      </table>

      <p class="hint">
        {{ source.total.value.toLocaleString() }} of {{ rows.length.toLocaleString() }} rows match ·
        <template v-if="virtual">one page, windowed</template>
        <template v-else>page size {{ pageSize }}</template>
        {{ grouped ? ' · grouped two levels' : '' }}. Paging and collapsing stay flat as the dataset
        grows; rendering did not, which is what virtual mode is for — with it on, the row buttons
        above stop mattering and <em>Scroll</em> is the number to watch.
      </p>
    </template>

    <DataTable
      :columns="employeeColumns"
      :source="source"
      :state="state"
      :page-size="pageSize"
      :virtual="virtual"
      :group-mode="'client'"
      show-footer
    />
  </DemoSection>
</template>

<style scoped>

.perf-blocked { font-size: 13px; margin: 0; opacity: 0.8; }

.perf-results { border-collapse: collapse; font-size: 13px; }
.perf-results th,
.perf-results td { padding: 4px 14px 4px 0; text-align: left; }
.perf-results th { font-weight: 600; opacity: 0.7; }
.perf-number { font-variant-numeric: tabular-nums; }
</style>
