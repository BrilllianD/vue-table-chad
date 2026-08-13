<script setup lang="ts">
/** Chrome around each view: title, why-it-matters blurb, and API coverage chips. */
defineProps<{
  title: string
  blurb: string
  /** The exported names this view demonstrates. */
  api?: string[]
}>()
</script>

<template>
  <section class="demo-section">
    <header>
      <h2>{{ title }}</h2>
      <p class="hint">{{ blurb }}</p>
      <p v-if="api?.length" class="api">
        <code v-for="name in api" :key="name">{{ name }}</code>
      </p>
    </header>

    <slot name="controls" />
    <slot />
  </section>
</template>

<style scoped>
.demo-section { display: flex; flex-direction: column; gap: 14px; }
.demo-section > header { display: flex; flex-direction: column; gap: 4px; }
.api { display: flex; flex-wrap: wrap; gap: 4px; margin: 4px 0 0; }
.api code {
  font-size: 11.5px;
  padding: 1px 6px;
  border-radius: 4px;
  background: rgb(127 127 127 / 0.14);
}
</style>
