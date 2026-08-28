<script setup lang="ts">
/**
 * The source of the docs example that covers the open view, one click away.
 *
 * Every view answers "does it do X"; none of them answers "what do I type".
 * The answer already exists as a file — `docs/.vitepress/examples/*.vue`, which
 * the docs site mounts and `pnpm typecheck` covers — so this shows that file
 * rather than restating it. Nothing here is transcribed; the markup arrives
 * from `scripts/vite-plugin-highlight.ts` at build time.
 *
 * Collapsed by default. The views are dense and several scroll for a screen or
 * two, so the code is one click away rather than always in the way.
 */
import { ref } from 'vue'

const props = defineProps<{
  /** Shown in the summary row — the example's filename, as the docs page names it. */
  file: string
  /** What `import x from './x.vue?highlight'` yields. */
  example: { html: string; code: string }
}>()

const copied = ref(false)

async function copy(): Promise<void> {
  try {
    await navigator.clipboard.writeText(props.example.code)
    copied.value = true
    setTimeout(() => (copied.value = false), 1500)
  } catch {
    // Clipboard access can be refused outright — an unfocused document is
    // enough. The code is on screen either way, so there is nothing to recover
    // and nothing worth interrupting for.
    copied.value = false
  }
}
</script>

<template>
  <details class="code-example">
    <summary>
      <span class="code-file">{{ file }}</span>
      <!-- Inside <summary>, so it needs .stop: a click here would otherwise
           toggle the panel shut on the way past. -->
      <button type="button" class="code-copy" @click.stop.prevent="copy()">
        {{ copied ? 'Copied' : 'Copy' }}
      </button>
    </summary>

    <!-- eslint-disable-next-line vue/no-v-html -->
    <div
      class="code-body"
      v-html="example.html"
    ></div>
    <!-- v-html is safe here and it is worth saying why: this markup is produced
         at build time by Shiki from a file in this repository. Nothing a reader
         can supply reaches it. -->
  </details>
</template>

<style scoped>
.code-example {
  border: 1px solid var(--line);
  border-radius: 8px;
  overflow: hidden;
}
summary {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 12px;
  cursor: pointer;
  font-size: 12.5px;
  background: rgb(127 127 127 / 0.07);
  /* `display: flex` on a <summary> drops the native triangle, so the row needs
     its own affordance — otherwise nothing says the panel opens. */
  list-style: none;
}
summary::-webkit-details-marker { display: none; }
summary::before {
  content: '';
  width: 0;
  height: 0;
  border: 4px solid transparent;
  border-left-color: currentColor;
  opacity: 0.55;
  transition: transform 120ms;
}
[open] > summary::before { transform: rotate(90deg); }
.code-file {
  /* Takes the slack, so the Copy button sits at the right edge. */
  margin-right: auto;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  opacity: 0.8;
}
.code-copy { font-size: 12px; }
.code-body { border-top: 1px solid var(--line); }
</style>
