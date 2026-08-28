/**
 * The documentation page list, in reading order.
 *
 * Four things read this: the VitePress sidebar, `scripts/generate-docs-index.ts`
 * (which writes the README table and both getting-started indexes), each page's
 * footer link into the demo, and the demo's own links back out. It exists
 * because that list used to be maintained by hand in three files and had
 * already drifted apart — `tests/docsIndex.spec.ts` is what keeps it one list.
 */
export interface DocPage {
  /** Filename under `docs/`, extension included. */
  file: string
  /** Sidebar and table label. */
  title: string
  /** One sentence for the generated index tables. */
  blurb: string
  /** Tab ids in `demo/src/App.vue` where this runs. Empty for pages with no view. */
  demoTabs: string[]
  /** Sidebar section. */
  section: 'Start here' | 'Data' | 'Features' | 'Presentation' | 'Going further'
}

export const docPages: DocPage[] = [
  {
    file: 'getting-started.md',
    title: 'Using it in another project',
    blurb:
      'Installing it, the row type it insists on, the `DataTable` props and slots, and the three levels you can build a table at.',
    demoTabs: ['overview'],
    section: 'Start here',
  },
  {
    file: 'getting-started-js.md',
    title: '…from plain JavaScript',
    blurb:
      'The same, without TypeScript: what a column accepts, the four mistakes the compiler would have caught, and how to get autocomplete back with JSDoc.',
    demoTabs: ['overview'],
    section: 'Start here',
  },
  {
    file: 'contracts.md',
    title: 'The two contracts',
    blurb: '`QueryState` and `DataSource` — the two interfaces everything else is written against.',
    demoTabs: ['core'],
    section: 'Start here',
  },
  {
    file: 'data-sources.md',
    title: 'Local, server and infinite data',
    blurb:
      '`useLocalDataSource`, `useServerDataSource`, `useInfiniteDataSource`, and why swapping one for another changes nothing above.',
    demoTabs: ['server', 'infinite'],
    section: 'Data',
  },
  {
    file: 'filtering.md',
    title: 'Excel-style filters',
    blurb: 'The value checklist, condition rules, and facets.',
    demoTabs: ['filters'],
    section: 'Data',
  },
  {
    file: 'sorting-and-pagination.md',
    title: 'Sorting and pagination',
    blurb: '`usePagination`, `PageItem`, `SortOptions`, per-column comparators, and null-sorting.',
    demoTabs: ['overview'],
    section: 'Data',
  },
  {
    file: 'selection.md',
    title: 'Selection',
    blurb: 'Shift-ranges, the tri-state header, and selecting more rows than are loaded.',
    demoTabs: ['selection'],
    section: 'Features',
  },
  {
    file: 'grouping.md',
    title: 'Grouping rows',
    blurb: 'Bands, `groupMode`, aggregates and whole-table totals.',
    demoTabs: ['grouping'],
    section: 'Features',
  },
  {
    file: 'editing.md',
    title: 'Editing cells',
    blurb: 'A draft per row, cell and row mode, validation, and a save the server can refuse.',
    demoTabs: ['editing'],
    section: 'Features',
  },
  {
    file: 'keyboard.md',
    title: 'Keyboard navigation',
    blurb: 'The cell cursor: arrow keys, Enter to edit, and the roving tabindex behind it.',
    demoTabs: ['cursor'],
    section: 'Features',
  },
  {
    file: 'column-layout.md',
    title: 'Column layout',
    blurb: 'Visibility, order, widths, pinning, persistence and drag-to-reorder.',
    demoTabs: ['columns'],
    section: 'Presentation',
  },
  {
    file: 'column-groups.md',
    title: 'Header bands',
    blurb:
      'Multi-row headers: banding columns under a shared header, nesting them, and folding a band shut.',
    demoTabs: ['header-groups'],
    section: 'Presentation',
  },
  {
    file: 'styling.md',
    title: 'Styling',
    blurb: 'The `--vt-*` variables, striping, and how cell backgrounds stack.',
    demoTabs: ['theming'],
    section: 'Presentation',
  },
  {
    file: 'virtualization.md',
    title: 'Virtual rows',
    blurb: 'Windowing a fixed-height list, and the whole-result-set caveat over a server source.',
    demoTabs: ['virtual'],
    section: 'Presentation',
  },
  {
    file: 'composing.md',
    title: 'Composing your own',
    blurb: 'Building a different table from the same parts, and hoisting state into a URL or store.',
    demoTabs: ['composed', 'state'],
    section: 'Going further',
  },
  {
    file: 'performance.md',
    title: 'Performance',
    blurb: 'The `shallowRef` rule, the invalidation invariants, and the benchmark numbers behind them.',
    demoTabs: ['perf'],
    section: 'Going further',
  },
  {
    file: 'recipes.md',
    title: 'Recipes',
    blurb: 'Six worked recipes, from a bare table to retheming without touching a component.',
    demoTabs: ['recipes'],
    section: 'Going further',
  },
]
