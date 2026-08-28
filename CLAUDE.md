# vue-table-chad

Headless table primitives for Vue 3, on the way to being an npm package. The point of the project
is a universal table with a flexible config that **renders fast, without much overhead** — so
performance is a correctness property here, not a nice-to-have.

Open work lives in [`TASKS.md`](TASKS.md), which is the only place it lives — what to pick up next
comes from there, and what has shipped is read from the git history rather than from a second copy
of it. This file is the standing contracts: what must stay true of the code however the queue moves,
including the decisions already settled and how the work is verified.

## Commands

```bash
pnpm test          # vitest, 807 tests across 44 files
pnpm test <name>   # one file, e.g. pnpm test sorting
pnpm typecheck     # vue-tsc --noEmit
pnpm bench         # vitest bench over bench/**
pnpm build         # typecheck + vite lib build -> dist/
pnpm demo          # http://localhost:5174 — 18 views, every feature one view each
pnpm dev           # http://localhost:5173 — the smaller playground
pnpm build:docs    # the demo, folded into one self-contained page
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
- **The preset owns the theme.** `DataTable.vue` imports `table.css` itself — the entry file, which
  is now just an ordered list of `@import`s over `preset/styles/*`, `scales.css` and `tokens.css`
  first. **Partitions are contiguous slices and stay that way**: three pairs of rules are separated
  by source order alone, because both sides have identical specificity and the later one is meant to
  win — the column separator against the band edge, `:nth-child` striping against `[data-parity]`
  striping, and `[data-row-state]` against `[data-row-state='error']`. All three sit inside one
  partition, so the hazard is splitting a file rather than reordering the list. The other hazard is
  a partition writing `background-image` or `box-shadow` wholesale: both stacks are composed from
  `--_vtc-` slots in `grid.css`, and a direct write outranks the composition and erases every slot
  at once. The pinned-cell z-index ladder is **not** order-dependent — specificity separates all
  three tiers — despite this file having said otherwise for a while.
  **`tests/presetStyles.spec.ts` enforces the two hazards against the stylesheet source**, since
  jsdom does not apply CSS and nothing else in the suite would notice: no rule matching cells may
  write `background-image` or `box-shadow` directly, every `--_vtc-` slot that is filled must be
  reset on `.vt-th, .vt-td`, and only `scales.css` and `tokens.css` may declare a public `--vtc-`
  token. `src/index.ts`
  deliberately does *not* import the stylesheet, because `sideEffects: ["**/*.css"]` would let a
  bare CSS import there be tree-shaken away, silently shipping an unstyled table.
- **Every primitive works standalone.** Given explicit props, it must render with no `<TableRoot>`
  above it — the specs assert this with a "renders standalone, with no table context above it" case,
  `TableRow`, `TableHeaderGroupCell` and `TableGrid` among them — the last of these in
  `tests/tableGrid.spec.ts`, which also pins the other half of its contract: **with no `cursor`,
  off means off** — no `role="grid"`, no `tabindex`, and none of the three gestures reported.

  Which side a primitive is on is declared in code, not by convention: `useTableContext()` returns
  `undefined` when there is no root, and is what an optional consumer calls. **`requireTableContext(name)`
  throws, and marks the three primitives that genuinely cannot work without a root** —
  `ColumnVisibilityMenu`, `RowGroupMenu` and `ActiveFilters`, each of which reads the whole column,
  group or filter model rather than taking it as props. Adding a fourth means adding a demo note
  saying so.

## Performance invariants

`tests/invalidation.spec.ts` wraps the five dataset-wide functions — `filterRows`, `sortRows`,
`countGroups`, `flattenGroups`, `aggregateGroups` — and asserts what each interaction is allowed to
move. Treat a failure there as a broken feature, not a slow one.

The rules it encodes:

- **Paging redoes nothing.** No filter pass, no sort pass. This broke once because `useTableState`
  mints a fresh query object per write, so any stage reading the whole object invalidated on every
  change. Stages depend on query *fields*; a computed returning the same reference does not
  propagate, and that is what makes it work.
- **Collapsing a group re-scans nothing.** Building the group tree and folding it shut are separate
  (`buildGroupTree` / `flattenTree`); only the second depends on collapse state.
- **Column layout never reaches the pipeline.** Resize, pin and reorder touch no rows.
- **Selection never reaches the pipeline.** `Set`-backed, one state write per range.
- **Folding a header band never reaches the pipeline.** A fold is a subtraction from
  `useColumns().visible` and nothing else, which is why it costs what a resize costs rather than
  what a group collapse costs.
- **The cell cursor never reaches the pipeline.** Moving it, clamping it at an edge, or turning the
  page from it costs what turning the page always cost. A clamped move writes no state at all.
- **Scrolling a virtual window redoes nothing.** A scroll that does not move the window propagates
  nothing at all — `start` and `end` are floored integers, and a computed returning the same value
  notifies nobody — and one that does move it moves the window and no pipeline stage. This matters
  more than the paging equivalent it mirrors: `virtual` is a page size of *everything*, so each
  pass it must not trigger would be running over the whole dataset.
- **Editing never reaches the pipeline until a save succeeds.** Opening a draft, typing into it, a
  draft that fails validation, and a save the server rejects all leave the dataset alone. A save
  that succeeds does redo it — exactly once.
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
- **`noUncheckedIndexedAccess` is on.** `array[i]` is `T | undefined`, so an index read has to be
  answered rather than assumed. In a hot loop, bind the element once (`const step = steps[i]!`)
  rather than re-indexing — the same "derive per row, not per comparison" argument, one level up,
  and worth 7–12% of a sort. Elsewhere a `!` is fine *with a one-line why*; the flag exists to make
  that a decision instead of a default.
- Public API changes go through `src/index.ts`. Anything exported carries a doc comment on its
  **declaration** whose first paragraph works as a one-line summary — `pnpm docs:api` harvests
  those into `demo/src/data/apiReference.ts`, and a test regenerates that file and fails if the
  committed copy differs. So the summary is written once, in `src/`, and never in the demo. An
  export should also appear somewhere in `demo/` — either named in a view's `:api` list or imported
  by one. **`tests/apiSurface.spec.ts` enforces that** for every *value* export, and names the
  offender when it fails: demonstrate it, or stop exporting it. Types are exempt, because a type
  cannot be used in a view in a way a reader would see.
- **One task, one commit.** No batching, no work-in-progress commits spanning tasks. `pnpm test`
  green and `pnpm typecheck` clean before each. A task whose done-when is not met does not get
  committed; it gets finished, or split into a smaller task that is complete. The subject names the
  task by ID, in the imperative mood the history already uses:

  ```
  P1-4: Depend on query fields, not on the query object

  Paging rebuilt the whole pipeline because useTableState returns a fresh
  query object per write. Each stage now depends only on the fields it reads.
  ```
- **`TASKS.md` is the work queue, and it is kept current as the work moves, not after it.** Flip a
  task to `[~]` when starting it, and **delete it outright once it is committed** — the flags are
  `[ ]` not started, `[~]` in progress, `[?]` blocked or waiting on a decision, `[-]` deliberately
  deferred, and there is no "done" flag on purpose: the commit is the record, so a checked-off list
  would be a second copy of the history that drifts from it. New work gets appended with an ID and
  an explicit **Done when**, so whether it can be deleted is a question with an answer. A decision
  reached while finishing a task belongs in **Settled decisions** below, not in the deleted entry.

## Settled decisions

Answered once. Reopen one only with a reason, and rewrite the entry rather than leaving both.

- **Theme custom properties are `--vtc-`, classes stay `.vt-`.** One character apart on purpose: the
  properties needed a prefix far enough from a consumer's own `--vt-*` to stop colliding, and the
  classes are a separate public surface — around 200 assertions across 11 spec files, and
  `docs/styling.md` teaches `.vt-th[data-sorted]` as a styling hook — so renaming them is its own
  decision and has not been taken.
- **The theme is two tiers, plus machinery marked as machinery.** `styles/scales.css` holds the
  values the design uses at all (`--vtc-space-*`, `--vtc-radius-*`, `--vtc-font-size-*`,
  `--vtc-weight-*`, `--vtc-stroke-*`, `--vtc-z-*`, `--vtc-elevation-*`, `--vtc-duration-*`,
  `--vtc-opacity-*`); `styles/tokens.css` holds the roles built out of them. Both land on
  `.vt-datatable, .vt-portal`, so either tier is overridable from one place. Nothing goes in a scale
  to round out a ramp — every entry was a literal repeated in the partitions, because a scale nobody
  reaches for is a scale that drifts.
  - Token names are **subject first, property last**: `--vtc-row-hover-bg` and
    `--vtc-row-hover-border-color` sort together. Every fill ends `-bg`; every outline is a
    `-border-width` / `-border-color` pair.
  - **A leading underscore means machinery.** `--_vtc-layer-*`, `--_vtc-shadow-*` and the
    `--_vtc-*-clamped` values are what the stylesheet composes for itself; the knobs feeding them are
    the public tokens. Adding a `--_vtc-` name is free; promoting one to `--vtc-` is an API change.
  - The font size lives in `--vtc-font-size-md`, not `--vtc-text-md`, because `--vtc-text` is the
    foreground colour and the two families would read as one.
  - **`src/core/theme.ts` is the same list in TypeScript**, and `THEME_TOKENS` is a runtime array
    rather than an interface's keys precisely so it can be checked: `tests/theme.spec.ts` compares
    it against both partitions and fails if either side grows a name the other has not heard of.
    Adding a token means adding one line there. `Theme` is derived from the array, so the type and
    the check cannot disagree.
  - **`DataTable` forwards `$attrs` onto `.vt-datatable` by hand** (`inheritAttrs: false`).
    `TableRoot` renders a slot and nothing else, so the component's root is a fragment and Vue
    drops fallthrough attributes silently — a `:style` on `<DataTable>` had no effect at all, which
    is the binding `defineTheme` exists to produce. `.vt-datatable` is also the only element they
    could usefully reach, since that is where every token is declared.
  - **Dark is reached two ways and the blocks cannot be shared.** The media query excludes
    `[data-theme='light']`; the attribute form sits outside it, and after it. The attribute is read
    on the element itself, never on an ancestor — CSS cannot say "and nothing above said light", so
    an ancestor form costs a second copy of both palettes, and the teleported case it would have
    covered is covered by the `theme` prop reaching `.vt-portal` instead.
- **The package name is `@brillliand/vue-table-chad`.** Scoped, so `publishConfig: { access:
  "public" }` is required rather than optional. The scope is the account name `BrilllianD`
  lowercased, because **npm forbids uppercase in a package name, scope included** — that lowercase
  is correct and is not a typo to fix. Casing survives in the URLs, where `repository` and
  `homepage` keep `BrilllianD`.
- **The remote is Bitbucket:** `git@bitbucket.org:BrilllianD/vue-table-chad.git`. So CI is
  `bitbucket-pipelines.yml`, not `.github/workflows/ci.yml`, and the docs site cannot be GitHub
  Pages pointed at `demo/dist`.
- **ESM only, and no CJS build.** `main` is gone rather than answered with a second output format:
  Vue 3.5 plus Node 24 makes the CJS consumer largely theoretical, and a second format is a cost
  paid on every release. `attw --profile esm-only` is the invocation that reflects this — the
  profile is what stops the deliberate gap being reported as a failure.
- **Declarations are rolled up.** The per-file emit re-exported through
  `'./components/primitives/TableRoot.vue'` and other extensionless relative specifiers, which
  TypeScript cannot follow under `node16`/`nodenext` — a consumer set to `nodenext` saw every
  accessor parameter degrade to `any` while its build stayed green. `rollupTypes: true` leaves no
  relative specifier in the shipped types.
- **The bundle budget is measured, not inherited.** `pnpm size` fails past 42 kB gzip JS / 5 kB gzip
  CSS, set from a build measuring 35.7 / 3.9. The figure it measured is printed next to the budget
  so the next reader can tell drift from slack. The number this project used to carry was about 35%
  low after four feature series — re-measure rather than copy.

## What not to relearn

Three lessons about how to work rather than what the code must do.

- **`it.fails` is the right ratchet.** Vitest fails an `it.fails` that starts passing, so an
  invariant written before its fix demands to be updated rather than quietly ratifying whatever the
  code does later. A skip would just rot.
- **The bench also argues *against* work.** Three trims the Phase 1 plan listed were measured and
  turned out to be noise. `bench/BASELINE.md` records them as decisions, because "we measured and it
  was noise" is a result worth keeping.
- **`v-memo` is settled, not deferred.** It has no effect inside a `v-for`; through a slot outlet it
  shares one `_cache` across every invocation; and in the one shape where it *would* work — a
  per-row component — it reuses the whole vnode, slots included, freezing whatever the caller's own
  `cell:<id>` slots close over. Windowing then leaves ~30 rendered rows for it to save anything on.

## Verification

**Per push, by CI** — `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm size`. Then `pnpm lint` and
`pnpm bench` non-gating: lint is known-red (a task in `TASKS.md` decides it), and bench numbers are
machine-specific, so a shared runner's absolute milliseconds are a trend to read rather than a
threshold to fail.

**Per task, locally**
- `pnpm test` and `pnpm typecheck` — the same two CI gates, before the commit rather than after.
- `pnpm bench` — before/after against [`bench/BASELINE.md`](bench/BASELINE.md). This is the part CI
  cannot do for you.
- `tests/invalidation.spec.ts` — the perf invariants hold. A failure there is a broken feature, not
  a slow one.

**End to end**
- `pnpm demo` → **Performance** view: page through, type in search, toggle groups, push the page
  size to 5000. Foreground the tab; it refuses to measure a hidden one. When the *number* is the
  point rather than the behaviour, run it against `pnpm build:demo` served from `demo/dist` instead:
  the dev build costs about 8ms a frame in component creation alone, which is most of what a
  scrolling measurement reports (see [`bench/BASELINE.md`](bench/BASELINE.md)).
- Walk all 18 demo views. **Composed** and **Core only** exercise the primitives and pure functions
  directly and are the best canaries for a render-layer change.
- `pnpm build` and `pnpm build:docs` clean.

**The package**, before a release:

```bash
pnpm build && pnpm size
npm pack --dry-run          # right name, LICENSE and README in the tarball
pnpm dlx publint
pnpm dlx @arethetypeswrong/cli --pack . --profile esm-only --exclude-entrypoints style.css
```

`--exclude-entrypoints style.css` because a stylesheet has no type declarations to resolve and attw
reports the subpath as a failure on those grounds alone; the import itself is exercised by installing
the tarball into a scratch Vite app, which is the other half of this check and the one worth
repeating: build it, import `DataTable` and `@brillliand/vue-table-chad/style.css`, and typecheck it
under both `bundler` and `nodenext` resolution.
