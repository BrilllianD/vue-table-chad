import { describe, expect, it } from 'vitest'
import {
  caretForSignificant,
  numberSeparators,
  significantBefore,
  toDisplayNumber,
  toMachineNumber,
} from '../src/core/numberMask'

/**
 * Separators are passed explicitly throughout. The module reads them from
 * `Intl` by default, which is right in a browser and unpinned in CI — a test
 * asserting on a comma would then be asserting on whichever ICU data the
 * runner shipped.
 */
const spaced = { group: ' ', decimal: ',' }
const anglo = { group: ',', decimal: '.' }

describe('the machine string', () => {
  it('keeps the sign, the digits and one point, and drops the rest', () => {
    expect(toMachineNumber('1 234 000', spaced)).toBe('1234000')
    expect(toMachineNumber('-1 234,5', spaced)).toBe('-1234.5')
    // A pasted currency is the number it obviously meant.
    expect(toMachineNumber('$1,234.00', anglo)).toBe('1234.00')
    // The second point is a typo; honouring it would move the decimal.
    expect(toMachineNumber('1.2.3', anglo)).toBe('1.23')
    // A `-` that is not in front is a stray character, not a second negation.
    expect(toMachineNumber('1-2', anglo)).toBe('12')
  })

  it('leaves a half-typed number alone', () => {
    // Someone on their way to 1.5. Eating the point they just typed makes the
    // decimal key look broken.
    expect(toMachineNumber('1.', anglo)).toBe('1.')
    expect(toMachineNumber('-', anglo)).toBe('-')
    expect(toMachineNumber('', anglo)).toBe('')
    // The zero is theirs until they say otherwise.
    expect(toMachineNumber('1.50', anglo)).toBe('1.50')
  })

  it('reads a comma as a point unless the locale groups with one', () => {
    expect(toMachineNumber('1,5', spaced)).toBe('1.5')
    expect(toMachineNumber('1,5', anglo)).toBe('15')
  })
})

describe('the display string', () => {
  it('groups the integer part, in the locale s own characters', () => {
    expect(toDisplayNumber('1234000', spaced)).toBe('1 234 000')
    expect(toDisplayNumber('1234000', anglo)).toBe('1,234,000')
    expect(toDisplayNumber('123', spaced)).toBe('123')
    expect(toDisplayNumber('-1234567.25', spaced)).toBe('-1 234 567,25')
  })

  it('never groups the fraction, and keeps a trailing point', () => {
    expect(toDisplayNumber('1234.5678', anglo)).toBe('1,234.5678')
    expect(toDisplayNumber('1234.', spaced)).toBe('1 234,')
    expect(toDisplayNumber('.5', anglo)).toBe('.5')
    expect(toDisplayNumber('', anglo)).toBe('')
    expect(toDisplayNumber('-', anglo)).toBe('-')
  })

  it('reads machine text, not text the locale wrote', () => {
    // The case where taking the argument as locale text breaks: German groups
    // with `.`, so reading the machine string `1234.5` under German rules would
    // drop the point and show twelve thousand. Grouped text goes through
    // `toMachineNumber` first, which is what the editor does on every key.
    const de = numberSeparators('de-DE')
    expect(toDisplayNumber('1234.5', de)).toBe('1.234,5')
    expect(toDisplayNumber(toMachineNumber('1.234,5', de), de)).toBe('1.234,5')
  })
})

describe('the caret', () => {
  it('counts what survives, not where it sat', () => {
    // "1 23|4 567" — three digits behind the caret, one separator ignored.
    expect(significantBefore('1 234 567', 4, spaced)).toBe(3)
    expect(significantBefore('-1 234', 3, spaced)).toBe(2)
    // Six, not five: the decimal point is significant too, or a caret sitting
    // just after it would be pulled back in front of it on the next keystroke.
    expect(significantBefore('1 234,5', 7, spaced)).toBe(6)
  })

  it('lands after a separator a new digit pushed in', () => {
    // Typing the `4` in "123|" makes "1 234": the caret belongs after the
    // fourth digit, which is past a separator that was not there before.
    expect(caretForSignificant('1 234', 4, spaced)).toBe(5)
    expect(caretForSignificant('1 234', 1, spaced)).toBe(1)
    expect(caretForSignificant('1 234', 0, spaced)).toBe(0)
    // More significance than the string has: the end, rather than an index
    // past it.
    expect(caretForSignificant('1 234', 9, spaced)).toBe(5)
  })
})

describe('the locale', () => {
  it('reads its separators from a formatted number', () => {
    expect(numberSeparators('de-DE')).toEqual({ group: '.', decimal: ',' })
    expect(numberSeparators('en-US')).toEqual({ group: ',', decimal: '.' })
  })

  it('round-trips a value through the locale that grouped it', () => {
    const de = numberSeparators('de-DE')
    expect(toDisplayNumber('1234567.8', de)).toBe('1.234.567,8')
    expect(toMachineNumber('1.234.567,8', de)).toBe('1234567.8')
  })
})
