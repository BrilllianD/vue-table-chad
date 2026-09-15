<script setup lang="ts">
/**
 * The right-click menu: five actions on the cell under the pointer.
 *
 * The point of the view is that none of the five is new behaviour. Every item
 * calls the mutator some other control already calls — the filter panel, the
 * sort trigger, the two dropdown menus — so the `QueryState` readout beside the
 * table moves in exactly the same way whichever route was taken. That is worth
 * seeing rather than taking on trust, which is why the inspector is open.
 */
import { computed, ref, shallowRef } from 'vue'
import {
  DataTable,
  contextMenuFor,
  useLocalDataSource,
  useTableState,
} from '@brillliand/vue-table-chad'
import { employees, type Employee } from '../data/dataset'
import { employeeColumns } from '../columns'
import DemoSection from '../components/DemoSection.vue'
import ControlGroup from '../components/ControlGroup.vue'
import ToggleControl from '../components/ToggleControl.vue'
import StateInspector from '../components/StateInspector.vue'

const rows = shallowRef(employees.slice(0, 200))
const state = useTableState({ pageSize: 8 })
const source = useLocalDataSource<Employee>(rows, employeeColumns, state.query)

/**
 * One column that refuses everything, so the disabled items are reachable.
 *
 * `name` is the row's identity here: hiding it or grouping by it would leave a
 * table nobody can read, which is the honest reason a column says no.
 */
const columns = computed(() =>
  employeeColumns
    .filter((column) => ['name', 'department', 'role', 'salary', 'hiredAt'].includes(column.id))
    .map((column) =>
      column.id === 'name'
        ? { ...column, hideable: false, groupable: false, filterable: false }
        : column,
    ),
)

const contextMenu = ref(true)
const cellCursor = ref(true)
const extraItem = ref(true)

/** What the consumer's own item did, so pressing it is visibly not a no-op. */
const lastAudit = ref<string>('—')

function audit(rowId: unknown): void {
  const row = rows.value.find((candidate) => String(candidate.id) === String(rowId))
  lastAudit.value = row ? `audit trail for ${row.name}` : 'no row — opened on a header cell'
}

/**
 * The decoder on its own, so the keys the menu answers are testable from the
 * page: type into the box and it says whether that press would open the menu.
 * The same function `TableGrid` uses, imported from the package.
 */
const probe = ref('')
const probeAnswer = ref<string>('press a key in the box')

function onProbe(event: KeyboardEvent): void {
  probe.value = ''
  const parts = [
    event.ctrlKey ? 'Ctrl' : '',
    event.metaKey ? 'Cmd' : '',
    event.altKey ? 'Alt' : '',
    event.shiftKey ? 'Shift' : '',
    event.key,
  ].filter(Boolean)
  probeAnswer.value = `${parts.join('+')} → ${contextMenuFor(event) ? 'opens the menu' : 'not a menu key'}`
}
</script>

<template>
  <DemoSection
    title="The right-click menu"
    :try-it="[
      'Right-click a cell and filter by its value, then watch the same filter appear in the QueryState below and as a chip above the table.',
      'Right-click the Name column: filter, group and hide are greyed, because that column refuses all three.',
      'Right-click a header cell — the two items that need a cell to read are gone.',
      'Focus a cell and press Shift+F10, then walk the items with the arrow keys and Esc out.',
    ]"
    blurb="Five actions on the column under the pointer, each one a call the table already makes
           somewhere else: setFilter, setSort, toggleGroup, toggleVisibility, and the cell's
           displayed text on the clipboard. The menu composes them and owns no logic — which is why
           a filter set here is indistinguishable from one set in the filter panel. Shift+F10 opens
           the same menu from the keyboard, and #contextMenu adds items of your own."
    :api="[
      'DataTable contextMenu',
      'DataTable #contextMenu',
      'TableContextMenu',
      'contextMenuFor',
      'ContextMenuTarget',
    ]"
  >
    <template #controls>
      <ControlGroup legend="The menu">
        <ToggleControl
          v-model="contextMenu"
          label="context-menu"
          hint="off means off: the browser's own menu comes back"
        />
        <ToggleControl
          v-model="cellCursor"
          label="cell-cursor"
          hint="what gives Shift+F10 a cell to open on"
        />
        <ToggleControl
          v-model="extraItem"
          label="#contextMenu slot"
          hint="a sixth item, after the five the table brings"
        />
        <template #hint>
          <code>TableContextMenu</code> is the fourth primitive that needs a
          <code>&lt;TableRoot&gt;</code> above it — it reads the whole column, filter and grouping
          model rather than taking it as props, like <code>ColumnVisibilityMenu</code>,
          <code>RowGroupMenu</code> and <code>ActiveFilters</code>.
        </template>
      </ControlGroup>

      <ControlGroup legend="The keys">
        <input
          v-model="probe"
          class="probe"
          type="text"
          placeholder="press a key"
          @keydown.prevent="onProbe"
        />
        <template #hint>
          {{ probeAnswer }} — <code>contextMenuFor(event)</code>, the decoder the grid itself uses.
          A bare <code>F10</code> is the browser's menu bar, so the <code>Shift</code> is required.
        </template>
      </ControlGroup>

      <ControlGroup legend="Your own item">
        <template #hint>Last pressed: {{ lastAudit }}</template>
      </ControlGroup>
    </template>

    <DataTable
      :columns="columns"
      :source="source"
      :state="state"
      :context-menu="contextMenu"
      :cell-cursor="cellCursor"
    >
      <template v-if="extraItem" #contextMenu="{ rowId, close }">
        <button
          type="button"
          class="vt-context-item"
          role="menuitem"
          @click="audit(rowId), close()"
        >
          Show audit trail
        </button>
      </template>
    </DataTable>

    <StateInspector label="QueryState" :value="state.query.value" open />
  </DemoSection>
</template>

<style scoped>
.probe { width: 140px; }
</style>
