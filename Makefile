# The tarball ships `dist` and nothing else (see `files` in package.json), so every
# target here builds before it packs — `npm pack` runs no lifecycle script that would
# do it for us, and `prepublishOnly` fires on publish only.

.PHONY: pack pack-check release-check

## Build and write brillliand-vue-table-chad-<version>.tgz into the repo root.
pack:
	pnpm build
	pnpm size
	npm pack

## Same, without writing the tarball: lists what would ship.
pack-check:
	pnpm build
	npm pack --dry-run

## The pre-release checks from RELEASING.md. `--exclude-entrypoints style.css`
## because a stylesheet has no declarations to resolve and attw reports the subpath
## as a failure on those grounds alone.
release-check: pack-check
	pnpm dlx publint
	pnpm dlx @arethetypeswrong/cli --pack . --profile esm-only --exclude-entrypoints style.css
