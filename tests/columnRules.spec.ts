import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import DataTable from '../src/components/preset/DataTable.vue'
import { useLocalDataSource } from '../src/core/useLocalDataSource'
import { useTableState } from '../src/core/useTableState'
import { people, personColumns, personColumnGroups, groupedPersonColumns, type Person } from './fixtures'

/**
 * `columnRules` and `bandRules` — the two vertical separators, as props.
 *
 * Both are the declarative form of a `--vtc-*` width that was previously only
 * reachable from CSS. The rules they stand for live in `grid.css` and are not
 * applied by happy-dom, so these assert the custom property that drives them
 * rather than a computed border: the stylesheet is the preset's business and
 * `tests/dataTable.spec.ts` does not parse it either.
 */
function mountTable(props: Record<string, unknown> = {}, banded = false) {
  const defs = banded ? groupedPersonColumns : personColumns
  const Host = defineComponent({
    setup() {
      const state = useTableState({ pageSize: 3 })
      const source = useLocalDataSource<Person>(people, defs, state.query)
      return () =>
        h(DataTable as never, {
          columns: defs,
          source,
          state,
          ...(banded ? { columnGroups: personColumnGroups } : {}),
          ...props,
        })
    },
  })
  return mount(Host, { attachTo: document.body })
}

const styleOf = (wrapper: ReturnType<typeof mountTable>) =>
  wrapper.find('.vt-datatable').attributes('style') ?? ''

describe('columnRules and bandRules', () => {
  /*
   * The load-bearing case. Emitting `0px` for an untouched prop would overrule
   * any stylesheet that had set the token itself, which is exactly what the
   * demo's own theming controls do — a prop nobody passed would restyle a
   * table nobody asked to restyle.
   */
  it('writes nothing at all when neither prop is passed', () => {
    const wrapper = mountTable()

    const style = styleOf(wrapper)
    expect(style).not.toContain('--vtc-body-border-vertical-width')
    expect(style).not.toContain('--vtc-band-border-width')

    wrapper.unmount()
  })

  it('turns column separators on and off', () => {
    const on = mountTable({ columnRules: true })
    expect(styleOf(on)).toContain('--vtc-body-border-vertical-width: 1px')
    on.unmount()

    // `false` is a value, not an absence: the token defaults to `0px`, so this
    // only matters for a table whose own CSS had switched the rules on.
    const off = mountTable({ columnRules: false })
    expect(styleOf(off)).toContain('--vtc-body-border-vertical-width: 0px')
    off.unmount()
  })

  it('turns band rules on and off', () => {
    const off = mountTable({ bandRules: false }, true)
    expect(styleOf(off)).toContain('--vtc-band-border-width: 0px')
    off.unmount()

    const on = mountTable({ bandRules: true }, true)
    expect(styleOf(on)).toContain('--vtc-band-border-width: 1px')
    on.unmount()
  })

  /*
   * They are separate tokens on purpose: a table can want a rule where a band
   * ends without wanting one between every pair of columns, which is the
   * default pairing, and the reverse has to be reachable too.
   */
  it('carries the two independently', () => {
    const wrapper = mountTable({ columnRules: true, bandRules: false }, true)

    const style = styleOf(wrapper)
    expect(style).toContain('--vtc-body-border-vertical-width: 1px')
    expect(style).toContain('--vtc-band-border-width: 0px')

    wrapper.unmount()
  })

  /*
   * `bandRules` reaches cells through `data-band-edge`, which only exists where
   * a band boundary falls. A table declaring no `columnGroups` therefore has
   * nowhere for the rule to land — the prop is not ignored, it simply has no
   * edges to reach, and saying so here keeps the doc comment honest.
   */
  it('has no band edges to reach without columnGroups', () => {
    const wrapper = mountTable({ bandRules: true })

    expect(styleOf(wrapper)).toContain('--vtc-band-border-width: 1px')
    expect(wrapper.findAll('[data-band-edge]')).toHaveLength(0)

    wrapper.unmount()
  })
})
