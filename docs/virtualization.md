# Virtual rows

A hundred thousand rows as one continuous scroll, with about thirty of them in the document.

```vue
<DataTable :columns="columns" :source="source" :state="state" virtual />
```

Off by default. A table that does not ask for it keeps its pager and renders exactly the markup it
rendered before — the same `<tbody>`, the same rows, no spacers.

## What `virtual` actually changes

Two things, and only two.

**The page becomes everything.** `virtual` writes the page size to the size of the result set. That
is the whole of it in `core/`: there is no second row path, no separate un-paged list, and
`QueryState.pageSize` stays a truthful record of what was asked for — a URL mirroring the query
still describes the table you are looking at. Everything downstream keeps the meaning it already
had, because "the page" has simply become the whole set.

**The `<tbody>` renders a window.** `VirtualBody` puts one spacer row above the window and one
below, each as tall as the rows it stands in for, so the `<table>` is its full height and the
scrollbar is honest while the DOM is not.

The pager is not rendered, whatever `show-pagination` says. There is exactly one page.

## The knobs

| Prop | |
| --- | --- |
| `virtual` | On or off. Off is the default and off is unchanged. |
| `row-height` | How tall one row is, in CSS pixels. Defaults to 38. |
| `overscan` | Rows kept rendered beyond each edge. Defaults to `OVERSCAN_ROWS`, which is 4. |

`row-height` is written to `--vt-row-height` on the scroll box, so the number the windowing counts
with and the number the browser lays out with cannot drift apart. **Change the prop, not the token**
— setting `--vt-row-height` in your own CSS while `virtual` is on gives the two different answers,
and the window starts landing a little further off with every row.

Heights are assumed uniform. A group header row lays out about a pixel taller than a data row,
which shifts the window's own rows by that much and nothing more — the spacers are computed from
the assumed height, and only the rendered rows are laid out, so the error is bounded by the window
rather than accumulating down the list. Variable row heights are not supported yet.

## It needs a box with a height

The window is "how many rows fit in the viewport", so there has to be a viewport. `.vt-scroll` caps
itself at `70vh`, which is where the height comes from by default. **A theme that sets
`max-height: none` on it has made the viewport as tall as the content and turned virtualization
off** — every row will be rendered, correctly and slowly.

Before the box has been measured — the first render, always — the window falls back to an assumed
viewport and narrows on the next frame. That is deliberate: a table that rendered nothing until it
had been measured would flash empty on every mount.

## The cursor

`cell-cursor` works with `virtual`, and the combination is the reason two things exist.

A cursor position is a **row id**, so moving the ring onto a row the window has evicted is legal and
does exactly the right thing to the model. What it cannot do is take the focus, because there is no
cell in the document to focus. So the body scrolls the window to that row and asks for the focus
again — which is why holding `↓` walks the ring off the bottom of the window and the window follows
it.

The roving tabindex needs the other half. The cursor walks every row, but the one cell carrying
`tabindex="0"` has to be one a `Tab` can reach, so while the ring is scrolled out of view the tab
stop falls to the first *rendered* row. Without that the grid would drop out of the tab order
entirely whenever you scrolled away from the ring.

`Ctrl`/`Cmd` + `←`/`→` — turn the page — does nothing here, since there are no pages.
`PageUp`/`PageDown` still move ten rows, and still work.

## What it costs

Worth being straight about, because it is not free.

The window is: scrolling is one ref write and two integer divisions, and a scroll that moves less
than one row height propagates nothing at all. `tests/invalidation.spec.ts` holds it to that — a
scroll may not run the filter, the sort, the grouping or the aggregates.

The page size is not. Every one of those passes now runs over the whole dataset on each change
rather than over 25 rows. At 100k that is roughly 190ms for a search to settle and 65ms to build a
two-level group tree — the same work any table filtering 100k rows does, arriving in one place
instead of being hidden by a page slice. `bench/BASELINE.md` has the numbers.

One thing scales with the *interaction* rather than with the data, which is the worse direction:
selection. The header checkbox's tri-state asks "are all of these selected" over the rows it was
handed, and virtual mode hands it the dataset — about 8ms per click at 100k. Usable, but it is why
the demo leaves `selectable` off.

## Composing your own

`useVirtualRows` is pure arithmetic over three numbers — item height, viewport height, scroll
offset — and knows nothing about tables:

```ts
import { useVirtualRows } from '@brillliand/vue-table-chad'

const virtual = useVirtualRows(items, { rowHeight: 38, viewportHeight: () => box.value?.clientHeight ?? 0 })
box.value.addEventListener('scroll', () => virtual.setScrollOffset(box.value.scrollTop), { passive: true })
```

It returns `start`, `end`, the windowed `items`, `spaceBefore`, `spaceAfter` and `totalSize`, plus
`offsetFor(index)` and `indexAt(offset)`. `VirtualBody` is the `<tbody>` around it, and it yields
the window through its default slot rather than looping itself, so the markup for a row stays
yours.

---

Live: the **Virtual rows** tab of `pnpm demo` (`#virtual`). Back to the
[docs index](../README.md#docs).
