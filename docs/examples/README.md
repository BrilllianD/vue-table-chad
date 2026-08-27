# Examples

## [`AddressesTable.vue`](AddressesTable.vue) — porting an existing Options API table

A real server-paginated table with the app's own markup, moved onto `vue-table`. It keeps the
`<table>` and every CSS class the app's stylesheet expects, and takes everything behind them from
the library — state, data, selection, sort headers, column visibility and paging.

| Replaced | With |
| --- | --- |
| `Paginated` mixin | `useTableState` — `page`, `pageSize` |
| `Ordering` mixin | `useTableState` — `sort` |
| `Searching` mixin | `useTableState` — `globalSearch` |
| `useTableSelector` | `useRowSelection` |
| `get_data()` + a `loading` flag | `useServerDataSource` |
| `<th-ordered>` | `<SortTrigger>` inside the component's own `<th>` |
| `<cr-paginator>` | `<TablePagination>` |
| `TableColumns` mixin + `v-table-columns` + `<TableColumnsDialog>` | `<ColumnVisibilityMenu>` + `useTable`'s `storageKey` |

Kept as they were: `ContextMenuMixin`, `<search-input>`, `<loading-indicator>`, the status
`<select>`, every CSS class, and the API contract with `AddressApi.get_list`. Three lines are marked `ADAPT` — the parameter names your endpoint expects,
whether it can forward an `AbortSignal`, and the shape of its response envelope.

### Why a *server* source

The component pages against an endpoint, so `useLocalDataSource` would be wrong: it filters, sorts
and slices in the browser, and the browser only holds the current page. `useServerDataSource` puts
the query on the wire instead, and adds four things the hand-written `get_data()` did not have —
verified against a stand-in for `AddressApi`:

- **Filter, search and sort changes are debounced (300ms); paging is not.** Three keystrokes into
  the search box produce one request; "next page" fires immediately.
- **Out-of-order responses cannot land.** A slow request fired before a fast one is discarded
  rather than overwriting it, via monotonic request ids plus `AbortController`.
- **`keepPreviousData`**, so the table does not blank out between pages — including when a request
  fails.
- **One fetch on creation**, which is why `mounted()` no longer calls `refresh()`.

### The bug the port fixes for free

`setSort`, `setFilter`, `setSearch` and `setPageSize` all reset to page 1; `setPage` obviously does
not. The original changed the status `<select>` and called `refresh()` without touching the page, so
filtering while on page 5 of 3 fetched an empty result. Routing the select through
`state.setFilter('status', …)` — a `computed` with a getter and a setter, so `v-model` still works —
makes that impossible and removes the `@change="refresh"` handler entirely.

### Four things that will bite anyone doing this port

1. **Return everything from `setup()` flat.** Only top-level refs are unwrapped in a template.
   Return `source` whole and `{{ source.total }}` still *prints* the right number — Vue's
   `toDisplayString` unwraps refs for display — while `source.total > 0` is silently `false` and
   `v-for="o in source.rows"` throws `Cannot read properties of undefined (reading 'id')`. A
   display that lies is the worst version of this bug; return flat refs and it cannot happen.

2. **`isSelected` takes the row, not its id.** The library derives the id itself, which is what
   lets a selection survive a re-sort or a page change. Passing an id throws
   `[vue-table] Row has no 'id'. Pass getRowId to useRowSelection.` rather than quietly returning
   `false`, so every call site you miss announces itself. If your rows are not keyed by `id`, pass
   `getRowId` to `useRowSelection` — and if a mixin of yours already calls `isSelected(id)`, give
   it a shim rather than changing the library's contract.

3. **`pageSize` defaults to 10.** Harmless here, where the paginator sets it — but a table with no
   pager that forgets it renders ten rows and reports the true `total`, which reads as data loss.
   Pass `Number.MAX_SAFE_INTEGER` for a table that shows everything. Not `0`: that yields one row.

4. **`order()` cycles three ways** — asc → desc → *off* — where most hand-rolled `Ordering` mixins
   toggle two. Third click clears the sort. For two-state, call
   `state.setSort(id, dir === 'asc' ? 'desc' : 'asc')` instead. Shift-click multi-sort is
   `state.toggleSort(id, true)`.

### Sort headers: `SortTrigger`, not a hand-rolled `<th-ordered>`

The library ships the clickable sort label, so a per-app one is redundant. Two facts decide *how*
to adopt it, both verified by clicking the rendered button:

- **`SortTrigger` is a `<button>`, not a `<th>`.** It goes inside a `<th>` the component still
  owns — which is what keeps the `data-col` attribute that `v-table-columns` and the column dialog
  look for. The `<th>`-level primitive, `TableHeaderCell`, takes a `ResolvedColumn` and therefore
  the whole column model with it, which would collide with that dialog. Wrong trade here.
- **Without a table context above it, clicking a `SortTrigger` does nothing.** It renders the
  correct direction and emits `toggle`, and that is all — the wiring is deliberately left to the
  caller. So either publish the state once in `setup()`:

  ```js
  provideTableContext(useTable({ columns: () => columns, source: () => source, state }))
  ```

  after which every `<SortTrigger column-id="…">` in the header self-wires, or pass the two props
  by hand:

  ```vue
  <SortTrigger column-id="name" :direction="state.sortFor('name')"
               @toggle="(id, additive) => state.toggleSort(id, additive)" />
  ```

  The example takes the first route: one line, and the header markup then carries no state at all.

What you get for it: the asc → desc → off cycle, the ▲▼⇅ indicator, shift-click multi-sort with a
rank badge, `aria-sort`, and a `data-direction` attribute to style against.

What it costs: **primitives ship no CSS**, so a bare `SortTrigger` is an unstyled button with text
glyphs where the old component probably had Bootstrap icons. The example imports
`@brillliand/vue-table-chad/style.css` for the default look; drop that import and write your own
rules against `.vt-sort` / `.vt-sort-icon` / `[data-direction]` to match the surrounding app
instead. That — not capability — is the only real reason to keep a hand-rolled sort header.

### Column visibility: the markup has to loop

`<ColumnVisibilityMenu>` replaces the "Столбцы" button, the dialog behind it, the `TableColumns`
mixin and the `v-table-columns` directive in one go. It shows and hides, reorders, pins, refuses to
hide the last visible column, honours `hideable: false`, and persists everything under `useTable`'s
`storageKey` — verified by reading the saved entry back:

```json
{"hidden":["alias_count"],"order":["coords","name","status","alias_count"],
 "widths":{},"pinned":{},"collapsedGroups":[]}
```

The catch, and it is the one structural change this port forces: **a static `<th>` per column cannot
respond to it.** The old directive rewrote the DOM by `data-col` attribute; the library instead
hands you the resolved list, so the header and the body both loop over `columns.visible`:

```vue
<th v-for="col in visibleColumns" :key="col.id" :class="col.cls" :style="{width: col.width}">
  <SortTrigger v-if="col.sortable !== false" :column-id="col.id" :label="col.header" />
  <template v-else>{{ col.header }}</template>
</th>
```

Loop only the header and hiding works while reordering silently does not, because the body would
still be in declaration order. Both, or neither.

Cells whose content genuinely differs — `coords` joins two fields, `status` needs a CSS class and a
label lookup — branch on `col.id` inside the loop. That is exactly what `DataTable`'s `cell:<id>`
slots do one layer up.

**App-specific presentation rides on the column def.** `cls` and `width` above are not library
fields; `useColumns` spreads unknown fields straight through to `ResolvedColumn`, so a class stays
attached to its column and a reorder carries it along. Use `width` from the library only if you want
its resizing too — `resolvedWidth` falls back to a default of 160px for every column, which will
pin a fluid column to a fixed width if you were not expecting it.

---

Back to the [docs index](../../README.md#docs).
