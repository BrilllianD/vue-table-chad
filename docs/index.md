---
layout: home
hero:
  name: vue-table-chad
  text: Headless table primitives for Vue 3
  tagline: Sorting, filters, grouping, editing and a keyboard cell cursor — over local arrays or server endpoints, interchangeably.
  actions:
    - theme: brand
      text: Documentation
      link: /getting-started
    - theme: alt
      text: Full Demo
      # `_self` for the same reason the nav's link carries one — see
      # `.vitepress/config.ts`. The demo is not a VitePress page, and the router
      # intercepts every internal link that does not carry a target.
      link: /demo/
      target: _self
features:
  - title: core/
    details: Composables + pure functions. No components. You want the logic and none of the markup.
  - title: primitives/
    details: Headless components. Slots, data-* attributes, no CSS. You want your own markup.
  - title: preset/
    details: DataTable + a stylesheet, assembled from the primitives. You want a table right now.
---

<script setup>
import Example from './.vitepress/examples/home.vue'
</script>

## One component, most of the library

One `<DataTable>` over 400 rows, with most of what the library does turned on:

<Demo :is="Example" />

Click a header to sort, shift-click a second to stack it. Open a header's menu for an Excel-style
filter, or search every column at once. Tick rows, group by Department, hide a column, drag a
header somewhere else, right-click a cell, turn a page.

The headers are banded, and every band starts open — fold **Location** and it keeps Country alone,
fold **Organisation** and it keeps Department. Name is pinned left and unhideable, so folding
**Identity** leaves it exactly where it is — and so **Personal details** and **Identity** each
appear twice, once over the pinned side and once over the scrolling one. A band cannot straddle
that boundary; scroll sideways and the reason is visible.

Click a cell and the keyboard takes over: arrows move, `Enter` opens the cell for editing, a second
`Enter` commits it and steps down, `Esc` abandons the draft. None of it re-reads the dataset unless
it has to — not paging, not selecting, not folding a band, and not an edit until the moment a save
succeeds.

::: details The whole thing, in one file
<<< @/.vitepress/examples/home.vue
:::

Over a server endpoint it is the same component: swap `useLocalDataSource` for a source of your own
and the filters, the sort and the pager become the query you send. The
[Full Demo](/demo/){target="_self"} has a view per feature — editing, virtual rows, detail rows,
header bands, the keyboard cell cursor — and names the exports each one uses.
