<script setup lang="ts">
import { createApp, defineComponent, h, onBeforeUnmount, onMounted, ref, shallowRef, type App } from 'vue'
import {
  DataTable,
  createTableLabels,
  useLocalDataSource,
  useTableState,
  type ColumnDef,
} from '@brillliand/vue-table-chad'
import { ru } from '@brillliand/vue-table-chad/locales'
import '@brillliand/vue-table-chad/style.css'

type Person = { id: number; name: string; department: string; salary: number }

const columns: ColumnDef<Person>[] = [
  // Headers are the caller's own copy, so the app's i18n owns them. The label
  // record covers what the library writes: the search box, the pager, the
  // filter panels, the accessible names.
  { id: 'name', header: 'Имя', type: 'text' },
  {
    id: 'department',
    header: 'Отдел',
    type: 'enum',
    options: ['Инженерия', 'Дизайн', 'Продажи', 'Поддержка'],
  },
  {
    id: 'salary',
    header: 'Зарплата',
    type: 'number',
    align: 'right',
    format: (v) => (v == null ? '—' : `${Number(v).toLocaleString('ru-RU')} ₽`),
  },
]

/*
  A plain table. No `labels` prop, no locale imported here — this is what every
  table in the app looks like once the plugin is installed.
*/
const Table = defineComponent({
  setup() {
    const rows = shallowRef<Person[]>(
      Array.from({ length: 120 }, (_, i) => ({
        id: i + 1,
        name: `Сотрудник ${i + 1}`,
        department: ['Инженерия', 'Дизайн', 'Продажи', 'Поддержка'][i % 4]!,
        salary: 50_000 + ((i * 7919) % 90_000),
      })),
    )
    const state = useTableState({ pageSize: 8 })
    const source = useLocalDataSource(rows, columns, state.query)

    return () =>
      h(DataTable as never, { columns, source, state, showSearch: true, selectable: 'multiple' })
  },
})

/*
  In an app of your own, that is the whole recipe — one line in `main.ts`:

    createApp(App).use(createTableLabels(ru)).mount('#app')

  This page is already running inside an app it does not own, so the same line
  runs against a second one mounted into the div below. Nothing else changes:
  `Table` above is handed no wording at all and renders Russian, and so would a
  bare `<TablePagination>` with no table above it.

  Hand the plugin a ref or a getter instead of `ru` and a language switch
  re-renders every table in place. A `labels` prop still wins where one is
  given, and wins per key — it is merged over this record rather than over
  English, so rewording one string in one table keeps the rest of the locale.
*/
const host = ref<HTMLElement | null>(null)
let app: App | null = null

onMounted(() => {
  if (!host.value) return
  app = createApp(Table)
  app.use(createTableLabels(ru))
  app.mount(host.value)
})

onBeforeUnmount(() => {
  app?.unmount()
  app = null
})
</script>

<template>
  <div ref="host"></div>
</template>
