# Composing your own

<script setup>
import Example from './.vitepress/examples/composing.vue'
import HoistedStateExample from './.vitepress/examples/hoisted-state.vue'
</script>

<Demo :is="Example" />

<<< @/.vitepress/examples/composing.vue

The `TableRoot` slot hands you everything; the markup is yours. This renders cards, not a table,
using the same sort triggers, filter popovers and pager as the preset:

```vue
<TableRoot v-slot="{ rows, selection, total }" :columns="columns" :source="source" selectable>
  <SortTrigger column-id="salary" label="Salary" />
  <ColumnFilterPopover column-id="department" type="enum" />

  <article v-for="row in rows" :key="row.id" @click="selection.toggle(row)">
    {{ row.name }}
  </article>

  <TablePagination />
</TableRoot>
```

Every primitive also takes explicit props that override the injected context, so it works with no
`TableRoot` at all:

```vue
<!-- a standalone pager for any list -->
<TablePagination :page="page" :page-size="20" :total="count" @update:page="page = $event" />
```

The live example at the top of this page is that shape with cards; the fully standalone form — no
`TableRoot` at all, every primitive fed by props — is
[`docs/examples/ComposedFromPrimitives.vue`](https://bitbucket.org/BrilllianD/vue-table-chad/src/main/docs/examples/ComposedFromPrimitives.vue),
walked through in [Porting an existing table](examples/README.md).

## The primitives, and what each one slots

Every primitive reads the table context with `useTableContext()`, which returns `undefined` with
no `TableRoot` above, and then prefers whatever explicit props you passed — which is what makes
each of them usable standalone. Three read a whole model rather than a value and cannot do that:
`ColumnVisibilityMenu`, `RowGroupMenu` and `ActiveFilters` call `requireTableContext()` instead and
throw a named error outside a root.

The slots below are the ones the preset's own slot table does not show, because `DataTable` fills
them itself. Reach for them when you assemble the rows and headers from the primitives directly:

| Primitive | Slot | Props | What it replaces |
| --- | --- | --- | --- |
| `TableRow` | `leading` | `row`, `selected` | The first cell — the preset puts the selection checkbox here. Rendered only when the slot is given, so the grid stays aligned with a `<colgroup>` that has no column for it. |
| `TableRow` | `trailing` | `row`, `state` | The last cell — the preset's row-edit Save/Cancel. Same rule: no slot, no cell. |
| `TableRow` | `cell` | `row`, `column`, `value`, `text`, `index` | Per-cell content, for every column at once; the preset routes its `cell:<id>` slots through it. |
| `TableHeaderCell` | default | `column`, `grouped`, `groupsCollapsed`, `fold` | The header label. `fold` is the call a grouped column's click makes. |
| `TableHeaderCell` | `resize` | `column` | Where the preset mounts `ColumnResizeHandle`. Left empty, the column has no drag handle. |
| `TableGroupRow` | `aggregate` | `column`, `result`, `text` | One aggregate figure inside a group header row. |
| `TablePagination` | `summary` | `pagination`, `total` | The "X–Y of Z" text. `pagination` is the whole `UsePagination`, so `firstRow` and `lastRow` are there. |

Two primitives carry no slot of their own worth naming and are easy to miss. `TableCell` is one
`<td>` sharing the header's sticky and pin logic, so a hand-built row that uses it stays aligned
with a pinned header; `TableRow` renders one per column, and a row built without `TableRow` can
render them itself. `ColumnResizeHandle` is the pointer-and-keyboard resizer, a `separator` role
that emits `resize(columnId, width)` and reads the width to start from off the header cell when
the column declared none.

## Without a component at all — `useTable()`

`TableRoot` is a thin thing: it calls `useTable()`, publishes the result with
`provideTableContext()`, and renders a slot. When you want the wiring but not the component — a
table whose markup shares nothing with the preset's, or several tables in an app that each assemble
their own — call it directly.

```ts
const table = useTable({
  columns: () => columns,
  source: () => source,
  state,                       // optional; it builds one if you don't
  selectable: () => true,
})
```

Options are **getters wherever the value can change** — a composable has no props to watch, so you
supply the read. The rest are read once at setup, and `UseTableOptions` says which are which.

What comes back is the `TableContext` every primitive reads, plus `headerRows`, `cursor`,
`rowSelection` and `getRowKey`. Publish it if primitives beneath need to find it:

```ts
provideTableContext(table)
```

Everything the preset does about grouping, selection gating, cursor seeding and layout persistence
happens here, so a hand-built table gets those rules rather than reimplementing them. What stays
with the component is what only a component can do: `provide`, and turning a change into an emit.

`TRow` is unconstrained, so an ordinary `interface Row { … }` works — no index signature needed.

## Hoisting state (URL, store)

Pass a ref and the table stops owning its state — it reads and writes yours:

```ts
const external = ref<QueryState>(readFromUrl())
const state = useTableState({ state: external })

watch(external, (q) => history.replaceState(null, '', `#q=${encodeURIComponent(JSON.stringify(q))}`),
  { deep: true })
```

Mirroring is synchronous both ways, so reading `external.value` right after `state.setPage(3)`
gives you page 3.

Sort, filter or page the table below and the address bar follows; press back and the table follows.
Nothing in the table knows the URL exists:

<Demo :is="HoistedStateExample" />

<<< @/.vitepress/examples/hoisted-state.vue

---

Live: the **Composed** tab of `pnpm demo` (`#composed`). Back to the [docs index](/).
