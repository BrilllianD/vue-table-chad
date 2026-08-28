import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import DataTable from '../src/components/preset/DataTable.vue'
import { useLocalDataSource } from '../src/core/useLocalDataSource'
import { useTableState } from '../src/core/useTableState'
import { defineTheme, themeProperties } from '../src/core/theme'
import { people, personColumns, type Person } from './fixtures'

/**
 * The `theme` prop, and the selectors it exists to reach.
 *
 * Two halves, because neither alone is worth much. happy-dom applies no
 * stylesheet, so the mounted half can only assert the attribute; and the
 * attribute means nothing unless the CSS keys off it, so the second half reads
 * `tokens.css` and pins the selectors that make the switch work in both
 * directions.
 */
const Host = defineComponent({
  props: { theme: { type: String, default: undefined } },
  setup(props) {
    const state = useTableState({ pageSize: 3 })
    const source = useLocalDataSource<Person>(people, personColumns, state.query)
    return () =>
      h(DataTable as never, {
        columns: personColumns,
        source,
        state,
        ...(props.theme === undefined ? {} : { theme: props.theme }),
      })
  },
})

function mountTable(theme?: string) {
  return mount(Host, { props: { theme }, attachTo: document.body })
}

const themeOf = (wrapper: ReturnType<typeof mountTable>) =>
  wrapper.find('.vt-datatable').attributes('data-theme')

const TOKENS = readFileSync(
  resolve(import.meta.dirname, '../src/components/preset/styles/tokens.css'),
  'utf8',
)

describe('theme', () => {
  it('emits no attribute by default, leaving prefers-color-scheme in charge', () => {
    expect(themeOf(mountTable())).toBeUndefined()
  })

  it('emits no attribute for theme="system" either', () => {
    expect(themeOf(mountTable('system'))).toBeUndefined()
  })

  it('writes data-theme for an explicit palette', () => {
    expect(themeOf(mountTable('dark'))).toBe('dark')
    expect(themeOf(mountTable('light'))).toBe('light')
  })

  it('drops the attribute again when the table goes back to system', async () => {
    const wrapper = mountTable('dark')
    expect(themeOf(wrapper)).toBe('dark')

    await wrapper.setProps({ theme: 'system' })
    expect(themeOf(wrapper)).toBeUndefined()
  })

  /**
   * The reason the theme is published through an injection key at all. A filter
   * panel is teleported to `<body>`, where it is no longer a descendant of the
   * table — custom properties stop inheriting, which is why `.vt-portal`
   * re-declares the palette, and why a forced theme has to be stamped on it
   * too or the panel opens in the OS's colours beside a table that is not.
   */
  it('carries the theme onto a teleported filter panel', async () => {
    const wrapper = mountTable('dark')
    await wrapper.find('.vt-filter-trigger').trigger('click')

    const panel = document.body.querySelector('.vt-filter-panel.vt-portal')
    expect(panel, 'the filter panel, teleported to <body>').not.toBeNull()
    expect(panel!.getAttribute('data-theme')).toBe('dark')

    wrapper.unmount()
  })

  it('leaves the teleported panel alone when the table follows the OS', async () => {
    const wrapper = mountTable()
    await wrapper.find('.vt-filter-trigger').trigger('click')

    const panel = document.body.querySelector('.vt-filter-panel.vt-portal')
    expect(panel, 'the filter panel, teleported to <body>').not.toBeNull()
    expect(panel!.hasAttribute('data-theme')).toBe(false)

    wrapper.unmount()
  })

  /**
   * The half a mounted table cannot see. Both directions have to work: the OS
   * says dark and the table says light, and the OS says light and the table
   * says dark. Those are different selectors — one an exclusion inside the
   * media query, the other a rule that has to sit outside it.
   */
  it('keys the dark palette off both the media query and the attribute', () => {
    expect(TOKENS, 'the media query must exclude a table asking for light').toContain(
      ".vt-datatable:not([data-theme='light'])",
    )
    expect(TOKENS, 'the teleported portal must be excluded the same way').toContain(
      ".vt-portal:not([data-theme='light'])",
    )
    expect(TOKENS, 'an explicit dark must work with the OS set to light').toContain(
      ".vt-datatable[data-theme='dark']",
    )
    expect(TOKENS, 'and must reach the teleported portal too').toContain(
      ".vt-portal[data-theme='dark']",
    )
  })

  /**
   * The explicit rule has to come *after* the media query. Both are (0,2,0) on
   * a table that is dark by attribute under a dark OS, so source order decides
   * — and if the media query won there, the two paths could drift to different
   * palettes with nothing to say so.
   */
  it('declares the explicit dark block after the media query', () => {
    expect(TOKENS.indexOf(".vt-datatable[data-theme='dark']")).toBeGreaterThan(
      TOKENS.indexOf('@media (prefers-color-scheme: dark)'),
    )
  })
})

const SCALES = readFileSync(
  resolve(import.meta.dirname, '../src/components/preset/styles/scales.css'),
  'utf8',
)

/** Every public token the two theme partitions declare. */
function declaredTokens(): Set<string> {
  const names = new Set<string>()
  for (const css of [SCALES, TOKENS]) {
    for (const m of css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/(--vtc-[\w-]+)\s*:/g)) {
      names.add(m[1]!)
    }
  }
  return names
}

describe('defineTheme', () => {
  it('emits the custom property for each field it is given', () => {
    expect(defineTheme({ accent: '#7c3aed', rowHeight: '44px' })).toEqual({
      '--vtc-accent': '#7c3aed',
      '--vtc-row-height': '44px',
    })
  })

  it('skips absent fields rather than emitting an empty declaration', () => {
    // A property declared with no value is invalid, not "unset" — and for the
    // tokens that feed `color-mix` and the composed layer lists, invalid takes
    // the whole declaration down with it.
    expect(defineTheme({ accent: undefined, bg: '#fff' })).toEqual({ '--vtc-bg': '#fff' })
  })

  it('passes numbers through for the unitless tokens', () => {
    expect(defineTheme({ zPopover: 30, weightBold: 700, opacityBusy: 0.5 })).toEqual({
      '--vtc-z-popover': '30',
      '--vtc-weight-bold': '700',
      '--vtc-opacity-busy': '0.5',
    })
  })

  /**
   * The binding `docs/styling.md` tells consumers to write, end to end.
   *
   * It needs `DataTable` to forward attributes by hand: `<TableRoot>` renders
   * a slot and nothing else, so the component's root is a fragment and Vue
   * drops fallthrough attributes instead of applying them. Nothing warned —
   * a `:style` on `<DataTable>` simply had no effect, which is the whole
   * feature this file documents.
   */
  it('reaches .vt-datatable when bound as a style on the component', () => {
    const Styled = defineComponent({
      setup() {
        const state = useTableState({ pageSize: 3 })
        const source = useLocalDataSource<Person>(people, personColumns, state.query)
        return () =>
          h(DataTable as never, {
            columns: personColumns,
            source,
            state,
            style: defineTheme({ accent: '#7c3aed', rowHeight: '44px' }),
          })
      },
    })

    const style = mount(Styled, { attachTo: document.body }).find('.vt-datatable').attributes('style')
    expect(style).toContain('--vtc-accent: #7c3aed')
    expect(style).toContain('--vtc-row-height: 44px')
  })

  it('starts a segment at a digit, so the numbered scales come out right', () => {
    expect(themeProperties.space1).toBe('--vtc-space-1')
    expect(themeProperties.fontSize3xs).toBe('--vtc-font-size-3xs')
    expect(themeProperties.stroke2).toBe('--vtc-stroke-2')
  })

  /**
   * The reason `THEME_TOKENS` is a runtime list rather than an interface's
   * keys. A token added to the stylesheet and not to the list is unreachable
   * from TypeScript; one added to the list and not to the stylesheet is a
   * field that autocompletes and then does nothing. Both are silent.
   */
  it('names exactly the tokens the stylesheet declares', () => {
    const declared = declaredTokens()
    const mapped = new Set(Object.values(themeProperties))

    expect(
      [...mapped].filter((name) => !declared.has(name)).sort(),
      'Theme fields with no token behind them',
    ).toEqual([])
    expect(
      [...declared].filter((name) => !mapped.has(name)).sort(),
      'tokens the stylesheet declares that no Theme field can set',
    ).toEqual([])
  })
})
