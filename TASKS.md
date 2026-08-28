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

### `[ ]` T6 — A tier-0 scale layer, and machinery marked as machinery

The theme is one flat tier: `styles/tokens.css` holds 48 leaf tokens, and the nine feature partitions
hold the rest of the design as literals. Add `src/components/preset/styles/scales.css`, imported
first from `table.css`, carrying the families the literals actually spell out — `--vtc-space-*`,
`--vtc-radius-*`, `--vtc-text-*`, `--vtc-weight-*`, `--vtc-z-*`, `--vtc-elevation-*`,
`--vtc-duration-*`, `--vtc-opacity-*`, `--vtc-size-*`, `--vtc-focus-*` — and rewrite `tokens.css` as
a semantic tier reading from them.

Two things move at the same time because they are the same decision. `tokens.css` loses the `font:`
and `color:` declarations it paints alongside its tokens, so the token block is only tokens. And the
per-cell machinery in `grid.css` — `--vtc-layer-*`, `--vtc-shadow-*` — takes a `--_vtc-` prefix, so a
consumer reading a computed style can tell internals from API. Those are the only two families
defined outside `tokens.css`, and today nothing marks them as private.

Settle the naming inconsistencies while the file is open, in `tokens.css` and `docs/styling.md`
together: `--vtc-shadow-row-hover` against `--vtc-hover-border-width` (one state, two names),
`--vtc-bg-hover` against `--vtc-hover-border-color` (role first in one, second in the other), and
`--vtc-cursor-idle-border-color` (the only token with a state segment mid-name).

**Done when:** `scales.css` exists and is imported first, `tokens.css` holds no dimension literal
that has a scale entry, the machinery carries `--_vtc-`, and `pnpm test`, `pnpm typecheck` and
`pnpm build && pnpm size` are green with the measured CSS figure re-read.

### `[ ]` T7 — Move every partition onto the scales, and fix four theming defects

Replace the literals in `toolbar.css`, `grid.css`, `header.css`, `filters.css`, `groups.css`,
`menus.css`, `pagination.css`, `editing.css` and `controls.css` with the T6 tokens: 11 sites of
`border-radius: 4px`, 21 literal `1px` border widths, 7 identical focus outlines, 12 font-size
literals, ~30 gap and padding literals, 11 z-index numbers across five files, and 4 verbatim copies
of the popover shadow.

Four defects found while inventorying, all of them theming-contract breaks rather than cosmetics:

1. `editing.css` writes `box-shadow:` directly at specificity (0,4,0), which outranks the composed
   slot list on `.vt-th, .vt-td` (0,1,0) and erases the cursor ring, both hover rings and the pin
   shadow on the first cell of every row carrying `data-row-state`. It becomes a
   `--_vtc-shadow-row-state` slot in the composed list, with a spec that a cursor on such a row still
   draws its ring.
2. The idle-cursor rule reassigns the public `--vtc-cursor-border-color` at cell level, so a consumer
   who sets it on `.vt-datatable` silently loses the idle state. Resolve idle against active in a
   private slot instead, and leave both public tokens settable.
3. `--vtc-bg-danger` has no consumer at all; `--vtc-accent-contrast` has no dark-block value; and
   `--vtc-outer-border-width` has no `-color` partner although `docs/styling.md` lists it beside the
   ones that do. Wire the first or delete it, and pair the other two.
4. `CLAUDE.md` and `table.css` both say the pinned-cell z-index ladder depends on `@import` order.
   It does not — all three tiers are separated by specificity. The three genuine same-specificity
   pairs are the column separator against the band edge, `:nth-child` parity against `[data-parity]`
   parity, and `[data-row-state]` against `[data-row-state='error']`, the last of which carries no
   comment saying so. Correct the claim and name these instead, along with the fact that the layer
   order is fixed by the declaration lists in `grid.css` rather than by partition order.

**Done when:** no colour, radius, font-size, font-weight, z-index, duration or elevation literal
remains in the nine partitions where a scale token covers it, the four defects are fixed with the new
spec green, `tests/invalidation.spec.ts` still passes, and `pnpm build && pnpm size` is green.

### `[ ]` T8 — `data-theme`, so an app can pick a theme instead of asking the OS

Dark mode is `prefers-color-scheme` only. Split the palettes in `tokens.css` into three blocks: light
on `.vt-datatable, .vt-portal`; dark under the media query, guarded with `:not([data-theme='light'])`;
dark again under `[data-theme='dark']`, so an explicit choice wins in both directions. The assignment
list is duplicated on purpose — CSS has no way to share it, and ten lines gzip to nothing.

An ancestor `[data-theme]` has to work as well as the attribute on the table itself: an app that
stamps `<html data-theme="dark">` covers the teleported `.vt-portal` for free, since the portal is a
body descendant rather than a table one. A `theme` prop on `DataTable` writes the attribute on the
root, and reaches `ColumnFilterPopover` and `ColumnDragGhost` through the **optional**
`useTableContext()` — `requireTableContext()` would make a fourth primitive depend on a root, which
`CLAUDE.md` treats as a decision of its own.

**Done when:** a spec covers attribute against media query in both directions plus the ancestor case,
the demo can force a theme against the OS setting, and `docs/styling.md` no longer says dark mode is
only the media query.

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
