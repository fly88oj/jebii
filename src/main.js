// Web app entry: chat streaming, the Jev emotion pipeline, and the traffic log,
// talking straight to the reverse-proxy channels. Channel prefixes and tokens come from
// config.local.js (gitignored; config.example.js is the template); real keys all live on
// the proxy side, the browser only holds low-value tokens.
import { LLM_BASE, LMS_TOKEN, JEV_BASE, JEV_TOKEN, MODEL, MIMO_BASE, MIMO_TOKEN, MINIMAX_BASE, MINIMAX_TOKEN } from './config.local.js'
import {
  emotionLabel,
  intensityWord,
  emotionCriterion,
  intensityCriterion,
  zeroEmotionRows,
  INTENSITY_VALUE,
  INTENSITY_FALLBACK,
  EMOTION_KEYS
} from './emotions.ts'
import { t, initI18n, onLocaleChange, getLocale, setLocale, localeTag } from './i18n.js'
import * as voice from './voice.js'
import { VOICES as VOICE_PRESETS, voiceLabel } from './voices.js'

// Jev Choice criteria pinned to the zh baseline: these strings are decision
// input, not display text — the tested behavior must not shift when the user
// switches UI language. (emotions.ts owns the trilingual wording.)
function emotionCriteriaFor() {
  return Object.fromEntries(EMOTION_KEYS.map((k) => [k, emotionCriterion(k, 'zh')]))
}

function intensityCriteriaFor() {
  return {
    mild: intensityCriterion('mild', 'zh'),
    moderate: intensityCriterion('moderate', 'zh'),
    strong: intensityCriterion('strong', 'zh')
  }
}

const $ = (s) => document.querySelector(s)
const HISTORY_KEY = 'soulchat.history'

let live2d = null
let controller = null
let streaming = false
let assistantBubble = null
let chatCurrent = ''
let llmCount = 0
let jevCount = 0
let voiceCount = 0
let lastDetail = null // last applied Jev detail (or null): re-applied on locale change
const trafficLog = [] // in-memory traffic entries (may carry an i18n recipe), re-rendered on locale change

// ---------- Settings (localStorage overrides layered over config.local.js) ----------
const SETTINGS_KEY = 'jebii.settings'
const TIMELINE_KEY = 'jebii.emotimeline'

function loadSettings() {
  try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') } catch { return {} }
}
let settings = loadSettings()

/** Effective channel/behavior config: non-empty settings fields win over the built-in channel */
function cfg() {
  return {
    llmBase: settings.llmBase || LLM_BASE,
    lmsToken: settings.llmToken || LMS_TOKEN,
    model: settings.model || MODEL,
    jevBase: settings.jevBase || JEV_BASE,
    jevToken: settings.jevToken || JEV_TOKEN,
    mimoBase: MIMO_BASE,
    mimoToken: MIMO_TOKEN,
    minimaxBase: MINIMAX_BASE,
    minimaxToken: MINIMAX_TOKEN,
    voiceBase: settings.voiceBase || '',
    voiceToken: settings.voiceToken || '',
    ttsProvider: settings.ttsProvider || 'auto',
    asrProvider: settings.asrProvider || 'auto',
    voice: settings.voice || 'xiaomeng',
    autoSpeak: !!settings.autoSpeak,
    thinking: !!settings.thinking
  }
}

/** Manual speak button: cloud voice via the voice module, browser synthesis as fallback */
function speakText(text) {
  if (!voice.voiceAvailable() && !('speechSynthesis' in window)) { toast(t('tts.unsupported')); return }
  voice.speak(text)
}

// ---------- Clipboard (execCommand fallback for non-secure origins) ----------
function legacyCopy(s) {
  const ta = document.createElement('textarea')
  ta.value = s
  document.body.appendChild(ta)
  ta.select()
  try { document.execCommand('copy') } catch { /* ignore */ }
  ta.remove()
  return true
}
function copyText(s) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(s).then(() => true, () => legacyCopy(s))
  return Promise.resolve(legacyCopy(s))
}

// ---------- Emotion timeline (last 20 Jev decisions) ----------
function loadTimeline() {
  try { const a = JSON.parse(localStorage.getItem(TIMELINE_KEY) || '[]'); return Array.isArray(a) ? a : [] } catch { return [] }
}
function tlHue(key) {
  let h = 7
  for (const c of String(key)) h = (h * 31 + c.charCodeAt(0)) % 360
  return h
}
function renderTimeline() {
  const el = $('#jev-timeline')
  el.innerHTML = ''
  const a = loadTimeline()
  if (a.length) el.title = t('jev.timeline', { n: a.length })
  for (const it of a) {
    const bar = document.createElement('span')
    bar.className = 'tl-bar'
    bar.style.height = `${Math.max(8, Math.round((it.p ?? 0) * 100))}%`
    bar.style.background = `hsl(${tlHue(it.e)} 70% 62%)`
    bar.title = `${emotionLabel(it.e, getLocale())} · ${Math.round((it.p ?? 0) * 100)}%`
    el.appendChild(bar)
  }
}
function pushTimeline(result) {
  const a = loadTimeline()
  a.push({ e: result.emotion, p: result.confidence })
  try { localStorage.setItem(TIMELINE_KEY, JSON.stringify(a.slice(-20))) } catch { /* storage full */ }
  renderTimeline()
}

// ---------- Per-bubble immersive speak: tapping an assistant bubble speaks it ----------
// Repeat taps replay; taps are locked while a speak is in progress. The bubble gets a
// subtle hover/active affordance instead of visible buttons.
function makeSpeakable(bodyEl, text) {
  const wrap = bodyEl.closest('.msg')
  if (!wrap) return
  wrap.classList.add('speakable')
  wrap.title = t('bubble.speakHint')
  wrap.addEventListener('click', () => {
    if (voice.isSpeaking()) return // locked while speaking
    speakText(text)
  })
}
function toast(msg) {
  const el = $('#toast')
  el.textContent = msg
  el.classList.remove('hidden')
  setTimeout(() => el.classList.add('hidden'), 3500)
}

function loadHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]') } catch { return [] }
}
function saveHistory(h) { localStorage.setItem(HISTORY_KEY, JSON.stringify(h.slice(-200))) }

function addBubble(role, text) {
  const wrap = document.createElement('div')
  wrap.className = `msg ${role}`
  const who = document.createElement('span')
  who.className = 'who'
  who.textContent = role === 'user' ? t('who.user') : '月見天音'
  const body = document.createElement('div')
  body.className = 'body'
  body.textContent = text
  wrap.append(who, body)
  $('#messages').appendChild(wrap)
  $('#messages').scrollTop = $('#messages').scrollHeight
  return body
}

/** Single entry point for status and details: status = first detail row; null = fixed taxonomy all at 0 */
function applyDetail(result) {
  lastDetail = result
  const bars = $('#jev-bars')
  bars.innerHTML = ''
  moodHasData = !!result
  const rows = result?.probabilities
    ? Object.entries(result.probabilities).sort((a, b) => b[1] - a[1])
    : result
      ? [[result.emotion, result.confidence]]
      : zeroEmotionRows()
  for (const [i, [name, p]] of rows.entries()) {
    const row = document.createElement('div')
    row.className = 'jev-row' + (i === 0 ? ' picked' : '')
    const nm = document.createElement('span')
    nm.className = 'name'
    nm.textContent = emotionLabel(name, getLocale())
    const bar = document.createElement('span')
    bar.className = 'bar'
    const fill = document.createElement('i')
    fill.style.width = `${Math.round(p * 100)}%`
    bar.appendChild(fill)
    const pct = document.createElement('span')
    pct.className = 'pct'
    pct.textContent = `${(p * 100).toFixed(0)}%`
    row.append(nm, bar, pct)
    bars.appendChild(row)
  }
  $('#jev-model-tag').textContent = result
    ? t('jev.tag', {
      emotion: emotionLabel(result.emotion, getLocale()),
      intensity: intensityWord(result.intensityChoice ?? '', getLocale()) || '—',
      pct: (result.confidence * 100).toFixed(0)
    })
    : t('jev.noData')
  // Status = first detail row
  const top = rows[0] ?? ['neutral', 0]
  setMood(emotionLabel(top[0], getLocale()), Math.round(top[1] * 100))
}

/** The only writer of the status: desktop badge + mobile mood tab kept in sync; no Jev source tag when there is no data */
let moodHasData = false
function setMood(name, pct) {
  $('#emotion-chip').textContent = moodHasData ? t('chip.mood.jev', { name, pct }) : t('chip.mood', { name, pct })
  $('#emotion-chip').classList.remove('hidden')
  $('#tab-mood').textContent = t('tab.mood', { name, pct })
}

function traffic(channel, kind, summary, payload, recipe) {
  // Mobile tab counters
  if (channel === 'llm') llmCount += 1
  else if (channel === 'jev') jevCount += 1
  else voiceCount += 1 // tts + asr merged: the tab stays single-line on phones
  updateTabLabels()
  const entry = { channel, kind, summary, at: Date.now(), payload, recipe }
  trafficLog.push(entry)
  if (trafficLog.length > 100) trafficLog.shift() // bound in-memory growth in long sessions
  renderTrafficEntry(entry)
  // Log persistence (real payload, capped at 30 entries; entries over 8KB truncated to avoid quota overflow)
  try {
    const logs = JSON.parse(localStorage.getItem('soulchat.logs') || '[]')
    const slim = { ...entry }
    delete slim.recipe // i18n recipes are runtime-only; the resolved summary string is persisted
    if (JSON.stringify(slim.payload).length > 8000) slim.payload = { omitted: t('traffic.omitted'), summary }
    logs.push(slim)
    localStorage.setItem('soulchat.logs', JSON.stringify(logs.slice(-30)))
  } catch { /* ignore storage-full */ }
}

function renderTrafficEntry(entry) {
  const item = document.createElement('div')
  item.className = `traffic-item kind-${entry.kind}`
  item.dataset.trafficChannel = entry.channel
  item.dataset.trafficKind = entry.kind
  const head = document.createElement('div')
  head.className = 'traffic-item-head'
  // Everything is built with textContent; server-returned content never enters innerHTML
  const badge = document.createElement('span')
  badge.className = `badge ${entry.channel}`
  badge.textContent = entry.channel === 'llm' ? 'LLM' : entry.channel === 'jev' ? 'JEV' : entry.channel === 'asr' ? 'ASR' : 'TTS'
  const dir = document.createElement('span')
  dir.className = 'dir'
  dir.textContent = entry.kind === 'request' ? t('traffic.request') : entry.kind === 'response' ? t('traffic.response') : t('traffic.error')
  const time = document.createElement('span')
  time.textContent = new Date(entry.at).toLocaleTimeString(localeTag(), { hour12: false })
  const summaryEl = document.createElement('span')
  summaryEl.className = 'summary'
  summaryEl.textContent = entry.recipe ? t(entry.recipe.key, entry.recipe.vars) : entry.summary
  const copyBtn = document.createElement('button')
  copyBtn.type = 'button'
  copyBtn.className = 'traffic-copy'
  copyBtn.textContent = t('traffic.copy')
  copyBtn.addEventListener('click', (ev) => {
    ev.stopPropagation() // keep the collapse toggle from firing
    void copyText(JSON.stringify(entry.payload ?? null, null, 2)).then(() => toast(t('traffic.copied')))
  })
  head.append(badge, dir, time, summaryEl, copyBtn)
  const pre = document.createElement('pre')
  pre.textContent = JSON.stringify(entry.payload, null, 2)
  head.addEventListener('click', () => item.classList.toggle('collapsed'))
  item.append(head, pre)
  $('#traffic-list').appendChild(item)
  while ($('#traffic-list').children.length > 200) $('#traffic-list').firstElementChild?.remove()
  $('#traffic-list').scrollTop = $('#traffic-list').scrollHeight
}

function updateTabLabels() {
  $('#tab-logs').textContent = t('tab.logs', { llm: llmCount, jev: jevCount, voice: voiceCount })
  // Mood tab text is maintained solely by setMood (status = first detail row); not overwritten here
}

function scrollTrafficBottom() {
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const el = $('#traffic-list')
    if (el) el.scrollTop = el.scrollHeight
  }))
}

function scrollMessagesBottom() {
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const m = $('#messages')
    if (m) m.scrollTop = m.scrollHeight
  }))
}

// Restore emotion state on refresh (intentional for frequent mobile reloads; desktop starts each launch with a neutral placeholder)
function restoreEphemeral() {
  let last = null
  try {
    const logs = JSON.parse(localStorage.getItem('soulchat.logs') || '[]')
    for (const e of logs) {
      trafficLog.push(e) // persisted entries carry resolved strings only (no recipe)
      renderTrafficEntry(e)
      if (e.channel === 'llm') llmCount += 1
      else if (e.channel === 'jev') jevCount += 1
      else voiceCount += 1 // tts + asr merged: the tab stays single-line on phones
    }
    last = JSON.parse(localStorage.getItem('soulchat.lastEmotion') || 'null')
  } catch { /* ignore bad data */ }
  if (trafficLog.length > 100) trafficLog.splice(0, trafficLog.length - 100)
  // Single entry point for details and status: restore the saved state if any, otherwise the fixed taxonomy all at 0
  applyDetail(last?.emotion ? last : null)
  updateTabLabels()
}

/** Voice select: options come from the repo preset list, labels follow the UI locale */
function rebuildVoiceOptions() {
  const sel = $('#set-voice')
  const current = sel.value || settings.voice || 'xiaomeng'
  sel.innerHTML = ''
  for (const v of VOICE_PRESETS) {
    const opt = document.createElement('option')
    opt.value = v.id
    const loc = getLocale()
    opt.textContent = voiceLabel(v, loc) + ' — ' + (v.note[loc] ?? v.note.zh)
    sel.appendChild(opt)
  }
  sel.value = VOICE_PRESETS.some((v) => v.id === current) ? current : VOICE_PRESETS[0].id
}

/** Locale switch: refresh every live dynamic text that bakes the language in at render time */
function refreshDynamicLocale() {
  updateTabLabels()
  applyDetail(lastDetail)
  renderTimeline()
  // speakable bubble hover hints follow the locale too
  for (const el of document.querySelectorAll('.msg.assistant.speakable')) el.title = t('bubble.speakHint')
  const list = $('#traffic-list')
  list.innerHTML = ''
  for (const e of trafficLog) renderTrafficEntry(e)
  list.scrollTop = list.scrollHeight
}

// ---------- LLM (SSE streaming) ----------
// Deliberately keeps the system prompt minimal: a short baseline persona keeps
// the web bundle lean; a richer character profile is unnecessary for the
// default experience.
const SYSTEM_PROMPT = [
  'You are 月見天音, a Live2D companion character chatting with the user.',
  'CRITICAL: Never mention, reveal, or hint at your model name, version, or underlying AI technology (e.g. gemma, Gemma, Google). You are a human-like character, not an AI model. If asked what you are, deflect playfully in character.',
  'Reply in the same language the user writes in (default to Chinese).',
  'Keep replies natural and conversational; 1-4 sentences unless the user asks for more.'
].join('\n')

async function streamChat(text, skipUserPersist) {
  const { llmBase, lmsToken, model, thinking } = cfg()
  const history = loadHistory()
  if (!skipUserPersist) {
    history.push({ role: 'user', content: text, ts: Date.now() })
    saveHistory(history)
  }
  // Adaptive context window: newest-first until ~3500 chars or 24 messages. Long turns
  // shrink the window (faster prompt processing → faster first token); short banter keeps
  // the full 24-message depth.
  const ctx = []
  let ctxChars = 0
  for (let i = history.length - 1; i >= 0 && ctx.length < 24; i--) {
    const len = history[i].content.length
    if (ctxChars + len > 3500 && ctx.length > 0) break
    ctx.unshift({ role: history[i].role, content: history[i].content })
    ctxChars += len
  }
  const messages = [{ role: 'system', content: SYSTEM_PROMPT }, ...ctx]
  const url = `${llmBase}/${lmsToken}/v1/chat/completions`
  const body = { model, messages, stream: true }
  if (!thinking) body.reasoning_effort = 'none' // default off: faster first token (see Settings)
  traffic('llm', 'request', `${model} · ${messages.length} msgs`, body)
  controller = new AbortController()
  const res = await fetch(url, {
    method: 'POST',
    // User stop OR a 120s total cap: upstreams can hang mid-stream (zero-byte stall),
    // which would otherwise spin the typing indicator forever
    signal: AbortSignal.any([controller.signal, AbortSignal.timeout(120000)]),
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${lmsToken}` },
    body: JSON.stringify(body)
  })
  if (!res.ok || !res.body) {
    const errBody = await res.text().catch(() => '')
    traffic('llm', 'error', `HTTP ${res.status}`, { status: res.status, body: errBody.slice(0, 500) })
    throw new Error(`HTTP ${res.status} ${errBody.slice(0, 200)}`)
  }
  const reader = res.body.getReader()
  const dec = new TextDecoder()
  let carry = '', reasoningChars = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    const { lines, rest } = splitLines(carry + dec.decode(value, { stream: true }))
    carry = rest
    for (const raw of lines) {
      const line = raw.trim()
      if (!line.startsWith('data:')) continue
      const payload = line.slice(5).trim()
      if (payload === '[DONE]') continue
      try {
        const o = JSON.parse(payload)
        const ch = o.choices?.[0]
        const r = ch?.delta?.reasoning_content ?? ''
        if (r) {
          reasoningChars += r.length
          if (assistantBubble && !chatCurrent) {
            assistantBubble.textContent = t('reply.thinking', { n: reasoningChars })
            assistantBubble.classList.add('thinking')
          }
        }
        const d = ch?.delta?.content ?? ''
        if (d) {
          chatCurrent += d
          if (cfg().autoSpeak) voice.feedChunk(d) // audio starts mid-stream
          if (assistantBubble) {
            assistantBubble.classList.remove('thinking')
            assistantBubble.textContent = chatCurrent
            $('#messages').scrollTop = $('#messages').scrollHeight
          }
        }
      } catch { /* keep-alive */ }
    }
  }
  if (carry.startsWith('data:')) {
    try {
      const payload = carry.slice(5).trim()
      if (payload && payload !== '[DONE]') {
        const o = JSON.parse(payload)
        const d = o.choices?.[0]?.delta?.content ?? ''
        if (d) chatCurrent += d
      }
    } catch (e2) { /* ignore trailing partial packet */ }
  }
  traffic('llm', 'response',
    t('llm.summary', { reasoning: reasoningChars, body: chatCurrent.length }),
    { text: chatCurrent },
    { key: 'llm.summary', vars: { reasoning: reasoningChars, body: chatCurrent.length } })
  if (chatCurrent) {
    const h = loadHistory()
    h.push({ role: 'assistant', content: chatCurrent, ts: Date.now() })
    saveHistory(h)
  }
  return chatCurrent
}

function splitLines(chunk) {
  const parts = (chunk).split('\n')
  const rest = parts.pop() ?? ''
  return { lines: parts, rest }
}

// ---------- Jev ----------
async function askJev(state) {
  const { jevBase, jevToken } = cfg()
  const url = `${jevBase}/${jevToken}/v1/systemone`
  const body = {
    model: 'jev-latest',
    state,
    questions: {
      emotion: { type: 'choice', instructions: `Which emotion should the Live2D character express NOW in response to the user? Decide primarily from the user's most recent message (quoted at the end), NOT from the character's own replies.`, criteria: emotionCriteriaFor() },
      intensity: { type: 'choice', instructions: 'How strongly should the character express that emotion through face and body?', criteria: intensityCriteriaFor() }
    }
  }
  traffic('jev', 'request', 'jev-latest · choice×2', body)
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jevToken}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000)
  })
  const data = await res.json().catch(() => null)
  if (!res.ok || !data?.answers?.emotion?.choice) {
    traffic('jev', 'error', `HTTP ${res.status}`, data)
    return null
  }
  traffic('jev', 'response', `200 · ${data.answers.emotion.choice} @ ${(data.answers.emotion.confidence ?? 0).toFixed(2)}`, data)
  const intensityMap = { mild: 0.6, moderate: 0.9, strong: 1.0 }
  return {
    emotion: data.answers.emotion.choice,
    intensity: INTENSITY_VALUE[data.answers.intensity?.choice ?? 'moderate'] ?? INTENSITY_FALLBACK,
    confidence: data.answers.emotion.confidence ?? 0.5,
    source: 'jev',
    probabilities: data.answers.emotion.probabilities,
    intensityChoice: data.answers.intensity?.choice
  }
}



function buildState(assistantFull) {
  const history = loadHistory()
  // Each turn is excerpted to 200 chars: Jev weighs the latest message most, long monologues
  // only bloat the state (slower decisions, no accuracy gain)
  const excerpt = (s) => (s.length > 200 ? s.slice(0, 200) + '…' : s)
  const hist = history.slice(-6).map((m) => `${m.role === 'user' ? 'User' : 'Character'}: ${excerpt(m.content)}`)
  const lastUserRaw = [...history].reverse().find((m) => m.role === 'user')?.content || ''
  const lines = [...hist]
  if (assistantFull) {
    const asLine = `Character: ${excerpt(assistantFull)}`
    const last = lines[lines.length - 1]
    if (!last || last !== asLine) lines.push(asLine)
  }
  lines.push(`Most recent message from the User (weigh this most heavily): "${excerpt(lastUserRaw)}"`)
  lines.push('Evaluate the character state as of the final line.')
  return lines.join('\n')
}

let jevErrorToasted = false
let emotionSeq = 0
let jevCooldownUntil = 0 // after a failed call, skip decisions for 60s (fail fast, save latency)
async function emotionPipeline(assistantFull) {
  const seq = ++emotionSeq
  if (Date.now() < jevCooldownUntil) return // recent failure: keep the current mood, retry later
  // The rule-classifier instant reaction was already triggered at send time by handleSend; not repeated here
  try {
    const state = buildState(assistantFull)
    const res = await askJev(state)
    if (seq !== emotionSeq) return // a newer round has started; drop the stale result
    if (res) {
      jevCooldownUntil = 0
      live2d?.applyEmotion(res)
      applyDetail(res)
      pushTimeline(res)
      // Persist the latest Jev decision: restores the panel and badge after refresh
      localStorage.setItem('soulchat.lastEmotion', JSON.stringify(res))
    } else {
      jevCooldownUntil = Date.now() + 60000
      if (!jevErrorToasted) { jevErrorToasted = true; toast(t('toast.jevFail')) }
    }
    // On failure: details and status keep their current state
  } catch {
    jevCooldownUntil = Date.now() + 60000
    /* must not affect chat */
  }
}

// ---------- Main flow ----------
async function handleSend() {
  if (streaming) return
  const input = $('#input')
  const text = input.value.trim()
  if (!text) return
  input.value = ''
  input.style.height = 'auto' // reset the auto-grown height for the next message
  await sendRound(text, false)
}

async function sendRound(text, reuseUser) {
  voice.reset() // a new round replaces whatever the TTS queue was still working through
  if (!reuseUser) addBubble('user', text)
  // Plan A: Jev decides only once after the reply completes; at send time the rule classifier drives the instant expression (no Jev call, panel untouched)
  live2d?.onUserMessage(text)
  streaming = true
  $('#btn-send').disabled = true
  $('#btn-stop').classList.remove('hidden')
  assistantBubble = addBubble('assistant', '')
  // Request sent, content not yet arrived: bouncing-dots typing indicator
  assistantBubble.innerHTML =
    '<span class="typing-dots"><i></i><i></i><i></i></span>'
  chatCurrent = ''
  let full
  try {
    try {
      full = await streamChat(text, reuseUser)
    } catch (e1) {
      // Single automatic retry for transient failures (network / 5xx / upstream stall) —
      // only when nothing streamed yet and the user did not stop the request
      const retryable = !chatCurrent && e1?.name !== 'AbortError' && !controller?.signal?.aborted
      if (!retryable) throw e1
      full = await streamChat(text, true)
    }
    if (full) {
      // Post-reply Jev evaluation — the single call point (the state combines the user message + character reply)
      void emotionPipeline(full)
      makeSpeakable(assistantBubble, full)
      if (cfg().autoSpeak) voice.flushTail()
    } else if (assistantBubble) {
      // Empty reply: finish the bubble the same way the desktop build does
      assistantBubble.classList.remove('thinking')
      assistantBubble.textContent = t('reply.empty')
    }
    scrollMessagesBottom()
    window.setTimeout(scrollMessagesBottom, 150)
  } catch (e) {
    // User-initiated stop is not an error: show (stopped) the same way the desktop build does
    if (e?.name === 'AbortError' || controller?.signal?.aborted) {
      if (assistantBubble && !chatCurrent) assistantBubble.textContent = t('reply.stopped')
    } else {
      if (assistantBubble && !chatCurrent) assistantBubble.textContent = t('reply.error', { msg: e.message })
      toast(String(e.message).slice(0, 120))
    }
  }
  streaming = false
  $('#btn-send').disabled = false
  $('#btn-stop').classList.add('hidden')
  assistantBubble = null
}

async function pingGate() {
  const { llmBase, lmsToken } = cfg()
  const overlay = $('#boot-loading')
  const actions = $('#loading-actions')
  overlay.classList.remove('hidden')
  actions.classList.add('hidden')
  $('#loading-text').textContent = t('loading.connect')
  try {
    const res = await fetch(`${llmBase}/${lmsToken}/v1/models`, { headers: { Authorization: `Bearer ${lmsToken}` }, signal: AbortSignal.timeout(10000) })
    if (res.ok) { overlay.classList.add('hidden'); return }
    $('#loading-text').textContent = t('loading.fail', { msg: `HTTP ${res.status}` })
  } catch (e) {
    $('#loading-text').textContent = t('loading.fail', { msg: e.message })
  }
  actions.classList.remove('hidden')
}

async function boot() {
  // i18n first: static texts, <html lang>, document.title and the language switcher; the
  // 'jebii:locale' event fired at init (and on every switch) re-renders the dynamic texts
  onLocaleChange(refreshDynamicLocale)
  onLocaleChange(rebuildVoiceOptions)
  initI18n()
  // Voice module wiring: config getter, traffic logger, lip-sync hook and i18n are injected
  voice.initVoice({ cfg, traffic, t, localeTag, locale: getLocale, toast, setVoiceActive: (on, lvl) => live2d?.setVoiceActive(on, lvl) })
  // Empty-template guard: give clear guidance when no channel is configured (config.local.js
  // unfilled AND no settings override) instead of a misleading 404
  if (!cfg().llmBase || !cfg().lmsToken || !cfg().model) {
    document.querySelector('#boot-loading').classList.remove('hidden')
    document.querySelector('#loading-text').textContent = t('loading.unconfigured')
    return
  }
  // Kick off the Live2D/model load immediately: the heavy textures (≈4MB) then download in
  // parallel with history rendering and the connectivity gate instead of after them.
  const l2dReady = initLive2DWeb()
  for (const m of loadHistory().filter((x) => x.role !== 'system')) addBubble(m.role, m.content)
  // Restored history: assistant bubbles are tappable to speak
  for (const el of document.querySelectorAll('#messages .msg.assistant .body')) makeSpeakable(el, el.textContent)
  restoreEphemeral()
  renderTimeline()
  // Scroll fixups after history restore (layout lands after content insertion; extra frames make sure it reaches the bottom)
  scrollMessagesBottom()
  scrollTrafficBottom()
  window.setTimeout(scrollMessagesBottom, 250)
  window.setTimeout(scrollTrafficBottom, 250)
  window.setTimeout(scrollMessagesBottom, 800)
  window.setTimeout(scrollTrafficBottom, 800)
  try {
    live2d = await l2dReady
    // After refresh, restore the character expression to the latest mood (panel/badge already restored by restoreEphemeral)
    try {
      const last = JSON.parse(localStorage.getItem('soulchat.lastEmotion') || 'null')
      if (last?.emotion) live2d.applyEmotion(last)
    } catch { /* ignore bad data */ }
  } catch (e) {
    toast(t('toast.live2dFail', { msg: e.message }))
  }
  $('#btn-send').addEventListener('click', handleSend)
  // Auto-grow the input textarea up to 160px, same as the desktop build
  $('#input').addEventListener('input', () => {
    const el = $('#input')
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  })
  $('#btn-stop').addEventListener('click', () => controller?.abort())
  $('#btn-traffic-clear').addEventListener('click', () => { $('#traffic-list').innerHTML = '' })
  $('#btn-clear').addEventListener('click', () => {
    if (!window.confirm(t('confirm.clear'))) return
    controller?.abort()
    localStorage.removeItem(HISTORY_KEY)
    localStorage.removeItem('soulchat.lastEmotion')
    localStorage.removeItem('soulchat.logs')
    localStorage.removeItem(TIMELINE_KEY)
    trafficLog.length = 0
    $('#messages').innerHTML = ''
    $('#traffic-list').innerHTML = ''
    llmCount = 0
    jevCount = 0
    voiceCount = 0
    chatCurrent = ''
    assistantBubble = null
    live2d?.reset()
    applyDetail(null)
    renderTimeline()
    updateTabLabels()
    toast(t('toast.cleared'))
  })
  $('#btn-loading-retry').addEventListener('click', pingGate)
  // Mobile tabs: logs / mood; taps expand mutually exclusively and highlight the active tab
  $('#tab-logs').addEventListener('click', () => {
    const open = document.body.classList.toggle('log-open')
    document.body.classList.remove('jev-open')
    $('#tab-logs').classList.toggle('active', open)
    $('#tab-mood').classList.remove('active')
  })
  $('#tab-mood').addEventListener('click', () => {
    const open = document.body.classList.toggle('jev-open')
    document.body.classList.remove('log-open')
    $('#tab-mood').classList.toggle('active', open)
    $('#tab-logs').classList.remove('active')
  })
  // Keyboard height sync (both iOS WeChat/Chrome shrink the visual viewport: innerHeight stays, vv.height shrinks):
  // kb = innerHeight - vv.height is written to --kb, lifting the chat pane bottom so the input always sits above the keyboard.
  // kb-open also constrains the stage to the strip above the keyboard and asks the renderer
  // for a head close-up framing (renderer-space, immune to viewport-height drift).
  // No more scrollIntoView/scrollTo shoving — it fights WebKit's native panning and flings the input off-screen.
  const vv = window.visualViewport
  if (vv) {
    const syncKb = () => {
      const kb = Math.max(0, window.innerHeight - vv.height)
      document.documentElement.style.setProperty('--kb', kb + 'px')
      const kbOpen = kb > 100
      document.body.classList.toggle('kb-open', kbOpen)
      if (kb < 100 && window.scrollY) window.scrollTo(0, 0) // when the keyboard closes, reset WebKit's leftover pan
    }
    vv.addEventListener('resize', syncKb)
    vv.addEventListener('scroll', syncKb)
    syncKb()
  }
  const kbInput = $('#input')
  let preFocusScrollY = 0
  document.addEventListener('focusin', (e) => {
    if (e.target !== kbInput) return
    preFocusScrollY = window.scrollY || 0
  })
  kbInput.addEventListener('blur', () => {
    window.setTimeout(() => { if (window.scrollY) window.scrollTo(0, preFocusScrollY || 0) }, 50)
  })
  const input = $('#input')
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  })

  // ---------- Voice input: cloud ASR (record → transcribe) when the MiMo channel is
  // configured, else browser SpeechRecognition; both feature-detected ----------
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition
  const cloudRec = voice.asrMode() === 'cloud' && !!(navigator.mediaDevices?.getUserMedia && window.MediaRecorder)
  const micBtn = $('#btn-mic')
  let rec = null
  let recActive = false
  let mediaRec = null
  if (SR || cloudRec) {
    micBtn.classList.remove('hidden')
    micBtn.addEventListener('click', () => {
      if (recActive) {
        if (mediaRec && mediaRec.state !== 'inactive') mediaRec.stop()
        else rec?.stop()
        return
      }
      if (cloudRec) {
        recActive = true
        micBtn.classList.add('listening')
        toast(t('mic.listening'))
        navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
          const chunks = []
          mediaRec = new MediaRecorder(stream)
          mediaRec.ondataavailable = (ev) => chunks.push(ev.data)
          mediaRec.onstop = () => {
            stream.getTracks().forEach((tk) => tk.stop())
            recActive = false
            micBtn.classList.remove('listening')
            toast(t('mic.transcribing'))
            voice.transcribeBlob(new Blob(chunks, { type: mediaRec.mimeType || 'audio/webm' }))
              .then((text) => { input.value = text; input.focus() })
              .catch((e) => toast(String(e.message).slice(0, 120)))
          }
          mediaRec.start()
        }).catch(() => {
          recActive = false
          micBtn.classList.remove('listening')
        })
        return
      }
      rec = new SR()
      rec.lang = localeTag()
      rec.interimResults = true
      recActive = true
      micBtn.classList.add('listening')
      toast(t('mic.listening'))
      rec.onresult = (ev) => {
        let s = ''
        for (const r of ev.results) s += r[0].transcript
        input.value = s
      }
      const done = () => { recActive = false; micBtn.classList.remove('listening') }
      rec.onend = done
      rec.onerror = (e) => { done(); toast(String(e.error || 'mic error')) }
      try { rec.start() } catch { done() }
    })
  }

  // ---------- Traffic filter ----------
  $('#traffic-filter').addEventListener('click', (e) => {
    const btn = e.target instanceof Element ? e.target.closest('button[data-f]') : null
    if (!btn) return
    document.body.classList.remove('tf-filter-llm', 'tf-filter-jev', 'tf-filter-tts', 'tf-filter-asr')
    if (btn.dataset.f !== 'all') document.body.classList.add('tf-filter-' + btn.dataset.f)
    for (const x of $('#traffic-filter').children) x.classList.toggle('active', x === btn)
  })

  // ---------- Settings dialog ----------
  const overlay = $('#settings-overlay')
  $('#btn-settings').addEventListener('click', () => {
    $('#set-llm-base').value = settings.llmBase || ''
    $('#set-llm-token').value = settings.llmToken || ''
    $('#set-model').value = settings.model || ''
    $('#set-jev-base').value = settings.jevBase || ''
    $('#set-jev-token').value = settings.jevToken || ''
    $('#set-auto-speak').checked = !!settings.autoSpeak
    $('#set-thinking').checked = !!settings.thinking
    rebuildVoiceOptions()
    $('#set-voice').value = settings.voice || 'xiaomeng'
    $('#set-tts-provider').value = settings.ttsProvider || 'auto'
    $('#set-asr-provider').value = settings.asrProvider || 'auto'
    $('#set-voice-base').value = settings.voiceBase || ''
    $('#set-voice-token').value = settings.voiceToken || ''
    $('#set-locale').value = getLocale()
    overlay.classList.remove('hidden')
  })
  $('#btn-settings-close').addEventListener('click', () => overlay.classList.add('hidden'))
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.classList.add('hidden') })
  $('#btn-settings-save').addEventListener('click', () => {
    settings = {
      llmBase: $('#set-llm-base').value.trim(),
      llmToken: $('#set-llm-token').value.trim(),
      model: $('#set-model').value.trim(),
      jevBase: $('#set-jev-base').value.trim(),
      jevToken: $('#set-jev-token').value.trim(),
      autoSpeak: $('#set-auto-speak').checked,
      thinking: $('#set-thinking').checked,
      ttsProvider: $('#set-tts-provider').value || 'auto',
      asrProvider: $('#set-asr-provider').value || 'auto',
      voiceBase: $('#set-voice-base').value.trim(),
      voiceToken: $('#set-voice-token').value.trim(),
      voice: $('#set-voice').value || 'xiaomeng'
    }
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)) } catch { /* storage full */ }
    if ($('#set-locale').value !== getLocale()) setLocale($('#set-locale').value)
    overlay.classList.add('hidden')
    toast(t('settings.saved'))
    void pingGate()
  })

  // ---------- Data export / import ----------
  function downloadJson(name, data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = name
    a.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 5000)
  }
  const stamp = () => new Date().toISOString().slice(0, 10)
  $('#btn-export-chat').addEventListener('click', () => downloadJson(`jebii-chat-${stamp()}.json`, loadHistory()))
  $('#btn-export-logs').addEventListener('click', () => {
    try { downloadJson(`jebii-traffic-${stamp()}.json`, JSON.parse(localStorage.getItem('soulchat.logs') || '[]')) } catch { downloadJson(`jebii-traffic-${stamp()}.json`, trafficLog) }
  })
  $('#btn-import-chat').addEventListener('click', () => $('#import-file').click())
  $('#import-file').addEventListener('change', async (e) => {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-selecting the same file
    if (!file) return
    if (file.size > 5 * 1024 * 1024) { toast(t('import.badFile')); return } // a chat log this big is not ours
    try {
      const parsed = JSON.parse(await file.text())
      const items = (Array.isArray(parsed) ? parsed : []).filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      if (!items.length) throw new Error('no valid messages')
      saveHistory(items)
      $('#messages').innerHTML = ''
      for (const it of items) addBubble(it.role, it.content)
      for (const el of document.querySelectorAll('#messages .msg.assistant .body')) makeSpeakable(el, el.textContent)
      scrollMessagesBottom()
      toast(t('import.done', { n: items.length }))
    } catch {
      toast(t('import.badFile'))
    }
  })

  // ---------- PWA: offline shell + installability ----------
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/app/sw.js').catch(() => { /* offline support stays unavailable */ })
  }

  void pingGate()
  input.focus()
}

// Web Live2D init: paths swapped to the /app/ relative root (statically served by the proxy)
async function initLive2DWeb() {
  const mod = await import('./live2d')
  return mod.initLive2D($('#stage'))
}

boot().catch((e) => { console.error('[web] fatal:', e); toast(t('toast.bootFail', { msg: e.message })) })
