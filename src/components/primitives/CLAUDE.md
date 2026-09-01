# src/components/primitives

Headless, slot-driven components. **No CSS of their own.**

## Primitives ship no stylesheet

They emit class names and `data-*` attributes and nothing else. Using only primitives must pull in
zero CSS; that is what "headless" buys. The theme lives in `preset/`.

## Every primitive works standalone

Given explicit props, a primitive must render with no `<TableRoot>` above it. The specs assert this
with a "renders standalone, with no table context above it" case — `TableRow`,
`TableHeaderGroupCell` and `TableGrid` among them.

`tests/tableGrid.spec.ts` carries that case and also pins the other half of `TableGrid`'s contract:
**with no `cursor`, off means off** — no `role="grid"`, no `tabindex`, and none of the three gestures
reported.

## Which side a primitive is on is declared in code

`useTableContext()` returns `undefined` when there is no root, and is what an optional consumer
calls. **`requireTableContext(name)` throws, and marks the three primitives that genuinely cannot
work without a root** — `ColumnVisibilityMenu`, `RowGroupMenu` and `ActiveFilters`, each of which
reads the whole column, group or filter model rather than taking it as props. Adding a fourth means
adding a demo note saying so.
