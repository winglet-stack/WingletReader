import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    // Prefer TypeScript source files over pre-compiled JS artifacts when both exist.
    extensions: ['.mts', '.ts', '.tsx', '.jsx', '.mjs', '.js', '.cjs', '.json']
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    environmentMatchGlobs: [
      ['src/renderer/**/*.test.tsx', 'happy-dom'],
      ['src/renderer/**/__tests__/*.test.tsx', 'happy-dom'],
    ]
  }
})
