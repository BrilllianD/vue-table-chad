import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * CLAUDE.md: "An export should also appear somewhere in `demo/`."
 *
 * That was a convention with nothing enforcing it, and it had drifted — 22
 * value exports had no demo home at all, `useRowGrouping` and `groupedSort`
 * among them. It matters most right before publishing: every export is a
 * compatibility commitment, and one nothing demonstrates is a commitment
 * nobody has looked at.
 *
 * The other half of the rule — a doc comment on the declaration — is already
 * enforced: `pnpm docs:api` refuses to generate without one, and
 * `apiReference.spec.ts` fails on a stale copy.
 *
 * **Value exports only.** A type cannot be *used* in a view in a way a reader
 * would see, so requiring one to appear there would only buy a chip nobody
 * could verify. The generated API reference lists them regardless.
 */

const root = join(import.meta.dirname, '..')

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.(vue|ts)$/.test(entry)) out.push(full)
  }
  return out
}

/** The value exports of the public barrel — types excluded, see above. */
function valueExports(): string[] {
  const source = readFileSync(join(root, 'src/index.ts'), 'utf8')
  const names = new Set<string>()

  for (const match of source.matchAll(/^export \{([^}]*)\} from/gm)) {
    for (const raw of (match[1] ?? '').split(',')) {
      const name = raw.trim()
      if (name && !name.startsWith('type ')) names.add(name.split(' as ').pop()!.trim())
    }
  }
  for (const match of source.matchAll(/^export \{ default as (\w+) \}/gm)) {
    if (match[1]) names.add(match[1])
  }

  return [...names].sort()
}

/**
 * Everything the demo and the playground show: names a view claims in its
 * `:api` list, plus anything either actually imports from the package.
 *
 * Both count. A view claiming `aggregateGroups` does not call it — the
 * composable it demonstrates does — and that is the established meaning of the
 * list: the exports this feature is built from.
 */
function demonstrated(): Set<string> {
  const shown = new Set<string>()
  const files = [...walk(join(root, 'demo/src')), ...walk(join(root, 'playground'))]

  for (const file of files) {
    // Generated from `src/` and naming every export by construction, so
    // counting it would make this test pass against itself.
    if (file.endsWith('apiReference.ts')) continue
    const text = readFileSync(file, 'utf8')

    for (const match of text.matchAll(/:api="\[(.*?)\]"/gs)) {
      // Entries are prose as often as identifiers — `DataTable storageKey`,
      // `ColumnDef.aggregate` — so take the leading identifier of each.
      for (const entry of (match[1] ?? '').matchAll(/'([^']+)'/g)) {
        const name = (entry[1] ?? '').split('.')[0]?.split(' ')[0]
        if (name) shown.add(name)
      }
    }
    for (const match of text.matchAll(/import\s*\{([^}]*)\}\s*from\s*'@sandbox\/vue-table'/gs)) {
      for (const raw of (match[1] ?? '').split(',')) {
        const name = raw.trim().replace('type ', '').trim()
        if (name) shown.add(name.split(' as ').pop()!.trim())
      }
    }
  }
  return shown
}

describe('public API surface', () => {
  it('demonstrates every value export somewhere in the demo', () => {
    const shown = demonstrated()
    const undemonstrated = valueExports().filter((name) => !shown.has(name))

    // Named rather than counted, so a failure says which one and the fix is
    // obvious: demonstrate it, or stop exporting it.
    expect(undemonstrated).toEqual([])
  })

  it('finds a surface to check at all', () => {
    // Guards the parsing itself: a regex that silently matched nothing would
    // make the test above pass for the wrong reason.
    expect(valueExports().length).toBeGreaterThan(100)
    expect(demonstrated().size).toBeGreaterThan(100)
    expect(valueExports()).toContain('useTable')
  })
})
