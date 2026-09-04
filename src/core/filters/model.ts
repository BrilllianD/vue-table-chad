import type {
  ColumnDataType,
  ColumnFilter,
  ConditionOperator,
  ConditionRule,
  ConditionsFilter,
  FilterValue,
  ValuesFilter,
} from '../types'
import { UNARY_OPERATORS, BINARY_OPERATORS } from '../types'
import { DEFAULT_LABELS } from '../labels'

/**
 * Excel's checkbox list: which distinct values survive.
 *
 * Blanks default to *excluded*: in Excel, ticking two departments means those
 * two and nothing else. "(Blanks)" is its own checkbox, so keeping blanks needs
 * an explicit `includeBlanks: true`.
 */
export function valuesFilter(include: FilterValue[] | null, includeBlanks = false): ValuesFilter {
  return { kind: 'values', include, includeBlanks }
}

/** Excel's operator rules, combined with and / or. */
export function conditionsFilter(rules: ConditionRule[], op: 'and' | 'or' = 'and'): ConditionsFilter {
  return { kind: 'conditions', op, rules }
}

/** Operators that take no operand: empty, notEmpty. */
export function isUnaryOperator(op: ConditionOperator): boolean {
  return (UNARY_OPERATORS as readonly string[]).includes(op)
}

/** Operators that take two: between. */
export function isBinaryOperator(op: ConditionOperator): boolean {
  return (BINARY_OPERATORS as readonly string[]).includes(op)
}

/** A rule that cannot narrow anything yet (operand still blank). */
export function isIncompleteRule(rule: ConditionRule): boolean {
  if (isUnaryOperator(rule.operator)) return false
  if (rule.value === undefined || rule.value === null || rule.value === '') return true
  if (isBinaryOperator(rule.operator)) {
    return rule.value2 === undefined || rule.value2 === null || rule.value2 === ''
  }
  return false
}

/**
 * True when the filter would keep every row. Used to strip no-op filters out
 * of `QueryState` so it stays small and URL-friendly.
 */
export function isEmptyFilter(filter: ColumnFilter | undefined | null): boolean {
  if (!filter) return true
  if (filter.kind === 'values') {
    return filter.include === null
  }
  return filter.rules.filter((r) => !isIncompleteRule(r)).length === 0
}

/** Drops incomplete rules; returns undefined when nothing meaningful remains. */
export function normalizeFilter(filter: ColumnFilter | undefined | null): ColumnFilter | undefined {
  if (!filter) return undefined
  if (filter.kind === 'values') {
    if (filter.include === null) return undefined
    return { kind: 'values', include: [...filter.include], includeBlanks: filter.includeBlanks }
  }
  const rules = filter.rules.filter((r) => !isIncompleteRule(r))
  if (rules.length === 0) return undefined
  return { kind: 'conditions', op: filter.op, rules }
}

/** Removes no-op entries so `QueryState.filters` only holds real filters. */
export function pruneFilters(filters: Record<string, ColumnFilter>): Record<string, ColumnFilter> {
  const out: Record<string, ColumnFilter> = {}
  for (const [columnId, filter] of Object.entries(filters)) {
    const normalized = normalizeFilter(filter)
    if (normalized) out[columnId] = normalized
  }
  return out
}

const TEXT_OPERATORS: ConditionOperator[] = [
  'contains',
  'notContains',
  'startsWith',
  'endsWith',
  'eq',
  'neq',
  'empty',
  'notEmpty',
]
const NUMBER_OPERATORS: ConditionOperator[] = [
  'eq',
  'neq',
  'gt',
  'gte',
  'lt',
  'lte',
  'between',
  'empty',
  'notEmpty',
]
const DATE_OPERATORS: ConditionOperator[] = ['on', 'before', 'after', 'between', 'empty', 'notEmpty']
const BOOLEAN_OPERATORS: ConditionOperator[] = ['eq']

/** Which operators the condition builder should offer for a column type. */
export function operatorsFor(type: ColumnDataType): ConditionOperator[] {
  switch (type) {
    case 'number':
      return NUMBER_OPERATORS
    case 'date':
      return DATE_OPERATORS
    case 'boolean':
      return BOOLEAN_OPERATORS
    case 'enum':
      return ['eq', 'neq', 'empty', 'notEmpty']
    case 'text':
    default:
      return TEXT_OPERATORS
  }
}

/**
 * Human-readable names for every operator.
 *
 * An alias onto the label record, so a table that translates its operators and
 * a caller that imports this map cannot end up wording them differently.
 */
export const OPERATOR_LABELS: Record<ConditionOperator, string> = DEFAULT_LABELS.operators

/** The operator a fresh rule on this type starts with. */
export function defaultOperator(type: ColumnDataType): ConditionOperator {
  return operatorsFor(type)[0]!
}
