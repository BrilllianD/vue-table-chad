import { describe, expect, it } from 'vitest'
import { effectScope, ref } from 'vue'
import { useStaticOptions } from '../src/core/useStaticOptions'
import type { AsyncOptionSource, FilterValue } from '../src/core/types'

/**
 * A fixed list dressed as the source a paged dropdown reads.
 *
 * Every rule here is about the half of `AsyncOptionSource` that has no meaning
 * over a list that is already complete — a request that can never be in
 * flight, a portion that can never be next, and an error that can never
 * arrive.
 */

function build(
  values: readonly FilterValue[],
  options: Parameters<typeof useStaticOptions>[1] = {},
): { source: AsyncOptionSource; dispose: () => void } {
  const scope = effectScope()
  return { source: scope.run(() => useStaticOptions(values, options))!, dispose: () => scope.stop() }
}

describe('useStaticOptions', () => {
  it('reports a list that has finished loading, because it has', () => {
    const { source, dispose } = build(['Design', 'Sales'])
    expect(source.options.value.map((option) => option.label)).toEqual(['Design', 'Sales'])
    expect(source.hasMore.value).toBe(false)
    expect(source.loading.value).toBe(false)
    expect(source.initialLoading.value).toBe(false)
    expect(source.loadingMore.value).toBe(false)
    expect(source.error.value).toBeNull()
    // Nothing to ask for, so the scroll handler that calls this on every event
    // costs nothing at all.
    source.loadMore()
    expect(source.options.value).toHaveLength(2)
    dispose()
  })

  it('labels through the caller, and keeps the value it stands for', () => {
    const { source, dispose } = build([1, 2], { optionLabel: (value) => `#${String(value)}` })
    expect(source.options.value).toEqual([
      { value: 1, label: '#1' },
      { value: 2, label: '#2' },
    ])
    // The label lookup answers from the same list, so a closed cell holding a
    // number shows the name rather than the number.
    expect(source.labelFor(2)).toBe('#2')
    // Complete, so an unknown value is genuinely unknown rather than merely
    // unloaded — and the control shows it as itself.
    expect(source.labelFor(3)).toBeUndefined()
    dispose()
  })

  it('filters locally rather than refetching, since the whole list is here', () => {
    const { source, dispose } = build(['Engineering', 'Research', 'Support'])
    source.search.value = 'sea'
    // Matched anywhere in the label, not only at its start: someone using the
    // search box knows a word, and the prefix rule belongs to the typeahead.
    expect(source.options.value.map((option) => option.label)).toEqual(['Research'])
    source.reset()
    expect(source.options.value).toHaveLength(3)
    dispose()
  })

  it('follows a list that changes under it', () => {
    const values = ref<FilterValue[]>(['Design'])
    const { source, dispose } = build(values as never)
    values.value = ['Design', 'Sales']
    expect(source.options.value).toHaveLength(2)
    dispose()
  })

  it('marks an option the caller refuses without dropping it', () => {
    const { source, dispose } = build(['Design', 'Sales'], {
      optionDisabled: (value) => value === 'Sales',
    })
    expect(source.options.value[0]!.disabled).toBeUndefined()
    expect(source.options.value[1]!.disabled).toBe(true)
    dispose()
  })
})
