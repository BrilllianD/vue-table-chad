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
| header band fold | — | **0.068** | New in G2. Folds a band of two columns; matches a resize, which is the claim (G1–G6) |

Three of the top four were work nobody asked for. All three are gone.

Folding a header band lands beside `column resize` rather than beside `group collapse
toggle`, and that is the whole point of the number: a band fold looks like a row-band
collapse on screen, but it is a column-layout change and never reaches the row pipeline at
all. Measuring it was the only way to say so with a figure rather than an intention.

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

#### R2 · folding the per-key arrays into one object (2026-08-26)

The projection above left four arrays — `plan`, `blanks`, `keys`, `values` — each indexed by
`planIndex` inside the comparator. Same argument one level up: comparisons outnumber sort keys, so
those four lookups per key per comparison are paid O(n log n) times. They are now resolved once per
sort key into a `steps` array of one object each.

Measured back-to-back at 10k, stash / pop on the same machine in the same session:

| | before | after | |
| --- | ---: | ---: | --- |
| single text column (`Intl.Collator`) | 97.9 hz | 96.8 hz | noise |
| single number column | 336.2 hz | 360.2 hz | **+7.1%** |
| single date column | 181.3 hz | 197.5 hz | **+9.0%** |
| three columns, mixed types | 93.9 hz | 105.4 hz | **+12.2%** |

The shape of the result is the argument for believing it: the win scales inversely with what the
comparison itself costs. Text is collator-bound and does not move; the three-key sort pays the
lookups three times per comparison and moves most. A single run showed the same ordering, so this
is not one machine mood.

### Where the aggregate win came from

Split by reducer, the answer was unambiguous — `sum` 9.1, `avg` 9.8, `min` on a date column 29.8.
`extreme` compares each row against the running winner, so the incumbent's date was re-parsed once
per row. It now keeps the winner's projected key.

`min` on a date is still 2× a number reducer at 20.2ms: 10k date parses remain, one per row, which
is the floor without a cache.

## What windowing costs, and what a page size of everything costs (P2-1)

Two different numbers, and conflating them is the easy mistake. Windowing is free; the page size
virtual mode implies is not.

**The window itself**, 100k display rows, filtered and sorted, 38px rows in a 640px viewport:

| Interaction | Now |
| --- | ---: |
| scroll one row — the window moves by one | **0.0020** |
| scroll one viewport — the window moves wholesale | **0.0021** |
| scroll within one row — the window does not move | **0.0021** |

All three are one ref write and two integer divisions. The third was expected to be *cheaper* than
the first — a floored `start` that recomputes to the same integer propagates nothing, so no slice
happens at all — and it is not measurably so, because slicing 30 elements out of 100k is already
below the noise floor of writing the ref. The invariant is real and
`tests/invalidation.spec.ts` asserts it; the bench simply cannot see a saving that small. Worth
recording as such rather than as a win.

**The pipeline underneath**, at 100k with a page size of everything:

| | Page of 25 (10k set) | Page of everything (100k set) |
| --- | ---: | ---: |
| search settling | 19.2 | **191** |
| selection toggle | 0.002 | **8.2** |

The first is the dataset's own cost and is what any table filtering 100k rows pays — virtualization
neither adds nor removes it. The second is the one to watch, because it scales with the
*interaction* rather than with the data: `useRowSelection.headerState` asks "are all of these
selected" over the rows it was handed, and virtual mode hands it the dataset instead of a page. 8ms
per click is usable and not fine; a counting selection state is on P2-3's list because of this
number.

**The grouping halves, split** — `useRowGrouping` calls `buildGroupTree` and `flattenTree`
separately, and only the second depends on collapse state (P1-6). `flattenGroups` above is the
combined convenience function, which nothing in the reactive path calls, so it was the only one
measured until now:

| | 10k | 100k |
| --- | ---: | ---: |
| `buildGroupTree`, two levels | 5.35 | 65.3 |
| `flattenTree`, two levels | 0.46 | 16.8 |
| `flattenTree`, ungrouped | 0.12 | **3.1** |

The last row is the one virtualization needed: with nothing grouped, the flatten still allocates one
`DisplayRow` per row, and under a page size of everything it allocates 100k of them per filter or
sort. At 3.1ms that is inside a frame, so the short-circuit that would avoid it — a `displayRows`
that hands back the rows themselves when nothing is grouped — is not worth changing `DisplayRow`'s
shape for. Measured, and argued against.

`flattenTree` at two levels is 16.8ms at 100k, and that one runs on every band collapse. It is the
next real number in this area.

## Choices the bench argued *against*

Bench-gating cuts both ways. These looked worth doing and measurably were not:

- **The unconditional `rows.slice()`** in `filterRows` and `sortRows` when nothing is set. It is
  0.012ms at 10k. Returning the caller's array instead would alias their data to save nothing.
- **Caching local facets.** 2.3ms per popover *open*, not per render. The server source memoizes
  because a round trip is involved; here there is nothing to hide.
- **Rebuilding `new Map(columns…)`** per `filterRows` call — eleven entries.

## What the editing config costs the pipeline

Nothing measurable, and it was worth checking rather than assuming.

`employeeColumns` grew six fields per column for editing — `editable`, `setValue`, `validate`,
`required` — and the whole workload runs through those objects. A wider column object could plausibly
cost something: `sortRows` reads `column.comparator`, `column.type` and `column.accessor` per pass,
and a larger shape is a larger lookup.

A/B over the full pipeline bench, three runs each way, says no. Every figure lands inside the
run-to-run spread, and the spread is wide enough to mislead: a single run showed `sortRows` on three
mixed columns at 15.5ms against 13.3ms without the change, which two further runs put back at 13.6
and 13.9. `flattenGroups` came out *faster* with the config than without, which is the same story
told the other way.

The reason it is free is structural rather than lucky: none of the four O(dataset) functions reads
any of those fields. They are inert until a table is handed an editing session.

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
