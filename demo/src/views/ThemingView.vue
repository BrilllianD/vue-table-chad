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
 * while `--vtc-text` stays on its dark-mode value — produces white-on-white.
 * So the controls own every colour variable at once, seeded from whichever
 * scheme the browser is actually in.
 */
import { computed, reactive, ref } from 'vue'
import { DataTable, useLocalDataSource, useTableState } from '@brillliand/vue-table-chad'
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
  bgSelected: string
  /** How much of `bgSelected` actually lands, so stripes show through it. */
  selectedAlpha: number
  /** Row striping. Equal to `bg` on both means an unstriped table. */
  bgRowOdd: string
  bgRowEven: string
  /**
   * Hover as a percentage of the text colour washed over the row (and, for the
   * second one, the single cell under the pointer). No hover *colour* here —
   * that is the point of a delta.
   */
  hoverDelta: number
  cellHoverDelta: number
  border: string
  borderStrong: string
  text: string
  textMuted: string
  radius: number
  rowHeight: number
  fontSize: number
  /** Rule widths in px. All three at 0 is a table with no rules at all. */
  bodyBorder: number
  bodyBorderVertical: number
  outerBorder: number
}

/** The two palettes the preset itself ships, copied verbatim from styles/tokens.css. */
const LIGHT: Palette = {
  accent: '#2563eb', accentContrast: '#ffffff',
  bg: '#ffffff', bgHeader: '#f6f7f9',
  bgSelected: '#e6f0fd', selectedAlpha: 16,
  hoverDelta: 6, cellHoverDelta: 0,
  bgRowOdd: '#ffffff', bgRowEven: '#ffffff',
  border: '#dfe3e8', borderStrong: '#c4cad2',
  text: '#1f2933', textMuted: '#66727f',
  radius: 6, rowHeight: 38, fontSize: 14,
  bodyBorder: 1, bodyBorderVertical: 0, outerBorder: 1,
}

const DARK: Palette = {
  accent: '#5b93f7', accentContrast: '#ffffff',
  bg: '#16191d', bgHeader: '#1e2228',
  bgSelected: '#1d2c47', selectedAlpha: 18,
  hoverDelta: 8, cellHoverDelta: 0,
  bgRowOdd: '#16191d', bgRowEven: '#16191d',
  border: '#333a44', borderStrong: '#454d59',
  text: '#e6e8eb', textMuted: '#9aa4b0',
  radius: 6, rowHeight: 38, fontSize: 14,
  bodyBorder: 1, bodyBorderVertical: 0, outerBorder: 1,
}

const presets: Array<{ label: string; palette: Palette }> = [
  { label: 'Preset light', palette: LIGHT },
  { label: 'Preset dark', palette: DARK },
  {
    label: 'Compact',
    palette: {
      accent: '#0f766e', accentContrast: '#ffffff',
      bg: '#ffffff', bgHeader: '#f1f5f9',
      bgSelected: '#ccfbf1', selectedAlpha: 18,
      hoverDelta: 7, cellHoverDelta: 0,
      bgRowOdd: '#ffffff', bgRowEven: '#ffffff',
      border: '#e2e8f0', borderStrong: '#cbd5e1',
      text: '#0f172a', textMuted: '#64748b',
      radius: 3, rowHeight: 26, fontSize: 12,
      bodyBorder: 1, bodyBorderVertical: 1, outerBorder: 1,
    },
  },
  {
    label: 'Roomy',
    palette: {
      accent: '#7c3aed', accentContrast: '#ffffff',
      bg: '#ffffff', bgHeader: '#faf5ff',
      bgSelected: '#f3e8ff', selectedAlpha: 16,
      hoverDelta: 6, cellHoverDelta: 0,
      bgRowOdd: '#ffffff', bgRowEven: '#ffffff',
      border: '#e9d5ff', borderStrong: '#d8b4fe',
      text: '#2e1065', textMuted: '#7e6b9a',
      radius: 12, rowHeight: 52, fontSize: 15,
      bodyBorder: 1, bodyBorderVertical: 0, outerBorder: 1,
    },
  },
  {
    // Stripes carry the row separation, so the rules are switched off entirely.
    label: 'Zebra, no rules',
    palette: {
      accent: '#2563eb', accentContrast: '#ffffff',
      bg: '#ffffff', bgHeader: '#eef2f7',
      bgSelected: '#d7e6ff', selectedAlpha: 14,
      hoverDelta: 5, cellHoverDelta: 4,
      bgRowOdd: '#ffffff', bgRowEven: '#f4f6f9',
      border: '#dfe3e8', borderStrong: '#c4cad2',
      text: '#1f2933', textMuted: '#66727f',
      radius: 8, rowHeight: 36, fontSize: 14,
      bodyBorder: 0, bodyBorderVertical: 0, outerBorder: 0,
    },
  },
  {
    // The other extreme: a full grid, every rule visible.
    label: 'Spreadsheet',
    palette: {
      accent: '#15803d', accentContrast: '#ffffff',
      bg: '#ffffff', bgHeader: '#e8ece9',
      bgSelected: '#d7f0dd', selectedAlpha: 16,
      hoverDelta: 6, cellHoverDelta: 6,
      bgRowOdd: '#ffffff', bgRowEven: '#ffffff',
      border: '#9aa5a0', borderStrong: '#6d7a74',
      text: '#132018', textMuted: '#5b6b62',
      radius: 0, rowHeight: 28, fontSize: 13,
      bodyBorder: 1, bodyBorderVertical: 1, outerBorder: 2,
    },
  },
  {
    label: 'High contrast',
    palette: {
      accent: '#000000', accentContrast: '#ffff00',
      bg: '#ffffff', bgHeader: '#ffff00',
      bgSelected: '#ffe08a', selectedAlpha: 30,
      hoverDelta: 14, cellHoverDelta: 0,
      bgRowOdd: '#ffffff', bgRowEven: '#ffffff',
      border: '#000000', borderStrong: '#000000',
      text: '#000000', textMuted: '#000000',
      radius: 0, rowHeight: 40, fontSize: 15,
      bodyBorder: 2, bodyBorderVertical: 2, outerBorder: 2,
    },
  },
  {
    label: 'Midnight',
    palette: {
      accent: '#f472b6', accentContrast: '#1a1120',
      bg: '#14101c', bgHeader: '#1d1729',
      bgSelected: '#3b2545', selectedAlpha: 22,
      hoverDelta: 9, cellHoverDelta: 0,
      bgRowOdd: '#14101c', bgRowEven: '#1a1526',
      border: '#332a45', borderStrong: '#4b3d63',
      text: '#f3e8ff', textMuted: '#a396bd',
      radius: 10, rowHeight: 42, fontSize: 14,
      bodyBorder: 0, bodyBorderVertical: 0, outerBorder: 1,
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
const bodyBorder = computed(() => `${palette.bodyBorder}px`)
const bodyBorderVertical = computed(() => `${palette.bodyBorderVertical}px`)
const outerBorder = computed(() => `${palette.outerBorder}px`)
const hoverDelta = computed(() => `${palette.hoverDelta}%`)
const cellHoverDelta = computed(() => `${palette.cellHoverDelta}%`)

/**
 * A colour input can only give an opaque hex, so the alpha is a second control
 * and the two are recombined here. `color-mix` with `transparent` is the CSS
 * way to say "this colour, at N%".
 *
 * `color-mix` rejects a percentage outside 0–100 — and an invalid value makes
 * the whole custom property invalid, so the layer silently vanishes rather than
 * clamping itself. Anything computing a percentage has to clamp it first.
 */
const withAlpha = (color: string, percent: number): string =>
  `color-mix(in srgb, ${color} ${Math.min(Math.max(percent, 0), 100)}%, transparent)`

const selectedColor = computed(() => withAlpha(palette.bgSelected, palette.selectedAlpha))

/* ------------------------------------------------ hover: delta or colour */

/**
 * The delta is only how `--vtc-bg-hover` is *derived*. Setting the variable
 * itself replaces that derivation, which is the escape hatch for a hover that
 * has to be a specific brand colour rather than a wash of the text.
 *
 * Toggling these off does not write the variable at all — the rules below are
 * gated on a data attribute, so the preset's own definition applies again
 * rather than being overwritten with a copy of itself.
 */
const hoverOverride = ref(false)
const hoverColor = ref('#2563eb')
const hoverColorAlpha = ref(12)

const cellHoverOverride = ref(false)
const cellHoverColor = ref('#2563eb')
const cellHoverColorAlpha = ref(20)

const hoverColorValue = computed(() => withAlpha(hoverColor.value, hoverColorAlpha.value))
const cellHoverColorValue = computed(() =>
  withAlpha(cellHoverColor.value, cellHoverColorAlpha.value),
)

/* ------------------------------------------------------- hover outlines */

/**
 * Inset shadows, not borders, so turning one on does not resize the cell and
 * shift the table under the pointer. The row draws top and bottom; the cell
 * draws all four edges.
 */
const hoverBorder = reactive({
  rowWidth: 0,
  rowColor: '#2563eb',
  cellWidth: 0,
  cellColor: '#2563eb',
})

const hoverBorderWidth = computed(() => `${hoverBorder.rowWidth}px`)
const cellHoverBorderWidth = computed(() => `${hoverBorder.cellWidth}px`)

const borderControls = [
  {
    widthKey: 'rowWidth',
    colorKey: 'rowColor',
    label: '--vtc-hover-border-*',
    hint: 'row outline, top and bottom',
  },
  {
    widthKey: 'cellWidth',
    colorKey: 'cellColor',
    label: '--vtc-cell-hover-border-*',
    hint: 'cell outline, all four edges',
  },
] as const

/* --------------------------------------------------- one column, tinted */

/**
 * The odd one out on this page: a column background is not a theme variable but
 * a field on the column def, because "which column" is not something a
 * stylesheet should have to know. It is painted as a layer over the row's
 * stripe, so an alpha below 100% tints the column rather than covering it —
 * drop it to ~15% and the stripes, hover and selection all read straight
 * through the tint.
 */
const tintedColumn = ref('salary')
const columnBg = ref('#f97316')
const columnAlpha = ref(14)
const tintColumn = ref(true)

const themedColumns = computed(() =>
  employeeColumns.map((column) =>
    tintColumn.value && column.id === tintedColumn.value
      ? {
          ...column,
          background: withAlpha(columnBg.value, columnAlpha.value),
          // The header sits on its own background, so it needs a touch more to
          // land at the same visual weight.
          headerBackground: withAlpha(columnBg.value, columnAlpha.value + 8),
        }
      : column,
  ),
)

const colorControls = [
  { key: 'accent', label: '--vtc-accent' },
  { key: 'bg', label: '--vtc-bg' },
  { key: 'bgHeader', label: '--vtc-bg-header' },
  { key: 'bgSelected', label: '--vtc-bg-selected' },
  { key: 'bgRowOdd', label: '--vtc-bg-row-odd' },
  { key: 'bgRowEven', label: '--vtc-bg-row-even' },
  { key: 'text', label: '--vtc-text' },
  { key: 'border', label: '--vtc-border' },
] as const

const widthControls = [
  { key: 'bodyBorder', label: '--vtc-body-border-width', hint: 'row rules' },
  { key: 'bodyBorderVertical', label: '--vtc-body-border-vertical-width', hint: 'column rules' },
  { key: 'outerBorder', label: '--vtc-outer-border-width', hint: 'the frame' },
] as const

/**
 * Percentages, all three feeding a `color-mix`. `overridden` greys the delta
 * out once an explicit colour has taken over deriving from it.
 */
const alphaControls = [
  {
    key: 'hoverDelta',
    label: '--vtc-hover-delta',
    hint: 'row under the pointer',
    max: 30,
    overridden: () => hoverOverride.value,
  },
  {
    key: 'cellHoverDelta',
    label: '--vtc-cell-hover-delta',
    hint: 'cell under the pointer',
    max: 30,
    overridden: () => cellHoverOverride.value,
  },
  {
    key: 'selectedAlpha',
    label: '--vtc-bg-selected alpha',
    hint: 'selected rows',
    max: 100,
    overridden: () => false,
  },
] as const

/** The two "or name a colour instead" escape hatches. */
const hoverOverrides = [
  {
    label: '--vtc-bg-hover',
    hint: 'row',
    on: hoverOverride,
    color: hoverColor,
    alpha: hoverColorAlpha,
  },
  {
    label: '--vtc-bg-cell-hover',
    hint: 'cell',
    on: cellHoverOverride,
    color: cellHoverColor,
    alpha: cellHoverColorAlpha,
  },
] as const

const hooks = [
  { selector: ".vt-th[data-sorted='asc' | 'desc']", when: 'the column is a sort key' },
  { selector: '.vt-th[data-filtered]', when: 'the column has an active filter' },
  {
    selector: ".vt-th[data-band-edge='0'], .vt-td[data-band-edge='0']",
    when: 'a header band ends here — the digit is the band’s nesting depth',
  },
  { selector: ".vt-th[data-pinned='left' | 'right']", when: 'the column is pinned to an edge' },
  { selector: ".vt-td[data-align='right' | 'center']", when: 'the column def sets align' },
  { selector: ".vt-td[data-column='salary']", when: 'you want to style one column only' },
  { selector: '.vt-td[data-column-bg]', when: 'the column def sets background' },
  { selector: '.vt-tr:nth-child(odd | even)', when: 'striping rows' },
  { selector: '.vt-td:hover', when: 'the pointer is on one cell' },
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
    :api="[
      '--vtc-* custom properties',
      'data-* state attributes',
      'ColumnDef.background',
      'ColumnDef.headerBackground',
      '@brillliand/vue-table-chad/style.css',
    ]"
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
        --vtc-radius {{ palette.radius }}px
        <input v-model.number="palette.radius" type="range" min="0" max="20" />
      </label>
      <label>
        --vtc-row-height {{ palette.rowHeight }}px
        <input v-model.number="palette.rowHeight" type="range" min="22" max="64" />
      </label>
      <label>
        --vtc-font {{ palette.fontSize }}px
        <input v-model.number="palette.fontSize" type="range" min="10" max="20" />
      </label>
    </div>

    <div class="theme-controls width-controls">
      <label v-for="control in widthControls" :key="control.key">
        <span class="var">{{ control.label }}</span>
        <input v-model.number="palette[control.key]" type="range" min="0" max="4" />
        <span class="width-value">{{ palette[control.key] }}px</span>
        <span class="hint">{{ control.hint }}</span>
      </label>
    </div>

    <div class="theme-controls width-controls">
      <label
        v-for="control in alphaControls"
        :key="control.key"
        :data-overridden="control.overridden() || undefined"
      >
        <span class="var">{{ control.label }}</span>
        <input
          v-model.number="palette[control.key]"
          type="range"
          min="0"
          :max="control.max"
          :disabled="control.overridden()"
        />
        <span class="width-value">{{ palette[control.key] }}%</span>
        <span class="hint">{{ control.hint }}</span>
      </label>
    </div>

    <div class="theme-controls width-controls">
      <label v-for="control in borderControls" :key="control.label">
        <span class="var">{{ control.label }}</span>
        <input v-model.number="hoverBorder[control.widthKey]" type="range" min="0" max="4" />
        <span class="width-value">{{ hoverBorder[control.widthKey] }}px</span>
        <input v-model="hoverBorder[control.colorKey]" type="color" />
        <span class="hint">{{ control.hint }}</span>
      </label>
    </div>

    <div class="theme-controls width-controls">
      <label v-for="control in hoverOverrides" :key="control.label">
        <input v-model="control.on.value" type="checkbox" />
        <span class="var">{{ control.label }}</span>
        <input v-model="control.color.value" type="color" :disabled="!control.on.value" />
        <input
          v-model.number="control.alpha.value"
          type="range"
          min="0"
          max="100"
          :disabled="!control.on.value"
        />
        <span class="width-value">{{ control.alpha.value }}%</span>
        <span class="hint">{{ control.hint }} hover, as a colour</span>
      </label>
    </div>

    <div class="theme-controls column-tint">
      <label>
        <input v-model="tintColumn" type="checkbox" />
        ColumnDef.background on
      </label>
      <label>
        column
        <select v-model="tintedColumn">
          <option v-for="column in employeeColumns" :key="column.id" :value="column.id">
            {{ column.header }}
          </option>
        </select>
      </label>
      <label>
        colour
        <input v-model="columnBg" type="color" />
      </label>
      <label class="alpha">
        alpha
        <input v-model.number="columnAlpha" type="range" min="0" max="100" />
        <span class="width-value">{{ columnAlpha }}%</span>
      </label>
      <span class="hint">
        A field on the column def, not a variable — and a layer, not a swap: below 100% the
        stripes, hover and selection all read through it.
      </span>
    </div>

    <!--
      The overrides are attributes rather than always-on `v-bind`s: with the
      flag off, the rule does not match and nothing is written, so the preset's
      own delta-derived hover applies instead of a copy of it.
    -->
    <div
      class="theme-host"
      :data-hover-override="hoverOverride || undefined"
      :data-cell-hover-override="cellHoverOverride || undefined"
    >
      <DataTable :columns="themedColumns" :source="source" :state="state" selectable />
    </div>

    <p class="hint">
      A palette is a set, not a list of independent knobs. Override <code>--vtc-bg-header</code>
      alone while the browser is in dark mode and you get a light header under the dark palette's
      near-white text — which is why every colour here is set together.
    </p>

    <pre class="snippet">.vt-datatable {
  --vtc-accent: {{ palette.accent }};
  --vtc-accent-contrast: {{ palette.accentContrast }};
  --vtc-bg: {{ palette.bg }};
  --vtc-bg-header: {{ palette.bgHeader }};
  {{ hoverOverride ? `--vtc-bg-hover: ${hoverColorValue};` : `--vtc-hover-delta: ${hoverDelta};` }}
  {{ cellHoverOverride
     ? `--vtc-bg-cell-hover: ${cellHoverColorValue};`
     : `--vtc-cell-hover-delta: ${cellHoverDelta};` }}
  --vtc-bg-selected: {{ selectedColor }};
  --vtc-bg-row-odd: {{ palette.bgRowOdd }};
  --vtc-bg-row-even: {{ palette.bgRowEven }};
  --vtc-border: {{ palette.border }};
  --vtc-border-strong: {{ palette.borderStrong }};
  --vtc-text: {{ palette.text }};
  --vtc-text-muted: {{ palette.textMuted }};
  --vtc-radius: {{ radius }};
  --vtc-row-height: {{ rowHeight }};
  --vtc-font: {{ font }};
  --vtc-body-border-width: {{ bodyBorder }};
  --vtc-body-border-vertical-width: {{ bodyBorderVertical }};
  --vtc-outer-border-width: {{ outerBorder }};
  --vtc-hover-border-width: {{ hoverBorderWidth }};
  --vtc-hover-border-color: {{ hoverBorder.rowColor }};
  --vtc-cell-hover-border-width: {{ cellHoverBorderWidth }};
  --vtc-cell-hover-border-color: {{ hoverBorder.cellColor }};
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
      <code>import '@brillliand/vue-table-chad/style.css'</code>. It is deliberately not pulled in by the
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
  --vtc-accent: v-bind('palette.accent');
  --vtc-accent-contrast: v-bind('palette.accentContrast');
  --vtc-bg: v-bind('palette.bg');
  --vtc-bg-header: v-bind('palette.bgHeader');
  /* Hover is left to the preset's own `color-mix` — only the delta is set. */
  --vtc-hover-delta: v-bind(hoverDelta);
  --vtc-cell-hover-delta: v-bind(cellHoverDelta);
  --vtc-bg-selected: v-bind(selectedColor);
  --vtc-bg-row-odd: v-bind('palette.bgRowOdd');
  --vtc-bg-row-even: v-bind('palette.bgRowEven');
  --vtc-border: v-bind('palette.border');
  --vtc-border-strong: v-bind('palette.borderStrong');
  --vtc-text: v-bind('palette.text');
  --vtc-text-muted: v-bind('palette.textMuted');
  --vtc-radius: v-bind(radius);
  --vtc-row-height: v-bind(rowHeight);
  --vtc-font: v-bind(font);
  --vtc-body-border-width: v-bind(bodyBorder);
  --vtc-body-border-vertical-width: v-bind(bodyBorderVertical);
  --vtc-outer-border-width: v-bind(outerBorder);
  --vtc-hover-border-width: v-bind(hoverBorderWidth);
  --vtc-hover-border-color: v-bind('hoverBorder.rowColor');
  --vtc-cell-hover-border-width: v-bind(cellHoverBorderWidth);
  --vtc-cell-hover-border-color: v-bind('hoverBorder.cellColor');
}

/*
 * Naming a colour outright, instead of deriving one from the delta. Gated on
 * the attribute so that "off" means the declaration is absent, not that it is
 * present with a default value in it.
 */
.theme-host[data-hover-override] :deep(.vt-datatable) {
  --vtc-bg-hover: v-bind(hoverColorValue);
}

.theme-host[data-cell-hover-override] :deep(.vt-datatable) {
  --vtc-bg-cell-hover: v-bind(cellHoverColorValue);
}

/* The rule widths carry the longest variable names on the page, so they get a
   wider track than the colour swatches and are kept off the wrapping grid. */
.width-controls {
  grid-template-columns: repeat(auto-fit, minmax(330px, 1fr));
  margin-top: -4px;
}
.width-controls label { white-space: nowrap; }
.width-controls label[data-overridden] { opacity: 0.45; }
.width-controls input[type='color'] { flex: none; }
.width-controls .var { flex: none; }
.width-controls input[type='range'] { flex: 1; min-width: 70px; }
.width-value { flex: none; width: 30px; font-variant-numeric: tabular-nums; }

.column-tint { margin-top: -4px; }
.column-tint .alpha { min-width: 210px; }
.column-tint .alpha input[type='range'] { flex: 1; min-width: 70px; }

/* The table paints its own background, so give it somewhere to sit. */
.theme-host { padding: 10px; border: 1px solid var(--line); border-radius: 8px; }

.snippet { font-size: 12px; }

.panel { border: 1px solid var(--line); border-radius: 8px; padding: 12px 14px; }
.panel h3 { margin: 0 0 4px; font-size: 14px; }
.hooks { border-collapse: collapse; font-size: 12.5px; width: 100%; margin-top: 8px; }
.hooks td { padding: 3px 10px 3px 0; border-bottom: 1px solid var(--line); vertical-align: top; }
</style>
