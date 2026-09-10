<script setup lang="ts">
/**
 * The shipped palettes, switched live.
 *
 * A preset is nine colour literals and nothing else — every other colour in
 * `styles/tokens.css` is `color-mix`-derived from those nine, so hover, the
 * selected tint, striping, the focus ring and every border follow a palette
 * without appearing in it. The swatches below are read back out of
 * `getComputedStyle` rather than listed here, which is the only way this view
 * can be wrong about a palette in the same direction the table is.
 *
 * The attribute goes on `<html>`, not on the wrapper: the filter popover and
 * the drag ghost teleport to `<body>`, so an attribute inside this view would
 * theme the table and leave its popovers on the default palette. That is the
 * case worth seeing here — open a column's filter panel while a palette is on.
 */
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import {
  DataTable,
  themePresets,
  useLocalDataSource,
  useTableState,
  type ThemePreset,
} from '@brillliand/vue-table-chad'
import { employeeColumns } from '../columns'
import { employees, type Employee } from '../data/dataset'
import DemoSection from '../components/DemoSection.vue'

/**
 * Every palette, pulled in at once because this view exists to compare them.
 *
 * A consumer imports the one file they use — that is the point of shipping
 * them separately — and a glob here means a palette added to `themePresets`
 * shows up in the demo without a second edit remembering to import it.
 */
import.meta.glob('../../../src/components/preset/styles/themes/*.css', { eager: true })

const rows = shallowRef(employees.slice(0, 240))
const state = useTableState({ pageSize: 8 })
const source = useLocalDataSource<Employee>(rows, employeeColumns, state.query)

const preset = ref<ThemePreset | ''>('dracula')

/** The nine, in the order a palette is authored in. */
const PALETTE = [
  ['--vtc-bg', 'surface'],
  ['--vtc-header-bg', 'header'],
  ['--vtc-text', 'text'],
  ['--vtc-text-muted', 'muted'],
  ['--vtc-border', 'border'],
  ['--vtc-border-strong', 'border strong'],
  ['--vtc-accent', 'accent'],
  ['--vtc-accent-contrast', 'on accent'],
  ['--vtc-danger', 'danger'],
] as const

const table = ref<HTMLElement>()
const swatches = ref<{ name: string; label: string; value: string }[]>([])

/**
 * Read back rather than looked up: these are the values the browser resolved
 * for the table that is on screen, so a palette whose file disagrees with this
 * list shows the file's colours and not the list's.
 */
function readPalette(): void {
  const root = table.value?.querySelector<HTMLElement>('.vt-datatable')
  if (!root) return
  const style = getComputedStyle(root)
  swatches.value = PALETTE.map(([name, label]) => ({
    name,
    label,
    value: style.getPropertyValue(name).trim(),
  }))
}

const ATTRIBUTE = 'data-vtc-theme'
/** What the page carried before this view mounted, restored on the way out. */
let previous: string | null = null

function apply(name: ThemePreset | ''): void {
  if (name) document.documentElement.setAttribute(ATTRIBUTE, name)
  else document.documentElement.removeAttribute(ATTRIBUTE)
  // One frame, so the swatches read the palette that is painted rather than
  // the one that was.
  requestAnimationFrame(readPalette)
}

onMounted(() => {
  previous = document.documentElement.getAttribute(ATTRIBUTE)
  apply(preset.value)
})

onBeforeUnmount(() => {
  if (previous === null) document.documentElement.removeAttribute(ATTRIBUTE)
  else document.documentElement.setAttribute(ATTRIBUTE, previous)
})

watch(preset, apply)

const snippet = computed(() =>
  preset.value
    ? `import '@brillliand/vue-table-chad/style.css'\nimport '@brillliand/vue-table-chad/themes/${preset.value}.css'\n\n<html data-vtc-theme="${preset.value}">`
    : `// No preset: the table follows prefers-color-scheme, or the theme prop.`,
)
</script>

<template>
  <DemoSection
    title="Themes"
    blurb="Thirty palettes, each one nine colours. Everything else in the theme derives from them."
    :api="['themePresets', 'ThemePreset', 'data-vtc-theme', '--vtc-* custom properties']"
  >
    <template #controls>
      <div class="controls">
        <label>
          Palette
          <select v-model="preset">
            <option value="">None — follow the OS</option>
            <option v-for="name in themePresets" :key="name" :value="name">{{ name }}</option>
          </select>
        </label>

        <p class="hint">
          The attribute is set on <code>&lt;html&gt;</code>, which is what reaches the filter
          popover — it teleports to <code>&lt;body&gt;</code> and would otherwise open in the
          default palette. Open one and switch.
        </p>
      </div>
    </template>

    <div class="swatches">
      <div v-for="swatch in swatches" :key="swatch.name" class="swatch">
        <span class="chip" :style="{ background: swatch.value }" />
        <span class="swatch-label">{{ swatch.label }}</span>
        <code>{{ swatch.value }}</code>
      </div>
    </div>

    <div ref="table">
      <DataTable
        :columns="employeeColumns"
        :source="source"
        :state="state"
        selectable="multiple"
      />
    </div>

    <pre class="snippet"><code>{{ snippet }}</code></pre>

    <p class="hint">
      The scrollbar switches with the palette and no preset says a word about it: the thumb is a
      wash of <code>--vtc-text</code>, which is one of the nine. Tune it on the
      <strong>Theming</strong> tab, under <strong>Scrollbars</strong>.
    </p>

    <p class="hint">
      A preset is a stylesheet, so anything inline still wins over it:
      <code>defineTheme</code> on the <strong>Theming</strong> tab overrides a palette rather than
      fighting it, which is how a brand accent goes on top of Nord.
    </p>
  </DemoSection>
</template>

<style scoped>
.controls { display: flex; flex-direction: column; gap: 6px; }
.swatches { display: flex; flex-wrap: wrap; gap: 10px; }
.swatch { display: flex; align-items: center; gap: 6px; font-size: 12px; }
.chip {
  width: 18px;
  height: 18px;
  border-radius: 4px;
  border: 1px solid rgb(127 127 127 / 0.4);
}
.swatch-label { opacity: 0.75; }
.snippet {
  margin: 0;
  padding: 10px 12px;
  border-radius: 6px;
  background: rgb(127 127 127 / 0.12);
  font-size: 12px;
  overflow-x: auto;
}
</style>
