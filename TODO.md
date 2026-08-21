# TODO

The short list. [`ROADMAP.md`](ROADMAP.md) carries the reasoning and the full phase plan; this is
what to pick up next, in order.

**State as of 2026-08-21:** `main` is clean, 335 tests green, `pnpm typecheck` clean. Phase 1 is
merged into `main` along with ten commits of docs and bug-fix polish. Phase 2 and Phase 3 are both
unstarted.

## Why Phase 3 before Phase 2

The roadmap ordered it 2 → 3, written when Phase 1 still sat on an unmerged branch. That ordering no
longer holds:

- **P3-1 needs a git remote**, and the remote is what unblocks P3-7 (CI) and P3-9 (docs site). Those
  are exactly the guards worth having *during* Phase 2 — landing a virtualizer with no CI means the
  bundle-size budget and the bench regression signal arrive after the largest render change the
  project has made.
- **Phase 3 is nine small, fully specified tasks with no design risk.** Phase 2 is open-ended and,
  by the roadmap's own note, cannot be settled by counting recomputes; it needs hand-driven
  `PerfView` sessions in a foregrounded tab.
- The last ten commits were already ship-shaped work (README split into topic pages, generated API
  reference, self-contained docs page, six bug fixes). Phase 3 finishes that arc.

## Blocked on a decision

Nothing below can start until these are answered:

- **The published package name.** `@sandbox/vue-table` is a placeholder. Scoped or unscoped decides
  whether `publishConfig: { access: "public" }` is needed.
- **Where the remote lives.** There is no remote at all. P3-1, P3-7 and P3-9 all depend on it.

## Next three tasks

### 1 · P3-1 + P3-2 + P3-3 — identity, legal, metadata
One pass, since they touch the same file. Real name across `package.json`, `README.md`,
`tsconfig.json` paths, `vitest.config.ts`, `vite.demo.config.ts`. A LICENSE file **and** the
`license` field — without both the package is legally unusable. Then `repository`, `homepage`,
`bugs`, `keywords`, `author`, `engines.node` (README and `.nvmrc` both say Node 24; `package.json`
says nothing).

*Done when:* `npm pack --dry-run` shows the right name and the LICENSE in the tarball.

### 2 · P3-4 + P3-5 + P3-6 — make the tarball real
`files: ["dist"]` plus a gitignored `dist/` publishes an empty package from a fresh clone; add
`prepublishOnly: "pnpm test && pnpm build"`. Then the exports map: there is no `require` condition
and no CJS build while `main` points at ESM, so CJS consumers get `ERR_REQUIRE_ESM`.
**Recommendation: drop `main` and declare ESM-only** rather than adding a CJS output — Vue 3.5 plus
Node 24 makes the CJS consumer largely theoretical, and a second build format is a permanent cost.
Add a `default` condition and a `"./package.json"` export. Delete `output.globals` and `lib.name`
from `vite.config.ts`; they do nothing under `formats: ['es']`.

*Done when:* `publint` and `arethetypeswrong` are clean, and the tarball installs into a scratch
Vite app.

### 3 · P3-7 — CI
No `.github/` exists. `ci.yml`: install → typecheck → test → build. Add a bundle-size budget at the
current **24.4 kB gzip JS / 3.3 kB gzip CSS**, and run `pnpm bench` for regression visibility.

*Done when:* a pushed branch shows a green check, and an artificially bloated build fails the budget.

## Housekeeping, independent of the above

- **Delete `perf/pipeline`.** Fully merged — it holds no commit `main` lacks, and is two behind.
- **Rewrite ROADMAP.md's "Branch state" section.** It currently tells a cold reader that `main` is
  19 commits behind and that Phase 1 lives on a branch. Both were true when written; neither is now,
  and the file's stated purpose is to be picked up cold.

## If you'd rather go at virtualization first

**P2-1 (`useVirtualRows()`)** is self-contained core work — a windowed range over `displayRows`,
fixed row height first — and depends on none of Phase 3. It is the one Phase 2 task that can start
cold. P2-2 is where the cost lands, because it carries the `<tbody>` restructure deferred from P1-8.
