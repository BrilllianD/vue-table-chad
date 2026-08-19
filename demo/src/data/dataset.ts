/**
 * The demo's view of the shared fixture.
 *
 * The generator itself lives in `bench/fixtures.ts` so that benchmarks, the
 * perf-invariant tests and this demo all measure and display the same rows —
 * a bench number that described a different dataset than the screen would be
 * worth very little. Everything the demo used to export from here still is,
 * so no view had to change.
 */
export {
  makeRows,
  generateEmployees,
  DEPARTMENTS,
  SENIORITY,
  LOCATIONS,
  COUNTRIES,
  type Employee,
} from '@fixtures'

import { makeRows } from '@fixtures'

/** 10k rows, generated once and shared by every view. */
export const employees = makeRows()
