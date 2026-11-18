import { existsSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig, configDefaults } from 'vitest/config'
import { playwright } from '@vitest/browser-playwright'
import vue from '@vitejs/plugin-vue'

// Inline projects do not inherit the root `plugins` and `resolve` in vitest 4, so both projects spread this.
const shared = {
  plugins: [vue()],
  resolve: {
    // An array, not an object: order matters. The stylesheet subpath must be
    // matched before the bare package name, or the bare alias rewrites
    // `@brillliand/vue-table-chad/style.css` to `src/index.ts/style.css`.
    alias: [
      { find: '@brillliand/vue-table-chad/style.css', replacement: fileURLToPath(new URL('./src/components/preset/table.css', import.meta.url)) },
      { find: '@brillliand/vue-table-chad/locales', replacement: fileURLToPath(new URL('./src/locales/index.ts', import.meta.url)) },
      { find: '@brillliand/vue-table-chad', replacement: fileURLToPath(new URL('./src/index.ts', import.meta.url)) },
      { find: '@', replacement: fileURLToPath(new URL('./src', import.meta.url)) },
      { find: '@fixtures', replacement: fileURLToPath(new URL('./bench/fixtures.ts', import.meta.url)) },
    ],
  },
}

const SYSTEM_CHROMIUM = '/usr/lib/chromium/chromium'

/**
 * The browser project launches the system Chromium, because `playwright install` deletes other
 * projects' browser builds. Set `E2E_CHROMIUM` for another path. With neither, Playwright looks for
 * its own download; a browser that cannot launch fails the run.
 */
const executablePath =
  process.env.E2E_CHROMIUM || (existsSync(SYSTEM_CHROMIUM) ? SYSTEM_CHROMIUM : undefined)

/**
 * Two projects. `unit` is the whole suite under happy-dom; `browser` exists because happy-dom has no
 * layout, no stacking and no real click sequence, so an overlay's z-order above a clipping window
 * and a real double click can only be measured in a real browser. Browser specs are named
 * `*.browser.spec.ts`.
 */
export default defineConfig({
  test: {
    projects: [
      {
        ...shared,
        test: {
          name: 'unit',
          environment: 'happy-dom',
          globals: true,
          include: ['tests/**/*.spec.ts'],
          exclude: [...configDefaults.exclude, 'tests/**/*.browser.spec.ts'],
          // Date specs read local midnight, which differs from UTC only west of Greenwich;
          // under a UTC zone they pass with or without the code they guard. Los Angeles
          // also has DST.
          env: { TZ: 'America/Los_Angeles' },
          benchmark: {
            include: ['bench/**/*.bench.ts'],
          },
        },
      },
      {
        ...shared,
        test: {
          name: 'browser',
          globals: true,
          include: ['tests/**/*.browser.spec.ts'],
          // `pnpm bench` must not run the benches a second time under this project.
          benchmark: { include: [] },
          browser: {
            enabled: true,
            provider: playwright({ launchOptions: { executablePath } }),
            headless: true,
            instances: [{ browser: 'chromium' }],
          },
        },
      },
    ],
  },
})
