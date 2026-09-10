<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, type Component } from 'vue'
import OverviewView from './views/OverviewView.vue'
import ServerView from './views/ServerView.vue'
import InfiniteView from './views/InfiniteView.vue'
import SelectionView from './views/SelectionView.vue'
import EditingView from './views/EditingView.vue'
import CursorView from './views/CursorView.vue'
import FiltersView from './views/FiltersView.vue'
import GroupingView from './views/GroupingView.vue'
import ColumnsView from './views/ColumnsView.vue'
import HeaderGroupsView from './views/HeaderGroupsView.vue'
import WideColumnsView from './views/WideColumnsView.vue'
import ComposedView from './views/ComposedView.vue'
import HeadlessView from './views/HeadlessView.vue'
import StateView from './views/StateView.vue'
import ThemingView from './views/ThemingView.vue'
import ThemesView from './views/ThemesView.vue'
import LabelsView from './views/LabelsView.vue'
import VirtualView from './views/VirtualView.vue'
import PerfView from './views/PerfView.vue'
import ApiView from './views/ApiView.vue'
import RecipesView from './views/RecipesView.vue'
import { docPages } from '@docs'
import CodeExample from './components/CodeExample.vue'
import { examplesByTab, examplesFor } from './examples'

interface Tab {
  id: string
  label: string
  layer: 'preset' | 'primitives' | 'core'
  component: Component
  /** The docs page that covers this tab, if any — see `docsByTab` below. */
  docs?: string
}

/**
 * `docPages` names its tabs; this is the inverse, a tab id to the page that
 * claims it. Built once from `docs/nav.ts` rather than hand-kept in step with
 * it, which is what closes the loop `tests/docsIndex.spec.ts` case 5 checks
 * from the other direction: every `demoTabs` entry names a real tab here.
 */
const docsByTab = new Map<string, string>()
for (const page of docPages) {
  for (const tabId of page.demoTabs) {
    docsByTab.set(tabId, `/${page.file.replace(/\.md$/, '')}`)
  }
}

/**
 * Ordered by layer, not by importance: preset first, then the primitives it is
 * assembled from, then the pure core underneath both. Reading top to bottom is
 * the same as taking the library apart.
 */
const tabs: Tab[] = (
  [
    { id: 'recipes', label: 'Recipes', layer: 'preset', component: RecipesView },
    { id: 'overview', label: 'Everything at once', layer: 'preset', component: OverviewView },
    { id: 'server', label: 'Server data', layer: 'preset', component: ServerView },
    { id: 'infinite', label: 'Infinite scroll', layer: 'preset', component: InfiniteView },
    { id: 'filters', label: 'Filters', layer: 'preset', component: FiltersView },
    { id: 'grouping', label: 'Grouping', layer: 'preset', component: GroupingView },
    { id: 'editing', label: 'Editing', layer: 'preset', component: EditingView },
    { id: 'cursor', label: 'Cell cursor', layer: 'preset', component: CursorView },
    { id: 'header-groups', label: 'Header bands', layer: 'preset', component: HeaderGroupsView },
    { id: 'wide', label: 'Wide table', layer: 'preset', component: WideColumnsView },
    { id: 'state', label: 'Hoisted state', layer: 'preset', component: StateView },
    { id: 'theming', label: 'Theming', layer: 'preset', component: ThemingView },
    { id: 'themes', label: 'Themes', layer: 'preset', component: ThemesView },
    { id: 'labels', label: 'Labels', layer: 'preset', component: LabelsView },
    { id: 'virtual', label: 'Virtual rows', layer: 'preset', component: VirtualView },
    { id: 'perf', label: 'Performance', layer: 'preset', component: PerfView },
    { id: 'api', label: 'API reference', layer: 'preset', component: ApiView },
    { id: 'selection', label: 'Selection', layer: 'primitives', component: SelectionView },
    { id: 'columns', label: 'Column layout', layer: 'primitives', component: ColumnsView },
    { id: 'composed', label: 'Composed', layer: 'primitives', component: ComposedView },
    { id: 'core', label: 'Core only', layer: 'core', component: HeadlessView },
  ] satisfies Omit<Tab, 'docs'>[]
).map((tab) => ({ ...tab, docs: docsByTab.get(tab.id) }))

/**
 * The open tab lives in the URL, so a docs page can link at the running view of
 * the feature it describes, and a reload keeps you where you were.
 *
 * Only the part before `?` is ours. The Hoisted state view owns the rest and
 * writes `#state?q=...` the whole time it is mounted; reading past the
 * separator would make every keystroke in that view look like a tab change.
 */
function tabFromHash(): string | undefined {
  const id = location.hash.slice(1).split('?')[0]!
  return tabs.some((tab) => tab.id === id) ? id : undefined
}

const active = ref(tabFromHash() ?? 'overview')

function select(id: string): void {
  active.value = id
  // Guarded, not unconditional: clicking the tab you are already on would
  // otherwise rewrite `#state?q=...` down to `#state`, dropping state that view
  // is still holding. Assigning the hash pushes a history entry on purpose —
  // back should undo a tab change, not leave the demo.
  if (tabFromHash() !== id) location.hash = id
}

/**
 * The other direction: back and forward move between tabs. `hashchange` does
 * not fire for `history.replaceState`, which is what the Hoisted state view
 * uses, so this only ever sees real navigation.
 */
function onHashChange(): void {
  active.value = tabFromHash() ?? active.value
}
onMounted(() => window.addEventListener('hashchange', onHashChange))
onUnmounted(() => window.removeEventListener('hashchange', onHashChange))

const current = computed(() => tabs.find((tab) => tab.id === active.value) ?? tabs[0]!)

/**
 * The source panel under the open view.
 *
 * `recipes` renders its own six, interleaved with the prose that explains them,
 * so it is skipped here rather than shown twice. A tab with no example at all
 * shows the sentence saying why instead of nothing — see `examples.ts`.
 */
const examples = computed(() => (active.value === 'recipes' ? [] : examplesFor(active.value)))
const noExampleReason = computed(() => examplesByTab[active.value]?.why)

const layers: Array<{ id: Tab['layer']; label: string; note: string }> = [
  { id: 'preset', label: 'preset', note: 'DataTable + stylesheet' },
  { id: 'primitives', label: 'primitives', note: 'headless components' },
  { id: 'core', label: 'core', note: 'composables + pure functions' },
]
</script>

<template>
  <main>
    <header class="masthead">
      <h1>vue-table-chad</h1>
      <p class="hint">
        Every feature the library has, one view at a time. Each view names the exports it uses, so
        you can read the demo and the API surface at the same time.
      </p>
    </header>

    <nav class="tabs">
      <template v-for="layer in layers" :key="layer.id">
        <span class="tabs-layer" :title="layer.note">{{ layer.label }}</span>
        <button
          v-for="tab in tabs.filter((t) => t.layer === layer.id)"
          :key="tab.id"
          type="button"
          :data-active="active === tab.id || undefined"
          @click="select(tab.id)"
        >
          {{ tab.label }}
        </button>
      </template>
    </nav>

    <p v-if="current.docs" class="hint docs-link">
      <a :href="current.docs">Read the docs for this view</a>
    </p>

    <!-- Keyed so each view gets a clean state when you switch to it — several
         of them own module-level data and deliberately mutable layout. -->
    <component :is="current.component" :key="current.id" />

    <CodeExample
      v-for="example in examples"
      :key="example.file"
      :file="example.file"
      :example="example.source"
    />
    <p v-if="noExampleReason" class="hint">{{ noExampleReason }}</p>

    <footer class="hint">
      Data is generated from a fixed seed, so every reload shows the same 10,000 rows.
    </footer>
  </main>
</template>

<style scoped>
.masthead h1 { margin: 0 0 2px; }
.tabs { display: flex; flex-wrap: wrap; align-items: center; gap: 2px; border-bottom: 1px solid var(--line); }
.tabs-layer {
  font-size: 10.5px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  opacity: 0.45;
  padding: 0 8px 0 12px;
}
.tabs-layer:first-child { padding-left: 0; }
footer { padding-top: 8px; border-top: 1px solid var(--line); }
</style>
