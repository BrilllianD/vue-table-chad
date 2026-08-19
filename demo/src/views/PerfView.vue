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
 * It is also the proving ground for virtualization: turn the page size up to
 * 5000 and the numbers stop being about the pipeline and start being about the
 * DOM, which is exactly the point where pagination stops being enough.
 */
import { computed, nextTick, ref, shallowRef } from 'vue'
import { DataTable, useLocalDataSource, useTableState, valuesFilter } from '@sandbox/vue-table'
import { makeRows, type Employee } from '../data/dataset'
import { employeeColumns } from '../columns'
import DemoSection from '../components/DemoSection.vue'

/** The whole 10k, not a slice — every other view trims, this one must not. */
const rows = shallowRef<Employee[]>(makeRows(10_000))

const pageSize = ref(25)
const grouped = ref(false)

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
    blurb="The whole 10 000 rows, timed in the browser rather than in a benchmark. Each button runs
           its interaction several times and reports the median with the worst case beside it —
           measured to the frame after the paint, not to the tick after the patch."
    :api="['useLocalDataSource', 'debounceMs', 'DataTable pageSize', 'useTableState']"
  >
    <template #controls>
      <div class="perf-controls">
        <div class="perf-group">
          <span class="perf-legend">Interactions</span>
          <button type="button" :disabled="running" @click="measurePaging">Next page</button>
          <button type="button" :disabled="running" @click="measureSearch">Search keystroke</button>
          <button type="button" :disabled="running" @click="measureSort">Sort</button>
          <button type="button" :disabled="running" @click="toggleGrouping">
            {{ grouped ? 'Ungroup' : 'Group by department + role' }}
          </button>
        </div>

        <div class="perf-group">
          <span class="perf-legend">Rows on screen</span>
          <button
            v-for="size in [25, 100, 500, 1000, 5000]"
            :key="size"
            type="button"
            :disabled="running"
            :data-current="size === pageSize || undefined"
            @click="measurePageSize(size)"
          >
            {{ size }}
          </button>
        </div>

        <div class="perf-group">
          <button type="button" :disabled="running" @click="reset">Clear</button>
        </div>
      </div>

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
        page size {{ pageSize }}{{ grouped ? ' · grouped two levels' : '' }}. Paging and collapsing
        should stay flat as the dataset grows; rendering will not, which is what virtualization is
        for.
      </p>
    </template>

    <DataTable
      :columns="employeeColumns"
      :source="source"
      :state="state"
      :page-size="pageSize"
      :group-mode="'client'"
      show-footer
    />
  </DemoSection>
</template>

<style scoped>
.perf-controls { display: flex; flex-wrap: wrap; gap: 18px; align-items: flex-end; }
.perf-group { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.perf-legend { font-size: 12px; opacity: 0.65; margin-right: 2px; }
.perf-group button[data-current] { outline: 2px solid var(--vt-accent, #2563eb); }

.perf-blocked { font-size: 13px; margin: 0; opacity: 0.8; }

.perf-results { border-collapse: collapse; font-size: 13px; }
.perf-results th,
.perf-results td { padding: 4px 14px 4px 0; text-align: left; }
.perf-results th { font-weight: 600; opacity: 0.7; }
.perf-number { font-variant-numeric: tabular-nums; }
</style>
