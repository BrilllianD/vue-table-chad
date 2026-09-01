/**
 * Thousands grouping for a number cell that is being typed into.
 *
 * A number column edits through a **text** box rather than `input[type=number]`
 * for one reason: a number input's value has to parse as a bare float, so
 * `"1 234 000"` cannot be put in one — the browser reads a grouped value as
 * empty and hands back `""`. Masking therefore means owning the text, which is
 * what this file is: the string a person sees, the string the table stores, and
 * the caret position between them.
 *
 * Two strings, never confused:
 *
 *   - **the machine string** — `-1234000.5`. What a draft holds and what
 *     `parseCellInput` is handed, so `column.parse` and `toNumber` keep seeing
 *     exactly what they saw when this was a native number box.
 *   - **the display string** — `-1 234 000,5` in a locale that groups with
 *     spaces. Never stored, never parsed.
 *
 * Separators come from `Intl.NumberFormat`, so an edited cell groups the way
 * the same value is *rendered* by a `format` the column already declared.
 * Hard-coding a comma would make a table read one way and edit another for most
 * of the world.
 *
 * Pure and DOM-free like the rest of `core/`: the caret comes back as an index
 * for the component to apply.
 */

/** The pair of characters a locale groups and points with. */
export interface NumberSeparators {
  group: string
  decimal: string
}

/**
 * The separators a machine string is written with, whatever the locale is.
 *
 * `toDisplayNumber` reads its argument as machine text rather than as something
 * the locale wrote, because the two disagree exactly where it hurts: `de-DE`
 * groups with `.`, so reading the machine string `1234.5` under German rules
 * would drop the point and render twelve thousand.
 */
const MACHINE_SEPARATORS: NumberSeparators = { group: ',', decimal: '.' }

const cache = new Map<string, NumberSeparators>()

/**
 * What this locale groups and points with, worked out once per locale.
 *
 * Read off a formatted number rather than from a table of locales, so it stays
 * correct for whatever the runtime actually implements.
 */
export function numberSeparators(locale?: string): NumberSeparators {
  const key = locale ?? ''
  const hit = cache.get(key)
  if (hit) return hit

  const parts = new Intl.NumberFormat(locale).formatToParts(12345.6)
  const separators: NumberSeparators = {
    group: parts.find((part) => part.type === 'group')?.value ?? ',',
    decimal: parts.find((part) => part.type === 'decimal')?.value ?? '.',
  }
  cache.set(key, separators)
  return separators
}

/**
 * Whether a character means "decimal point" in this locale.
 *
 * A comma and a full stop both count — a numeric keypad gives whichever its
 * layout decided — except for the one that is this locale's *group* separator,
 * where it means the opposite thing.
 */
function isDecimal(char: string, separators: NumberSeparators): boolean {
  if (char === separators.group) return false
  return char === separators.decimal || char === '.' || char === ','
}

function isDigit(char: string): boolean {
  return char >= '0' && char <= '9'
}

/**
 * The machine string behind whatever was typed: a leading `-`, digits, and at
 * most one `.`.
 *
 * Anything else is dropped rather than refused, so a pasted `$1,234.00` becomes
 * the number it obviously meant. A trailing point survives — `1.` is someone
 * halfway through typing `1.5`, and eating the point they just pressed would
 * make the decimal key look broken.
 */
export function toMachineNumber(text: string, separators = numberSeparators()): string {
  let sign = ''
  let digits = ''
  let fraction: string | null = null

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]!
    if (isDigit(char)) {
      if (fraction === null) digits += char
      else fraction += char
      continue
    }
    // Only where a sign can be. A `-` further in is a stray character, not a
    // second negation.
    if (char === '-' && sign === '' && digits === '' && fraction === null) {
      sign = '-'
      continue
    }
    // The second point is dropped rather than honoured: `1.2.3` is a typo, and
    // starting a new fraction from it would silently move the decimal.
    if (fraction === null && isDecimal(char, separators)) fraction = ''
  }

  if (digits === '' && fraction === null) return sign
  return fraction === null ? `${sign}${digits}` : `${sign}${digits}.${fraction}`
}

/** `1234567` -> `1 234 567`, in whatever this locale groups with. */
function group(digits: string, separator: string): string {
  if (digits.length <= 3) return digits
  let out = ''
  for (let i = 0; i < digits.length; i += 1) {
    // Counted from the right, the only end a group is fixed to.
    if (i > 0 && (digits.length - i) % 3 === 0) out += separator
    out += digits[i]!
  }
  return out
}

/**
 * The display string for a machine string, including a half-typed one — which
 * is the case that matters, since this runs on every keystroke.
 *
 * The fraction is left alone: grouping it is wrong, and trimming a trailing
 * zero would delete the `0` in `1.50` as it is being typed.
 */
export function toDisplayNumber(text: string, separators = numberSeparators()): string {
  const machine = toMachineNumber(text, MACHINE_SEPARATORS)
  if (machine === '' || machine === '-') return machine

  const sign = machine.startsWith('-') ? '-' : ''
  const body = sign ? machine.slice(1) : machine
  const point = body.indexOf('.')
  if (point === -1) return sign + group(body, separators.group)

  const whole = group(body.slice(0, point), separators.group)
  return `${sign}${whole}${separators.decimal}${body.slice(point + 1)}`
}

/**
 * How many of a string's first `index` characters survive into the machine
 * string — the caret's position, measured in characters that mean something.
 *
 * Grouping moves separators around under the caret on every keystroke, so an
 * index into the old text means nothing in the new one. What does survive is
 * "three significant characters are behind the caret".
 */
export function significantBefore(
  text: string,
  index: number,
  separators = numberSeparators(),
): number {
  let count = 0
  let seenDecimal = false
  for (let i = 0; i < Math.min(index, text.length); i += 1) {
    const char = text[i]!
    if (isDigit(char) || (char === '-' && i === 0)) count += 1
    else if (!seenDecimal && isDecimal(char, separators)) {
      seenDecimal = true
      count += 1
    }
  }
  return count
}

/**
 * Where the caret goes in a display string, given that many significant
 * characters should sit behind it.
 *
 * It lands *after* a group separator rather than before it, so typing the digit
 * that pushes a new separator in does not strand the caret on the wrong side
 * of it.
 */
export function caretForSignificant(
  display: string,
  significant: number,
  separators = numberSeparators(),
): number {
  if (significant <= 0) return 0
  let count = 0
  for (let i = 0; i < display.length; i += 1) {
    const char = display[i]!
    if (isDigit(char) || char === '-' || isDecimal(char, separators)) {
      count += 1
      if (count === significant) return i + 1
    }
  }
  return display.length
}
