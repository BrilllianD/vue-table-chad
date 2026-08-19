# Baseline, and what Phase 1 did to it

Mean milliseconds per operation, `pnpm bench`. Lower is better. Machine-specific: re-run on your
own hardware before reading any delta as a win.

**Before** is commit `7909bd4`, the state Phase 1 opened on. **Now** is the current tree.

## What an interaction costs

The load-bearing table. 10k rows, a filter and a sort applied, page size 25.

| Interaction | Before | Now | |
| --- | ---: | ---: | --- |
| `setPage` | 13.2 | **0.004** | Redid the whole filter and sort to slice 25 rows (P1-4) |
| `setPage`, grouped 2 levels | 33.7 | **0.052** | …plus a re-count and re-aggregate of the dataset (P1-4, P1-6) |
| group collapse toggle | 3.7 | **0.013** | Re-counted every filtered row on every toggle (P1-6) |
| search keystroke | 21.8 | **0.006** | Now coalesced; the pass happens once per burst (P1-5) |
| search settling | 21.8 | 19.2 | The pass itself — real work, and now paid once |
| `toggleSort` on text | 9.6 | 4.3 | Legitimate work, and cheaper (P1-10) |
| selection toggle | 0.009 | 0.002 | Was already right; `shallowRef` and shared columns helped anyway (P1-7, P1-8) |
| column resize | 0.070 | 0.058 | Was already right — never reaches the pipeline |

Three of the top four were work nobody asked for. All three are gone.

## What the pure functions cost

| | Before 10k | Now 10k | Before 100k | Now 100k |
| --- | ---: | ---: | ---: | ---: |
| `filterRows`, nothing set | 0.013 | 0.012 | 0.28 | 0.23 |
| `filterRows`, one values filter | 1.84 | 1.77 | 21.9 | 21.3 |
| `filterRows`, global search over 9 columns | 35.6 | 30.0 | 349 | 290 |
| `sortRows`, one text column | 25.8 | **14.2** | 284 | **171** |
| `sortRows`, one number column | 14.0 | **3.50** | 227 | **46.6** |
| `sortRows`, one date column | *93.0* | **6.75** | — | **74.5** |
| `sortRows`, three columns, mixed | 37.6 | **13.9** | 543 | **193** |
| `computeFacets`, enum column | 2.37 | 2.26 | 24.7 | 23.4 |
| `flattenGroups`, two levels | 6.39 | 5.55 | 96.7 | 80.9 |
| `countGroups`, two levels | 6.86 | 6.63 | 68.1 | 67.0 |
| `aggregateGroups`, two levels | 34.3 | **23.4** | 383 | **270** |

*The date sort was never measured before P1-10 — the 93.0ms is what it cost when it first was.*

### Where the sort win came from

Comparisons run O(n log n) times; cells number n. Anything derived inside a comparator is therefore
derived tens of times per row. `compareDate` parses **both** operands on every call, so sorting 10k
dates cost roughly 270 000 date parses. `sortRows` now reads each sort cell once, projects
number/date/boolean columns to a numeric key once, and sorts an index array.

Text improved too — 1.8× — without any key at all, because `readValue` had been running per
comparison rather than per row. Accessor columns paid that twice over.

`Intl.Collator` was already hoisted, which was right; precomputed collation keys were not needed to
get text down, and were not added.

### Where the aggregate win came from

Split by reducer, the answer was unambiguous — `sum` 9.1, `avg` 9.8, `min` on a date column 29.8.
`extreme` compares each row against the running winner, so the incumbent's date was re-parsed once
per row. It now keeps the winner's projected key.

`min` on a date is still 2× a number reducer at 20.2ms: 10k date parses remain, one per row, which
is the floor without a cache.

## Choices the bench argued *against*

Bench-gating cuts both ways. These looked worth doing and measurably were not:

- **The unconditional `rows.slice()`** in `filterRows` and `sortRows` when nothing is set. It is
  0.012ms at 10k. Returning the caller's array instead would alias their data to save nothing.
- **Caching local facets.** 2.3ms per popover *open*, not per render. The server source memoizes
  because a round trip is involved; here there is nothing to hide.
- **Rebuilding `new Map(columns…)`** per `filterRows` call — eleven entries.

## What holding rows in a `ref` costs

Not a regression — a choice the caller makes. `ref(people)` proxies the array and every object in
it, so each cell read during a pass goes through a Proxy trap. 10k rows:

| | `ref` | `shallowRef` |
| --- | ---: | ---: |
| `filterRows` with a global search | 49.2 | 30.8 |
| `sortRows` on one text column | 29.1 | 15.1 |

Between 1.6× and 1.9×, for one word in the caller's code. This is why the README's quick start says
`shallowRef` (P1-7).

## Reading these honestly

`bench/` measures JavaScript. It does not measure layout, paint, or Vue's patch — the demo's
**Performance** view (P1-9) exists for that, and it declines to measure a background tab rather than
report the browser's throttle as the table's cost. A win here is necessary for a table that feels
fast, and nowhere near sufficient.

Global search is the one number that stayed large: 30ms at 10k. Most of it is the columns' own
`format` functions — `Intl.NumberFormat` and `toLocaleDateString` per cell — because search matches
what the user sees. Short-circuiting on the first hit took 16% off; the rest needs a search index,
which is not in this phase. The debounce is what makes it tolerable: it is paid once per burst
rather than once per keystroke.
