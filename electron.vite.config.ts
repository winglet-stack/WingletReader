import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src')
      },
      // Prefer TypeScript source over pre-compiled JS artifacts when both exist.
      extensions: ['.mts', '.ts', '.tsx', '.jsx', '.mjs', '.js', '.cjs', '.json']
    },
    plugins: [react()]
  }
})
