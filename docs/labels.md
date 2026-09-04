# Labels and i18n

<script setup>
import Example from './.vitepress/examples/labels.vue'
</script>

<Demo :is="Example" />

<<< @/.vitepress/examples/labels.vue

Every string the library renders — button text, placeholders, empty and error
states, the `aria-label`s screen readers announce, the validation messages the
core writes — comes off one record. Override the keys you have translations for
and leave the rest; what you leave falls back to English rather than rendering
blank.

```ts
import type { TableLabels } from '@brillliand/vue-table-chad'

const fr: Partial<TableLabels> = {
  search: 'Rechercher…',
  searchAllColumns: 'Rechercher dans toutes les colonnes',
  noRows: 'Aucune ligne',
  rowsPerPage: 'Lignes par page',
  rowRange: (first, last, total) => `${first}–${last} sur ${total}`,
}
```

```vue
<DataTable :columns="columns" :source="source" :state="state" :labels="fr" />
```

That is the whole surface for the preset. The prop is a `Partial`, it is
reactive, and swapping it re-renders in place — no remount, no key trick.

## Shipped locales

Four languages ship complete, behind their own entry point:

```ts
import { es, ja, ru, zhCN } from '@brillliand/vue-table-chad/locales'
```

| Export | Language |
| --- | --- |
| `ru` | Russian |
| `es` | Spanish |
| `ja` | Japanese |
| `zhCN` | Simplified Chinese |

Each is a whole `TableLabels`, not a `Partial`, so there is nothing to merge and
nothing left in English — the filter operators and the cell-editor parse messages
the core owns are translated too:

```vue
<DataTable :columns="columns" :source="source" :state="state" :labels="ru" />
```

They are a separate entry point on purpose. The locales import no runtime value
from the library, so a consumer who imports none downloads none — `pnpm size`
budgets `dist/locales.js` on its own line, and adding a language is visible
there rather than hidden in the main bundle.

Completeness is enforced rather than intended. The type fails to compile when a
flat key is missing, and `tests/locales.spec.ts` covers what the type cannot see:
the nested `operators` and `parse` maps, a label function that drops an argument
it was handed, and the pin sides `pinState` interpolates. A locale covering nine
tenths of the record would render the last tenth in English with nothing saying
which tenth, which is worse than no locale at all.

Your language is not there? Write the `Partial` below — it is the same prop.

## Why some keys are functions

Any label that interpolates is a function rather than a string with `{}`
placeholders in it:

```ts
rowRange: (first: number, last: number, total: number) => string
expandGroup: (columnLabel: string, groupLabel: string) => string
searchIn: (label: string | undefined) => string
```

A template string fixes the order of its parts in English. A function does not:
French writes `1–10 sur 240`, German `1–10 von 240`, and a language that puts
the noun last can reorder them outright. The same reasoning splits the
expand/collapse pairs into two whole messages — `expandGroup` and
`collapseGroup` — instead of one message with an `Expand`/`Collapse` word
concatenated onto the front of it.

Two keys are nested records rather than flat strings, and they merge one level
deeper than the rest, so overriding a single operator keeps the other fifteen:

```ts
const labels = { operators: { contains: 'contient' } }
// merged.operators.between is still 'Between'
```

`operators` is keyed by `ConditionOperator` and `parse` by `ColumnDataType` —
the messages a cell editor produces when a typed value will not parse.

## Below the preset

`DataTable` forwards the prop; `TableRoot` takes the same one, and `useTable`
the same option:

```ts
const table = useTable({ columns, source, state, labels: () => fr })
```

A getter, matching `columns` and `source`, so a locale switch is reactive at
every layer.

Primitives read the record out of an injection rather than a prop, on a key of
their own — `provideTableLabels` / `useTableLabels` — for the reason the theme
uses its own key: a caller assembling a table by hand should not have to satisfy
a full `TableContext` to translate a pager.

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { mergeLabels, provideTableLabels } from '@brillliand/vue-table-chad'

provideTableLabels(computed(() => mergeLabels(fr)))
</script>

<template>
  <TablePagination :page="page" :page-size="25" :total="total" />
</template>
```

A primitive with no provider above it renders English rather than failing, which
is the standalone contract every primitive keeps. `useTableLabels()` returns
`DEFAULT_LABELS` when nothing was provided.

## The pure functions

`core/` cannot inject, so the functions that produce messages take the record as
a trailing argument defaulting to `DEFAULT_LABELS`:

```ts
validateCell(value, column, row, labels)
```

`useRowEditing` takes a `labels` option of its own, because an editing session is
built before the table it belongs to and handed in.

One label is not purely presentational: `blankGroup`, the caption on the group
holding rows whose grouped value is empty. It is a grouping *key*, so changing it
rebuilds the group tree — work that was asked for, not a leak. `useTable`'s
`blankGroupLabel` option still outranks it.

## What keeps it honest

`tests/labels.spec.ts` reads the source of every component and every core module
and fails on a hardcoded string: an `aria-label`, `placeholder` or `title` holding
a literal, a rendered text node holding a word, a core module holding a sentence.
It names the file and the line. Icons (`×`, `‹`, `↑` and the rest) and
developer-facing text (`devWarn`, `new Error`, `console`) are allowlisted; nothing
else is.

The point is that the record cannot drift behind the components. A string written
directly into a template fails the build the moment it is written, rather than
being discovered later by a consumer who cannot translate it.

## The default record

`DEFAULT_LABELS` is exported and frozen. Read a key off it to see today's English,
or spread it as the base of a full translation:

```ts
import { DEFAULT_LABELS, mergeLabels } from '@brillliand/vue-table-chad'

DEFAULT_LABELS.noRows           // 'No rows'
mergeLabels(fr).operators.between // 'Between' — untouched by the override
```

Keys are named for the *role* a string plays, never for the English it holds
today, so rewording a default is not a breaking rename.

---

Live: the **Labels** tab of `pnpm demo` (`#labels`). Back to the [docs index](/).
