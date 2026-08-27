<!--
  Adopting vue-table in an existing Options API component, with a SERVER-paginated
  table and the app's own markup.

  A real component ported rather than a table built from scratch. It keeps the
  <table> and every CSS class the app's stylesheet expects, and takes everything
  behind them from the library.

  What it replaces           ->  with
    Paginated mixin              useTableState (page, pageSize) + <TablePagination>
    Ordering mixin               useTableState (sort) + <SortTrigger>
    Searching mixin              useTableState (globalSearch)
    useTableSelector             useRowSelection
    get_data() + loading flag    useServerDataSource
    <th-ordered>                 <SortTrigger>, inside the app's own <th>
    TableColumns mixin,          <ColumnVisibilityMenu> + useTable's `storageKey`
    v-table-columns,
    <TableColumnsDialog>

  What it keeps: ContextMenuMixin, <search-input>, <loading-indicator>, the
  status <select>, and the API contract with AddressApi.

  The three lines to adapt to your backend are marked ADAPT below.
-->
<template>
  <key-events @keyup.esc="filters_clear"/>
  <div class="row filter-row">
    <div class="filter-unit-4">
      <search-input ref="search_input"
                    @cr-search="search"/>
    </div>
    <div class="filter-unit-4">
      <!--
        No @change="refresh" any more. `status` writes into the query, and the
        data source refetches because the query changed — which also resets to
        page 1, so changing the filter while on page 5 can no longer land you on
        an empty result.
      -->
      <select v-model="status"
              :class="{'filter-not-default': status !== 0}"
              class="form-select cr">
        <option :value=0 class="t-muted">{{ $l.c.status }}</option>
        <option v-for="(v,k) in $l.status.address" :key="k" :value="k">{{ v }}</option>
      </select>
    </div>

    <div class="filter-unit-4 ms-auto pe-0">
      <button :class="{'no-perm': !UserPerms.address.create}"
              class="btn btn-primary w-100"
              @click="$refs.AddressDialog.show()">
        {{ $l.c.add }}
      </button>
    </div>
  </div>

  <div class="row filter-row-2 p-relative">
    <div class="filter-unit-4 ms-auto">
      <!--
        Replaces the "Столбцы" button AND TableColumnsDialog. It shows/hides,
        reorders and pins, refuses to hide the last visible column, and persists
        under useTable's `storageKey` — so the TableColumns mixin and the
        v-table-columns directive both come off this component.
      -->
      <ColumnVisibilityMenu label="Столбцы"/>
    </div>

    <div class="filter-unit-4">
      <!-- Replaces <cr-paginator>: reads page/pageSize/total from the context. -->
      <TablePagination :page-sizes="[20, 50, 100]"/>
    </div>
  </div>

  <div class="row p-relative">
    <loading-indicator :loading="loading"/>
    <table class="table table-striped compact-x3">
      <thead>
      <tr class="thead-tr-1">
        <!--
          Driven by columns.visible rather than written out one <th> at a time,
          which is what makes the menu's hide/show/reorder/pin actually move the
          markup. `cls` and `width` are plain extra fields on the column def —
          the library spreads unknown fields through to ResolvedColumn untouched,
          so app-specific presentation rides along with the column it belongs to.
        -->
        <th v-for="col in visibleColumns"
            :key="col.id"
            :class="col.cls"
            :style="col.width ? {width: col.width} : undefined">
          <SortTrigger v-if="col.sortable !== false" :column-id="col.id" :label="col.header"/>
          <template v-else>{{ col.header }}</template>
        </th>
      </tr>
      </thead>
      <tbody>
      <!--
        `objs` -> `rows`, and isSelected takes the ROW, not its id: the library
        derives the id itself so one selection survives a re-sort or a page
        change. Passing an id throws a named error rather than quietly returning
        false, so any call site you miss announces itself.
      -->
      <tr v-for="(o, index) in rows"
          :key="o.id"
          class="no-select"
          :class="{ 'selected': isSelected(o)}"
          @click.shift.exact="toggleSelection($event, o, index)"
          @click.ctrl.exact="toggleSelection($event, o, index)"
          @click.exact="edit(o.id)">
        <td v-for="col in visibleColumns" :key="col.id" :class="col.cls">
          <template v-if="col.id === 'coords'">
            {{ toRounded(o.lat, 6) }} {{ toRounded(o.lng, 6) }}
          </template>
          <span v-else-if="col.id === 'status'" :class="AddressStatusCSS(o.status)">
            {{ $l.status.address[o.status] }}
          </span>
          <template v-else>{{ o[col.id] }}</template>
        </td>
      </tr>
      <tr v-if="rows.length===0 && !loading" class="empty">
        <td :colspan="visibleColumns.length">{{ $l.c.empty_list }}</td>
      </tr>
      </tbody>
    </table>
  </div>

  <AddressDialog ref="AddressDialog"
                 @done="refresh"
                 @add_address_as_alias="(id) => edit(id)"/>

</template>

<script>

import SearchInput from "@/components/Forms/SearchInput.vue";
import ContextMenuMixin from "@/lib/mixins/ContextMenuMixin.js";
import CrOption from "@/components/widgets/CrOption.vue";
import CrSelect from "@/components/widgets/CrSelect.vue";
import Notify from "@/plugins/notify.js";
import AddressApi from "@/api/address.js";
import {AddressStatusCSS} from "@/components/common.js";
import MapModal from "@/views/MapProto/MapModal.vue";
import AddressDialog from "@/views/MapProto/dialogs/AddressDialog.vue";
import {computed} from "vue";
import {toFixed, toRounded} from "@/lib/common.js";
import {
  ColumnVisibilityMenu,
  SortTrigger,
  TablePagination,
  provideTableContext,
  useRowSelection,
  useServerDataSource,
  useTable,
  useTableState,
} from '@brillliand/vue-table-chad'
// The primitives ship no CSS of their own. This is the library's default theme
// for the three of them used here; drop it and style .vt-sort, .vt-columns-menu
// and .vt-pagination yourself to match the app instead.
import '@brillliand/vue-table-chad/style.css'

/**
 * Declared at module scope, not in setup(): the identity has to be stable
 * across renders, and nothing here depends on the instance.
 *
 * `cls` and `width` are not library fields — they are this app's presentation,
 * carried on the column so that a reorder moves them with it. Unknown fields
 * are spread through to ResolvedColumn untouched.
 *
 * With a server source, `type` and `accessor` describe the columns for
 * selection and rendering; the server itself does the sorting and filtering.
 */
const columns = [
  {
    id: 'coords', header: 'Координаты', sortable: false, hideable: false,
    accessor: (o) => `${o.lat} ${o.lng}`,
    cls: 'td-border-r', width: '11rem',
  },
  {id: 'status', header: 'Статус', type: 'number', cls: 'td-border-r t-c', width: '11rem'},
  {id: 'name', header: 'Адрес', type: 'text'},
  {id: 'alias_count', header: 'Алиасы', type: 'number', cls: 'td-border-l t-c', width: '6rem'},
]

const PER_PAGE = 20

export default {
  name: "Addresses",
  components: {
    AddressDialog, MapModal, SearchInput, CrSelect, CrOption,
    // The three primitives that replaced ThOrdered, CrPaginator and the columns dialog.
    SortTrigger, TablePagination, ColumnVisibilityMenu,
  },
  // Paginated, Ordering, Searching and TableColumns are all gone.
  mixins: [ContextMenuMixin],
  setup() {
    /**
     * One object holds page, pageSize, sort, filters and the search string, and
     * every mutator on it resets to page 1 where that is the right thing to do
     * — which is the bug this port fixes for free. It is plain JSON, so it also
     * drops straight into a URL if you ever want shareable filters.
     *
     * Note this is `PER_PAGE`, a module constant, not `this.per_page`: there is
     * no component instance inside setup(), and reaching for `this` here throws.
     */
    const state = useTableState({
      pageSize: PER_PAGE,
      initialSort: [{columnId: 'status', direction: 'desc'}],   // was set_default_order('status', '-')
    })

    /**
     * The status <select> reads and writes the query rather than a ref of its
     * own, so there is one source of truth and no @change="refresh" to forget.
     * `0` means "all", and clearing the filter is how that is expressed.
     */
    const status = computed({
      get: () => state.filterFor('status')?.include?.[0] ?? 0,
      set: (value) => {
        const code = Number(value)
        state.setFilter(
          'status',
          code ? {kind: 'values', include: [code], includeBlanks: false} : undefined,
        )
      },
    })

    const source = useServerDataSource(
      async ({query, signal}) => {
        // ADAPT (1/3): your API's parameter names. This mirrors what
        // page_form() + search_form() + order_by_form() used to build.
        const sort = query.sort[0]
        const resp = await AddressApi.get_list({
          page: query.page,
          per_page: query.pageSize,
          search: query.globalSearch || undefined,
          order_by: sort ? (sort.direction === 'desc' ? '-' : '') + sort.columnId : undefined,
          status: query.filters.status?.include?.[0] ?? 0,
          signal,   // ADAPT (2/3): drop this if AddressApi cannot forward an AbortSignal
        })

        // ADAPT (3/3): your envelope. Anything thrown here lands in
        // `source.error` and reaches onError below.
        if (!resp.success) throw new Error(resp.errors)
        return {rows: resp.result.objs, total: resp.result.count}
      },
      state.query,
      {
        debounceMs: 300,
        onError: (error) => Notify.error(error.message ?? error),
      },
    )

    const selection = useRowSelection(source.rows, source.total)

    /**
     * The whole table assembled with no table component: column layout,
     * selection gating and pagination, published so the primitives in the
     * template find it.
     *
     * `storageKey` is what replaces the TableColumns mixin — the visible set,
     * the order, the widths and the pins are saved under this key and restored
     * on the next visit.
     *
     * Without this provide, <SortTrigger> would render the right direction and
     * do nothing on click (it only emits `toggle`), and <ColumnVisibilityMenu>
     * would throw outright, since it reads the whole column model. The manual
     * alternative for the trigger alone is:
     *
     *   <SortTrigger column-id="name" :direction="state.sortFor('name')"
     *                @toggle="(id, additive) => state.toggleSort(id, additive)" />
     */
    const table = useTable({
      columns: () => columns,
      source: () => source,
      state,
      storageKey: 'addresses',
    })
    provideTableContext(table)

    /**
     * Everything below is returned FLAT, and that is not a style choice. Only
     * top-level refs are unwrapped in a template: return `source` whole and
     * `{{ source.total }}` still prints the right number, while
     * `source.total > 0` is silently false and `v-for="o in source.rows"`
     * throws. Flat, or not at all.
     */
    return {
      status,
      rows: source.rows,
      loading: source.loading,
      refresh: source.refresh,
      visibleColumns: table.columns.visible,

      // No order/order_by/order_dir, and no page_changed: <SortTrigger> and
      // <TablePagination> read and write the context themselves.
      search: (text) => state.setSearch(text ?? ''),
      state_reset: () => state.reset(),

      // The names ContextMenuMixin already knows, kept identical.
      isSelected: selection.isSelected,
      clearSelection: selection.clear,
      selectedIds: selection.selectedIds,
      selectedCount: selection.count,
      toggleSelection: (event, o) =>
        event.shiftKey ? selection.toggleRange(o) : selection.toggle(o),
    }
  },
  mounted() {
    // No refresh() here: useServerDataSource fetches once on creation
    // (`immediate`, on by default), and the initial sort is already in the query.
  },
  methods: {
    toRounded,
    toFixed,
    AddressStatusCSS,
    filters_clear() {
      this.clearSelection()
      this.state_reset()          // status, search, sort and page in one write
      this.$refs.search_input.clear()
    },
    edit(id) {
      this.$refs.AddressDialog.edit_mode(id)
    },
  },
}
</script>


<style scoped lang="scss">

</style>
