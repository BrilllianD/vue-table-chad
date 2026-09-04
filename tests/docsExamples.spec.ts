// `import.meta.glob` is Vite's, and the root tsconfig types only `vitest/globals`;
// this reference scopes Vite's client types to the one spec that needs them.
/// <reference types="vite/client" />
import { readFileSync, readdirSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import { mount } from '@vue/test-utils'
import type { Component } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Every live example is a file a reader pastes whole into their own project,
 * so it may lean on nothing this repo has and their project does not. Two
 * checks keep that true, each failing with the offender's name:
 *
 * 1. Source scan — an example imports from `vue` and the package alone. The
 *    fixtures under `bench/` and the demo's fake API are the two things an
 *    example used to reach for, and neither ships in the tarball.
 * 2. Mount — each example under `.vitepress/examples/` renders under happy-dom
 *    without a warning. A column referencing a group that was never declared,
 *    or a prop that no longer exists, surfaces here rather than in a reader's
 *    console.
 *
 * `docs/examples/AddressesTable.vue` is exempt from the scan: it is a port of a
 * foreign app's component, documented as needing `ADAPT` edits, and imports
 * the fixture on purpose to stand in for that app's own store.
 */
const ROOT = resolve(import.meta.dirname, '..')
const LIVE_DIR = resolve(ROOT, 'docs/.vitepress/examples')
const LONG_FORM_DIR = resolve(ROOT, 'docs/examples')
const EXEMPT = new Set(['AddressesTable.vue'])

// The three specifiers the package's own `exports` map answers, and nothing
// else. The `locales` subpath is on the list for the same reason `style.css`
// is: it ships in the tarball, so pasting an example that imports it works in
// the reader's project unchanged.
const ALLOWED_SOURCES = new Set([
  'vue',
  '@brillliand/vue-table-chad',
  '@brillliand/vue-table-chad/style.css',
  '@brillliand/vue-table-chad/locales',
])

function vueFiles(dir: string): string[] {
  return readdirSync(dir)
    .filter((name) => name.endsWith('.vue') && !EXEMPT.has(name))
    .map((name) => resolve(dir, name))
}

/** Every module specifier an SFC's script imports, side-effect imports included. */
function importSources(source: string): string[] {
  return [...source.matchAll(/^\s*import\s+(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/gm)].map(
    (match) => match[1] as string,
  )
}

describe('docs examples are self-contained', () => {
  const files = [...vueFiles(LIVE_DIR), ...vueFiles(LONG_FORM_DIR)]

  it('finds the examples', () => {
    expect(files.length).toBeGreaterThan(20)
  })

  it('imports only from vue and the package', () => {
    const offenders = files.flatMap((file) => {
      const foreign = importSources(readFileSync(file, 'utf8')).filter((s) => !ALLOWED_SOURCES.has(s))
      return foreign.length ? [`${relative(ROOT, file)}: ${foreign.join(', ')}`] : []
    })
    expect(offenders).toEqual([])
  })
})

describe('docs examples mount', () => {
  // Eager, so the list is known at collection time and each example gets its
  // own `it` — a failure names the file rather than "one of 22".
  const modules = import.meta.glob<{ default: Component }>('../docs/.vitepress/examples/*.vue', { eager: true })
  const entries = Object.entries(modules).map(([path, mod]) => [path.split('/').pop() as string, mod.default] as const)

  let warn: ReturnType<typeof vi.spyOn>
  let error: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    error = vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('covers every file in the directory', () => {
    expect(entries.map(([name]) => name).sort()).toEqual(
      vueFiles(LIVE_DIR)
        .map((file) => file.split('/').pop())
        .sort(),
    )
  })

  it.each(entries)('%s renders without a warning', async (_name, component) => {
    const wrapper = mount(component, { attachTo: document.body })
    await Promise.resolve()
    expect(wrapper.html().length).toBeGreaterThan(0)
    expect(warn.mock.calls).toEqual([])
    expect(error.mock.calls).toEqual([])
    wrapper.unmount()
  })
})
