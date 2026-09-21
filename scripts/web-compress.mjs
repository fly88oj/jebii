// Build-time precompression: generates .br (brotli q11) and .gz (gzip-9) sidecar files for dist-web text assets.
// When the proxy matches Accept-Encoding it serves the precompressed file directly — zero per-request
// CPU; on a miss it falls back to the source file / dynamic compression.
import { readdirSync, statSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { brotliCompressSync, gzipSync, constants as zc } from 'node:zlib'
import process from 'node:process'

const dist = path.resolve(process.cwd(), 'dist-web')
const TEXT_EXT = new Set(['.js', '.mjs', '.css', '.json'])
const MIN_BYTES = 1024

let totalRaw = 0
let totalBr = 0
let files = 0

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) {
      walk(p)
      continue
    }
    if (!TEXT_EXT.has(path.extname(name).toLowerCase())) continue
    const raw = readFileSync(p)
    if (raw.length < MIN_BYTES) continue
    files += 1
    totalRaw += raw.length
    const br = brotliCompressSync(raw, {
      params: { [zc.BROTLI_PARAM_QUALITY]: 11, [zc.BROTLI_PARAM_MODE]: zc.BROTLI_MODE_TEXT }
    })
    if (br.length < raw.length) {
      writeFileSync(p + '.br', br)
      totalBr += br.length
    }
    const gz = gzipSync(raw, { level: 9 })
    if (gz.length < raw.length) {
      writeFileSync(p + '.gz', gz)
    }
  }
}

for (const sub of ['assets', 'core']) {
  const dir = path.join(dist, sub)
  if (existsSync(dir)) walk(dir)
}

const saved = totalRaw ? Math.round((1 - totalBr / totalRaw) * 100) : 0
console.log(`precompressed ${files} files: ${totalRaw}B -> ${totalBr}B br (-${saved}%)`)
