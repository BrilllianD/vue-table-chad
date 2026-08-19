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

Live: the **Composed** tab of `pnpm demo`. Back to the [docs index](../README.md#docs).
