# Excel-style filters

Two modes per column, matching Excel's two halves:

```ts
// The checkbox list. include: null means "no filter".
{ kind: 'values', include: ['Engineering', 'Research'], includeBlanks: false }

// The "Text/Number/Date Filters…" submenu.
{ kind: 'conditions', op: 'and', rules: [{ operator: 'between', value: 100, value2: 200 }] }
```

Behaviours worth knowing, because they are easy to get wrong:

- **Blanks are their own bucket.** `null`, `undefined` and `''` all collapse to one "(Blanks)" row,
  and ticking specific values excludes blanks unless `includeBlanks: true`. "(Select All)" covers
  the blanks row too.
- **Facets ignore the column's own filter** but honour every other column's. Otherwise unchecking a
  value would erase the option you just unchecked and you could never restore it.
- **Incomplete rules are ignored.** A half-typed `between` keeps every row rather than blanking the
  table mid-keystroke.
- **Dates compare by calendar day**, and bare `YYYY-MM-DD` strings parse as *local* midnight —
  `Date.parse` treats them as UTC, which shifts the day for anyone west of Greenwich.
- **A filter that matches everything is not a filter.** No-op entries are pruned out of
  `QueryState`, and neither the header funnel nor the chip row lights up for one.

The filter panel is teleported to `<body>` and positioned from its trigger, so no ancestor's
`overflow` can clip it. Pass `:teleport="false"` to `ColumnFilterPopover` if you are placing it
yourself.

The global search box covers every `filterable` column. Set `searchable: false` on a column to keep
its filter panel but drop it from search hits.

---

Live: the **Filters** tab of `pnpm demo`. Back to the [docs index](../README.md#docs).
