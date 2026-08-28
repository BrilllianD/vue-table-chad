<script setup lang="ts">
/**
 * Mounts one page's live example inside a bordered region.
 *
 * The preset stylesheet is imported here, once, site-wide — the same reason
 * `demo/src/main.ts` does it (`demo/README.md`, "Layout") — rather than by
 * every example importing it themselves. The `@brillliand/vue-table-chad`
 * alias below points at `src/index.ts` directly (a file, not a package), so a
 * subpath import through it cannot resolve; `demo/src/main.ts` reaches the
 * same file this way for the same reason.
 */
import '../../../src/components/preset/table.css'

defineProps<{ is: unknown }>()
</script>

<template>
  <div class="vt-demo-frame">
    <component :is="is" />
  </div>
</template>

<style scoped>
.vt-demo-frame {
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  padding: 16px;
  margin: 16px 0;
  overflow: auto;
}
</style>
