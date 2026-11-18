#!/usr/bin/env bash
# Consumer compile (`make consumer-check`): build, pack the package into a temporary directory,
# install the tarball into a scratch app there, and typecheck imports from `.`, `./locales` and
# `./style.css` in a .ts file and an SFC under bundler and nodenext resolution with
# `skipLibCheck: false`, which is how a strict consumer reads the shipped declarations. Nothing is
# written into the repository except the ignored dist/. Needs the npm registry for the scratch
# install.
#
#   CONSUMER_KEEP=1   keep the scratch directory and print its path
set -euo pipefail

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
keep=${CONSUMER_KEEP:-}

tmp=$(mktemp -d "${TMPDIR:-/tmp}/vtc-consumer.XXXXXX")
cleanup() {
  if [[ $keep == 1 ]]; then
    echo "consumer-check: kept $tmp"
  else
    rm -rf "$tmp"
  fi
}
trap cleanup EXIT

log=$tmp/stage.log
app=$tmp/app

# step <label> <command...>: run one external command quietly; one line on success, its output
# on failure. Never pass a shell function: `set -e` does not apply inside an `if` condition.
step() {
  local label=$1
  shift
  if "$@" >"$log" 2>&1; then
    echo "consumer-check: $label ok"
  else
    echo "consumer-check: $label FAILED" >&2
    cat "$log" >&2
    exit 1
  fi
}

# dev <name>: the version of a devDependency in the repository's package.json.
dev() {
  node -p 'require(process.argv[1]).devDependencies[process.argv[2]]' "$root/package.json" "$1"
}

# ---- build and pack (npm pack runs no build, see the Makefile)
cd "$root"
step build pnpm build
step pack npm pack --pack-destination "$tmp"
tarball=$(find "$tmp" -maxdepth 1 -name '*.tgz' -print -quit)
if [[ -z $tarball ]]; then
  echo 'consumer-check: pack wrote no tarball' >&2
  exit 1
fi
files=$(tar -tzf "$tarball" | wc -l | tr -d ' ')

# ---- scratch app
deps=()
for name in vue typescript vue-tsc; do
  version=$(dev "$name")
  if [[ $version == undefined ]]; then
    echo "consumer-check: $name is not a devDependency in package.json" >&2
    exit 1
  fi
  deps+=("$name@$version")
done

mkdir -p "$app/src"
cd "$app"
cp "$root/pnpm-workspace.yaml" pnpm-workspace.yaml

cat >package.json <<'EOF'
{
  "name": "vtc-consumer-check",
  "private": true,
  "type": "module"
}
EOF

cat >tsconfig.bundler.json <<'EOF'
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "strict": true,
    "skipLibCheck": false,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "noEmit": true,
    "types": []
  },
  "include": ["src/**/*.ts", "src/**/*.vue"]
}
EOF

cat >tsconfig.nodenext.json <<'EOF'
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "strict": true,
    "skipLibCheck": false,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "noEmit": true,
    "types": []
  },
  "include": ["src/**/*.ts", "src/**/*.vue"]
}
EOF

# The shim every Vite app has for a stylesheet import.
cat >src/env.d.ts <<'EOF'
declare module '*.css'
EOF

cat >src/main.ts <<'EOF'
import { createApp } from 'vue'
import {
  DataTable,
  StaticSelect,
  createTableLabels,
  type ColumnDef,
} from '@brillliand/vue-table-chad'
import { ru } from '@brillliand/vue-table-chad/locales'
import '@brillliand/vue-table-chad/style.css'
import App from './App.vue'

export const columns: ColumnDef<{ id: number }>[] = [{ id: 'id', type: 'number' }]
export const components = { DataTable, StaticSelect }
export const labels = createTableLabels(ru)

createApp(App).mount('#app')
EOF

cat >src/App.vue <<'EOF'
<script setup lang="ts">
import { shallowRef } from 'vue'
import {
  DataTable,
  StaticSelect,
  useLocalDataSource,
  useTableState,
  type ColumnDef,
} from '@brillliand/vue-table-chad'

type Person = { id: number; name: string }

const rows = shallowRef<Person[]>([{ id: 1, name: 'Ada' }])
const columns: ColumnDef<Person>[] = [
  { id: 'id', header: 'Id', type: 'number' },
  { id: 'name', header: 'Name', type: 'text' },
]
const state = useTableState({ pageSize: 25 })
const source = useLocalDataSource(rows, columns, state.query)
const choice = shallowRef<unknown>('a')
</script>

<template>
  <DataTable :columns="columns" :source="source" :state="state" />
  <StaticSelect :options="['a', 'b']" :value="choice" @update:value="choice = $event" />
</template>
EOF

# ---- install, typecheck
step install pnpm add "$tarball" "${deps[@]}"
step 'typecheck bundler' pnpm exec vue-tsc --noEmit -p tsconfig.bundler.json
step 'typecheck nodenext' pnpm exec vue-tsc --noEmit -p tsconfig.nodenext.json

echo "consumer-check: ok $(basename "$tarball") ($files files)"
