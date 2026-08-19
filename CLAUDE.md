# vue-table

Headless table primitives for Vue 3, on the way to being an npm package. The point of the project
is a universal table with a flexible config that **renders fast, without much overhead** — so
performance is a correctness property here, not a nice-to-have.

## Commands

```bash
pnpm test          # vitest, ~300 tests
pnpm test <name>   # one file, e.g. pnpm test sorting
pnpm typecheck     # vue-tsc --noEmit
pnpm bench         # vitest bench over bench/**
pnpm build         # typecheck + vite lib build -> dist/
pnpm demo          # http://localhost:5174 — every feature, one view each
pnpm dev           # http://localhost:5173 — the smaller playground
```

Node 24 (`.nvmrc`). pnpm, not npm.

## The three layers, and the rules between them

```
src/core/         composables and pure functions — NO components, NO DOM
src/components/primitives/   headless, slot-driven — NO CSS of their own
src/components/preset/       DataTable + table.css, assembled from primitives
```

These are contracts, not conventions:

- **`core/` imports nothing from `components/`.** It is usable with no components at all — the
  demo's "Core only" view exists to prove it.
- **Primitives ship no stylesheet.** They emit class names and `data-*` attributes and nothing else.
  Using only primitives must pull in zero CSS; that is what "headless" buys.
- **The preset owns the theme.** `DataTable.vue` imports `table.css` itself. `src/index.ts`
  deliberately does *not*, because `sideEffects: ["**/*.css"]` would let a bare CSS import there be
  tree-shaken away, silently shipping an unstyled table.
- **Every primitive works standalone.** Given explicit props, it must render with no `<TableRoot>`
  above it. `ColumnVisibilityMenu` is the sole exception and the demo says so out loud.

## Performance invariants

`tests/invalidation.spec.ts` counts passes through the four O(dataset) functions and asserts what
each interaction is allowed to move. Treat a failure there as a broken feature, not a slow one.

The rules it encodes:

- **Paging redoes nothing.** No filter pass, no sort pass. This broke once because `useTableState`
  mints a fresh query object per write, so any stage reading the whole object invalidated on every
  change. Stages depend on query *fields*; a computed returning the same reference does not
  propagate, and that is what makes it work.
- **Collapsing a group re-scans nothing.** Building the group tree and folding it shut are separate
  (`buildGroupTree` / `flattenTree`); only the second depends on collapse state.
- **Column layout never reaches the pipeline.** Resize, pin and reorder touch no rows.
- **Selection never reaches the pipeline.** `Set`-backed, one state write per range.
- **Work that *is* asked for still happens.** Changing the sort must re-sort, exactly once. An
  invariant suite that only says "do less" is satisfied by a table that does nothing.

Two habits that keep the pipeline honest:

- **Derive per row, not per comparison.** Comparisons run O(n log n) times; cells number n. `sortRows`
  projects sort keys once per row for this reason — deriving them inside a comparator cost 93ms to
  sort 10k dates.
- **Row data belongs in a `shallowRef`.** A plain `ref` proxies every row object, so each cell read
  goes through a Proxy trap. Worth 1.6–1.9× on filter and sort. The README's quick start teaches it;
  keep it that way.

## Benchmarks

`bench/fixtures.ts` holds the whole workload — rows *and* columns, because accessors, comparators,
formats and aggregates are half of what the pipeline costs. The demo re-exports it, so a bench
number describes the same table a reader sees on screen.

- `bench/pipeline.bench.ts` — the pure functions at 10k and 100k.
- `bench/reactive.bench.ts` — what one *interaction* costs, which is the different and usually more
  important question.
- `bench/BASELINE.md` — the numbers, including the trims the bench argued **against**. Record those
  too; "we measured and it was noise" is a result worth keeping.

Two traps, both hit for real while writing these: a pristine table short-circuits every stage to
`rows.slice()`, so benchmark a table that has a filter and a sort applied; and harness construction
will swamp the signal unless it happens outside the measured region.

`bench/` measures JavaScript only. The demo's **Performance** view measures layout and paint, to the
frame after the change rather than the tick after the patch — and refuses to measure a hidden tab,
because a background tab reports the browser's throttle rather than the table's cost.

## Conventions

- Comments explain *why*, and especially why the obvious alternative is wrong. The existing code is
  dense with this; match it rather than stripping it.
- Prefer a named constant over a repeated literal when the name states a contract (`ROOT_GROUP_KEY`
  is the empty group path, not a coincidence two modules share).
- Public API changes go through `src/index.ts`. Anything exported carries a doc comment on its
  **declaration** whose first paragraph works as a one-line summary — `pnpm docs:api` harvests
  those into `demo/src/data/apiReference.ts`, and a test regenerates that file and fails if the
  committed copy differs. So the summary is written once, in `src/`, and never in the demo. An
  export should also appear somewhere in `demo/`.
- One commit per task, tests and typecheck green before each.

## Known gaps

Deliberate, not oversights. [`ROADMAP.md`](ROADMAP.md) carries the full plan, what Phase 1 changed,
and what each remaining phase involves — start there when picking the work back up.

- **`@sandbox/vue-table` is a placeholder name.** Also no LICENSE, no `repository` field, no CI, no
  CJS build, and `files: ["dist"]` with a gitignored `dist/` means a fresh clone would publish an
  empty package. All of it is Phase 3 of the roadmap.
- **No virtualization.** Pagination caps the DOM instead. Phase 2, and the `<tbody>` restructure it
  needs is also what row memoisation requires — `v-memo` has no effect inside a `v-for`, so it waits
  for that.
- **No i18n.** Around 35 English strings are hardcoded across the components, `aria-label`s included.
- **No cell-level keyboard navigation.** Sorting, menus and resize handles are keyboard-driven; there
  is no focus grid.
