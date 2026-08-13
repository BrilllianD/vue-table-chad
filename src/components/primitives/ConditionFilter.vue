<script setup lang="ts">
/**
 * Excel's "Text/Number/Date Filters…" submenu: an operator-based rule builder.
 * Offers only the operators that make sense for the column's data type.
 */
import { computed, ref, watch } from 'vue'
import type { ColumnDataType, ConditionRule, ConditionsFilter } from '../../core/types'
import {
  OPERATOR_LABELS,
  conditionsFilter,
  defaultOperator,
  isBinaryOperator,
  isUnaryOperator,
  operatorsFor,
} from '../../core/filters/model'

const props = defineProps<{
  type: ColumnDataType
  modelValue: ConditionsFilter | undefined
  maxRules?: number
}>()

const emit = defineEmits<{ 'update:modelValue': [filter: ConditionsFilter | undefined] }>()

const rules = ref<ConditionRule[]>([])
const op = ref<'and' | 'or'>('and')

watch(
  () => props.modelValue,
  (filter) => {
    rules.value = filter ? filter.rules.map((rule) => ({ ...rule })) : [blankRule()]
    op.value = filter?.op ?? 'and'
  },
  { immediate: true, deep: true },
)

function blankRule(): ConditionRule {
  return { operator: defaultOperator(props.type), value: '' }
}

const operators = computed(() => operatorsFor(props.type))
const canAdd = computed(() => rules.value.length < (props.maxRules ?? 3))

/** `date` gets a native date picker, `number` a numeric field. */
const inputType = computed(() => {
  if (props.type === 'date') return 'date'
  if (props.type === 'number') return 'number'
  return 'text'
})

function addRule(): void {
  if (canAdd.value) rules.value.push(blankRule())
}

function removeRule(index: number): void {
  rules.value.splice(index, 1)
  if (rules.value.length === 0) rules.value.push(blankRule())
}

function apply(): void {
  emit('update:modelValue', conditionsFilter(rules.value.map((r) => ({ ...r })), op.value))
}

function clear(): void {
  rules.value = [blankRule()]
  emit('update:modelValue', undefined)
}

defineExpose({ apply, clear })
</script>

<template>
  <div class="vt-conditions">
    <div v-for="(rule, index) in rules" :key="index" class="vt-condition">
      <select
        v-if="index > 0"
        v-model="op"
        class="vt-condition-op"
        aria-label="Combine conditions with"
      >
        <option value="and">And</option>
        <option value="or">Or</option>
      </select>
      <span v-else class="vt-condition-op vt-condition-op-first">Where</span>

      <select v-model="rule.operator" class="vt-condition-operator" aria-label="Operator">
        <option v-for="operator in operators" :key="operator" :value="operator">
          {{ OPERATOR_LABELS[operator] }}
        </option>
      </select>

      <template v-if="!isUnaryOperator(rule.operator)">
        <input
          v-model="rule.value"
          :type="inputType"
          class="vt-condition-value"
          placeholder="Value"
          aria-label="Value"
        />
        <input
          v-if="isBinaryOperator(rule.operator)"
          v-model="rule.value2"
          :type="inputType"
          class="vt-condition-value"
          placeholder="and"
          aria-label="Second value"
        />
      </template>

      <button
        v-if="rules.length > 1"
        type="button"
        class="vt-btn vt-btn-icon"
        aria-label="Remove condition"
        @click="removeRule(index)"
      >
        ×
      </button>
    </div>

    <button v-if="canAdd" type="button" class="vt-btn vt-btn-link" @click="addRule">
      + Add condition
    </button>

    <div class="vt-valuelist-actions">
      <button type="button" class="vt-btn" @click="clear">Clear</button>
      <button type="button" class="vt-btn vt-btn-primary" @click="apply">Apply</button>
    </div>
  </div>
</template>
