<script setup lang="ts">
import { computed, ref, type Component } from 'vue'
import OverviewView from './views/OverviewView.vue'
import ServerView from './views/ServerView.vue'
import SelectionView from './views/SelectionView.vue'
import FiltersView from './views/FiltersView.vue'
import GroupingView from './views/GroupingView.vue'
import ColumnsView from './views/ColumnsView.vue'
import ComposedView from './views/ComposedView.vue'
import HeadlessView from './views/HeadlessView.vue'
import StateView from './views/StateView.vue'
import ThemingView from './views/ThemingView.vue'
import PerfView from './views/PerfView.vue'

interface Tab {
  id: string
  label: string
  layer: 'preset' | 'primitives' | 'core'
  component: Component
}

/**
 * Ordered by layer, not by importance: preset first, then the primitives it is
 * assembled from, then the pure core underneath both. Reading top to bottom is
 * the same as taking the library apart.
 */
const tabs: Tab[] = [
  { id: 'overview', label: 'Everything at once', layer: 'preset', component: OverviewView },
  { id: 'server', label: 'Server data', layer: 'preset', component: ServerView },
  { id: 'filters', label: 'Filters', layer: 'preset', component: FiltersView },
  { id: 'grouping', label: 'Grouping', layer: 'preset', component: GroupingView },
  { id: 'state', label: 'Hoisted state', layer: 'preset', component: StateView },
  { id: 'theming', label: 'Theming', layer: 'preset', component: ThemingView },
  { id: 'perf', label: 'Performance', layer: 'preset', component: PerfView },
  { id: 'selection', label: 'Selection', layer: 'primitives', component: SelectionView },
  { id: 'columns', label: 'Column layout', layer: 'primitives', component: ColumnsView },
  { id: 'composed', label: 'Composed', layer: 'primitives', component: ComposedView },
  { id: 'core', label: 'Core only', layer: 'core', component: HeadlessView },
]

const active = ref('overview')
const current = computed(() => tabs.find((tab) => tab.id === active.value) ?? tabs[0]!)

const layers: Array<{ id: Tab['layer']; label: string; note: string }> = [
  { id: 'preset', label: 'preset', note: 'DataTable + stylesheet' },
  { id: 'primitives', label: 'primitives', note: 'headless components' },
  { id: 'core', label: 'core', note: 'composables + pure functions' },
]
</script>

<template>
  <main>
    <header class="masthead">
      <h1>vue-table</h1>
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
          @click="active = tab.id"
        >
          {{ tab.label }}
        </button>
      </template>
    </nav>

    <!-- Keyed so each view gets a clean state when you switch to it — several
         of them own module-level data and deliberately mutable layout. -->
    <component :is="current.component" :key="current.id" />

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
