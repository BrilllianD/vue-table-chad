<script setup lang="ts">
import { computed, ref, shallowRef } from 'vue'
import {
  DataTable,
  useLocalDataSource,
  useTableState,
  type ColumnDef,
  type TableLabels,
} from '@brillliand/vue-table-chad'
import { es, ja, ru, zhCN } from '@brillliand/vue-table-chad/locales'
import '@brillliand/vue-table-chad/style.css'

type Person = { id: number; name: string; department: string; salary: number }

const columns: ColumnDef<Person>[] = [
  // Column headers are the caller's data, not the library's copy — the label
  // record does not touch them, so they stay in whatever language the app's own
  // i18n put there.
  { id: 'name', header: 'Name', type: 'text' },
  {
    id: 'department',
    header: 'Department',
    type: 'enum',
    options: ['Engineering', 'Design', 'Sales', 'Support'],
  },
  {
    id: 'salary',
    header: 'Salary',
    type: 'number',
    align: 'right',
    format: (v) => (v == null ? '—' : `$${Number(v).toLocaleString()}`),
  },
]

const rows = shallowRef<Person[]>(
  Array.from({ length: 120 }, (_, i) => ({
    id: i + 1,
    name: `Person ${i + 1}`,
    department: ['Engineering', 'Design', 'Sales', 'Support'][i % 4]!,
    salary: 50_000 + ((i * 7919) % 90_000),
  })),
)

const state = useTableState({ pageSize: 8 })
const source = useLocalDataSource(rows, columns, state.query)

// The shipped locales are whole records, so there is nothing to merge and
// nothing left in English — including the filter operators and the parse
// messages the core owns.
const locales = { en: undefined, ru, es, ja, zhCN }
type Locale = keyof typeof locales | 'de'
const locale = ref<Locale>('ru')

// A hand-written `Partial` takes the same prop, for a language that is not
// shipped or for rewording a few labels. What it leaves out falls back to
// `DEFAULT_LABELS`; the interpolating keys are functions because German puts
// `von` where English puts `of`.
const german: Partial<TableLabels> = {
  search: 'Suchen…',
  noRows: 'Keine Zeilen',
  rowsPerPage: 'Zeilen pro Seite',
  rowRange: (first, last, total) => `${first}–${last} von ${total}`,
}

// Reactive: flipping it re-renders in place, with no remount and no key trick,
// which is what a language switcher needs.
const labels = computed(() => (locale.value === 'de' ? german : locales[locale.value]))
</script>

<template>
  <DataTable :columns="columns" :source="source" :state="state" :labels="labels">
    <template #toolbar>
      <label>
        Locale
        <select v-model="locale">
          <option value="en">English (default)</option>
          <option value="ru">Русский</option>
          <option value="es">Español</option>
          <option value="ja">日本語</option>
          <option value="zhCN">简体中文</option>
          <option value="de">Deutsch (hand-written partial)</option>
        </select>
      </label>
    </template>
  </DataTable>
</template>
