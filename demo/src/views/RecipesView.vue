<script setup lang="ts">
/**
 * The copy-paste layer.
 *
 * Every other view is a live table you can poke; this one is the code you would
 * write to get there. It exists because a demo answers "does it do X" and a
 * reference answers "what is X called", but neither answers "what do I type" —
 * and that is the question someone arriving at a table library actually has.
 *
 * The snippets are the README's, kept here so the built demo stands on its own
 * as a docs site rather than sending a reader back to a Markdown file.
 */
import { ref } from 'vue'
import DemoSection from '../components/DemoSection.vue'

interface Recipe {
  id: string
  title: string
  /** Why you would reach for this, in one or two sentences. */
  why: string
  code: string
}

const recipes: Recipe[] = [
  {
    id: 'quick-start',
    title: 'A table, from nothing',
    why: `Three pieces: state (what to show), a source (where rows come from), and the preset that
          renders them. \`type\` is what makes filters and sorting behave — it picks the comparator
          and decides which operators the filter panel offers.`,
    code: `<script setup lang="ts">
import { shallowRef } from 'vue'
import { DataTable, useLocalDataSource, useTableState, type ColumnDef } from '@sandbox/vue-table'

// shallowRef, not ref: a plain ref proxies every row object, and every cell
// read during a filter or sort then goes through a Proxy trap.
const rows = shallowRef(people)

const columns: ColumnDef<Person>[] = [
  { id: 'name', header: 'Name', type: 'text', pinned: 'left' },
  { id: 'department', header: 'Department', type: 'enum' },
  { id: 'salary', header: 'Salary', type: 'number', align: 'right',
    format: (v) => (v == null ? '—' : \`$\${Number(v).toLocaleString()}\`) },
  { id: 'hiredAt', header: 'Hired', type: 'date' },
]

const state = useTableState({ pageSize: 25 })
const source = useLocalDataSource(rows, columns, state.query)
<\/script>

<template>
  <DataTable :columns="columns" :source="source" :state="state" selectable>
    <template #cell:name="{ row }">
      <a :href="\`/people/\${row.id}\`">{{ row.name }}</a>
    </template>
  </DataTable>
<\/template>`,
  },
  {
    id: 'server',
    title: 'Rows from a server',
    why: `Swap the source and nothing above it changes — both satisfy the same \`DataSource\`
          contract. You get debouncing on filter/search/sort but never on paging, abort and
          race-safety so a slow earlier response cannot overwrite a fast later one, and
          \`keepPreviousData\` so the table does not blank out between pages.`,
    code: `const source = useServerDataSource(
  ({ query, signal }) =>
    fetch(\`/api/people?\${new URLSearchParams({ q: JSON.stringify(query) })}\`, { signal })
      .then((r) => r.json()),          // -> { rows, total }
  state.query,
  {
    debounceMs: 300,
    fetchFacets: (columnId, { query, signal }) =>
      fetch(\`/api/people/facets?column=\${columnId}&q=\${encodeURIComponent(JSON.stringify(query))}\`,
        { signal }).then((r) => r.json()),
  },
)`,
  },
  {
    id: 'url',
    title: 'A shareable table',
    why: `\`QueryState\` is deliberately JSON-safe, so the whole view — sort, filters, page, search —
          fits in a URL. Hand \`useTableState\` a ref and it mirrors both ways: the table writes to
          it, and a back button writes back to the table.`,
    code: `import { useRouter, useRoute } from 'vue-router'

const route = useRoute()
const router = useRouter()

const query = computed({
  get: () => (route.query.q ? JSON.parse(String(route.query.q)) : createQueryState()),
  set: (next) => router.replace({ query: { q: JSON.stringify(next) } }),
})

// The table now owns nothing: the URL is the state.
const state = useTableState({ state: query })`,
  },
  {
    id: 'grouping',
    title: 'Banded rows, with totals',
    why: `Declare an \`aggregate\` on a column and every band gets that figure, plus the footer if
          you ask for one. \`groupMode\` decides who does the work: \`'client'\` bands the rows already
          loaded and never refetches, \`'server'\` puts the grouping in the query so bands stay whole
          across pages and counts describe the entire group.`,
    code: `const columns: ColumnDef<Employee>[] = [
  { id: 'department', header: 'Department', type: 'enum' },
  { id: 'salary', header: 'Salary', type: 'number', aggregate: 'sum',
    aggregateFormat: (r) => (r.value === null ? '—' : money.format(Number(r.value))) },
  // min/max know the row they came from, so \`format\` renders them.
  { id: 'hiredAt', header: 'Hired', type: 'date', aggregate: 'min' },
]

const state = useTableState({ pageSize: 25, initialGroupBy: ['department'], groupMode: 'server' })`,
  },
  {
    id: 'theming',
    title: 'Retheming without touching a component',
    why: `The preset's stylesheet hangs entirely off CSS variables. One thing to get right: a
          palette is a *set*. Overriding a light header colour while \`--vt-text\` stays on its
          dark-mode value gives you white-on-white.`,
    code: `.my-table {
  --vt-accent: #7c3aed;
  --vt-bg: #ffffff;
  --vt-bg-header: #faf5ff;
  --vt-text: #1f2937;
  --vt-text-muted: #6b7280;
  --vt-border: #e5e7eb;
  --vt-row-height: 40px;
  --vt-radius: 8px;
}

/* Row striping is two variables, and equal values mean no stripes. */
.my-table { --vt-bg-row-odd: #ffffff; --vt-bg-row-even: #fafafa; }`,
  },
  {
    id: 'composed',
    title: 'When the preset does not fit',
    why: `\`TableRoot\` renders nothing of its own — the slot receives everything and decides the
          markup entirely. The preset is just one caller of it. Drop to the primitives and the same
          state, sorting, filtering and selection drive whatever you build, table or not.`,
    code: `<TableRoot v-slot="{ displayRows, columns, selection, pagination }"
           :columns="columns" :source="source" selectable>
  <TableGrid :columns="columns" selection-column>
    <thead>
      <tr>
        <TableHeaderCell v-for="column in columns" :key="column.id" :column="column">
          <SortTrigger :column-id="column.id" :label="column.header ?? column.id" />
          <ColumnFilterPopover :column-id="column.id" :type="column.type ?? 'text'" />
        </TableHeaderCell>
      </tr>
    </thead>
    <tbody>
      <template v-for="item in displayRows">
        <TableGroupRow v-if="item.kind === 'group'" :key="item.group.key" :group="item.group" />
        <TableRow v-else :key="item.row.id" :row="item.row" :columns="columns"
                  :index="item.index" :depth="item.depth" />
      </template>
    </tbody>
  </TableGrid>
  <TablePagination />
<\/TableRoot>`,
  },
]

const copied = ref('')

async function copy(recipe: Recipe): Promise<void> {
  try {
    await navigator.clipboard.writeText(recipe.code)
    copied.value = recipe.id
    setTimeout(() => {
      if (copied.value === recipe.id) copied.value = ''
    }, 1500)
  } catch {
    // Clipboard access can be refused outright; the code is on screen either
    // way, so there is nothing to recover and nothing worth interrupting for.
    copied.value = ''
  }
}
</script>

<template>
  <DemoSection
    title="Recipes"
    blurb="What to type. Every other view is a live table you can poke; this is the code that gets
           you one. Each snippet is complete enough to paste."
    :api="['DataTable', 'useTableState', 'useLocalDataSource', 'useServerDataSource', 'TableRoot']"
  >
    <div class="recipes">
      <article v-for="recipe in recipes" :key="recipe.id" class="recipe">
        <header>
          <h3>{{ recipe.title }}</h3>
          <button type="button" class="recipe-copy" @click="copy(recipe)">
            {{ copied === recipe.id ? 'Copied' : 'Copy' }}
          </button>
        </header>
        <p class="hint">{{ recipe.why }}</p>
        <pre class="recipe-code"><code>{{ recipe.code }}</code></pre>
      </article>
    </div>
  </DemoSection>
</template>

<style scoped>
.recipes { display: flex; flex-direction: column; gap: 26px; }
.recipe { display: flex; flex-direction: column; gap: 8px; }
.recipe > header { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
.recipe h3 { margin: 0; font-size: 15px; }
.recipe-copy { font-size: 12px; }

.recipe-code {
  margin: 0;
  padding: 12px 14px;
  border-radius: 8px;
  background: rgb(127 127 127 / 0.1);
  /* Long lines scroll inside the block rather than widening the page. */
  overflow-x: auto;
  font-size: 12.5px;
  line-height: 1.55;
}
.recipe-code code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
</style>
