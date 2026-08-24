<script setup lang="ts" generic="TRow extends Record<string, unknown>">
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
 * `type: 'number'` gets a number box without saying so twice. Anything more
 * particular goes in the default slot, which is handed everything it needs to
 * behave the same way.
 *
 * Standalone like every primitive: given `column`, `value` and a listener it
 * needs no `<TableRoot>` above it.
 */
import { computed, nextTick, ref, watch } from 'vue'
import { editorFor } from '../../core/editing'
import { commitMoveFor, type CursorMove } from '../../core/cellCursor'
import type { ColumnDef } from '../../core/types'

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
  }>(),
  { row: undefined, error: null, disabled: false, autofocus: true, label: undefined, trapTab: true },
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
    void nextTick(() => control.value?.focus())
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
  <span class="vt-cell-editor" :data-invalid="error ? '' : undefined">
    <slot
      :value="value"
      :error="error"
      :disabled="disabled"
      :kind="kind"
      :update="(next: unknown) => emit('update:value', next)"
      :commit="() => emit('commit')"
      :cancel="() => emit('cancel')"
    >
      <select
        v-if="kind === 'select'"
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

      <input
        v-else
        ref="control"
        class="vt-cell-input"
        :type="kind === 'number' ? 'number' : kind === 'date' ? 'date' : 'text'"
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
