# Keyboard navigation

<script setup>
import Example from './.vitepress/examples/keyboard.vue'
</script>

<Demo :is="Example" />

<<< @/.vitepress/examples/keyboard.vue

A **cell cursor**: a focused cell you move with the arrow keys, ringed and crossed by a tint down
its column and across its row. On a table that can edit, `Enter` opens the cell's editor and
`Enter` again commits and opens the next cell down — so a column of numbers can be typed with
`Enter` alone, without reaching for the pointer.

```vue
<DataTable :columns="columns" :source="source" :state="state" :editing="editing" cell-cursor />
```

Off by default, and off means off: no `role="grid"`, no `tabindex`, no cursor attributes, and
editable cells keep the button that is their only keyboard route without one.

The editing session the cursor drives — drafts, validation, and what a save does — is
[Editing cells](editing.md); this page is only the navigation over it.

## The keys

| Key | |
| --- | --- |
| `↑` `↓` `←` `→` | one cell |
| `Home` / `End` | first / last column of this row |
| `Ctrl`+`Home` / `Ctrl`+`End` | first / last cell of the page |
| `PageUp` / `PageDown` | ten rows |
| `Ctrl`/`Cmd`+`←` / `→` | previous / next **page** |
| `Shift`+`←` / `→` | scroll one column sideways, cursor stays put |
| `Ctrl`/`Cmd`+`↑` / `↓` | scroll one screenful, cursor stays put |
| `Enter` / `F2` | open this cell's editor |
| any character | open the editor **holding that character** |
| `Delete` / `Backspace` | open the editor **empty** |
| `Ctrl`/`Cmd`+`C` | copy this cell's text |
| `Ctrl`/`Cmd`+`V` | paste into this cell, and save it |
| `Esc` | cancel the edit, and hand the focus back to the cell |

Copy and paste are the clipboard's own events rather than a key binding, so whatever gesture the
platform uses is the gesture that works, and inside an **open editor** both keep their ordinary
meaning: selecting part of the text and copying it is the browser's, not the table's.

Copy puts the text the cell *shows* on the clipboard — `column.format` and all — because that is
what the user is looking at. Paste is a typed edit that arrived all at once: the text goes through
the column's `parse` exactly as typing does, and the cell saves. A read-only cell refuses the paste
and does not claim the gesture; a value that fails validation leaves the editor open holding the
message, the same as any other failed save.

One cell, not a region: a pasted block would need a cell *range* to land in, and the cursor is a
single cell. A multi-line paste is stored as it arrived, minus the one trailing newline a
spreadsheet appends — a `textarea` column means its newlines.

And in an open editor:

| Key | |
| --- | --- |
| `Enter` | commit, and open the cell **below** |
| `Shift`+`Enter` | commit, and open the cell **above** |
| `Ctrl`/`Cmd`+`Enter` | commit, and open the cell to the **right** |
| `Ctrl`/`Cmd`+`Shift`+`Enter` | commit, and open the cell to the **left** |
| `↑` `↓` `←` `→` | commit, and move that way, leaving the destination closed |
| `Tab` | commit, and open the next editable cell |

`Enter` **opens the cell it lands on**, so a column of values is typed with `Enter` alone rather
than a keystroke between each: the gesture said this cell was finished, and the only thing left to
do in the next one is edit it. A destination with no editor — a read-only column, or a row the
session vetoes — is simply moved onto; the cursor goes where the key said and stops there rather
than hunting past it for the next editable cell.

The **arrows** land read-only instead. They commit for the same reason `Enter` does — an editor
opened by typing would otherwise be a cell there is no arrow out of — but an arrow is navigation
that happened to start inside an editor, and opening every cell it crosses would leave no way over
the table that is not an edit. Typing is what starts an edit on a cell you land on closed: the
character you type *replaces* the cell's value rather than being appended to it, and `Delete` or
`Backspace` opens the cell cleared instead. The clear is a draft like any other, so `Esc` puts the
value back and it is the commit that persists it. A `<select>` and a `<textarea>` keep their own arrows, since those
are how a select is changed at all and how a caret crosses a line — `Home` and `End` still reach
both ends of a text box. A commit the server refuses stays put — moving
would scroll the message explaining the failure out from under you.

`Enter` on a cell with **no** editor still moves down. Enter always means "move on", and
additionally opens an editor first when the cell has one. `F2` means only "edit", so a read-only
cell ignores it.

In a `<textarea>`, `Enter` and `Shift`+`Enter` insert the newline the control exists for and
neither commits; the `Ctrl`/`Cmd` pair carries the commit and still means **down** and **up** there
rather than right and left. A multi-line cell with no way to commit and move down would be missing
the gesture people actually use, so down is what its one modifier buys. Down and up are simply
unreachable from a textarea — a consequence of the control, not a second convention.

`PageUp`/`PageDown` move ten rows and stay on the page, which is what they mean in a spreadsheet;
`Ctrl`/`Cmd`+`←`/`→` turns the page itself. The modifier is the whole difference between "the next
column" and "the next page", the same split `Home` and `End` already use for "this row" against
"the whole table". Ten rows is a fixed count rather than the page size, because with `page-size:
100` and twelve rows visible a `PageDown` of 100 would put the cursor somewhere nobody can see.

Turning the page keeps the cursor's **offset and column**: the third row of page 2 becomes the
third row of page 3. Paging is reading, and the eye is already at a height on the screen — putting
the ring back at the top would cost a second gesture to get back to it. A short last page clamps,
and a page turn that cannot happen moves nothing at all. It works whether or not the pager is
rendered: a keyboard route that only exists when a control is on screen is not a keyboard route.

**Every** page change does this, not only the keyboard one. A click on the pager, a new page size,
and a `setPage` from your own code all restore the cursor the same way, and the focus follows it
onto the new cell — the cell the caret was on has left the document, and leaving the focus behind
strands a keyboard user on `<body>`. Only the *implicit* resets are left alone: a new filter, sort
or search sends the table back to page 1 without moving the cursor, because pulling the caret out of
the search box you are typing in is not a page turn.

`Shift`+`←`/`→` is the third meaning of the same pair of keys, and the only one that moves neither
the cursor nor the rows: it scrolls the **viewport** one column, and the ring stays exactly where it
was. That is the point of it. On a table wider than its box the far columns were otherwise reachable
only by walking the cursor onto them — losing your place — or by reaching for the scrollbar with the
pointer. A press snaps the next column's left edge flush against the scroll box, past the pinned
band rather than under it, and the last press of all goes to the far end rather than stopping short
of a column wider than the box. `Ctrl`/`Cmd`+`Shift`+`←`/`→` stays a page turn rather than becoming
a fourth thing.

`Ctrl`/`Cmd`+`↑`/`↓` is its vertical twin, and the gesture a **virtual** table was missing: with no
pages, `Ctrl`/`Cmd`+`←`/`→` has nothing to turn, and the bare arrows step one row through however
many rows there are. It scrolls one screenful and leaves the ring where it is — which is what
separates it from `PageUp`/`PageDown`, where the cursor moves ten rows and drags the viewport along
behind it. A screenful is the box's height less the sticky header, which covers the top of it
permanently, and less one row of overlap, so the row you were reading is still on screen afterwards.

`Shift`+`↑`/`↓` stays deliberately unclaimed. It is the spreadsheet gesture for extending a
selection, and spending it on scrolling would take the obvious binding away from a feature the table
may yet grow.

Whichever way it moves, the ring is scrolled into view — the *least* that works, and clear of the
sticky header and of either pinned band rather than underneath them. Pinned cells are
`position: sticky` and sit over the content, and a browser's own focus scroll neither knows that nor
acts on a cell that is only half covered, so the grid asks for the scroll itself and the preset
tells the stylesheet how wide the bands are.

`Alt` is left alone throughout. `Alt`+`←`/`→` is already the keyboard reorder gesture on a header
(see [Column layout](column-layout.md)), and in the body most browsers spend it on history
navigation.

## One tab stop, not one per cell

The grid uses a **roving tabindex**: exactly one cell carries `tabindex="0"` and every other cell
carries `-1`. Tab enters the table once and lands on the cursor; Tab again leaves it. Without a
cursor an editable cell is reachable only through the `<button>` inside it, which means one tab
stop per editable cell — with a cursor that button is gone, because the cell itself is the focus
target and a nested focusable inside a `gridcell` would be one stop too many.

A table nobody has clicked yet still needs a way in, so the first cell nominates itself as the tab
stop before any cursor exists. That is what `useCellCursor` does on its own, and what a
hand-assembled grid gets: the tab stop with no ring, because nothing has been focused and nothing
should claim to be.

`DataTable` goes one step further and starts the cursor on that first cell rather than leaving it
unset, so a table asked for a keyboard looks like it has one before you press a key. Silently —
the ring appears, the caret does not move, and the page you were on keeps it. Say where it should
start instead with `initial-cursor`:

```vue
<DataTable :columns="columns" :source="source" cell-cursor
           :initial-cursor="{ rowId: 42, columnId: 'salary' }" />
```

A row that is not on this page is not an error. The cursor keeps the position — the row may come
back when you page or re-filter — and the tab stop falls to the first rendered cell meanwhile.

On a page where the table *is* the point, `autofocus-cursor` hands it the caret on load, so the
arrow keys work on the first press with no Tab and no click:

```vue
<DataTable :columns="columns" :source="source" cell-cursor autofocus-cursor />
```

Off by default, and the default is the important half: a table that took the focus on mount would
scroll itself into view and swallow the first keystroke on every page where it is one thing among
several. It is asked for exactly once, and not until there is a cell to give the caret to — a
server source has none at mount — so a table still fetching its first page takes the focus when the
rows land rather than not at all. Once only: the re-filter three keystrokes later must not pull the
caret back out of the search box.

The cells get no `role` of their own. HTML-AAM already maps a `<td>` to `gridcell` rather than
`cell` once its table is exposed as a grid, so writing it per cell would add an attribute to every
cell on the page to say what the platform already says.

## Where the cursor is

A position is a **row id and a column id**, never a pair of indices:

```ts
interface CellPosition { rowId: RowId; columnId: string }
```

An index is meaningless the moment the table is re-sorted, re-filtered or paged. An id survives all
three, so the cursor stays on the row you put it on while that row moves under it — the same reason
[an open draft](https://bitbucket.org/BrilllianD/vue-table-chad/src/main/README.md) survives a re-sort. Sort by a column with the cursor set and watch the
ring travel with its row.

The cursor walks the rows **as rendered**, which matters as soon as anything is grouped: the source
returns a page in one order and the screen shows it banded in another. Arrow down through a band
boundary and the cursor steps from the last row of one band to the first row of the next, never
onto a band header — a header is not a row. A folded band's rows are not rendered at all, so the
cursor steps over the band rather than into it. Hidden columns and the columns a folded header band
is withholding are skipped for the same reason.

Movement **clamps**. It does not wrap, and it does not page: falling off the bottom of a page into
a fetch is a different feature with a different failure mode, namely rows that have not arrived yet.

## Building one yourself

`DataTable` takes a boolean because the cursor carries no callbacks — unlike an editing session,
there is nothing to configure. Assembling a table from primitives, build it directly:

```ts
const cursor = useCellCursor(renderedRows, visibleColumns, { getRowId })
```

Hand it to `<TableGrid>`, which owns the keyboard and the focus, and to each `<TableRow>`, which
marks its own cells:

```vue
<TableGrid :columns="columns" :cursor="cursor" @activate="onActivate">
  <tbody>
    <TableRow v-for="row in rows" :key="row.id" :row="row" :columns="columns" :cursor="cursor" />
  </tbody>
</TableGrid>
```

`rows` has to be the list you are actually rendering, in the order you are rendering it — that is
the one thing the composable cannot work out for itself, and it is why `TableRoot` builds its own
rather than accepting one.

`TableGrid` **reports** `activate` (Enter, `F2`, a printable key, a double-click) rather than
acting on it, because
opening an editor needs an editing session it may not have. It reports `page-move` for the same
reason: paging needs a data source and a query, and a grid that assumed one could not be used on
its own. `useCellCursor` never imports `useRowEditing` and never will: a cursor is useful on a
read-only table, and a table can edit with no cursor.

To take the cursor along with the page yourself, read the offset *before* the page changes — there
is nothing left to read it from afterwards — and hand it to `anchorAt`:

```ts
const offset = Math.max(0, cursor.rowOffset.value)
pagination.go(pagination.page.value + pages)
cursor.anchorAt(offset, cursor.columnId.value, { focus: true })
```

`anchorAt` waits for the rows if they are not there yet, which is what makes the same three lines
work against a server source that has to fetch the page first.

The pure half is exported too, for a key map of your own:

```ts
cursorMoveFor(event)              // what a key press asked for, or undefined
commitMoveFor(event, editorKind)  // where an Enter that commits should land
pageMoveFor(event)                // -1, 1, or undefined — a page turn
scrollMoveFor(event)              // -1, 1, or undefined — a sideways scroll
viewportMoveFor(event)            // -1, 1, or undefined — a screenful of scroll
nextPosition(from, move, rowIds, columnIds)   // where that lands, clamped
nextScrollLeft(scrollLeft, inset, boundaries, direction, maxScrollLeft)  // and where that does
nextScrollTop(scrollTop, viewportHeight, maxScrollTop, direction, inset, rowHeight)
```

The five decoders are exclusive: no gesture is claimed by more than one, which is why a caller can
try them in any order and act on the first that answers. `tests/cellCursor.spec.ts` proves it by
running every key against every combination of modifiers and failing if two of them answer.

`nextScrollLeft` is the arithmetic behind `scrollMoveFor` with the DOM taken out of it. `boundaries`
are the left edges of the columns that actually scroll and `inset` is the width of the left-pinned
band, both measured by the caller — declared widths part company with rendered ones as soon as a
`<colgroup>` carries a column the caller did not declare, which is exactly what the preset's
selection and actions columns are.

`nextScrollTop` is the same for the vertical gesture: a step is the viewport less `inset` — the
sticky header, which sits over the top of the scrollport — less one row of overlap, clamped at both
ends, and `undefined` when the box is already there.

`cursorMoveFor` takes a structural gesture rather than a `KeyboardEvent`, so a key table can be
tested with a plain object and with no DOM at all.

## What it costs

Nothing the row pipeline can see. Moving the cursor is layout, like a resize or a pin: it writes
one `shallowRef` and reads two lists that are already page-sized. `tests/invalidation.spec.ts`
asserts all four O(dataset) counters stay at zero across an arrow, a `Home`/`End`, a `PageDown` and
a `Ctrl`+`End`, and that a re-sort under a set cursor still costs exactly one sort pass. Turning
the page with `Ctrl`+`←`/`→` costs what turning it by the pager costs — it is the same `setPage`,
and the suite says so rather than assuming it.

The two scroll gestures cost less still: they write no reactive state at all. `Shift`+`←`/`→` and
`Ctrl`/`Cmd`+`↑`/`↓` each end in one assignment to the scroll box, and a press that would land where
the box already is writes nothing — so holding either key at the end of its travel costs no scroll
events either.

Within the page, a row subscribes to two *fields* of the cursor rather than to its position, so a
vertical move leaves them identical for every row but two and the rest stop at a string compare.

## Styling

The ring and the crosshair are `--vtc-*` variables like everything else — see
[Styling](styling.md#the-cell-cursor).

Live: the **Cell cursor** tab of `pnpm demo` (`#cursor`). Back to the [docs index](/).
