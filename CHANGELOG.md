# @brillliand/vue-table-chad

Releases up to 0.6.0 are described in their `Release version` commits
(`git log --grep '^Release version'`).

## Unreleased

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
