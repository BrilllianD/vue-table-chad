/**
 * Fails the build when `dist/` grows past its budget.
 *
 * The project's claim is that it renders fast without much overhead, and the
 * bundle is the half of that a test cannot see: `tests/invalidation.spec.ts`
 * counts passes through the pipeline, and nothing counted bytes. Row
 * virtualization (P2-1, P2-2) landed with no CI at all, and the bundle went
 * from 34.2 kB to 35.9 kB gzipped with nothing in a position to notice if it
 * had grown by ten times that.
 *
 * The budgets below are *measured*, not inherited. The figures in the comment
 * are what the 2026-09-03 build actually produced; the budget sits above them
 * with enough headroom that ordinary work passes and an accident does not. So
 * a number here that is far from the budget is slack, and one that is close is
 * drift worth looking at — the difference is only legible because both are
 * written down.
 *
 * Gzip at zlib's default level, which is what `gzip -c` uses and therefore
 * what the reference figures were taken with. Not `level: 9`: matching how the
 * numbers were measured matters more than squeezing them.
 *
 * Run with `pnpm size`, after `pnpm build`.
 */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

interface Budget {
  /** Path relative to the repo root. */
  file: string
  /** Gzipped kB the file may not exceed. */
  budgetKb: number
  /** What it measured when the budget was set, so drift is tellable from slack. */
  measuredKb: number
}

const BUDGETS: Budget[] = [
  { file: 'dist/vue-table-chad.js', budgetKb: 63, measuredKb: 44.3 },
  { file: 'dist/vue-table-chad.css', budgetKb: 7.5, measuredKb: 4.9 },
  // Its own entry point, so its own line: four complete locales are ~5.7 kB of
  // strings that a consumer importing none never downloads. The budget has
  // room for roughly two more languages before it wants revisiting, which is
  // the decision it exists to force.
  { file: 'dist/locales.js', budgetKb: 9, measuredKb: 5.5 },
]

const KB = 1024

function gzippedKb(path: string): number {
  return gzipSync(readFileSync(path)).byteLength / KB
}

const over: string[] = []

for (const budget of BUDGETS) {
  const path = resolve(ROOT, budget.file)
  let actualKb: number
  try {
    actualKb = gzippedKb(path)
  } catch {
    // A missing file must fail rather than pass vacuously: `files: ["dist"]`
    // over a gitignored `dist/` means "no build" is the normal state of a
    // fresh clone, and a budget check that green-lights it guards nothing.
    console.error(`${budget.file} — not built. Run \`pnpm build\` first.`)
    process.exit(1)
  }

  const percent = Math.round((actualKb / budget.budgetKb) * 100)
  const verdict = actualKb > budget.budgetKb ? 'OVER' : 'ok'
  console.log(
    `${budget.file} — ${actualKb.toFixed(1)} kB gzip / ${budget.budgetKb} kB budget ` +
      `(${percent}% of budget, ${budget.measuredKb} kB when the budget was set) ${verdict}`,
  )
  if (actualKb > budget.budgetKb) {
    over.push(`${budget.file}: ${actualKb.toFixed(1)} kB > ${budget.budgetKb} kB`)
  }
}

if (over.length > 0) {
  console.error(`\nBundle budget exceeded:\n  ${over.join('\n  ')}`)
  console.error('Either the growth is justified — raise the budget and say why in the commit — or it is not.')
  process.exit(1)
}
