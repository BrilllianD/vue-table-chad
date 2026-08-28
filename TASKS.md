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

### `[ ]` T9 — A typed theme API

Themes are authored as raw CSS strings today, which is why `demo/src/views/ThemingView.vue` carries
the variable list in four places that have to be kept in sync by hand. Add `src/core/theme.ts` —
`core/`, because it imports nothing from `components/` — exporting a `Theme` interface over the
semantic tier and a `defineTheme(theme)` that maps it to `--vtc-*` for a `:style` binding.

`defineTheme` is a value export, so `tests/apiSurface.spec.ts` requires a demo view to use it: the
Theming view's palette model and its seven presets become `Theme` objects, which collapses three of
that file's four copies of the list into one and lets the copy-pasteable snippet be generated from
the same object rather than typed out.

**Done when:** both are exported with declaration doc comments, `pnpm docs:api` output is committed,
the Theming view drives its live preview through `defineTheme`, `docs/styling.md` has a section on
it, and `tests/apiReference.spec.ts` and `tests/apiSurface.spec.ts` are green.

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
