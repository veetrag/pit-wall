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
    coverage: { provider: 'v8' },
  },
})
