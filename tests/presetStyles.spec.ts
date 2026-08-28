import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Structural invariants of the preset stylesheet, asserted against its source.
 *
 * These are contracts a rendering test cannot reach: jsdom does not apply the
 * stylesheet, so nothing in the rest of the suite would notice a rule that
 * quietly erases another one. All three failures below were live at some point
 * and were found by reading rather than by a test — which is the argument for
 * writing them down here.
 *
 * Modeled on `tests/apiSurface.spec.ts`: name the offender, never just assert
 * a boolean.
 */

const STYLES = resolve(import.meta.dirname, '../src/components/preset/styles')

interface Rule {
  file: string
  selector: string
  body: string
}

/**
 * Every `selector { … }` in the partitions, comments stripped.
 *
 * Deliberately not a CSS parser. The pattern matches only blocks whose body
 * holds no braces of its own, which means an `@media` wrapper is skipped over
 * rather than mistaken for a rule — the rules inside it are matched on their
 * own, which is what these assertions want.
 */
function rules(): Rule[] {
  const out: Rule[] = []
  for (const file of readdirSync(STYLES).filter((n) => n.endsWith('.css'))) {
    const css = readFileSync(resolve(STYLES, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
    for (const m of css.matchAll(/([^{}]+)\{([^{}]+)\}/g)) {
      out.push({ file, selector: m[1]!.trim().replace(/\s+/g, ' '), body: m[2]! })
    }
  }
  return out
}

/** Declarations of a custom property, as `--name` without the value. */
function declaredProperties(body: string): string[] {
  return [...body.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]!)
}

describe('preset stylesheet', () => {
  /**
   * The cell's `background-image` and `box-shadow` are composed once, out of
   * `--_vtc-` slots, so that six background states and five shadows can coexist
   * without competing on specificity. Both are single properties: a rule that
   * writes one directly does not add to the stack, it replaces the whole thing.
   *
   * This is not hypothetical. The row-state edit stripe used to write
   * `box-shadow` at (0,4,0), which beat the composition at (0,1,0) and erased
   * the cursor ring, both hover rings and the pin shadow on the first cell of
   * every row that carried a state.
   */
  it('composes cell backgrounds and shadows in exactly one place', () => {
    const offenders = rules()
      .filter((r) => /\.vt-t[dh]\b/.test(r.selector))
      .filter((r) => /(^|[;\s])(background-image|box-shadow)\s*:/.test(r.body))
      .filter((r) => !(r.file === 'grid.css' && r.selector === '.vt-th, .vt-td'))
      .map((r) => `${r.file}: ${r.selector}`)

    expect(
      offenders,
      'a rule matching cells writes background-image or box-shadow directly instead of filling a --_vtc- slot, which erases every other layer on those cells',
    ).toEqual([])
  })

  /**
   * A `var()` with no value and no fallback is invalid at computed-value time,
   * and takes the whole declaration with it — every sibling layer included. So
   * a slot that is filled somewhere has to be reset on the cell.
   */
  it('resets every layer and shadow slot it fills', () => {
    const composition = rules().find(
      (r) => r.file === 'grid.css' && r.selector === '.vt-th, .vt-td',
    )
    expect(composition, 'the .vt-th, .vt-td composition rule').toBeDefined()
    const reset = new Set(declaredProperties(composition!.body))

    const filled = new Set<string>()
    for (const r of rules()) {
      for (const p of declaredProperties(r.body)) {
        if (/^--_vtc-(layer|shadow)-/.test(p)) filled.add(p)
      }
    }

    expect([...filled].filter((p) => !reset.has(p)).sort()).toEqual([])
  })

  /**
   * The theme is settable from one place. A rule elsewhere that assigns a
   * public `--vtc-` token outranks whatever the consumer wrote on
   * `.vt-datatable`, so the token stops being a knob and starts being a lie —
   * which is what the idle cursor ring did to `--vtc-cursor-border-color`
   * before it was resolved through a `--_vtc-` slot instead.
   */
  it('declares public tokens only in the two theme partitions', () => {
    const offenders: string[] = []
    for (const r of rules()) {
      if (r.file === 'tokens.css' || r.file === 'scales.css') continue
      for (const p of declaredProperties(r.body)) {
        if (p.startsWith('--vtc-')) offenders.push(`${r.file}: ${r.selector} sets ${p}`)
      }
    }

    expect(
      offenders,
      'a partition assigns a public --vtc- token; compute into a --_vtc- slot instead, so the token stays the consumer\'s to set',
    ).toEqual([])
  })
})
