# TODO

Where this stands, what to do next, and the phase plan behind it — one file.

**State as of 2026-08-27:** everything below is on **`main`**, which tracks `origin/main`. 705 tests
across 38 files green, `pnpm typecheck` clean, and CI now runs all of it per push
(`bitbucket-pipelines.yml`).

## Shipped

One line per series. The commits carry the detail; this is the map.

| | |
| --- | --- |
| P1-1–P1-12 | **Prove and fix.** Benchmarks, then the pipeline work they justified — stages depending on query *fields*, a split group tree, sort keys projected per row. `tests/invalidation.spec.ts` counts the passes each interaction is allowed to move; the numbers are in [`bench/BASELINE.md`](bench/BASELINE.md). |
| E1–E6 | Editable rows — `useRowEditing`, a draft per row, validated and saved against a server that can refuse |
| G1–G9 | Header bands — multi-row `<thead>`, nested bands, folding one shut by subtracting from `visible`, a rule where a band ends, per-band overrides, both vertical rules as props |
| K1–K6, N1–N10 | The cell cursor — a focus grid, a roving tabindex, `Enter` to edit, paging with `Ctrl`+arrow, `autofocusCursor`. See [Keyboard navigation](docs/keyboard.md). |
| R1–R8 | **Code health.** No feature changed: `useTable()` out of `TableRoot.vue`, `DataTable.vue` 972 → 588 lines, `table.css` into ten partials with a byte-identical build, `noUncheckedIndexedAccess` on, and `tests/apiSurface.spec.ts` enforcing that every value export appears in the demo. |
| P2-1, P2-2 | Row virtualization — `useVirtualRows`, a `<VirtualBody>` primitive, and `virtual` on the preset. See [Virtualization](docs/virtualization.md). |
| P3-1–P3-3 | Identity, legal, metadata — the name, the LICENSE, `repository`/`homepage`/`bugs`/`keywords`/`engines`. |
| P3-7 | CI — `bitbucket-pipelines.yml`, and `pnpm size`, a bundle budget measured from the build it shipped with. |
| P3-4–P3-6 | The tarball — `prepublishOnly`, ESM-only with `main` dropped, rolled-up declarations. |

## Do this next

Phase 3 is what remains to ship, and it is two tasks.

### P3-8 — release flow
changesets → CHANGELOG → publish. Version is stuck at `0.1.0`. `prepublishOnly` already runs
`pnpm test && pnpm build`, so the one thing left is deciding versions and writing them down.

### P3-9 — publish the docs site
`pnpm build:docs` already produces a single self-contained page. Bitbucket has no Pages equivalent,
so this needs a static host pointed at `demo/dist` — Netlify or Cloudflare Pages, either of which
can build from the Bitbucket remote. Drop the inlining step if it stops earning its keep once a real
host is serving the assets.

## Decisions, settled

- **The package name is `@brillliand/vue-table-chad`.** Scoped, so `publishConfig: { access:
  "public" }` is required rather than optional. The scope is the account name `BrilllianD`
  lowercased, because **npm forbids uppercase in a package name, scope included** — that lowercase
  is correct and is not a typo to fix. Casing survives in the URLs, where `repository` and
  `homepage` keep `BrilllianD`.
- **The remote is Bitbucket:** `git@bitbucket.org:BrilllianD/vue-table-chad.git`. So CI is
  `bitbucket-pipelines.yml`, not `.github/workflows/ci.yml`, and P3-9 cannot point GitHub Pages at
  `demo/dist`.
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
  so the next reader can tell drift from slack. The number this file used to carry was about 35%
  low after four feature series — re-measure rather than copy.

## Phase 2 — what is left

P2-1 and P2-2 landed on 2026-08-27. Four of the five interactions P2-3 used to list turned out to
need nothing, and each now has a test saying so rather than an assumption: **the sticky header**
(sticky is relative to the scrollport; nothing in a `<tbody>` reaches it), **pinned columns**
(`pinOffset` is horizontal and per cell, and a spacer's one spanning cell has nothing to pin), **the
`tfoot` aggregate row** (outside the `<tbody>` entirely), and **shift-range selection across the
window boundary** (`toggleRange` resolves both endpoints out of the in-memory array and never reads
the DOM).

### P2-3 · What is actually left

- **`overallAggregates` is bound eagerly.** `TableRoot.vue` passes it regardless of `showFooter`, so
  in virtual mode it is an O(dataset) pass per data change nobody asked for. The cheapest win here.
- **`selection.headerState` goes O(dataset) per selection write.** Not per data change, which is the
  worse direction — 8.2 ms a click at 100k, against 0.002 ms for a page of 25. It is not caught by
  `tests/invalidation.spec.ts`, because it is not one of the wrapped functions; fixing it should
  wrap it. The demo leaves `selectable` off until this is fixed.
- **Scroll anchoring across a collapse.** Folding a band while scrolled deep changes the total
  height under you, and the offset stops meaning the same row.
- **`Ctrl`+arrow** meaning "scroll a viewport" rather than nothing.
- **Variable row height.** A group row lays out a pixel taller than a data row, which is the first
  concrete case. The error is bounded by the window rather than accumulating, so this is polish
  rather than correctness. `useVirtualRows` is already shaped for it: `spaceBefore`/`spaceAfter` are
  opaque pixel totals and `offsetFor`/`indexAt` are functions, so what it adds is a
  `measureItem(index, height)` and a prefix sum behind those two.

### P2-4 · `useInfiniteDataSource`
So server data can feed a continuous scroll rather than a page slice.

### P2-5 · Accessibility floor
`aria-rowcount` / `aria-rowindex`, so a virtualized table does not lie to screen readers about its
size.

### P2-6 · Acceptance
`PerfView` at 100k rows scrolling smoothly **with pinned columns and collapsed groups active
simultaneously** — that combination is where a naive virtualizer breaks. Reachable without building
anything: the **Virtual rows** view has 100k, grouping and the cursor behind toggles, and `PerfView`
has the scroll measurement.

**Still owed from P2-2: the timed browser session.** This is the one part of Phase 2 that cannot be
settled by counting recomputes, and the one part not done. `PerfView` has the Virtual toggle, the
100k dataset and a *Scroll 2000 rows* button, but a hidden tab never fires `requestAnimationFrame`,
so the numbers have to be taken by hand in a foregrounded tab. What Chrome could be asked *without*
timing is in [`bench/BASELINE.md`](bench/BASELINE.md): 20 rows in the `<tbody>` at 100k, a 1.83M-pixel
table whose scrollbar agrees, and 600k pixels of height coming off when a band collapses.

## Housekeeping, independent of the above

- **`pnpm lint` is red.** Two `vue/no-dupe-keys` errors at `src/components/primitives/TableRoot.vue:138`,
  where destructuring `useTable()`'s result binds `state` and `columns` — names the component also
  declares as props. In `<script setup>` props are read through `props.`, so nothing actually
  collides; the rule predates the syntax. Which makes this a *decision* to make and write down —
  rename the bindings, or disable the rule for this file with a one-line why — rather than a bug to
  fix. CI runs lint **non-gating** until then: gating on a known-red check only teaches everyone to
  ignore the pipeline.
- **Editable rows shipped without a docs page.** Every other feature has a topic page in README's
  docs table; editing appears only inside [`docs/keyboard.md`](docs/keyboard.md), as the thing
  `Enter` opens. It wants a `docs/editing.md` and a row in that table.

## Explicitly deferred

Decisions, not oversights.

- **i18n / label overrides** — ~35 hardcoded English strings (`"Search…"`, `"Select all rows on this
  page"`, `"No matching values"`, every `aria-label`). A real blocker for a public package, but not
  for making it fast.
- **Full a11y beyond the grid** — `aria-colindex`/`aria-rowindex`, and an announced live region
  for cursor movement. Phase 2 lands only the `aria-rowcount`/`aria-rowindex` floor virtualization
  requires.
- **Feature breadth** — tree/hierarchical rows, expandable detail rows, CSV/clipboard export,
  pinned rows, custom aggregate reducers beyond `sum`/`avg`/`min`/`max`.

  Three items have since left this list: **editable cells** shipped, so did **multi-level
  header groups** — see [Header bands](docs/column-groups.md) — and so did the **cell focus grid**
  and its roving tabindex, see [Keyboard navigation](docs/keyboard.md).
- **A search index.** Global search is the one number that stayed large (30 ms at 10k). Most of it is
  the columns' own `format` functions, because search matches what the user sees. The debounce is
  what makes it tolerable.

## Working agreement

**One task, one commit.** No batching, no work-in-progress commits spanning tasks.

Before each commit: `pnpm test` green, `pnpm typecheck` clean. A task whose done-when is not met does
not get committed; it gets finished, or split into a smaller task that is complete.

Commit subject names the task by ID, in the imperative mood the history uses:

```
P1-4: Depend on query fields, not on the query object

Paging rebuilt the whole pipeline because useTableState returns a fresh
query object per write. Each stage now depends only on the fields it reads.
```

## What not to relearn

The rest of Phase 1's lessons are standing contracts now and live in [`CLAUDE.md`](CLAUDE.md). These
three are about how to work rather than what the code must do:

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
`pnpm bench` non-gating: lint is known-red (see Housekeeping), and bench numbers are machine-specific,
so a shared runner's absolute milliseconds are a trend to read rather than a threshold to fail.

**Per task, locally**
- `pnpm test` and `pnpm typecheck` — the same two CI gates, before the commit rather than after.
- `pnpm bench` — before/after against [`bench/BASELINE.md`](bench/BASELINE.md). This is the part CI
  cannot do for you.
- `tests/invalidation.spec.ts` — the perf invariants hold. A failure there is a broken feature, not
  a slow one.

**End to end**
- `pnpm demo` → **Performance** view: page through, type in search, toggle groups, push the page
  size to 5000. Foreground the tab; it refuses to measure a hidden one.
- Walk all 17 demo views. **Composed** and **Core only** exercise the primitives and pure functions
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
