# Performance

No file-backed example on this page. A measurement taken inside a docs page would report the docs
page — its own Vue instance, its own layout, VitePress's own chrome around it — rather than the
table. Numbers you can trust live in `pnpm demo`'s **Performance** tab (`#perf`) instead: see
[What the browser measures](#what-the-browser-measures) below for why, and run it yourself.

## Hold rows in a `shallowRef`

The single highest-leverage line in every example on this site:

```ts
const rows = shallowRef(people)   // not ref(people)
```

`ref(people)` deep-proxies the array *and* every row object in it. Filtering, sorting, grouping and
aggregating each read every cell through a Proxy trap — once per row per column per pass, which at
10k rows and ten columns is 100 000 trap hits for one keystroke. `shallowRef` proxies the array
reference alone and hands the pipeline the raw objects.

You give up nothing the table uses. It never mutates a row, and it re-runs whenever the ref is
*reassigned*:

```ts
rows.value = [...rows.value, newPerson]   // seen
rows.value.push(newPerson)                // not seen — call source.refresh()
```

Measured at 10k rows (`bench/BASELINE.md`, "What holding rows in a `ref` costs"):

| | `ref` | `shallowRef` |
| --- | ---: | ---: |
| `filterRows` with a global search | 49.2ms | 30.8ms |
| `sortRows` on one text column | 29.1ms | 15.1ms |

Between 1.6× and 1.9×, for one word in the caller's code.

## The invalidation invariants

`tests/invalidation.spec.ts` wraps the five dataset-wide functions — `filterRows`, `sortRows`,
`countGroups`, `flattenGroups`, `aggregateGroups` — and asserts what each interaction is and is not
allowed to move. A failure there is a broken feature, not a slow one: see `CLAUDE.md`, "Performance
invariants" for the full list. The two easiest to break by accident, doing something that looks
harmless:

- **Paging redoes nothing.** No filter pass, no sort pass — see
  [Sorting and pagination](sorting-and-pagination.md#pagination). This broke once because minting a
  fresh query object per write invalidated every stage on every change; stages depend on query
  *fields*, not on the object's identity.
- **Scrolling a virtual window redoes nothing.** `virtual` is a page size of *everything* — see
  [Virtual rows](virtualization.md) — so each pipeline stage it must not trigger would otherwise run
  over the whole dataset on every scroll event, not just on a page turn.

Two habits keep the pipeline honest, both from `CLAUDE.md`:

- **Derive per row, not per comparison.** Comparisons run `O(n log n)` times; cells number `n`.
  `sortRows` projects sort keys once per row for this reason — deriving them inside a comparator
  cost 93ms sorting 10k dates before P1-10 (`bench/BASELINE.md`, "Where the sort win came from").
- **Row data belongs in a `shallowRef`.** Covered above.

## The benchmark numbers, and what they ruled out

`bench/fixtures.ts` holds the whole workload — rows *and* columns — so a bench number describes the
same table `pnpm demo` renders. `bench/pipeline.bench.ts` measures the pure functions at 10k and
100k; `bench/reactive.bench.ts` measures what one *interaction* costs, which is the more important
question day to day. Full numbers live in `bench/BASELINE.md`; the shape worth remembering:

| Interaction | Before P1 | Now |
| --- | ---: | ---: |
| `setPage` | 13.2ms | 0.004ms |
| search keystroke | 21.8ms | 0.006ms (coalesced; the pass itself still costs ~19ms) |
| `toggleSort` on text | 9.6ms | 4.3ms |

Three of the historical top four costs were work nobody asked for — a full re-filter-and-sort on
`setPage`, an uncoalesced pass per keystroke, a full re-count on every group-collapse click. All
three are gone; the invariants above are what keeps them gone.

**Record what you measured and rejected, too** — "we measured and it was noise" is a result worth
keeping, not a dead end to delete. `bench/BASELINE.md`, "Choices the bench argued *against*", keeps
three: an unconditional `rows.slice()` when nothing is filtered or sorted (0.012ms at 10k — aliasing
the caller's array would save nothing real), caching local facets (2.3ms per popover *open*, not per
render, so there is nothing to hide), and rebuilding `new Map(columns…)` per `filterRows` call.
Editing's six extra fields per column (`editable`, `setValue`, `validate`, `required`) looked like a
plausible cost too and, A/B'd three runs each way, measured inside the run-to-run noise — because
none of the four `O(dataset)` functions reads any of those fields; they are inert until a table is
handed an editing session.

## What the browser measures

`bench/` measures JavaScript only — it does not measure layout, paint, or Vue's own patch. The
demo's **Performance** view exists for that half, and it refuses to measure a hidden tab: a
backgrounded tab never fires `requestAnimationFrame`, so a number from one would report the
browser's throttle rather than the table's cost.

It also measures the **production build**, not the dev server — `pnpm demo` reports 24–25ms medians
where the same interaction against `demo/dist` reports 16.4ms. The ~8ms difference is Vue's
development build constructing components; a dev-server frame time describes the dev server, not
the library.

The acceptance run behind P2-6 (`bench/BASELINE.md`, "What the browser said") scrolled the
production demo continuously at 100k rows, filtered to 48 189 matches, `virtual` on, two columns
pinned, grouped two levels with two departments collapsed — the exact combination that breaks a
naive virtualizer. Median frame time: **16.5ms**, against a 16.7ms display vsync and a 16.4ms flat
(nothing pinned, nothing grouped) baseline. Pinning and a collapsed group cost nothing over the flat
case, because pinning is a per-cell offset the scroll window never reads, and a collapse is simply a
shorter list for the window to slice — neither is a special case the window has to know about.

Live: the **Performance** tab of `pnpm demo` (`#perf`). Back to the [docs index](/).
