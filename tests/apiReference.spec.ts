import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { apiReference } from '../demo/src/data/apiReference'
import { generate } from '../scripts/generate-api-reference'

/**
 * The API reference is documentation, and documentation rots. This is what
 * stops it: the reference is diffed against the real export list in both
 * directions, so adding an export without describing it fails, and describing
 * a name that no longer exists fails too.
 *
 * It reads `src/index.ts` as text rather than importing it, because importing
 * would only reveal runtime values — the reference covers types as well, and
 * types leave nothing behind to inspect.
 *
 * The parser below stayed after the reference became generated, and is worth
 * more now than it was: it is a *second, independently written* reading of
 * `src/index.ts`. A bug in the generator's own parser would produce a file
 * that agrees with the generator, so the freshness check below would pass —
 * only a separate parser notices. Do not collapse the two.
 */
function exportedNames(): Set<string> {
  // Resolved from the working directory rather than `import.meta.url`: vitest
  // rewrites module URLs, and this file only ever runs from the repo root.
  const source = readFileSync(resolve(process.cwd(), 'src/index.ts'), 'utf8')
  const names = new Set<string>()
  for (const block of source.matchAll(/export\s*(?:type)?\s*\{([^}]*)\}/g)) {
    for (const raw of block[1]!.split(',')) {
      const entry = raw.trim().replace(/^type\s+/, '')
      if (!entry) continue
      // `export { default as DataTable }` — the alias is the public name.
      const aliased = entry.match(/\bas\s+(\w+)/)
      names.add(aliased ? aliased[1]! : entry.split(/\s/)[0]!)
    }
  }
  return names
}

describe('API reference', () => {
  const exported = exportedNames()
  const documented = new Set(apiReference.map((entry) => entry.name))

  it('found a plausible export list to check against', () => {
    // Guards the regex itself: a parser that silently matched nothing would
    // make both diffs below pass while checking nothing at all.
    expect(exported.size).toBeGreaterThan(100)
    expect(exported.has('DataTable')).toBe(true)
    expect(exported.has('useTableState')).toBe(true)
  })

  it('documents every export', () => {
    const missing = [...exported].filter((name) => !documented.has(name)).sort()
    expect(missing, 'exports with no entry in demo/src/data/apiReference.ts').toEqual([])
  })

  it('documents nothing that is no longer exported', () => {
    const stale = [...documented].filter((name) => !exported.has(name)).sort()
    expect(stale, 'apiReference entries that src/index.ts no longer exports').toEqual([])
  })

  it('gives every entry a summary worth reading', () => {
    const thin = apiReference
      .filter((entry) => entry.summary.trim().length < 20)
      .map((entry) => entry.name)
    expect(thin, 'entries whose summary is too short to say anything').toEqual([])
  })

  it('names each entry once', () => {
    expect(documented.size).toBe(apiReference.length)
  })

  /*
   * The file is generated but committed, so `pnpm demo` needs no codegen step
   * in front of it. These two are what make that safe.
   */

  it('is byte-for-byte what the generator writes', () => {
    // Byte compare rather than deep-equal on the data: this is the assertion
    // that catches a hand edit which happens to be semantically identical,
    // which is the exact failure mode generating the file is meant to end.
    const onDisk = readFileSync(resolve(process.cwd(), 'demo/src/data/apiReference.ts'), 'utf8')
    expect(generate(), 'demo/src/data/apiReference.ts is stale — run `pnpm docs:api`').toBe(onDisk)
  })

  it('gives every export a summary at its declaration', () => {
    // `generate()` throws rather than emitting a blank summary, so simply
    // calling it is the check. Named separately from the freshness case
    // because the fix is different: write a doc comment in `src/`, do not
    // re-run the generator.
    expect(() => generate()).not.toThrow()
  })
})
