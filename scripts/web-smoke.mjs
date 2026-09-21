// Web smoke test: headless-browser verification of the deployed (or previewed) app.
//
// Usage:
//   node scripts/web-smoke.mjs [URL]     (default: http://127.0.0.1:4173/app/ — run
//                                         `npx vite preview --port 4173` first, or
//                                         point it at your deployment)
//   EDGE_PATH=... node scripts/web-smoke.mjs https://your-host/app/
//
// Checks: boot gate, Live2D canvas, placeholder mood state, language switching,
// settings dialog open/close, traffic filter, emotion timeline container,
// mobile viewport layout. Exits non-zero on any failure. No LLM/Jev calls,
// so the pass is free and deterministic.
import { spawn, execSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const URL_TO_TEST = process.argv[2] || 'http://127.0.0.1:4173/app/'
const EDGE =
  process.env.EDGE_PATH ||
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const PROFILE = mkdtempSync(path.join(tmpdir(), 'jebii-smoke-'))
const PORT = 9349
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' | ' + detail : ''}`)
}

let proc, ws, send, evalJs

function killOwnBrowsers() {
  // Kill every Edge still holding the scratch profile (the launcher process
  // hands off to a child, so killing the spawned PID alone leaks children).
  try {
    execSync(
      `powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"Name='msedge.exe'\\" | Where-Object { $_.CommandLine -match 'jebii-smoke-' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"`,
      { stdio: 'ignore' }
    )
  } catch {
    /* nothing to kill */
  }
}

async function main() {
  proc = spawn(
    EDGE,
    [
      '--headless', '--disable-gpu', '--no-first-run',
      `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`
    ],
    { stdio: 'ignore' }
  )
  await sleep(2500)
  const list = await fetch(`http://127.0.0.1:${PORT}/json/list`).then((r) => r.json())
  const page = list.find((t) => t.type === 'page')
  if (!page) throw new Error('no debuggable page')
  ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })
  let id = 0
  const pending = new Map()
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data)
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) }
  }
  send = (method, params = {}) =>
    new Promise((res, rej) => {
      const mid = ++id
      pending.set(mid, (m) => (m.error ? rej(new Error(method + ': ' + m.error.message)) : res(m.result)))
      ws.send(JSON.stringify({ id: mid, method, params }))
    })
  evalJs = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    if (r.exceptionDetails) throw new Error('eval: ' + JSON.stringify(r.exceptionDetails).slice(0, 200))
    return r.result.value
  }
  await send('Page.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false })

  // 1. boot — the gate must reach a verdict: connected (overlay hidden) or a rendered
  //    failure state with a Retry button (e.g. previewing without the channel proxy).
  //    The Live2D canvas must exist either way.
  await send('Page.navigate', { url: URL_TO_TEST + '?lang=zh' })
  let boot = null
  for (let i = 0; i < 40; i++) {
    await sleep(500)
    boot = await evalJs(`(() => {
      const l = document.getElementById('boot-loading')
      const actions = document.getElementById('loading-actions')
      return {
        gateSettled: (!l || l.classList.contains('hidden')) || !actions.classList.contains('hidden'),
        canvas: !!document.querySelector('#stage canvas'),
        chip: document.getElementById('emotion-chip')?.textContent || '',
        rows: document.querySelectorAll('#jev-bars .jev-row').length
      }
    })()`)
    if (boot.gateSettled && boot.canvas) break
  }
  check('boot gate settled + Live2D canvas', boot.gateSettled === true && boot.canvas === true)
  check('placeholder mood state', /平静|neutral|穏やか/.test(boot.chip), boot.chip)
  check('taxonomy rows = 14', boot.rows === 14, String(boot.rows))

  // 2. settings dialog
  await evalJs(`document.getElementById('btn-settings').click(); true`)
  await sleep(300)
  const dlg = await evalJs(`(() => { const o = document.getElementById('settings-overlay'); return !o.classList.contains('hidden') && !!document.getElementById('set-model') })()`)
  check('settings dialog opens', dlg === true)
  await evalJs(`document.getElementById('btn-settings-close').click(); true`)
  await sleep(200)
  const dlgClosed = await evalJs(`document.getElementById('settings-overlay').classList.contains('hidden')`)
  check('settings dialog closes', dlgClosed === true)

  // 3. language switch via the settings dialog select (the top-bar switcher is gone)
  await evalJs(`(() => { document.getElementById('btn-settings').click(); const sel = document.getElementById('set-locale'); sel.value = 'en'; document.getElementById('btn-settings-save').click(); return true })()`)
  await sleep(600)
  const en = await evalJs(`({ lang: document.documentElement.lang, chip: document.getElementById('emotion-chip')?.textContent || '' })`)
  check('language switch to EN', en.lang === 'en' && /neutral/.test(en.chip), JSON.stringify(en))

  // 4. traffic filter buttons exist and toggle the body class
  const tf = await evalJs(`(() => {
    const btn = document.querySelector('#traffic-filter button[data-f="llm"]')
    btn.click()
    return document.body.classList.contains('tf-filter-llm')
  })()`)
  check('traffic filter toggles', tf === true)
  await evalJs(`document.querySelector('#traffic-filter button[data-f="all"]').click(); true`)

  // 5. timeline container present (empty without decisions, non-empty after any)
  const tl = await evalJs(`!!document.getElementById('jev-timeline')`)
  check('emotion timeline container', tl === true)

  // 6. mobile viewport
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
  await sleep(700)
  const mob = await evalJs(`(() => ({
    tabs: !!document.getElementById('tab-logs') && !!document.getElementById('tab-mood'),
    ox: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
  }))()`)
  check('mobile tabs + no overflow', mob.tabs === true && mob.ox === false)

  const failed = results.filter((r) => !r.ok)
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
  process.exitCode = failed.length ? 1 : 0
}

main()
  .catch((e) => { console.log('ERR', e.message); process.exitCode = 1 })
  .finally(() => {
    try { ws?.close() } catch { /* already closed */ }
    try { proc?.kill() } catch { /* already dead */ }
    killOwnBrowsers()
    try { rmSync(PROFILE, { recursive: true, force: true }) } catch { /* best effort */ }
  })
