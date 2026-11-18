import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { babelParse, parse } from 'vue/compiler-sfc'
import type { Component } from 'vue'
import * as entry from '../src/index'
import * as locales from '../src/locales/index'
import { DEFAULT_LABELS } from '../src/core/labels'
import { themeProperties } from '../src/core/theme'

/**
 * Guards the surface RELEASING.md (`Versioning`) calls breaking: exports,
 * props and their defaults, emits, slots, exposed members, `TableLabels` keys
 * and `--vtc-*` names. A removed or renamed entry fails here instead of
 * shipping silently.
 *
 * Update with `pnpm test publicApi -u`, in the commit that changes the
 * surface, then classify the snapshot diff by the rules in RELEASING.md.
 *
 * Mount-free on purpose: props and emits come from the compiled component
 * objects, slots and exposed members from the SFC ASTs. Slot families such as
 * `cell:<id>` show as `[dynamic]` (typed slots are yman 50).
 */

const root = resolve(import.meta.dirname, '..')
const indexSource = readFileSync(resolve(root, 'src/index.ts'), 'utf8')

function componentFiles(): Map<string, string> {
  const files = new Map<string, string>()
  for (const match of indexSource.matchAll(
    /^export \{ default as (\w+) \} from '(\.\/components\/[^']+\.vue)'/gm,
  )) {
    files.set(match[1]!, resolve(root, 'src', match[2]!))
  }
  return files
}

function typeExports(): string[] {
  const names: string[] = []
  for (const [, typeOnly, body] of indexSource.matchAll(/^export (type )?\{([^}]*)\}/gm)) {
    for (const part of body!.split(',')) {
      const item = part.trim()
      if (item === '' || (typeOnly === undefined && !item.startsWith('type '))) continue
      names.push(item.replace(/^type\s+/, '').split(/\s+as\s+/).pop()!)
    }
  }
  return names.sort()
}

interface RuntimeProp {
  type?: unknown
  required?: boolean
  default?: unknown
}

function typeName(type: unknown): unknown {
  if (type === null) return null
  if (Array.isArray(type)) return type.map(typeName)
  if (typeof type === 'function') return type.name
  return String(type)
}

function propsOf(name: string, component: Component): Record<string, unknown> {
  const props = (component as { props?: Record<string, RuntimeProp> | string[] }).props ?? {}
  if (Array.isArray(props)) expect.fail(`${name} declares props in the string form`)
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(props).sort()) {
    const prop = props[key]!
    const record: Record<string, unknown> = {
      type: typeName(prop.type ?? null),
      required: prop.required === true,
    }
    if (Object.hasOwn(prop, 'default')) {
      record.default = typeof prop.default === 'function' ? '[function]' : prop.default
    }
    out[key] = record
  }
  return out
}

function emitsOf(component: Component): string[] {
  const emits = (component as { emits?: string[] | Record<string, unknown> }).emits
  if (emits === undefined) return []
  return (Array.isArray(emits) ? [...emits] : Object.keys(emits)).sort()
}

interface TemplateProp {
  type: number
  name: string
  value?: { content: string }
  arg?: { content?: string }
}

interface TemplateNode {
  tag?: string
  props?: TemplateProp[]
  children?: unknown
}

function slotsOf(file: string): Record<string, string[]> {
  const { descriptor } = parse(readFileSync(file, 'utf8'), { filename: file })
  const slots: Record<string, Set<string>> = {}
  const walk = (node: TemplateNode): void => {
    if (node.tag === 'slot') {
      let slotName = 'default'
      const bound = new Set<string>()
      for (const prop of node.props ?? []) {
        if (prop.type === 6) {
          // NodeTypes.ATTRIBUTE
          if (prop.name === 'name') slotName = prop.value?.content ?? 'default'
          else bound.add(prop.name)
        } else if (prop.type === 7 && prop.name === 'bind') {
          // NodeTypes.DIRECTIVE
          if (prop.arg?.content === 'name') slotName = '[dynamic]'
          else bound.add(prop.arg?.content ?? '[spread]')
        }
      }
      const known = (slots[slotName] ??= new Set())
      for (const item of bound) known.add(item)
    }
    if (Array.isArray(node.children)) {
      for (const child of node.children as TemplateNode[]) walk(child)
    }
  }
  const ast = descriptor.template?.ast
  if (ast) walk(ast as unknown as TemplateNode)
  return Object.fromEntries(
    Object.keys(slots)
      .sort()
      .map((key) => [key, [...slots[key]!].sort()]),
  )
}

interface AstNode {
  type?: string
  [key: string]: unknown
}

function keyName(key: AstNode): string {
  if (key.type === 'Identifier') return key.name as string
  return String((key as { value?: unknown }).value)
}

function exposedOf(file: string): string[] {
  const { descriptor } = parse(readFileSync(file, 'utf8'), { filename: file })
  const content = descriptor.scriptSetup?.content
  if (content === undefined) return []
  const program = babelParse(content, { sourceType: 'module', plugins: ['typescript'] })
  const found = new Set<string>()
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) return value.forEach(walk)
    if (typeof value !== 'object' || value === null) return
    const node = value as AstNode
    if (node.type === 'CallExpression') {
      const callee = node.callee as AstNode
      const [arg] = node.arguments as AstNode[]
      if (callee.type === 'Identifier' && callee.name === 'defineExpose' && arg?.type === 'ObjectExpression') {
        for (const prop of arg.properties as AstNode[]) {
          if (prop.type === 'SpreadElement') found.add('[spread]')
          else found.add(keyName(prop.key as AstNode))
        }
      }
    }
    for (const [key, child] of Object.entries(node)) {
      if (key !== 'loc' && key !== 'leadingComments' && key !== 'trailingComments') walk(child)
    }
  }
  walk(program.program)
  return [...found].sort()
}

function keyPaths(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return [prefix]
  return Object.entries(value).flatMap(([key, child]) =>
    keyPaths(child, prefix === '' ? key : `${prefix}.${key}`),
  )
}

describe('public API surface', () => {
  it('names every export of both entries', () => {
    expect({
      entry: Object.keys(entry).sort(),
      locales: Object.keys(locales).sort(),
      types: typeExports(),
    }).toMatchSnapshot()
  })

  it('describes every component', () => {
    const files = componentFiles()
    const components = Object.entries(entry).filter(([name]) => files.has(name))
    expect(components.map(([name]) => name).sort()).toEqual([...files.keys()].sort())
    expect(components).toHaveLength(25)

    const record = Object.fromEntries(
      components
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, component]) => [
          name,
          {
            props: propsOf(name, component as Component),
            emits: emitsOf(component as Component),
            slots: slotsOf(files.get(name)!),
            exposed: exposedOf(files.get(name)!),
          },
        ]),
    )

    // Parse guards: a parser that silently finds nothing must fail here.
    const table = record.DataTable!
    expect(Object.keys(table.props)).toEqual(expect.arrayContaining(['columns', 'theme']))
    expect(table.emits).toContain('rowDblclick')
    expect(Object.keys(table.slots)).toContain('toolbar')
    expect(table.exposed).toContain('remeasureColumns')
    expect(record).toMatchSnapshot()
  })

  it('names every TableLabels key', () => {
    const paths = keyPaths(DEFAULT_LABELS).sort()
    expect(paths).toContain('selectRow')
    expect(paths).toMatchSnapshot()
  })

  it('names every theme property', () => {
    const names = Object.values(themeProperties).sort()
    expect(names).toContain('--vtc-font-family')
    expect(names).toMatchSnapshot()
  })
})
