<script setup lang="ts">
/**
 * Retheming without touching a component.
 *
 * The primitives emit class names and `data-*` attributes and nothing else —
 * they ship no CSS at all. The preset's stylesheet hangs entirely off CSS
 * variables, so overriding them from outside is the whole theming story.
 *
 * One thing this view has to get right to be honest: the palette is a *set*.
 * The preset ships a light palette and a dark one behind
 * `prefers-color-scheme`, and overriding half of it — a light header colour
 * while `--vt-text` stays on its dark-mode value — produces white-on-white.
 * So the controls own every colour variable at once, seeded from whichever
 * scheme the browser is actually in.
 */
import { computed, reactive, ref } from 'vue'
import { DataTable, useLocalDataSource, useTableState } from '@sandbox/vue-table'
import { employees, type Employee } from '../data/dataset'
import { employeeColumns } from '../columns'
import DemoSection from '../components/DemoSection.vue'

const rows = ref(employees.slice(0, 120))
const state = useTableState({ pageSize: 10 })
const source = useLocalDataSource<Employee>(rows, employeeColumns, state.query)

interface Palette {
  accent: string
  accentContrast: string
  bg: string
  bgHeader: string
  bgHover: string
  bgSelected: string
  border: string
  borderStrong: string
  text: string
  textMuted: string
  radius: number
  rowHeight: number
  fontSize: number
}

/** The two palettes the preset itself ships, copied verbatim from table.css. */
const LIGHT: Palette = {
  accent: '#2563eb', accentContrast: '#ffffff',
  bg: '#ffffff', bgHeader: '#f6f7f9', bgHover: '#f2f6fc', bgSelected: '#e6f0fd',
  border: '#dfe3e8', borderStrong: '#c4cad2',
  text: '#1f2933', textMuted: '#66727f',
  radius: 6, rowHeight: 38, fontSize: 14,
}

const DARK: Palette = {
  accent: '#5b93f7', accentContrast: '#ffffff',
  bg: '#16191d', bgHeader: '#1e2228', bgHover: '#232830', bgSelected: '#1d2c47',
  border: '#333a44', borderStrong: '#454d59',
  text: '#e6e8eb', textMuted: '#9aa4b0',
  radius: 6, rowHeight: 38, fontSize: 14,
}

const presets: Array<{ label: string; palette: Palette }> = [
  { label: 'Preset light', palette: LIGHT },
  { label: 'Preset dark', palette: DARK },
  {
    label: 'Compact',
    palette: {
      accent: '#0f766e', accentContrast: '#ffffff',
      bg: '#ffffff', bgHeader: '#f1f5f9', bgHover: '#f0fdfa', bgSelected: '#ccfbf1',
      border: '#e2e8f0', borderStrong: '#cbd5e1',
      text: '#0f172a', textMuted: '#64748b',
      radius: 3, rowHeight: 26, fontSize: 12,
    },
  },
  {
    label: 'Roomy',
    palette: {
      accent: '#7c3aed', accentContrast: '#ffffff',
      bg: '#ffffff', bgHeader: '#faf5ff', bgHover: '#f5f3ff', bgSelected: '#f3e8ff',
      border: '#e9d5ff', borderStrong: '#d8b4fe',
      text: '#2e1065', textMuted: '#7e6b9a',
      radius: 12, rowHeight: 52, fontSize: 15,
    },
  },
  {
    label: 'High contrast',
    palette: {
      accent: '#000000', accentContrast: '#ffff00',
      bg: '#ffffff', bgHeader: '#ffff00', bgHover: '#f0f0f0', bgSelected: '#ffe08a',
      border: '#000000', borderStrong: '#000000',
      text: '#000000', textMuted: '#000000',
      radius: 0, rowHeight: 40, fontSize: 15,
    },
  },
  {
    label: 'Midnight',
    palette: {
      accent: '#f472b6', accentContrast: '#1a1120',
      bg: '#14101c', bgHeader: '#1d1729', bgHover: '#241d33', bgSelected: '#3b2545',
      border: '#332a45', borderStrong: '#4b3d63',
      text: '#f3e8ff', textMuted: '#a396bd',
      radius: 10, rowHeight: 42, fontSize: 14,
    },
  },
]

const prefersDark =
  typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches

/** Start on whichever palette the page is already showing, so nothing jumps. */
const palette = reactive<Palette>({ ...(prefersDark ? DARK : LIGHT) })

function apply(next: Palette): void {
  Object.assign(palette, next)
}

const radius = computed(() => `${palette.radius}px`)
const rowHeight = computed(() => `${palette.rowHeight}px`)
const font = computed(() => `${palette.fontSize}px/1.4 system-ui, -apple-system, sans-serif`)

const colorControls = [
  { key: 'accent', label: '--vt-accent' },
  { key: 'bg', label: '--vt-bg' },
  { key: 'bgHeader', label: '--vt-bg-header' },
  { key: 'bgSelected', label: '--vt-bg-selected' },
  { key: 'text', label: '--vt-text' },
  { key: 'border', label: '--vt-border' },
] as const

const hooks = [
  { selector: ".vt-th[data-sorted='asc' | 'desc']", when: 'the column is a sort key' },
  { selector: '.vt-th[data-filtered]', when: 'the column has an active filter' },
  { selector: ".vt-th[data-pinned='left' | 'right']", when: 'the column is pinned to an edge' },
  { selector: ".vt-td[data-align='right' | 'center']", when: 'the column def sets align' },
  { selector: ".vt-td[data-column='salary']", when: 'you want to style one column only' },
  { selector: '.vt-tr[data-selected]', when: 'the row is selected' },
  { selector: '.vt-datatable[data-loading]', when: 'the source is fetching' },
  { selector: '.vt-sort[data-direction]', when: 'styling the sort affordance itself' },
  { selector: '.vt-resize[data-dragging]', when: 'a resize drag is in progress' },
]
</script>

<template>
  <DemoSection
    title="Theming"
    blurb="The preset stylesheet is variables and data-attributes all the way down. Nothing below
           touches a component or overrides a rule — it only sets custom properties on the table
           element, which is also all a consumer ever has to do."
    :api="['--vt-* custom properties', 'data-* state attributes', '@sandbox/vue-table/style.css']"
  >
    <template #controls>
      <div class="controls">
        <button v-for="preset in presets" :key="preset.label" type="button" @click="apply(preset.palette)">
          {{ preset.label }}
        </button>
        <span class="hint">
          This browser prefers <strong>{{ prefersDark ? 'dark' : 'light' }}</strong>, so the
          controls started on the preset's {{ prefersDark ? 'dark' : 'light' }} palette.
        </span>
      </div>
    </template>

    <div class="theme-controls">
      <label v-for="control in colorControls" :key="control.key">
        {{ control.label }}
        <input v-model="palette[control.key]" type="color" />
      </label>
      <label>
        --vt-radius {{ palette.radius }}px
        <input v-model.number="palette.radius" type="range" min="0" max="20" />
      </label>
      <label>
        --vt-row-height {{ palette.rowHeight }}px
        <input v-model.number="palette.rowHeight" type="range" min="22" max="64" />
      </label>
      <label>
        --vt-font {{ palette.fontSize }}px
        <input v-model.number="palette.fontSize" type="range" min="10" max="20" />
      </label>
    </div>

    <div class="theme-host">
      <DataTable :columns="employeeColumns" :source="source" :state="state" selectable />
    </div>

    <p class="hint">
      A palette is a set, not a list of independent knobs. Override <code>--vt-bg-header</code>
      alone while the browser is in dark mode and you get a light header under the dark palette's
      near-white text — which is why every colour here is set together.
    </p>

    <pre class="snippet">.vt-datatable {
  --vt-accent: {{ palette.accent }};
  --vt-accent-contrast: {{ palette.accentContrast }};
  --vt-bg: {{ palette.bg }};
  --vt-bg-header: {{ palette.bgHeader }};
  --vt-bg-hover: {{ palette.bgHover }};
  --vt-bg-selected: {{ palette.bgSelected }};
  --vt-border: {{ palette.border }};
  --vt-border-strong: {{ palette.borderStrong }};
  --vt-text: {{ palette.text }};
  --vt-text-muted: {{ palette.textMuted }};
  --vt-radius: {{ radius }};
  --vt-row-height: {{ rowHeight }};
  --vt-font: {{ font }};
}</pre>

    <div class="panel">
      <h3>State hooks</h3>
      <p class="hint">
        Every piece of table state a stylesheet might care about is on the DOM already, so you
        never have to reach into the component to find out about it.
      </p>
      <table class="hooks">
        <tbody>
          <tr v-for="hook in hooks" :key="hook.selector">
            <td><code>{{ hook.selector }}</code></td>
            <td class="hint">{{ hook.when }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <p class="hint">
      Using only primitives and still want this theme? Import it yourself:
      <code>import '@sandbox/vue-table/style.css'</code>. It is deliberately not pulled in by the
      package barrel — <code>sideEffects</code> marks the JS modules side-effect-free, so a bare
      CSS import there would be tree-shaken away and you would silently get an unstyled table.
    </p>
  </DemoSection>
</template>

<style scoped>
.theme-controls {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  gap: 8px 16px;
  font-size: 12.5px;
}
.theme-controls label { display: flex; align-items: center; gap: 6px; }

/*
 * The variables are declared on `.vt-datatable` itself, so an ancestor cannot
 * win on specificity — the override has to land on that element. `:deep`
 * reaches it, and `v-bind` wires each value to the reactive palette above.
 */
.theme-host :deep(.vt-datatable) {
  --vt-accent: v-bind('palette.accent');
  --vt-accent-contrast: v-bind('palette.accentContrast');
  --vt-bg: v-bind('palette.bg');
  --vt-bg-header: v-bind('palette.bgHeader');
  --vt-bg-hover: v-bind('palette.bgHover');
  --vt-bg-selected: v-bind('palette.bgSelected');
  --vt-border: v-bind('palette.border');
  --vt-border-strong: v-bind('palette.borderStrong');
  --vt-text: v-bind('palette.text');
  --vt-text-muted: v-bind('palette.textMuted');
  --vt-radius: v-bind(radius);
  --vt-row-height: v-bind(rowHeight);
  --vt-font: v-bind(font);
}

/* The table paints its own background, so give it somewhere to sit. */
.theme-host { padding: 10px; border: 1px solid var(--line); border-radius: 8px; }

.snippet { font-size: 12px; }

.panel { border: 1px solid var(--line); border-radius: 8px; padding: 12px 14px; }
.panel h3 { margin: 0 0 4px; font-size: 14px; }
.hooks { border-collapse: collapse; font-size: 12.5px; width: 100%; margin-top: 8px; }
.hooks td { padding: 3px 10px 3px 0; border-bottom: 1px solid var(--line); vertical-align: top; }
</style>
