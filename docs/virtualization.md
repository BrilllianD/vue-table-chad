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
| `measure-rows` | Measure each rendered row rather than trusting `row-height`. Off by default. |

`row-height` is written to `--vt-row-height` on the scroll box, so the number the windowing counts
with and the number the browser lays out with cannot drift apart. **Change the prop, not the token**
— setting `--vt-row-height` in your own CSS while `virtual` is on gives the two different answers,
and the window starts landing a little further off with every row.

Heights are assumed uniform by default. A group header row lays out about a pixel taller than a
data row, which shifts the window's own rows by that much and nothing more — the spacers are
computed from the assumed height, and only the rendered rows are laid out, so the error is bounded
by the window rather than accumulating down the list.

`measure-rows` removes the assumption: every rendered row reports its real height, and the offsets,
the spacers and the scrollbar follow it. It costs one forced layout per update, on the rows in the
window, which is why it is opt-in — a uniform body is exact without it. A row that measures exactly
`row-height` is not recorded at all, so a body that turns out to be uniform anyway pays for the
measuring and nothing else. Measurements describe indices in a list, so they are dropped when the
list changes and taken again on the next render.

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
`Ctrl`/`Cmd`+`↑`/`↓` is what replaces it: one screenful of scroll, with the ring left where it was.
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

Selection used to be the exception that scaled with the *interaction* rather than with the data —
the header checkbox's tri-state asked "are all of these selected" over every row it was handed, and
virtual mode hands it the dataset. It now counts from the selection instead, so a click costs the
same at 100k as it does on a page of 25.

## Where you land when the list changes

Fold a band shut while scrolled deep and every row below it moves up by the height the band was
holding — 600k pixels, at 100k rows. The browser leaves `scrollTop` where it was, so the viewport
would silently be somewhere else in the data.

`VirtualBody` takes an `item-key` and anchors the offset to it. The row at the top of the viewport
goes back to the top of the viewport, down to the pixel it was scrolled past by; if that row was
*inside* the band that just closed, the nearest surviving item above it — the band's own header row
— takes the top instead, which is where "where did I go" ought to answer. The preset passes the
same key its `v-for` uses, so this is on by default.

`useVirtualRows` takes the same `itemKey` and does the arithmetic; without one it installs no
watcher at all and the offset stays a number of pixels.

## Composing your own

`useVirtualRows` is pure arithmetic over three numbers — item height, viewport height, scroll
offset — and knows nothing about tables:

```ts
import { useVirtualRows } from '@brillliand/vue-table-chad'

const virtual = useVirtualRows(items, { rowHeight: 38, viewportHeight: () => box.value?.clientHeight ?? 0 })
box.value.addEventListener('scroll', () => virtual.setScrollOffset(box.value.scrollTop), { passive: true })
```

It returns `start`, `end`, the windowed `items`, `spaceBefore`, `spaceAfter` and `totalSize`, plus
`offsetFor(index)`, `indexAt(offset)` and `measureItem(index, height)` — report a height and the two
lookups become a prefix sum and a binary search over it, which is why they were functions and the
spacers were opaque pixel totals from the start. Pass `itemKey` as well and the scroll offset follows the
item it pointed at when the list changes under it. `VirtualBody` is the `<tbody>` around it, and it yields
the window through its default slot rather than looping itself, so the markup for a row stays
yours.

---

Live: the **Virtual rows** tab of `pnpm demo` (`#virtual`). Back to the
[docs index](../README.md#docs).
