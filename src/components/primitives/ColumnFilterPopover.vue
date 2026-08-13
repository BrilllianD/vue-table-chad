<script setup lang="ts">
/**
 * The funnel button plus its dropdown, hosting both halves of Excel's filter
 * menu. Facets are fetched only when the panel opens — computing distinct
 * values for every column up front is wasted work, and pointless for a server
 * source.
 */
import { computed, nextTick, ref, watch } from 'vue'
import { useTableContext } from '../../core/context'
import type {
  ColumnDataType,
  ColumnFilter,
  ConditionsFilter,
  FacetValue,
  FilterValue,
  ValuesFilter,
} from '../../core/types'
import ValueListFilter from './ValueListFilter.vue'
import ConditionFilter from './ConditionFilter.vue'

const props = defineProps<{
  columnId: string
  type?: ColumnDataType
  label?: string
  /** Stand-ins for the context, so the popover can be used standalone. */
  modelValue?: ColumnFilter | undefined
  facets?: FacetValue[]
  format?: (value: FilterValue) => string
}>()

const emit = defineEmits<{ 'update:modelValue': [filter: ColumnFilter | undefined] }>()

const context = useTableContext()

const open = ref(false)
const tab = ref<'values' | 'conditions'>('values')
const loading = ref(false)
const loadedFacets = ref<FacetValue[]>([])
const root = ref<HTMLElement | null>(null)

const type = computed<ColumnDataType>(() => props.type ?? 'text')
const current = computed<ColumnFilter | undefined>(
  () => props.modelValue ?? context?.state.filterFor(props.columnId),
)
const hasFilter = computed(() => current.value !== undefined)

const facets = computed(() => props.facets ?? loadedFacets.value)

const valuesModel = computed<ValuesFilter | undefined>(() =>
  current.value?.kind === 'values' ? current.value : undefined,
)
const conditionsModel = computed<ConditionsFilter | undefined>(() =>
  current.value?.kind === 'conditions' ? current.value : undefined,
)

async function loadFacets(): Promise<void> {
  if (props.facets || !context) return
  loading.value = true
  try {
    loadedFacets.value = await context.source.facets(props.columnId)
  } finally {
    loading.value = false
  }
}

watch(open, (isOpen) => {
  if (isOpen) {
    // Start on the tab matching whatever filter already exists.
    tab.value = current.value?.kind === 'conditions' ? 'conditions' : 'values'
    void loadFacets()
    void nextTick(() => root.value?.querySelector('input')?.focus())
  }
})

function commit(filter: ColumnFilter | undefined): void {
  emit('update:modelValue', filter)
  context?.state.setFilter(props.columnId, filter)
  open.value = false
}

function clearFilter(): void {
  commit(undefined)
}

/** Close on an outside click without trapping focus inside the panel. */
function onFocusOut(event: FocusEvent): void {
  const next = event.relatedTarget as Node | null
  if (next && root.value?.contains(next)) return
  open.value = false
}
</script>

<template>
  <div ref="root" class="vt-filter" @focusout="onFocusOut" @keydown.esc="open = false">
    <button
      type="button"
      class="vt-filter-trigger"
      :data-active="hasFilter || undefined"
      :aria-expanded="open"
      :aria-label="`Filter ${label ?? columnId}`"
      :title="hasFilter ? 'Filter applied — click to edit' : 'Filter'"
      @click="open = !open"
    >
      <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
        <path d="M1 2h14l-5.5 6.5V14L6.5 12V8.5L1 2z" fill="currentColor" />
      </svg>
    </button>

    <div v-if="open" class="vt-filter-panel" role="dialog" :aria-label="`Filter ${label ?? columnId}`">
      <div class="vt-filter-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          class="vt-filter-tab"
          :data-active="tab === 'values' || undefined"
          :aria-selected="tab === 'values'"
          @click="tab = 'values'"
        >
          Values
        </button>
        <button
          type="button"
          role="tab"
          class="vt-filter-tab"
          :data-active="tab === 'conditions' || undefined"
          :aria-selected="tab === 'conditions'"
          @click="tab = 'conditions'"
        >
          Conditions
        </button>
        <button
          v-if="hasFilter"
          type="button"
          class="vt-btn vt-btn-link vt-filter-clear"
          @click="clearFilter"
        >
          Clear
        </button>
      </div>

      <ValueListFilter
        v-if="tab === 'values'"
        :facets="facets"
        :loading="loading"
        :model-value="valuesModel"
        :format="format"
        @update:model-value="commit"
      />
      <ConditionFilter
        v-else
        :type="type"
        :model-value="conditionsModel"
        @update:model-value="commit"
      />
    </div>
  </div>
</template>
