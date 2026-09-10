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
   * The table fills its box only when some column asked for the leftover.
   *
   * `width: 100%` on the table itself is what used to inflate every column
   * proportionally on any table narrower than its box — a declared 120px column
   * rendered at whatever share of the width it happened to be. The fix is one
   * rule sizing the table to its columns and one override behind `[data-fill]`,
   * which `TableGrid` emits only when a `<col>` carries no width. jsdom applies
   * no stylesheet, so nothing else in the suite would notice either half going
   * missing.
   */
  it('lets the table fill its box only behind [data-fill]', () => {
    const widths = rules().filter((r) => /(^|,)\s*\.vt-table\b/.test(r.selector) && /width\s*:/.test(r.body))

    const filling = widths.filter((r) => /width:\s*100%/.test(r.body))
    expect(
      filling.map((r) => r.selector),
      'a .vt-table rule sets width: 100% without [data-fill]; that shares the slack out over every column instead of the one that asked for it',
    ).toEqual(['.vt-table[data-layout=\'fixed\'][data-fill]'])

    const sized = widths.filter((r) => /\[data-layout='fixed'\]/.test(r.selector) && !/data-fill/.test(r.selector))
    expect(
      sized.map((r) => r.body.match(/width:\s*([^;]+)/)![1]!.trim()),
      'the fixed-layout table sets no width of its own, so it inherits the browser\'s and the columns stop meaning px',
    ).toEqual(['0'])
  })

  /**
   * The truncation marker reaches every rule the `ellipsis` keyword does, and
   * only from behind the support test.
   *
   * `text-overflow: <string>` is Firefox-only, so the marker is applied as a
   * second rule rather than in place of the keyword. The guard is not
   * optional: a `var()` that substitutes to a value the browser rejects is
   * invalid at computed-value time, which resets the property to `clip`
   * instead of falling back to the keyword — an unguarded rule would cut text
   * mid-glyph in Chrome with no marker at all. Neither half is visible to
   * jsdom, and a browser that shows the bug is not the one most people run.
   */
  it('applies the truncation marker to every ellipsis rule, behind @supports', () => {
    const selectorsOf = (r: Rule) => r.selector.split(',').map((s) => s.trim())

    const keyword = new Set(
      rules()
        .filter((r) => /text-overflow:\s*ellipsis/.test(r.body))
        .flatMap(selectorsOf),
    )
    const marker = new Set(
      rules()
        .filter((r) => /text-overflow:\s*var\(--vtc-truncation-marker\)/.test(r.body))
        .flatMap(selectorsOf),
    )

    expect(
      [...keyword].filter((s) => !marker.has(s)).sort(),
      'selectors that truncate with the ellipsis keyword and never get the theme\'s marker',
    ).toEqual([])
    expect(
      [...marker].filter((s) => !keyword.has(s)).sort(),
      'selectors given the marker without the keyword fallback underneath, which is nothing at all in Chrome and Safari',
    ).toEqual([])

    const unguarded: string[] = []
    for (const file of readdirSync(STYLES).filter((n) => n.endsWith('.css'))) {
      const css = readFileSync(resolve(STYLES, file), 'utf8')
      // Deliberately not a CSS parser either: blank out each `@supports` body
      // by walking its braces, then any marker still standing is outside one.
      let stripped = css
      for (;;) {
        const at = stripped.indexOf("@supports (text-overflow: '..')")
        if (at === -1) break
        let i = stripped.indexOf('{', at)
        let depth = 0
        for (; i < stripped.length; i++) {
          if (stripped[i] === '{') depth++
          else if (stripped[i] === '}' && --depth === 0) break
        }
        stripped = stripped.slice(0, at) + stripped.slice(i + 1)
      }
      // `var(…)` and not the bare name: `tokens.css` declares the token, and
      // a declaration is not a use.
      if (stripped.includes('var(--vtc-truncation-marker)')) unguarded.push(file)
    }

    expect(
      unguarded,
      'a partition reads --vtc-truncation-marker outside @supports, which resets text-overflow to clip wherever the string form is unsupported',
    ).toEqual([])
  })

  /**
   * Header labels are painted through `--vtc-header-text`, not through the
   * palette's `--vtc-text`.
   *
   * The two are the same colour by default, so this cannot be seen — and the
   * theme spec only proves the token exists and is reachable from TypeScript,
   * never that anything reads it. A rule that goes back to `--vtc-text` would
   * leave `defineTheme({ headerText })` silently doing nothing.
   */
  it('paints header cells and the drag ghost through the header text token', () => {
    const colourOf = (file: string, selector: string) => {
      const rule = rules().find((r) => r.file === file && r.selector === selector)
      expect(rule, `${file}: ${selector}`).toBeDefined()
      return rule!.body.match(/(?:^|[;\s])color:\s*([^;]+)/)?.[1]?.trim()
    }

    expect(colourOf('grid.css', '.vt-th')).toBe('var(--vtc-header-text)')
    expect(colourOf('header.css', '.vt-drag-ghost')).toBe('var(--vtc-header-text)')
  })

  /**
   * The theme is settable from one place. A rule elsewhere that assigns a
   * public `--vtc-` token outranks whatever the consumer wrote on
   * `.vt-datatable`, so the token stops being a knob and starts being a lie —
   * which is what the idle cursor ring did to `--vtc-cursor-border-color`
   * before it was resolved through a `--_vtc-` slot instead.
   *
   * The palettes under `styles/themes/` are the one sanctioned exception, and
   * they are not an exception to the point: a preset re-states the nine
   * literals every other token derives from and nothing else, which is the
   * consumer's own switch rather than a rule that outranks it. They are out of
   * reach here — `rules()` does not descend into the directory — and are held
   * to that shape by `tests/themePresets.spec.ts` instead.
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
