import js from '@eslint/js'
import pluginVue from 'eslint-plugin-vue'
import tseslint from 'typescript-eslint'

/*
 * No type-aware rules on purpose. `pnpm typecheck` already runs vue-tsc over
 * every file with `strict`, `noUnusedLocals` and `noUnusedParameters`, so a
 * second type pass here would re-derive what tsc knows at several times the
 * cost. This config lints what tsc cannot see.
 *
 * `vue/flat/essential`, not `recommended`: the latter pulls in the stylistic
 * rules, and the templates in this repo are hand-wrapped. Formatting is not
 * this tool's job here.
 */
export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'demo/dist/**',
      'coverage/**',
      // VitePress build output and cache — generated, gitignored, and ~1500
      // errors of pure noise if linted.
      'docs/.vitepress/dist/**',
      'docs/.vitepress/cache/**',
    ],
  },

  js.configs.recommended,
  tseslint.configs.recommended,
  pluginVue.configs['flat/essential'],

  {
    files: ['**/*.vue'],
    languageOptions: { parserOptions: { parser: tseslint.parser } },
  },

  {
    /*
     * tsc owns unused-symbol reporting; two tools flagging it means two places
     * to silence it. `any` stays a warning rather than an error: the pipeline
     * has a few deliberate ones at the boundaries where a row's cell type is
     * genuinely unknown.
     *
     * `no-undef` is off for the same division of labour, and it is the one the
     * typescript-eslint docs single out: the rule has no idea what `lib.dom`
     * declares, so it reports `PointerEvent`, `HTMLElement` and `KeyboardEvent`
     * as undefined globals. tsc resolves them from `lib` and would fail on a
     * real typo long before this rule saw it.
     */
    rules: {
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-undef': 'off',
    },
  },

  {
    /*
     * `tests/invalidation.spec.ts` reads computeds as bare expressions on
     * purpose — touching `source.rows.value` is how the harness warms a stage
     * or probes whether an interaction invalidated it. They are the subject of
     * the file, not dead code. `bench/reactive.bench.ts` does the same to force
     * evaluation inside the measured region.
     */
    files: ['tests/**', 'bench/**'],
    rules: { '@typescript-eslint/no-unused-expressions': 'off' },
  },

  {
    /*
     * Both files build HTML inside a template literal, where `<\/script>` and
     * `<\/template>` must stay escaped: unescaped, the sequence closes the
     * enclosing block — the generated `standalone.html` in one case, the SFC's
     * own `<script setup>` in the other. The escape is load-bearing, so the
     * rule is wrong here rather than the code.
     */
    files: ['demo/inline.mjs', 'demo/src/views/RecipesView.vue'],
    rules: { 'no-useless-escape': 'off' },
  },

  {
    /*
     * `vue/multi-word-component-names` guards against a component shadowing an
     * HTML element in a global registry. Nothing under `docs/` has one: the
     * VitePress examples are single-file pages named after the doc they belong
     * to — `filtering.vue` sits beside `filtering.md`, and renaming it would
     * break the pairing that makes the directory readable — `theme/Demo.vue` is
     * VitePress's own `<Demo>` wrapper, and `examples/AddressesTable.vue` keeps
     * a real consumer's `name: "Addresses"` because the excerpt is that
     * consumer's code, not ours. Documentation artefacts, not library
     * components; the library's own components are all multi-word already and
     * stay linted.
     */
    files: ['docs/**'],
    rules: { 'vue/multi-word-component-names': 'off' },
  },

  {
    /*
     * The layer contracts from CLAUDE.md, made machine-checkable. They were
     * prose and discipline until now; nothing failed when one was broken.
     */
    files: ['src/core/**'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{
          group: ['**/components/**', '@/components/*'],
          message: 'core/ imports nothing from components/ — see CLAUDE.md.',
        }],
      }],
    },
  },

  {
    files: ['src/components/primitives/**'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{
          group: ['*.css', '**/*.css'],
          message: 'Primitives ship no stylesheet; the preset owns the theme.',
        }],
      }],
    },
  },
)
