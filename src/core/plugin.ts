import { computed, toValue, type App, type MaybeRefOrGetter, type Plugin } from 'vue'
import { TableLabelsKey } from './context'
import { mergeLabels, type TableLabels } from './labels'

/**
 * A Vue plugin that sets the wording for every table in the app at once.
 *
 * ```ts
 * import { createTableLabels } from '@brillliand/vue-table-chad'
 * import { ru } from '@brillliand/vue-table-chad/locales'
 *
 * createApp(App).use(createTableLabels(ru)).mount('#app')
 * ```
 *
 * The alternative was to hand `:labels` to every `<DataTable>` in the app,
 * which is the same locale written out once per table and one of them
 * eventually forgotten. This publishes the record on `TableLabelsKey` from the
 * app root, above every table, so `DataTable`, `TableRoot` and any bare
 * primitive inherit it with nothing passed down.
 *
 * A `labels` prop still wins, and wins *per key*: it is merged over the
 * inherited record rather than over English, so overriding one string in one
 * table keeps the rest of the app's locale.
 *
 * Takes a ref or a getter as readily as a plain record, so a locale switcher
 * that writes to a ref re-renders every table in place. The `computed` here
 * lives outside any component scope on purpose — it belongs to the app, not to
 * whichever component happened to read it first, and an app-lifetime value has
 * nothing to be disposed by.
 */
export function createTableLabels(
  labels: MaybeRefOrGetter<Partial<TableLabels> | undefined>,
): Plugin {
  const record = computed(() => mergeLabels(toValue(labels)))
  return {
    install(app: App): void {
      app.provide(TableLabelsKey, record)
    },
  }
}
