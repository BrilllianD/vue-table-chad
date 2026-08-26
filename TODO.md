# TODO

Where this stands, what to do next, and the phase plan behind it — one file.

> `ROADMAP.md` was folded in here on 2026-08-26. Two files meant two states to keep current, and
> they had drifted apart: the roadmap still told a cold reader that Phase 1 lived on a branch and
> that there was no git remote, months after both stopped being true.

**State as of 2026-08-26:** the work is on **`feat/column-groups`**, 28 commits ahead of `main` and
a clean fast-forward — `main` holds nothing the branch lacks. 604 tests across 31 files green,
`pnpm typecheck` clean. `main` itself is clean and tracks `origin/main`.

Four series have landed since Phase 1 merged, none of them on `main` yet:

| | |
| --- | --- |
| E1–E6 | Editable rows — `useRowEditing`, a draft per row, validated and saved against a server that can refuse |
| G1–G6 | Header bands — multi-row `<thead>`, nested bands, folding one shut by subtracting from `visible` |
| K1–K6 | The cell cursor — a focus grid, a roving tabindex, `Enter` to edit |
| N1–N10 | Cursor polish — paging with `Ctrl`+arrow, a scroll box that knows its pins, `autofocusCursor` |

---

## Where this stands

`vue-table` is a three-layer Vue 3 table library (core composables → headless primitives →
`DataTable` preset) aiming to be an npm package: a universal table with a flexible config that
**renders fast, without much overhead**.

Two things blocked that. One is now fixed.

1. ~~**The speed claim was unbacked and, in places, untrue.**~~ Phase 1 built the benchmarks, found
   the pipeline redoing full-dataset work on interactions that should be free, and fixed it.
2. **It still cannot be published.** Placeholder `@sandbox` scope, no LICENSE, no CI, no `default`
   export condition, and `files: ["dist"]` with a gitignored `dist/` means a fresh clone publishes
   an empty package. That is Phase 3, and it is next.

Virtualization was deliberately *not* put first: pagination caps the DOM at `pageSize`, so the
render layer was not the bottleneck — the reactive pipeline was. Fixing it was cheaper, produced the
numbers that justify the claim, and the render refactor it needed is the same groundwork
virtualization requires.

## Do this first: land the branch

Phase 3 renames the package. Doing that on an unmerged 28-commit stack renames the wrong trunk, so
the merge comes first.

- Fast-forward `feat/column-groups` into `main` and push. It is a true fast-forward; no merge commit
  is needed and no conflict is possible.
- **Delete `feat/editable-rows`** — now an ancestor of `HEAD`, so it holds nothing of its own.
- **Delete `perf/pipeline`** — fully merged into `main`, and two behind.

## Decisions, settled

Both of the blockers this file used to carry are now answered.

- **The package name is `@brillliand/vue-table-chad`.** Scoped, so `publishConfig: { access:
  "public" }` is required rather than optional. The scope is the account name `BrilllianD`
  lowercased, because **npm forbids uppercase in a package name, scope included** — that lowercase
  is correct and is not a typo to fix. Casing survives in the URLs, where `repository` and
  `homepage` keep `BrilllianD`.
- **The remote exists:** `git@bitbucket.org:BrilllianD/vue-table-chad.git`. Two consequences worth
  carrying into the tasks below, because the plan was originally written assuming GitHub: CI is
  `bitbucket-pipelines.yml`, not `.github/workflows/ci.yml`, and P3-9 cannot point GitHub Pages at
  `demo/dist`.

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

---

## Why Phase 3 before Phase 2

The original plan ordered it 2 → 3, written when Phase 1 still sat on an unmerged branch. That
ordering no longer holds:

- **The remote is no longer something P3-1 has to create — it is something already there.** That
  makes P3-7 (CI) and P3-9 (docs site) available *today*, and those are exactly the guards worth
  having *during* Phase 2. Landing a virtualizer with no CI means the bundle-size budget and the
  bench regression signal arrive after the largest render change the project has made.
- **Phase 3 is nine small, fully specified tasks with no design risk.** Phase 2 is open-ended and,
  by its own note below, cannot be settled by counting recomputes; it needs hand-driven `PerfView`
  sessions in a foregrounded tab.
- The four series above were feature work, and the ten commits before them were ship-shaped polish.
  Phase 3 finishes that arc.

## Phase 3 — Ship to npm

Nothing here is hard; all of it is blocking. In order.

### 1 · P3-1 + P3-2 + P3-3 — identity, legal, metadata
One pass, since they land together.

**The rename is a 40-file sweep, not a config edit.** `@sandbox` appears in:

| | |
| --- | --- |
| 5 | alias and config sites — `package.json`, `tsconfig.json`, `vitest.config.ts`, `vite.demo.config.ts`, `vite.playground.config.ts` |
| 29 | plain imports — 16 of the 17 `demo/src/views/*`, two demo components and its mock api, `playground/**`, `bench/*`, and `src/index.ts` |
| 5 | prose — `README.md`, `CLAUDE.md`, `docs/column-groups.md`, `docs/styling.md`, and this file |
| 1 | `tests/docsLinks.spec.ts` — so the sweep has a test watching it |

Then `publishConfig: { access: "public" }`. A LICENSE file **and** the `license` field — without
both the package is legally unusable. Then `repository`, `homepage`, `bugs`, `keywords`, `author`,
`engines.node` (README and `.nvmrc` both say Node 24; `package.json` says nothing).

*Done when:* `npm pack --dry-run` shows the right name and the LICENSE in the tarball.

### 2 · P3-4 + P3-5 + P3-6 — make the tarball real
`files: ["dist"]` plus a gitignored `dist/` publishes an empty package from a fresh clone; add
`prepublishOnly: "pnpm test && pnpm build"`. Then the exports map: there is no `require` condition
and no CJS build while `main` points at ESM, so CJS consumers get `ERR_REQUIRE_ESM`.
**Recommendation: drop `main` and declare ESM-only** rather than adding a CJS output — Vue 3.5 plus
Node 24 makes the CJS consumer largely theoretical, and a second build format is a permanent cost.
Add a `default` condition and a `"./package.json"` export. Delete `output.globals` and `lib.name`
from `vite.config.ts`; they do nothing under `formats: ['es']`.

*Done when:* `publint` and `arethetypeswrong` are clean, and the tarball installs into a scratch
Vite app.

### 3 · P3-7 — CI
`bitbucket-pipelines.yml`, on Node 24 with pnpm 11.3.0: install → typecheck → test → build. Run
`pnpm bench` for regression visibility.

**Re-measure the bundle budget; do not copy the number this file used to carry.** The 24.4 kB gzip
JS / 3.3 kB gzip CSS recorded during Phase 1 is roughly 35% low after four feature series — the
2026-08-25 `dist/` gzips to about **33 kB JS / 4 kB CSS**. Take the figure from a fresh `pnpm build`
and set the budget above it.

*Done when:* a pushed branch shows a green pipeline, and an artificially bloated build fails the
budget.

### 4 · P3-8 — release flow
changesets → CHANGELOG → publish. Version is stuck at `0.1.0`.

### 5 · P3-9 — publish the docs site
`pnpm build:docs` already produces a single self-contained page. Bitbucket has no Pages equivalent,
so this needs a static host pointed at `demo/dist` — Netlify or Cloudflare Pages, either of which
can build from the Bitbucket remote. Drop the inlining step if it stops earning its keep once a real
host is serving the assets.

---

## Phase 2 — Virtualization

Now measurable, on a render layer built for it.

### P2-1 · `useVirtualRows()` core composable
Windowed range over `displayRows`. Fixed row height first, variable height second. No DOM
assumptions beyond a scroll container and a measured viewport.

**This is the one Phase 2 task that can start cold** — self-contained core work, depending on
nothing in Phase 3. If you would rather build than ship, start here.

### P2-2 · `<VirtualBody>` primitive + `virtual` mode on `DataTable`
Mutually exclusive with pagination. **This is where the cost lands.**

**Carries the `<tbody>` restructure deferred from P1-8.** `memoRows` was built during P1-8 and
removed, because it did nothing: `v-memo` has no effect *inside* a `v-for` (every iteration shares
one cache slot), and moving it onto `TableRow`'s own root did not gate slot updates either — both
confirmed with a probe before drawing the conclusion. Making it work means collapsing the preset's
`<template v-for>` + `v-if`/`v-else` into **one component per display row**, so `v-for` and `v-memo`
sit on the same element. That is the same restructure virtualization forces, and row memoisation
only pays at row counts pagination never reaches — hence here rather than there.

### P2-3 · The hard interactions — each needs an explicit decision and a test
Sticky header · pinned columns (`pinOffset`) · group headers and collapse state · shift-range
selection across the window boundary · the `tfoot` aggregate row. The cell cursor now joins this
list: `K1–K6` gives the body a focus grid whose `tabStop` assumes a rendered row.

### P2-4 · `useInfiniteDataSource`
So server data can feed a continuous scroll rather than a page slice.

### P2-5 · Accessibility floor
`aria-rowcount` / `aria-rowindex`, so a virtualized table does not lie to screen readers about its
size. Keyboard grid navigation has since shipped — see [Keyboard navigation](docs/keyboard.md).

### P2-6 · Acceptance
`PerfView` at 100k rows scrolling smoothly **with pinned columns and collapsed groups active
simultaneously** — that combination is where a naive virtualizer breaks.

**Note on verifying Phase 2:** unlike Phase 1 it cannot be settled by counting recomputes. It needs
real frame timings in a foregrounded browser tab, and background throttling makes automated
measurement unreliable — expect to drive `PerfView` by hand.

---

## Housekeeping, independent of the above

- **Editable rows shipped without a docs page.** Every other feature has a topic page in README's
  docs table; editing appears only inside [`docs/keyboard.md`](docs/keyboard.md), as the thing
  `Enter` opens. It wants a `docs/editing.md` and a row in that table.

---

## Phase 1 — Prove and fix ✅

All twelve tasks landed. Tests went 271 → 304.

| | |
| --- | --- |
| P1-1 | Shared seeded fixture in `bench/fixtures.ts` — rows **and** columns, since accessors, comparators, formats and aggregates are half of what the pipeline costs. The demo re-exports it. |
| P1-2 | `bench/pipeline.bench.ts` (pure functions at 10k/100k) and `bench/reactive.bench.ts` (what one *interaction* costs). Baseline in `bench/BASELINE.md`. |
| P1-3 | `tests/invalidation.spec.ts` — counts passes through the four O(dataset) functions and asserts what each interaction may move. |
| P1-4 | Pipeline stages depend on query **fields**, not the query object. Paging stopped re-filtering and re-sorting the dataset. |
| P1-5 | `debounceMs` on `useLocalDataSource` (default 150). `QueryState` still records every keystroke; only the filter lags. |
| P1-6 | `flattenGroups` split into `buildGroupTree` + `flattenTree`; `totals` memoized. Collapsing walks a tree instead of rebuilding one. |
| P1-7 | `shallowRef` for row data (README, demo, playground) and for selection state; `TableRoot`'s watchers made shallow. |
| P1-8 | `TableRow` primitive, cell values resolved once, `useColumns` sharing unpinned column identities. |
| P1-9 | `demo/src/views/PerfView.vue` — the full 10k rows timed in a browser, to the frame after the paint. |
| P1-10 | `sortKeyFor` — sort keys projected once per row instead of derived inside a comparator per comparison. |
| P1-11 | `CLAUDE.md` — layer contract, perf invariants as rules, known gaps. |
| P1-12 | API reference + Recipes views; `pnpm build:docs` folds the demo into one self-contained page. |

### Results (10k rows, filtered and sorted)

| Interaction | Before | After |
| --- | ---: | ---: |
| `setPage` | 13.2 ms | **0.004 ms** |
| `setPage` while grouped | 33.7 ms | **0.052 ms** |
| group collapse toggle | 3.7 ms | **0.013 ms** |
| search keystroke | 21.8 ms | **0.006 ms** |
| `sortRows`, date column | 93.0 ms | **6.8 ms** |
| `sortRows`, number column | 14.0 ms | **3.5 ms** |
| `aggregateGroups`, two levels | 34.3 ms | **23.4 ms** |

### What Phase 1 learned, that Phase 2 should not relearn

- **Benchmark a *loaded* table.** With no filter and no sort every pipeline stage short-circuits to
  `rows.slice()`, so a pristine harness reports paging as free. Apply a filter and a sort first, and
  warm the harness outside the measured region or construction swamps the signal.
- **`it.fails` is the right ratchet.** Vitest fails an `it.fails` that starts passing, so an
  invariant written before its fix demands to be updated rather than quietly ratifying whatever the
  code does later. A skip would just rot.
- **Derive per row, not per comparison.** Comparisons run O(n log n) times; cells number n. This was
  worth 14× on a date sort and was not in the original plan — the bench found it.
- **The bench also argues *against* work.** Three trims the plan listed were measured and turned out
  to be noise. `bench/BASELINE.md` records them as decisions.
- **`v-memo` has no effect inside a `v-for`**, and on a component's own root it does not gate slot
  updates either. Verified with a probe. See P2-2.
- **A hidden tab never fires `requestAnimationFrame`** and clamps `setTimeout` to ~1 s. Any
  browser-side measurement needs a visibility guard, and automated tab focus is unreliable.

---

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

---

## Verification

**Per task**
- `pnpm test` — all 604 stay green.
- `pnpm typecheck` — clean.
- `pnpm bench` — before/after against `bench/BASELINE.md`.
- `tests/invalidation.spec.ts` — the perf invariants hold. A failure there is a broken feature, not
  a slow one.

**End to end**
- `pnpm demo` → **Performance** view: page through, type in search, toggle groups, push the page
  size to 5000. Foreground the tab; it refuses to measure a hidden one.
- Walk all 16 demo views. **Composed** and **Core only** exercise the primitives and pure functions
  directly and are the best canaries for a render-layer change.
- `pnpm build` and `pnpm build:docs` clean.

**Phase 3**
- `npm pack` and inspect the tarball; install it into a scratch Vite app and a scratch Nuxt app;
  `publint` and `arethetypeswrong` clean.
