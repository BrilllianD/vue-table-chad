<script setup lang="ts">
import { ref } from 'vue'
import LocalBasic from './examples/LocalBasic.vue'
import ServerMocked from './examples/ServerMocked.vue'
import ComposedCustom from './examples/ComposedCustom.vue'
import UrlSyncedState from './examples/UrlSyncedState.vue'

const tabs = [
  { id: 'local', label: 'Local data', component: LocalBasic },
  { id: 'server', label: 'Server data', component: ServerMocked },
  { id: 'composed', label: 'Composed', component: ComposedCustom },
  { id: 'url', label: 'URL state', component: UrlSyncedState },
] as const

const active = ref<(typeof tabs)[number]['id']>('local')
</script>

<template>
  <main>
    <header>
      <h1>vue-table</h1>
      <p class="hint">Composable table primitives — sorting, Excel filters, paging, selection.</p>
    </header>

    <nav class="tabs">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        type="button"
        :data-active="active === tab.id || undefined"
        @click="active = tab.id"
      >
        {{ tab.label }}
      </button>
    </nav>

    <component :is="tabs.find((t) => t.id === active)!.component" />
  </main>
</template>
