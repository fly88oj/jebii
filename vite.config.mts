import { defineConfig } from 'vite'
import { resolve } from 'node:path'

// Web build: emits a self-contained static site (dist-web) served by the auth proxy under the /app/ prefix.
export default defineConfig({
  root: resolve(__dirname, 'src'),
  base: '/app/',
  build: {
    outDir: resolve(__dirname, 'dist-web'),
    emptyOutDir: true,
    target: 'esnext'
  }
})
