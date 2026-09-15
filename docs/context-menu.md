# The right-click menu

<script setup>
import Example from './.vitepress/examples/context-menu.vue'
</script>

<Demo :is="Example" />

<<< @/.vitepress/examples/context-menu.vue

A right-click on a cell opens a menu of the things the table can already do to that column, aimed at
the cell under the pointer. One prop turns it on:

```vue
<DataTable :columns="columns" :source="source" context-menu />
```

Five items, and every one of them is a call the table offers somewhere else:

| Item | What it calls |
| --- | --- |
| Filter by this value | `state.setFilter(columnId, valuesFilter([value]))` — the filter panel's own values list, with one value ticked |
| Sort ascending / descending | `state.setSort(columnId, 'asc' \| 'desc')` — the header's sort, without the cycle through "unsorted" |
| Group by this column | `state.toggleGroup(columnId)` — the grouping menu's checkbox |
| Hide column | `columns.toggleVisibility(columnId, false)` — the column menu's checkbox |
| Copy | the cell's displayed text, the same string `Ctrl`/`Cmd`+`C` puts on the clipboard |

Nothing here is a second implementation, so a column filtered from the menu is filtered exactly as
the panel would have filtered it, and clearing it from the chip works without the menu knowing.

## What the column says

An item the column has refused stays in the menu, greyed: `sortable: false` disables both sort items,
`filterable: false` the filter, `groupable: false` the grouping and `hideable: false` the hide. They
are disabled rather than dropped because a menu whose items move about depending on the column makes
the one you wanted hard to aim at.

## Header cells

A right-click on a header opens the same menu without the two items that need a cell to read — filter
by this value, and copy. Sort, group and hide are what a header has to offer, and they are the three
that are left.

## From the keyboard

`Shift`+`F10` — and the dedicated `ContextMenu` key, on keyboards that have one — opens the menu on
the cursor's cell. That needs `cell-cursor`, since without a cursor there is no focused cell to open
it on; the right-click works either way. Inside the menu, `↑` and `↓` walk the items and wrap, `Esc`
closes it, and `Enter` or `Space` is the browser's own on a `<button>`.

Neither key is spent on anything else: a bare `F10` is the browser's menu bar on Windows and Linux,
which is why the `Shift` is required rather than merely tolerated. The rest of the table's keyboard
is [Keyboard navigation](keyboard.md).

## Items of your own

The `#contextMenu` slot adds items after the built-in five, inside the same panel — so they share the
dismissal, the arrow keys and the theme. It is handed the `columnId`, the `rowId` (absent on a
header) and a `close` function:

```vue
<template #contextMenu="{ rowId, close }">
  <button type="button" class="vt-context-item" role="menuitem" @click="audit(rowId), close()">
    Show audit trail
  </button>
</template>
```

`close` is handed in rather than called for you: an item that opens a dialog of its own decides when
the menu is done.

## The primitive

`TableContextMenu` is what `DataTable` renders, and you can render it yourself over a table built
from the primitives. It is the fourth primitive that **requires a `<TableRoot>` above it** — it reads
the whole column, filter and grouping model rather than taking it as props, like
`ColumnVisibilityMenu`, `RowGroupMenu` and `ActiveFilters`. Give it `open`, the `anchor` element to
hang off, the `columnId` and optionally the `rowId`:

```vue
<TableGrid :cursor="cursor" context-menu @context-menu="(target, anchor) => (menu = { target, anchor })">
  …
</TableGrid>

<TableContextMenu
  v-if="menu"
  open
  :anchor="menu.anchor"
  :column-id="menu.target.columnId"
  :row-id="menu.target.rowId"
  @update:open="menu = null"
/>
```

`TableGrid`'s `context-menu` prop is what binds the listener at all — off by default, and off means
off: a right-click then gets the browser's own menu, which is the honest answer for a table with
nothing to put in its place. `contextMenuFor(event)` is the keyboard half, the decoder that answers
`Shift`+`F10` and `ContextMenu`, so a hand-assembled grid gets the same keys without reimplementing
the decision.

The panel is teleported to `<body>` and positioned at the anchor cell's bottom-left corner, so
neither the scroll box's `overflow` nor a `<td>`'s can clip it; low on the page it flips above the
cell instead. Pass `:teleport="false"` to render it inline, where it takes no position of its own.

---

Live: the **Right-click menu** tab of `pnpm demo` (`#context-menu`). Back to the [docs index](/).
