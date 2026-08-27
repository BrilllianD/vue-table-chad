# Editing cells

```ts
const rows = shallowRef(employees)
const state = useTableState({ pageSize: 20 })
const source = useLocalDataSource(rows, columns, state.query)

const editing = useRowEditing(source, columns, {
  save: ({ id, patch }) => api.patchEmployee(id, patch),
  apply: (next) => { rows.value = replaceRowIn(rows.value, next, (row) => row.id) },
})
```

```vue
<DataTable :columns="columns" :source="source" :state="state" :editing="editing" />
```

Editing is two halves that meet in the middle. A **column** says whether its cells can be written
and how — `editable`, `setValue`, `parse`, `validate`. A **session** (`useRowEditing`) holds one
draft per row, checks it, sends it, and writes the answer back. `DataTable` renders the halves;
`CellEditor` is the control it renders them with, and is usable on its own.

Without an `:editing` session every cell is read-only and the table costs exactly what it always
did. Editing is the one column capability that defaults to **off**: `sortable` and `filterable`
default on because they cannot damage anything, and a table that silently became writable would be
a different promise.

## The column half

```ts
{
  id: 'email',
  header: 'Email',
  type: 'text',
  editable: true,
  validate: (value) =>
    /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(value)) ? null : 'Not an email address',
}
```

| Field | Meaning |
| --- | --- |
| `editable` | `true`, or a per-row predicate — a closed record or a row the user does not own can refuse. Absent means read-only. |
| `setValue(row, value) => TRow` | Writes the value back, returning the **next row** rather than mutating this one. Defaults to `{ ...row, [id]: value }`. |
| `parse(input, row)` | Turns what the editor produced into the column's value. Defaults from `type`. Return `undefined` for "will not parse"; `null` is a legitimately blank cell. |
| `validate(value, row)` | A message, or `null`. Runs against the **parsed** value, so it never re-does the coercion. |
| `required` | Rejects a blank, through the same `isBlank` that buckets blanks for filtering. |
| `editor` | Overrides which control renders. Otherwise derived from `type` and `options`. |

**A column with an `accessor` must declare `setValue`.** A function cannot be run backwards, so a
column reading `row.location.city` has to say where the edit lands; guessing `row.city` would put
the value somewhere nothing reads it back from. `applyCellValue` throws rather than guess:

```ts
{
  id: 'city',
  accessor: (row) => row.location.city,
  editable: true,
  setValue: (row, value) => ({ ...row, location: { ...row.location, city: String(value ?? '') } }),
}
```

### Which control a column gets

`editorFor(column)` decides, and `column.editor` overrides it.

| Column | Control (`CellEditorKind`) |
| --- | --- |
| `type: 'number'` | `number` — `step="any"`, because nothing in `ColumnDef` declares a precision |
| `type: 'date'` | `date` |
| `type: 'boolean'` | `checkbox` |
| `type: 'enum'` with `options` | `select`, with a blank choice unless the column is `required` |
| `type: 'enum'` without `options` | `text` — a text box beats an empty dropdown |
| anything else | `text` |

`textarea` exists but is never derived; ask for it with `editor: 'textarea'`.

## The session half

```ts
const editing = useRowEditing(source, columns, options)
```

| Option | Default | What it is for |
| --- | --- | --- |
| `save(change)` | *required* | Persists one row. Reject to fail the save. |
| `apply(next, previous)` | `source.refresh()` | Writes the saved row back into the data, because the table does not own it. |
| `mode` | `'cell'` | `'cell'` or `'row'`. Takes a ref or getter, so a table can switch without remounting. |
| `getRowId(row)` | `row.id` | Stable identity. Drafts are keyed by it. |
| `optimistic` | `false` | Apply before the server answers, and roll back if it refuses. |
| `isEditable(row)` | — | Rows the user may not edit at all, whatever their columns say. |
| `validate(next, draft)` | — | The cross-field rule, handed the row **as it would be**. Return per-field messages, a string, or `null`. |
| `mapError(error)` | reads `error.fields` / `error.message` | Turns a rejection into messages. |
| `onSaved(row)`, `onError(error, row)` | — | Callbacks, mirrored by `DataTable`'s `@rowSaved` / `@rowSaveError`. |

What comes back:

| Member | |
| --- | --- |
| `drafts` | `ShallowRef<Map<RowId, RowEditState>>` — open drafts, replaced rather than mutated. |
| `mode`, `saving`, `editingIds` | The session's mode, whether any row is in flight, and which rows hold a draft. |
| `begin(row, columnId?)` | Opens a draft, optionally naming the cell to focus. |
| `setValue(row, column, input)` | Records the raw input *and* its parsed value, clearing that cell's message. |
| `commit(row)` | Validates, saves, applies. Resolves `true` only when the row was persisted. |
| `cancel(row)`, `cancelAll()` | Throws the draft away and aborts a save in flight. |
| `isEditing(id, columnId?)`, `isEditable(row, column)`, `isDirty(id)` | The cell predicates a renderer asks. |
| `inputFor(row, column)` | What the editor should show: the raw input if touched, else the cell value. |
| `valueFor(row, column)` | What the cell would hold if the draft were applied. |
| `errorFor(id, columnId?)` | A cell's message, or the row's when no column id is given. |
| `stateFor(id)`, `getRowId` | The raw `RowEditState`, and the id function in use. |

Drafts are keyed by row id rather than by position, which is what lets one survive a re-sort, a
re-filter or a page change while it is open — the row moves and the edit goes with it.

`begin` enforces the *row* veto but not the *column* one, and cannot: the composable holds no
column list, only the defs it is handed one at a time. The column gate lives in the preset, next to
the columns it reads.

### Two modes

**`'cell'`** — one cell holds an editor. Enter or Tab commits it, clicking away commits it, and
there are no Save/Cancel buttons because Enter and Escape are the whole interface. The table keeps
the width it had.

**`'row'`** — every editable cell in the row opens at once behind one Save, and `DataTable` adds a
trailing actions column to hold Save, Cancel and the row-level message. Moving between the row's
fields is navigation, not a decision to save: blur commits nothing, and Tab is left to reach the
next field on its own rather than being intercepted.

The session owns the mode, which is why `DataTable` has no `editMode` prop to disagree with it.

## Saving

`save` is handed a `RowChange`:

```ts
interface RowChange<TRow> {
  id: RowId
  row: TRow                        // as it is now
  patch: Record<string, unknown>   // only what changed, by column id, already parsed
  nextRow: TRow                    // patch applied through each column's setValue
  signal: AbortSignal              // aborted if the edit is taken back
}
```

`patch` is detached from the reactive draft before it crosses into your code, so a `save` can hold
it or serialise it without it shifting underneath.

**The server's row wins when it sends one back.** Return a row from `save` and that is what gets
applied — a normalised value or a field only the server can compute arrives in one visible change.
Returning nothing applies `nextRow`. This is the reason `optimistic` is off by default: waiting
costs a round trip but changes the cell once instead of twice.

### Writing the row back

`apply` exists because the table does not own the data. The default, `source.refresh()`, is right
for a server source — it refetches and the new row arrives. A **local** source holds the array you
gave it and cannot see a change you have not made, so replace the row:

```ts
apply: (next) => { rows.value = replaceRowIn(rows.value, next, (row) => row.id) }
```

`replaceRowIn` returns a *copy* with the row swapped, and returns the original array untouched when
the id is not there. The copy is the point: row data belongs in a `shallowRef`, which notices a
reassignment and nothing else, so writing the row in place would leave the table showing the old
one.

### When a save is refused

Reject, and the draft stays exactly where it was — the same Save is the retry. `mapError` unpacks
the rejection into a `RowSaveFailure`:

```ts
throw { message: 'Could not save employee', fields: { email: 'Already taken' } }
```

The message lands on the row and `'Already taken'` lands on that cell — the same slot a validator's
message would occupy. The default `mapError` duck-types `fields` and `message`, because the common
case is not an `Error` at all but a parsed response body thrown as it arrived. A rejection carrying
neither falls back to `SAVE_FAILED_MESSAGE` (`'Could not save'`); a blank `required` cell reports
`REQUIRED_MESSAGE` (`'Required'`).

Validation runs field rules first and stops the draft dead if any fails, so the cross-field rule is
only ever handed a row it could actually be given — and a value that did not survive validation is
never written, not even into a throwaway copy.

Only the newest save for a row may finish: `commit` refuses to start a second save for a row
already saving, and every other route to a new save goes through the close path, which aborts
first. A straggler resolving late finds `signal.aborted` and does nothing.

## The keyboard

Inside an open editor, `CellEditor` is the only component in the library that handles Enter and
Tab:

| Key | |
| --- | --- |
| `Enter` | commit, and move down (`Shift`: up) |
| `Ctrl`/`Cmd` + `Enter` | commit, and move right (`Shift`: left) |
| `Esc` | cancel, putting the cell back and handing focus to the cell itself |
| `Tab` | commit, and open the next editable cell (`Shift`: the previous one) |
| blur | reported, not decided — a commit in cell mode, nothing in row mode |

In a `textarea` both `Enter` and `Shift+Enter` insert the newline the control exists for, so the
`Ctrl`/`Cmd` pair carries the commit there and keeps meaning *down* and *up* rather than right and
left. That follows from the control, not from a second convention.

A commit the server refuses **stays put**: moving would scroll the message explaining the failure
out from under the user. The cell you land on is left read-only rather than opened, which is what a
spreadsheet does — you land there, and typing is what starts the next edit.

Opening a cell from the *outside* — `Enter` or `F2` on a closed cell, arrow keys between them — is
the cell cursor's job, and is covered in [Keyboard navigation](keyboard.md). Without a cursor,
every editable cell carries a `<button>` instead, because a cell you can only reach with a pointer
is a cell half your users cannot edit at all. With a cursor that button is gone: the `<td>` is
itself the focus target, and a second tab stop per editable cell is exactly what a roving tabindex
exists to avoid.

## What `DataTable` adds

| | |
| --- | --- |
| `:editing` | The session. Absent means every cell is read-only. |
| `@rowSaved="(row) => …"` | A row reached the server, carrying the row as it now stands. |
| `@rowSaveError="(row, error) => …"` | A save was refused. |
| `#editor:<id>` | Replaces the control for one column. Handed `value`, `error`, `disabled`, `kind`, `update`, `commit`, `cancel`, plus `row` and `column`. |
| `#cell:<id>` | The read-only rendering, still yours — it renders *inside* the edit trigger rather than replacing it. |
| `#rowActions` | Replaces Save/Cancel in row mode. Handed `row`, `state` and `editing`. |

A row with nothing open is not a save. `DataTable` guards on that before emitting `rowSaved`,
which is what stops a stray blur — Enter commits, the draft closes, the editor unmounts, and the
blur arrives with the draft already gone — from reporting a second save for a row already saved.

## Using `CellEditor` on its own

Standalone like every primitive: given a `column`, a `value` and a listener it needs no
`<TableRoot>` above it.

```vue
<CellEditor
  :column="column"
  :row="row"
  :value="editing.inputFor(row, column)"
  :error="editing.errorFor(editing.getRowId(row), column.id)"
  @update:value="editing.setValue(row, column, $event)"
  @commit="editing.commit(row)"
  @cancel="editing.cancel(row)"
/>
```

| Prop | Default | |
| --- | --- | --- |
| `column` | *required* | Decides the control, the label, the options. |
| `value` | *required* | What to show. Usually the draft's raw input, falling back to the cell. |
| `row` | — | For a slot that needs it. Not read by the default controls. |
| `error` | `null` | Announced through an element of its own and mirrored into `title`, because `.vt-td` clips and a message under the input would be sheared off. |
| `disabled` | `false` | |
| `autofocus` | `true` | Focus the control as soon as it renders. |
| `label` | column header | Labels the control for assistive tech. |
| `trapTab` | `true` | Take Tab over and report it as `move`. Off in row mode, where Tab already reaches the next editor. |

| Event | |
| --- | --- |
| `update:value` | The raw input, unparsed. |
| `commit(next?)` | Finish, and — when the gesture named one — the `CursorMove` the cursor should make. The direction rides on `commit` rather than on an event of its own because the two must be sequenced: a failed commit must not move anyone. |
| `cancel` | |
| `move(delta)` | Tab: `1` forward, `-1` back. Only when `trapTab`. |
| `blur` | Focus left. What that means is the table's decision, not the cell's. |

The default slot replaces the control entirely and is handed `value`, `error`, `disabled`, `kind`,
`update`, `commit` and `cancel` — enough to behave the same way.

## The pure functions

`core/editing.ts` is the write half of a column, with no reactivity and no components, so the same
rules hold whether a cell is edited through `useRowEditing` or by hand:

`editorFor`, `isColumnEditable`, `parseCellInput`, `validateCell`, `validateDraft`,
`applyCellValue`, `applyPatch`, `replaceRowIn`.

Two conventions run through all of them. **`undefined` means "will not parse"; `null` means
"blank"** — clearing a cell is a legitimate edit, typing `abc` into a number column is not. And
**nothing mutates a row**: `applyCellValue` and `applyPatch` return the next row, because rows are
handed out by reference and a caller's `shallowRef` only notices a replacement.

## What it costs

Nothing here touches the data pipeline. Opening a draft, typing into it, a draft that fails
validation and a save the server rejects all leave `filterRows`, `sortRows` and the aggregates
entirely alone; only a *successful* save moves rows, and it redoes the pipeline exactly once.
`tests/invalidation.spec.ts` pins that.

The draft store is a `shallowRef` around a `Map` of `reactive` states, and the split is the whole
performance story: the Map's identity changes only when a row opens or closes a draft, so a
keystroke does not invalidate every cell in the table, while the one row being typed into is deeply
reactive and re-renders on its own. Plain objects in the shallowRef would re-render all `pageSize`
rows per character; a deep `ref` would proxy every draft value twice over.

Styling hooks: `.vt-cell-editor[data-invalid]`, `.vt-cell-input`, `.vt-cell-checkbox`,
`.vt-cell-trigger`, `.vt-cell-editable`, `.vt-row-actions`, `.vt-row-error`, and
`.vt-tr[data-row-state]` — `dirty`, `saving` or `error`, drawn as a stripe down the row's leading
edge rather than a background, so it does not have to win against the stripe, tint, hover and
selection layers `.vt-td` already composes.

---

Live: the **Editing** tab of `pnpm demo` (`#editing`). Back to the [docs index](../README.md#docs).
