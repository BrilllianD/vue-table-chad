<script setup lang="ts">
/**
 * One labelled cluster of controls — a `<fieldset>` with a legend, so a view
 * with a dozen switches can say which ones belong together instead of
 * running them all into one strip separated by a 1px rule.
 *
 * A fieldset rather than a div with a heading: the legend is what a screen
 * reader announces on entering the group, and the browser gives the whole
 * thing keyboard order for free. The default styling is reset in
 * `styles.css`, which is also where the shared control rules live.
 */
defineProps<{
  /** What the group is about, in a word or two. Omit for a single ungrouped row. */
  legend?: string
  /** A sentence under the controls, for what the group as a whole demonstrates. */
  hint?: string
}>()
</script>

<template>
  <fieldset class="control-group">
    <legend v-if="legend">{{ legend }}</legend>
    <div class="control-row">
      <slot />
    </div>
    <p v-if="hint" class="control-hint">{{ hint }}</p>
    <!-- For a hint that needs markup — a <code> or a <strong> — where the
         string prop cannot carry it. -->
    <p v-if="$slots.hint" class="control-hint"><slot name="hint" /></p>
  </fieldset>
</template>
