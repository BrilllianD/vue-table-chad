<script setup lang="ts">
/**
 * Chrome around each view: title, why-it-matters blurb, a "try" list, and the
 * API coverage chips.
 *
 * `tryIt` is the bridge between the blurb and the controls: the blurb says
 * what the feature is, the controls let you poke it, and this says what to
 * poke first and what to watch for. Without it the reader lands on a dozen
 * switches named after props and has to guess which one is the story.
 */
defineProps<{
  title: string
  blurb: string
  /** Two or three things to do with the controls below, and what each shows. */
  tryIt?: string[]
  /** The exported names this view demonstrates. */
  api?: string[]
}>()
</script>

<template>
  <section class="demo-section">
    <header>
      <h2>{{ title }}</h2>
      <p class="hint">{{ blurb }}</p>
      <ul v-if="tryIt?.length" class="try">
        <li v-for="(step, index) in tryIt" :key="index">{{ step }}</li>
      </ul>
      <p v-if="api?.length" class="api">
        <code v-for="name in api" :key="name">{{ name }}</code>
      </p>
    </header>

    <!-- A flex row so several `ControlGroup`s sit side by side; anything else
         in the slot — a status line, a results table — takes a full row. -->
    <div v-if="$slots.controls" class="controls-bar">
      <slot name="controls" />
    </div>
    <slot />
  </section>
</template>

<style scoped>
.demo-section { display: flex; flex-direction: column; gap: 14px; }
.demo-section > header { display: flex; flex-direction: column; gap: 4px; }
.try {
  margin: 4px 0 0;
  padding-left: 18px;
  font-size: 13px;
  line-height: 1.5;
  opacity: 0.85;
}
.try li::marker { color: var(--accent); }
.api { display: flex; flex-wrap: wrap; gap: 4px; margin: 4px 0 0; }
.api code {
  font-size: 11.5px;
  padding: 1px 6px;
  border-radius: 4px;
  background: rgb(127 127 127 / 0.14);
}
.controls-bar { display: flex; flex-wrap: wrap; gap: 10px; align-items: flex-start; }
.controls-bar > :deep(:not(.control-group)) { flex-basis: 100%; }
</style>
