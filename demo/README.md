# Demo

Every feature the library has, one view at a time.

```bash
pnpm demo          # http://localhost:5174
pnpm build:demo    # -> demo/dist
```

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
    columns.ts         ONE column set using every ColumnDef field
    data/
      dataset.ts       10k rows from a fixed seed, shaped to exercise the API
      fakeApi.ts       in-memory "server" + a request log
    components/
      DemoSection.vue      title, blurb, API-coverage chips
      StateInspector.vue   any value as JSON
      TableStatus.vue      a primitive the library does NOT ship, written here
      MiniRoot.vue         TableRoot rebuilt from scratch in ~40 lines
    views/             one per feature area
```

## The views

| View | Layer | What it is for |
| --- | --- | --- |
| Everything at once | preset | Every `DataTable` prop and slot wired to a live control |
| Server data | preset | Debounce, race-safety, facets, errors — with a request log as proof |
| Filters | preset | The filter model taken apart, plus the three filter primitives standalone |
| Hoisted state | preset | `QueryState` owned by a ref, mirrored into the URL, driven imperatively |
| Theming | preset | The `--vt-*` palette and the `data-*` state hooks |
| Selection | primitives | Modes, ranges, tri-state header, "select all matching" as a predicate |
| Column layout | primitives | `useColumns` standalone, persisted to `localStorage` |
| Composed | primitives | Cards, not a table — same primitives, different surface |
| Core only | core | Zero components. Pure functions and `usePagination` over plain markup |

## Things the demo is deliberately honest about

- **`useServerDataSource` options are read once.** `debounceMs`, `keepPreviousData` and
  `immediate` are captured when the composable runs, so the Server view remounts the source
  behind a `:key` instead of pretending they are reactive. Same for selection `mode` in the
  Selection view.
- **A palette is a set.** The Theming view owns every colour variable at once and seeds them from
  `prefers-color-scheme`. Overriding only `--vt-bg-header` while `--vt-text` stays on its
  dark-mode value gives you white-on-white — the exact bug this view would otherwise ship.
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

All 96 names exported from `src/index.ts` are referenced somewhere in `demo/src` — checked by
diffing the export list against the sources, not by eye. Most are called or rendered; the
remainder are types that appear as explicit annotations (`ServerDataSourceOptions`,
`UseColumnsResult`, `PageItem`, `SelectionState`, …) so the demo doubles as a typed reference
rather than leaning on inference.

Each view also lists the exports it uses in the chips under its title.
