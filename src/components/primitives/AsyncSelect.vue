<script setup lang="ts">
/**
 * A dropdown whose options arrive a portion at a time, asked for as the list
 * is scrolled.
 *
 * The counterpart to a `<select>` for a list nobody can afford to send whole:
 * a column of user ids, an account, a product. Everything about *where* the
 * options come from is `useAsyncOptions` and the caller's own fetcher; this
 * component is the control over it — the trigger, the panel, the keyboard, and
 * the one call to `loadMore()` when the list runs out under the scroll.
 *
 *   Alt + ArrowDown/Up    open the panel, and close it again
 *   ArrowDown / ArrowUp   move the active option, panel up
 *   Home / End            first, last
 *   any character         typeahead, unless a search box has the characters
 *   Enter                 choose the active option
 *   Escape                close the panel, leaving whatever was chosen
 *   Tab                   close the panel; the next one leaves the cell
 *
 * Escape and the arrows stop here rather than bubbling, and that is the whole
 * of this component's relationship with the cell cursor and the cell editor
 * above it: inside an open panel those keys belong to the listbox, and a second
 * Escape — with the panel already closed — reaches the editor and cancels the
 * edit. `editorMoveFor` exempts an open panel for the same reason, and only an
 * open one: a **closed** control hands its arrows back, or the cursor would
 * have no way out of the cell at all.
 *
 * **`blur` is not fired for focus that stays inside the control.** The panel is
 * teleported to `<body>`, so moving from the trigger into the search box is a
 * `focusout` at the root and looks exactly like leaving the cell — and a cell
 * editor treats leaving as a save. So the judgement is made here, where the
 * panel's own bounds are known, rather than by whatever is above.
 *
 * Standalone like every primitive: given `source` and `value` it needs no
 * `<TableRoot>` above it, and it ships no CSS.
 */
import { computed, nextTick, ref, watch } from 'vue'
import { useTableLabels, useTableTheme } from '../../core/context'
import type { AsyncOption, AsyncOptionSource, FilterValue } from '../../core/types'
import { useMenuDismiss } from './useMenuDismiss'
import { usePopoverPosition } from './usePopoverPosition'

const props = withDefaults(
  defineProps<{
    /** Where the options come from, from `useAsyncOptions`. */
    source: AsyncOptionSource
    /** The value held now. Labelled through the source, or shown as itself. */
    value?: unknown
    disabled?: boolean
    /** Message to announce and mark the control with. */
    error?: string | null
    /** Labels the control for assistive tech. */
    label?: string
    /** Shown when nothing is chosen. Defaults to the table's `selectPlaceholder`. */
    placeholder?: string
    /** Offer a search box, which the source turns into a new first portion. */
    searchable?: boolean
    /** Refuses the "no value" choice, the way a required column does. */
    required?: boolean
    /** Take focus as soon as this renders — the cell was just opened. */
    autofocus?: boolean
    /**
     * Whether taking focus also opens the panel.
     *
     * On a page the panel is the point of the control, so this defaults to on.
     * Inside a grid cell it is a liability: the panel is teleported and takes
     * focus, and the arrows it claims are the cell cursor's way out of the
     * cell. `CellEditor` turns it off for every dropdown but a seeded one.
     */
    openOnFocus?: boolean
    /**
     * Renders the panel into `<body>` so no ancestor's `overflow` can clip it.
     * Set `false` if you are positioning the panel yourself.
     */
    teleport?: boolean
  }>(),
  // Boolean props cast an absent value to `false`, so defaulting to "on" has to
  // be declared here — `props.teleport ?? true` would never see `undefined`.
  {
    value: undefined,
    error: null,
    disabled: false,
    label: undefined,
    placeholder: undefined,
    searchable: true,
    required: false,
    autofocus: false,
    openOnFocus: true,
    teleport: true,
  },
)

const emit = defineEmits<{
  'update:value': [value: FilterValue]
  /** The option itself, for a caller that wants the label rather than the value. */
  pick: [option: AsyncOption | null]
  /** Focus left the control **and** its panel. What that means is the caller's decision. */
  blur: []
}>()

/** How close to the bottom of the list asking for more begins, in px. */
const LOAD_MORE_OFFSET = 64
/** The panel's declared width, assumed until it has been rendered and measured. */
const PANEL_WIDTH = 240

const open = ref(false)
const root = ref<HTMLElement | null>(null)
const panel = ref<HTMLElement | null>(null)
const list = ref<HTMLElement | null>(null)
const trigger = ref<HTMLButtonElement | null>(null)
const searchBox = ref<HTMLInputElement | null>(null)
const activeIndex = ref(-1)

/*
  Teleported, the panel is no longer under the table, so a forced theme has to
  be stamped on the wrapper for the same reason `.vt-portal` re-declares the
  palette at all. Inline it inherits normally and the attribute would be noise.
*/
const labels = useTableLabels()
/** The prop wins; the record is only where its default comes from. */
const placeholderText = computed(() => props.placeholder ?? labels.value.selectPlaceholder)

const theme = useTableTheme()
const themeAttribute = computed(() =>
  !theme || theme.value === 'system' ? undefined : theme.value,
)

/** Named apart from the `teleport` prop so the template cannot confuse them. */
const teleported = computed(() => props.teleport)

/*
  `source` holds refs, and a prop is not a top-level binding, so the template
  never unwraps them on its own — these are the unwrapping, in one place.
*/
const options = computed(() => props.source.options.value)
const loading = computed(() => props.source.loading.value)
const loadingMore = computed(() => props.source.loadingMore.value)
const initialLoading = computed(() => props.source.initialLoading.value)
const hasMore = computed(() => props.source.hasMore.value)
/*
  Named apart from the `error` prop, which is a different thing entirely: that
  one is the cell's validation message, this one is the portion that failed to
  arrive. A single name would have shadowed the prop in the template.
*/
const loadError = computed(() => props.source.error.value)
/*
  Two-way by design: `source.search` is a ref the source owns, and typing in the
  field is how a caller drives it. `vue/no-mutating-props` sees `props.source.…`
  and stops there — but the write goes *through* the prop into a ref, and the
  prop itself is never reassigned, which is the thing the rule exists to catch.
*/
const search = computed({
  get: () => props.source.search.value,
  set: (term: string) => {
    // eslint-disable-next-line vue/no-mutating-props
    props.source.search.value = term
  },
})

const listId = computed(() => `vt-select-list-${instanceId}`)
const instanceId = Math.random().toString(36).slice(2, 8)

function optionId(index: number): string {
  return `${listId.value}-${index}`
}

/**
 * Whether an option is the one the cell holds.
 *
 * The string comparison is the second half on purpose: a value that arrived
 * from a query string or a `<select>` that once edited this column is the same
 * choice written as text, and showing the id instead of the label for it would
 * be a puzzle rather than an answer.
 */
function isChosen(option: AsyncOption): boolean {
  if (props.value === null || props.value === undefined) return false
  return option.value === props.value || String(option.value) === String(props.value)
}

const chosenLabel = computed(() => {
  if (props.value === null || props.value === undefined || props.value === '') return ''
  const known = props.source.labelFor(props.value as FilterValue)
  if (known !== undefined) return known
  // A value whose portion was never loaded reads as itself. The source never
  // fetches one to find out — see `AsyncOptionSource.labelFor`.
  return String(props.value)
})

/** Trigger and panel together, since the panel may live under `<body>`. */
function contains(node: Node): boolean {
  return Boolean(root.value?.contains(node) || panel.value?.contains(node))
}

const dismiss = useMenuDismiss(open, contains)

const { style: panelStyle, update: updatePosition } = usePopoverPosition({
  root,
  panel,
  open,
  enabled: teleported,
  width: PANEL_WIDTH,
  // Under the cell's own left edge: a cell is usually narrower than the panel,
  // and right-aligning it would hang the list over the column to the left.
  align: 'start',
})

/**
 * Focus left the control for somewhere that is not part of it.
 *
 * `dismiss` closes the panel on the same evidence; the extra test here is not
 * the same question — one is "should this panel still be up", the other is
 * "should whatever owns this control treat the edit as finished", and a
 * `blur` that fired for a click on the panel's own padding would commit a row
 * in the middle of choosing.
 */
function onFocusOut(event: FocusEvent): void {
  dismiss(event)
  const next = event.relatedTarget as Node | null
  if (!next || contains(next)) return
  emit('blur')
}

function openPanel(): void {
  if (props.disabled || open.value) return
  open.value = true
  activeIndex.value = options.value.findIndex(isChosen)
  // The first portion is fetched the same way the tenth is — `loadMore` is a
  // no-op when there is nothing left to ask for, so nothing here counts pages.
  props.source.loadMore()
  updatePosition()
  void nextTick(() => {
    // Again now that the panel has a measurable height, so the flip decision is
    // made against its real size rather than zero.
    updatePosition()
    focusPanel()
    scrollActiveIntoView()
  })
}

function closePanel(focusTrigger = true): void {
  if (!open.value) return
  open.value = false
  if (focusTrigger) trigger.value?.focus()
}

function focusPanel(): void {
  if (props.searchable) searchBox.value?.focus()
  else list.value?.focus()
}

function choose(option: AsyncOption | null): void {
  if (option?.disabled) return
  if (option) props.source.remember(option)
  emit('update:value', option ? option.value : null)
  emit('pick', option)
  closePanel()
}

/** Skips over disabled options, so holding an arrow cannot stall on one. */
function moveActive(delta: number): void {
  const list = options.value
  if (list.length === 0) return
  let index = activeIndex.value
  for (let step = 0; step < list.length; step += 1) {
    index += delta
    if (index < 0) index = list.length - 1
    if (index > list.length - 1) index = 0
    if (!list[index]?.disabled) break
  }
  activeIndex.value = index
  void nextTick(scrollActiveIntoView)
}

function scrollActiveIntoView(): void {
  const element = list.value?.querySelector<HTMLElement>('[data-active]')
  element?.scrollIntoView?.({ block: 'nearest' })
}

/** How long a typed prefix stays open to the next character, in ms. */
const TYPEAHEAD_WINDOW = 700
let typed = ''
let typedAt = 0

/**
 * Walking the list by typing the first letters of an option.
 *
 * What a native select does, and the reason a fixed list needs no search box
 * at all. Characters accumulate while they keep arriving, so `su` reaches
 * Support past Sales; a pause starts a new word rather than extending a stale
 * one, which is the only way out of a prefix that has stopped matching.
 *
 * Skipped when the panel is searchable, where the characters belong to the
 * search box — a better answer over a list nobody can see the whole of, since
 * a prefix can only reach what has already loaded. A key that matches nothing
 * is left alone rather than swallowed, so it still reaches whatever is above.
 */
function onTypeahead(event: KeyboardEvent): void {
  if (props.searchable) return
  if (event.key.length !== 1 || event.ctrlKey || event.metaKey || event.altKey) return

  const now = Date.now()
  typed = now - typedAt > TYPEAHEAD_WINDOW ? event.key : typed + event.key
  typedAt = now

  const needle = typed.toLowerCase()
  const index = options.value.findIndex(
    (option) => !option.disabled && option.label.toLowerCase().startsWith(needle),
  )
  if (index === -1) return

  event.preventDefault()
  event.stopPropagation()
  activeIndex.value = index
  void nextTick(scrollActiveIntoView)
}

function onKeydown(event: KeyboardEvent): void {
  if (!open.value) {
    /*
     * A closed control is a button with a label on it, and a bare arrow over
     * one belongs to whatever is above — a cell cursor, which would otherwise
     * have no way out of the cell this control is in. `Alt`+`↓`/`↑` opens
     * instead: the ARIA combobox convention, and the gesture `editorMoveFor`
     * has always rejected, so the two cannot both answer the same key. Enter,
     * Tab and Escape still go up; only Enter's own default is taken, below.
     */
    if (event.altKey && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      event.preventDefault()
      event.stopPropagation()
      openPanel()
      return
    }
    /*
     * Enter is not ours, but the trigger is a real `<button>`, and a button
     * activates on Enter *keydown* — so left alone it would open the panel on
     * the way past. `preventDefault` suppresses that activation and nothing
     * else: no `stopPropagation`, so the key still reaches the editor above,
     * which commits and moves the cursor down as it does for every other kind.
     *
     * Space is deliberately not here. A button activates on its *keyup*, after
     * this keydown has already gone up unclaimed, and opening the list is what
     * Space over a focused combobox should do.
     */
    if (event.key === 'Enter') event.preventDefault()
    return
  }

  // Closing is the same gesture, which is what makes it a toggle rather than a
  // one-way door — and it has to be read before the open-panel arrows below.
  if (event.altKey && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
    event.preventDefault()
    event.stopPropagation()
    closePanel()
    return
  }

  switch (event.key) {
    case 'ArrowDown':
    case 'ArrowUp':
      event.preventDefault()
      event.stopPropagation()
      moveActive(event.key === 'ArrowDown' ? 1 : -1)
      return
    case 'Home':
    case 'End':
      event.preventDefault()
      event.stopPropagation()
      activeIndex.value = event.key === 'Home' ? 0 : options.value.length - 1
      void nextTick(scrollActiveIntoView)
      return
    case 'Enter': {
      event.preventDefault()
      // Stops here: with the panel up, Enter is the choice, not the commit the
      // editor above reads it as. Closed, the next Enter reaches that editor.
      event.stopPropagation()
      const option = options.value[activeIndex.value]
      if (option) choose(option)
      return
    }
    case 'Escape':
      event.preventDefault()
      // Closes the panel and stops, so the edit survives it. A second Escape
      // finds the panel closed and reaches the editor, which cancels the edit.
      event.stopPropagation()
      closePanel()
      return
    case 'Tab':
      /*
       * Closes the panel and puts focus back on the trigger, and that is all.
       * The next Tab finds the panel closed and reaches whatever owns the cell
       * order — which the first one could not: the panel is teleported to
       * `<body>`, so a key pressed inside it never bubbles to this control's
       * own root, let alone to the editor above it.
       */
      event.preventDefault()
      closePanel()
      return
    default:
      onTypeahead(event)
  }
}

/**
 * Asking for more when the scroll runs out.
 *
 * Nothing is counted or debounced here because `loadMore` refuses a second
 * request while one is in flight and refuses every request once the list is
 * complete — so the handler is allowed to be this blunt.
 */
function onListScroll(event: Event): void {
  const element = event.currentTarget as HTMLElement
  const remaining = element.scrollHeight - element.scrollTop - element.clientHeight
  if (remaining > LOAD_MORE_OFFSET) return
  props.source.loadMore()
}

// The list grows underneath the active option; an option removed by a new
// search must not leave the cursor pointing past the end.
watch(options, (next) => {
  if (activeIndex.value > next.length - 1) activeIndex.value = next.length - 1
})

watch(
  () => props.autofocus,
  (on) => {
    if (!on) return
    void nextTick(() => {
      trigger.value?.focus()
      if (props.openOnFocus) openPanel()
    })
  },
  { immediate: true },
)

defineExpose({ open, focus: () => trigger.value?.focus() })
</script>

<template>
  <span ref="root" class="vt-select" :data-open="open || undefined" @focusout="onFocusOut">
    <button
      ref="trigger"
      type="button"
      class="vt-select-trigger"
      role="combobox"
      :disabled="disabled"
      :aria-expanded="open"
      :aria-controls="listId"
      aria-haspopup="listbox"
      :aria-label="label"
      :aria-invalid="error ? 'true' : undefined"
      :title="error ?? undefined"
      :data-placeholder="chosenLabel ? undefined : ''"
      @click="open ? closePanel() : openPanel()"
      @keydown="onKeydown"
    >
      {{ chosenLabel || placeholderText }}
    </button>

    <!--
      Teleported to `<body>` by default so no ancestor's `overflow` (the scroll
      box, a `<td>`) can clip the panel. `.vt-portal` re-establishes the theme
      variables, which no longer inherit once the panel leaves the table.
    -->
    <Teleport to="body" :disabled="!teleported">
      <div
        v-if="open"
        ref="panel"
        class="vt-select-panel"
        :class="{ 'vt-portal': teleported }"
        :data-theme="teleported ? themeAttribute : undefined"
        :data-inline="!teleported || undefined"
        :style="panelStyle"
        @focusout="onFocusOut"
        @keydown="onKeydown"
      >
        <input
          v-if="searchable"
          ref="searchBox"
          v-model="search"
          type="search"
          class="vt-select-search"
          :placeholder="labels.search"
          :aria-label="labels.searchIn(label)"
          :aria-controls="listId"
          :aria-activedescendant="activeIndex >= 0 ? optionId(activeIndex) : undefined"
          autocomplete="off"
        />

        <ul
          :id="listId"
          ref="list"
          class="vt-select-list"
          role="listbox"
          :tabindex="searchable ? undefined : 0"
          :aria-label="label"
          :aria-activedescendant="
            !searchable && activeIndex >= 0 ? optionId(activeIndex) : undefined
          "
          @scroll="onListScroll"
        >
          <!--
            The way back to blank, unless the caller refuses one — a dropdown
            with no empty choice makes a nullable column one-way.
          -->
          <li
            v-if="!required"
            class="vt-select-option"
            role="option"
            :aria-selected="value === null || value === undefined || value === ''"
            @click="choose(null)"
          >
            &nbsp;
          </li>

          <li
            v-for="(option, index) in options"
            :id="optionId(index)"
            :key="String(option.value)"
            class="vt-select-option"
            role="option"
            :aria-selected="isChosen(option)"
            :aria-disabled="option.disabled || undefined"
            :data-active="index === activeIndex || undefined"
            :data-chosen="isChosen(option) || undefined"
            @click="choose(option)"
            @mousemove="activeIndex = index"
          >
            {{ option.label }}
          </li>

          <li v-if="initialLoading" class="vt-select-status" role="status">
            {{ labels.loading }}
          </li>
          <li
            v-else-if="options.length === 0 && !loadError"
            class="vt-select-status"
            role="status"
          >
            {{ labels.noMatchingOptions }}
          </li>
        </ul>

        <!--
          A button as well as the scroll handler, and not as a courtesy: a list
          whose portion is shorter than the panel produces no scroll event to
          ask on, and a keyboard user never fires one at all.
        -->
        <button
          v-if="hasMore && !initialLoading"
          type="button"
          class="vt-select-more"
          :disabled="loadingMore"
          @click="source.loadMore()"
        >
          {{ loadingMore ? labels.loading : labels.loadMore }}
        </button>

        <p v-if="loadError" class="vt-select-error" role="alert">
          {{ labels.optionsFailed }}
          <button type="button" class="vt-select-retry" @click="source.loadMore()">
            {{ labels.retry }}
          </button>
        </p>
      </div>
    </Teleport>

    <span v-if="loading && !open" class="vt-visually-hidden" role="status">
      {{ labels.loadingOptions }}
    </span>
  </span>
</template>
