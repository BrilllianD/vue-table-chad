<script setup lang="ts">
/**
 * The source of the docs example that covers the open view, with a note on
 * what to read in it.
 *
 * Every view answers "does it do X"; none of them answers "what do I type".
 * The answer already exists as a file — `docs/.vitepress/examples/*.vue`, which
 * the docs site mounts and `pnpm typecheck` covers — so this shows that file
 * rather than restating it. Nothing here is transcribed; the markup arrives
 * from `scripts/vite-plugin-highlight.ts` at build time.
 *
 * Open by default. It used to start collapsed, on the argument that the views
 * are dense and the code should be one click away; in practice the click was
 * the problem — the panel sits under a view that scrolls for a screen or two,
 * and a closed summary reading only a filename is easy to take for a footer.
 * The code is the point of the panel, so it is on screen, and the summary
 * still folds it for anyone who wants the table alone.
 */
import { ref } from 'vue'
import { segments } from '../inline'

const props = defineProps<{
  /** Shown in the summary row — the example's filename, as the docs page names it. */
  file: string
  /** What `import x from './x.vue?highlight'` yields. */
  example: { html: string; code: string }
  /**
   * What the file sets up and what to look at in it, in a sentence or two.
   * Rendered above the code, so a reader knows what they are scanning for
   * before the first line.
   */
  about: string
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
  <details class="code-example" open>
    <summary>
      <span class="code-file">{{ file }}</span>
      <!-- Inside <summary>, so it needs .stop: a click here would otherwise
           toggle the panel shut on the way past. -->
      <button type="button" class="code-copy" @click.stop.prevent="copy()">
        {{ copied ? 'Copied' : 'Copy' }}
      </button>
    </summary>

    <p class="code-about">
      <component
        :is="part.tag === 'text' ? 'span' : part.tag"
        v-for="(part, index) in segments(about)"
        :key="index"
        >{{ part.text }}</component
      >
    </p>

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
.code-about {
  margin: 0;
  padding: 10px 12px;
  font-size: 13px;
  line-height: 1.5;
  opacity: 0.8;
  border-top: 1px solid var(--line);
}
.code-body { border-top: 1px solid var(--line); }
</style>
