# Header bands

<script setup>
import Example from './.vitepress/examples/column-groups.vue'
</script>

<Demo :is="Example" />

<<< @/.vitepress/examples/column-groups.vue

Columns can sit under a shared header, nested as deep as you like, with a control on each band
that folds it down to a single column.

A column names its band by id, and the band defs supply the label and the behaviour:

```ts
const columns: ColumnDef<Employee>[] = [
  { id: 'name',    header: 'Name',    group: 'identity' },
  { id: 'email',   header: 'Email',   group: 'identity' },
  { id: 'city',    header: 'City',    group: 'location' },
  { id: 'country', header: 'Country', group: 'location' },
  { id: 'tags',    header: 'Tags' },   // in no band
]

const columnGroups: ColumnGroupDef[] = [
  { id: 'identity', header: 'Identity' },
  { id: 'location', header: 'Location', collapseTo: 'country' },
]
```

```vue
<DataTable :columns="columns" :column-groups="columnGroups" :source="source" />
```

```
| Identity        | Location          |      |
| Name   | Email  | City   | Country  | Tags |
```

`tags` is in no band, so it spans both header rows and reaches the body from the first.

## Why the ids are flat

`ColumnDef.group` is a string, not a nested `columns: [...]` array. Every other part of the
library — `filterRows`, `sortRows`, `buildGroupTree`, `columnStorage`, `useColumnDnd` — indexes
columns by id and walks one flat list. Nesting the declarations would have meant flattening them
again in each of those, which is five places to get it wrong for one place it reads nicer.

`columnGroups` is optional. A band exists because a column claims it; declaring one gives it a
readable header, a parent and a fold. A `group` naming no declared band still bands, headed by
the raw id — so a typo shows up on screen rather than silently dropping a header.

## Nesting

A band nests by naming a `parent`, and each level adds a header row:

```ts
const columnGroups: ColumnGroupDef[] = [
  { id: 'record', header: 'Employment record' },
  { id: 'pay',    header: 'Pay', parent: 'record', collapseTo: 'salary' },
]
```

```
| Employment record          |
| Pay              | Hired   |
| Salary | Rating  |         |
```

## Folding a band

Every band gets a caret unless it declares `collapsible: false`, and **the whole band cell folds
it** — clicking the label or the space around it does what the caret does. A click that starts
inside a control of its own is left to that control, and a band offering no caret ignores its cell's
clicks entirely.

With the [cell cursor](keyboard.md) on, `=` folds the band over the cursor's column without
leaving the body, and `+` (`Shift`+`=`) opens every band. The gesture acts on the
innermost band and unfolds before it folds, so one key closes a band and reopens it from the column
the fold left standing.

Folding is also reachable from the composable, which is where the state lives:

```ts
const columns = useColumns(defs, { groups: columnGroups })

columns.toggleGroup('location')         // fold or unfold
columns.toggleGroup('location', true)   // fold, whatever it was
columns.isGroupCollapsed('location')
columns.collapseAllGroups()
columns.expandAllGroups()
```

**A folded band always leaves one column standing** — the one it declares as `collapseTo`, or
its first member in *declared* order when it declares none. Declared, not display, order: a band
that showed a different column after a drag would be a poor place to have put your eyes.

That guarantee is not cosmetic. Folding is a plain subtraction from `useColumns().visible`, and
that one list is what the header, the `<colgroup>`, every body row and the footer all read. A
band that could fold to nothing would need a synthetic placeholder column threaded through all
four; a band that always keeps one needs nothing at all. It also means folding costs the row
pipeline nothing — no filter pass, no sort pass, exactly like pinning or resizing a column.

Two things a fold will not do:

- **It will not withhold a column declaring `hideable: false`.** Such a column is the row's
  identity, and a band is no more entitled to take it away than the column menu is.
- **It will not resurrect a column the user hid.** `ResolvedColumn` carries `collapsed`
  separately from `visible` for exactly this: one is the band's current posture, the other is
  the user's verdict, and unfolding restores only the former.

## Persistence

`collapsedGroups` is the fifth field of `ColumnLayoutState`, so `storageKey` remembers folds
alongside visibility, order, widths and pins:

```vue
<DataTable … storage-key="employees:layout" />

<!-- remember the folds but not the widths -->
<DataTable … storage-key="employees:layout"
  :storage-fields="['hidden', 'order', 'pinned', 'collapsedGroups']" />
```

## Styling a band

A vertical rule marks where each band's run of columns ends, drawn the full height of the table.
It is on by default and lives on two variables — see [Band rules](styling.md#band-rules) for the
whole-table version. One band can also dress itself:

```ts
const columnGroups: ColumnGroupDef[] = [
  {
    id: 'record',
    header: 'Employment record',
    background: 'rgb(249 115 22 / 0.14)',   // the band's header cell
    borderColor: 'rgb(249 115 22)',         // the rule where the band ends
    borderWidth: '2px',
    class: 'band-record',                   // header cells only
  },
]
```

The first three reach the cells as custom properties — `--vtc-column-bg`, `--vtc-band-border-color`,
`--vtc-band-border-width` — never as an inline `background` or `border`, which would outrank every
state rule and leave that cell or that edge dead to hover, selection and the cursor. It also means
the stylesheet keeps ownership of *whether* the rule is drawn at all: a band naming a colour still
disappears under `--vtc-band-border-width: 0px` on the table.

`class` is the one that stops at the header. A `<td>` belongs to a column and knows nothing about
the bands above it, so a class has nowhere to land in the body; `borderColor` does, because by the
time it reaches a cell it is a colour rather than a band.

The rule belongs to the band that **ends** at a boundary. Where none does — an unbanded column with
a band beginning to its right — the band that begins owns it instead, so the edge still has a def to
read from.

## Bands and pinned columns

`useColumns().visible` hoists left-pinned columns to the front and right-pinned ones to the
back. A band whose members end up on both sides of that boundary is already two runs on screen,
so it renders as two spanning cells carrying the same label — a single cell would have to
stretch across the scroll gap between them. A band split by a drag renders the same way: the
header describes the order that exists rather than fighting it.

Column reordering is unconstrained by bands for the same reason. Dragging a column out of its
band is allowed, and the header simply redraws to say so.

## Building a header yourself

The header shape is a pure function, exported from core and usable with no component at all:

```ts
import { buildHeaderRows, columnBandEdges, columnGroupPath } from '@brillliand/vue-table-chad'

const rows = buildHeaderRows(columns.visible.value, columnGroups)
// rows[0] → [{ kind: 'group', group, colspan, columns, … }, { kind: 'column', column, rowspan, … }]

const edges = columnBandEdges(columns.visible.value, columnGroups)
// Map { 'email' → { depth: 0 }, 'country' → { depth: 1 } }
```

Each cell is either a band's spanning cell or a column's own, and `rowspan` is already worked
out — a column shallower than the deepest band spans down to the body from where it sits.
`buildHeaderRows` knows nothing about collapse: a folded band has already removed its columns
from the list you hand it, so the builder only ever describes what is in front of it.

`columnBandEdges` answers the other half: which column each vertical rule falls to the right of,
and the nesting depth of the band that stops there. A boundary is a property of a *position* in
the visible order rather than of a column, which is why it is a map — and why reading the visible
order is what keeps a band split by a pin or a drag from drawing a rule inside itself.
`useColumns().bandEdges` is this same call, made for you.

`<TableRoot>` exposes both as `headerRows` and `bandEdges` slot props, and `<TableHeaderGroupCell>`
renders one band cell given nothing but the cell itself.

Live: the **Header bands** tab of `pnpm demo` (`#header-groups`). Back to the [docs index](/).
