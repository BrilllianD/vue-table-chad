import type { DisplayRow } from './types'

/**
 * Interleaves a `detail` line after every expanded row of a flattened display
 * list.
 *
 * The counterpart to `flattenTree`, and deliberately a second pass over its
 * output rather than an argument to it: which rows are open changes on a click,
 * and folding that into the flatten would make the group tree depend on the
 * expansion state the way `buildGroupTree` deliberately does not depend on the
 * collapse state.
 *
 * A detail panel is a line of its own rather than something the row above it
 * renders inside itself, because windowing has to be able to count it — see
 * `DisplayRow`.
 *
 * Returns the list **by reference** when nothing is expanded. A computed
 * returning the same reference does not propagate, so a table whose details are
 * all shut costs one walk and re-renders nothing; the same trick that makes
 * paging free.
 */
export function withDetailRows<TRow>(
  rows: readonly DisplayRow<TRow>[],
  isExpanded: (row: TRow) => boolean,
): DisplayRow<TRow>[] {
  let result: DisplayRow<TRow>[] | undefined

  for (let i = 0; i < rows.length; i += 1) {
    const item = rows[i]!
    if (item.kind !== 'row' || !isExpanded(item.row)) {
      result?.push(item)
      continue
    }
    // The copy is made on the first open row and not before: the shut case is
    // the common one and must not allocate a second array per re-evaluation.
    result ??= rows.slice(0, i)
    result.push(item, { kind: 'detail', row: item.row, index: item.index, depth: item.depth })
  }

  return result ?? (rows as DisplayRow<TRow>[])
}
