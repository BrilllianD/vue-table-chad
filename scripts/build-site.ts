/**
 * Builds the published site: the VitePress docs, with the demo mounted under
 * `/demo/`.
 *
 * Two separate Vite builds produce two separate trees, and the layout the docs
 * already assume — `themeConfig.nav` links the demo at `/demo/` — only exists
 * once something puts one inside the other. This is that something.
 *
 * Both halves are served from a GitHub project site, so both need the repo name
 * as a path prefix. The prefix is passed in through the environment rather than
 * written into either config, because the same configs serve `pnpm demo`,
 * `pnpm docs:dev` and `demo/inline.mjs`, none of which have a prefix.
 *
 *   pnpm build:site   ->  docs/.vitepress/dist/  (docs at the root, demo at demo/)
 */
import { cpSync, existsSync, rmSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/*
 * The one place the repo name is written down for the deploy. A GitHub project
 * site is served from `https://<owner>.github.io/<repo>/`, so every absolute
 * URL in either build has to carry it. `SITE_BASE` overrides it for a fork or a
 * custom domain, where the prefix is `/` instead.
 */
const BASE = process.env.SITE_BASE ?? '/vue-table-chad/'
const DOCS_DIST = resolve(ROOT, 'docs/.vitepress/dist')
const DEMO_DIST = resolve(ROOT, 'demo/dist')

const run = (script: string, env: Record<string, string>) => {
  console.log(`build-site: pnpm ${script}`)
  execFileSync('pnpm', [script], { cwd: ROOT, stdio: 'inherit', env: { ...process.env, ...env } })
}

/*
 * Cleared rather than built over. VitePress hashes its asset filenames, so a
 * stale build leaves orphans behind that ship as dead weight, and a stale
 * `demo/` from a run with a different base would be silently kept by the copy
 * below.
 */
rmSync(DOCS_DIST, { recursive: true, force: true })

run('docs:build', { DOCS_BASE: BASE })
run('build:demo', { DEMO_BASE: `${BASE}demo/` })

if (!existsSync(resolve(DEMO_DIST, 'index.html'))) {
  console.error('build-site: demo/dist/index.html is missing — the demo build produced nothing')
  process.exit(1)
}

cpSync(DEMO_DIST, resolve(DOCS_DIST, 'demo'), { recursive: true })

/*
 * Pages runs Jekyll over an artifact that does not opt out, and Jekyll drops
 * every path starting with an underscore. VitePress emits none today, but it is
 * one upstream change away from doing so, and the failure would be a 404 on an
 * asset rather than anything this script could catch.
 */
writeFileSync(resolve(DOCS_DIST, '.nojekyll'), '')

console.log(`build-site: docs/.vitepress/dist/ ready, served from ${BASE}`)
