import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { mount } from '@vue/test-utils'
import { defineComponent, h, nextTick, shallowRef } from 'vue'
import { describe, expect, it } from 'vitest'
import DataTable from '../src/components/preset/DataTable.vue'
import TablePagination from '../src/components/primitives/TablePagination.vue'
import { DEFAULT_LABELS, mergeLabels, type TableLabels } from '../src/core/labels'
import { createTableLabels } from '../src/core/plugin'
import { es, ru } from '../src/locales'
import { useLocalDataSource } from '../src/core/useLocalDataSource'
import { useTableState } from '../src/core/useTableState'
import { people, personColumns, type Person } from './fixtures'

/**
 * The ratchet on the label record: no user-facing English anywhere but
 * `labels.ts`.
 *
 * Asserted against the source rather than against a render, for the reason
 * `tests/presetStyles.spec.ts` reads the stylesheet: a mounted table only shows
 * the strings that particular table happens to reach, so a literal in a branch
 * nobody mounted would sail straight through. Reading every component instead
 * means a new hardcoded string fails the build the moment it is written, which
 * is what keeps the record from drifting behind the components the way the docs
 * index drifted before `docs/nav.ts`.
 *
 * Modeled on that spec in shape too: name the offender, never just assert a
 * boolean.
 */

const ROOT = resolve(import.meta.dirname, '..')

/**
 * Characters the components render as icons — the carets, the arrows, the pin
 * states, the pager's chevrons, the multiplication sign used as a close button.
 *
 * Not translatable, and not text: a locale that rewrote `↑` would break the
 * button rather than localise it. Without this list they are some twenty false
 * positives, which is enough noise to make the spec unread.
 */
const GLYPHS = '×«‹›»↑↓⇤⇥⇔▾▲▼⇅▸+−…–'

/** Every `.vue` under a directory, as a path relative to the repo root. */
function componentFiles(dir: string): string[] {
  return readdirSync(resolve(ROOT, dir))
    .filter((name) => name.endsWith('.vue'))
    .map((name) => `${dir}/${name}`)
}

const COMPONENTS = [
  ...componentFiles('src/components/primitives'),
  ...componentFiles('src/components/preset'),
]

/**
 * Blank a span of source while keeping every newline in it, so the line numbers
 * a later scan reports still point at the file the reader will open.
 */
function blank(text: string): string {
  return text.replace(/[^\n]/g, ' ')
}

/** The `<template>` block, with comments and mustaches blanked out. */
function templateOf(source: string): string {
  const start = source.indexOf('<template>')
  if (start === -1) return ''
  const head = source.slice(0, start + '<template>'.length)
  const body = source.slice(start + '<template>'.length, source.lastIndexOf('</template>'))
  return (
    blank(head) +
    body.replace(/<!--[\s\S]*?-->/g, blank).replace(/\{\{[\s\S]*?\}\}/g, blank)
  )
}

/**
 * Blank out every tag, leaving the text nodes and the newlines.
 *
 * Written as a scanner rather than as `/<[^>]*>/` because attribute
 * expressions hold their own angle brackets — `headerRows.length > 1`, an
 * arrow function — and the regex closed the tag on the first one, reporting the
 * rest of the tag as rendered copy.
 */
function textNodesOf(template: string): string {
  let out = ''
  let inTag = false
  let quote: string | undefined
  for (const char of template) {
    if (!inTag && char === '<') inTag = true
    else if (inTag && quote === undefined && (char === '"' || char === "'")) quote = char
    else if (inTag && char === quote) quote = undefined
    else if (inTag && quote === undefined && char === '>') {
      out += ' '
      inTag = false
      continue
    }
    out += inTag ? (char === '\n' ? '\n' : ' ') : char
  }
  return out
}

/** Whether a string holds a word — two or more letters running together. */
function hasWord(text: string): boolean {
  return /[A-Za-z]{2}/.test(text)
}

/**
 * Blank out every `devWarn(...)`, `new Error(...)` and `console.*(...)` call,
 * parentheses balanced, so a message split over several lines is skipped whole.
 * A line-by-line skip missed the continuation lines and reported the middle of
 * a developer warning as user-facing copy.
 */
function stripDevText(source: string): string {
  const opener = /devWarn\(|new Error\(|console\.\w+\(/g
  let out = source
  let match: RegExpExecArray | null
  while ((match = opener.exec(source)) !== null) {
    let depth = 0
    let i = match.index + match[0].length - 1
    for (; i < source.length; i += 1) {
      if (source[i] === '(') depth += 1
      else if (source[i] === ')') {
        depth -= 1
        if (depth === 0) break
      }
    }
    const span = source.slice(match.index, i + 1)
    out = out.slice(0, match.index) + blank(span) + out.slice(i + 1)
  }
  return out
}

describe('label record', () => {
  /**
   * The three attributes that carry a name to assistive tech or to a tooltip.
   * Written statically they are English by construction — the binding form is
   * the only one that can read the record.
   */
  it('names no attribute with a literal', () => {
    const offenders: string[] = []

    for (const file of COMPONENTS) {
      const template = templateOf(readFileSync(resolve(ROOT, file), 'utf8'))
      const lines = template.split('\n')

      lines.forEach((line, index) => {
        for (const m of line.matchAll(/(?<![:\w-])(aria-label|placeholder|title)="([^"]*)"/g)) {
          if (hasWord(m[2]!)) offenders.push(`${file}:${index + 1} ${m[1]}="${m[2]}"`)
        }
        // The bound form, holding a literal rather than a read: `:title="'Filter'"`.
        for (const m of line.matchAll(/:(?<![\w-]:)(aria-label|placeholder|title)="([^"]*)"/g)) {
          for (const literal of m[2]!.matchAll(/'([^']*)'|`([^`]*)`/g)) {
            const text = literal[1] ?? literal[2] ?? ''
            // A space or a capital marks copy; a lowercase single word is a
            // value the label function is being handed, like `'none'` for an
            // unpinned column.
            if (hasWord(text) && /[ A-Z]/.test(text)) offenders.push(`${file}:${index + 1} ${m[1]} holds '${text}'`)
          }
        }
      })
    }

    expect(
      offenders,
      'an accessible name or a tooltip is a hardcoded literal; add a key to TableLabels and read it through useTableLabels()',
    ).toEqual([])
  })

  /**
   * Rendered text, which is the half a sighted user reads. Everything between
   * the tags once the mustaches are gone should be whitespace and icons: a
   * component that renders a word has written that word into its own template.
   *
   * Tags are blanked rather than removed because a Vue tag routinely spans ten
   * lines, and a scan that stripped them line by line would report every
   * attribute in the file as rendered text.
   */
  it('renders no text node holding a literal', () => {
    const offenders: string[] = []

    for (const file of COMPONENTS) {
      const text = textNodesOf(templateOf(readFileSync(resolve(ROOT, file), 'utf8')))
        .replace(/&\w+;/g, blank)
        .replace(new RegExp(`[${GLYPHS}]`, 'g'), ' ')

      text.split('\n').forEach((line, index) => {
        if (hasWord(line)) offenders.push(`${file}:${index + 1} renders "${line.trim()}"`)
      })
    }

    expect(
      offenders,
      'a component renders a hardcoded word; add a key to TableLabels and read it through useTableLabels()',
    ).toEqual([])
  })

  /**
   * The core half. `labels.ts` holds the strings; every other module reads them,
   * so a message written as a literal down here is one a consumer cannot
   * translate — which is exactly what `OPERATOR_LABELS` and the parse messages
   * were before this task.
   *
   * `devWarn`, `new Error` and `console` are allowed their English: all three
   * address whoever is *building* the table rather than whoever is using it,
   * the first two are dev-only, and a translated stack trace helps nobody.
   */
  it('writes no user-facing message outside labels.ts', () => {
    const offenders: string[] = []
    const files = readdirSync(resolve(ROOT, 'src/core'))
      .filter((name) => name.endsWith('.ts') && name !== 'labels.ts')
      .map((name) => `src/core/${name}`)

    for (const file of files) {
      const source = stripDevText(
        readFileSync(resolve(ROOT, file), 'utf8')
          .replace(/\/\*[\s\S]*?\*\//g, blank)
          .replace(/\/\/[^\n]*/g, ''),
      )

      source.split('\n').forEach((line, index) => {
        for (const m of line.matchAll(/'([^']*)'/g)) {
          const text = m[1]!
          // A sentence rather than an identifier: a capitalised word followed by
          // anything, or any run of three words. Ids, CSS values and event names
          // are one word or hyphenated, and pass.
          if (/^[A-Z][a-z]+ \S/.test(text) || /^\S+( \S+){2,}$/.test(text)) {
            offenders.push(`${file}:${index + 1} holds '${text}'`)
          }
        }
      })
    }

    expect(
      offenders,
      'a core module holds a user-facing message; move it into DEFAULT_LABELS and read it off the record',
    ).toEqual([])
  })
})

describe('label overrides', () => {
  function mountTable(labels?: Partial<TableLabels>) {
    const Host = defineComponent({
      setup() {
        const state = useTableState({ pageSize: 3 })
        const source = useLocalDataSource<Person>(people, personColumns, state.query)
        return () =>
          h(DataTable as never, {
            columns: personColumns,
            source,
            state,
            selectable: true,
            labels,
          })
      },
    })
    return mount(Host, { attachTo: document.body })
  }

  it('renders an override beside the defaults it did not touch', () => {
    const wrapper = mountTable({ searchAllColumns: 'Rechercher partout' })

    const search = wrapper.get('input.vt-search')
    expect(search.attributes('aria-label')).toBe('Rechercher partout')
    // Untouched: the placeholder on the very same input still reads English,
    // which is what makes a partial override worth having.
    expect(search.attributes('placeholder')).toBe(DEFAULT_LABELS.search)
    expect(wrapper.get('.vt-th-selection input').attributes('aria-label')).toBe(
      DEFAULT_LABELS.selectAllOnPage,
    )
    wrapper.unmount()
  })

  it('leaves a bare primitive in English with no table above it', () => {
    const wrapper = mount(TablePagination, { props: { page: 1, pageSize: 10, total: 0 } })

    expect(wrapper.get('nav').attributes('aria-label')).toBe(DEFAULT_LABELS.pagination)
    expect(wrapper.text()).toContain(DEFAULT_LABELS.noRows)
    wrapper.unmount()
  })
})

describe('createTableLabels', () => {
  /**
   * The app-wide locale. `app.use(createTableLabels(ru))` provides above every
   * table, so what is asserted here is inheritance with nothing passed down —
   * the case that would otherwise be a `:labels` on every `<DataTable>` in the
   * app, one of which is eventually forgotten.
   */
  function mountWithPlugin(
    labels: Parameters<typeof createTableLabels>[0],
    props?: Partial<TableLabels>,
  ) {
    const Host = defineComponent({
      setup() {
        const state = useTableState({ pageSize: 3 })
        const source = useLocalDataSource<Person>(people, personColumns, state.query)
        return () =>
          h(DataTable as never, {
            columns: personColumns,
            source,
            state,
            selectable: true,
            labels: props,
          })
      },
    })
    return mount(Host, {
      attachTo: document.body,
      global: { plugins: [createTableLabels(labels)] },
    })
  }

  it('translates a table that was passed no labels prop', () => {
    const wrapper = mountWithPlugin(ru)

    // The preset renders this one itself; the primitives below read the record
    // out of the injection, so both halves have to move.
    expect(wrapper.get('input.vt-search').attributes('placeholder')).toBe(ru.search)
    expect(wrapper.get('.vt-th-selection input').attributes('aria-label')).toBe(ru.selectAllOnPage)
    wrapper.unmount()
  })

  it('lets a labels prop win per key, over the app record rather than over English', () => {
    const wrapper = mountWithPlugin(ru, { search: 'Искать сотрудника' })

    expect(wrapper.get('input.vt-search').attributes('placeholder')).toBe('Искать сотрудника')
    // Not English: the key the prop left out falls back to the app-wide locale,
    // which is the whole difference between merging over `ru` and replacing it.
    expect(wrapper.get('.vt-th-selection input').attributes('aria-label')).toBe(ru.selectAllOnPage)
    wrapper.unmount()
  })

  it('re-renders in place when the ref it was handed changes', async () => {
    const locale = shallowRef<Partial<TableLabels>>(ru)
    const wrapper = mountWithPlugin(locale)
    expect(wrapper.get('input.vt-search').attributes('placeholder')).toBe(ru.search)

    locale.value = es
    await nextTick()

    expect(wrapper.get('input.vt-search').attributes('placeholder')).toBe(es.search)
    wrapper.unmount()
  })

  it('reaches a bare primitive with no table above it', () => {
    const wrapper = mount(TablePagination, {
      props: { page: 1, pageSize: 10, total: 0 },
      global: { plugins: [createTableLabels(ru)] },
    })

    expect(wrapper.get('nav').attributes('aria-label')).toBe(ru.pagination)
    wrapper.unmount()
  })
})

describe('mergeLabels', () => {
  it('lays an override over the base it was given, not over English', () => {
    const merged = mergeLabels({ search: 'Искать' }, ru)

    expect(merged.search).toBe('Искать')
    expect(merged.noRows).toBe(ru.noRows)
    expect(merged.operators.between).toBe(ru.operators.between)
  })

  it('keeps the fifteen operators an override did not name', () => {
    const merged = mergeLabels({ operators: { contains: 'contient' } as never })

    expect(merged.operators.contains).toBe('contient')
    expect(merged.operators.between).toBe(DEFAULT_LABELS.operators.between)
    expect(merged.parse.number).toBe(DEFAULT_LABELS.parse.number)
  })
})
