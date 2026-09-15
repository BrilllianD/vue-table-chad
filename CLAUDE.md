# vue-table-chad

Headless table primitives for Vue 3, released as an installable tarball (npm publish is still
open work). The point of the project
is a universal table with a flexible config that **renders fast, without much overhead** — so
performance is a correctness property here, not a nice-to-have.

Open work lives in [`TASKS.md`](TASKS.md) and nowhere else; what has shipped is read from the git
history. This file is the standing contracts, each stated once. The reasoning behind one lives in the
directory-scoped file next to the code it governs, which loads when you open that directory:

| File | Governs |
| --- | --- |
| [`src/core/CLAUDE.md`](src/core/CLAUDE.md) | the layer rule, query-field dependence, the two pipeline habits, `noUncheckedIndexedAccess`, `theme.ts` |
| [`src/components/primitives/CLAUDE.md`](src/components/primitives/CLAUDE.md) | zero CSS, standalone rendering, optional vs required context |
| [`src/components/preset/CLAUDE.md`](src/components/preset/CLAUDE.md) | the stylesheet's two hazards, theme plumbing, column-width measurement |
| [`bench/CLAUDE.md`](bench/CLAUDE.md) | the fixtures, the two traps, what the bench argued against |
| [`RELEASING.md`](RELEASING.md) | the pre-release checklist and the packaging decisions |
| [`Makefile`](Makefile) | `make pack` / `pack-check` / `release-check` — the checklist's commands, runnable |
| [`docs/nav.ts`](docs/nav.ts) | the one source for the README docs index, the VitePress sidebar and the demo links — `tests/docsIndex.spec.ts` guards it |

## Commands

```bash
pnpm test          # vitest
pnpm test <name>   # one file, e.g. pnpm test sorting
pnpm typecheck     # vue-tsc --noEmit
pnpm lint          # eslint — gates in CI
pnpm bench         # vitest bench over bench/**
pnpm build         # typecheck + vite lib build -> dist/
pnpm size          # bundle-size budget over dist/ — gates in CI
pnpm docs:api      # regenerate demo/src/data/apiReference.ts from src/ doc comments
pnpm demo          # http://localhost:5174 — every feature one view each
pnpm dev           # http://localhost:5173 — the smaller playground
pnpm build:docs    # the demo, folded into one self-contained page
make pack          # build + size + npm pack -> the installable tarball
```

Node 24 (`.nvmrc`). pnpm, not npm.

## The three layers, and the rules between them

```
src/core/         composables and pure functions — NO components, NO DOM
src/components/primitives/   headless, slot-driven — NO CSS of their own
src/components/preset/       DataTable + table.css, assembled from primitives
```

These are contracts, not conventions:

- **`core/` imports nothing from `components/`.** The demo's "Core only" view proves it.
- **Primitives ship no stylesheet.** Class names and `data-*` attributes and nothing else; using only
  primitives must pull in zero CSS.
- **Every primitive works standalone.** Given explicit props, it renders with no `<TableRoot>` above
  it. `requireTableContext(name)` marks the ones that are the exception.
- **The preset owns the theme.** Two hazards guard `table.css`, and `tests/presetStyles.spec.ts`
  enforces both against the source, since jsdom applies no CSS.

## Performance invariants

`tests/invalidation.spec.ts` wraps the five dataset-wide functions — `filterRows`, `sortRows`,
`countGroups`, `flattenGroups`, `aggregateGroups` — and asserts what each interaction is allowed to
move. Treat a failure there as a broken feature, not a slow one.

- **Paging redoes nothing.** No filter pass, no sort pass. Stages depend on query *fields*, never on
  the query object — see `src/core/CLAUDE.md` for why that is the whole trick.
- **These never reach the pipeline at all:** column layout (resize, pin, reorder), selection,
  folding a header band, the cell cursor (a clamped move writes no state), collapsing a group
  (`buildGroupTree` / `flattenTree` are separate; only the second reads collapse state), and editing
  up to the moment a save succeeds — an open draft, typing, a failed validation and a rejected save
  all leave the dataset alone. A save that *succeeds* does redo the pipeline, exactly once.
- **Scrolling a virtual window redoes nothing.** A scroll that does not move the window propagates
  nothing at all — `start` and `end` are floored integers. This matters more than the paging
  equivalent it mirrors: `virtual` is a page size of *everything*, so each pass it must not trigger
  would run over the whole dataset.
- **Work that *is* asked for still happens.** Changing the sort must re-sort, exactly once. An
  invariant suite that only says "do less" is satisfied by a table that does nothing.

Two habits keep the pipeline honest, both argued out with their numbers in `src/core/CLAUDE.md`:
**Derive per row, not per comparison**, and **Row data belongs in a `shallowRef`**.

## Benchmarks

`bench/BASELINE.md` holds the numbers, including the trims the bench argued **against**. Read
`bench/CLAUDE.md` before adding one; two traps there will otherwise swamp the signal.

## Conventions

- Comments explain *why*, and especially why the obvious alternative is wrong. The existing code is
  dense with this; match it rather than stripping it.
- Public API changes go through `src/index.ts`. Every export carries a doc comment on its
  **declaration** whose first paragraph reads as a one-line summary; `pnpm docs:api` harvests those
  into `demo/src/data/apiReference.ts` and a test fails if the committed copy differs, so the summary
  is written once in `src/` and never in the demo. Every *value* export must also appear in `demo/`,
  in a view's `:api` list or imported by one — **`tests/apiSurface.spec.ts` names the offender:
  demonstrate it, or stop exporting it.** Types are exempt; a type cannot be used in a view visibly.
- **One task, one commit.** No batching, no work-in-progress commits spanning tasks. `pnpm test`
  green, `pnpm typecheck` and `pnpm lint` clean before each. A task whose done-when is not met does not get
  committed; it gets finished, or split into a smaller task that is complete. The subject names the
  task by ID, in the imperative mood the history already uses — `P1-4: Depend on query fields, not on
  the query object`, with the body saying what was wrong.
- **`TASKS.md` is the work queue, kept current as the work moves, not after it.** Flip a task to
  `[~]` when starting it, and **delete it outright once it is committed** — there is no "done" flag
  on purpose, since the commit is the record and a checked-off list drifts from it. Flags: `[ ]` not
  started, `[~]` in progress, `[?]` blocked, `[-]` deliberately deferred. New work gets an ID and an
  explicit **Done when**, so whether it can be deleted has an answer. A decision reached while
  finishing a task goes to **Settled decisions** below or to the nested file for the directory it
  governs — not into the deleted entry.

## Settled decisions

Answered once. Reopen one only with a reason, and rewrite the entry rather than leaving both. The
theme and column-width decisions live in `src/components/preset/CLAUDE.md`, the packaging ones in
`RELEASING.md`; what is left here is cross-cutting.

- **Theme custom properties are `--vtc-`, classes stay `.vt-`.** One character apart on purpose: the
  properties needed a prefix far enough from a consumer's own `--vt-*` to stop colliding, and the
  classes are a separate public surface — ~200 assertions across 11 spec files, plus
  `docs/styling.md` teaching `.vt-th[data-sorted]` as a styling hook — so renaming them is its own
  decision and has not been taken.
- **One dropdown, and its classes are `.vt-select-*`.** `StaticSelect` and `AsyncSelect` are the same
  panel over two sources, so the classes name the control rather than where its options came from;
  `.vt-asyncselect-*` was renamed rather than aliased, because two names for one thing outlive
  whoever remembers why. That is a change to the public class surface and the exception the entry
  above describes: it was taken because nothing outside two CSS partitions and three spec files
  referenced those names, and no page of `docs/` taught one.
- **A lint rule that is wrong gets a disable with its reason; code that is wrong gets fixed.** The
  distinction is the one the lint sweep turned on. Three rules fire on deliberate patterns and are suppressed in
  place with the why beside them — `vue/no-dupe-keys` and `vue/no-mutating-props` both predate
  `<script setup>`, and a bare `revision.value` in `useVirtualRows.ts` is the dependency, not dead
  code — while `vue/multi-word-component-names` is off for `docs/**`, whose files are documentation
  artefacts named to pair with the pages beside them. The one real finding, three components
  registered but unused in a trimmed excerpt, was deleted rather than silenced. `pnpm lint` gates in
  CI on the strength of that: a suppression nobody can read the reason for is how a check goes
  known-red again.
- **The theme is two tiers, plus machinery marked as machinery.** `styles/scales.css` holds the
  values, `styles/tokens.css` the roles built out of them, a leading underscore means machinery.
  `src/core/theme.ts` is the same list in TypeScript, checked against both partitions by
  `tests/theme.spec.ts`.

## What not to relearn

- **`it.fails` is the right ratchet.** Vitest fails an `it.fails` that starts passing, so an
  invariant written before its fix demands to be updated rather than quietly ratifying whatever the
  code does later. A skip would just rot.
- **The bench also argues *against* work.** Three trims the Phase 1 plan listed were measured and
  turned out to be noise. `bench/BASELINE.md` records them as decisions.
- **`v-memo` is settled, not deferred.** No effect inside a `v-for`; through a slot outlet it shares
  one `_cache` across every invocation; and in the one shape where it *would* work — a per-row
  component — it reuses the whole vnode, slots included, freezing whatever the caller's own
  `cell:<id>` slots close over. Windowing then leaves ~30 rendered rows for it to save anything on.

## Verification

**Per push, by CI** — `bitbucket-pipelines.yml` is the list, and all of it gates except one step:
`pnpm bench` on a shared runner is a trend to read rather than a threshold to fail.

**Per task, locally**
- `pnpm test`, `pnpm typecheck` and `pnpm lint` — the same CI gates, before the commit rather than
  after.
- `pnpm bench` — before/after against [`bench/BASELINE.md`](bench/BASELINE.md). This is the part CI
  cannot do for you.
- `tests/invalidation.spec.ts` — the perf invariants hold. A failure there is a broken feature, not
  a slow one.

**End to end**
- `pnpm demo` → **Performance** view: page through, search, toggle groups, push the page size to
  5000. Foreground the tab; it refuses to measure a hidden one. When the *number* is the point rather
  than the behaviour, run `pnpm build:demo` served from `demo/dist` instead.
- Walk every demo view. **Composed** and **Core only** exercise the primitives and pure functions
  directly and are the best canaries for a render-layer change.
- `pnpm build` and `pnpm build:docs` clean.

**Before a release** — see [`RELEASING.md`](RELEASING.md).
