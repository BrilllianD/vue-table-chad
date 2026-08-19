# Roadmap

Make the speed claim true, then virtualize, then ship.

**Status:** Phase 1 complete. Phase 2 and 3 not started.

---

## Where this stands

`vue-table` is a three-layer Vue 3 table library (core composables → headless primitives →
`DataTable` preset) aiming to be an npm package: a universal table with a flexible config that
**renders fast, without much overhead**.

Two things blocked that. One is now fixed.

1. ~~**The speed claim was unbacked and, in places, untrue.**~~ Phase 1 built the benchmarks, found
   the pipeline redoing full-dataset work on interactions that should be free, and fixed it.
2. **It still cannot be published.** Placeholder `@sandbox` scope, no LICENSE, no CI, no
   CJS/`default` export condition, and `files: ["dist"]` with a gitignored `dist/` means a fresh
   clone publishes an empty package. That is Phase 3.

Virtualization was deliberately *not* put first: pagination caps the DOM at `pageSize`, so the
render layer was not the bottleneck — the reactive pipeline was. Fixing it was cheaper, produced the
numbers that justify the claim, and the render refactor it needed is the same groundwork
virtualization requires.

### Branch state

Phase 1 lives on **`perf/pipeline`**, 12 commits. It was branched off `feat/column-drag-reorder`,
**not** `main` — `main` is 19 commits behind and predates the drag, theming and grouping work.
There is no git remote, so nothing has been opened as a PR. Deciding how these branches land is
still open.

---

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

## Phase 2 — Virtualization

Now measurable, on a render layer built for it.

### P2-1 · `useVirtualRows()` core composable
Windowed range over `displayRows`. Fixed row height first, variable height second. No DOM
assumptions beyond a scroll container and a measured viewport.

### P2-2 · `<VirtualBody>` primitive + `virtual` mode on `DataTable`
Mutually exclusive with pagination.

**Carries the `<tbody>` restructure deferred from P1-8.** `memoRows` was built during P1-8 and
removed, because it did nothing: `v-memo` has no effect *inside* a `v-for` (every iteration shares
one cache slot), and moving it onto `TableRow`'s own root did not gate slot updates either — both
confirmed with a probe before drawing the conclusion. Making it work means collapsing the preset's
`<template v-for>` + `v-if`/`v-else` into **one component per display row**, so `v-for` and `v-memo`
sit on the same element. That is the same restructure virtualization forces, and row memoisation
only pays at row counts pagination never reaches — hence here rather than there.

### P2-3 · The hard interactions — each needs an explicit decision and a test
Sticky header · pinned columns (`pinOffset`) · group headers and collapse state · shift-range
selection across the window boundary · the `tfoot` aggregate row.

### P2-4 · `useInfiniteDataSource`
So server data can feed a continuous scroll rather than a page slice.

### P2-5 · Accessibility floor
`aria-rowcount` / `aria-rowindex`, so a virtualized table does not lie to screen readers about its
size. Full keyboard grid navigation stays in the backlog.

### P2-6 · Acceptance
`PerfView` at 100k rows scrolling smoothly **with pinned columns and collapsed groups active
simultaneously** — that combination is where a naive virtualizer breaks.

**Note on verifying Phase 2:** unlike Phase 1 it cannot be settled by counting recomputes. It needs
real frame timings in a foregrounded browser tab, and background throttling makes automated
measurement unreliable — expect to drive `PerfView` by hand.

---

## Phase 3 — Ship to npm

Nothing here is hard; all of it is blocking.

### P3-1 · Name and identity
Replace `@sandbox/vue-table` (`package.json`, `README.md`, `tsconfig.json` paths,
`vitest.config.ts`, `vite.demo.config.ts`). Add `publishConfig: { access: "public" }` if scoped. Add
a git remote — there is none.

### P3-2 · Legal
`license` field **and** a LICENSE file. Neither exists; without them the package is legally unusable.

### P3-3 · Metadata
`repository`, `homepage`, `bugs`, `keywords`, `author`, `engines.node` (README requires Node 24,
`.nvmrc` agrees, `package.json` says nothing).

### P3-4 · The empty-package trap
`files: ["dist"]` plus a gitignored `dist/` publishes nothing from a fresh clone. Add
`prepublishOnly: "pnpm test && pnpm build"`.

### P3-5 · exports map
The types condition is correctly first, but there is no `require` and no CJS build while `main`
points at ESM, so CJS consumers get `ERR_REQUIRE_ESM`. Either add a CJS output or drop `main` and
declare ESM-only. Add a `default` condition and a `"./package.json"` export. Verify with `publint`
and `arethetypeswrong`.

### P3-6 · Dead config
`output.globals` and `lib.name` in `vite.config.ts` do nothing under `formats: ['es']`. Delete them,
or add a real UMD build and a CDN story.

### P3-7 · CI
No `.github/` exists. `ci.yml`: install → typecheck → test → build, plus a bundle-size budget
(currently **24.4 kB gzip JS / 3.3 kB gzip CSS** — worth defending) and `pnpm bench` for regression
visibility.

### P3-8 · Release flow
changesets → CHANGELOG → publish. Version is stuck at `0.1.0`.

### P3-9 · Publish the docs site
`pnpm build:docs` already produces a single self-contained page. Once P3-1 gives the project a
repository, point Pages (or any host) at `demo/dist` and drop the inlining step if it stops earning
its keep.

---

## Explicitly deferred

Decisions, not oversights.

- **i18n / label overrides** — ~35 hardcoded English strings (`"Search…"`, `"Select all rows on this
  page"`, `"No matching values"`, every `aria-label`). A real blocker for a public package, but not
  for making it fast.
- **Keyboard nav & full a11y** — cell focus grid, roving tabindex, `aria-colindex`. Phase 2 lands
  only the `aria-rowcount`/`aria-rowindex` floor virtualization requires.
- **Feature breadth** — tree/hierarchical rows, expandable detail rows, editable cells, multi-level
  header groups, CSV/clipboard export, pinned rows, custom aggregate reducers beyond
  `sum`/`avg`/`min`/`max`.
- **A search index.** Global search is the one number that stayed large (30 ms at 10k). Most of it is
  the columns' own `format` functions, because search matches what the user sees. The debounce is
  what makes it tolerable.

---

## Verification

**Per task**
- `pnpm test` — 304 tests stay green.
- `pnpm typecheck` — clean.
- `pnpm bench` — before/after against `bench/BASELINE.md`.
- `tests/invalidation.spec.ts` — the perf invariants hold. A failure there is a broken feature, not
  a slow one.

**End to end**
- `pnpm demo` → **Performance** view: page through, type in search, toggle groups, push the page
  size to 5000. Foreground the tab; it refuses to measure a hidden one.
- Walk all 13 demo views. **Composed** and **Core only** exercise the primitives and pure functions
  directly and are the best canaries for a render-layer change.
- `pnpm build` and `pnpm build:docs` clean.

**Phase 3**
- `npm pack` and inspect the tarball; install it into a scratch Vite app and a scratch Nuxt app;
  `publint` and `arethetypeswrong` clean.
