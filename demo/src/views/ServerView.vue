<script setup lang="ts">
/**
 * Identical markup to the Overview view — only the data source changed.
 *
 * The options that shape a server source (`debounceMs`, `keepPreviousData`,
 * `immediate`) are read once when the composable is created, so changing them
 * has to remount the table. That is what the `:key` below is for, and it is
 * honest about the constraint rather than pretending the options are reactive.
 */
import { ref } from 'vue'
import DemoSection from '../components/DemoSection.vue'
import ControlGroup from '../components/ControlGroup.vue'
import ToggleControl from '../components/ToggleControl.vue'
import RangeControl from '../components/RangeControl.vue'
import ServerTable from './ServerTable.vue'
import { clearRequestLog, requestLog } from '../data/fakeApi'

const latencyMs = ref(450)
const failureRate = ref(0)
const debounceMs = ref(300)
const keepPreviousData = ref(true)
const immediate = ref(true)

/** Bumped to force a fresh `useServerDataSource` with the new options. */
const remountKey = ref(0)

function remount(): void {
  clearRequestLog()
  remountKey.value += 1
}

function outcomeClass(outcome: string): string {
  return `log-${outcome}`
}
</script>

<template>
  <DemoSection
    title="Server data"
    :try-it="[
      'Type in the search box and watch the request log: one request per pause, not per keystroke.',
      'Page while a slow request is in flight — the earlier response is discarded, not shown late.',
      'Turn flaky on and page until a request fails; the table keeps its rows and offers a retry.',
    ]"
    blurb="10,000 rows behind a fake API. Debounced filtering, race-safe responses, cached and
           scoped facets, kept-alive previous page, and an error path with retry. The request log
           is the proof — type in the search box and watch keystrokes coalesce into one request,
           then page and watch it fire instantly. The pager is the #pagination slot filled with
           TablePagination itself, so only its summary differs from every other view's."
    :api="[
      'useServerDataSource',
      'debounceMs',
      'keepPreviousData',
      'immediate',
      'fetchFacets',
      'onError',
      'initialLoading',
      'DataTable.loadingMessage',
      'refresh',
      'DataSource.remote',
      'DataTable cellCursor',
      'TablePagination',
    ]"
  >
    <template #controls>
      <ControlGroup legend="The fake server" hint="Both take effect on the next request.">
        <RangeControl v-model="latencyMs" label="latency" :min="0" :max="2000" :step="50" unit="ms" />
        <ToggleControl
          :model-value="failureRate > 0"
          label="flaky"
          hint="half of all requests fail — the error slot and the retry show"
          @update:model-value="failureRate = $event ? 0.5 : 0"
        />
      </ControlGroup>

      <ControlGroup
        legend="useServerDataSource options"
        hint="Options are read once, when the source is created, so Apply remounts it."
      >
        <label>
          <code>debounceMs</code>
          <input v-model.number="debounceMs" type="number" min="0" max="2000" step="50" />
        </label>
        <ToggleControl
          v-model="keepPreviousData"
          label="keepPreviousData"
          code
          hint="keep showing the old page while the next loads"
        />
        <ToggleControl
          v-model="immediate"
          label="immediate"
          code
          hint="fetch on creation, or wait for the first query change"
        />
        <button type="button" @click="remount()">Apply</button>
      </ControlGroup>
    </template>

    <ServerTable
      :key="remountKey"
      :latency-ms="latencyMs"
      :failure-rate="failureRate"
      :debounce-ms="debounceMs"
      :keep-previous-data="keepPreviousData"
      :immediate="immediate"
    />

    <div class="log">
      <div class="log-head">
        <strong>Request log</strong>
        <button type="button" class="vt-btn vt-btn-link" @click="clearRequestLog()">Clear</button>
      </div>
      <p v-if="requestLog.length === 0" class="hint">No requests yet.</p>
      <ol v-else>
        <li v-for="entry in requestLog" :key="entry.id">
          <span class="log-id">#{{ entry.id }}</span>
          <span class="log-kind">{{ entry.kind }}</span>
          <span class="log-label">{{ entry.label }}</span>
          <span :class="['log-outcome', outcomeClass(entry.outcome)]">{{ entry.outcome }}</span>
          <span class="log-ms">{{ entry.ms || '—' }}{{ entry.ms ? 'ms' : '' }}</span>
        </li>
      </ol>
      <p class="hint">
        <strong>aborted</strong> entries are the race guard doing its job: a newer request
        superseded that one, and its response can no longer overwrite the newer result even if it
        arrives later.
      </p>
      <p class="hint">
        The cell cursor is switched on here, because a page turn that answers later is the one thing
        the local views cannot show. Push the latency up, click a cell in the middle of the table and
        page forward: the ring stays on the row you were reading for the whole request — that page is
        still what is rendered — and lands at the same height on the new one. Turn the failure rate
        up and a page turn that never arrives moves it nowhere at all.
      </p>
    </div>
  </DemoSection>
</template>

<style scoped>

.log { border: 1px solid var(--line); border-radius: 8px; padding: 10px 12px; font-size: 12.5px; }
.log-head { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.log ol { margin: 0; padding: 0; list-style: none; display: grid; gap: 2px; }
.log li {
  display: grid;
  grid-template-columns: 46px 54px 1fr 72px 62px;
  gap: 8px;
  align-items: baseline;
  font-variant-numeric: tabular-nums;
}
.log-id { opacity: 0.5; }
.log-kind { opacity: 0.65; }
.log-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.log-outcome { font-weight: 600; }
.log-ms { opacity: 0.6; text-align: right; }
.log-ok { color: var(--ok); }
.log-error { color: var(--bad); }
.log-aborted { color: var(--warn); }
.log-pending { opacity: 0.6; }
</style>
