/**
 * Voice module: multi-provider TTS with a streaming sentence queue, real-audio
 * lip sync, and multi-provider ASR, plus browser-native fallbacks.
 *
 * Providers are a registry: each declares whether it serves TTS and/or ASR and
 * how. The character VOICES live in the repository (voices.js) and are
 * provider-agnostic — every adapter renders the same cast (via a design prompt,
 * a mapped voice_id, …), so switching provider never changes who the character
 * sounds like, and the voice list never shows provider-locked entries.
 *
 * Deep-module interface:
 * - initVoice(deps)      inject cfg/traffic/i18n/locale/lip-sync/toast hooks
 * - ttsProvider()        resolved TTS provider id ('mimo'|'minimax'|'browser')
 * - asrMode()            resolved ASR mode ('cloud'|'browser')
 * - speak(text)          one-shot playback of a complete text (manual button)
 * - feedChunk(delta)     stream hook: LLM content deltas → sentence queue,
 *                        audio starts mid-stream (pipelined prefetch)
 * - flushTail()          end-of-reply hook: speak the still-buffered tail
 * - reset()              drop the queue (new round / clear)
 * - transcribeBlob(blob) cloud ASR for a recorded audio blob
 */

import { VOICES, voiceLabel } from './voices.js'

export const VOICE_PRESETS = VOICES
export { voiceLabel }

/** Voice preset lookup: unknown stored ids fall back to the first preset. */
export function voiceById(id) {
  return VOICES.find((v) => v.id === id) ?? VOICES[0]
}

let cfgGet = () => ({})
let trafficLog = () => {}
let setVoiceActive = () => {}
let toastHook = null
let localeTagOf = () => 'zh-CN'
let localeOf = () => 'zh'

export function initVoice(deps) {
  cfgGet = deps.cfg
  trafficLog = deps.traffic
  setVoiceActive = deps.setVoiceActive
  toastHook = deps.toast
  localeTagOf = deps.localeTag
  localeOf = deps.locale
}

const cloudConfigured = () => {
  const c = cfgGet()
  return !!(c.mimoBase && c.mimoToken)
}
/** Custom OpenAI-compatible voice endpoint (user-configured; TTS/ASR share it). */
const customConfigured = () => {
  const c = cfgGet()
  return !!(c.voiceBase && c.voiceToken)
}

const minimaxConfigured = () => {
  const c = cfgGet()
  return !!(c.minimaxBase && c.minimaxToken)
}

/** Resolved TTS provider: explicit setting, else auto (cloud when channel exists). */
export function ttsProvider() {
  const pref = cfgGet().ttsProvider || 'auto'
  if (pref === 'browser') return 'browser'
  if (pref === 'custom') return customConfigured() ? 'custom' : 'browser'
  if (pref === 'minimax') return minimaxConfigured() ? 'minimax' : 'browser'
  if (pref === 'mimo') return cloudConfigured() ? 'mimo' : 'browser'
  return cloudConfigured() ? 'mimo' : 'browser' // auto
}

/** Resolved ASR mode: 'cloud' (record → blob → provider) or 'browser' (live SR). */
export function asrMode() {
  const pref = cfgGet().asrProvider || 'auto'
  if (pref === 'browser') return 'browser'
  if (pref === 'custom') return customConfigured() ? 'cloud' : 'browser'
  if (pref === 'mimo') return cloudConfigured() ? 'cloud' : 'browser'
  return cloudConfigured() ? 'cloud' : 'browser' // auto
}

export const voiceAvailable = () => cloudConfigured() || minimaxConfigured()

// ---------- Provider adapters (TTS) ----------
// Each adapter receives (text, voice preset) and returns a play() closure.
// Provider ids are internal; the UI shows provider names and the TTS/ASR roles.

async function ttsMimo(text, voice) {
  const { mimoBase, mimoToken } = cfgGet()
  // Pinned to the zh wording: the design prompt describes timbre, and the SAME
  // character must sound identical whichever UI locale is active.
  const desc = voice.design.zh
  const body = {
    model: 'mimo-v2.5-tts-voicedesign',
    messages: [
      { role: 'user', content: desc },
      { role: 'assistant', content: text }
    ],
    audio: { format: 'mp3' }
  }
  trafficLog('tts', 'request', `mimo · ${voice.label.zh} · ${text.length} chars`, { provider: 'mimo', voice: voice.id, input: text })
  const res = await fetch(`${mimoBase}/${mimoToken}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${mimoToken}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120000)
  })
  const data = await res.json().catch(() => null)
  const b64 = data?.choices?.[0]?.message?.audio?.data
  trafficLog('tts', 'response', b64 ? `200 · mp3 ${(b64.length / 1024) | 0}KB` : `HTTP ${res.status}`, { provider: 'mimo', audioKB: b64 ? (b64.length / 1024) | 0 : 0 })
  if (!res.ok || !b64) throw new Error(`tts HTTP ${res.status}`)
  return () => playMp3Bytes(b64ToBytes(b64))
}

// MiniMax T2A v2: repo voice presets map onto the provider's system voice_ids
// (the mapping IS the adapter's job — presets stay provider-neutral).
const MINIMAX_MODEL = 'speech-02-hd'
const MINIMAX_VOICE_MAP = {
  xiaomeng: 'female-shaonv', // 少女
  qingyu: 'female-yujie', // 御姐（closest gentle-mature match）
  mufan: 'male-qn-qingse' // 青年男声
}

async function ttsMinimax(text, voice) {
  const { minimaxBase, minimaxToken } = cfgGet()
  const body = {
    model: MINIMAX_MODEL,
    text,
    stream: false,
    voice_setting: {
      voice_id: MINIMAX_VOICE_MAP[voice.id] ?? MINIMAX_VOICE_MAP.xiaomeng,
      speed: 1,
      vol: 1,
      pitch: 0
    },
    audio_setting: { format: 'mp3', channel: 1 }
  }
  trafficLog('tts', 'request', `minimax · ${voice.label.zh} · ${text.length} chars`, { provider: 'minimax', voice: voice.id, input: text })
  const res = await fetch(`${minimaxBase}/${minimaxToken}/v1/t2a_v2`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${minimaxToken}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120000)
  })
  const data = await res.json().catch(() => null)
  // T2A v2 returns the audio hex-encoded in data.audio
  const hex = data?.data?.audio
  const bytes = hex ? hexToBytes(hex) : null
  trafficLog('tts', 'response', bytes ? `200 · mp3 ${(bytes.length / 1024) | 0}KB` : `HTTP ${res.status}`, { provider: 'minimax', audioKB: bytes ? (bytes.length / 1024) | 0 : 0 })
  if (!res.ok || !bytes) throw new Error(`tts HTTP ${res.status}`)
  return () => playMp3Bytes(bytes)
}

// Custom OpenAI-compatible endpoint (MiMo-style protocol: chat/completions with an
// assistant message; base64 audio in choices[0].message.audio.data). The base URL
// is normalized to end at /v1; the token rides the Authorization header.
async function ttsCustom(text, voice) {
  const { voiceBase, voiceToken } = cfgGet()
  const base = voiceBase.replace(/\/$/, '').replace(/\/v1$/, '')
  const body = {
    model: 'tts-1',
    messages: [
      { role: 'user', content: voice.design.zh },
      { role: 'assistant', content: text }
    ],
    audio: { format: 'mp3' }
  }
  trafficLog('tts', 'request', `custom · ${voice.label.zh} · ${text.length} chars`, { provider: 'custom', voice: voice.id, input: text })
  const res = await fetch(base + '/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${voiceToken}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120000)
  })
  const data = await res.json().catch(() => null)
  const b64 = data?.choices?.[0]?.message?.audio?.data
  trafficLog('tts', 'response', b64 ? `200 · mp3 ${(b64.length / 1024) | 0}KB` : `HTTP ${res.status}`, { provider: 'custom', audioKB: b64 ? (b64.length / 1024) | 0 : 0 })
  if (!res.ok || !b64) throw new Error(`tts HTTP ${res.status}`)
  return () => playMp3Bytes(b64ToBytes(b64))
}
const TTS_ADAPTERS = {
  mimo: ttsMimo,
  minimax: ttsMinimax,
  custom: ttsCustom
}

// ---------- Playback (AudioContext + lip-sync level tap) ----------
let audioCtx = null

function b64ToBytes(b64) {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
}

function hexToBytes(hex) {
  const out = new Uint8Array(hex.length >> 1)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16)
  return out
}

async function playMp3Bytes(bytes) {
  audioCtx = audioCtx || new AudioContext()
  if (audioCtx.state === 'suspended') await audioCtx.resume().catch(() => {})
  const buf = await audioCtx.decodeAudioData(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength))
  const src = audioCtx.createBufferSource()
  src.buffer = buf
  // Real audio levels → lip sync: RMS of the time-domain signal
  const analyser = audioCtx.createAnalyser()
  analyser.fftSize = 512
  const samples = new Float32Array(analyser.fftSize)
  const getLevel = () => {
    analyser.getFloatTimeDomainData(samples)
    let sum = 0
    for (const v of samples) sum += v * v
    return Math.min(1, Math.sqrt(sum / samples.length) * 4)
  }
  src.connect(analyser)
  analyser.connect(audioCtx.destination)
  setVoiceActive(true, getLevel)
  try {
    await new Promise((resolve) => { src.onended = resolve; src.start() })
  } finally {
    setVoiceActive(false)
  }
}

function browserSpeak(text) {
  if (!('speechSynthesis' in window)) return
  const synth = window.speechSynthesis
  synth.cancel()
  const u = new SpeechSynthesisUtterance(text)
  u.lang = localeTagOf()
  const v = synth.getVoices().find((x) => x.lang && x.lang.toLowerCase().startsWith(localeOf()))
  if (v) u.voice = v
  u.onstart = () => setVoiceActive(true)
  const off = () => setVoiceActive(false)
  u.onend = off
  u.onerror = off
  synth.speak(u)
}

function synthChunk(text) {
  const provider = ttsProvider()
  if (provider === 'browser') return Promise.resolve(() => browserSpeak(text))
  const voice = voiceById(cfgGet().voice)
  return TTS_ADAPTERS[provider](text, voice)
}

/** One-shot speak of a complete text: routed through the queue so it never overlaps
 *  audio that is already playing (single stream at all times). */
export function speak(text) {
  ttsQueue.push(text)
  void pump()
}

// ---------- Streaming sentence queue ----------
let ttsQueue = []
let ttsBusy = false
let buffered = '' // accumulated text since the last emitted chunk
let speaking = false

export const isSpeaking = () => speaking

/**
 * Stream hook: feed a content delta. Complete sentences (comma-aware, >=12 chars at a
 * comma so playback doesn't sound chopped) are queued; the pump plays them pipelined —
 * while a chunk plays, the next chunk's audio is already downloading.
 */
export function feedChunk(delta) {
  buffered += delta
  let acc = ''
  for (const ch of buffered) {
    acc += ch
    if (/[，。！？!?\.\n]/.test(ch)) {
      const strong = /[。！？!?\n]/.test(ch)
      if (strong || acc.trim().length >= 12) {
        const sentence = acc.trim()
        if (sentence.length >= 2) ttsQueue.push(sentence)
        buffered = buffered.slice(acc.length)
        acc = ''
      }
    }
  }
  void pump()
}

/** End-of-reply hook: speak whatever is still buffered. */
export function flushTail() {
  const rest = buffered.trim()
  if (rest.length >= 2) {
    ttsQueue.push(rest)
    buffered = ''
  }
  void pump()
}

/** Drop the queue (new round / clear); the chunk currently playing finishes. */
export function reset() {
  ttsQueue = []
  buffered = ''
}

async function pump() {
  if (ttsBusy) return
  ttsBusy = true
  speaking = true
  try {
    // Pipelined: while a chunk plays, the next chunk's audio is already downloading —
    // no 1-2s fetch gap between sentences.
    const fetchNext = () => (ttsQueue.length ? synthChunk(ttsQueue.shift()) : null)
    let next = fetchNext()
    while (next) {
      let play = null
      try { play = await next } catch { /* one failed chunk must not stop the rest */ }
      next = fetchNext()
      if (play) {
        try { await play() } catch { /* playback failure: skip to the next chunk */ }
      }
    }
  } finally {
    ttsBusy = false
    speaking = false
  }
}

// ---------- Cloud ASR: record → mono 16kHz WAV → transcribe ----------
function bufToBase64(buf) {
  const u = new Uint8Array(buf)
  let s = ''
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000))
  return btoa(s)
}

function encodeWav16(samples, rate) {
  const buf = new ArrayBuffer(44 + samples.length * 2)
  const v = new DataView(buf)
  const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)) }
  w(0, 'RIFF'); v.setUint32(4, 36 + samples.length * 2, true); w(8, 'WAVE'); w(12, 'fmt ')
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true)
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true)
  w(36, 'data'); v.setUint32(40, samples.length * 2, true)
  let o = 44
  for (const s of samples) {
    const x = Math.max(-1, Math.min(1, s))
    v.setInt16(o, x < 0 ? x * 0x8000 : x * 0x7fff, true)
    o += 2
  }
  return buf
}

/** Custom-endpoint ASR (same chat/completions protocol; input_audio content part). */
async function asrCustom(blob) {
  const { voiceBase, voiceToken } = cfgGet()
  const base = voiceBase.replace(/\/$/, '').replace(/\/v1$/, '')
  const raw = await blob.arrayBuffer()
  const decodeCtx = new AudioContext()
  const decoded = await decodeCtx.decodeAudioData(raw)
  decodeCtx.close()
  const off = new OfflineAudioContext(1, Math.max(1, Math.ceil(decoded.duration * 16000)), 16000)
  const src = off.createBufferSource()
  src.buffer = decoded
  src.connect(off.destination)
  src.start()
  const rendered = await off.startRendering()
  const wav = encodeWav16(rendered.getChannelData(0), 16000)
  const b64 = bufToBase64(wav)
  const body = {
    model: 'whisper-1',
    messages: [{ role: 'user', content: [{ type: 'input_audio', input_audio: { data: 'data:audio/wav;base64,' + b64 } }] }],
    asr_options: { language: 'auto' }
  }
  trafficLog('asr', 'request', `custom · ${Math.round(rendered.duration)}s audio`, { provider: 'custom', seconds: Math.round(rendered.duration) })
  const res = await fetch(base + '/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${voiceToken}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120000)
  })
  const data = await res.json().catch(() => null)
  const text = data?.choices?.[0]?.message?.content || ''
  trafficLog('asr', 'response', text ? `200 · ${text.slice(0, 80)}` : `HTTP ${res.status}`, { provider: 'custom', text })
  if (!res.ok || !text) throw new Error(`asr HTTP ${res.status}`)
  return text
}
/** Cloud ASR for a recorded audio blob: routed by the resolved ASR provider. */
export async function transcribeBlob(blob) {
  if (cfgGet().asrProvider === 'custom' && customConfigured()) return asrCustom(blob)
  const { mimoBase, mimoToken } = cfgGet()
  const raw = await blob.arrayBuffer()
  const decodeCtx = new AudioContext()
  const decoded = await decodeCtx.decodeAudioData(raw)
  decodeCtx.close()
  // Downmix to mono 16kHz (ASR accepts wav only; MediaRecorder gives webm/opus)
  const off = new OfflineAudioContext(1, Math.max(1, Math.ceil(decoded.duration * 16000)), 16000)
  const src = off.createBufferSource()
  src.buffer = decoded
  src.connect(off.destination)
  src.start()
  const rendered = await off.startRendering()
  const wav = encodeWav16(rendered.getChannelData(0), 16000)
  const b64 = bufToBase64(wav)
  const body = {
    model: 'mimo-v2.5-asr',
    messages: [{ role: 'user', content: [{ type: 'input_audio', input_audio: { data: 'data:audio/wav;base64,' + b64 } }] }],
    asr_options: { language: 'auto' }
  }
  trafficLog('asr', 'request', `mimo · ${Math.round(rendered.duration)}s audio`, { provider: 'mimo', seconds: Math.round(rendered.duration) })
  const res = await fetch(`${mimoBase}/${mimoToken}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${mimoToken}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120000)
  })
  const data = await res.json().catch(() => null)
  const text = data?.choices?.[0]?.message?.content || ''
  trafficLog('asr', 'response', text ? `200 · ${text.slice(0, 80)}` : `HTTP ${res.status}`, { provider: 'mimo', text })
  if (!res.ok || !text) throw new Error(`asr HTTP ${res.status}`)
  return text
}
