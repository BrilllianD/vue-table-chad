# Keyboard navigation

A **cell cursor**: a focused cell you move with the arrow keys, ringed and crossed by a tint down
its column and across its row. On a table that can edit, `Enter` opens the cell's editor and
`Enter` again commits and steps on — so a column of numbers can be typed without reaching for the
pointer.

```vue
<DataTable :columns="columns" :source="source" :state="state" :editing="editing" cell-cursor />
```

Off by default, and off means off: no `role="grid"`, no `tabindex`, no cursor attributes, and
editable cells keep the button that is their only keyboard route without one.

## The keys

| Key | |
| --- | --- |
| `↑` `↓` `←` `→` | one cell |
| `Home` / `End` | first / last column of this row |
| `Ctrl`+`Home` / `Ctrl`+`End` | first / last cell of the table |
| `PageUp` / `PageDown` | ten rows |
| `Enter` / `F2` | open this cell's editor |
| `Esc` | cancel the edit, and hand the focus back to the cell |

And in an open editor:

| Key | |
| --- | --- |
| `Enter` | commit, and move **down** |
| `Shift`+`Enter` | commit, and move **up** |
| `Ctrl`/`Cmd`+`Enter` | commit, and move **right** |
| `Ctrl`/`Cmd`+`Shift`+`Enter` | commit, and move **left** |
| `Tab` | commit, and open the next editable cell |

The destination is left read-only rather than opened. That is what a spreadsheet does: you land
there, and typing is what starts the next edit. A commit the server refuses stays put — moving
would scroll the message explaining the failure out from under you.

`Enter` on a cell with **no** editor still moves down. Enter always means "move on", and
additionally opens an editor first when the cell has one. `F2` means only "edit", so a read-only
cell ignores it.

In a `<textarea>`, `Enter` and `Shift`+`Enter` insert the newline the control exists for and
neither commits; the `Ctrl`/`Cmd` pair carries the commit and still means **down** and **up** there
rather than right and left. A multi-line cell with no way to commit and move down would be missing
the gesture people actually use, so down is what its one modifier buys. Down and up are simply
unreachable from a textarea — a consequence of the control, not a second convention.

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
stop before any cursor exists. It takes the tab stop and draws no ring: nothing has been focused,
so nothing claims to be.

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
[an open draft](../README.md) survives a re-sort. Sort by a column with the cursor set and watch the
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

`TableGrid` **reports** `activate` (Enter, `F2`, a double-click) rather than acting on it, because
opening an editor needs an editing session it may not have. `useCellCursor` never imports
`useRowEditing` and never will: a cursor is useful on a read-only table, and a table can edit with
no cursor.

The pure half is exported too, for a key map of your own:

```ts
cursorMoveFor(event)              // what a key press asked for, or undefined
commitMoveFor(event, editorKind)  // where an Enter that commits should land
nextPosition(from, move, rowIds, columnIds)   // where that lands, clamped
```

`cursorMoveFor` takes a structural gesture rather than a `KeyboardEvent`, so a key table can be
tested with a plain object and with no DOM at all.

## What it costs

Nothing the row pipeline can see. Moving the cursor is layout, like a resize or a pin: it writes
one `shallowRef` and reads two lists that are already page-sized. `tests/invalidation.spec.ts`
asserts all four O(dataset) counters stay at zero across an arrow, a `Home`/`End`, a `PageDown` and
a `Ctrl`+`End`, and that a re-sort under a set cursor still costs exactly one sort pass.

Within the page, a row subscribes to two *fields* of the cursor rather than to its position, so a
vertical move leaves them identical for every row but two and the rest stop at a string compare.

## Styling

The ring and the crosshair are `--vt-*` variables like everything else — see
[Styling](styling.md#the-cell-cursor).

See it running in the demo's **Cell cursor** view.
