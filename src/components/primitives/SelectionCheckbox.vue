<script setup lang="ts">
/**
 * A checkbox that understands the indeterminate state.
 *
 * `indeterminate` is a DOM property, not an attribute, so it has to be written
 * through a ref — binding it in the template silently does nothing. `checked`
 * gets the same treatment, for a subtler reason.
 *
 * A click on a checkbox mutates the DOM behind Vue's back: the browser flips
 * `checked` as part of the click's activation behaviour, before any handler
 * runs. That leaves two ways for the input to end up lying about the model,
 * and only writing the property ourselves fixes both:
 *
 *  - The handler declines the change (a header "select all" over a page of
 *    unselectable rows). The prop never changes, so Vue patches nothing, and
 *    the box stays visibly ticked for a selection that does not exist.
 *  - The handler accepts it. Vue patches `checked` to a value the browser has
 *    already set, so the patch is a no-op — and the vnode now records `true`
 *    for good, so no later render will correct the element.
 *
 * `preventDefault()` is not the answer: for a *trusted* click the browser's
 * "canceled activation" revert runs after the microtask checkpoint, i.e. after
 * Vue has patched, so it silently undoes the patch and the vnode goes stale.
 * (Synthetic `.click()` reverses that order, which is why this only reproduces
 * with a real mouse.) So let the browser toggle, and re-assert the model after
 * the update lands.
 */
import { nextTick, ref, watchEffect } from 'vue'

const props = defineProps<{
  checked: boolean
  indeterminate?: boolean
  disabled?: boolean
  label?: string
}>()

const emit = defineEmits<{ change: [checked: boolean, event: MouseEvent] }>()

const input = ref<HTMLInputElement | null>(null)

/** Forces the element back onto whatever the model currently says. */
function sync(): void {
  const el = input.value
  if (!el) return
  el.checked = props.checked
  el.indeterminate = props.indeterminate ?? false
}

// `post`, so it runs after Vue has patched the element rather than before.
watchEffect(sync, { flush: 'post' })

function onClick(event: MouseEvent): void {
  if (props.disabled) return
  emit('change', !props.checked, event)
  // Runs whether or not the model moved — the "declined" case is exactly the
  // one where no prop changes and nothing else would put the DOM back.
  void nextTick(sync)
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
