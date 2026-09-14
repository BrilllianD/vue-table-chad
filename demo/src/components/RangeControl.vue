<script setup lang="ts">
/**
 * A number on a slider, with the value read out beside the label.
 *
 * Three views hand-rolled this as a bare `<input type="range">` with the
 * number interpolated into the label text. Same thing, once: the readout is
 * an `<output>`, which is what the element is for, and the unit is a prop so
 * `450 ms` and `3 px` are spelled the same way everywhere.
 */
const model = defineModel<number>({ required: true })

defineProps<{
  label: string
  /** Render the label as `<code>`: it is a prop name, not prose. */
  code?: boolean
  min: number
  max: number
  step?: number
  /** Appended to the readout: `ms`, `px`, `rows`. */
  unit?: string
  hint?: string
}>()
</script>

<template>
  <label class="range">
    <span class="range-label">
      <code v-if="code">{{ label }}</code>
      <span v-else>{{ label }}</span>
      <output class="range-value">{{ model }}{{ unit ? ` ${unit}` : '' }}</output>
    </span>
    <input v-model.number="model" type="range" :min="min" :max="max" :step="step ?? 1" />
    <span v-if="hint" class="control-note">{{ hint }}</span>
  </label>
</template>
