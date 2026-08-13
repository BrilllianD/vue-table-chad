<script setup lang="ts">
/**
 * Excel's checkbox list: search, tri-state "Select All", and a "(Blanks)" row.
 *
 * Works on a draft copy so nothing applies until the user confirms — checking
 * boxes one at a time must not refetch or re-filter on every click.
 */
import { computed, ref, watch } from 'vue'
import type { FacetValue, FilterValue, ValuesFilter } from '../../core/types'
import { facetKey } from '../../core/utils/values'
import SelectionCheckbox from './SelectionCheckbox.vue'

const props = defineProps<{
  facets: FacetValue[]
  modelValue: ValuesFilter | undefined
  loading?: boolean
  /** Renders a value for display (dates, enums, booleans). */
  format?: (value: FilterValue) => string
}>()

const emit = defineEmits<{ 'update:modelValue': [filter: ValuesFilter | undefined] }>()

const search = ref('')

/** Checked facet keys, re-seeded from props by the watcher below. */
const checked = ref<Set<string>>(new Set())
const blanksChecked = ref(true)

const nonBlankFacets = computed(() => props.facets.filter((f) => f.value !== null))
const blankFacet = computed(() => props.facets.find((f) => f.value === null))

/** Re-seed the draft whenever the incoming filter or the facet list changes. */
watch(
  () => [props.modelValue, props.facets] as const,
  () => {
    const filter = props.modelValue
    if (!filter || filter.include === null) {
      // No filter yet: everything starts checked, matching Excel.
      checked.value = new Set(nonBlankFacets.value.map((f) => facetKey(f.value)))
      blanksChecked.value = true
    } else {
      checked.value = new Set(filter.include.map(facetKey))
      blanksChecked.value = filter.includeBlanks
    }
  },
  { immediate: true, deep: true },
)

const filtered = computed(() => {
  const needle = search.value.trim().toLowerCase()
  if (needle === '') return nonBlankFacets.value
  return nonBlankFacets.value.filter((facet) =>
    label(facet.value).toLowerCase().includes(needle),
  )
})

function label(value: FilterValue): string {
  if (value === null) return '(Blanks)'
  if (props.format) return props.format(value)
  return String(value)
}

/** "(Blanks)" is part of the list, so the search box filters it too. */
const blankVisible = computed(() => {
  if (!blankFacet.value) return false
  const needle = search.value.trim().toLowerCase()
  return needle === '' || '(blanks)'.includes(needle)
})

/**
 * Select-all state spans the value rows *and* the blanks row — in Excel,
 * clearing "(Select All)" clears "(Blanks)" with it. Treating blanks
 * separately leaves them checked and silently keeps blank rows in the result.
 */
const allChecked = computed(() => {
  const visible = filtered.value
  if (visible.length === 0 && !blankVisible.value) return false
  const valuesOk = visible.every((facet) => checked.value.has(facetKey(facet.value)))
  return valuesOk && (!blankVisible.value || blanksChecked.value)
})

const someChecked = computed(() => {
  if (allChecked.value) return false
  const anyValue = filtered.value.some((facet) => checked.value.has(facetKey(facet.value)))
  return anyValue || (blankVisible.value && blanksChecked.value)
})

function toggle(value: FilterValue): void {
  const key = facetKey(value)
  const next = new Set(checked.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  checked.value = next
}

/** "Select All" applies only to what the search currently shows, like Excel. */
function toggleAll(): void {
  const next = new Set(checked.value)
  const shouldCheck = !allChecked.value
  for (const facet of filtered.value) {
    const key = facetKey(facet.value)
    if (shouldCheck) next.add(key)
    else next.delete(key)
  }
  checked.value = next
  if (blankVisible.value) blanksChecked.value = shouldCheck
}

function isChecked(value: FilterValue): boolean {
  return checked.value.has(facetKey(value))
}

function buildFilter(): ValuesFilter | undefined {
  const everyValueChecked = nonBlankFacets.value.every((f) => isChecked(f.value))
  const blanksOk = !blankFacet.value || blanksChecked.value
  // Everything checked == no filter at all, so the query stays clean.
  if (everyValueChecked && blanksOk) return undefined

  const include = nonBlankFacets.value
    .filter((facet) => isChecked(facet.value))
    .map((facet) => facet.value)
  return { kind: 'values', include, includeBlanks: blanksChecked.value }
}

function apply(): void {
  emit('update:modelValue', buildFilter())
}

function clear(): void {
  checked.value = new Set(nonBlankFacets.value.map((f) => facetKey(f.value)))
  blanksChecked.value = true
  emit('update:modelValue', undefined)
}

defineExpose({ apply, clear })
</script>

<template>
  <div class="vt-valuelist">
    <input
      v-model="search"
      type="search"
      class="vt-valuelist-search"
      placeholder="Search values…"
      aria-label="Search values"
    />

    <div v-if="loading" class="vt-valuelist-status">Loading…</div>

    <template v-else>
      <label class="vt-valuelist-row vt-valuelist-all">
        <SelectionCheckbox
          :checked="allChecked"
          :indeterminate="someChecked"
          label="Select all"
          @change="toggleAll"
        />
        <span class="vt-valuelist-label">(Select All)</span>
        <span class="vt-valuelist-count">{{ filtered.length + (blankVisible ? 1 : 0) }}</span>
      </label>

      <div class="vt-valuelist-items" role="group">
        <p v-if="filtered.length === 0" class="vt-valuelist-status">No matching values</p>

        <label v-for="facet in filtered" :key="facetKey(facet.value)" class="vt-valuelist-row">
          <SelectionCheckbox
            :checked="isChecked(facet.value)"
            :label="label(facet.value)"
            @change="toggle(facet.value)"
          />
          <span class="vt-valuelist-label" :title="label(facet.value)">{{ label(facet.value) }}</span>
          <span class="vt-valuelist-count">{{ facet.count }}</span>
        </label>

        <label v-if="blankFacet && blankVisible" class="vt-valuelist-row vt-valuelist-blank">
          <SelectionCheckbox
            :checked="blanksChecked"
            label="Blanks"
            @change="blanksChecked = !blanksChecked"
          />
          <span class="vt-valuelist-label">(Blanks)</span>
          <span class="vt-valuelist-count">{{ blankFacet.count }}</span>
        </label>
      </div>
    </template>

    <div class="vt-valuelist-actions">
      <button type="button" class="vt-btn" @click="clear">Clear</button>
      <button type="button" class="vt-btn vt-btn-primary" @click="apply">Apply</button>
    </div>
  </div>
</template>
