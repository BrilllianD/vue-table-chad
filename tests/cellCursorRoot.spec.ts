import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import TableRoot from '../src/components/primitives/TableRoot.vue'
import { useLocalDataSource } from '../src/core/useLocalDataSource'
import { useTableState } from '../src/core/useTableState'
import type { UseCellCursor } from '../src/core/useCellCursor'
import { people, personColumns, type Person } from './fixtures'

/**
 * What `TableRoot` hands down, and over which rows.
 *
 * The cursor is built here rather than passed in, and the reason is the second
 * test: only this component knows the order the rows are *rendered* in. A
 * cursor handed to it from outside would be walking the source's page order,
 * which stops matching the screen the moment anything is grouped.
 *
 * The cursor is a derived slot prop, not a `TableContext` field — G4's choice
 * for `headerRows`, for the same reason. A hand-assembled context (see
 * `demo/src/components/MiniRoot.vue`) stays valid with no change at all.
 */

/** Mounts a root and hands back whatever the default slot was given. */
function mountRoot(props: Record<string, unknown> = {}, sort?: string) {
  let cursor: UseCellCursor<Person> | undefined
  let pageIds: number[] = []
  const host = defineComponent({
    setup() {
      const state = useTableState({ pageSize: 25, initialGroupBy: props.initialGroupBy as string[] })
      const source = useLocalDataSource<Person>(people, personColumns, state.query, {
        debounceMs: 0,
      })
      if (sort) state.setSort(sort, 'asc')
      return () => {
        pageIds = source.rows.value.map((person) => person.id)
        // `as never`, the way `dataTable.spec.ts` mounts the preset: `h` cannot
        // infer an SFC's own generic, and `Person` has no index signature to
        // satisfy `TRow extends Record<string, unknown>` structurally.
        return h(
          TableRoot as never,
          { columns: personColumns, source, state, ...props },
          {
            default: (slotProps: { cursor?: UseCellCursor<Person> }) => {
              cursor = slotProps.cursor
              return h('div')
            },
          },
        )
      }
    },
  })
  const wrapper = mount(host)
  return { wrapper, cursor: () => cursor, pageIds: () => pageIds }
}

/** Every id the cursor visits walking from the first row to the last. */
function walkRowIds(cursor: UseCellCursor<Person>): number[] {
  cursor.move({ kind: 'corner', to: 'first' })
  const visited: number[] = [cursor.position.value!.rowId as number]
  while (cursor.move({ kind: 'by', rows: 1, columns: 0 })) {
    visited.push(cursor.position.value!.rowId as number)
  }
  return visited
}

/** Whether every department appears as one unbroken run. */
function grouped(ids: number[]): boolean {
  const byId = new Map(people.map((person) => [person.id, person]))
  const seen = new Set<string>()
  let previous: string | undefined
  for (const id of ids) {
    const department = byId.get(id)!.department
    if (department !== previous) {
      if (seen.has(department)) return false
      seen.add(department)
      previous = department
    }
  }
  return true
}

describe('TableRoot and the cell cursor', () => {
  it('hands down nothing until it is asked for one', () => {
    const h1 = mountRoot()
    expect(h1.cursor()).toBeUndefined()
    h1.wrapper.unmount()
  })

  it('hands one down when asked', () => {
    const h1 = mountRoot({ cellCursor: true })
    expect(h1.cursor()).toBeDefined()
    // Nowhere yet, and asking for no focus — mounting a table must not take
    // the caret off whatever the page was doing.
    expect(h1.cursor()!.position.value).toBeNull()
    expect(h1.cursor()!.focusRequests.value).toBe(0)
    h1.wrapper.unmount()
  })

  it('walks the rows in the order they are rendered, not the order they arrived', () => {
    // Sorted by name and grouped by department, so the two orders genuinely
    // disagree: the page comes back in name order, the screen shows it banded.
    const h1 = mountRoot({ cellCursor: true, initialGroupBy: ['department'] }, 'name')
    const visited = walkRowIds(h1.cursor()!)

    expect(visited).toHaveLength(people.length)
    // The cursor steps down the screen — every band is one unbroken run.
    expect(grouped(visited)).toBe(true)
    // A cursor built over `source.rows` would have walked this instead, and
    // jumped between bands on the way down.
    expect(grouped(h1.pageIds())).toBe(false)
    expect(visited).not.toEqual(h1.pageIds())
    h1.wrapper.unmount()
  })

  it('never lands on a group header, because a header is not a row', () => {
    const h1 = mountRoot({ cellCursor: true, initialGroupBy: ['department'] })
    const cursor = h1.cursor()!
    const ids = new Set(people.map((person) => person.id))

    // Walk the whole grouped page. Every stop is a real row's id, and there
    // are exactly as many stops as there are rows — even though the rendered
    // list has four band headers interleaved through it.
    const visited = walkRowIds(cursor)
    expect(visited).toHaveLength(people.length)
    expect(visited.every((id) => ids.has(id))).toBe(true)
    h1.wrapper.unmount()
  })

  it('walks only the columns that are on screen', () => {
    const h1 = mountRoot({ cellCursor: true, initialLayout: { hidden: ['email'] } })
    const cursor = h1.cursor()!
    cursor.move({ kind: 'corner', to: 'last' })
    cursor.move({ kind: 'columnEdge', to: 'first' })
    // A hidden column is simply absent from the list the cursor is given, so
    // stepping across never has to know it exists.
    for (let step = 0; step < personColumns.length; step += 1) {
      expect(cursor.position.value!.columnId).not.toBe('email')
      cursor.move({ kind: 'by', rows: 0, columns: 1 })
    }
    h1.wrapper.unmount()
  })
})
