// Web asset bundling: copies Cubism Core and models into dist-web (vite only bundles JS/CSS)
import { cpSync, rmSync, existsSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const root = process.cwd()
const dist = path.join(root, 'dist-web')
if (!existsSync(dist)) {
  console.error('dist-web missing: run vite build first')
  process.exit(1)
}
for (const dir of ['core', 'models']) {
  rmSync(path.join(dist, dir), { recursive: true, force: true })
  cpSync(path.join(root, 'resources', dir), path.join(dist, dir), { recursive: true })
}
console.log('web assets bundled into dist-web/')
