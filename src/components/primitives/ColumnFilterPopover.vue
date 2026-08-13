<script setup lang="ts">
/**
 * The funnel button plus its dropdown, hosting both halves of Excel's filter
 * menu. Facets are fetched only when the panel opens — computing distinct
 * values for every column up front is wasted work, and pointless for a server
 * source.
 */
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
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

const props = withDefaults(
  defineProps<{
    columnId: string
    type?: ColumnDataType
    label?: string
    /** Stand-ins for the context, so the popover can be used standalone. */
    modelValue?: ColumnFilter | undefined
    facets?: FacetValue[]
    format?: (value: FilterValue) => string
    /**
     * Renders the panel into `<body>` so no ancestor's `overflow` can clip it.
     * Set `false` if you are positioning the panel yourself.
     */
    teleport?: boolean
  }>(),
  // Boolean props cast an absent value to `false`, so defaulting to "on" has to
  // be declared here — `props.teleport ?? true` would never see `undefined`.
  { teleport: true },
)

const emit = defineEmits<{ 'update:modelValue': [filter: ColumnFilter | undefined] }>()

const context = useTableContext()

const open = ref(false)
const tab = ref<'values' | 'conditions'>('values')
const loading = ref(false)
const loadedFacets = ref<FacetValue[]>([])
const facetError = ref<unknown>(null)
const root = ref<HTMLElement | null>(null)
const panel = ref<HTMLElement | null>(null)

/** Named apart from the `teleport` prop so the template cannot confuse them. */
const teleported = computed(() => props.teleport)

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
  facetError.value = null
  try {
    loadedFacets.value = await context.source.facets(props.columnId)
  } catch (caught) {
    // A remote facet endpoint can fail. Surface it in the panel rather than
    // letting the rejection escape and leaving an empty checklist unexplained.
    facetError.value = caught
    loadedFacets.value = []
  } finally {
    loading.value = false
  }
}

/* ------------------------------------------------------------- positioning */

const PANEL_WIDTH = 268
const GAP = 4
const MARGIN = 8

const position = ref<{ top: number; left: number }>({ top: 0, left: 0 })

/**
 * Anchors the fixed-position panel under the trigger, right-aligned like
 * Excel's, and clamped into the viewport so an edge column's panel stays fully
 * on screen. Flips above the trigger when there is no room below.
 */
function updatePosition(): void {
  if (!teleported.value || !root.value) return
  const rect = root.value.getBoundingClientRect()
  const width = panel.value?.offsetWidth || PANEL_WIDTH
  const height = panel.value?.offsetHeight ?? 0
  const viewportWidth = window.innerWidth || 0
  const viewportHeight = window.innerHeight || 0

  const maxLeft = Math.max(MARGIN, viewportWidth - width - MARGIN)
  const left = Math.min(Math.max(rect.right - width, MARGIN), maxLeft)

  const below = rect.bottom + GAP
  const flip = height > 0 && below + height > viewportHeight - MARGIN && rect.top - height > MARGIN
  const top = flip ? rect.top - height - GAP : below
  // Clamp as a last resort, for when the panel fits neither above nor below.
  const maxTop = Math.max(MARGIN, viewportHeight - height - MARGIN)
  position.value = { top: Math.min(Math.max(top, MARGIN), maxTop), left }
}

/**
 * The panel changes height after it opens — facets arrive, the search box
 * narrows the list, the Conditions tab is a different shape entirely. Position
 * it again whenever that happens, or a tall panel opened low on the page stays
 * hanging off the bottom of the viewport.
 */
let resizeObserver: ResizeObserver | undefined

watch(panel, (element) => {
  resizeObserver?.disconnect()
  resizeObserver = undefined
  if (!element || typeof ResizeObserver === 'undefined') return
  resizeObserver = new ResizeObserver(() => updatePosition())
  resizeObserver.observe(element)
})

const panelStyle = computed(() =>
  teleported.value ? { top: `${position.value.top}px`, left: `${position.value.left}px` } : undefined,
)

function onPointerDownOutside(event: Event): void {
  const target = event.target as Node | null
  if (target && contains(target)) return
  open.value = false
}

function bindWindowListeners(active: boolean): void {
  const method = active ? 'addEventListener' : 'removeEventListener'
  // Capture, so scrolling any ancestor container repositions the panel too.
  window[method]('scroll', updatePosition, true)
  window[method]('resize', updatePosition)
  document[method]('pointerdown', onPointerDownOutside, true)
}

watch(open, (isOpen) => {
  bindWindowListeners(isOpen)
  if (!isOpen) return
  // Start on the tab matching whatever filter already exists.
  tab.value = current.value?.kind === 'conditions' ? 'conditions' : 'values'
  void loadFacets()
  updatePosition()
  void nextTick(() => {
    // Re-run now that the panel has a measurable height, so the flip decision
    // is made against its real size rather than zero.
    updatePosition()
    panelInput()?.focus()
  })
})

// The panel may be teleported out of `root`, so search both.
function panelInput(): HTMLInputElement | null {
  return (panel.value ?? root.value)?.querySelector('input') ?? null
}

onBeforeUnmount(() => {
  bindWindowListeners(false)
  resizeObserver?.disconnect()
})

function commit(filter: ColumnFilter | undefined): void {
  emit('update:modelValue', filter)
  context?.state.setFilter(props.columnId, filter)
  open.value = false
}

function clearFilter(): void {
  commit(undefined)
}

/** Trigger and panel together, since the panel may live under `<body>`. */
function contains(node: Node): boolean {
  return Boolean(root.value?.contains(node) || panel.value?.contains(node))
}

/**
 * Close when focus leaves for somewhere else. A null `relatedTarget` means the
 * click landed on something unfocusable — often the panel's own padding — so
 * that case is left to the outside-pointerdown listener instead of closing a
 * panel the user is still working in.
 */
function onFocusOut(event: FocusEvent): void {
  const next = event.relatedTarget as Node | null
  if (!next || contains(next)) return
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

    <!--
      Teleported to `<body>` by default so no ancestor's `overflow` (the scroll
      box, a `<th>`) can clip the panel. `.vt-portal` re-establishes the theme
      variables, which no longer inherit once the panel leaves the table.
    -->
    <Teleport to="body" :disabled="!teleported">
      <div
        v-if="open"
        ref="panel"
        class="vt-filter-panel"
        :class="{ 'vt-portal': teleported }"
        :data-inline="!teleported || undefined"
        :style="panelStyle"
        role="dialog"
        :aria-label="`Filter ${label ?? columnId}`"
        @focusout="onFocusOut"
        @keydown.esc="open = false"
      >
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

      <p v-if="facetError" class="vt-filter-error" role="alert">
        Could not load filter values.
        <button type="button" class="vt-btn vt-btn-link" @click="loadFacets()">Retry</button>
      </p>

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
    </Teleport>
  </div>
</template>
