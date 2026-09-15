/**
 * A fixed list of options, dressed as the source a paged dropdown reads.
 *
 * `AsyncSelect` is the only dropdown in the library that can be themed, walked
 * with a keyboard and teleported clear of a scroll container, and none of that
 * has anything to do with where its options came from. So a static list stops
 * being a second control and becomes a source that has already finished
 * loading: `hasMore` is false, `loadMore` has nothing to ask for, and every
 * label is known from the start.
 *
 * Pure and DOM-free, so it belongs here rather than beside the component —
 * a caller with no components at all can hold one.
 */
import { computed, ref, toValue, type MaybeRefOrGetter } from 'vue'
import type { AsyncOption, AsyncOptionSource, FilterValue } from './types'

/** How to name each value, and whether the search box filters the list. */
export interface StaticOptionsOptions {
  /**
   * The text shown for a value. Defaults to the value itself.
   *
   * The same function the option list renders with, so the search below and
   * the labels above cannot search one string and show another.
   */
  optionLabel?: (value: FilterValue) => string
  /** Marks an option rendered but not choosable. */
  optionDisabled?: (value: FilterValue) => boolean
}

/**
 * Wraps a fixed option list in the `AsyncOptionSource` a dropdown consumes.
 *
 * The search term filters locally rather than refetching, since the whole list
 * is already here — which is also why `loadMore` and `reset` do nothing and
 * `error` is never anything: there is no request that could fail.
 */
export function useStaticOptions(
  values: MaybeRefOrGetter<readonly FilterValue[]>,
  options: StaticOptionsOptions = {},
): AsyncOptionSource {
  const search = ref('')

  const all = computed<AsyncOption[]>(() =>
    toValue(values).map((value) => ({
      value,
      label: options.optionLabel ? options.optionLabel(value) : String(value),
      ...(options.optionDisabled?.(value) ? { disabled: true } : {}),
    })),
  )

  /*
    Matched anywhere in the label rather than at its start, which is the
    opposite of the typeahead's rule and deliberately so: a typed prefix is
    someone walking the list, a search term is someone who knows a word in the
    middle of the option they want.
  */
  const visible = computed<AsyncOption[]>(() => {
    const needle = search.value.trim().toLowerCase()
    if (needle === '') return all.value
    return all.value.filter((option) => option.label.toLowerCase().includes(needle))
  })

  const labels = computed(() => new Map(all.value.map((option) => [option.value, option.label])))

  return {
    options: visible,
    search,
    loading: computed(() => false),
    initialLoading: computed(() => false),
    loadingMore: computed(() => false),
    hasMore: computed(() => false),
    error: computed(() => null),
    loadMore: () => {},
    reset: () => {
      search.value = ''
    },
    // The list is complete, so an unknown value is genuinely unknown rather
    // than merely unloaded — `undefined` lets the control show it as itself.
    labelFor: (value) => labels.value.get(value),
    remember: () => {},
  }
}
