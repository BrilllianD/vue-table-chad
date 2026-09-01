# bench

`fixtures.ts` holds the whole workload — rows *and* columns, because accessors, comparators, formats
and aggregates are half of what the pipeline costs. The demo re-exports it, so a bench number
describes the same table a reader sees on screen.

- `pipeline.bench.ts` — the pure functions at 10k and 100k.
- `reactive.bench.ts` — what one *interaction* costs, which is the different and usually more
  important question.
- `BASELINE.md` — the numbers, including the trims the bench argued **against**. Record those too;
  "we measured and it was noise" is a result worth keeping, and three of the Phase 1 plan's proposed
  trims turned out to be exactly that.

Two traps, both hit for real while writing these: a pristine table short-circuits every stage to
`rows.slice()`, so benchmark a table that has a filter and a sort applied; and harness construction
will swamp the signal unless it happens outside the measured region.

`bench/` measures JavaScript only. The demo's **Performance** view measures layout and paint, to the
frame after the change rather than the tick after the patch — and refuses to measure a hidden tab,
because a background tab reports the browser's throttle rather than the table's cost. It also
measures the production build: the dev server costs about 8ms a frame in component creation alone.
