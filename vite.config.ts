import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import { readFileSync } from 'fs'

// One version number for the whole app. package.json is the source; the
// Android versionName is pinned to it by tests/data/appVersion.test.ts,
// because gradle cannot import JSON at build time.
const appVersion = (JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf8')) as { version: string }).version

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
    exclude: ['**/node_modules/**', '**/.claude/**', '**/dist/**', '**/.worktrees/**'],
  },
})
