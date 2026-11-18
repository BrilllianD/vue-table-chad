# @brillliand/vue-table-chad

Releases up to 0.6.0 are described in their `Release version` commits
(`git log --grep '^Release version'`).

## Unreleased

- Fix: table popovers, the context menu, the select editor's list and the drag ghost now sit on the
  overlay layer (`--vtc-z-popover` 9999, `--vtc-z-ghost` 10000) instead of 20 and 60, so they open
  above a dialog window or modal. The columns and group-by menus are teleported to `<body>` like
  the filter panel, so a window frame no longer clips them. Consumer CSS scoped under
  `.vt-datatable` (a descendant selector, or a token set only on `.vt-datatable`) no longer reaches
  those two panels; style them through `.vt-portal` or `.vt-datatable, .vt-portal`. A
  `data-vtc-theme` palette set on a wrapper element other than `<html>` no longer reaches them
  either; set it on `<html>`. (#37)
- Fix: the columns menu, the group-by menu and the filter popover now stop the Escape that closes
  them (preventDefault and stopPropagation), as the right-click menu now also does, so a table
  inside a modal or dialog window no longer closes the window on the same key. An Escape that closes
  nothing, or ends an IME composition, still reaches the page. (#37)
- Added: the cell editor slot (`CellEditor` default slot and `#editor:<id>`) is handed `blur()`, the
  same report a built-in control makes when focus leaves it; in cell mode it commits the row, in row
  mode it does nothing. A slotted control with a teleported panel (a `StaticSelect`, a widgets
  select) can now commit on leave; `docs/editing.md` shows the recipe, including Escape. (#70)

## 0.6.1

- Fix: the cell editor opens on the value the cell holds, and the number mask lets a Delete or
  Backspace through on exponent numbers (#20, #23).
- Fix: the save lifecycle. A successful save no longer aborts its own signal or swallows an
  `onSaved` throw (`commit` now rejects), cancelling an optimistic save rolls the edit back, typing
  is refused while a row is saving, the patch carries only the fields that changed, parse errors
  are kept, and `applyCellValue` keeps a class row's prototype (#23).
- Fix: selecting all matching rows honours `isSelectable`, and a range selection walks display
  order. In all-matching mode over a local source `count` is now `selectedRows.length`, the
  selectable matching rows; it used to be `total - excluded.length`, which also counted rows that
  `isSelectable` refuses (#21).
- Added: optional `rangeRows` in `UseRowSelectionOptions`, the rows a shift-range walks (#21).
- Fix: the values filter's Apply keeps values the checklist could not show (hidden by other
  filters or the search), applies only the checked matches under a search, is disabled while
  loading or when nothing among the matches is checked, no longer shows "no matching values" next
  to the blanks row, and ignores stale facet responses (#22).
- Fix: the published declarations compile for a consumer with `skipLibCheck: false`; the
  rolled-up `dist/vue-table-chad.d.ts` no longer contains a bare `GlobalComponents` (#65).
