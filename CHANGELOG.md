# @brillliand/vue-table-chad

Releases up to 0.6.0 are described in their `Release version` commits
(`git log --grep '^Release version'`).

## Unreleased

- **Breaking:** `TableLabels` gains a required `selectRow` key, the accessible name of a row's
  selection checkbox, which was the English literal "Select row" in every locale; all five shipped
  bundles translate it. A record declared as a whole `TableLabels` must add it; a
  `Partial<TableLabels>` passed to `labels` or `createTableLabels` is unaffected. (#33)
- Fix: `useRowEditing` and `useTable` built in a component's setup merge their `labels` over the
  `createTableLabels` record instead of English, so editing messages (`required`, the parse
  messages, `saveFailed`) and a hand-built table follow the app's locale; `provideTableContext` now
  also publishes a `useTable` result's labels, so primitives beneath a hand-built table render its
  wording. A `provideTableLabels` call made before `provideTableContext` in the same component is
  now replaced by the table's labels. (#33)
- Changed: the doc comments of `OPERATOR_LABELS`, `BLANK_GROUP_LABEL`, `REQUIRED_MESSAGE` and
  `SAVE_FAILED_MESSAGE` now say they are the English values and do not follow `labels` or a locale;
  read the table's labels instead. (#33)
- Fix: the caption of the blank group now follows a labels switch (a `labels` prop or a
  `createTableLabels` ref) instead of keeping the language the table was set up with;
  `useRowGrouping`'s `blankLabel` also takes a ref or getter. (#33)
- Added: a Turkish bundle, `tr`, on the `@brillliand/vue-table-chad/locales` entry, with
  `locale: 'tr-TR'`, so numbers read `1.234,5` and text sorts the Turkish way under it. (#73)
- Added: a `locale` option on `useTable`, `TableRoot`, `DataTable` and `useLocalDataSource`, and a
  `locale` field the `ru`, `es`, `ja` and `zhCN` bundles set. It drives number reading and grouping
  in the cell editor, aggregate numbers without `aggregateFormat`, text and enum sort order and
  the value checklist order, instead of the browser's locale: under `createTableLabels(ru)` in an
  `en-US` browser, `5,5` now reads as `5.5`. The other side: number entry follows the bundle's
  separators, so an app on the `es` bundle (`es-ES` groups with `.`, decimal `,`) reads a typed
  `5.5` as `55` where 0.6.1, in an `en-US` browser, read `5.5`; an app that wants the old reading
  passes its own `locale`. `compareText`, `comparatorFor`, `computeFacets` and
  `formatAggregate` take an optional trailing locale, and `SortOptions` gains `locale`. (#16)
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
- Fix: `rowDblclick` no longer fires for a double click on a control inside the row (a button,
  input, link, label, an open editor, the selection cell) or, while `editing`, on a cell that opens
  an editor (a plain double click only), so the detail-rows recipe no longer toggles a panel from
  them; a handler that relied on those double clicks stops receiving them. A double click on an editable select cell leaves its
  list open: `AsyncSelect` and `StaticSelect` no longer close on the second click of a double
  click. (#71)
- Fix: the docs and the `DataTable` doc comment no longer call the `style.css` import redundant.
  The published JS does not load the stylesheet, so
  `import '@brillliand/vue-table-chad/style.css'` is required wherever `DataTable` is used. (#72)

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
