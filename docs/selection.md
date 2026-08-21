# Selection

```ts
const source = /* … */
<DataTable :columns="columns" :source="source" selectable @update:selection="ids = $event" />
```

Single or multiple (`selectable="single"`), shift-click ranges, a tri-state header checkbox, and
selection that survives paging. `selectable` is reactive — switch it on, off, or between modes at
runtime and the table follows without remounting.

For server data, "select all 12,384 matching" cannot be an id list, so it is modelled as a
predicate instead:

```ts
{ mode: 'all-matching', excluded: [17, 204] }
```

`DataTable` offers this escalation only once the visible page is fully checked.

---

Live: the **Selection** tab of `pnpm demo` (`#selection`). Back to the [docs index](../README.md#docs).
