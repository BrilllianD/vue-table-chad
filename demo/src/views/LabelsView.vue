<script setup lang="ts">
/**
 * Every string the table renders, in one overridable record — four complete
 * locales shipped, and a hand-written partial beside them.
 *
 * Two things are worth watching as the locale flips. The table below takes the
 * record as a prop, so its toolbar, its pager, its filter panels and its
 * `aria-label`s all move together — nothing was translated cell by cell. And
 * the bare `<TablePagination>` further down has no `<DataTable>` above it at
 * all: it reads the same record out of `provideTableLabels`, which is how a
 * hand-assembled table gets translated without a preset in sight.
 *
 * The prop takes either shape. A shipped locale is a whole `TableLabels` and
 * has nothing to fall back to; a hand-written `Partial` is filled in from
 * `DEFAULT_LABELS` by `mergeLabels`, so what it leaves out renders in English
 * rather than as `undefined`.
 */
import { computed, createApp, h, onBeforeUnmount, onMounted, ref, shallowRef, type App } from 'vue'
import {
  DEFAULT_LABELS,
  DataTable,
  TablePagination,
  createTableLabels,
  mergeLabels,
  provideTableLabels,
  useLocalDataSource,
  useTableLabels,
  useTableState,
  type TableLabels,
  type TableState,
} from '@brillliand/vue-table-chad'
import { es, ja, ru, zhCN } from '@brillliand/vue-table-chad/locales'
import { employeeColumns } from '../columns'
import { employees, type Employee } from '../data/dataset'
import DemoSection from '../components/DemoSection.vue'
import ControlGroup from '../components/ControlGroup.vue'

const rows = shallowRef(employees.slice(0, 240))
const state: TableState = useTableState({ pageSize: 10 })
const source = useLocalDataSource<Employee>(rows, employeeColumns, state.query)

/**
 * The four shipped locales, imported from the package's own `locales` entry
 * point. Each is a *whole* `TableLabels`, so nothing falls back — flip to
 * Русский and the condition-filter panel is Russian too, down to the operator
 * names the core owns.
 */
const SHIPPED = { ru, es, ja, zhCN }

/**
 * And a hand-written partial beside them, deliberately six keys long: what a
 * consumer writes when their language is not shipped, or when they only want to
 * reword a few labels. Flip to Deutsch and most of the table is still English —
 * that is the fallback working, not a bug, and it is the difference between a
 * `Partial` and a shipped locale.
 */
const GERMAN: Partial<TableLabels> = {
  search: 'Suchen…',
  searchAllColumns: 'Alle Spalten durchsuchen',
  noRows: 'Keine Zeilen',
  rowsPerPage: 'Zeilen pro Seite',
  // Functions, because German puts `von` where English puts `of` and a
  // template with placeholders in it could not move the parts.
  rowRange: (first, last, total) => `${first}–${last} von ${total}`,
  pageSizeOption: (size) => `${size} / Seite`,
}

const locales = [
  { id: 'en', label: 'English (built-in default)', labels: undefined },
  { id: 'ru', label: 'Русский (shipped)', labels: SHIPPED.ru },
  { id: 'es', label: 'Español (shipped)', labels: SHIPPED.es },
  { id: 'ja', label: '日本語 (shipped)', labels: SHIPPED.ja },
  { id: 'zh', label: '简体中文 (shipped)', labels: SHIPPED.zhCN },
  { id: 'de', label: 'Deutsch (hand-written partial)', labels: GERMAN },
] as const

const locale = ref<(typeof locales)[number]['id']>('en')
const overrides = computed(() => locales.find((entry) => entry.id === locale.value)?.labels)

/**
 * Merged here as well as inside the table, for the panel that prints the
 * strings. The merge is cheap and pure, so a second one costs nothing worth
 * measuring — and `DEFAULT_LABELS` alone would print English while the table
 * printed French.
 */
const merged = computed(() => mergeLabels(overrides.value))

/**
 * The primitives below inject this rather than taking a prop, which is the same
 * route `<TableRoot>` uses internally. A `computed` and not a snapshot: flipping
 * the locale re-renders them with no remount.
 */
provideTableLabels(merged)

/** And back out again — what a primitive sees when it asks. */
const injected = useTableLabels()

/**
 * The app-wide route, shown by running it: a second Vue app, mounted into the
 * panel below, whose only configuration is
 * `app.use(createTableLabels(ja))`. Its pager is handed no `labels` and has no
 * `<DataTable>` above it, so every string it renders arrives from the plugin —
 * which is what a consumer gets by writing that one line in `main.ts`.
 *
 * It is a separate app on purpose. This view is a locale *switcher*, so the
 * demo itself must not install one app-wide; a real consumer picks a language
 * once and installs it once.
 */
const isolatedHost = ref<HTMLElement | null>(null)
let isolated: App | null = null

onMounted(() => {
  if (!isolatedHost.value) return
  isolated = createApp({
    render: () => h(TablePagination, { page: 2, pageSize: 25, total: 137 }),
  })
  isolated.use(createTableLabels(ja))
  isolated.mount(isolatedHost.value)
})

onBeforeUnmount(() => {
  isolated?.unmount()
  isolated = null
})

const standaloneTotal = 137
const standalonePage = ref(1)

const sampled = computed(() => [
  ['search', merged.value.search],
  ['noRows', merged.value.noRows],
  ['rowsPerPage', merged.value.rowsPerPage],
  ['emptyMessage', merged.value.emptyMessage],
  ['rowRange(1, 10, 240)', merged.value.rowRange(1, 10, 240)],
  ['selectedCount(3)', merged.value.selectedCount(3)],
  ['operators.contains', merged.value.operators.contains],
])
</script>

<template>
  <DemoSection
    title="Labels"
    :try-it="[
      'Switch to Русский and open a column filter: the operator names and the parse messages changed too.',
      'Switch to Deutsch: the pager is German, the search placeholder is German, and the rest fell back to English.',
    ]"
    blurb="Nothing in the library renders a string it did not read off the label record. Pass a
           partial of it and every layer follows — the preset's toolbar, the primitives underneath
           it, the accessible names, and the validation messages the core writes."
    :api="[
      'TableLabels',
      '@brillliand/vue-table-chad/locales',
      'DEFAULT_LABELS',
      'mergeLabels',
      'provideTableLabels',
      'useTableLabels',
      'createTableLabels',
      'TableLabelsKey',
      'DataTable.labels',
      'TableRoot.labels',
      'useTable labels option',
    ]"
  >
    <template #controls>
      <ControlGroup legend="labels prop">
        <label>
          <code>labels</code>
          <select v-model="locale">
            <option v-for="entry in locales" :key="entry.id" :value="entry.id">
              {{ entry.label }}
            </option>
          </select>
        </label>
        <template #hint>
          The four shipped locales are complete records, so nothing falls back — open the
          Conditions tab of a column filter and the operator names are translated too. Deutsch is a
          six-key <code>Partial</code> for contrast: what it leaves out falls back to
          <code>DEFAULT_LABELS</code> rather than rendering blank.
        </template>
      </ControlGroup>
    </template>

    <DataTable
      :columns="employeeColumns"
      :source="source"
      :state="state"
      :labels="overrides"
      selectable="multiple"
      show-search
      show-columns-menu
    />

    <section class="split">
      <div class="panel">
        <h4>A primitive with no table above it</h4>
        <p class="hint">
          <code>&lt;TablePagination&gt;</code> mounted on its own, with props and no
          <code>&lt;TableRoot&gt;</code>. It follows the locale because this view called
          <code>provideTableLabels</code>; drop that call and it renders English rather than
          failing, which is the standalone contract every primitive keeps.
        </p>
        <TablePagination
          :page="standalonePage"
          :page-size="25"
          :total="standaloneTotal"
          @update:page="standalonePage = $event"
        />
        <p class="hint">
          <code>useTableLabels().value.pagination</code> is
          <code>{{ injected.pagination }}</code>
        </p>
      </div>

      <div class="panel">
        <h4>One line in <code>main.ts</code></h4>
        <p class="hint">
          A second Vue app mounted here, configured with
          <code>app.use(createTableLabels(ja))</code> and nothing else. Its
          <code>&lt;TablePagination&gt;</code> is handed no <code>labels</code> and has no table
          above it, so its Japanese comes from the plugin alone — the app-wide route, as opposed to
          the per-table prop the switcher above drives.
        </p>
        <div ref="isolatedHost"></div>
        <p class="hint">
          A <code>labels</code> prop still wins over it, and wins per key: the inherited record is
          what the prop is merged over, so overriding one string in one table leaves the rest of the
          app's locale in place.
        </p>
      </div>

      <div class="panel">
        <h4>What the merge produced</h4>
        <table class="strings">
          <tbody>
            <tr v-for="[key, value] in sampled" :key="key">
              <td><code>{{ key }}</code></td>
              <td>{{ value }}</td>
            </tr>
          </tbody>
        </table>
        <p class="hint">
          <code>operators</code> and <code>parse</code> are merged one level deeper than the rest,
          so a `Partial` overriding one operator keeps the other fifteen — English
          <code>{{ DEFAULT_LABELS.operators.contains }}</code> under Deutsch, translated under any
          of the shipped four.
        </p>
      </div>
    </section>
  </DemoSection>
</template>

<style scoped>
.split { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 16px; }
.panel { display: flex; flex-direction: column; gap: 8px; }
.panel h4 { margin: 0; }
.strings { border-collapse: collapse; font-size: 12.5px; }
.strings td { padding: 2px 10px 2px 0; vertical-align: top; }
</style>
