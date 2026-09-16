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

---

## To Work

Agreed and next up, in the order they are meant to land.

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

### `[ ]` F24 — Commit a select on pick

A pick fires `change` and `update:value` and nothing else, so the editor stays open until Enter or
blur; a `checkbox` is the same. In a spreadsheet the pick *is* the decision. Cell mode only — row
mode must not save per field, which is the rule `onCellBlur`
(`src/components/preset/DataTableBody.vue:466`) already encodes.

**Done when:** a pick in cell mode saves the row once, row mode is unchanged, and
`invalidation.spec.ts` sees exactly one pipeline pass per pick.

### `[ ]` F25 — A richer option shape

`options` is `FilterValue[]` and the label comes from `column.groupLabel` — the *grouping* label
function borrowed for a second job. An `{ value, label?, disabled?, group? }` form would end the
borrowing and give an option group. It reaches `computeFacets`' declared-order sort
(`src/core/filters/facets.ts:123`), since `options` is what orders the filter checklist; that is the
part to scope carefully.

**Done when:** both shapes are accepted, the filter checklist still orders by declared order, and a
grouped option list renders.

### `[ ]` F26 — Multi-select enum

The value becomes an array, which reaches `parse`, `validate`, `format` and the filters.
Backlog-sized, and wants a design note first the way F12 does.

**Done when:** the design note is in `docs/` and agreed. The implementation gets its own ID.
---

## Deferred

Decisions rather than oversights. Promote one into **Active** when it becomes real work.

### `[-]` D4 — A search index

Global search is the one number that stayed large — 30 ms at 10k rows. Most of it is the columns'
own `format` functions, because search matches what the user sees. The debounce is what makes it
tolerable.
