/**
 * Dedicated vitest config so `npm run corpus:report` runs ONLY the scoreboard generator.
 *
 * Why this exists: the charter's "Report-runner constraint" wants
 * `vitest run …/scoreboard.report.ts`, but the generator is intentionally NOT named
 * `*.test.ts` (so plain `npm test` skips it), and the root config's
 * `include: ['src/**\/*.test.ts']` therefore excludes it. vitest 1.6 has no `--include`
 * CLI flag (it errors `Unknown option`), and a bare positional path is only filtered
 * against the existing include set — so the report file is never discovered.
 *
 * This is a STANDALONE config (not a merge of the root config — merging concatenates the
 * `include` arrays and would run the whole suite). It sets `include` to exactly the
 * report file. It adds no dependency and runs the same `scoreboard.report.ts` the charter
 * calls for. Plain `npm test` uses the root config and never loads this one. Keep
 * `resolve.extensions` in sync with the root `vitest.config.ts` (prefer .ts over built .js).
 */
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    extensions: ['.mts', '.ts', '.tsx', '.jsx', '.mjs', '.js', '.cjs', '.json']
  },
  test: {
    environment: 'node',
    include: ['src/shared/__tests__/normalization-corpus/scoreboard.report.ts']
  }
})
