import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { themePresets } from '../src/core/themePresets'

/**
 * The palette presets, asserted against their source.
 *
 * jsdom applies no stylesheet, so nothing else in the suite would notice a
 * preset that names a token wrong, misses the selector form the teleported
 * popovers need, or picks two colours that cannot be read against each other.
 *
 * The contrast assertions are the point of the file. A palette is easy to get
 * *pretty* and easy to get unreadable at the same time, and the failure is
 * invisible until someone squints at a pager button — so the ratios are
 * checked here rather than trusted to the eye that picked the hexes.
 *
 * Named after `tests/presetStyles.spec.ts`, and following its rule: name the
 * offender, never just assert a boolean.
 */

const THEMES = resolve(import.meta.dirname, '../src/components/preset/styles/themes')

/**
 * The nine literals a palette is allowed to state.
 *
 * Everything else in `styles/tokens.css` — header text, every hover and cursor
 * wash, the selected tint, the scrim, striping, the focus ring, every border
 * colour — is `color-mix`-derived from these, so a preset that re-stated one
 * would be pinning a value that is supposed to follow. That is the mistake the
 * demo's own hand-copied palettes made.
 */
const PALETTE = [
  '--vtc-bg',
  '--vtc-header-bg',
  '--vtc-text',
  '--vtc-text-muted',
  '--vtc-border',
  '--vtc-border-strong',
  '--vtc-accent',
  '--vtc-accent-contrast',
  '--vtc-danger',
]

interface Preset {
  name: string
  selector: string
  declarations: Map<string, string>
}

function presets(): Preset[] {
  return readdirSync(THEMES)
    .filter((n) => n.endsWith('.css'))
    .map((file) => {
      const css = readFileSync(resolve(THEMES, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
      const block = css.match(/([^{}]+)\{([^{}]+)\}/)
      const declarations = new Map<string, string>()
      for (const m of (block?.[2] ?? '').matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
        declarations.set(m[1]!, m[2]!.trim())
      }
      return {
        name: file.replace(/\.css$/, ''),
        selector: (block?.[1] ?? '').trim().replace(/\s+/g, ' '),
        declarations,
      }
    })
}

/** Relative luminance, per WCAG 2. */
function luminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16)
  const channel = (c: number): number => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255)
}

/** The WCAG contrast ratio between two opaque hexes, 1:1 to 21:1. */
function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (light! + 0.05) / (dark! + 0.05)
}

describe('theme presets', () => {
  it('ships a file for every name and a name for every file', () => {
    expect(presets().map((p) => p.name).sort()).toEqual([...themePresets].sort())
  })

  it('states the nine palette literals and nothing else', () => {
    const offenders: string[] = []
    for (const preset of presets()) {
      const declared = [...preset.declarations.keys()]
      for (const name of declared) {
        if (!PALETTE.includes(name)) offenders.push(`${preset.name}: sets ${name}, which derives from the nine`)
      }
      for (const name of PALETTE) {
        if (!preset.declarations.has(name)) offenders.push(`${preset.name}: does not set ${name}`)
      }
    }

    expect(offenders, 'a preset is exactly the nine literals the rest of the theme derives from').toEqual([])
  })

  it('writes opaque hexes, which is what the contrast checks below can read', () => {
    const offenders: string[] = []
    for (const preset of presets()) {
      for (const [name, value] of preset.declarations) {
        if (!/^#[0-9a-f]{6}$/.test(value)) offenders.push(`${preset.name}: ${name} is ${value}`)
      }
    }

    expect(offenders, 'six-digit lowercase hex, so a palette can be checked rather than admired').toEqual([])
  })

  /**
   * Both halves of the selector, and the attribute stated twice.
   *
   * The **ancestor** form is what reaches `.vt-portal`: the filter popover and
   * the drag ghost teleport to `<body>`, so only an attribute above them both
   * — `<html>` in practice — covers the table and its popovers at once. The
   * **self** form covers one table on a page that themes several differently.
   *
   * The attribute is repeated to reach specificity (0,3,0). The dark blocks in
   * `tokens.css` are (0,2,0), and the plain ancestor form ties with them —
   * which would leave a *light* preset losing to the OS dark palette, or not,
   * depending on the consumer's import order. Doubling it settles that without
   * `!important`.
   */
  it('selects on the attribute from an ancestor and on the element, at (0,3,0)', () => {
    const offenders: string[] = []
    for (const { name, selector } of presets()) {
      const attribute = `[data-vtc-theme='${name}'][data-vtc-theme]`
      for (const form of [
        `${attribute} .vt-datatable`,
        `${attribute} .vt-portal`,
        `.vt-datatable${attribute}`,
        `.vt-portal${attribute}`,
      ]) {
        if (!selector.includes(form)) offenders.push(`${name}: selector is missing ${form}`)
      }
    }

    expect(offenders, 'the attribute value is the file name, and both reach forms are needed').toEqual([])
  })

  /**
   * `--vtc-accent-contrast` is a foreground *on the accent*: it inks the
   * current pager button, the primary button and the checked box, all of which
   * fill with `--vtc-accent`. A light accent — Dracula's purple, Nord's frost
   * blue, Catppuccin's mauve — leaves white at around 2.5:1 on it, so those
   * palettes ink it to their own background instead.
   */
  it('keeps text readable on the accent, and on the surface', () => {
    const offenders: string[] = []
    for (const { name, declarations } of presets()) {
      const pair = (a: string, b: string, floor: number, what: string): void => {
        const ratio = contrast(declarations.get(a)!, declarations.get(b)!)
        if (ratio < floor) offenders.push(`${name}: ${what} is ${ratio.toFixed(2)}:1, under ${floor}:1`)
      }

      pair('--vtc-text', '--vtc-bg', 4.5, 'body text on the surface')
      pair('--vtc-accent-contrast', '--vtc-accent', 4.5, 'the accent foreground on the accent')
      // 3:1, not 4.5:1: the muted role carries header labels and secondary
      // text, and the light palette in `tokens.css` sits at 3.8:1 for the same
      // reason — a muted colour held to body-text contrast is not muted.
      pair('--vtc-text-muted', '--vtc-bg', 3, 'muted text on the surface')
      pair('--vtc-danger', '--vtc-bg', 3, 'the error colour on the surface')
      // The header is a surface, not a rule: it has to differ from the rows
      // without becoming a second theme. Anything past 1.6:1 reads as a band.
      const header = contrast(declarations.get('--vtc-header-bg')!, declarations.get('--vtc-bg')!)
      if (header < 1.02 || header > 1.7) {
        offenders.push(`${name}: the header is ${header.toFixed(2)}:1 against the rows`)
      }
    }

    expect(offenders, 'a palette that cannot be read is not a theme, it is a mood').toEqual([])
  })
})
