<script setup lang="ts">
/**
 * Excel's "Text/Number/Date Filters…" submenu: an operator-based rule builder.
 * Offers only the operators that make sense for the column's data type.
 */
import { computed, ref, watch } from 'vue'
import { useTableLabels } from '../../core/context'
import type { ColumnDataType, ConditionRule, ConditionsFilter } from '../../core/types'
import {
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

const labels = useTableLabels()
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
        :aria-label="labels.combineConditions"
      >
        <option value="and">{{ labels.conjunctionAnd }}</option>
        <option value="or">{{ labels.conjunctionOr }}</option>
      </select>
      <span v-else class="vt-condition-op vt-condition-op-first">
        {{ labels.conditionWhere }}
      </span>

      <select v-model="rule.operator" class="vt-condition-operator" :aria-label="labels.operator">
        <option v-for="operator in operators" :key="operator" :value="operator">
          {{ labels.operators[operator] }}
        </option>
      </select>

      <template v-if="!isUnaryOperator(rule.operator)">
        <input
          v-model="rule.value"
          :type="inputType"
          class="vt-condition-value"
          :placeholder="labels.conditionValue"
          :aria-label="labels.conditionValue"
        />
        <input
          v-if="isBinaryOperator(rule.operator)"
          v-model="rule.value2"
          :type="inputType"
          class="vt-condition-value"
          :placeholder="labels.conditionSecondValuePlaceholder"
          :aria-label="labels.conditionSecondValue"
        />
      </template>

      <button
        v-if="rules.length > 1"
        type="button"
        class="vt-btn vt-btn-icon"
        :aria-label="labels.removeCondition"
        @click="removeRule(index)"
      >
        ×
      </button>
    </div>

    <button v-if="canAdd" type="button" class="vt-btn vt-btn-link" @click="addRule">
      + {{ labels.addCondition }}
    </button>

    <div class="vt-valuelist-actions">
      <button type="button" class="vt-btn" @click="clear">{{ labels.clear }}</button>
      <button type="button" class="vt-btn vt-btn-primary" @click="apply">
        {{ labels.apply }}
      </button>
    </div>
  </div>
</template>
