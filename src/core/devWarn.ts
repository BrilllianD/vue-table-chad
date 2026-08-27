/**
 * Development-time diagnostics.
 *
 * The library had four `throw`s and no warnings across 10k lines, which left a
 * whole class of authoring mistakes silent: a duplicate column id corrupts the
 * layout rather than erroring, and a sort naming a column nobody declared just
 * does nothing. Neither is worth throwing over — a table that refuses to render
 * because one column id is wrong is worse than one that renders and says so —
 * but both are worth saying out loud.
 *
 * Guarded by `process.env.NODE_ENV` rather than `import.meta.env.DEV`: the
 * latter is resolved when *this* package is built, which would bake the answer
 * in and decide for every consumer at once. `process.env.NODE_ENV` is left in
 * the output for the consumer's own bundler to replace, so the check reflects
 * *their* build and the whole block minifies away in their production one. The
 * `typeof` guard keeps it from throwing where `process` does not exist at all,
 * such as a browser loading the ESM directly.
 */
/**
 * Declared locally rather than pulled in from `@types/node`: this is a browser
 * library, and its build tsconfig deliberately has no node types. The
 * declaration emits nothing, so the identifier survives into the output for a
 * bundler to substitute.
 */
declare const process: { env: { NODE_ENV?: string } }

/**
 * Whether development-time checks should run at all.
 *
 * Exported so a caller can skip the *scan* and not merely the message: a check
 * that walks every column on every re-evaluation is worth nothing in a
 * production build, and `devWarn` alone would still pay for the walk.
 *
 * The `try` is the environment guard, and it has to be — a `typeof process !==
 * 'undefined'` test would look safer and be wrong. Bundlers substitute the
 * *text* `process.env.NODE_ENV` and leave a bare `typeof process` alone, so in
 * a Vite dev browser the substitution says "development" while the typeof test
 * says `process` does not exist, and the guard would switch the diagnostics off
 * in exactly the build that wants them. Letting the ReferenceError happen means
 * the only thing that can reach the `catch` is an environment where nothing
 * replaced the expression at all — a browser loading the ESM raw — and silence
 * is the right answer there.
 *
 * Computed once. A consumer cannot meaningfully change `NODE_ENV` mid-session,
 * and this sits on a path that runs per column set per re-evaluation.
 */
let enabled: boolean | undefined
export const devChecksEnabled = (): boolean => {
  if (enabled === undefined) {
    try {
      enabled = process.env.NODE_ENV !== 'production'
    } catch {
      enabled = false
    }
  }
  return enabled
}

/**
 * Messages already emitted, so a warning raised inside a computed does not
 * repeat on every re-evaluation. Keyed by the full message: two columns with
 * different duplicate ids are two different problems and both deserve saying.
 */
const seen = new Set<string>()

/** Forgets what has been warned about. Exported for tests, which need each case fresh. */
export function resetDevWarnings(): void {
  seen.clear()
}

/**
 * Warns once per distinct message, in development only.
 *
 * Silent in production, and cheap there: the `isDev()` call is the whole cost,
 * and a consumer's bundler that replaces `process.env.NODE_ENV` removes even
 * that along with the call site.
 */
export function devWarn(message: string): void {
  if (!devChecksEnabled()) return
  if (seen.has(message)) return
  seen.add(message)
  console.warn(`[vue-table] ${message}`)
}
