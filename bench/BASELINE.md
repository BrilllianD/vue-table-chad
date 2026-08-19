# Baseline — before Phase 1

Mean milliseconds per operation, `pnpm bench`, commit `7909bd4` (P1-1). Lower is better.
Machine-specific: re-run on your own hardware before reading any delta as a win.

## What an interaction costs

The load-bearing table. A table with a filter and a sort applied, 10k rows, page size 25.

| Interaction | Now | Should be | Why |
| --- | ---: | ---: | --- |
| `setPage` | **13.2** | ~0 | Redoes the whole filter and the whole sort to slice 25 rows (P1-4) |
| `setPage`, grouped 2 levels | **33.7** | ~0 | The above, plus a re-count and a re-aggregate of the dataset (P1-4, P1-6) |
| group collapse toggle | **3.7** | ~0 | Re-counts every filtered row because `totals` is read inside `displayRows` (P1-6) |
| one search keystroke | 21.8 | 21.8, but once per burst | The work is real; paying it per keystroke is not (P1-5) |
| `toggleSort` on text | 9.6 | 9.6 | Legitimate — a sort was asked for |
| selection toggle | 0.009 | — | Already right: `Set`-backed, one write per range |
| column resize | 0.070 | — | Already right: never reaches the pipeline |

Three of the top four rows are work nobody asked for.

## What the pure functions cost

| | 10k | 100k |
| --- | ---: | ---: |
| `filterRows`, nothing set (a full array copy) | 0.013 | 0.28 |
| `filterRows`, one values filter | 1.84 | 21.9 |
| `filterRows`, global search over 9 columns | **35.6** | **349** |
| `sortRows`, one text column (`Intl.Collator`) | 25.8 | 284 |
| `sortRows`, one number column | 14.0 | 227 |
| `sortRows`, three columns, mixed types | 37.6 | 543 |
| `computeFacets`, enum column | 2.37 | 24.7 |
| `computeFacets`, narrowed by another filter | 3.31 | 33.7 |
| `flattenGroups`, one level | 4.20 | 61.6 |
| `flattenGroups`, two levels | 6.39 | 96.7 |
| `countGroups`, two levels | 6.86 | 68.1 |
| `aggregateGroups`, two levels | **34.3** | **383** |

Two outliers stand out, and both have a named cause in the plan:

- **Global search is ~2700× the cost of no filter at 10k.** It allocates an array per row and calls
  `column.format` per row per searched column (`src/core/filters/facets.ts:46-49`) — P1-10.
- **Aggregation is ~5× flattening at the same depth.** It re-buckets the dataset by every prefix of
  the group path and reduces each bucket (`src/core/aggregation.ts:126-158`) — and under
  `groupMode: 'client'` nothing asks for it at all.

## Reading these honestly

`bench/` measures JavaScript. It does not measure layout, paint, or Vue's patch — `PerfView` (P1-9)
exists for that. A win here is necessary for a table that feels fast, and nowhere near sufficient.
