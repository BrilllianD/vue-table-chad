# Releasing

The packaging decisions below are settled. Reopen one only with a reason, and rewrite the entry
rather than leaving both — the same rule the **Settled decisions** section of
[`CLAUDE.md`](CLAUDE.md) states.

## Before a release

`make release-check` runs all of this (`make consumer-check` last) except `pnpm size` (which
`make pack` runs); the commands are listed so a failure can be re-run alone:

```bash
pnpm build && pnpm size
npm pack --dry-run          # right name, LICENSE and README in the tarball
pnpm dlx publint
pnpm dlx @arethetypeswrong/cli --pack . --profile esm-only --exclude-entrypoints style.css
make consumer-check         # the tarball, compiled as a consumer sees it
```

`--exclude-entrypoints style.css` because a stylesheet has no type declarations to resolve and attw
reports the subpath as a failure on those grounds alone.

`make consumer-check` (`scripts/consumer-check.sh`) is the other half: it builds, packs the tarball
into a temporary directory, installs it into a scratch app there and typechecks a `.ts` file and an
SFC that import `DataTable`, `StaticSelect`, a locale and `style.css`, under both `bundler` and
`nodenext` resolution with `skipLibCheck: false`. It writes nothing into the repository except the
ignored `dist/`, needs the npm registry for the scratch install, and `CONSUMER_KEEP=1` keeps the
scratch directory.

## Versioning

While the package is 0.x, a breaking change bumps the minor (0.6.x to 0.7.0) and its `CHANGELOG.md`
bullet starts `**Breaking:**`. Everything else bumps the patch, additions included. A minor may
also be chosen for a feature release (0.6.0 was). Semver proper starts at 1.0, which waits on
decision D5.

Breaking is:

- an export of `.` or `./locales` removed or renamed, or an `exports` subpath removed;
- a prop, emit, slot, exposed member, or composable option or return member removed, renamed or
  retyped narrower, or a prop default changed;
- a `TableLabels` key removed or renamed;
- a `.vt-` class, `data-*` attribute or `--vtc-*` token the preset documents, removed or renamed;
- the `vue` peer floor raised.

Not breaking: a fix that makes the package do what `docs/` says, even when an app relied on the
old behaviour; a new export, optional prop or option; changed label wording; internals.

Every unreleased change that ships is a bullet under `## Unreleased` in `CHANGELOG.md`, written
in the commit that makes it.

## Cutting a release

1. Gates: `pnpm lint && pnpm typecheck && pnpm test && pnpm size`; `pnpm docs:api` leaves
   `git status` clean; `make release-check`.
2. Choose the version by the rules in **Versioning**.
3. Bump `version` in `package.json`, rename `## Unreleased` in `CHANGELOG.md` to `## x.y.z` and
   open a new empty `## Unreleased` above it.
4. Commit `Release version x.y.z` with a prose body: what changed, whether it is additive, the
   gates run (as `83ced6d` does).
5. The owner then creates the annotated tag `vx.y.z`, pushes it by name, and runs `npm publish`
   from a terminal (passkey 2FA). Agents stop after the release commit.

The automated half (changesets) is tracked in yman 1.

## Settled decisions

- **The package name is `@brillliand/vue-table-chad`.** Scoped, so `publishConfig: { access:
  "public" }` is required rather than optional. The scope is the account name `BrilllianD`
  lowercased, because **npm forbids uppercase in a package name, scope included** — that lowercase
  is correct and is not a typo to fix. Casing survives in the URLs, where `repository` and
  `homepage` keep `BrilllianD`.
- **ESM only, and no CJS build.** `main` is gone rather than answered with a second output format:
  Vue 3.5 plus Node 24 makes the CJS consumer largely theoretical, and a second format is a cost
  paid on every release. `attw --profile esm-only` is the invocation that reflects this — the
  profile is what stops the deliberate gap being reported as a failure.
- **The locales are a second entry point, not part of the main bundle.** `src/locales/` is five
  complete `TableLabels` records and nothing else — no runtime import from `core/`, only the type —
  so `vite.config.ts` builds it as its own chunk and `exports` maps `./locales` at it. A consumer
  importing no locale therefore downloads none, which no amount of trusting a downstream bundler to
  shake five frozen objects out of the main chunk would guarantee. `pnpm size` budgets it on its own
  line for the same reason: adding a language is visible.
- **Rolling up the types renamed them.** With two entries, `vite-plugin-dts` names each rolled-up
  declaration after its entry, so the main one is `dist/vue-table-chad.d.ts` rather than
  `dist/index.d.ts`. `package.json`'s `types` and both `exports` conditions point at the real names;
  attw is what catches it if they ever drift.
- **Declarations are rolled up.** The per-file emit re-exported through extensionless relative
  specifiers, which TypeScript cannot follow under `node16`/`nodenext` — a consumer set to `nodenext`
  saw every accessor parameter degrade to `any` while its build stayed green. `rollupTypes: true`
  leaves no relative specifier in the shipped types.
- **Declarations are checked as a consumer sees them.** `vite-plugin-dts` bundles an older
  `@vue/language-core` than `vue-tsc` does, and that one types a static `ref="x"` on a child
  component into `__typeRefs`, so the rolled-up declaration printed the child's instance type with
  a bare `GlobalComponents`, which fails `skipLibCheck: false` (TS2344, yman 65). TypeScript does
  not typecheck its own emitted text, so only a consumer compile finds it, which is
  `make consumer-check`; `afterDiagnostic` in `vite.config.ts` also fails the build on any
  declaration diagnostic. Rule: a primitive takes a child component's instance through a function
  ref, never a static `ref`, until the dts build uses the language-core `vue-tsc` uses.
