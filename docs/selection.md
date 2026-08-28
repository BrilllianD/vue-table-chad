# Selection

<script setup>
import Example from './.vitepress/examples/selection.vue'
</script>

<Demo :is="Example" />

<<< @/.vitepress/examples/selection.vue

Single or multiple, shift-click ranges, a tri-state header checkbox, and a selection that survives
paging. Under it all sits one decision: rows are tracked by **id**, never by reference — which is
what lets a selection outlive a sort, a filter, a page turn and a refetch that hands back freshly
allocated row objects.

## Turning it on

```ts
<DataTable :columns="columns" :source="source" selectable />
```

`selectable` is `boolean | SelectionMode`:

| Value | What renders |
| --- | --- |
| `false` (default) | Nothing. No checkbox column, no selection state on the context. |
| `true` / `"multiple"` | The checkbox column, the tri-state header checkbox, shift-ranges. |
| `"single"` | The checkbox column, but **no header checkbox** — "select all on this page" has nothing to mean when only one row can be held. |

It is reactive: switch it on, off, or between modes at runtime and the table follows without
remounting. That works because `useTable` builds the selection unconditionally and gates it on the
way *out* — building it lazily would freeze the answer at setup, so flipping `selectable` on later
would render a checkbox column with nothing behind it.

Switching it off is not itself reported as a selection change. The `update:selection` watcher reads
the *ungated* selection and returns early when `selectable === false`, so turning the feature off
does not look like the user having cleared their picks.

## Identity

`getRowId` defaults to `row.id`. A row with no `id` and no `getRowId` throws rather than guessing:

```
[vue-table-chad] Row has no `id`. Pass `getRowId` to useRowSelection.
```

That is deliberately louder than the rest of the library, which happily falls back to an array index
for render keys. A wrong render key costs a repaint; a wrong *selection* id silently corrupts which
rows the user thinks they picked, and the mistake surfaces at the point of no return — after the
delete.

```ts
<DataTable :columns="columns" :source="source" selectable :get-row-id="(row) => row.uuid" />
```

## The gestures

- **Click a checkbox** to toggle that row.
- **Shift-click a checkbox** to take every row between the last one you touched and this one.
  Excel's rule, not the naive one: the whole range moves to the state the *clicked* row is moving
  to, so shift-clicking an unselected row selects the run and shift-clicking a selected one clears
  it. The anchor is then the row you just clicked.
- **The header checkbox** is tri-state — `none`, `some`, `all` — over the *selectable* rows of the
  current page, and clicking it takes the page to whichever of all-on / all-off it is not already at.

With no anchor yet, or when the anchor has paged away and is no longer among the rendered rows, a
shift-click degrades to a plain toggle instead of guessing a range across a boundary the user cannot
see.

Clicking the row itself does **not** select. `DataTable` emits `@rowClick` for it and leaves the
decision alone — a table that both navigates and selects on the same gesture has to pick which one
wins, and that is the caller's call:

```vue
<DataTable ... selectable @row-click="(row) => router.push(`/people/${row.id}`)" />
```

### Rows that cannot be picked

`isRowSelectable` vetoes per row. Its checkbox renders disabled, and the range and header gestures
skip it rather than silently including it:

```ts
<DataTable ... selectable :is-row-selectable="(row) => row.active" />
```

The header checkbox counts only selectable rows, so a page whose every *pickable* row is ticked
reads `all` even when some rows could never be ticked at all.

## Reading it back

Two routes, and they do not carry the same information.

```vue
<DataTable ... selectable @update:selection="ids = $event" />
```

The event carries `RowId[]` — the explicitly selected ids. Fine for the common case, with one sharp
edge: **in `all-matching` mode that array is empty**, because there are no ids to send. If your table
offers "select all N matching" (below), read the state instead of the event.

The `toolbar` slot hands you the whole composable:

```vue
<template #toolbar="{ selection, total }">
  <strong>{{ selection?.count.value ?? 0 }}</strong> of {{ total }} selected
  <button @click="selection?.clear()">Clear</button>
</template>
```

`selection` is `undefined` when `selectable` is `false` — hence the `?.`. It is the same
`UseRowSelection` object `useRowSelection` returns:

| | |
| --- | --- |
| `state` | The whole truth: an id list or a predicate. See below. |
| `selectedIds` | Ids explicitly selected. Empty in `all-matching`. |
| `selectedOnPage` | Selected **rows**, among the loaded ones — a server page holds no more. |
| `count`, `isEmpty` | How many are selected, counting a predicate correctly. |
| `isAllMatching` | Whether the selection is a predicate rather than a list. |
| `headerState` | `'none' \| 'some' \| 'all'` for the header checkbox. |
| `isSelected`, `isSelectable` | Per row. |
| `select`, `toggle`, `toggleRange`, `toggleAllOnPage` | The mutators behind the gestures. |
| `selectAllMatching`, `clear` | The escalation, and the way back. |
| `getRowId` | The identity function actually in use. |

## Selecting more rows than are loaded

"Select all 12,384 matching" cannot be an id list — the ids are on the server. So the state is a
union, and the second arm is a predicate:

```ts
type SelectionState =
  | { mode: 'ids'; ids: RowId[] }
  | { mode: 'all-matching'; excluded: RowId[] }
```

`DataTable` offers the escalation only once the visible page is fully checked *and* there is more
behind it (`headerState === 'all' && total > rows.length`), which is the moment the user has
demonstrably asked for more than they can see. Unticking a row afterwards records an exclusion
rather than collapsing the predicate into twelve thousand ids, and `count` is
`total - excluded.length`.

Two consequences worth stating plainly:

- **The predicate is scoped to the current filters, and it re-scopes when they change.** It says
  "everything matching", not "everything that matched when I clicked". Narrow the filter afterwards
  and the selection narrows with it. If that is not what your action means, snapshot the query
  alongside the selection, or clear the selection when the query changes.
- **You have to send it as a predicate too.** There is no id list to POST:

```ts
const { query } = state
const body =
  selection.state.value.mode === 'all-matching'
    ? { filters: query.value.filters, search: query.value.globalSearch,
        excluding: selection.state.value.excluded }
    : { ids: selection.selectedIds.value }
```

In `single` mode both `selectAllMatching()` and `toggleAllOnPage()` are no-ops, so this whole arm
never appears.

## Without `DataTable`

`useRowSelection` takes the rows on screen, the total behind them, and its options. Both of the
first two accept a ref or a getter:

```ts
const selection = useRowSelection<Employee>(
  () => source.rows.value,
  () => source.total.value,
  { mode: 'multiple', getRowId: (row) => row.id },
)
```

`SelectionCheckbox` is the other half — a checkbox that tracks `indeterminate` and, more usefully,
stays honest when the handler *declines* the change:

```vue
<th>
  <SelectionCheckbox
    :checked="selection.headerState.value === 'all'"
    :indeterminate="selection.headerState.value === 'some'"
    label="Select all rows on this page"
    @change="selection.toggleAllOnPage()"
  />
</th>
...
<td>
  <SelectionCheckbox
    :checked="selection.isSelected(row)"
    :disabled="!selection.isSelectable(row)"
    label="Select row"
    @change="(_checked, event) => event.shiftKey ? selection.toggleRange(row) : selection.toggle(row)"
  />
</td>
```

A plain `<input type="checkbox">` will not do here, and not for a styling reason. A click mutates
`checked` in the DOM *before* any handler runs, so a refused change leaves the box visibly ticked
for a selection that does not exist, and an accepted one makes Vue's patch a no-op that then records
the wrong value in the vnode for good. `SelectionCheckbox` re-asserts the model on the next tick,
whether or not anything moved. `preventDefault()` does not fix it: for a trusted click the browser's
revert runs *after* Vue has patched.

Note the shift-click plumbing above — the range gesture is not built into the checkbox. `@change`
hands you the `MouseEvent` precisely so the caller decides what a modifier means.

## What it costs

A selection change is interaction state: `tests/invalidation.spec.ts` asserts a toggle never reaches
the pipeline — no filter pass, no sort pass, no regroup.

- **The state is a `shallowRef`**, and every mutator replaces the whole object rather than mutating
  the id list in place. A deep `ref` would proxy one entry per selected row to notice a change the
  reassignment already announced.
- **A range is one state write**, not one per row. Going through `select()` per row would rebuild
  the state object and its `Set` on every iteration — O(n²) across a large page.
- **The header checkbox does not walk the rows.** It needs two numbers — how many rows may be
  toggled, and how many of those are selected — and only the first is a function of the rows, so it
  is paid when the *page* changes. The second walks the selection, which is as long as the user's
  own clicks, asking a `Set` of page ids about each.

  That split is why virtualization did not make selection quadratic. `virtual` hands this composable
  the whole dataset as its "page", and the old header-state pass cost **8.2 ms per click at 100k**;
  it now costs 0.0024 ms — see `bench/BASELINE.md`, "The pipeline underneath". Read the after-number for
  what it measures: the cost is O(rows *selected*), not O(1). "Select all matching" is one id-free
  state and stays free; 50k individually ticked rows would be 50k `Set` lookups a click, which is
  proportional to what the user actually did.

## Styling

The selection column is `.vt-col-selection`, 40px wide. A selected row carries `data-selected` on
its `<tr>` — emitted by the `TableRow` primitive, so a headless table gets the hook without the
theme:

```css
.vt-tbody .vt-tr[data-selected] .vt-td { /* … */ }
```

The preset paints it through `--vt-bg-selected`, which is deliberately translucent
(`color-mix(in srgb, var(--vt-accent) 16%, transparent)`) so row stripes and per-column tints stay
visible through a selection rather than being covered by it. See
[Styling](./styling.md#hover-selection-and-how-cell-backgrounds-stack) for where it sits in the
background stack.

---

Live: the **Selection** tab of `pnpm demo` (`#selection`). Back to the [docs index](/).
