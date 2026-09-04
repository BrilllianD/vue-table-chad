/**
 * The shipped locales, behind their own entry point.
 *
 * `import { ru } from '@brillliand/vue-table-chad/locales'` rather than off the
 * package root, so a consumer who imports none ships none: the locales are
 * strings and nothing else, they import no runtime value from `src/core`, and a
 * second bundle entry keeps them out of the main chunk instead of relying on a
 * bundler to tree-shake four frozen objects out of it.
 *
 * Each is a *whole* `TableLabels`, never a `Partial`. A locale covering nine
 * tenths of the record would render the last tenth in English with nothing
 * saying which tenth; the type makes that a build error in this repo instead of
 * a surprise in someone's app. `tests/locales.spec.ts` checks the nested
 * `operators` and `parse` maps the same way, since a missing key there is
 * `undefined` at render time rather than a type error.
 *
 * Pass one straight to the `labels` prop — no merge needed, because there is
 * nothing left to fall back to:
 *
 * ```vue
 * <DataTable :columns="columns" :source="source" :state="state" :labels="ru" />
 * ```
 */
export { ru } from './ru'
export { es } from './es'
export { ja } from './ja'
export { zhCN } from './zhCN'
