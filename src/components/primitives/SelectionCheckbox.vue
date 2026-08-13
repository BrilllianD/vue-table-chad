<script setup lang="ts">
/**
 * A checkbox that understands the indeterminate state.
 *
 * `indeterminate` is a DOM property, not an attribute, so it has to be written
 * through a ref — binding it in the template silently does nothing.
 */
import { ref, watchEffect } from 'vue'

const props = defineProps<{
  checked: boolean
  indeterminate?: boolean
  disabled?: boolean
  label?: string
}>()

const emit = defineEmits<{ change: [checked: boolean, event: MouseEvent] }>()

const input = ref<HTMLInputElement | null>(null)

watchEffect(() => {
  if (input.value) input.value.indeterminate = props.indeterminate ?? false
})

function onClick(event: MouseEvent): void {
  if (props.disabled) return
  emit('change', !props.checked, event)
}
</script>

<template>
  <input
    ref="input"
    type="checkbox"
    class="vt-checkbox"
    :checked="checked"
    :disabled="disabled"
    :aria-label="label"
    @click.stop="onClick"
  />
</template>
