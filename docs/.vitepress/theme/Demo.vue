<script setup lang="ts">
/**
 * Mounts one page's live example inside a bordered region.
 *
 * No stylesheet import here on purpose: each example imports
 * `@brillliand/vue-table-chad/style.css` itself, exactly as a consumer's file
 * would, so the code on the page is the whole of what a reader pastes.
 * Inside this repo that subpath is an alias onto
 * `src/components/preset/table.css` — see `docs/.vitepress/config.ts`, where
 * it is listed before the bare package alias because the first match wins.
 */
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

<style>
/*
  VitePress styles every table inside `.vp-doc`, live examples included: the
  table becomes `display: block`, each cell gets a border and padding, each row
  a stripe. Those rules are `.vp-doc td` — one class and one tag — and the
  preset's are one class, so the preset loses every property both of them set.
  The one that mattered most: a fixed-layout table the preset sizes with
  `width: 0` and VitePress turns into a block renders as nothing at all.

  Each rule below sits one tag above VitePress's selector — `.vt-demo-frame
  table td`, not `.vp-doc td` — and no higher: enough to win, not enough to
  beat any preset rule carrying a second class or an attribute (pinning,
  alignment, stripes, the footer, a folded band), which keep winning as they
  do outside the docs. It restates only the properties VitePress touched, with
  the preset's own tokens, so a page's theme override still reads through.
  Unscoped, because a scoped `:deep()` adds an attribute selector and would
  beat those preset rules too.

  A docs-site shim, and nothing a consumer needs: outside `.vp-doc` no rule
  of VitePress's applies.
*/
.vt-demo-frame table.vt-table {
  display: table;
  border-collapse: separate;
  margin: 0;
  overflow-x: visible;
}

.vt-demo-frame .vt-table :is(thead, tbody, tfoot) tr {
  background-color: transparent;
  border-top: 0;
  transition: none;
}

.vt-demo-frame table :is(th, td) {
  border: 0;
  padding: 0;
  font-size: inherit;
  font-weight: inherit;
  color: inherit;
  text-align: left;
  background-color: transparent;
}

.vt-demo-frame table :is(th, td):where(.vt-th, .vt-td) {
  padding: 0 var(--vtc-cell-padding-x);
  border-bottom: var(--vtc-body-border-width) solid var(--vtc-body-border-color);
  background-color: var(--vtc-bg);
}

.vt-demo-frame table th:where(.vt-th) {
  font-weight: var(--vtc-weight-bold);
  border-bottom: var(--vtc-header-border-width) solid var(--vtc-header-border-color);
  background-color: var(--vtc-header-bg);
}

.vt-demo-frame table :where(.vt-row-message) td {
  padding: var(--vtc-space-8) var(--vtc-space-6);
  text-align: center;
  color: var(--vtc-text-muted);
}
</style>
