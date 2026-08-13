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
    blurb="10,000 rows behind a fake API. Debounced filtering, race-safe responses, cached and
           scoped facets, kept-alive previous page, and an error path with retry. The request log
           is the proof — type in the search box and watch keystrokes coalesce into one request,
           then page and watch it fire instantly."
    :api="[
      'useServerDataSource',
      'debounceMs',
      'keepPreviousData',
      'immediate',
      'fetchFacets',
      'onError',
      'initialLoading',
      'refresh',
      'DataSource.remote',
    ]"
  >
    <template #controls>
      <div class="controls">
        <label>
          Latency {{ latencyMs }}ms
          <input v-model.number="latencyMs" type="range" min="0" max="2000" step="50" />
        </label>
        <label>
          <input
            type="checkbox"
            :checked="failureRate > 0"
            @change="failureRate = failureRate > 0 ? 0 : 0.5"
          />
          Flaky server (50% failures)
        </label>

        <span class="divider" />

        <label>
          debounceMs
          <input v-model.number="debounceMs" type="number" min="0" max="2000" step="50" />
        </label>
        <label><input v-model="keepPreviousData" type="checkbox" /> keepPreviousData</label>
        <label><input v-model="immediate" type="checkbox" /> immediate</label>
        <button type="button" @click="remount()">Apply (remounts the source)</button>
      </div>
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
    </div>
  </DemoSection>
</template>

<style scoped>
.divider { width: 1px; align-self: stretch; background: var(--line); }

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
