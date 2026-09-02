# Releasing

The packaging decisions below are settled. Reopen one only with a reason, and rewrite the entry
rather than leaving both — the same rule the **Settled decisions** section of
[`CLAUDE.md`](CLAUDE.md) states.

## Before a release

`make release-check` runs all of this except `pnpm size` (which `make pack` runs); the commands
are listed so a failure can be re-run alone:

```bash
pnpm build && pnpm size
npm pack --dry-run          # right name, LICENSE and README in the tarball
pnpm dlx publint
pnpm dlx @arethetypeswrong/cli --pack . --profile esm-only --exclude-entrypoints style.css
```

`--exclude-entrypoints style.css` because a stylesheet has no type declarations to resolve and attw
reports the subpath as a failure on those grounds alone. The import itself is exercised by the other
half of this check, worth repeating every release: install the tarball into a scratch Vite app,
import `DataTable` and `@brillliand/vue-table-chad/style.css`, and typecheck it under both `bundler`
and `nodenext` resolution.

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
- **Declarations are rolled up.** The per-file emit re-exported through extensionless relative
  specifiers, which TypeScript cannot follow under `node16`/`nodenext` — a consumer set to `nodenext`
  saw every accessor parameter degrade to `any` while its build stayed green. `rollupTypes: true`
  leaves no relative specifier in the shipped types.
