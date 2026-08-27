# Composing your own

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

See `playground/src/examples/ComposedCustom.vue` for the full version.

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
gives you page 3. Live example: `playground/src/examples/UrlSyncedState.vue`.

---

Live: the **Composed** tab of `pnpm demo` (`#composed`). Back to the [docs index](/).
