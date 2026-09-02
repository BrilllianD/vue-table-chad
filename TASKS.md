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

### `[ ]` T8 — Show a pointer cursor on a header cell that acts

`cursor: pointer` sits on the controls themselves (`.vt-sort`, `.vt-filter-trigger`,
`.vt-th-group-toggle`) and nowhere else, so the cell around them reads as inert. `TableHeaderCell`
emits `data-sortable` / `data-filterable` beside the existing state pair, and `header.css` gives
those and `.vt-th-group[data-collapsible]` a pointer — after `[data-reorderable]`, so pointer beats
`grab` on the columns that are both.

**Done when:** a sortable, filterable or collapsible header cell shows the pointer across its whole
box, and a column with both capabilities off still shows `grab` while reorderable and `grabbing`
while dragged.

### `[ ]` T2 — P3-8: release flow

changesets → CHANGELOG → publish. Releases 0.2.1 and 0.3.0 were cut by hand — `RELEASING.md`
documents the steps and `make release-check` runs the package checks — so what is left is the
automated half: a changeset config, a CHANGELOG, and an actual `npm publish` instead of a tarball.

**Done when:** a changeset config is committed, the first CHANGELOG entry exists, and cutting a
version is `make release-check` plus a changesets command rather than hand-edited version fields.

### `[ ]` T3 — P3-9: publish the docs site

`pnpm build:docs` already produces one self-contained page. Bitbucket has no Pages equivalent, so
this needs a static host pointed at `demo/dist` — Netlify or Cloudflare Pages, either of which can
build from the Bitbucket remote.

**Done when:** a URL serves the built docs, the build runs from the remote rather than from a local
upload, and the README links to it. Drop the inlining step if a real host serving the assets makes
it stop earning its keep.

### `[?]` T4 — Decide the `vue/no-dupe-keys` lint failure

`pnpm lint` is red on 19 errors. The headline pair is at
`src/components/primitives/TableRoot.vue:154`: destructuring `useTable()` binds `state` and
`columns`, which the component also declares as props. In `<script setup>` props are read through
`props.`, so nothing collides — the rule predates the syntax. This is a decision to make and write
down, not a bug to fix: rename the bindings, or disable the rule for this file with a one-line why.
The rest need the same treatment: `vue/multi-word-component-names` fires on every single-word docs
example file (`docs/.vitepress/examples/*.vue` are named after the docs page they belong to, which
is the point), `docs/examples/AddressesTable.vue` registers components the excerpt no longer uses,
and `src/core/useVirtualRows.ts:171` reads a computed as a bare expression the way the tests do —
the tests have a scoped rule-off for it, this file does not.

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

Tree/hierarchical rows, expandable detail rows, CSV export, pinned rows, and custom aggregate
reducers beyond `sum`/`avg`/`min`/`max`. (Cell-level clipboard copy/paste shipped with the cursor —
what is left here is exporting a block or the whole result set.)

Block paste belongs here too, and is blocked rather than merely deferred: pasting a spreadsheet
region needs a **cell range** to paste into, and the cursor is one cell. `Shift`+`↑`/`↓` is left
unclaimed for that range, so the order is range selection first, block paste second.

### `[-]` D4 — A search index

Global search is the one number that stayed large — 30 ms at 10k rows. Most of it is the columns'
own `format` functions, because search matches what the user sees. The debounce is what makes it
tolerable.
