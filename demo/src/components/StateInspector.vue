<script setup lang="ts">
/**
 * Renders any value as JSON in a collapsible panel.
 *
 * Every view uses it on the live `QueryState`, because "it is plain JSON" is a
 * claim worth being able to check rather than take on trust.
 */
withDefaults(defineProps<{ label: string; value: unknown; open?: boolean }>(), { open: false })
</script>

<template>
  <details class="inspector" :open="open">
    <summary>{{ label }}</summary>
    <pre>{{ JSON.stringify(value, null, 2) }}</pre>
  </details>
</template>

<style scoped>
.inspector { font-size: 13px; }
.inspector summary { cursor: pointer; opacity: 0.7; }
.inspector pre { margin: 6px 0 0; max-height: 320px; }
</style>
