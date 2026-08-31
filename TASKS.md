# TASKS

Open work only. Each task carries a status flag that gets updated as the work moves; **a task that
is finished is deleted from this file rather than marked done** — the commit is the record.
[`CLAUDE.md`](CLAUDE.md) keeps the standing contracts, the settled decisions and how work is
verified; this file keeps only what is still to do.

Status flags:

| Flag | Meaning |
| --- | --- |
| `[ ]` | Not started |
| `[~]` | In progress — working tree or a branch has part of it |
| `[?]` | Blocked, or waiting on a decision that is not mine to make |
| `[-]` | Deliberately deferred — listed so it is not rediscovered as an oversight |

Working agreement is unchanged: one task, one commit; `pnpm test` and `pnpm typecheck` green before
each; the commit subject names the task by ID.

---

## Active

### `[ ]` T2 — P3-8: release flow

changesets → CHANGELOG → publish. The version is still `0.1.0`, and `prepublishOnly` already runs
`pnpm test && pnpm build`, so what is left is choosing how versions are decided and writing that
down.

**Done when:** a changeset config is committed, the first CHANGELOG entry exists, and the release
steps are documented well enough that a second person could cut a version. Run the pre-release
package checks from `CLAUDE.md`'s Verification section (`npm pack --dry-run`, `publint`, `attw`) before
tagging anything.

### `[~]` T6 — Size an undeclared column to what it holds

`resolvedWidthOf` now answers a declared width, a resize or the 160 fallback, and nothing measures
anything — so a column that declares no width is still 160 whatever it holds. The width has to come
from the rendered table, which means the probe lives in `preset/` (`core/` may not touch the DOM)
and reports into `useColumns` the way `useVirtualRows.measureItem` reports row heights.

**Done when:** a column declaring no `width` renders at its content width, clamped into
`[minWidth ?? 60, maxWidth ?? defaultWidth]`; measured widths live outside `layout.widths`, so
`resetWidth`, `resetWidths` and the saved layout are unchanged by one; the measurement is a no-op
where nothing has geometry, so the existing suite keeps seeing the 160 fallback; scrolling a virtual
window never re-measures; and `tests/invalidation.spec.ts` shows the report reaching no pipeline
stage.

### `[ ]` T7 — Say what the widths do now, and show it

`docs/getting-started-js.md:113` says `width`/`minWidth`/`maxWidth` default to "unset", which was
wrong even before this work — the code substituted 160. Nothing documents `flex`, and no demo view
exercises a column that declares no width: the shared fixture declares one on all eleven columns.

**Done when:** `docs/column-layout.md` has a **Sizing** section covering the resolution order, the
clamp and `flex`; the field table in `docs/getting-started-js.md` matches the code; `docs/styling.md`
names `[data-fill]` as the hook for a table that should fill its box anyway; and the Columns demo
shows an undeclared column beside a flexible one, from its own fixture rather than by editing the
bench workload.

### `[ ]` T3 — P3-9: publish the docs site

`pnpm build:docs` already produces one self-contained page. Bitbucket has no Pages equivalent, so
this needs a static host pointed at `demo/dist` — Netlify or Cloudflare Pages, either of which can
build from the Bitbucket remote.

**Done when:** a URL serves the built docs, the build runs from the remote rather than from a local
upload, and the README links to it. Drop the inlining step if a real host serving the assets makes
it stop earning its keep.

### `[?]` T4 — Decide the `vue/no-dupe-keys` lint failure

`pnpm lint` is red on two errors at `src/components/primitives/TableRoot.vue:138`: destructuring
`useTable()` binds `state` and `columns`, which the component also declares as props. In
`<script setup>` props are read through `props.`, so nothing collides — the rule predates the
syntax. This is a decision to make and write down, not a bug to fix: rename the bindings, or disable
the rule for this file with a one-line why.

**Done when:** `pnpm lint` is green, the choice is recorded in `CLAUDE.md`'s settled decisions, and CI
promotes lint from non-gating to gating — gating on a known-red check only teaches everyone to
ignore the pipeline.

---

## Deferred

Decisions rather than oversights. Promote one into **Active** when it becomes real work.

### `[-]` D1 — i18n / label overrides

Roughly 35 hardcoded English strings (`"Search…"`, `"Select all rows on this page"`, `"No matching
values"`, every `aria-label`). A real blocker for a public package, but not for making it fast.

### `[-]` D2 — Full a11y beyond the grid

`aria-colindex`, and an announced live region for cursor movement. Phase 2 landed only the
`aria-rowcount`/`aria-rowindex` floor that virtualization required.

### `[-]` D3 — Feature breadth

Tree/hierarchical rows, expandable detail rows, CSV/clipboard export, pinned rows, and custom
aggregate reducers beyond `sum`/`avg`/`min`/`max`.

### `[-]` D4 — A search index

Global search is the one number that stayed large — 30 ms at 10k rows. Most of it is the columns'
own `format` functions, because search matches what the user sees. The debounce is what makes it
tolerable.
