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

changesets → CHANGELOG → publish. Every release so far — seven of them, 0.2.1 through 0.5.1 — was
cut by hand: a hand-edited `version` field, `make release-check`, then `npm publish` from the
terminal. `RELEASING.md` documents the steps, `make release-check` runs the package checks, and
`prepublishOnly` already runs the tests and the build. What is left is the automated half: a
changeset config, a CHANGELOG, and a scripted publish step in place of the hand-run one.

**Done when:** a changeset config is committed, the first CHANGELOG entry exists, and cutting a
version is `make release-check` plus a changesets command rather than hand-edited version fields.

---

## To Work

Agreed and next up, in the order they are meant to land.

### `[ ]` F11 — Accessibility beyond the grid

Phase 2 landed only the `aria-rowcount` / `aria-rowindex` floor that virtualization required —
`aria-rowcount` on `TableGrid`, `aria-rowindex` on the three row primitives, and `role="grid"` only
while a cursor is on (`TableGrid.vue:640`). Add `aria-colindex` on every cell, `aria-selected` on
selected rows, and announce the cursor cell ("Salary, row 12 of 200") and a sort change through a
polite live region. One already exists — `DataTable.vue:1283`, `role="status" aria-live="polite"`,
announcing the loading text and nothing else — so the announcements extend it rather than add a
second. The announcement text goes through the label record (`src/core/labels.ts`), as new keys on
it rather than as literals. One spec runs `axe` (`vitest-axe`, not yet a dependency) over
`OverviewView`'s table.

**Done when:** the axe spec is green with no rule disabled, the announcements read correctly in the
demo under a screen reader, and `docs/keyboard.md` has an accessibility section.

---

## Backlog

Proposed and not yet scheduled, in dependency order. Each stays out of the pipeline unless its
entry says otherwise — that is the property that made it cheap enough to propose.

### `[ ]` F1 — Cell range selection

`Shift`+`↑`/`↓`/`←`/`→` extends a range from an anchor, `Shift`+click sets the far corner, and a
plain move collapses it back to the cursor. `useCellCursor` gains a range anchor and a `range`
computed in row-index / column-index space, clamped the way `nextPosition` clamps; `cellCursor.ts`
gains `rangeMoveFor` beside `cursorMoveFor`. The anchor needs a name other than `anchor`:
`useCellCursor` already has an `anchorAt` / `cancelAnchor` pair (`useCellCursor.ts:115`, `:321`),
which is a pending start position waiting for rows to exist, not a selection corner. `TableCell`
emits `data-in-range` and the preset styles it. A page turn and a grouping change collapse the
range, the same rule the cursor's carry-over follows. `docs/keyboard.md:183` calls `Shift`+`↑`/`↓`
unclaimed, but that is true only of the viewport scroll: `cursorMoveFor` still moves the cursor one
row on them (`cellCursor.ts:118-123`), so this changes a behaviour rather than taking a free key.
It is the prerequisite block paste has been waiting on.

**Done when:** the five gestures produce a range, `invalidation.spec.ts` asserts zero dataset
passes across all of them, and `docs/keyboard.md` documents the keys.

### `[ ]` F2 — Block copy and paste (TSV)

Depends on F1. Copy writes the range's displayed text tab- and newline-separated; a paste of a
k×m grid lands at the cursor as one draft per row through `useRowEditing`. Add `commitMany(ids)`
so `apply` runs once at the end — today `apply` defaults to `source.refresh()`
(`useRowEditing.ts:210`) and `commit()` calls it on every successful save (`:386-388`), and the
invariant says a successful save redoes the pipeline exactly once, so k saves must not mean k
passes. Cells past the last column or on an uneditable column are skipped and reported. There is no
refusal to remove: `onPaste` (`DataTable.vue:1184-1215`) pastes the whole payload verbatim into one
cell, minus one trailing newline, and `tests/dataTableClipboard.spec.ts:161-170` pins that. The
verbatim paste and its spec are what this replaces.

**Done when:** `dataTableClipboard.spec.ts` covers a 2×2 copy-and-paste round trip, a k-row paste
redoes the pipeline once, and the verbatim single-cell paste is gone.

### `[ ]` F3 — Custom aggregate reducers, plus `count` and `countDistinct`

`ColumnDef.aggregate` accepts `AggregateFn | AggregateReducer<TRow>` where a reducer is
`{ init(): S; step(state: S, value, row): S; result(state: S): unknown }`. The incremental shape was
chosen so a whole-array `(rows) => value` callback would not force per-group row arrays and a second
pass — but `aggregateGroups` (`src/core/aggregation.ts:156-189`) already does exactly that: it
buckets every row into a `Map<string, TRow[]>` per group prefix, then runs `aggregateRow` over each
bucket. So today a whole-array callback would cost nothing extra, and the reducer shape only earns
its place if `aggregateGroups` is rewritten to one pass in the same change. Decide which first; the
README's reasoning (`README.md:163-166`, repeated at `docs/getting-started.md:512`) restates the
stale premise and goes with it. `aggregateFormat` already handles the display, so nothing changes
in the group row.

**Done when:** `GroupingView` shows one custom reducer, the `pipeline.bench.ts` aggregate numbers
stay inside the baseline spread, and the custom-reducer line is gone from both the README and
`docs/getting-started.md`.

### `[ ]` F7 — Cursor-to-selection keys

`Space` toggles the cursor row, `Shift`+`Space` selects anchor-to-cursor, `Ctrl`/`Cmd`+`A` selects
all matching. Each is an existing `useRowSelection` call — `toggle`, `toggleRange`,
`selectAllMatching` — decoded in `cellCursor.ts` the way the other gestures are. `Space` is not
free: `editSeedFor` (`cellCursor.ts:482-488`) seeds the editor with any single character, a space
included, and `TableGrid.vue:340-347` claims it, so this carves `Space` out the way `=` and `+`
were. `toggleRange` keeps its own `anchorId` (`useRowSelection.ts:271`), separate from the cursor;
`Shift`+`Space` has to say which anchor wins. `CursorView` has no `selectable` control yet.

**Done when:** `CursorView` gains a `selectable` control and the three keys work with it on,
`invalidation.spec.ts` asserts zero dataset passes, and `docs/keyboard.md` lists them.

### `[ ]` F9 — Pinned rows

`pinnedRows: { top?: TRow[]; bottom?: TRow[] }` on `useTable` and `DataTable`, rendered in sticky
`<tbody>` sections outside the pipeline. Excluded from select-all and aggregates by default.
Refused with `devWarn` under `virtual`, where the window would have to reserve for them.

**Done when:** a demo view pins a row top and bottom over a local source, and
`invalidation.spec.ts` asserts zero dataset passes for pinning and unpinning.

### `[ ]` F10 — Query persistence and URL serialisation

`serializeQuery` / `parseQuery` in core — what `StateView.vue` does by hand today with the
location hash — and a persisted `useTableState` symmetric with `columnStorage.ts`: same
`StorageLike`, sanitised on read, a saved query outranking the options' initial values. The option
cannot be called `storageKey`: `useTable`, `TableRoot` and `DataTable` already use that name for the
column layout (`useTable.ts:65`), so the query one needs its own — `queryStorageKey`, or a nested
`persist`. The demo is not the only hand-rolled caller either:
`playground/src/examples/UrlSyncedState.vue:20-28` does the same with a `#q=` prefix.

**Done when:** `StateView` and the playground's `UrlSyncedState` both use the helpers, a round-trip
spec covers every `QueryState` field, and a stub-storage spec restores filters and sort on setup.

### `[ ]` F12 — Tree rows

Parent/child hierarchies with a match-preserving filter (a parent stays when a descendant
matches). The largest item here, and value-based grouping covers most uses today, so it needs a
design note before code: flattening with an expand set the way `flattenTree` reads collapse state
— today a predicate over a `string[]` plus the `collapsedByDefault` invert flag
(`useRowGrouping.ts:109-111`, `grouping.ts:271`) — sorting within siblings, and what `total` means.

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

A pick fires `update:value` and then `pick` (`AsyncSelect.vue:254-255`; `StaticSelect.vue:126-128`
passes both through), and `CellEditor.vue` listens for `update:value` and `blur` only (`:339-341`,
`:364-366`) — `pick` is dropped on the floor, which is exactly the hook to wire. So the editor stays
open until Enter or blur; a `checkbox` (`@change` → `update:value`, `:380`) is the same. In a
spreadsheet the pick *is* the decision. Cell mode only — row mode must not save per field, which
is the rule `onCellBlur` (`src/components/preset/DataTableBody.vue:504`, `if (props.rowMode)
return`) already encodes.

**Done when:** a pick in cell mode saves the row once, row mode is unchanged, and
`invalidation.spec.ts` sees exactly one pipeline pass per pick.

### `[ ]` F25 — A richer option shape

`options` is `FilterValue[]` and in the editor the label comes from `column.groupLabel` — the
*grouping* label function borrowed for a second job (`optionLabelFor`, `src/core/editing.ts:83-84`).
The filter checklist does not borrow it: `ValueListFilter.vue:59-63` uses `format` or
`String(value)`, so today the two surfaces can label one option two ways. The shape to accept
already exists — `AsyncOption` `{ value, label, disabled? }` (`src/core/types.ts:549-554`), what
`asyncOptions` returns — so static `options` should take that type plus `group?` rather than grow a
second one. It reaches `computeFacets`' declared-order sort (`src/core/filters/facets.ts:124-132`),
since `options` is what orders the filter checklist; that is the part to scope carefully.

**Done when:** both shapes are accepted, the filter checklist still orders by declared order, and a
grouped option list renders.

### `[ ]` F26 — Multi-select enum

The value becomes an array, which reaches `parse`, `validate`, `format` and the filters.
Backlog-sized, and wants a design note first the way F12 does.

**Done when:** the design note is in `docs/` and agreed. The implementation gets its own ID.

### `[ ]` F28 — A configurable locale

Every locale-sensitive call passes `undefined` today, so the table follows the browser's locale and
not the app's. That is a problem for a Russian-language app opened in an `en-US` browser.
There, `,` is the group separator, so `isDecimal` in `src/core/numberMask.ts` drops it and typing
`5,5` into a number cell yields `55`. The app cannot override this. The calls:

- `collator` (`src/core/sorting.ts:5`) orders text and enum columns, and through `compareText`
  (`:8-9`) the filter checklist of any column without `options` too (`filters/facets.ts:134-135`);
- `numberFormat` (`src/core/aggregation.ts:16`) renders an aggregate that has no `aggregateFormat`;
- `numberSeparators()` (`src/core/numberMask.ts:52`) is the default for `toMachineNumber`,
  `toDisplayNumber`, `significantBefore` and `caretForSignificant` (`:91`, `:137`, `:161`, `:187`),
  all four of which `CellEditor.vue` calls with no separators argument.

Add `locale?: string` to `useTable` and `DataTable` and let the locale bundle carry it too, so
`app.use(createTableLabels(ru))` sets it app-wide by the same provide/inject path the labels take
(`TableLabels` has no `locale` field yet; `mergeLabels` is a shallow spread, so one passes through).
An explicit option still outranks the bundle.
Core functions take the locale as a parameter with `undefined` as the default, so current callers
keep their behaviour. The `Intl` objects stay cached per locale, the way `numberSeparators` caches
them already. Changing the locale re-sorts once and does not rebuild anything else.

**Done when:** with `locale: 'ru-RU'` under an `en-US` runtime, a number cell reads `5,5` as `5.5`
and shows `1 234,5`, aggregates group with a space, and text sorts by `ru` collation. A spec
covers each of the three, `invalidation.spec.ts` asserts one pipeline pass on a locale change, and
the README documents the option.

---

## Deferred

Decisions rather than oversights. Promote one into **Active** when it becomes real work.

### `[-]` D4 — A search index

Global search is the one number that stayed large — 30 ms at 10k rows. Most of it is the columns'
own `format` functions, because search matches what the user sees. The debounce is what makes it
tolerable.
