# Recipes

<script setup>
import Recipe1 from './.vitepress/examples/recipe-1.vue'
import Recipe2 from './.vitepress/examples/recipe-2.vue'
import Recipe3 from './.vitepress/examples/recipe-3.vue'
import Recipe4 from './.vitepress/examples/recipe-4.vue'
import Recipe5 from './.vitepress/examples/recipe-5.vue'
import Recipe6 from './.vitepress/examples/recipe-6.vue'
import Recipe7 from './.vitepress/examples/recipe-7.vue'
</script>

What to type. Every other page is a live table you can poke; this one is the code that gets you
one. Ported from `pnpm demo`'s **Recipes** view, which now links back here instead of being the
only place they exist.

## A table, from nothing

Three pieces: state (what to show), a source (where rows come from), and the preset that renders
them. `type` is what makes filters and sorting behave — it picks the comparator and decides which
operators the filter panel offers.

<Demo :is="Recipe1" />

<<< @/.vitepress/examples/recipe-1.vue

## Rows from a server

Swap the source and nothing above it changes — both satisfy the same `DataSource` contract. A
server source adds debouncing on filter/search/sort (never on paging), abort-and-race safety so a
slow earlier response cannot overwrite a fast later one, and `keepPreviousData` so the table does
not blank out between pages.

<Demo :is="Recipe2" />

<<< @/.vitepress/examples/recipe-2.vue

## A shareable table

`QueryState` is deliberately JSON-safe, so the whole view — sort, filters, page, search — fits in a
URL or a store. Hand `useTableState` a ref through its `state` option and that ref becomes the
single source of truth: the table writes straight through to it, and writing to it from outside
(a route change, a store mutation) moves the table.

<Demo :is="Recipe3" />

<<< @/.vitepress/examples/recipe-3.vue

## Banded rows, with totals

Declare an `aggregate` on a column and every band gets that figure, plus the footer if you ask for
one with `show-footer`. `groupMode` decides who does the work: `'client'` (the default) bands the
rows already loaded and never refetches; `'server'` puts the grouping in the query instead, so
bands stay whole across pages and counts describe the entire group rather than one page of it.

<Demo :is="Recipe4" />

<<< @/.vitepress/examples/recipe-4.vue

## Retheming without touching a component

The preset's stylesheet hangs entirely off CSS variables. One thing to get right: a palette is a
*set*. Overriding a light header colour while `--vtc-text` stays on its dark-mode value gives you
white-on-white — see [Styling](styling.md) for the whole list and how cell backgrounds stack.

<Demo :is="Recipe5" />

<<< @/.vitepress/examples/recipe-5.vue

## When the preset does not fit

`TableRoot` renders nothing of its own — the slot receives everything and decides the markup
entirely. The preset is just one caller of it. Drop to the primitives and the same state, sorting,
filtering and selection drive whatever you build, table or not — see
[Composing your own](composing.md).

<Demo :is="Recipe6" />

<<< @/.vitepress/examples/recipe-6.vue

## One language for the whole app

`app.use(createTableLabels(ru))` in `main.ts` and every table in the app renders Russian with no
`labels` prop anywhere — the preset, the primitives underneath it, and a bare `<TablePagination>`
with no table above it. Hand the plugin a ref or a getter instead of a record and a language switch
re-renders them all in place. A `labels` prop still wins where one is given, and wins per key: it is
merged over the app's record rather than over English — see [Labels and i18n](labels.md).

<Demo :is="Recipe7" />

<<< @/.vitepress/examples/recipe-7.vue

Live: the **Recipes** tab of `pnpm demo` (`#recipes`). Back to the [docs index](/).
