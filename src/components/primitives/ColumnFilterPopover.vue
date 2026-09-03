<script setup lang="ts">
/**
 * The funnel and its panel, teleported out of the scroll container.
 *
 * The panel hosts both halves of Excel's filter menu. Facets are fetched only
 * when it opens — computing distinct values for every column up front is
 * wasted work, and pointless for a server source.
 */
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useTableContext, useTableTheme } from '../../core/context'
import type {
  ColumnDataType,
  ColumnFilter,
  ConditionsFilter,
  FacetValue,
  FilterValue,
  ValuesFilter,
} from '../../core/types'
import { usePopoverPosition } from './usePopoverPosition'
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

/*
  Teleported, the panel is no longer under the table, so a forced theme has to
  be stamped on the wrapper for the same reason `.vt-portal` re-declares the
  palette at all. Inline (`teleport: false`) it inherits normally and the
  attribute would be noise.
*/
const theme = useTableTheme()
const themeAttribute = computed(() =>
  !theme || theme.value === 'system' ? undefined : theme.value,
)

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

/** The panel's declared width, assumed until it has been rendered and measured. */
const PANEL_WIDTH = 268

/*
  Right-aligned like Excel's. The arithmetic, the ResizeObserver and the
  scroll/resize listeners are `usePopoverPosition`, shared with the dropdown
  that `AsyncSelect` teleports — none of it is specific to a filter panel, and
  a second copy would be a second thing to get wrong low on a page.
*/
const { style: panelStyle, update: updatePosition } = usePopoverPosition({
  root,
  panel,
  open,
  enabled: teleported,
  width: PANEL_WIDTH,
})

function onPointerDownOutside(event: Event): void {
  const target = event.target as Node | null
  if (target && contains(target)) return
  open.value = false
}

/** Dismissal only; the panel's own position binds its listeners itself. */
function bindDismissListener(active: boolean): void {
  const method = active ? 'addEventListener' : 'removeEventListener'
  document[method]('pointerdown', onPointerDownOutside, true)
}

watch(open, (isOpen) => {
  bindDismissListener(isOpen)
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
  bindDismissListener(false)
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
        :data-theme="teleported ? themeAttribute : undefined"
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
