<script setup lang="ts">
/**
 * A boolean control drawn as a switch.
 *
 * The native checkbox stays in the markup — visually hidden, still focusable,
 * still the thing a screen reader names — and the track beside it is only
 * paint. The label is the prop name when `code` is set, because in this demo
 * the control *is* the API: reading `showFooter` next to the switch is how the
 * reader learns what to type. The `hint` is the plain-language half.
 */
const model = defineModel<boolean>({ required: true })

defineProps<{
  label: string
  /** Render the label as `<code>`: it is a prop or option name, not prose. */
  code?: boolean
  /** What flipping it does, when the name alone does not say. */
  hint?: string
  disabled?: boolean
}>()
</script>

<template>
  <label class="toggle" :class="{ 'toggle-on': model }">
    <input v-model="model" type="checkbox" class="toggle-input" :disabled="disabled" />
    <span class="toggle-track" aria-hidden="true"><span class="toggle-knob" /></span>
    <span class="toggle-text">
      <code v-if="code">{{ label }}</code>
      <span v-else>{{ label }}</span>
      <span v-if="hint" class="control-note">{{ hint }}</span>
    </span>
  </label>
</template>
