# Demo

Every feature the library has, one view at a time.

```bash
pnpm demo          # http://localhost:5174
pnpm build:demo    # -> demo/dist
pnpm build:docs    # -> demo/dist/standalone.html, the whole site in one file
```

`build:docs` inlines the bundle into a single self-contained page. It predates the Bitbucket remote
having a real host for it: one file could be published anywhere in the meantime. T3 in `TASKS.md`
gives the demo a proper host alongside the VitePress docs site, and removes this step once it does.

The playground (`pnpm dev`, port 5173) is four small examples. This is the exhaustive one, and
the two run side by side.

## Layout

```
demo/
  index.html
  src/
    main.ts            imports the preset stylesheet explicitly — several views
                       use only primitives, which ship no CSS of their own
    App.vue            tab shell, ordered preset -> primitives -> core
    styles.css         demo chrome only; nothing here styles the table
    examples.ts        tab -> the docs example whose source it shows
    columns.ts         ONE column set using every ColumnDef field
    data/
      dataset.ts       10k rows from a fixed seed, shaped to exercise the API
      fakeApi.ts       in-memory "server" + a request log
    components/
      DemoSection.vue      title, blurb, API-coverage chips
      StateInspector.vue   any value as JSON
      TableStatus.vue      a primitive the library does NOT ship, written here
      MiniRoot.vue         TableRoot rebuilt from scratch in ~40 lines
      CodeExample.vue      the collapsed source panel under each view
    views/             one per feature area
```

## The views

| View | Layer | What it is for |
| --- | --- | --- |
| Recipes | preset | What to type — the six worked examples `docs/recipes.md` runs |
| Everything at once | preset | Every `DataTable` prop and slot wired to a live control |
| Server data | preset | Debounce, race-safety, facets, errors — with a request log as proof |
| Infinite scroll | preset | Server rows that accumulate instead of being replaced; no pager |
| Filters | preset | The filter model taken apart, plus the three filter primitives standalone |
| Grouping | preset | Client vs server grouping, nesting, and per-column aggregates |
| Editing | preset | Per-cell drafts, validation, and a save the server can refuse |
| Cell cursor | preset | Arrow-key navigation, editing keys, and clipboard copy/paste |
| Header bands | preset | Columns banded under shared headers, nested, foldable |
| Wide table | preset | 34 columns, zero declared widths — each measured once and clamped |
| Hoisted state | preset | `QueryState` owned by a ref, mirrored into the URL, driven imperatively |
| Theming | preset | The `--vtc-*` palette and the `data-*` state hooks |
| Virtual rows | preset | 100k rows as one continuous scroll; the page size is everything |
| Performance | preset | The whole 10k rows, timed in the browser to the frame after the paint |
| API reference | preset | Every export, rendered by the table they belong to |
| Selection | primitives | Modes, ranges, tri-state header, "select all matching" as a predicate |
| Column layout | primitives | `useColumns` standalone, persisted to `localStorage` |
| Composed | primitives | Cards, not a table — same primitives, different surface |
| Core only | core | Zero components. Pure functions and `usePagination` over plain markup |

## The source panel

Under each view is a collapsed panel holding the source of the example that covers it — the real
file from `docs/.vitepress/examples/`, which the docs site mounts and `pnpm typecheck` covers, not
a copy of it. `scripts/vite-plugin-highlight.ts` runs Shiki over it at build time behind a
`?highlight` import, so no highlighter reaches the browser and `demo/inline.mjs` still finds one
script and one stylesheet.

`demo/src/examples.ts` is the tab-to-file table, and `tests/demoExamples.spec.ts` fails, naming the
offender, when a tab has no entry, an entry names a file that is not there, or a file in that
directory is shown nowhere. The **Performance** and **API reference** tabs opt out with a sentence
saying why rather than by being left out.

## Things the demo is deliberately honest about

- **`useServerDataSource` options are read once.** `debounceMs`, `keepPreviousData` and
  `immediate` are captured when the composable runs, so the Server view remounts the source
  behind a `:key` instead of pretending they are reactive. Same for selection `mode` in the
  Selection view.
- **A palette is a set.** The Theming view owns every colour variable at once and seeds them from
  `prefers-color-scheme`. Overriding only `--vtc-header-bg` while `--vtc-text` stays on its
  dark-mode value gives you white-on-white — the exact bug this view would otherwise ship.
- **The Performance view refuses to measure a hidden tab.** A background tab never fires
  `requestAnimationFrame` and clamps `setTimeout` to a second, so a number taken there would be the
  browser's throttle rather than the table's cost. It says so instead of reporting a lie — and
  `afterPaint` carries a timeout anyway, so a tab hidden *partway* through a run cannot leave the
  controls disabled for good.

- **Three primitives truly need a table context** — `ColumnVisibilityMenu`, `RowGroupMenu` and
  `ActiveFilters`, the ones marked by `requireTableContext`. Everything else takes explicit props
  that stand in for the injection, which is why the Filters view can render `ValueListFilter`,
  `ConditionFilter` and `ColumnFilterPopover` outside any table at all.
- **`TableStatus.vue` and `MiniRoot.vue` are not part of the library.** They exist to prove the
  context is a real extension seam in both directions: `TableStatus` injects the same context the
  built-in primitives use and needs no props, and `MiniRoot` assembles a `TableContext` by hand
  and calls `provideTableContext`, so the library's own `SortTrigger`, `ColumnFilterPopover` and
  `TablePagination` run inside a root the library never wrote. Both live at the bottom of the
  Composed view.

## Coverage

The **API reference** view documents all 218 exports, and `tests/apiReference.spec.ts` diffs that
list against `src/index.ts` in both directions — an export cannot be added without being described,
and a description cannot outlive its export. That check is what keeps this section honest.

182 of the 218 names exported from `src/index.ts` are referenced somewhere in `demo/src` —
checked by diffing the export list against the sources, not by eye. Every *value* export is among
them; `tests/apiSurface.spec.ts` enforces that. Most are called or rendered; the rest are types
that appear as explicit annotations (`ServerDataSourceOptions`, `UseColumnsResult`, `PageItem`,
`SelectionState`, `GroupingOptions`, …) so the demo doubles as a typed reference rather than
leaning on inference.

Measure it with `demo/src/data/apiReference.ts` **excluded**. That file is generated and names
every export by construction, so a plain search of `demo/src` reports 218 of 218 and means nothing.

The thirty-six that are not referenced are all types, and fall into six families:

- **Column storage and drag-and-drop plumbing** — `ColumnLayoutField`, `ColumnStorageOptions`,
  `StorageLike`, `UseColumnDnd`, `UseColumnDndOptions`, `ColumnDropTarget`, `DropSide`. The
  Column layout view drives all of this through `DataTable` props and `useColumns`, so the
  plumbing types never need naming.
- **Composable option and result shapes** — `UseTable`/`UseTableOptions`,
  `UseCellCursor`/`UseCellCursorOptions`, `UseRowEditing`/`UseRowEditingOptions`,
  `UseVirtualRows`/`UseVirtualRowsOptions`, `InfiniteDataSource`/`InfiniteDataSourceOptions`.
  The views call the composables and let inference carry the result; annotating each return type
  would demonstrate nothing.
- **Editing and cursor detail types** — `RowEditState`, `RowSaveFailure`, `CellErrors`,
  `DraftValidation`, `CellEditorKind`, `CursorMove`, `CursorKeyGesture`, `RowClickGesture`. The
  Editing and Cell cursor views exercise the behaviours these describe through the composables'
  own signatures.
- **The two-step grouping API** — `GroupTree`, `GroupTreeOptions`, `GroupNode`. Splitting build
  from walk is what makes collapsing a band re-scan nothing, but `useRowGrouping` already does
  the splitting, so no view has a reason to do it by hand.
- **The header row model** — `HeaderRow`, `HeaderCell`, `HeaderGroupCell`, `HeaderColumnCell`.
  The Header bands view renders them through the primitives' slots, where they arrive already
  typed.
- **The async-options shapes** — `AsyncOption`, `AsyncOptionFetcher`, `AsyncOptionSource`,
  `AsyncOptionsOptions`. The Editing view hands `useAsyncOptions` a fetcher and a column its
  result, and inference names both.

Each view also lists the exports it uses in the chips under its title.
