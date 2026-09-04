<script setup lang="ts">
/**
 * Every string the table renders, in one overridable record.
 *
 * Two things are worth watching as the locale flips. The table below takes the
 * record as a prop, so its toolbar, its pager, its filter panels and its
 * `aria-label`s all move together — nothing was translated cell by cell. And
 * the bare `<TablePagination>` further down has no `<DataTable>` above it at
 * all: it reads the same record out of `provideTableLabels`, which is how a
 * hand-assembled table gets translated without a preset in sight.
 *
 * A locale is a `Partial`, never a whole record. `mergeLabels` fills the rest
 * from `DEFAULT_LABELS`, so a half-finished translation renders half in English
 * rather than rendering `undefined`.
 */
import { computed, ref, shallowRef } from 'vue'
import {
  DEFAULT_LABELS,
  DataTable,
  TablePagination,
  mergeLabels,
  provideTableLabels,
  useLocalDataSource,
  useTableLabels,
  useTableState,
  type TableLabels,
  type TableState,
} from '@brillliand/vue-table-chad'
import { employeeColumns } from '../columns'
import { employees, type Employee } from '../data/dataset'
import DemoSection from '../components/DemoSection.vue'

const rows = shallowRef(employees.slice(0, 240))
const state: TableState = useTableState({ pageSize: 10 })
const source = useLocalDataSource<Employee>(rows, employeeColumns, state.query)

/**
 * Partial on purpose, and short on purpose: enough keys to translate what this
 * view actually shows, with the rest left to fall through. Flip to Français and
 * the condition-filter panel is still half English — that is the fallback
 * working, not a bug, and it is what makes shipping a locale incrementally
 * possible.
 */
const FRENCH: Partial<TableLabels> = {
  search: 'Rechercher…',
  searchAllColumns: 'Rechercher dans toutes les colonnes',
  searchValuesPlaceholder: 'Rechercher des valeurs…',
  searchValues: 'Rechercher des valeurs',
  clear: 'Effacer',
  clearAll: 'Tout effacer',
  apply: 'Appliquer',
  save: 'Enregistrer',
  cancel: 'Annuler',
  loading: 'Chargement…',
  noRows: 'Aucune ligne',
  noMatchingValues: 'Aucune valeur correspondante',
  emptyMessage: 'Aucune ligne ne correspond aux filtres actuels.',
  selectAllOnPage: 'Sélectionner toutes les lignes de cette page',
  selectAllValues: 'Tout sélectionner',
  selectAllRow: '(Tout sélectionner)',
  blanksCheckbox: 'Vides',
  blanksFacet: '(Vides)',
  pagination: 'Pagination',
  firstPage: 'Première page',
  previousPage: 'Page précédente',
  nextPage: 'Page suivante',
  lastPage: 'Dernière page',
  rowsPerPage: 'Lignes par page',
  groupBy: 'Grouper par',
  columns: 'Colonnes',
  showAll: 'Tout afficher',
  resetLayout: 'Réinitialiser la disposition',
  filter: 'Filtrer',
  filterValuesTab: 'Valeurs',
  filterConditionsTab: 'Conditions',
  blankGroup: '(Vide)',
  // The interpolating keys are functions, which is the whole reason they are:
  // French puts `sur` between the two halves and German would not.
  rowRange: (first, last, total) => `${first}–${last} sur ${total}`,
  pageSizeOption: (size) => `${size} / page`,
  selectedCount: (count) => `${count} sélectionnée(s)`,
  valueCount: (count) => `${count} valeurs`,
  sortByColumn: (columnLabel) => `Trier par ${columnLabel}`,
  filterColumn: (columnLabel) => `Filtrer ${columnLabel}`,
  clearFilterOn: (columnLabel) => `Effacer le filtre sur ${columnLabel}`,
}

/** German, deliberately thinner still — three keys and the fallback for the rest. */
const GERMAN: Partial<TableLabels> = {
  search: 'Suchen…',
  searchAllColumns: 'Alle Spalten durchsuchen',
  noRows: 'Keine Zeilen',
  rowsPerPage: 'Zeilen pro Seite',
  rowRange: (first, last, total) => `${first}–${last} von ${total}`,
  pageSizeOption: (size) => `${size} / Seite`,
}

const locales = [
  { id: 'en', label: 'English (defaults)', labels: undefined },
  { id: 'fr', label: 'Français', labels: FRENCH },
  { id: 'de', label: 'Deutsch (partial)', labels: GERMAN },
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
    blurb="Nothing in the library renders a string it did not read off the label record. Pass a
           partial of it and every layer follows — the preset's toolbar, the primitives underneath
           it, the accessible names, and the validation messages the core writes."
    :api="[
      'TableLabels',
      'DEFAULT_LABELS',
      'mergeLabels',
      'provideTableLabels',
      'useTableLabels',
      'DataTable.labels',
      'TableRoot.labels',
      'useTable labels option',
    ]"
  >
    <template #controls>
      <div class="controls">
        <label>
          locale
          <select v-model="locale">
            <option v-for="entry in locales" :key="entry.id" :value="entry.id">
              {{ entry.label }}
            </option>
          </select>
        </label>
        <span class="hint">
          Français covers the keys this view shows; Deutsch covers six. What is missing falls back
          to <code>DEFAULT_LABELS</code> rather than rendering blank — open the Conditions tab of a
          column filter to see the seam.
        </span>
      </div>
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
          so overriding one operator keeps the other fifteen. Untouched here, so it still reads
          <code>{{ DEFAULT_LABELS.operators.contains }}</code>.
        </p>
      </div>
    </section>
  </DemoSection>
</template>

<style scoped>
.controls { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; }
.split { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 16px; }
.panel { display: flex; flex-direction: column; gap: 8px; }
.panel h4 { margin: 0; }
.strings { border-collapse: collapse; font-size: 12.5px; }
.strings td { padding: 2px 10px 2px 0; vertical-align: top; }
</style>
