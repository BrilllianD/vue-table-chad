import { computed, toValue, type App, type MaybeRefOrGetter, type Plugin } from 'vue'
import { TableDefaultThemeKey, TableLabelsKey, type TableTheme } from './context'
import { mergeLabels, type TableLabels } from './labels'

/** What `createTable` takes. Each option is a plain value, a ref or a getter. */
export interface TablePluginOptions {
  /** Wording for every table in the app; see `createTableLabels`. */
  labels?: MaybeRefOrGetter<Partial<TableLabels> | undefined>
  /** The locale tag. Outranks the `locale` inside `labels`. */
  locale?: MaybeRefOrGetter<string | undefined>
  /** The palette of every `DataTable` and `TableRoot` that is given no `theme` prop. */
  theme?: MaybeRefOrGetter<TableTheme | undefined>
}

/**
 * A Vue plugin that configures every table in the app at once: wording,
 * locale and default theme.
 *
 * ```ts
 * import { createTable } from '@brillliand/vue-table-chad'
 * import { ru } from '@brillliand/vue-table-chad/locales'
 *
 * createApp(App).use(createTable({ labels: ru, theme: 'dark' })).mount('#app')
 * ```
 *
 * The alternative was to hand `:labels` and `:theme` to every `<DataTable>` in
 * the app, which is the same choice written out once per table and one of them
 * eventually forgotten. The labels record is published on `TableLabelsKey` from
 * the app root, above every table, so `DataTable`, `TableRoot` and any bare
 * primitive inherit it with nothing passed down.
 *
 * `TableRoot` hands the theme to its teleported primitives only, since it renders
 * no element of its own.
 *
 * A `labels` prop still wins, and wins *per key*: it is merged over the
 * inherited record rather than over English, so overriding one string in one
 * table keeps the rest of the app's locale. A `theme` prop wins outright,
 * `'system'` included.
 *
 * Each option takes a ref or a getter as readily as a plain value, so a locale
 * switcher that writes to a ref re-renders every table in place. The
 * `computed`s here live outside any component scope on purpose — they belong to
 * the app, not to whichever component happened to read them first, and an
 * app-lifetime value has nothing to be disposed by.
 *
 * An option left out provides nothing: `createTable({ theme })` publishes no
 * labels record, so it can sit beside `createTableLabels` without Vue warning
 * about a key provided twice. `labels` and `locale` both publish that record,
 * so neither goes beside `createTableLabels`.
 */
export function createTable(options: TablePluginOptions = {}): Plugin {
  const { labels, locale, theme } = options
  const record = computed(() => {
    const base = toValue(labels)
    const tag = toValue(locale)
    return mergeLabels(tag === undefined ? base : { ...base, locale: tag })
  })
  const palette = computed(() => toValue(theme))
  return {
    install(app: App): void {
      if (labels !== undefined || locale !== undefined) app.provide(TableLabelsKey, record)
      if (theme !== undefined) app.provide(TableDefaultThemeKey, palette)
    },
  }
}

/**
 * A Vue plugin that sets the wording for every table in the app at once: the
 * labels-only form of `createTable`, `createTableLabels(x)` being
 * `createTable({ labels: x })`.
 *
 * ```ts
 * import { createTableLabels } from '@brillliand/vue-table-chad'
 * import { ru } from '@brillliand/vue-table-chad/locales'
 *
 * createApp(App).use(createTableLabels(ru)).mount('#app')
 * ```
 *
 * See `createTable` for how the record is inherited and overridden.
 */
export function createTableLabels(
  labels: MaybeRefOrGetter<Partial<TableLabels> | undefined>,
): Plugin {
  return createTable({ labels })
}
