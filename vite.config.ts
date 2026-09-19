import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
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
