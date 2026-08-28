# Demo

Every feature the library has, one view at a time.

```bash
pnpm demo          # http://localhost:5174
pnpm build:demo    # -> demo/dist
pnpm build:docs    # -> demo/dist/standalone.html, the whole site in one file
```

`build:docs` inlines the bundle into a single self-contained page. It predates the Bitbucket remote
having a real host for it: one file could be published anywhere in the meantime. P3-9 gives the demo
a proper host alongside the VitePress docs site, and removes this step once it does.

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
| Everything at once | preset | Every `DataTable` prop and slot wired to a live control |
| Server data | preset | Debounce, race-safety, facets, errors — with a request log as proof |
| Filters | preset | The filter model taken apart, plus the three filter primitives standalone |
| Grouping | preset | Client vs server grouping, nesting, and per-column aggregates |
| Hoisted state | preset | `QueryState` owned by a ref, mirrored into the URL, driven imperatively |
| Theming | preset | The `--vt-*` palette and the `data-*` state hooks |
| Performance | preset | The whole 10k rows, timed in the browser to the frame after the paint |
| API reference | preset | All 143 exports, rendered by the table they belong to |
| Recipes | preset | What to type — the six worked examples `docs/recipes.md` runs |
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
  `prefers-color-scheme`. Overriding only `--vt-bg-header` while `--vt-text` stays on its
  dark-mode value gives you white-on-white — the exact bug this view would otherwise ship.
- **The Performance view refuses to measure a hidden tab.** A background tab never fires
  `requestAnimationFrame` and clamps `setTimeout` to a second, so a number taken there would be the
  browser's throttle rather than the table's cost. It says so instead of reporting a lie — and
  `afterPaint` carries a timeout anyway, so a tab hidden *partway* through a run cannot leave the
  controls disabled for good.

- **`ColumnVisibilityMenu` is the one primitive that truly needs a table context.** Everything
  else takes explicit props that stand in for the injection, which is why the Filters view can
  render `ValueListFilter`, `ConditionFilter` and `ColumnFilterPopover` outside any table at all.
- **`TableStatus.vue` and `MiniRoot.vue` are not part of the library.** They exist to prove the
  context is a real extension seam in both directions: `TableStatus` injects the same context the
  built-in primitives use and needs no props, and `MiniRoot` assembles a `TableContext` by hand
  and calls `provideTableContext`, so the library's own `SortTrigger`, `ColumnFilterPopover` and
  `TablePagination` run inside a root the library never wrote. Both live at the bottom of the
  Composed view.

## Coverage

The **API reference** view documents all 143 exports, and `tests/apiReference.spec.ts` diffs that
list against `src/index.ts` in both directions — an export cannot be added without being described,
and a description cannot outlive its export. That check is what keeps this section honest.

120 of the 143 names exported from `src/index.ts` are referenced somewhere in `demo/src` —
checked by diffing the export list against the sources, not by eye. Most are called or
rendered; the remainder are types that appear as explicit annotations
(`ServerDataSourceOptions`, `UseColumnsResult`, `PageItem`, `SelectionState`, `GroupingOptions`,
…) so the demo doubles as a typed reference rather than leaning on inference.

Measure it with `demo/src/data/apiReference.ts` **excluded**. That file is generated and names
every export by construction, so a plain search of `demo/src` reports 143 of 143 and means nothing.

The twenty-three that are not referenced, and why:

- **Column storage and drag-and-drop internals** — `ColumnLayoutState`, `ColumnLayoutField`,
  `ColumnStorageOptions`, `StorageLike`, `DEFAULT_COLUMN_LAYOUT_FIELDS`, `sanitizeColumnLayout`,
  `normalizeColumnStorage`, `UseColumnDnd`, `UseColumnDndOptions`, `ColumnDropTarget`,
  `DropSide`. The Column layout view drives all of this through `DataTable` props and
  `useColumns`, so the plumbing types never need naming.
- **Grouping internals** — `aggregateValue`, `aggregateRow`, `groupValueOf`, `groupPathKey`,
  `groupSortRules`. The Grouping view uses the whole-dataset entry points (`aggregateGroups`,
  `countGroups`, `flattenGroups`, `groupKeys`) instead; these five are the single-column and
  single-row pieces those are built from.
- **The two-step grouping API** — `buildGroupTree`, `flattenTree`, `GroupTree`, `GroupTreeOptions`,
  `GroupNode`. Splitting build from walk is what makes collapsing a band re-scan nothing, but
  `useRowGrouping` already does the splitting, so no view has a reason to do it by hand.
- **Single-pass optimisations** — `sortKeyFor` and `compileSearch`. Both exist so `sortRows` and
  the filter pipeline can derive per row instead of per comparison; a caller that is not writing
  its own pipeline never touches them.

Each view also lists the exports it uses in the chips under its title.
