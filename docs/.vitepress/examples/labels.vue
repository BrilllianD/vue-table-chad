<script setup lang="ts">
import { computed, ref, shallowRef } from 'vue'
import {
  DataTable,
  useLocalDataSource,
  useTableState,
  type ColumnDef,
  type TableLabels,
} from '@brillliand/vue-table-chad'
import '@brillliand/vue-table-chad/style.css'

type Person = { id: number; name: string; department: string; salary: number }

const columns: ColumnDef<Person>[] = [
  { id: 'name', header: 'Nom', type: 'text' },
  {
    id: 'department',
    header: 'Service',
    type: 'enum',
    options: ['Ingénierie', 'Design', 'Ventes', 'Support'],
  },
  {
    id: 'salary',
    header: 'Salaire',
    type: 'number',
    align: 'right',
    format: (v) => (v == null ? '—' : `${Number(v).toLocaleString('fr-FR')} €`),
  },
]

const rows = shallowRef<Person[]>(
  Array.from({ length: 120 }, (_, i) => ({
    id: i + 1,
    name: `Personne ${i + 1}`,
    department: ['Ingénierie', 'Design', 'Ventes', 'Support'][i % 4]!,
    salary: 50_000 + ((i * 7919) % 90_000),
  })),
)

const state = useTableState({ pageSize: 8 })
const source = useLocalDataSource(rows, columns, state.query)

// A `Partial`, never the whole record: anything left out falls back to
// `DEFAULT_LABELS`, so a translation can ship a key at a time. The
// interpolating labels are functions rather than templates with placeholders,
// which is what lets a translation put the parts in a different order —
// French says `1–8 sur 120` where English says `1–8 of 120`.
const french: Partial<TableLabels> = {
  search: 'Rechercher…',
  searchAllColumns: 'Rechercher dans toutes les colonnes',
  searchValuesPlaceholder: 'Rechercher des valeurs…',
  clear: 'Effacer',
  clearAll: 'Tout effacer',
  apply: 'Appliquer',
  noRows: 'Aucune ligne',
  noMatchingValues: 'Aucune valeur correspondante',
  emptyMessage: 'Aucune ligne ne correspond aux filtres actuels.',
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
  columns: 'Colonnes',
  showAll: 'Tout afficher',
  resetLayout: 'Réinitialiser la disposition',
  filter: 'Filtrer',
  filterValuesTab: 'Valeurs',
  filterConditionsTab: 'Conditions',
  rowRange: (first, last, total) => `${first}–${last} sur ${total}`,
  pageSizeOption: (size) => `${size} / page`,
  valueCount: (count) => `${count} valeurs`,
  sortByColumn: (columnLabel) => `Trier par ${columnLabel}`,
  filterColumn: (columnLabel) => `Filtrer ${columnLabel}`,
  clearFilterOn: (columnLabel) => `Effacer le filtre sur ${columnLabel}`,
}

// The prop is reactive: flipping it re-renders in place, with no remount and no
// key trick, which is what a language switcher needs.
const translated = ref(true)
const labels = computed(() => (translated.value ? french : undefined))
</script>

<template>
  <DataTable :columns="columns" :source="source" :state="state" :labels="labels">
    <template #toolbar>
      <label>
        <input v-model="translated" type="checkbox" />
        French labels
      </label>
    </template>
  </DataTable>
</template>
