`<script setup lang="ts" generic="TRow extends Record<string, unknown>">
/**
 * The control that edits one cell, and the keyboard contract around it.
 *
 * This is the only place in the library that handles Enter and Tab. The rest of
 * the components handle Escape and the arrow keys and nothing else, so keeping
 * the commit gesture in one primitive is what stops a second, slightly
 * different convention growing beside the first. A cell cursor does not break
 * that: it handles Enter on a *closed* cell, to open one of these, and the
 * commit-and-move gesture is this component reporting where the user asked to
 * go rather than a second component claiming the key.
 *
 *   Enter             commit, and move down    (Shift: up)
 *   Ctrl/Cmd+Enter    commit, and move right   (Shift: left)
 *   Escape            cancel, putting the cell back the way it was
 *   Tab               move — one cell forward, or back with Shift
 *   Arrows            commit, and move that way   (only with `arrowMove`)
 *   blur              blur, and nothing more
 *
 * In a `textarea` both Enter and Shift+Enter insert the newline the control
 * exists for and neither commits, so the Ctrl/Cmd pair has to carry the commit
 * — and it keeps meaning *down* and *up* there rather than right and left,
 * because a multi-line cell with no way to commit and move down would be
 * missing the gesture people actually use. Down and up are simply unreachable
 * from a textarea. That follows from the control, not from a second convention.
 *
 * `blur` is reported rather than treated as a commit, because what leaving a
 * cell means depends on the table, not on the cell. Editing one cell at a time,
 * clicking away finishes the edit; editing a whole row, tabbing between its
 * fields must not fire a save per field. The component that knows which is
 * which is the one that owns the mode.
 *
 * The control itself comes from `editorFor`, so a column that declared
 * `type: 'number'` gets a number box without saying so twice — and a column
 * whose options arrive a portion at a time gets `AsyncSelect`, which claims
 * the arrows and, while its panel is up, Enter and Escape as well. Anything more
 * particular goes in the default slot, which is handed everything it needs to
 * behave the same way.
 *
 * Standalone like every primitive: given `column`, `value` and a listener it
 * needs no `<TableRoot>` above it.
 */
import { computed, nextTick, ref, watch } from 'vue'
import { editorFor } from '../../core/editing'
import { commitMoveFor, editorMoveFor, type CursorMove } from '../../core/cellCursor'
import type { ColumnDef } from '../../core/types'
import AsyncSelect from './AsyncSelect.vue'

const props = withDefaults(
  defineProps<{
    column: ColumnDef<TRow>
    /** What to show. Usually the draft's raw input, falling back to the cell. */
    value: unknown
    /** The row, for a slot that needs it. Not read by the default controls. */
    row?: TRow
    /** Message to announce and mark the control with. */
    error?: string | null
    disabled?: boolean
    /** Focus the control as soon as it renders — the cell was just clicked. */
    autofocus?: boolean
    /** Labels the control for assistive tech. Defaults to the column header. */
    label?: string
    /**
     * Take Tab over and report it as `move`. Off when the neighbouring cells
     * are already editors — a whole row open at once — since Tab then reaches
     * the next one on its own and intercepting it would only get in the way.
     */
    trapTab?: boolean
    /**
     * Take the arrow keys over and report them as `commit`, so an editor the
     * user opened by typing can be left the same way they arrived in it.
     *
     * Off by default: with no cell cursor over the table there is nowhere for
     * an arrow to move to, and with a whole row open at once moving between
     * its fields is navigation rather than a decision to save. A `select` and
     * a `textarea` keep their arrows either way — see `editorMoveFor`.
     */
    arrowMove?: boolean
  }>(),
  {
    row: undefined,
    error: null,
    disabled: false,
    autofocus: true,
    label: undefined,
    trapTab: true,
    arrowMove: false,
  },
)

const emit = defineEmits<{
  'update:value': [value: unknown]
  /**
   * Finish the edit, and — when the gesture named one — where the cursor should
   * land next.
   *
   * The direction rides on `commit` rather than on an event of its own because
   * the two have to be sequenced: a failed commit must not move anyone, and two
   * separate events arrive with the save still in flight. It is the payload of
   * an existing event rather than a new one so that every `@commit="save(row)"`
   * already written keeps working — a template handler written as a call drops
   * the argument.
   */
  commit: [next?: CursorMove]
  cancel: []
  /** Tab, and which way: `1` forward, `-1` back. Only when `trapTab`. */
  move: [delta: number]
  /** Focus left the control. What that means is the table's decision. */
  blur: []
}>()

const control = ref<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null>(null)
const kind = computed(() => editorFor(props.column))
const label = computed(() => props.label ?? props.column.header ?? props.column.id)

/**
 * A checkbox reads `checked`, everything else reads `value` — and a `null`
 * would render the literal string "null" in a text box rather than an empty
 * one, so blanks are flattened here rather than at every call site.
 */
const text = computed(() => (props.value === null || props.value === undefined ? '' : String(props.value)))
const checked = computed(() => props.value === true)

/**
 * The error is announced through a element of its own rather than the control's
 * own text, because `.vt-td` clips: a message rendered under the input would be
 * cut off by the row height. `title` carries it for a pointer, this carries it
 * for a screen reader.
 */
const errorId = computed(() => (props.error ? `vt-cell-error-${props.column.id}` : undefined))

watch(
  () => props.autofocus,
  (on) => {
    if (!on) return
    void nextTick(() => {
      const element = control.value
      if (!element) return
      element.focus()
      /*
       * The caret goes past whatever is already in the box, because the value
       * may be a character the user has just typed to open this editor: a
       * caret left at the start would put the next keystroke in front of it.
       *
       * `text` and `textarea` only. `setSelectionRange` throws an
       * `InvalidStateError` on a `number` or `date` input — the selection API
       * does not apply to them — and both open with their whole value ready
       * to be replaced anyway.
       */
      if (kind.value !== 'text' && kind.value !== 'textarea') return
      const field = element as HTMLInputElement | HTMLTextAreaElement
      const end = field.value.length
      field.setSelectionRange(end, end)
    })
  },
  { immediate: true },
)

function onInput(event: Event): void {
  const target = event.target as HTMLInputElement
  emit('update:value', kind.value === 'checkbox' ? target.checked : target.value)
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Enter') {
    const next = commitMoveFor(event, kind.value)
    // `undefined` means this Enter is not a commit in this control at all — the
    // textarea's plain Enter and Shift+Enter, which are the newline it exists
    // for. Left to the control rather than swallowed.
    if (!next) return
    event.preventDefault()
    emit('commit', next)
    return
  }
  if (props.arrowMove) {
    const move = editorMoveFor(event, kind.value)
    if (move) {
      // The commit and the move ride on one event for the reason Enter's do:
      // a save that fails must leave the cursor where it is, and two events
      // arrive with the save still in flight.
      event.preventDefault()
      emit('commit', move)
      return
    }
  }
  if (event.key === 'Escape') {
    event.preventDefault()
    // Stops here rather than bubbling: a filter popover or a menu further up
    // also closes on Escape, and cancelling an edit should not close them too.
    event.stopPropagation()
    emit('cancel')
    return
  }
  if (event.key === 'Tab' && props.trapTab) {
    event.preventDefault()
    emit('move', event.shiftKey ? -1 : 1)
  }
}
</script>

<template>
  <!--
    `data-kind` is a styling hook, not state: the preset drops the cell's
    padding so the control can fill it edge to edge, and a checkbox is the one
    control that must keep the padding — flush to the cell edge it would sit
    outside the column's own text.
  -->
  <span class="vt-cell-editor" :data-kind="kind" :data-invalid="error ? '' : undefined">
    <slot
      :value="value"
      :error="error"
      :disabled="disabled"
      :kind="kind"
      :update="(next: unknown) => emit('update:value', next)"
      :commit="() => emit('commit')"
      :cancel="() => emit('cancel')"
    >
      <!--
        The one control that is a component rather than an element, because a
        list that arrives in portions needs a panel, a scroll handler and a
        keyboard of its own. It keeps its own focus: `blur` reaches here only
        once focus has left the panel too, which is what stops a click into the
        dropdown from committing the row.
      -->
      <AsyncSelect
        v-if="kind === 'async-select' && column.asyncOptions"
        :source="column.asyncOptions"
        :value="value"
        :disabled="disabled"
        :error="error"
        :label="label"
        :required="column.required"
        :autofocus="autofocus"
        @update:value="emit('update:value', $event)"
        @blur="emit('blur')"
        @keydown="onKeydown"
      />

      <select
        v-else-if="kind === 'select'"
        ref="control"
        class="vt-cell-input"
        :value="text"
        :disabled="disabled"
        :aria-label="label"
        :aria-invalid="error ? 'true' : undefined"
        :aria-errormessage="errorId"
        :title="error ?? undefined"
        @change="onInput"
        @keydown="onKeydown"
        @blur="emit('blur')"
      >
        <!--
          An empty choice unless the column refuses one: a select with no way
          back to blank makes a nullable column one-way.
        -->
        <option v-if="!column.required" value="" />
        <option v-for="option in column.options ?? []" :key="String(option)" :value="String(option)">
          {{ column.groupLabel ? column.groupLabel(option) : String(option) }}
        </option>
      </select>

      <input
        v-else-if="kind === 'checkbox'"
        ref="control"
        class="vt-cell-checkbox"
        type="checkbox"
        :checked="checked"
        :disabled="disabled"
        :aria-label="label"
        :aria-invalid="error ? 'true' : undefined"
        :aria-errormessage="errorId"
        :title="error ?? undefined"
        @change="onInput"
        @keydown="onKeydown"
        @blur="emit('blur')"
      />

      <textarea
        v-else-if="kind === 'textarea'"
        ref="control"
        class="vt-cell-input"
        :value="text"
        :disabled="disabled"
        :aria-label="label"
        :aria-invalid="error ? 'true' : undefined"
        :aria-errormessage="errorId"
        :title="error ?? undefined"
        @input="onInput"
        @keydown="onKeydown"
        @blur="emit('blur')"
      />

      <!--
        `step="any"` on the number box, because the column never said otherwise.

        With no `step` the browser invents `step="1"`, and its step base is
        whatever value the control started with. Type 96367.42 into a cell
        holding 96367 and the input is `:invalid` on a stepMismatch, and the
        native spinner and arrow keys snap to that grid — a decimal column such
        as a rating loses its fraction to a key press that was meant to nudge
        it. Nothing in `ColumnDef` declares a precision, so the honest default
        is "any number the column's own `parse` and `validate` will accept",
        and those are where a column that wants integers should say so.
      -->
      <input
        v-else
        ref="control"
        class="vt-cell-input"
        :type="kind === 'number' ? 'number' : kind === 'date' ? 'date' : 'text'"
        :step="kind === 'number' ? 'any' : undefined"
        :value="text"
        :disabled="disabled"
        :aria-label="label"
        :aria-invalid="error ? 'true' : undefined"
        :aria-errormessage="errorId"
        :title="error ?? undefined"
        @input="onInput"
        @keydown="onKeydown"
        @blur="emit('blur')"
      />
    </slot>

    <span v-if="error" :id="errorId" class="vt-visually-hidden" role="alert">{{ error }}</span>
  </span>
</template>
