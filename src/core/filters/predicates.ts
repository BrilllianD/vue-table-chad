import type { ColumnDataType, ColumnFilter, ConditionRule, FilterValue } from '../types'
import { isIncompleteRule } from './model'
import {
  facetKey,
  isBlank,
  startOfDay,
  toBoolean,
  toFilterValue,
  toNumber,
} from '../utils/values'

function textOf(value: unknown): string {
  return String(value).toLowerCase()
}

function matchesTextRule(raw: unknown, rule: ConditionRule): boolean {
  const blank = isBlank(raw)
  switch (rule.operator) {
    case 'empty':
      return blank
    case 'notEmpty':
      return !blank
    default:
      break
  }
  if (blank) return false
  const haystack = textOf(raw)
  const needle = textOf(rule.value)
  switch (rule.operator) {
    case 'contains':
      return haystack.includes(needle)
    case 'notContains':
      return !haystack.includes(needle)
    case 'startsWith':
      return haystack.startsWith(needle)
    case 'endsWith':
      return haystack.endsWith(needle)
    case 'eq':
      return haystack === needle
    case 'neq':
      return haystack !== needle
    default:
      return true
  }
}

function matchesNumberRule(raw: unknown, rule: ConditionRule): boolean {
  const blank = isBlank(raw)
  if (rule.operator === 'empty') return blank
  if (rule.operator === 'notEmpty') return !blank
  const value = toNumber(raw)
  const operand = toNumber(rule.value)
  if (value === undefined || operand === undefined) return false
  switch (rule.operator) {
    case 'eq':
      return value === operand
    case 'neq':
      return value !== operand
    case 'gt':
      return value > operand
    case 'gte':
      return value >= operand
    case 'lt':
      return value < operand
    case 'lte':
      return value <= operand
    case 'between': {
      const upper = toNumber(rule.value2)
      if (upper === undefined) return false
      const [lo, hi] = operand <= upper ? [operand, upper] : [upper, operand]
      return value >= lo && value <= hi
    }
    default:
      return true
  }
}

/** Date comparisons happen at calendar-day granularity, like Excel's. */
function matchesDateRule(raw: unknown, rule: ConditionRule): boolean {
  const blank = isBlank(raw)
  if (rule.operator === 'empty') return blank
  if (rule.operator === 'notEmpty') return !blank
  const value = startOfDay(raw)
  const operand = startOfDay(rule.value)
  if (value === undefined || operand === undefined) return false
  switch (rule.operator) {
    case 'on':
      return value === operand
    case 'before':
      return value < operand
    case 'after':
      return value > operand
    case 'between': {
      const upper = startOfDay(rule.value2)
      if (upper === undefined) return false
      const [lo, hi] = operand <= upper ? [operand, upper] : [upper, operand]
      return value >= lo && value <= hi
    }
    default:
      return true
  }
}

function matchesBooleanRule(raw: unknown, rule: ConditionRule): boolean {
  const blank = isBlank(raw)
  if (rule.operator === 'empty') return blank
  if (rule.operator === 'notEmpty') return !blank
  const value = toBoolean(raw)
  const operand = toBoolean(rule.value)
  if (value === undefined || operand === undefined) return false
  return rule.operator === 'neq' ? value !== operand : value === operand
}

export function matchesRule(raw: unknown, rule: ConditionRule, type: ColumnDataType): boolean {
  switch (type) {
    case 'number':
      return matchesNumberRule(raw, rule)
    case 'date':
      return matchesDateRule(raw, rule)
    case 'boolean':
      return matchesBooleanRule(raw, rule)
    case 'enum':
    case 'text':
    default:
      return matchesTextRule(raw, rule)
  }
}

/**
 * Does one raw cell value survive one column filter?
 *
 * An unset filter (`include: null`, or no complete rules) keeps everything —
 * callers rely on this so a half-built filter never blanks the table.
 */
export function matchesFilter(raw: unknown, filter: ColumnFilter, type: ColumnDataType = 'text'): boolean {
  if (filter.kind === 'values') {
    if (filter.include === null) return true
    const value = toFilterValue(raw, type)
    if (value === null) return filter.includeBlanks
    const allowed = new Set(filter.include.map(facetKey))
    return allowed.has(facetKey(value))
  }

  const rules = filter.rules.filter((rule) => !isIncompleteRule(rule))
  if (rules.length === 0) return true
  return filter.op === 'or'
    ? rules.some((rule) => matchesRule(raw, rule, type))
    : rules.every((rule) => matchesRule(raw, rule, type))
}

/**
 * Pre-builds the allowed-value set once per filter instead of once per row —
 * `matchesFilter` rebuilds it on every call, which is O(rows × values) on a
 * 10k-row local dataset.
 */
export function compileFilter(
  filter: ColumnFilter,
  type: ColumnDataType = 'text',
): (raw: unknown) => boolean {
  if (filter.kind === 'values') {
    if (filter.include === null) return () => true
    const allowed = new Set(filter.include.map(facetKey))
    const includeBlanks = filter.includeBlanks
    return (raw: unknown) => {
      const value = toFilterValue(raw, type)
      if (value === null) return includeBlanks
      return allowed.has(facetKey(value))
    }
  }

  const rules = filter.rules.filter((rule) => !isIncompleteRule(rule))
  if (rules.length === 0) return () => true
  const any = filter.op === 'or'
  return (raw: unknown) =>
    any
      ? rules.some((rule) => matchesRule(raw, rule, type))
      : rules.every((rule) => matchesRule(raw, rule, type))
}

/** Case-insensitive substring match used by the global search box. */
export function matchesSearch(values: unknown[], search: string): boolean {
  const test = compileSearch(search)
  if (!test) return true
  return values.some(test)
}

/**
 * The same test, with the needle lowered once instead of once per call.
 *
 * `matchesSearch` re-trims and re-lowercases the term for every row it is asked
 * about — unnoticeable once, and ten thousand times over on every keystroke.
 * Returning `undefined` for an empty search lets a caller skip the column loop
 * outright rather than run a test that always passes.
 */
export function compileSearch(search: string): ((value: unknown) => boolean) | undefined {
  const needle = search.trim().toLowerCase()
  if (needle === '') return undefined
  return (value: unknown) => !isBlank(value) && textOf(value).includes(needle)
}

export type { FilterValue }
