import { describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import ValueListFilter from '../src/components/primitives/ValueListFilter.vue'
import ColumnFilterPopover from '../src/components/primitives/ColumnFilterPopover.vue'
import { provideTableContext, type TableContext } from '../src/core/context'
import type { FacetValue, ValuesFilter } from '../src/core/types'

function mountList(props: {
  facets: FacetValue[]
  modelValue?: ValuesFilter
  loading?: boolean
}) {
  return mount(ValueListFilter, { props: { modelValue: undefined, ...props } })
}

function emitted(wrapper: ReturnType<typeof mountList>): ValuesFilter | undefined {
  const events = wrapper.emitted('update:modelValue')
  expect(events).toBeTruthy()
  return events![events!.length - 1]![0] as ValuesFilter | undefined
}

const apply = (w: ReturnType<typeof mountList>) => w.find('.vt-btn-primary').trigger('click')

describe('ValueListFilter Apply', () => {
  const incoming: ValuesFilter = { kind: 'values', include: ['A', 'B'], includeBlanks: false }

  it('keeps values the list does not show', async () => {
    const w = mountList({ facets: [{ value: 'A', count: 1 }], modelValue: incoming })
    await apply(w)
    expect(emitted(w)).toEqual({ kind: 'values', include: ['A', 'B'], includeBlanks: false })
  })

  it('unticking a listed value keeps the unseen ones', async () => {
    const w = mountList({ facets: [{ value: 'A', count: 1 }], modelValue: incoming })
    await w.find('.vt-valuelist-row:not(.vt-valuelist-all) input').trigger('click')
    await apply(w)
    expect(emitted(w)?.include).toEqual(['B'])
  })

  it('keeps the incoming include when the facet list is empty', async () => {
    const w = mountList({ facets: [], modelValue: incoming })
    await apply(w)
    expect(emitted(w)?.include).toEqual(['A', 'B'])
  })

  it('is disabled while loading', () => {
    const w = mountList({ facets: [], loading: true })
    expect(w.find('.vt-btn-primary').attributes('disabled')).toBeDefined()
  })

  it('under a search applies only the checked matches', async () => {
    const w = mountList({
      facets: [
        { value: 'Alpha', count: 1 },
        { value: 'Alpine', count: 1 },
        { value: 'Beta', count: 1 },
      ],
    })
    await w.find('input[type="search"]').setValue('alp')
    await w.find('.vt-valuelist-all input').trigger('click')
    const rows = w.findAll('.vt-valuelist-row:not(.vt-valuelist-all)')
    expect(rows).toHaveLength(2)
    await rows[0]!.find('input').trigger('click')
    await apply(w)
    expect(emitted(w)).toEqual({ kind: 'values', include: ['Alpha'], includeBlanks: false })
  })

  it('shows the blanks row, not the empty message, when searching the blanks label', async () => {
    const w = mountList({
      facets: [
        { value: 'A', count: 1 },
        { value: null, count: 2 },
      ],
    })
    await w.find('input[type="search"]').setValue('blank')
    expect(w.find('.vt-valuelist-blank').exists()).toBe(true)
    expect(w.text()).not.toContain('No matching')
  })
})

describe('ColumnFilterPopover facet ordering', () => {
  it('ends on the newest answer when responses arrive in reverse', async () => {
    const resolvers: Array<(v: FacetValue[]) => void> = []
    const stub = {
      source: {
        facets: () => new Promise<FacetValue[]>((r) => resolvers.push(r)),
      },
      state: { filterFor: () => undefined, setFilter: vi.fn() },
    } as unknown as TableContext<never>
    const Host = defineComponent({
      setup() {
        provideTableContext(stub)
        return () => h(ColumnFilterPopover, { columnId: 'name', teleport: false })
      },
    })
    const w = mount(Host)
    const trigger = w.find('.vt-filter-trigger')
    await trigger.trigger('click')
    await trigger.trigger('click')
    await trigger.trigger('click')
    expect(resolvers).toHaveLength(2)

    resolvers[1]!([{ value: 'Second', count: 1 }])
    await flushPromises()
    resolvers[0]!([{ value: 'First', count: 1 }])
    await flushPromises()
    expect(w.text()).toContain('Second')
    expect(w.text()).not.toContain('First')
    expect(w.text()).not.toContain('Loading')
  })

  it('keeps loading text until the newest request resolves', async () => {
    const resolvers: Array<(v: FacetValue[]) => void> = []
    const stub = {
      source: { facets: () => new Promise<FacetValue[]>((r) => resolvers.push(r)) },
      state: { filterFor: () => undefined, setFilter: vi.fn() },
    } as unknown as TableContext<never>
    const Host = defineComponent({
      setup() {
        provideTableContext(stub)
        return () => h(ColumnFilterPopover, { columnId: 'name', teleport: false })
      },
    })
    const w = mount(Host)
    const trigger = w.find('.vt-filter-trigger')
    await trigger.trigger('click')
    await trigger.trigger('click')
    await trigger.trigger('click')
    resolvers[0]!([{ value: 'First', count: 1 }])
    await flushPromises()
    expect(w.text()).toContain('Loading')
    resolvers[1]!([])
    await flushPromises()
    expect(w.text()).not.toContain('Loading')
  })
})
