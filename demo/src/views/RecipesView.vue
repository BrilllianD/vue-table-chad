<script setup lang="ts">
/**
 * The copy-paste layer.
 *
 * Every other view is a live table you can poke; this one is the code you would
 * write to get there. It exists because a demo answers "does it do X" and a
 * reference answers "what is X called", but neither answers "what do I type" —
 * and that is the question someone arriving at a table library actually has.
 *
 * The code itself is not here. Each recipe names the file under
 * `docs/.vitepress/examples/` that the docs page runs, and `CodeExample` shows
 * that file — so the recipe exists once, as something that compiles, rather
 * than twice with one copy free to drift.
 */
import DemoSection from '../components/DemoSection.vue'
import CodeExample from '../components/CodeExample.vue'
import { exampleFiles } from '../examples'

interface Recipe {
  id: string
  title: string
  /** Why you would reach for this, in one or two sentences. */
  why: string
  /** The example under `docs/.vitepress/examples/`, keyed as `examples.ts` keys it. */
  file: string
}

/**
 * A `why` split into the pieces it should render as.
 *
 * The strings carry Markdown's two inline marks — `` `code` `` and `*emphasis*`
 * — because they are lifted from the README, and interpolating one straight
 * into the template put the punctuation on the screen. Segments rather than
 * `v-html`: the copy is static and safe today, and a helper that renders any
 * string as markup is the sort of thing someone later feeds a variable.
 *
 * One regex, alternating: whatever is between the marks becomes the segment's
 * text, and which mark matched decides the tag.
 */
interface Segment {
  tag: 'code' | 'em' | 'text'
  text: string
}

function segments(why: string): Segment[] {
  const out: Segment[] = []
  let last = 0
  for (const match of why.matchAll(/`([^`]+)`|\*([^*]+)\*/g)) {
    if (match.index > last) out.push({ tag: 'text', text: why.slice(last, match.index) })
    out.push(match[1] ? { tag: 'code', text: match[1] } : { tag: 'em', text: match[2]! })
    last = match.index + match[0].length
  }
  if (last < why.length) out.push({ tag: 'text', text: why.slice(last) })
  return out
}

const recipes: Recipe[] = [
  {
    id: 'quick-start',
    title: 'A table, from nothing',
    why: `Three pieces: state (what to show), a source (where rows come from), and the preset that
          renders them. \`type\` is what makes filters and sorting behave — it picks the comparator
          and decides which operators the filter panel offers.`,
    file: 'recipe-1.vue',
  },
  {
    id: 'server',
    title: 'Rows from a server',
    why: `Swap the source and nothing above it changes — both satisfy the same \`DataSource\`
          contract. You get debouncing on filter/search/sort but never on paging, abort and
          race-safety so a slow earlier response cannot overwrite a fast later one, and
          \`keepPreviousData\` so the table does not blank out between pages.`,
    file: 'recipe-2.vue',
  },
  {
    id: 'url',
    title: 'A shareable table',
    why: `\`QueryState\` is deliberately JSON-safe, so the whole view — sort, filters, page, search —
          fits in a URL. Hand \`useTableState\` a ref and it mirrors both ways: the table writes to
          it, and a back button writes back to the table.`,
    file: 'recipe-3.vue',
  },
  {
    id: 'grouping',
    title: 'Banded rows, with totals',
    why: `Declare an \`aggregate\` on a column and every band gets that figure, plus the footer if
          you ask for one. \`groupMode\` decides who does the work: \`'client'\` bands the rows already
          loaded and never refetches, \`'server'\` puts the grouping in the query so bands stay whole
          across pages and counts describe the entire group.`,
    file: 'recipe-4.vue',
  },
  {
    id: 'theming',
    title: 'Retheming without touching a component',
    why: `The preset's stylesheet hangs entirely off CSS variables. One thing to get right: a
          palette is a *set*. Overriding a light header colour while \`--vtc-text\` stays on its
          dark-mode value gives you white-on-white.`,
    file: 'recipe-5.vue',
  },
  {
    id: 'composed',
    title: 'When the preset does not fit',
    why: `\`TableRoot\` renders nothing of its own — the slot receives everything and decides the
          markup entirely. The preset is just one caller of it. Drop to the primitives and the same
          state, sorting, filtering and selection drive whatever you build, table or not.`,
    file: 'recipe-6.vue',
  },
]
</script>

<template>
  <DemoSection
    title="Recipes"
    blurb="What to type. Every other view is a live table you can poke; this is the code that gets
           you one. Each one is the whole file the matching docs page runs, not an excerpt."
    :api="['DataTable', 'useTableState', 'useLocalDataSource', 'useServerDataSource', 'TableRoot']"
  >
    <div class="recipes">
      <article v-for="recipe in recipes" :key="recipe.id" class="recipe">
        <h3>{{ recipe.title }}</h3>
        <p class="hint">
          <component
            :is="part.tag === 'text' ? 'span' : part.tag"
            v-for="(part, index) in segments(recipe.why)"
            :key="index"
            >{{ part.text }}</component
          >
        </p>
        <CodeExample :file="recipe.file" :example="exampleFiles[recipe.file]!" />
      </article>
    </div>
  </DemoSection>
</template>

<style scoped>
.recipes { display: flex; flex-direction: column; gap: 26px; }
.recipe { display: flex; flex-direction: column; gap: 8px; }
.recipe h3 { margin: 0; font-size: 15px; }
</style>
