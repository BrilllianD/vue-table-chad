<script setup lang="ts">
/**
 * The API reference — rendered by the library it documents.
 *
 * Every other view demonstrates the table over invented employees. This one
 * puts real data through it: every export, searchable, filterable by layer and
 * kind, groupable, sortable. If the reference is hard to use, the table is hard
 * to use, and there is nowhere to hide.
 *
 * The entries are generated: each summary is the first paragraph of the doc
 * comment on the declaration itself, harvested by `pnpm docs:api` into
 * `demo/src/data/apiReference.ts`. `tests/apiReference.spec.ts` regenerates it
 * and fails if the committed copy differs, so an export cannot be added
 * without being described, a described name cannot outlive its export, and a
 * summary cannot drift from the code it describes.
 */
import { shallowRef } from 'vue'
import { DataTable, useLocalDataSource, useTableState, type ColumnDef } from '@brillliand/vue-table-chad'
import { API_KINDS, API_LAYERS, apiReference, type ApiEntry } from '../data/apiReference'
import DemoSection from '../components/DemoSection.vue'

const rows = shallowRef<ApiEntry[]>(apiReference)

const columns: ColumnDef<ApiEntry>[] = [
  {
    id: 'name',
    header: 'Export',
    type: 'text',
    width: 230,
    // The identity of the row: it must not scroll away or be switched off.
    pinned: 'left',
    hideable: false,
  },
  {
    id: 'layer',
    header: 'Layer',
    type: 'enum',
    width: 130,
    // Declared options, so the checklist keeps every layer at count 0 rather
    // than reshuffling as you filter.
    options: API_LAYERS,
    // Not alphabetical: this is the order the layers stack in, which is the
    // order someone reading the library encounters them.
    comparator: (a, b) => API_LAYERS.indexOf(a as never) - API_LAYERS.indexOf(b as never),
  },
  {
    id: 'kind',
    header: 'Kind',
    type: 'enum',
    width: 130,
    options: API_KINDS,
  },
  {
    id: 'summary',
    header: 'What it is for',
    type: 'text',
    width: 620,
    // Sorting prose is meaningless, so the header offers only the filter.
    sortable: false,
  },
]

// `initialGroupBy` goes on the state, not on `DataTable`: the prop only seeds
// a state the component owns, and this view brings its own.
const state = useTableState({ pageSize: 25, initialGroupBy: ['layer'], groupMode: 'server' })
const source = useLocalDataSource<ApiEntry>(rows, columns, state.query)
</script>

<template>
  <DemoSection
    title="API reference"
    :blurb="`All ${apiReference.length} exports, rendered by the table they belong to. Search, filter by layer or
             kind, group by either, sort. A test diffs this list against src/index.ts both ways, so it
             cannot fall behind the code.`"
    :api="['DataTable', 'useLocalDataSource', 'useTableState', 'ColumnDef.comparator', 'ColumnDef.options']"
  >
    <DataTable
      :columns="columns"
      :source="source"
      :state="state"
    >
      <template #cell:name="{ text }">
        <code class="api-name">{{ text }}</code>
      </template>
      <template #cell:kind="{ text }">
        <span class="api-kind" :data-kind="text">{{ text }}</span>
      </template>
    </DataTable>
  </DemoSection>
</template>

<style scoped>
.api-name {
  font-size: 12.5px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}

.api-kind {
  font-size: 11.5px;
  padding: 1px 7px;
  border-radius: 999px;
  background: rgb(127 127 127 / 0.16);
}
.api-kind[data-kind='component'] { background: rgb(37 99 235 / 0.18); }
.api-kind[data-kind='composable'] { background: rgb(16 185 129 / 0.18); }
.api-kind[data-kind='type'] { background: rgb(168 85 247 / 0.16); }
</style>
