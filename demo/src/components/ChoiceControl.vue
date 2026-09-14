<script setup lang="ts" generic="T extends string | number | boolean">
/**
 * One value out of a few, as a row of buttons with the current one pressed.
 *
 * For enums of up to four values a segmented row beats a `<select>`: every
 * option is visible at once, so the reader sees what the prop *can* be
 * without opening anything, and switching is one click rather than two.
 * Longer lists — a column picker, a locale — stay a `<select>`.
 *
 * `aria-pressed` rather than radio semantics: these are buttons, and a
 * screen reader reads "pressed" on the current one, which is the state.
 */
const model = defineModel<T>({ required: true })

defineProps<{
  label?: string
  /** Render the label as `<code>`: it is a prop name, not prose. */
  code?: boolean
  options: Array<{ value: T; label: string; title?: string }>
  hint?: string
  disabled?: boolean
}>()
</script>

<template>
  <span class="choice">
    <span v-if="label" class="choice-label">
      <code v-if="code">{{ label }}</code>
      <span v-else>{{ label }}</span>
    </span>
    <span class="choice-segments" role="group" :aria-label="label">
      <button
        v-for="option in options"
        :key="String(option.value)"
        type="button"
        :aria-pressed="model === option.value"
        :title="option.title"
        :disabled="disabled"
        @click="model = option.value"
      >
        {{ option.label }}
      </button>
    </span>
    <span v-if="hint" class="control-note">{{ hint }}</span>
  </span>
</template>
