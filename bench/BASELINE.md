# Baseline, and what Phase 1 did to it

Mean milliseconds per operation, `pnpm bench`. Lower is better. Machine-specific: re-run on your
own hardware before reading any delta as a win.

**Before** is commit `7909bd4`, the state Phase 1 opened on. **Now** was last measured at
`78a3167` and has not been re-measured since; later commits did touch `src/core` — the cell
cursor, grouping, async options — so treat these as the last recorded numbers, not the current
ones.

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

Measuring undeclared column widths (T6) moved none of these: `column resize` came back at
0.067ms against the 0.058 above, which is the same number on a busier machine, and the
pure-function table below is unchanged. It should be — the probe runs at the component tier
and reports into `useColumns`, so nothing it does is on a path `bench/` measures at all.
That is the result worth recording: the feature is a layout read and a map write, not a
pipeline change.

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

| Interaction | P2-1 | After P2-3e |
| --- | ---: | ---: |
| scroll one row — the window moves by one | **0.0020** | **0.0025** |
| scroll one viewport — the window moves wholesale | **0.0021** | **0.0026** |
| scroll within one row — the window does not move | **0.0021** | **0.0026** |

The second column is what variable row heights cost the uniform case: `start` and `end` go through
`indexAt`, which reads the measured-offsets computed before deciding it is empty and falling back to
the same integer division. Half a microsecond a scroll event, paid whether or not anything is
measured — accepted, and recorded rather than rounded away, because it is the kind of drift that is
invisible one change at a time.

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
| selection toggle, before P2-3b | 0.002 | **8.2** |
| selection toggle, after P2-3b | 0.002 | **0.0024** |

The first is the dataset's own cost and is what any table filtering 100k rows pays — virtualization
neither adds nor removes it. The second was the one to watch, because it scaled with the
*interaction* rather than with the data: `useRowSelection.headerState` asked "are all of these
selected" over the rows it was handed, and virtual mode hands it the dataset instead of a page.

P2-3b turned it around. The header checkbox needs two numbers — how many rows may be toggled, and
how many of those are selected — and only the first is a function of the rows. Split into its own
computed it is paid when the page changes; the second is now counted by walking the *selection*,
which is as long as the user's own clicks, and asking a `Set` of page ids about each. 3400× at 100k,
and the click no longer knows how big the dataset is.

Read the after number for what it measures: the bench toggles one row, so it counts one id. The cost
is O(rows selected), not O(1) — "select all matching" is a single id-free state and stays free, but
50k individually selected ids would be 50k `Set` lookups a click. That is proportional to what the
user actually did, which is the property that was missing.

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

### What the browser said (P2-2's debt, paid at P2-6)

The numbers above are JavaScript. The ones that decide whether virtual mode is *worth* it are layout
and paint, and only a foregrounded tab can produce them — a hidden tab never fires
`requestAnimationFrame`, and `PerfView` refuses to report the browser's throttle as the table's cost.
That session has now been run.

**Measure the built demo, not the dev server.** This is the first thing the run turned up and it
changes every number below: `pnpm demo` reports 24–25ms medians where `pnpm build:demo` served from
`demo/dist` reports 16.4. The ~8ms is Vue's development build creating components — a CPU profile of
the dev run is topped by `createComponentInstance`, `setupStatefulComponent` and `initProps`, none of
which the production build does. A dev-server frame time describes the dev server.

The setup, which is P2-6's acceptance case: Chrome 151 on Linux, 60Hz display, foregrounded tab, the
production demo's **Performance** view at **100 000 rows** filtered to three departments (48 189
match) and sorted by name, `virtual` on, `name` pinned left and `active` pinned right, grouped
two levels with two of the three departments collapsed. A 541px viewport, 26 rows in the `<tbody>`.

Frame cadence while scrolling continuously — `scrollTop` advanced once per `requestAnimationFrame`
for 180 frames, which asks the window to move on *every* frame and is harsher than any wheel:

| | median | p95 | worst |
| --- | --- | --- | --- |
| idle, nothing scrolling | 16.7ms | 17.1ms | 17.3ms |
| 2px a frame — sub-row, the window never moves | 16.7ms | 17.1ms | 32.8ms |
| 3 rows a frame, flat | 16.4ms | 26.1ms | 99.3ms |
| 10 rows a frame, flat | 16.8ms | 24.5ms | 84.5ms |
| 3 rows a frame, grouped two levels | 16.4ms | 24.8ms | 50.6ms |
| **3 rows a frame, grouped + two departments collapsed** | **16.5ms** | **24.9ms** | **54.4ms** |
| 10 rows a frame, grouped + collapsed | 16.2ms | 26.0ms | 57.8ms |

16.7ms is the display's own frame, so a median *at* the vsync means the window move finished inside
the frame it belonged to. Three readings matter more than the medians themselves:

- **The acceptance combination is free.** Pinned columns and collapsed groups together cost nothing
  over the flat case — 16.5 against 16.4. That combination is where a naive virtualizer breaks, and
  the reason it does not break here is structural: pinning is a per-cell offset the window never
  reads, and a collapse is a shorter `displayRows` the window slices the same way.
- **Distance is free too.** 1, 3 and 10 rows a frame all cost the same, because they are all one
  window move per frame. What a scroll costs is the move, not how far it went.
- **A sub-row scroll costs nothing at all** — 16.7ms, the idle number. That is
  `tests/invalidation.spec.ts`'s "a scroll that does not move the window propagates nothing",
  visible in the frame times rather than in a recompute count.

`PerfView`'s own **Scroll 2000 rows** button, in that configuration: **47.2ms median, 57.6ms worst
over 12 runs**. Read it against its own floor — it times from the click to the *second*
`requestAnimationFrame`, so two vsyncs (33.4ms here) are in the number by construction, leaving ~14ms
of work for a 76 000px jump whose window shares nothing with the one before it.

The structural checks, where no timing is involved:

| | |
| --- | --- |
| rows in the `<tbody>` | **26** at a 541px viewport, whatever the dataset — 14 visible, 1 straddling, overscan either side |
| `<table>` height | 1 831 220px, matching the scroll box's `scrollHeight` exactly — the spacers size the scrollbar correctly |
| scrolling 250 000px in | window follows, still 26 rows, both pinned columns still pinned, stripes still alternating |
| collapsing two departments | 1 831 220px → 606 822px of virtual height |
| the sticky header | still `position: sticky` with a 1.8M-pixel spacer under it |

An earlier session at a 414px viewport turned up a **group row laying out at 39px where a data row
lays out at 38**. The window assumed one height for both; the error was bounded by the window rather
than by the dataset, which is why it was polish rather than correctness. P2-3e answered it with
`measureRows`, opt-in, so the default path still pays nothing to assume a uniform height.

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
fast, and nowhere near sufficient — what that view and a scripted scroll actually reported is above,
under *What the browser said*, and it is measured against the production build for the reason given
there.

Global search is the one number that stayed large: 30ms at 10k. Most of it is the columns' own
`format` functions — `Intl.NumberFormat` and `toLocaleDateString` per cell — because search matches
what the user sees. Short-circuiting on the first hit took 16% off; the rest needs a search index,
which is not in this phase. The debounce is what makes it tolerable: it is paid once per burst
rather than once per keystroke.
