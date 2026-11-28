import { afterEach, describe, expect, it, vi } from 'vitest'
import { effectScope } from 'vue'
import { useLocalDataSource } from '../src/core/useLocalDataSource'
import { useTableState } from '../src/core/useTableState'
import { people, personColumns } from './fixtures'

/**
 * A pending debounced search must not outlive its scope.
 *
 * The local source clears its timer in `onScopeDispose`; without that a
 * disposed table still fires a search into a source nobody reads.
 */
afterEach(() => {
  vi.useRealTimers()
})

describe('local search timer', () => {
  it('clears a pending search timer when its scope is disposed', () => {
    vi.useFakeTimers()
    const scope = effectScope()
    const state = scope.run(() => {
      const state = useTableState({ pageSize: 100 })
      useLocalDataSource(people, personColumns, state.query, { debounceMs: 150 })
      return state
    })!

    state.setSearch('research')
    expect(vi.getTimerCount()).toBe(1)

    scope.stop()
    expect(vi.getTimerCount()).toBe(0)
  })
})
