# Excel-style filters

<script setup>
import Example from './.vitepress/examples/filtering.vue'
</script>

<Demo :is="Example" />

<<< @/.vitepress/examples/filtering.vue

Every `filterable` column gets a funnel in its header, and the panel behind it has Excel's two
halves: a checklist of the values that are actually there, and a rule builder over the operators
that make sense for the column's type. Both produce the same thing — one entry in
`QueryState.filters`, keyed by column id.

## The two shapes

```ts
// The checkbox list. `include: null` means "no filter".
{ kind: 'values', include: ['Engineering', 'Research'], includeBlanks: false }

// The "Text/Number/Date Filters…" submenu.
{ kind: 'conditions', op: 'and', rules: [{ operator: 'between', value: 100, value2: 200 }] }
```

Two constructors save you writing the discriminant:

```ts
import { valuesFilter, conditionsFilter } from '@brillliand/vue-table-chad'

state.setFilter('department', valuesFilter(['Engineering'], true))
state.setFilter('salary', conditionsFilter([{ operator: 'gte', value: 90000 }]))
```

`valuesFilter(include, includeBlanks = false)` defaults blanks to *excluded*, because in Excel
ticking two departments means those two and nothing else. `conditionsFilter(rules, op = 'and')`
takes `'or'` as its second argument.

## Which operators a column offers

`operatorsFor(type)` answers it, and the rule builder renders exactly that list:

| `type` | Operators |
| --- | --- |
| `text` (the default) | `contains`, `notContains`, `startsWith`, `endsWith`, `eq`, `neq`, `empty`, `notEmpty` |
| `number` | `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `between`, `empty`, `notEmpty` |
| `date` | `on`, `before`, `after`, `between`, `empty`, `notEmpty` |
| `enum` | `eq`, `neq`, `empty`, `notEmpty` |
| `boolean` | `eq` |

`empty` and `notEmpty` take no operand (`isUnaryOperator`); `between` takes two, in `value` and
`value2` (`isBinaryOperator`). Reversed bounds are normalised, so `between 200 and 100` means what
you meant. `OPERATOR_LABELS` holds the English for each, and `defaultOperator(type)` is what a fresh
rule starts on.

## Behaviours worth knowing

These are the ones that are easy to get wrong, and each is a decision rather than an accident.

- **Blanks are their own bucket.** `null`, `undefined` and `''` all collapse to one "(Blanks)" row —
  that is `isBlank`, and it is the same trio `required` rejects when editing. Ticking specific values
  excludes blanks unless `includeBlanks: true`, and "(Select All)" covers the blanks row too:
  treating it separately leaves it checked and silently keeps blank rows in a result the user thinks
  they narrowed.
- **Only `empty` and `notEmpty` survive a blank cell.** Every other operator rejects a blank row
  rather than coercing it to `0` or `''` and comparing that — otherwise "salary less than 50000"
  would quietly include everyone whose salary is unknown.
- **Text comparisons are case-insensitive**, both sides lowered.
- **Numbers coerce before comparing**: numeric strings parse, `true`/`false` become `1`/`0`, a `Date`
  becomes its timestamp, and anything that will not coerce fails the rule rather than passing it.
- **Dates compare by calendar day**, through `startOfDay`. Bare `YYYY-MM-DD` strings parse as *local*
  midnight — `Date.parse` treats them as UTC, which shifts the day backwards for anyone west of
  Greenwich and makes a date filter miss its own boundary.
- **Incomplete rules are ignored.** A half-typed `between` keeps every row rather than blanking the
  table mid-keystroke; `isIncompleteRule` is what decides.
- **A filter that matches everything is not a filter.** `pruneFilters` strips no-op entries out of
  `QueryState` on the way in, so neither the header funnel nor the chip row lights up for one, and a
  query in a URL stays short. `isEmptyFilter` is the predicate behind it, `normalizeFilter` the
  single-filter version.

## Facets — what the checklist shows

The checklist is not `[...new Set(everyValue)]`. It is computed against the rows that survive every
**other** column's filter, while ignoring the column's own:

```ts
const facets = computeFacets(rows, columns, columnFor('department'), query)
// -> [{ value: 'Engineering', count: 412 }, …, { value: null, count: 19 }]
```

Skipping the column's own filter is the whole trick. Include it and unchecking a value would erase
the option you just unchecked, leaving no way to put it back.

The rest of the ordering is Excel's:

- Values sort by the column's own type — text, number or date comparator — with **blanks last**.
- A column that declared `options` keeps its **declared** order, and its options appear even at
  `count: 0`, so the list does not reshuffle under the pointer as you filter. Values the data turned
  up that were never declared sort after the declared ones rather than jumping to the top.

`DataTable` fetches facets only when a panel **opens**. Computing distinct values for every column up
front is wasted work locally and a burst of requests remotely. A remote facet endpoint that fails
surfaces in the panel rather than leaving an unexplained empty checklist.

## Global search

The toolbar's search box covers every column where `searchable ?? filterable !== false` — so by
default, everything filterable. The two are separable on purpose: an internal id column can stay
filterable without polluting search hits.

```ts
{ id: 'email', type: 'text', filterable: true, searchable: false }
```

Search matches **what the reader sees**: each column's `format` runs before the test, so `1500`
matches a cell rendered as `$1,500`. That is also most of what search costs — see below.

## Driving it from code

The filter half of `TableState`:

```ts
state.setFilter('role', conditionsFilter([{ operator: 'eq', value: 'Staff' }]))
state.filterFor('role')      // the current ColumnFilter, or undefined
state.clearFilter('role')
state.clearAllFilters()
state.activeFilterIds.value  // ['role', 'salary'] — sorted, pruned of no-ops
state.hasActiveFilters.value
state.setSearch('lisbon')
```

Every one of these resets `page` to 1. Page 7 of a result set that just became three pages long
would otherwise render empty, and the user would read that as "no matches".

## Filtering with no table at all

The pure functions are exported, and `core/` imports nothing from `components/`:

```ts
import { filterRows, computeFacets, compileFilter } from '@brillliand/vue-table-chad'

const visible = filterRows(rows, columns, { filters: query.filters, globalSearch: query.globalSearch })
```

`filterRows` takes a fourth argument, `skip`, naming a column whose filter to ignore — that is how
`computeFacets` scopes a checklist, and it is available to you for the same purpose.

For a hot loop, compile once instead of testing once per row:

```ts
const test = compileFilter(valuesFilter(['Engineering']), 'enum')
rows.filter((row) => test(row.department))
```

`matchesFilter` rebuilds the filter's value `Set` on every call, which is O(rows × values) over a
10k-row dataset. `compileFilter` builds it once and hands back the predicate; `compileSearch` does
the same for the search term, lowering the needle once rather than once per row, and returns
`undefined` for an empty search so the caller can skip the column loop outright.

## Building the panel yourself

Four primitives, none of which ship any CSS:

- **`ColumnFilterPopover`** — the funnel and the panel, hosting both halves. Props: `columnId`,
  `type`, `label`, `modelValue`, `facets`, `format`, `teleport`. Given no `modelValue` it reads and
  writes the table context itself; given no `facets` it fetches them from the context's source when
  it opens. Pass either to drive it yourself.
- **`ValueListFilter`** — the checklist alone: search within the list, tri-state "Select All", and
  the "(Blanks)" row. It works on a draft copy, so ticking boxes one at a time does not refetch or
  re-filter on every click.
- **`ConditionFilter`** — the rule builder alone. Props: `type`, `modelValue`, `maxRules`.
- **`ActiveFilters`** — the chip row. It needs a table context (`requireTableContext`), because it
  reads the whole filter model rather than taking it as props. Without it, a filter left on a column
  that has since been hidden or scrolled out of view is invisible and unexplainable.

The popover is teleported to `<body>` and positioned from its trigger — right-aligned like Excel's,
flipped above when there is no room below, and clamped into the viewport — so no ancestor's
`overflow` can clip it. Pass `:teleport="false"` if you are placing it yourself.

## What it costs

Global search is the one number that stayed large: **~30 ms at 10k rows**, most of it the columns'
own `format` functions, because search matches what the user sees. Two things make it tolerable:

- `useLocalDataSource` debounces the **global search only** (`debounceMs`, default 150). A filter
  checkbox or a header click is one deliberate act and always lands at once; a delay there reads as a
  broken table. `QueryState` records every keystroke as it happens regardless, so a URL mirroring the
  query stays truthful while only the filtering lags.
- The search pass walks the searchable columns and stops at the first hit rather than collecting
  every cell into an array and formatting all of them. Most rows that match do so on an early column,
  and most that do not are decided by the loop ending — neither case wants the array.

---

Live: the **Filters** tab of `pnpm demo` (`#filters`). Back to the [docs index](/).
