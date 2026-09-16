<script setup lang="ts">
/**
 * A dropdown over a fixed list of options.
 *
 * Named for the list rather than the control because `Select` is a native
 * element, and the pairing says the useful thing anyway: this and
 * `AsyncSelect` differ only in where their options come from.
 *
 * The counterpart to `AsyncSelect` for a list that is already here — and,
 * underneath, the same control: `useStaticOptions` dresses the list as a source
 * that has finished loading, and everything below the trigger is the panel
 * `AsyncSelect` already renders. One dropdown for both sources, so the
 * keyboard, the teleport clear of a scroll container, the theme and the
 * focus-left-the-panel judgement are written once rather than twice.
 *
 * It replaces a native `<select>` rather than wrapping one, and the trade is
 * deliberate: an `<option>` list is drawn by the operating system and ignores
 * `--vtc-` entirely, cannot be typeahead-matched against a label the column
 * supplied, and reports no open state — which is what the cell cursor needs to
 * know whose arrows are whose. The cost is the OS picker on a touch device.
 *
 * Standalone like every primitive: given `options` and `value` it needs no
 * `<TableRoot>` above it, and it ships no CSS.
 */
import { computed, ref } from 'vue'
import { useStaticOptions } from '../../core/useStaticOptions'
import type { AsyncOption, FilterValue } from '../../core/types'
import AsyncSelect from './AsyncSelect.vue'

const props = withDefaults(
  defineProps<{
    /** The whole list, in the order it should be offered. */
    options: readonly FilterValue[]
    /** The value held now. Shown through `optionLabel`, or as itself. */
    value?: unknown
    /** The text for one option. Defaults to the value itself. */
    optionLabel?: (value: FilterValue) => string
    /** Marks an option rendered but not choosable. */
    optionDisabled?: (value: FilterValue) => boolean
    disabled?: boolean
    /** Message to announce and mark the control with. */
    error?: string | null
    /** Labels the control for assistive tech. */
    label?: string
    /** Shown when nothing is chosen. Defaults to the table's `selectPlaceholder`. */
    placeholder?: string
    /**
     * Offer a search box. **Off** by default, the opposite of `AsyncSelect`:
     * a list that is all here is walked and typed at, and a search box would
     * take the characters the typeahead answers.
     */
    searchable?: boolean
    /** Refuses the "no value" choice, the way a required column does. */
    required?: boolean
    /** Take focus as soon as this renders — the cell was just opened. */
    autofocus?: boolean
    /** Whether taking focus also opens the panel. `AsyncSelect` explains why. */
    openOnFocus?: boolean
    /**
     * Renders the panel into `<body>` so no ancestor's `overflow` can clip it.
     * Set `false` if you are positioning the panel yourself.
     */
    teleport?: boolean
  }>(),
  // Same reason as `AsyncSelect`: a boolean prop casts an absent value to
  // `false`, so defaulting one to "on" has to be declared here.
  {
    value: undefined,
    optionLabel: undefined,
    optionDisabled: undefined,
    error: null,
    disabled: false,
    label: undefined,
    placeholder: undefined,
    searchable: false,
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

const inner = ref<InstanceType<typeof AsyncSelect> | null>(null)

/*
  The two callbacks are read through the props on every call rather than
  captured once, so a caller that swaps a label function gets a relabelled list
  instead of the one the source was built with.
*/
const source = useStaticOptions(
  () => props.options,
  {
    optionLabel: (value) => (props.optionLabel ? props.optionLabel(value) : String(value)),
    optionDisabled: (value) => props.optionDisabled?.(value) ?? false,
  },
)

/** Mirrors the panel's own state, which is what tells an editor whose arrows the keys are. */
const open = computed(() => inner.value?.open ?? false)

defineExpose({ open, focus: () => inner.value?.focus() })
</script>

<template>
  <AsyncSelect
    ref="inner"
    :source="source"
    :value="value"
    :disabled="disabled"
    :error="error"
    :label="label"
    :placeholder="placeholder"
    :searchable="searchable"
    :required="required"
    :autofocus="autofocus"
    :open-on-focus="openOnFocus"
    :teleport="teleport"
    @update:value="emit('update:value', $event)"
    @pick="emit('pick', $event)"
    @blur="emit('blur')"
  />
</template>
