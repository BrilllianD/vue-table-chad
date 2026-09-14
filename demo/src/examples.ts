/**
 * Which docs example answers which demo view.
 *
 * The views are live tables: each one answers "does it do X". None of them
 * answers "what do I type". That answer already exists as a file —
 * `docs/.vitepress/examples/*.vue`, mounted by the docs site and covered by
 * `pnpm typecheck` — so the demo shows the file rather than keeping a second
 * copy of it as a string. `scripts/vite-plugin-highlight.ts` turns the
 * `?highlight` imports below into markup at build time.
 *
 * `tests/demoExamples.spec.ts` reads this file as text and fails, naming the
 * offender, when a tab here has no example, an example here has no file, or a
 * file in that directory is referenced from nowhere.
 */
import columnGroups from '../../docs/.vitepress/examples/column-groups.vue?highlight'
import columnLayout from '../../docs/.vitepress/examples/column-layout.vue?highlight'
import composing from '../../docs/.vitepress/examples/composing.vue?highlight'
import contracts from '../../docs/.vitepress/examples/contracts.vue?highlight'
import dataSources from '../../docs/.vitepress/examples/data-sources.vue?highlight'
import detailRows from '../../docs/.vitepress/examples/detail-rows.vue?highlight'
import editing from '../../docs/.vitepress/examples/editing.vue?highlight'
import filtering from '../../docs/.vitepress/examples/filtering.vue?highlight'
import gettingStarted from '../../docs/.vitepress/examples/getting-started.vue?highlight'
import grouping from '../../docs/.vitepress/examples/grouping.vue?highlight'
import hoistedState from '../../docs/.vitepress/examples/hoisted-state.vue?highlight'
import infinite from '../../docs/.vitepress/examples/infinite.vue?highlight'
import keyboard from '../../docs/.vitepress/examples/keyboard.vue?highlight'
import labels from '../../docs/.vitepress/examples/labels.vue?highlight'
import recipe1 from '../../docs/.vitepress/examples/recipe-1.vue?highlight'
import recipe2 from '../../docs/.vitepress/examples/recipe-2.vue?highlight'
import recipe3 from '../../docs/.vitepress/examples/recipe-3.vue?highlight'
import recipe4 from '../../docs/.vitepress/examples/recipe-4.vue?highlight'
import recipe5 from '../../docs/.vitepress/examples/recipe-5.vue?highlight'
import recipe6 from '../../docs/.vitepress/examples/recipe-6.vue?highlight'
import recipe7 from '../../docs/.vitepress/examples/recipe-7.vue?highlight'
import selection from '../../docs/.vitepress/examples/selection.vue?highlight'
import sortingAndPagination from '../../docs/.vitepress/examples/sorting-and-pagination.vue?highlight'
import styling from '../../docs/.vitepress/examples/styling.vue?highlight'
import virtualization from '../../docs/.vitepress/examples/virtualization.vue?highlight'

/** A file's source, twice: Shiki's markup, and the text the Copy button writes. */
export interface HighlightedFile {
  html: string
  code: string
}

/**
 * Filename to its highlighted source. Keyed by the name the docs page uses, so
 * a tab below names a file the way a reader would look for it and the name is
 * written once.
 */
export const exampleFiles: Record<string, HighlightedFile> = {
  'column-groups.vue': columnGroups,
  'column-layout.vue': columnLayout,
  'composing.vue': composing,
  'contracts.vue': contracts,
  'data-sources.vue': dataSources,
  'detail-rows.vue': detailRows,
  'editing.vue': editing,
  'filtering.vue': filtering,
  'getting-started.vue': gettingStarted,
  'grouping.vue': grouping,
  'hoisted-state.vue': hoistedState,
  'infinite.vue': infinite,
  'labels.vue': labels,
  'keyboard.vue': keyboard,
  'recipe-1.vue': recipe1,
  'recipe-2.vue': recipe2,
  'recipe-3.vue': recipe3,
  'recipe-4.vue': recipe4,
  'recipe-5.vue': recipe5,
  'recipe-6.vue': recipe6,
  'recipe-7.vue': recipe7,
  'selection.vue': selection,
  'sorting-and-pagination.vue': sortingAndPagination,
  'styling.vue': styling,
  'virtualization.vue': virtualization,
}

export interface TabExamples {
  /** Filenames in `exampleFiles`, in the order they should render. */
  files: string[]
  /**
   * Why this tab shows no source. Present exactly when `files` is empty: a tab
   * opts out with a sentence, and leaving a tab out of this table altogether is
   * a test failure rather than a silent gap.
   */
  why?: string
}

/**
 * Tab id in `App.vue` to the example that answers it.
 *
 * The `recipes` entry is rendered by `RecipesView` itself, which interleaves
 * them with its own prose; `App.vue` skips it for that reason.
 */
export const examplesByTab: Record<string, TabExamples> = {
  recipes: {
    files: [
      'recipe-1.vue',
      'recipe-2.vue',
      'recipe-3.vue',
      'recipe-4.vue',
      'recipe-5.vue',
      'recipe-6.vue',
      'recipe-7.vue',
    ],
  },
  overview: { files: ['getting-started.vue', 'sorting-and-pagination.vue'] },
  server: { files: ['data-sources.vue'] },
  infinite: { files: ['infinite.vue'] },
  filters: { files: ['filtering.vue'] },
  grouping: { files: ['grouping.vue'] },
  detail: { files: ['detail-rows.vue'] },
  editing: { files: ['editing.vue'] },
  cursor: { files: ['keyboard.vue'] },
  'header-groups': { files: ['column-groups.vue'] },
  wide: {
    files: [],
    why: 'No source panel here on purpose: what this view demonstrates is 34 column defs with nothing declared on them, which column-layout.vue already shows on three — the interesting part is the widths on screen, not the code that produced them.',
  },
  state: { files: ['hoisted-state.vue'] },
  theming: { files: ['styling.vue'] },
  themes: {
    files: [],
    why: 'No source panel here on purpose: using a preset is one CSS import and one attribute on <html>, neither of which is Vue. The picker above is demo chrome, not the API.',
  },
  labels: { files: ['labels.vue'] },
  virtual: { files: ['virtualization.vue'] },
  perf: {
    files: [],
    why: 'No source panel here on purpose: a measurement taken inside a docs example measures the docs example. The numbers this view reports are its own.',
  },
  api: {
    files: [],
    why: 'No source panel here on purpose: this view is the reference table harvested from the doc comments in src/, not a use case someone would paste.',
  },
  selection: { files: ['selection.vue'] },
  columns: { files: ['column-layout.vue'] },
  composed: { files: ['composing.vue'] },
  core: { files: ['contracts.vue'] },
}

/** The files a tab shows, paired with their source. Empty for an opted-out tab. */
export function examplesFor(tabId: string): Array<{ file: string; source: HighlightedFile }> {
  const entry = examplesByTab[tabId]
  if (!entry) return []
  return entry.files.map((file) => ({ file, source: exampleFiles[file]! }))
}
