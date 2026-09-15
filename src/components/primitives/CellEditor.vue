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
import { editorFor, optionLabelFor } from '../../core/editing'
import {
  caretForSignificant,
  significantBefore,
  toDisplayNumber,
  toMachineNumber,
} from '../../core/numberMask'
import { commitMoveFor, editorMoveFor, type CursorMove } from '../../core/cellCursor'
import type { ColumnDef } from '../../core/types'
import AsyncSelect from './AsyncSelect.vue'
import StaticSelect from './StaticSelect.vue'

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
    /**
     * Select the whole value when the control takes focus, so the first
     * keystroke replaces it the way a spreadsheet does.
     *
     * Turn it off for an editor opened by *typing*: the value is already the
     * character the user just typed, and selecting it would let their next
     * keystroke eat it. Off too where moving between open editors is
     * navigation rather than a decision to retype — a whole row open at once.
     */
    selectOnFocus?: boolean
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
    selectOnFocus: true,
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
   *
   * Enter and an arrow send the same payload on purpose: both mean "done here,
   * the cursor goes there", and the table treats them alike. Nothing here says
   * which key it was, because nothing downstream is allowed to care.
   */
  commit: [next?: CursorMove]
  cancel: []
  /** Tab, and which way: `1` forward, `-1` back. Only when `trapTab`. */
  move: [delta: number]
  /** Focus left the control. What that means is the table's decision. */
  blur: []
}>()

const control = ref<HTMLInputElement | HTMLTextAreaElement | null>(null)
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
 * What a number box shows: the same value, grouped into thousands.
 *
 * The draft still holds the machine string — see `numberMask.ts` — so
 * `parseCellInput` and any `column.parse` are handed exactly what a native
 * number box used to hand them. Only the characters on screen change.
 */
const display = computed(() => (kind.value === 'number' ? toDisplayNumber(text.value) : text.value))

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
       * Not on `date`: `setSelectionRange` throws an `InvalidStateError`
       * there — the selection API does not apply to that control — and it
       * opens with its whole value ready to be replaced anyway. A `number`
       * column is a masked text box, so it is included.
       */
      if (kind.value !== 'text' && kind.value !== 'textarea' && kind.value !== 'number') return
      const field = element as HTMLInputElement | HTMLTextAreaElement
      const end = field.value.length
      /*
       * Selected, so the first keystroke replaces the value: the cell was
       * opened on purpose, and retyping it is what opening it usually means.
       *
       * Without `selectOnFocus` the caret goes past whatever is in the box
       * instead, because the value is then a character the user has just typed
       * to open this editor — a selection would have their next keystroke
       * overwrite it, and a caret at the start would put it in front.
       */
      if (props.selectOnFocus) field.setSelectionRange(0, end)
      else field.setSelectionRange(end, end)
    })
  },
  { immediate: true },
)

function onInput(event: Event): void {
  const target = event.target as HTMLInputElement
  if (kind.value === 'checkbox') {
    emit('update:value', target.checked)
    return
  }
  if (kind.value === 'number') {
    onNumberInput(target)
    return
  }
  emit('update:value', target.value)
}

/**
 * A masked number box, regrouped on every keystroke.
 *
 * The element is written to directly rather than left to the binding, because
 * the binding cannot fix it: two typings can produce the same machine string —
 * `1234` and `1234x` both give `1234` — and with the bound value unchanged Vue
 * patches nothing, leaving whatever was typed on screen. Writing `value` here
 * keeps the DOM and the vnode agreeing either way.
 *
 * The caret is then restored by significance rather than by index, since
 * inserting a digit can push a separator in ahead of it. `numberMask.ts` says
 * what that means.
 */
function onNumberInput(target: HTMLInputElement): void {
  const typed = target.value
  const caret = target.selectionStart ?? typed.length
  const machine = toMachineNumber(typed)
  const shown = toDisplayNumber(machine)

  if (typed !== shown) {
    const significant = significantBefore(typed, caret)
    target.value = shown
    const next = caretForSignificant(shown, significant)
    target.setSelectionRange(next, next)
  }

  emit('update:value', machine)
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

      <!--
        The same panel `AsyncSelect` renders, over a list that is already here.
        A native `<select>` used to be here and is not a loss: its option list
        is drawn by the operating system, so it ignored every `--vtc-` token,
        could not be typeahead-matched against a label the column supplied, and
        reported no open state for the cursor to read. The blank choice is the
        control's own, behind the same `required` rule it always was.
      -->
      <StaticSelect
        v-else-if="kind === 'select'"
        :options="column.options ?? []"
        :option-label="(option) => optionLabelFor(column, option)"
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
        A number column edits in a **text** box carrying `inputmode`, not in
        `input[type=number]`.

        The mask is why: a number input only accepts a bare float as its value,
        so `1 234 000` cannot be put in one — the browser reads a grouped value
        as empty and hands back the empty string. Going to text costs the
        native spinner and the numeric keyboard; `inputmode="decimal"` buys the
        keyboard back, and the spinner is no loss. It stepped by a `1` nothing
        chose — no `ColumnDef` field declares a precision, which is why the
        `step` here used to be `any` — and Up/Down over a cell cursor already
        mean commit-and-move.
      -->
      <input
        v-else
        ref="control"
        class="vt-cell-input"
        :type="kind === 'date' ? 'date' : 'text'"
        :inputmode="kind === 'number' ? 'decimal' : undefined"
        :value="display"
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
