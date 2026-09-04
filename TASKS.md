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

Two further sections hold work that is agreed but not yet begun. **To Work** is what comes next;
**Backlog** is what has been proposed and not yet scheduled. Both carry an ID and a **Done when**,
and an entry moves into **Active** by flipping it to `[~]` when the work starts. Their IDs are
`F`-prefixed so they cannot collide with the `T` numbers the commit history already uses.

---

## Active

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

`pnpm lint` is red on 20 errors. The headline pair is at
`src/components/primitives/TableRoot.vue:154`: destructuring `useTable()` binds `state` and
`columns`, which the component also declares as props. In `<script setup>` props are read through
`props.`, so nothing collides — the rule predates the syntax. This is a decision to make and write
down, not a bug to fix: rename the bindings, or disable the rule for this file with a one-line why.
The rest need the same treatment: `vue/multi-word-component-names` fires on every single-word docs
example file (`docs/.vitepress/examples/*.vue` are named after the docs page they belong to, which
is the point), `docs/examples/AddressesTable.vue` registers components the excerpt no longer uses,
`src/core/useVirtualRows.ts:171` reads a computed as a bare expression the way the tests do —
the tests have a scoped rule-off for it, this file does not — and
`src/components/primitives/AsyncSelect.vue:131` writes a ref reached through the `source` prop,
which `vue/no-mutating-props` reads as mutating the prop.

**Done when:** `pnpm lint` is green, the choice is recorded in `CLAUDE.md`'s settled decisions, and CI
promotes lint from non-gating to gating — gating on a known-red check only teaches everyone to
ignore the pipeline.

---

## To Work

Agreed and next up, in the order they are meant to land.

### `[ ]` F4 — Export the result set (CSV / TSV)

A pure `src/core/export.ts`: `toDelimited(rows, columns, { delimiter, header, formatted,
columnIds })` reads cells through `readValue` and each column's `format`, so the file matches what
the user sees, with RFC 4180 quoting. `exportRows(source, columns, opts)` reads `filteredRows` on a
local source (`useLocalDataSource.ts` already exposes the sorted, filtered, unpaged set) and takes
a `fetchAll` callback for a remote one, since only the consumer knows how to ask a server for
everything. The Blob download lives in the preset only — it touches the DOM, which `core/` may not.
`DataTable` gains `showExport` and an `export` emit.

**Done when:** `HeadlessView` calls `toDelimited`, `OverviewView` shows the button, a spec covers
quoting and `formatted: false`, and the README's CSV line is gone.

### `[ ]` F6 — Expandable detail rows

Core `useRowExpansion({ getRowId, initial })` returning `expanded`, `isExpanded`, `toggle`,
`expandAll` and `collapseAll` — the same shape as `useRowGrouping`'s collapse API, and like it
never entering the pipeline: it reads the pipeline's output and writes none of its inputs.
`DataTable` gains `expandable` and a `#detail="{ row }"` slot rendered as a second `<tr>` spanning
every column; `TableRow` gets `expanded` and emits `data-expanded`; `Alt`+`↓`/`↑` on the cursor row
toggles. Under `virtual` a detail row changes the row's height, so it requires `measureRows` and
`devWarn`s otherwise.

**Done when:** a demo view toggles details over a local source, `invalidation.spec.ts` asserts zero
dataset passes across expand and collapse, virtual + `measureRows` scrolls without gaps, and the
README's detail-rows line is gone.

### `[ ]` F8 — Context menu primitive

`TableContextMenu`, built on `useMenuDismiss` and `usePopoverPosition` (both already in
`primitives/`), opened from a cell or header cell on `contextmenu` or `Shift`+`F10`. Five actions:
"Filter by this value", "Sort ascending / descending", "Group by this column", "Hide column",
"Copy". Every one is an existing `TableState` or `useColumns` mutator — the primitive composes them
and owns no logic. `DataTable` gains `contextMenu` and a `#contextMenu` slot for a consumer's own
items.

**Done when:** the five actions work in `OverviewView`, the primitive renders standalone with
explicit props, and a spec covers dismissal and the keyboard open.

### `[ ]` F11 — Accessibility beyond the grid

Phase 2 landed only the `aria-rowcount` / `aria-rowindex` floor that virtualization required. Add
`aria-colindex` on every cell, `aria-selected` on selected rows, and a polite live region that
announces the cursor cell ("Salary, row 12 of 200") and a sort change. The announcement text goes
through the label record (`src/core/labels.ts`), as new keys on it rather than as literals. One
spec runs `axe` (`vitest-axe`) over `OverviewView`'s table.

**Done when:** the axe spec is green with no rule disabled, the announcements read correctly in the
demo under a screen reader, and `docs/keyboard.md` has an accessibility section.

---

## Backlog

Proposed and not yet scheduled, in dependency order. Each stays out of the pipeline unless its
entry says otherwise — that is the property that made it cheap enough to propose.

### `[ ]` F1 — Cell range selection

`Shift`+`↑`/`↓`/`←`/`→` extends a range from an anchor, `Shift`+click sets the far corner, and a
plain move collapses it back to the cursor. `useCellCursor` gains `anchor` and a `range` computed
in row-index / column-index space, clamped the way `nextPosition` clamps; `cellCursor.ts` gains
`rangeMoveFor` beside `cursorMoveFor`. `TableCell` emits `data-in-range` and the preset styles it.
A page turn and a grouping change collapse the range, the same rule the cursor's carry-over
follows. This claims the keys `docs/keyboard.md` has deliberately left unclaimed, and is the
prerequisite block paste has been waiting on.

**Done when:** the five gestures produce a range, `invalidation.spec.ts` asserts zero dataset
passes across all of them, and `docs/keyboard.md` documents the keys.

### `[ ]` F2 — Block copy and paste (TSV)

Depends on F1. Copy writes the range's displayed text tab- and newline-separated; a paste of a
k×m grid lands at the cursor as one draft per row through `useRowEditing`. Add `commitMany(ids)`
so `apply` runs once at the end — today every successful save calls `source.refresh()`, and the
invariant says a successful save redoes the pipeline exactly once, so k saves must not mean k
passes. Cells past the last column or on an uneditable column are skipped and reported. Removes the
single-cell refusal in `DataTable.vue`'s paste handler.

**Done when:** `dataTableClipboard.spec.ts` covers a 2×2 copy-and-paste round trip, a k-row paste
redoes the pipeline once, and the refusal is gone.

### `[ ]` F3 — Custom aggregate reducers, plus `count` and `countDistinct`

`ColumnDef.aggregate` accepts `AggregateFn | AggregateReducer<TRow>` where a reducer is
`{ init(): S; step(state: S, value, row): S; result(state: S): unknown }`. That shape slots into
`aggregateGroups`' single pass over the dataset; a whole-array `(rows) => value` callback is
refused because it would need per-group row arrays materialized and a second pass. `aggregateFormat`
already handles the display, so nothing changes in the group row.

**Done when:** `GroupingView` shows one custom reducer, the `pipeline.bench.ts` aggregate numbers
stay inside the baseline spread, and the README's custom-reducer line is gone.

### `[ ]` F7 — Cursor-to-selection keys

`Space` toggles the cursor row, `Shift`+`Space` selects anchor-to-cursor, `Ctrl`/`Cmd`+`A` selects
all matching. Each is an existing `useRowSelection` call — `toggle`, `toggleRange`,
`selectAllMatching` — decoded in `cellCursor.ts` the way the other gestures are.

**Done when:** the three keys work in `CursorView` with `selectable` on, `invalidation.spec.ts`
asserts zero dataset passes, and `docs/keyboard.md` lists them.

### `[ ]` F9 — Pinned rows

`pinnedRows: { top?: TRow[]; bottom?: TRow[] }` on `useTable` and `DataTable`, rendered in sticky
`<tbody>` sections outside the pipeline. Excluded from select-all and aggregates by default.
Refused with `devWarn` under `virtual`, where the window would have to reserve for them.

**Done when:** a demo view pins a row top and bottom over a local source, and
`invalidation.spec.ts` asserts zero dataset passes for pinning and unpinning.

### `[ ]` F10 — Query persistence and URL serialisation

`serializeQuery` / `parseQuery` in core — what `StateView.vue` does by hand today with the
location hash — and `useTableState({ storageKey })` symmetric with `columnStorage.ts`: same
`StorageLike`, sanitised on read, a saved query outranking the options' initial values.

**Done when:** `StateView` uses the helpers, a round-trip spec covers every `QueryState` field, and
a stub-storage spec restores filters and sort on setup.

### `[ ]` F12 — Tree rows

Parent/child hierarchies with a match-preserving filter (a parent stays when a descendant
matches). The largest item here, and value-based grouping covers most uses today, so it needs a
design note before code: flattening with an expand set the way `flattenTree` reads collapse state,
sorting within siblings, and what `total` means.

**Done when:** the design note is in `docs/` and agreed. The implementation gets its own ID.

### `[ ]` F13 — Undo and redo of saves

A change log of `RowChange` in `useRowEditing`; `Ctrl`/`Cmd`+`Z` reverts the last successful patch
through another `save`, so the server stays the record. Needs F2's `commitMany` to undo a block
paste as one step.

**Done when:** undo of a single-cell save and of a block paste each round-trip through `save`.

### `[ ]` F14 — Fill down

`Ctrl`/`Cmd`+`D` copies the range's first row down the range, and a fill handle does the same by
pointer. Same machinery as F1 and F2.

**Done when:** fill-down over a 1×n range writes n−1 drafts and commits once.

### `[ ]` F15 — Column virtualization

Bench first. `WideColumnsView` at 34 columns shows no need; a 300-column fixture in
`bench/reactive.bench.ts` measuring resize, hover and scroll decides whether windowing columns is
worth a second axis of complexity. Promote only if the number says so.

**Done when:** the fixture and its numbers are in `bench/BASELINE.md` with a go / no-go line.

### `[ ]` F16 — Ship locale presets

F5 made every string overridable and shipped exactly one record, `DEFAULT_LABELS` (English). A
consumer wanting French writes the whole `Partial<TableLabels>` themselves, and the two in the tree
today — `FRENCH` / `GERMAN` in `demo/src/views/LabelsView.vue`, `french` in
`docs/.vitepress/examples/labels.vue` — are deliberately partial demonstrations of the fallback, not
translations anyone should import.

Add `src/locales/`, one module per language exporting a **complete** `TableLabels` rather than a
`Partial`: `import { fr } from '@brillliand/vue-table-chad/locales'`, passed straight to the
`labels` prop. Complete is the whole point — a preset that silently renders half English is worse
than no preset, because the caller has no way to see which half is missing. So the type is
`TableLabels`, not `Partial<TableLabels>`, and `noUncheckedIndexedAccess` plus the compiler make a
missing key a build error rather than a runtime surprise for the nested `operators` and `parse`
maps too.

Which languages is the open question, and it is a maintenance commitment rather than a code one:
every key added to `TableLabels` afterwards breaks every locale's build until it is translated,
which is the ratchet working but is also work per key per language. Start with the smallest set
that proves the shape — French and German — and treat further languages as contributions.

Packaging: a second entry point, so a consumer importing no locale ships no locale. `package.json`
`exports` gains `./locales`, `vite.config.ts` a second lib entry, and `pnpm size` a budget line per
chunk. `RELEASING.md`'s checklist covers the new entry point. This is why it is not just another
file under `src/core/` — the whole point of the tarball's size discipline is that unused features
are not in the bundle.

**Done when:** `src/locales/fr.ts` and `de.ts` export full `TableLabels`; a spec asserts each has
every key of `DEFAULT_LABELS`, including the nested maps, and names any it lacks; the `./locales`
entry point resolves from the packed tarball (`make pack-check`); `pnpm size` budgets the new
chunk; the demo's **Labels** view imports `fr` rather than declaring its own object, and its
partial `GERMAN` stays as the fallback demonstration with a comment saying which is which; and
`docs/labels.md` documents the import beside the hand-written `Partial` it already teaches.

---

## Deferred

Decisions rather than oversights. Promote one into **Active** when it becomes real work.

### `[-]` D4 — A search index

Global search is the one number that stayed large — 30 ms at 10k rows. Most of it is the columns'
own `format` functions, because search matches what the user sees. The debounce is what makes it
tolerable.
