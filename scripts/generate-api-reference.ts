/**
 * Generates `demo/src/data/apiReference.ts` from the source it documents.
 *
 * The reference used to be written by hand, which meant every summary existed
 * twice: once as prose on the declaration, once as a string in the demo. Names
 * were held together by a test, but wording was free to drift. Here the
 * declaration is the only copy, and the demo's array is output.
 *
 *   name     the exported identifier in `src/index.ts` (after any `as`)
 *   layer    the module it comes from — see LAYER_BY_PATH, the only place
 *            layer is decided; nothing in `src/` records it
 *   kind     what the declaration is
 *   summary  the first paragraph of its leading doc comment
 *
 * Run with `pnpm docs:api`. `tests/apiReference.spec.ts` re-runs `generate()`
 * in memory and fails if the checked-in file differs, so the output is
 * committed and the demo needs no codegen step in front of it.
 *
 * An export with no doc comment is a hard error rather than a blank summary:
 * the point of generating is that writing the docs on the declaration is the
 * only way to get them into the reference.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { parse } from 'vue/compiler-sfc'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const INDEX = resolve(ROOT, 'src/index.ts')
const OUTPUT = resolve(ROOT, 'demo/src/data/apiReference.ts')

type ApiLayer =
  | 'core' | 'filters' | 'sorting' | 'grouping'
  | 'aggregation' | 'utils' | 'primitives' | 'preset' | 'types'

type ApiKind = 'composable' | 'function' | 'component' | 'constant' | 'type'

/**
 * Module path → layer. Ordered: the first prefix that matches wins, so the
 * narrow paths must come before `./core/`.
 *
 * `src/index.ts` groups its exports under the same names, but as comment
 * dividers rather than anything a parser can read — matching on the path is
 * what survives someone moving an export between blocks.
 *
 * Note the split this encodes: `core` is the composables and the context,
 * while `filters`/`sorting`/`grouping`/`aggregation`/`utils` are the pure
 * modules underneath them. So `useRowGrouping` is `core`, not `grouping` —
 * it is a composable that happens to be about groups, and the reference has
 * always filed it that way.
 */
const LAYER_BY_PATH: Array<[prefix: string, layer: ApiLayer]> = [
  ['./core/types', 'types'],
  ['./core/filters/', 'filters'],
  ['./core/sorting', 'sorting'],
  ['./core/grouping', 'grouping'],
  ['./core/aggregation', 'aggregation'],
  ['./core/utils/', 'utils'],
  ['./core/', 'core'],
  ['./components/primitives/', 'primitives'],
  ['./components/preset/', 'preset'],
]

const LAYER_ORDER: ApiLayer[] = [
  'core', 'filters', 'sorting', 'grouping',
  'aggregation', 'utils', 'primitives', 'preset', 'types',
]

interface Export {
  name: string
  /** The name inside its own module, which is what `default as X` renames. */
  local: string
  module: string
  layer: ApiLayer
  /** From an `export type { … }` block. The declaration can also decide this. */
  typeOnly: boolean
}

interface Declaration {
  kind: ApiKind
  summary: string
}

function layerFor(module: string): ApiLayer {
  const match = LAYER_BY_PATH.find(([prefix]) => module.startsWith(prefix))
  if (!match) throw new Error(`no layer mapped for module ${module} — add it to LAYER_BY_PATH`)
  return match[1]
}

/** Every name `src/index.ts` re-exports, in the order it exports them. */
function readExports(): Export[] {
  const text = readFileSync(INDEX, 'utf8')
  const source = ts.createSourceFile(INDEX, text, ts.ScriptTarget.Latest, true)
  const exports: Export[] = []

  for (const statement of source.statements) {
    if (!ts.isExportDeclaration(statement)) continue
    const specifier = statement.moduleSpecifier
    if (!specifier || !ts.isStringLiteral(specifier)) continue
    if (!statement.exportClause || !ts.isNamedExports(statement.exportClause)) continue

    const module = specifier.text
    for (const element of statement.exportClause.elements) {
      exports.push({
        name: element.name.text,
        local: (element.propertyName ?? element.name).text,
        module,
        layer: layerFor(module),
        // Either `export type { X }` or `export { type X }`.
        typeOnly: statement.isTypeOnly || element.isTypeOnly,
      })
    }
  }
  return exports
}

/**
 * The first paragraph of a `/** … *\/` block, as one line.
 *
 * First paragraph rather than the whole block on purpose: the house style
 * opens with what the thing is and then spends three more paragraphs on why
 * the obvious alternative is wrong. The table wants the first sentence; the
 * rest is for whoever opened the file.
 */
function firstParagraph(comment: string): string {
  const body = comment
    .replace(/^\/\*\*/, '')
    .replace(/\*\/$/, '')
    .split('\n')
    // Strip the leading ` * ` gutter.
    .map((line) => line.replace(/^\s*\* ?/, '').trimEnd())

  const paragraph: string[] = []
  for (const line of body) {
    if (!line.trim()) {
      if (paragraph.length) break
      continue
    }
    paragraph.push(line.trim())
  }
  return paragraph.join(' ').replace(/\s+/g, ' ').trim()
}

/**
 * The doc comment immediately above a node, or '' when there is none.
 *
 * "Immediately" is enforced: a comment separated from the declaration by a
 * blank line is a file banner or a note about the section, not documentation
 * of this export, and picking it up would put the wrong prose in the table.
 */
function docCommentFor(text: string, node: ts.Node): string {
  const ranges = ts.getLeadingCommentRanges(text, node.getFullStart()) ?? []
  const last = ranges.at(-1)
  if (!last) return ''

  const comment = text.slice(last.pos, last.end)
  if (!comment.startsWith('/**')) return ''

  const between = text.slice(last.end, node.getStart())
  if (between.split('\n').length > 2) return ''

  return firstParagraph(comment)
}

function kindOf(node: ts.Node, name: string, typeOnly: boolean): ApiKind {
  if (typeOnly || ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) return 'type'
  // `use*` is the Vue convention and the line the README draws between a
  // composable and a pure function, so the name is the honest signal here.
  if (/^use[A-Z]/.test(name)) return 'composable'
  if (ts.isFunctionDeclaration(node)) return 'function'
  return 'constant'
}

/** Indexes one `.ts` module's top-level declarations by name. */
function readModule(path: string): Map<string, { node: ts.Node; doc: string }> {
  const text = readFileSync(path, 'utf8')
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true)
  const found = new Map<string, { node: ts.Node; doc: string }>()

  for (const statement of source.statements) {
    if (ts.isVariableStatement(statement)) {
      // The comment sits above the statement, not the individual binding.
      const doc = docCommentFor(text, statement)
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) {
          found.set(declaration.name.text, { node: declaration, doc })
        }
      }
      continue
    }
    const named = statement as ts.DeclarationStatement
    if (named.name && ts.isIdentifier(named.name)) {
      found.set(named.name.text, { node: statement, doc: docCommentFor(text, statement) })
    }
  }
  return found
}

/**
 * A single-file component's doc comment: the `/** … *\/` opening its
 * `<script setup>`.
 *
 * Parsed rather than matched. A `<script[^>]*>` regex looks sufficient and is
 * not: four components declare `generic="TRow extends Record<string, unknown>"`
 * on the tag, and the pattern stops at the `>` inside `Record<…>`, silently
 * reporting the biggest components as undocumented.
 *
 * `vue/compiler-sfc` is a subpath of the `vue` devDependency rather than a
 * dependency of its own — safe because Vue 3 exports it and the demo already
 * builds against the same copy.
 */
function readComponentDoc(path: string): string {
  const { descriptor } = parse(readFileSync(path, 'utf8'), { filename: path })
  const script = descriptor.scriptSetup ?? descriptor.script
  const match = script?.content.match(/^\s*(\/\*\*[\s\S]*?\*\/)/)
  return match ? firstParagraph(match[1]!) : ''
}

function describe(entry: Export, cache: Map<string, Map<string, { node: ts.Node; doc: string }>>): Declaration {
  if (entry.module.endsWith('.vue')) {
    return { kind: 'component', summary: readComponentDoc(resolve(ROOT, 'src', entry.module.slice(2))) }
  }

  const path = resolve(ROOT, 'src', `${entry.module.slice(2)}.ts`)
  let module = cache.get(path)
  if (!module) {
    module = readModule(path)
    cache.set(path, module)
  }

  const declaration = module.get(entry.local)
  if (!declaration) throw new Error(`${entry.name}: no declaration named ${entry.local} in ${path}`)

  return {
    kind: kindOf(declaration.node, entry.name, entry.typeOnly),
    summary: declaration.doc,
  }
}

const BANNER = `/**
 * Every name \`src/index.ts\` exports, with what it is and what it is for.
 *
 * GENERATED by \`scripts/generate-api-reference.ts\` — run \`pnpm docs:api\`.
 * Do not edit: a summary is the first paragraph of the doc comment on the
 * declaration itself, so that is where to change one.
 *
 * Kept as data rather than as markup so the reference can be *rendered by the
 * library it documents* — the API view is a \`DataTable\` over this array, which
 * makes the docs a working example of the thing being documented.
 *
 * \`tests/apiReference.spec.ts\` regenerates this in memory and fails if it
 * differs, so the file cannot fall behind the code it describes.
 */

export type ApiKind = 'composable' | 'function' | 'component' | 'constant' | 'type'

export type ApiLayer = ${LAYER_ORDER.map((layer) => `'${layer}'`).join(' | ')}

export interface ApiEntry extends Record<string, unknown> {
  name: string
  layer: ApiLayer
  kind: ApiKind
  summary: string
}

export const API_LAYERS: ApiLayer[] = [
${LAYER_ORDER.map((layer) => `  '${layer}',`).join('\n')}
]

export const API_KINDS: ApiKind[] = ['composable', 'function', 'component', 'constant', 'type']
`

/** A divider matching the width `src/index.ts` uses, so the two files read alike. */
function divider(layer: string): string {
  return `  /* ${'-'.repeat(Math.max(1, 70 - layer.length))} ${layer} */`
}

/**
 * A TypeScript string literal for a summary.
 *
 * Backslashes first, and that order is the whole point: escaping the quotes
 * afterwards must not re-escape the backslashes this introduces. Without it a
 * summary naming an escape — `\0`, a `\u` sequence, a regex — emitted a
 * literal TypeScript reads back as the escape itself, silently corrupting the
 * text, or failed to parse outright on a trailing backslash. The freshness test
 * compares generated text to committed text, so it would have surfaced as an
 * unexplained staleness diff rather than as the escaping bug it is.
 */
function quote(value: string): string {
  const escaped = value.replace(/\\/g, '\\\\')
  return escaped.includes("'") ? `"${escaped.replace(/"/g, '\\"')}"` : `'${escaped}'`
}

export function generate(): string {
  const exports = readExports()
  const cache = new Map<string, Map<string, { node: ts.Node; doc: string }>>()
  const described = exports.map((entry) => ({ ...entry, ...describe(entry, cache) }))

  const undocumented = described.filter((entry) => entry.summary.length < 20)
  if (undocumented.length) {
    const lines = undocumented.map((e) => `  ${e.name.padEnd(28)} ${e.module}${e.summary ? ` (only ${e.summary.length} chars: ${e.summary})` : ''}`)
    throw new Error(
      `${undocumented.length} export(s) have no usable doc comment. Write one on the\n` +
        `declaration — that is the only place a summary lives now:\n\n${lines.join('\n')}\n`,
    )
  }

  const body: string[] = []
  for (const layer of LAYER_ORDER) {
    const inLayer = described.filter((entry) => entry.layer === layer)
    if (!inLayer.length) continue

    if (body.length) body.push('')
    body.push(divider(layer))

    // A blank line between modules, mirroring how `src/index.ts` groups them.
    let previous = ''
    for (const entry of inLayer) {
      if (previous && entry.module !== previous) body.push('')
      previous = entry.module
      body.push(
        `  { name: '${entry.name}', layer: '${entry.layer}', ` +
          `kind: '${entry.kind}', summary: ${quote(entry.summary)} },`,
      )
    }
  }

  return `${BANNER}\nexport const apiReference: ApiEntry[] = [\n${body.join('\n')}\n]\n`
}

// `pnpm docs:api`. Importing the module (the test does) must not write.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const output = generate()
  writeFileSync(OUTPUT, output, 'utf8')
  const count = output.match(/^ {2}\{ name:/gm)?.length ?? 0
  console.log(`demo/src/data/apiReference.ts — ${count} exports`)
}
