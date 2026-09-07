import { describe, expect, it, vi } from 'vitest'
import { effectScope } from 'vue'
import { exportRows, toDelimited } from '../src/core/export'
import { useLocalDataSource } from '../src/core/useLocalDataSource'
import { useTableState } from '../src/core/useTableState'
import type { ColumnDef, DataSource } from '../src/core/types'
import { people, personColumns, type Person } from './fixtures'

const CRLF = '\r\n'

function lines(text: string): string[] {
  return text.split(CRLF)
}

describe('toDelimited', () => {
  it('writes a header row and one line per row, comma separated', () => {
    const text = toDelimited(people.slice(0, 2), personColumns)
    expect(lines(text)[0]).toBe('Name,Department,Salary,Hired,Active')
    expect(lines(text)[1]).toBe('Ada Lovelace,Engineering,120000,2021-03-05,true')
    expect(lines(text)).toHaveLength(3)
  })

  it('falls back to the column id where no header is declared', () => {
    const text = toDelimited(people.slice(0, 1), [{ id: 'name' }] as ColumnDef<Person>[])
    expect(lines(text)[0]).toBe('name')
  })

  it('omits the header on header: false', () => {
    const text = toDelimited(people.slice(0, 1), personColumns, { header: false })
    expect(lines(text)[0]).toBe('Ada Lovelace,Engineering,120000,2021-03-05,true')
  })

  it('writes nothing at all for no rows and no header', () => {
    expect(toDelimited([], personColumns, { header: false })).toBe('')
  })

  it('writes the header alone for no rows', () => {
    expect(toDelimited([], personColumns)).toBe('Name,Department,Salary,Hired,Active')
  })

  it('renders null and undefined as empty rather than as their words', () => {
    // Katherine Johnson's salary is null; Item 10's hire date is.
    const text = toDelimited([people[3]!, people[4]!], personColumns, { header: false })
    expect(lines(text)[0]).toBe('Katherine Johnson,Research,,2022-07-01,true')
    expect(lines(text)[1]).toBe('Item 10,Support,60000,,false')
  })
})

describe('toDelimited quoting', () => {
  const rows = [{ text: 'a,b' }, { text: 'say "hi"' }, { text: 'one\ntwo' }, { text: 'one\rtwo' }]
  const columns = [{ id: 'text', header: 'Text' }] as ColumnDef<{ text: string }>[]

  it('quotes a field holding the delimiter, a quote, or a line break', () => {
    const out = lines(toDelimited(rows, columns, { header: false }))
    expect(out[0]).toBe('"a,b"')
    expect(out[1]).toBe('"say ""hi"""')
    // The embedded newline is inside the quotes, so the field spans two of the
    // lines this split produces — which is exactly what RFC 4180 says.
    expect(toDelimited([rows[2]!], columns, { header: false })).toBe('"one\ntwo"')
    expect(toDelimited([rows[3]!], columns, { header: false })).toBe('"one\rtwo"')
  })

  it('leaves a field alone when it holds none of them', () => {
    expect(toDelimited([{ text: 'plain' }], columns, { header: false })).toBe('plain')
  })

  it('quotes on the delimiter in use, not on a comma', () => {
    // A tab-separated file has no reason to quote a comma, and quoting one
    // would put quotes in the reader's cell.
    const tsv = toDelimited([{ text: 'a,b' }], columns, { header: false, delimiter: '\t' })
    expect(tsv).toBe('a,b')
    const withTab = toDelimited([{ text: 'a\tb' }], columns, { header: false, delimiter: '\t' })
    expect(withTab).toBe('"a\tb"')
  })

  it('quotes a header that needs it', () => {
    const text = toDelimited([], [{ id: 'x', header: 'A, B' }] as ColumnDef<Person>[])
    expect(text).toBe('"A, B"')
  })
})

describe('toDelimited formatting', () => {
  const formatted: ColumnDef<Person>[] = personColumns.map((column) =>
    column.id === 'salary'
      ? { ...column, format: (value: unknown) => (value === null ? '—' : `$${value}`) }
      : column,
  )

  it('writes what the cell shows, formatter included', () => {
    const text = toDelimited([people[0]!], formatted, { header: false })
    expect(lines(text)[0]).toBe('Ada Lovelace,Engineering,$120000,2021-03-05,true')
  })

  it('writes the raw value on formatted: false', () => {
    const text = toDelimited([people[0]!], formatted, { header: false, formatted: false })
    expect(lines(text)[0]).toBe('Ada Lovelace,Engineering,120000,2021-03-05,true')
  })

  it('reads through an accessor', () => {
    const columns = [
      { id: 'initial', header: 'Initial', accessor: (row: Person) => row.name[0] },
    ] as ColumnDef<Person>[]
    expect(toDelimited([people[0]!], columns, { header: false })).toBe('A')
  })
})

describe('toDelimited columnIds', () => {
  it('picks and orders the columns by id', () => {
    const text = toDelimited(people.slice(0, 1), personColumns, {
      columnIds: ['salary', 'name'],
    })
    expect(lines(text)[0]).toBe('Salary,Name')
    expect(lines(text)[1]).toBe('120000,Ada Lovelace')
  })

  it('drops an id naming no column, and warns', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const text = toDelimited(people.slice(0, 1), personColumns, {
      columnIds: ['name', 'nope'],
    })
    expect(lines(text)[0]).toBe('Name')
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})

function localSetup() {
  const scope = effectScope()
  const result = scope.run(() => {
    const state = useTableState({ pageSize: 2 })
    const source = useLocalDataSource(people, personColumns, state.query, { debounceMs: 0 })
    return { state, source }
  })!
  return { ...result, dispose: () => scope.stop() }
}

describe('exportRows', () => {
  it('exports every filtered row, not the page', async () => {
    const { source, dispose } = localSetup()
    expect(source.rows.value).toHaveLength(2)
    const text = await exportRows(source, personColumns, { header: false })
    expect(lines(text)).toHaveLength(people.length)
    dispose()
  })

  it('follows the filter and the sort', async () => {
    const { state, source, dispose } = localSetup()
    state.setSearch('Item')
    state.setSort('name', 'desc')
    const text = await exportRows(source, personColumns, { header: false })
    const out = lines(text)
    expect(out).toHaveLength(2)
    // Natural order, so descending puts 10 above 2 — the same answer the table
    // shows, which is the point of exporting through the pipeline.
    expect(out[0]!.startsWith('Item 10')).toBe(true)
    expect(out[1]!.startsWith('Item 2')).toBe(true)
    dispose()
  })

  it('asks fetchAll on a source that cannot answer for itself', async () => {
    const remote = {
      rows: { value: [people[0]!] },
      total: { value: 7 },
      loading: { value: false },
      error: { value: null },
      refresh: () => {},
      facets: () => Promise.resolve([]),
      remote: true,
    } as unknown as DataSource<Person>
    const text = await exportRows(remote, personColumns, {
      header: false,
      fetchAll: () => Promise.resolve(people),
    })
    expect(lines(text)).toHaveLength(people.length)
  })

  it('falls back to the page and warns when a remote source has no fetchAll', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const remote = {
      rows: { value: [people[0]!] },
      total: { value: 7 },
      loading: { value: false },
      error: { value: null },
      refresh: () => {},
      facets: () => Promise.resolve([]),
      remote: true,
    } as unknown as DataSource<Person>
    const text = await exportRows(remote, personColumns, { header: false })
    expect(lines(text)).toHaveLength(1)
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('prefers fetchAll over a local source, so a caller can override the set', async () => {
    const { source, dispose } = localSetup()
    const text = await exportRows(source, personColumns, {
      header: false,
      fetchAll: () => Promise.resolve([people[0]!]),
    })
    expect(lines(text)).toHaveLength(1)
    dispose()
  })
})
