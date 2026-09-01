# src/core

Composables and pure functions. **No components, no DOM.** The rules the root `CLAUDE.md` states in
one line each, with the reasoning behind them.

## The layer rule

`core/` imports nothing from `components/`. It is usable with no components at all — the demo's
"Core only" view exists to prove it. Anything that has to read the DOM belongs in `preset/` instead;
`useColumns` holds column numbers and stays DOM-free, the shape `useVirtualRows` already uses for row
heights.

## Depend on query fields, not the query object

`useTableState` mints a **fresh query object on every write**, page changes included. A stage reading
the whole object therefore re-runs whenever anything moves — which is how a page turn once redid the
filter and the sort over the whole dataset. Each stage depends on the query *fields* it reads; a
computed returning the same reference does not propagate, and that is what makes paging free.

`tests/invalidation.spec.ts` is the ratchet on this. See the root file's **Performance invariants**
for the full list of what each interaction may move.

## Derive per row, not per comparison

Comparisons run O(n log n) times; cells number n. `sortRows` projects sort keys once per row for this
reason — deriving them inside a comparator cost 93ms to sort 10k dates.

## Row data belongs in a `shallowRef`

A plain `ref` proxies every row object, so each cell read goes through a Proxy trap — once per row
per column per pass. Worth 1.6–1.9× on filter and sort. The README's quick start teaches it; keep it
that way.

## `noUncheckedIndexedAccess` is on

`array[i]` is `T | undefined`, so an index read has to be answered rather than assumed. In a hot
loop, bind the element once (`const step = steps[i]!`) rather than re-indexing — the same "derive per
row" argument one level up, and worth 7–12% of a sort. Elsewhere a `!` is fine *with a one-line why*;
the flag exists to make that a decision instead of a default.

Prefer a named constant over a repeated literal when the name states a contract: `ROOT_GROUP_KEY` is
the empty group path, not a coincidence two modules share.

## `theme.ts`

`THEME_TOKENS` is a runtime array rather than an interface's keys precisely so it can be checked:
`tests/theme.spec.ts` compares it against both CSS partitions and fails if either side grows a name
the other has not heard of. Adding a token means adding one line here. `Theme` is derived from the
array, so the type and the check cannot disagree.
