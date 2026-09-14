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

/**
 * What each example sets up and what to read in it — the sentence above the
 * code in every panel.
 *
 * Keyed by the same filenames as `exampleFiles`, and kept as its own table
 * rather than folded into `examplesByTab`: `tests/demoExamples.spec.ts` reads
 * that literal with a pattern that stops at the first `}`, and a nested object
 * per file would break it. The same spec checks that every file here has a
 * note, naming the one that does not.
 */
export const exampleNotes: Record<string, string> = {
  'column-groups.vue': `Two bands over six columns. \`columnGroups\` declares the bands and each column's \`group\` says which one it sits under; \`collapseTo\` on the second band names the one column a folded band keeps, and \`initialLayout.collapsedGroups\` starts it folded — click its header to open it.`,
  'column-layout.vue': `The three sizing rules on one column list: a fixed \`width\`, no width at all (the table measures \`city\` and \`country\` from their contents), and \`flex\` on \`role\` so it takes what is left over. \`storage-key\` on the component is the whole persistence story — resize, reorder or hide a column and reload.`,
  'composing.vue': `No preset and no stylesheet import. \`TableRoot\` hands the slot the page's rows and the total, and the markup inside is cards rather than a \`<table>\`; \`SortTrigger\`, \`ColumnFilterPopover\` and \`TablePagination\` read the same context and need no props beyond a column id.`,
  'contracts.vue': `No component at all. \`createQueryState\` builds the same object \`useTableState\` owns, and \`filterRows\` then \`sortRows\` over a plain array are the whole pipeline — the \`<table>\` below is only there to show the result.`,
  'data-sources.vue': `One \`DataTable\`, two sources. \`fetchPeople\` stands in for a server and returns \`{ rows, total }\` for the query it is handed; the checkbox swaps which source is bound, and nothing else in the file changes.`,
  'detail-rows.vue': `\`expandable\` puts the disclosure column in and lets the table own which rows are open; the \`#detail\` slot gets the row and renders whatever the panel should hold. Six rows per page so an open panel stays in view.`,
  'editing.vue': `Row-mode editing with three layers of checks: \`required\` and \`validate\` on the columns, a cross-field \`validate\` on the whole draft, and a \`save\` that can still refuse — give two people the same city to see the rejection land on the row. \`apply\` writes the saved row back with \`replaceRowIn\`.`,
  'filtering.vue': `Each column's \`type\` decides the operators its popover offers. Two filters are set before the source is created — a values filter with \`includeBlanks\` so blank departments get their own bucket, and a \`between\` rule on salary — so the table arrives filtered.`,
  'getting-started.vue': `The smallest complete table: a \`type\` per column, rows in a \`shallowRef\`, \`useTableState\` for the query and \`useLocalDataSource\` to run it. The comments say why it is a \`type\` and not an \`interface\`, and a \`shallowRef\` and not a \`ref\`.`,
  'grouping.vue': `\`initialGroupBy\` on the state bands the rows, and \`aggregate\` on a column is what fills the band totals and the \`show-footer\` row. \`aggregateFormat\` dresses a total separately, because \`format\` expects a row and a sum has none.`,
  'hoisted-state.vue': `The query lives in the page's own ref and \`useTableState({ state })\` mirrors it both ways. The \`watch\` writes it to \`?q=\` with \`replaceState\`, \`popstate\` reads it back, and the button proves the ref is the owner by writing page 3 into it without going through the table.`,
  'infinite.vue': `\`useInfiniteDataSource\` accumulates pages instead of replacing them, so there is no pager: \`virtual\` plus \`@end-reached\` wired to \`loadMore\` is what asks for the next one. The paragraph above the table reads \`loaded\`, \`total\`, \`loadingMore\` and \`hasMore\` straight off the source.`,
  'keyboard.vue': `\`cell-cursor\` and \`autofocus-cursor\` on the component, and cell-mode editing behind them: arrows move, Enter or a printable character opens an \`editable\` cell, a second Enter commits and steps down. The \`save\` here is a resolved promise, so the file is about the keys, not the round trip.`,
  'labels.vue': `The \`labels\` prop takes a shipped locale record or a hand-written \`Partial\` — the German one covers four keys and falls back to English for the rest. It is a computed, so the \`<select>\` in the toolbar re-renders the wording in place with no remount.`,
  'recipe-1.vue': `Columns, rows in a \`shallowRef\`, \`useTableState\`, \`useLocalDataSource\`, \`DataTable\`. The one addition over the bare minimum is a \`#cell:name\` slot that turns the name into a link.`,
  'recipe-2.vue': `The same table over \`useServerDataSource\`. \`fetchPeople\` is the contract — a query in, \`{ rows, total }\` out — and \`debounceMs\` is the one option worth setting; the columns and the component are untouched from the local version.`,
  'recipe-3.vue': `A \`QueryState\` ref of the page's own, handed to \`useTableState({ state })\`. The table writes into it and reads from it; the line under the table prints it so the round trip is visible. Mirror that ref to a router or a store and the table is shareable.`,
  'recipe-4.vue': `\`initialGroupBy\` bands the rows and \`aggregate\` on two columns totals each band; \`show-footer\` adds the whole-table line. \`aggregateFormat\` is there because a sum has no row for \`format\` to read.`,
  'recipe-5.vue': `Every override is a custom property on the wrapping div, and the component never learns a theme exists. Note that the palette is set as a whole — header, text, border and both stripe colours together — so no dark-mode value leaks through a light one.`,
  'recipe-6.vue': `\`TableRoot\` with no preset and no stylesheet: the slot receives the page's rows and renders cards. The three primitives in the toolbar need only a column id, because they read the same context the preset would.`,
  'recipe-7.vue': `\`app.use(createTableLabels(ru))\` once, and every table in the app renders Russian with no \`labels\` prop. This file mounts a second app to show it, since the docs page runs inside one it does not own; in your own \`main.ts\` it is the single line in the comment.`,
  'selection.vue': `\`selectable="multiple"\` adds the checkbox column; the \`#toolbar\` slot reads \`selection.count\` live. The template ref is typed as \`InstanceType<typeof DataTable>\` so \`getSelectedRows()\` is available — a function rather than a computed, because resolving it walks the filtered set.`,
  'sorting-and-pagination.vue': `A \`comparator\` on the role column sorts by seniority instead of alphabetically, while \`type\` still decides the filter operators. \`initialSort\` on the state opens the table already sorted; shift-click a second header to sort within the first.`,
  'styling.vue': `Three custom properties on the wrapping div — accent, even-row background, radius — and nothing on the component. The name column is pinned; scroll sideways to see its background stay opaque over the stripe.`,
  'virtualization.vue': `100,000 rows in a \`shallowRef\` and \`virtual\` on the component, which makes the page size everything and renders only the rows in the scroll window. \`row-height\` is what lets it place the window without measuring; \`overscan\` is how many rows past the edge it keeps.`,
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

/** The files a tab shows, with their source and note. Empty for an opted-out tab. */
export function examplesFor(
  tabId: string,
): Array<{ file: string; source: HighlightedFile; about: string }> {
  const entry = examplesByTab[tabId]
  if (!entry) return []
  return entry.files.map((file) => ({
    file,
    source: exampleFiles[file]!,
    about: exampleNotes[file]!,
  }))
}
