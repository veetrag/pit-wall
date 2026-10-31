import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import { readFileSync } from 'fs'

// One version number for the whole app. package.json is the source; the
// Android versionName is pinned to it by tests/data/appVersion.test.ts,
// because gradle cannot import JSON at build time.
const appVersion = (JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf8')) as { version: string }).version

const EXCLUDE = ['**/node_modules/**', '**/.claude/**', '**/dist/**', '**/.worktrees/**']

// Statistical suites: many full races per test. Keep this list in step with
// any new *Bands / Monte-Carlo test file.
const SIMULATION_SUITES = [
  'tests/engine/monteCarlo.test.ts',
  'tests/engine/strategy.test.ts',
  'tests/engine/difficultyProfile.test.ts',
  'tests/engine/debriefJudge.test.ts',
  'tests/engine/*Bands.test.ts',
  'tests/engine/mechanicalFailure.test.ts',
  'tests/engine/circuitDifferentiation.test.ts',
  'tests/engine/circuitTraits.test.ts',
  'tests/engine/harnessMetrics.test.ts',
  'tests/engine/setupBalance.test.ts',
  'tests/engine/safetyCar.test.ts',
  'tests/engine/overtakeRaceTime.test.ts',
  'tests/engine/gridOrder.test.ts',
  'tests/engine/tyreAllocation.test.ts',
  'tests/state/dailyYear.test.ts',
]

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  resolve: {
    alias: {
      '@engine': resolve(__dirname, './src/engine'),
      '@data': resolve(__dirname, './src/data'),
      '@state': resolve(__dirname, './src/state'),
      '@canvas': resolve(__dirname, './src/canvas'),
      '@ui': resolve(__dirname, './src/ui'),
      '@audio': resolve(__dirname, './src/audio'),
      '@hooks': resolve(__dirname, './src/hooks'),
      '@sync': resolve(__dirname, './src/sync'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    coverage: { provider: 'v8' },
    // .worktrees is excluded because superpowers creates git worktrees there,
    // each a full checkout with its own tests/. Without this, `vitest run`
    // globs them and reports double the suite -- 140 files / 1004 tests during
    // the qualifying merge -- which hides whether the tests being counted are
    // the ones on this branch.
    exclude: [...EXCLUDE],
    // Two projects so the statistical suites get their own, generous clock.
    // The Monte-Carlo / band files run thousands of races (strategy.test.ts's
    // 8000-race gate takes ~6s alone on an idle machine), so under load --
    // a parallel gradle build, three agents' suites -- they blew through the
    // 5s/10s defaults and failed on TIME, not on a band. The fix is time only:
    // no band, gate or sample size is touched. Per-test timeouts written in
    // the files still win over these.
    projects: [
      {
        extends: true,
        test: { name: 'unit', exclude: [...EXCLUDE, ...SIMULATION_SUITES] },
      },
      {
        extends: true,
        test: {
          name: 'simulation',
          include: SIMULATION_SUITES,
          testTimeout: 300_000,
          hookTimeout: 300_000,
        },
      },
    ],
  },
})
