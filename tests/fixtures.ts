import type { ColumnDef, ColumnGroupDef } from '../src/core/types'

export interface Person {
  id: number
  name: string
  department: string
  salary: number | null
  hiredAt: string | null
  active: boolean
}

export const people: Person[] = [
  { id: 1, name: 'Ada Lovelace', department: 'Engineering', salary: 120000, hiredAt: '2021-03-05', active: true },
  { id: 2, name: 'Grace Hopper', department: 'Engineering', salary: 145000, hiredAt: '2019-11-20', active: true },
  { id: 3, name: 'Alan Turing', department: 'Research', salary: 130000, hiredAt: '2020-01-15', active: false },
  { id: 4, name: 'Katherine Johnson', department: 'Research', salary: null, hiredAt: '2022-07-01', active: true },
  { id: 5, name: 'Item 10', department: 'Support', salary: 60000, hiredAt: null, active: false },
  { id: 6, name: 'Item 2', department: 'Support', salary: 65000, hiredAt: '2023-02-28', active: true },
  { id: 7, name: 'Barbara Liskov', department: '', salary: 150000, hiredAt: '2018-05-09', active: true },
]

export const personColumns: ColumnDef<Person>[] = [
  { id: 'name', header: 'Name', type: 'text' },
  { id: 'department', header: 'Department', type: 'enum' },
  { id: 'salary', header: 'Salary', type: 'number' },
  { id: 'hiredAt', header: 'Hired', type: 'date' },
  { id: 'active', header: 'Active', type: 'boolean' },
]

/**
 * The same columns with aggregates declared. A separate export rather than a
 * change to `personColumns`: declaring an aggregate changes the group row's
 * markup, and every existing spec asserts against the plain shape.
 */
export const aggregatedPersonColumns: ColumnDef<Person>[] = personColumns.map((column) => {
  if (column.id === 'salary') return { ...column, aggregate: 'sum' as const }
  if (column.id === 'hiredAt') return { ...column, aggregate: 'min' as const }
  return column
})

export function names(rows: Person[]): string[] {
  return rows.map((row) => row.name)
}

/**
 * Bands over `personColumns`: an *Identity* band, and a *Record* band holding a
 * nested *Money* one, so a header three rows deep has something to build from.
 */
export const personColumnGroups: ColumnGroupDef[] = [
  { id: 'identity', header: 'Identity' },
  { id: 'record', header: 'Record' },
  { id: 'money', header: 'Money', parent: 'record', collapseTo: 'salary' },
]

/**
 * The same columns with bands declared. A separate export for the same reason
 * `aggregatedPersonColumns` is one: declaring a band adds a header row, and
 * every existing spec asserts against the single-row shape.
 *
 * `active` deliberately stays outside every band — a header is only correct if
 * an unbanded column still spans down to the body.
 */
export const groupedPersonColumns: ColumnDef<Person>[] = personColumns.map((column) => {
  if (column.id === 'name' || column.id === 'department') return { ...column, group: 'identity' }
  if (column.id === 'salary') return { ...column, group: 'money' }
  if (column.id === 'hiredAt') return { ...column, group: 'record' }
  return column
})
