import { describe, expect, it } from 'vitest'
import {
  applyCellValue,
  applyPatch,
  editorFor,
  isColumnEditable,
  parseCellInput,
  replaceRowIn,
  validateCell,
  validateDraft,
  REQUIRED_MESSAGE,
} from '../src/core/editing'
import type { ColumnDef } from '../src/core/types'
import { people, personColumns, type Person } from './fixtures'

/**
 * The pure write half. Everything here is a function of its arguments, so this
 * spec never mounts anything and never awaits — the lifecycle lives in
 * `rowEditing.spec.ts`.
 */

/** A nested row, because the accessor case is the one that cannot be guessed. */
interface Employee extends Record<string, unknown> {
  id: number
  name: string
  location: { city: string; country: string }
}

const employee: Employee = { id: 1, name: 'Ada', location: { city: 'Berlin', country: 'Germany' } }

const cityColumn: ColumnDef<Employee> = {
  id: 'city',
  type: 'text',
  editable: true,
  accessor: (row) => row.location.city,
  setValue: (row, value) => ({ ...row, location: { ...row.location, city: String(value) } }),
}

function column(id: string): ColumnDef<Person> {
  const found = personColumns.find((entry) => entry.id === id)
  if (!found) throw new Error(`no column ${id}`)
  return found
}

function editable(id: string, extra: Partial<ColumnDef<Person>> = {}): ColumnDef<Person> {
  return { ...column(id), editable: true, ...extra }
}

describe('editorFor', () => {
  it('derives the control from the column type', () => {
    expect(editorFor(column('name'))).toBe('text')
    expect(editorFor(column('salary'))).toBe('number')
    expect(editorFor(column('hiredAt'))).toBe('date')
    expect(editorFor(column('active'))).toBe('checkbox')
  })

  it('offers a select only when an enum actually declared its options', () => {
    expect(editorFor({ id: 'department', type: 'enum', options: ['Design'] })).toBe('select')
    // No list to choose from, so a text box beats an empty dropdown.
    expect(editorFor({ id: 'department', type: 'enum' })).toBe('text')
    expect(editorFor({ id: 'department', type: 'enum', options: [] })).toBe('text')
  })

  it('lets an explicit editor override the type', () => {
    expect(editorFor({ id: 'notes', type: 'text', editor: 'textarea' })).toBe('textarea')
  })
})

describe('isColumnEditable', () => {
  const row = people[0]!

  it('defaults to off — a table does not become writable by accident', () => {
    expect(isColumnEditable(column('name'), row)).toBe(false)
  })

  it('reads a boolean, and asks a function per row', () => {
    expect(isColumnEditable(editable('name'), row)).toBe(true)
    const perRow = editable('name', { editable: (entry: Person) => entry.active })
    expect(isColumnEditable(perRow, people.find((p) => p.active)!)).toBe(true)
    expect(isColumnEditable(perRow, people.find((p) => !p.active)!)).toBe(false)
  })
})

describe('parseCellInput', () => {
  const row = people[0]!

  it('coerces at the column type', () => {
    expect(parseCellInput('92000', column('salary'), row)).toBe(92000)
    expect(parseCellInput('2020-03-04', column('hiredAt'), row)).toBe('2020-03-04')
    expect(parseCellInput('yes', column('active'), row)).toBe(true)
    expect(parseCellInput('Ada', column('name'), row)).toBe('Ada')
  })

  it('reads a blank as null, not as a failure — clearing a cell is an edit', () => {
    expect(parseCellInput('', column('salary'), row)).toBeNull()
    expect(parseCellInput(null, column('hiredAt'), row)).toBeNull()
    expect(parseCellInput(undefined, column('name'), row)).toBeNull()
  })

  it('returns undefined for something that will not coerce at all', () => {
    expect(parseCellInput('abc', column('salary'), row)).toBeUndefined()
    expect(parseCellInput('not a date', column('hiredAt'), row)).toBeUndefined()
    expect(parseCellInput('maybe', column('active'), row)).toBeUndefined()
  })

  it('maps a select string back onto the declared option', () => {
    const priority: ColumnDef<Person> = { id: 'priority', type: 'enum', options: [1, 2, 3] }
    // A `<select>` hands back "2"; the column declared the number.
    expect(parseCellInput('2', priority, row)).toBe(2)
  })

  it('hands everything to a column that brought its own parse', () => {
    const upper: ColumnDef<Person> = { id: 'name', parse: (input) => String(input).toUpperCase() }
    expect(parseCellInput('ada', upper, row)).toBe('ADA')
    // Even a blank: the column asked to decide.
    expect(parseCellInput('', upper, row)).toBe('')
  })
})

describe('validateCell', () => {
  const row = people[0]!

  it('names the type when a value did not parse', () => {
    expect(validateCell(undefined, column('salary'), row)).toBe('Not a number')
    expect(validateCell(undefined, column('hiredAt'), row)).toBe('Not a date')
    expect(validateCell(undefined, column('active'), row)).toBe('Not a yes or no')
  })

  it('rejects a blank only when the column is required', () => {
    expect(validateCell(null, column('salary'), row)).toBeNull()
    expect(validateCell(null, editable('salary', { required: true }), row)).toBe(REQUIRED_MESSAGE)
    expect(validateCell('', editable('name', { required: true }), row)).toBe(REQUIRED_MESSAGE)
  })

  it('rejects an enum value that is not one of the options', () => {
    const dept: ColumnDef<Person> = { id: 'department', type: 'enum', options: ['Design', 'Sales'] }
    expect(validateCell('Design', dept, row)).toBeNull()
    expect(validateCell('Piracy', dept, row)).toBe('Not one of the options')
    // A blank is a separate question, answered by `required`.
    expect(validateCell(null, dept, row)).toBeNull()
  })

  it('runs the column validator against the parsed value', () => {
    const positive = editable('salary', {
      validate: (value) => (typeof value === 'number' && value < 0 ? 'Must be positive' : null),
    })
    expect(validateCell(1, positive, row)).toBeNull()
    expect(validateCell(-1, positive, row)).toBe('Must be positive')
  })
})

describe('applyCellValue', () => {
  it('writes row[id] by default, without mutating the row', () => {
    const row = people[0]!
    const next = applyCellValue(row, column('salary'), 92000)
    expect(next.salary).toBe(92000)
    expect(next).not.toBe(row)
    expect(row.salary).not.toBe(92000)
  })

  it('uses setValue to reach a nested field', () => {
    const next = applyCellValue(employee, cityColumn, 'Lisbon')
    expect(next.location.city).toBe('Lisbon')
    expect(next.location.country).toBe('Germany')
    expect(employee.location.city).toBe('Berlin')
  })

  it('refuses to guess where an accessor column writes back', () => {
    const noSetter: ColumnDef<Employee> = { id: 'city', accessor: (row) => row.location.city }
    expect(() => applyCellValue(employee, noSetter, 'Lisbon')).toThrow(/accessor/)
  })
})

describe('applyPatch', () => {
  it('applies every field, feeding each write into the next', () => {
    const row = people[0]!
    const next = applyPatch(row, { salary: 1, department: 'Design' }, personColumns)
    expect(next.salary).toBe(1)
    expect(next.department).toBe('Design')
    expect(next.name).toBe(row.name)
  })

  it('says which id had no column rather than dropping the field', () => {
    expect(() => applyPatch(people[0]!, { nope: 1 }, personColumns)).toThrow(/No column "nope"/)
  })
})

describe('validateDraft', () => {
  const row = people[0]!
  const columns = personColumns.map((entry) => ({ ...entry, editable: true }))

  it('returns the row it would produce when everything checks out', () => {
    const result = validateDraft(row, { salary: 92000 }, columns)
    expect(result.fields).toEqual({})
    expect(result.error).toBeNull()
    expect(result.nextRow?.salary).toBe(92000)
  })

  it('withholds nextRow entirely when any field failed', () => {
    const result = validateDraft(row, { salary: undefined, name: 'Ada' }, columns)
    expect(result.fields).toEqual({ salary: 'Not a number' })
    expect(result.nextRow).toBeUndefined()
  })

  it('runs the cross-field rule against the row as it would be', () => {
    const seen: Person[] = []
    const result = validateDraft(row, { department: '' }, columns, (next) => {
      seen.push(next)
      return next.department === '' ? 'Everyone needs a department' : null
    })
    // The merged row, not the original — that is the whole point of a cross-field rule.
    expect(seen[0]!.department).toBe('')
    expect(seen[0]!.name).toBe(row.name)
    expect(result.error).toBe('Everyone needs a department')
    expect(result.nextRow).toBeUndefined()
  })

  it('lets the cross-field rule blame specific fields instead', () => {
    const result = validateDraft(row, { salary: 1 }, columns, () => ({ salary: 'Too low' }))
    expect(result.fields).toEqual({ salary: 'Too low' })
    expect(result.error).toBeNull()
    expect(result.nextRow).toBeUndefined()
  })

  it('does not run the cross-field rule at all when a field already failed', () => {
    let ran = false
    validateDraft(row, { salary: undefined }, columns, () => {
      ran = true
      return null
    })
    expect(ran).toBe(false)
  })
})

describe('replaceRowIn', () => {
  const byId = (row: Person) => row.id

  it('returns a new array with the row swapped, leaving the original alone', () => {
    const rows = [...people]
    const next = { ...rows[2]!, salary: 1 }
    const out = replaceRowIn(rows, next, byId)
    expect(out).not.toBe(rows)
    expect(out[2]).toBe(next)
    expect(rows[2]!.salary).not.toBe(1)
    expect(out.length).toBe(rows.length)
  })

  it('returns the very same array when the id is not there — nothing changed', () => {
    const rows = [...people]
    const out = replaceRowIn(rows, { ...people[0]!, id: 9999 }, byId)
    // Reference equality is the assertion: a shallowRef assigned this would not re-render.
    expect(out).toBe(rows)
  })
})
