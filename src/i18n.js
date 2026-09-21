// Trilingual UI framework (zh / en / ja).
// zh is the single source of truth: every zh string was lifted verbatim from the previous
// hard-coded copy; en / ja are reviewed translations.
// Detection order: ?lang= URL param (deep-link/test hook) → localStorage 'jebii.locale'
// → navigator.languages order match (zh*→zh, ja*→ja, anything else→en) → zh fallback.

const LOCALES = ['zh', 'en', 'ja']

const STORAGE_KEY = 'jebii.locale'
const LOCALE_EVENT = 'jebii:locale'

export function detectLocale() {
  // URL param first: lets verification runs (and shareable links) pin a language.
  try {
    const q = new URLSearchParams(window.location.search).get('lang')
    if (q && LOCALES.includes(q)) return q
  } catch { /* no location context */ }
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved && LOCALES.includes(saved)) return saved
  } catch { /* storage unavailable */ }
  const list = Array.isArray(navigator.languages) && navigator.languages.length
    ? navigator.languages
    : navigator.language ? [navigator.language] : []
  const first = String(list[0] || '').toLowerCase()
  if (first.startsWith('zh')) return 'zh'
  if (first.startsWith('ja')) return 'ja'
  if (first) return 'en' // any other primary language → English
  return 'zh'
}

let current = detectLocale()

export function getLocale() {
  return current
}

/** Persist the choice, refresh static texts, then notify listeners via 'jebii:locale'. */
export function setLocale(locale) {
  if (!LOCALES.includes(locale)) return
  current = locale
  try { localStorage.setItem(STORAGE_KEY, locale) } catch { /* storage unavailable */ }
  applyLocaleSideEffects()
  window.dispatchEvent(new CustomEvent(LOCALE_EVENT, { detail: { locale } }))
}

/** BCP-47 tag for time formatting (kept hour12:false everywhere → identical numeric shape). */
export function localeTag(locale = current) {
  return { zh: 'zh-CN', en: 'en-GB', ja: 'ja-JP' }[locale] ?? 'zh-CN'
}

/** Dictionary lookup with {name} interpolation; missing locale falls back to zh, then to the key. */
export function t(key, vars) {
  const row = STRINGS[key]
  if (!row) return key
  const s = row[current] ?? row.zh
  if (typeof s !== 'string') return key
  if (!vars) return s
  return s.replace(/\{(\w+)\}/g, (m, name) => (name in vars ? String(vars[name]) : m))
}

export function onLocaleChange(fn) {
  window.addEventListener(LOCALE_EVENT, () => fn(current))
}

/** Apply data-i18n / data-i18n-ph / data-i18n-title / data-i18n-aria to the whole document. */
export function applyStaticI18n(root = document) {
  for (const el of root.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n)
  for (const el of root.querySelectorAll('[data-i18n-ph]')) el.setAttribute('placeholder', t(el.dataset.i18nPh))
  for (const el of root.querySelectorAll('[data-i18n-title]')) el.setAttribute('title', t(el.dataset.i18nTitle))
  for (const el of root.querySelectorAll('[data-i18n-aria]')) el.setAttribute('aria-label', t(el.dataset.i18nAria))
}

/** Static side effects of a locale change: <html lang> attribute + all data-i18n texts. */
function applyLocaleSideEffects() {
  document.documentElement.lang = current
  applyStaticI18n()
}

/** Boot hook: apply static texts, then fire 'jebii:locale' once so app-level listeners can
 * refresh dynamic strings (static first — listeners must see the final static state before
 * overriding dynamic-owned nodes like the tab counters). The language <select> lives in the
 * settings dialog; main.js wires it to setLocale(). */
export function initI18n() {
  applyLocaleSideEffects()
  window.dispatchEvent(new CustomEvent(LOCALE_EVENT, { detail: { locale: current } }))
}


// ---------- Dictionary (zh = source of truth) ----------
const STRINGS = {
  // document / meta
  'doc.title': {
    zh: 'Jebii — SoulLink × JEV Live2D 聊天',
    en: 'Jebii — SoulLink × JEV Live2D Chat',
    ja: 'Jebii — SoulLink × JEV Live2D チャット'
  },
  'settings.uiLang': {
    zh: '界面语言',
    en: 'UI language',
    ja: '表示言語'
  },

  // mobile tabs
  'tab.logs.initial': {
    zh: 'LLM 0 / JEV 0',
    en: 'LLM 0 / JEV 0',
    ja: 'LLM 0 / JEV 0'
  },
  'tab.mood.initial': {
    zh: '心情 —',
    en: 'Mood —',
    ja: '気分 —'
  },
  'tab.logs': {
    zh: 'LLM {llm} / JEV {jev} / 语音 {voice}',
    en: 'LLM {llm} / JEV {jev} / Voice {voice}',
    ja: 'LLM {llm} / JEV {jev} / 音声 {voice}'
  },
  'tab.mood': {
    zh: '{name} {pct}%',
    en: '{name} {pct}%',
    ja: '{name} {pct}%'
  },

  // Jev emotion panel
  'jev.head': {
    zh: 'Jev 情绪概率',
    en: 'Jev emotion probabilities',
    ja: 'Jev 感情確率'
  },
  'jev.empty': {
    zh: '等待第一次决策…',
    en: 'Waiting for the first decision…',
    ja: '最初の判定を待っています…'
  },
  'jev.tag': {
    zh: '选中 {emotion} · 强度 {intensity} · 置信 {pct}%',
    en: 'Selected {emotion} · Intensity {intensity} · Confidence {pct}%',
    ja: '選択 {emotion} · 強度 {intensity} · 信頼度 {pct}%'
  },
  'jev.noData': {
    zh: '暂无决策数据（全部为 0）',
    en: 'No decision data yet (all 0)',
    ja: '判定データなし（すべて 0）'
  },

  // mood chip (desktop badge)
  'chip.mood': {
    zh: '{name} · {pct}%',
    en: '{name} · {pct}%',
    ja: '{name} · {pct}%'
  },
  'chip.mood.jev': {
    zh: '{name} · {pct}%（Jev）',
    en: '{name} · {pct}% (Jev)',
    ja: '{name} · {pct}%（Jev）'
  },

  // composer
  'input.placeholder': {
    zh: '和角色聊点什么…',
    en: 'Say something to the character…',
    ja: 'キャラとおしゃべりしよう…'
  },
  'btn.send': {
    zh: '发送',
    en: 'Send',
    ja: '送信'
  },
  'btn.stop': {
    zh: '■ 停止',
    en: '■ Stop',
    ja: '■ 停止'
  },
  'btn.clear': {
    zh: '清空',
    en: 'Clear',
    ja: 'クリア'
  },
  'btn.clear.title': {
    zh: '清空聊天记录，重新开始',
    en: 'Clear the chat history and start over',
    ja: 'チャット履歴を消去して最初からやり直す'
  },
  'btn.retry': {
    zh: '重试',
    en: 'Retry',
    ja: '再試行'
  },

  // traffic panel
  'traffic.head': {
    zh: '通信日志 · LLM / JEV / TTS / ASR',
    en: 'Traffic · LLM / JEV / TTS / ASR',
    ja: '通信ログ · LLM / JEV / TTS / ASR'
  },
  'traffic.request': {
    zh: '▲ 请求',
    en: '▲ Request',
    ja: '▲ リクエスト'
  },
  'traffic.response': {
    zh: '▽ 响应',
    en: '▽ Response',
    ja: '▽ レスポンス'
  },
  'traffic.error': {
    zh: '✖ 错误',
    en: '✖ Error',
    ja: '✖ エラー'
  },
  'traffic.omitted': {
    zh: 'payload 过大已省略',
    en: 'payload too large, omitted',
    ja: 'payload が大きすぎるため省略'
  },

  // boot loading overlay
  'loading.connect': {
    zh: '正在连接聊天服务器…',
    en: 'Connecting to the chat server…',
    ja: 'チャットサーバーに接続中…'
  },
  'loading.fail': {
    zh: '连接失败：{msg}',
    en: 'Connection failed: {msg}',
    ja: '接続失敗：{msg}'
  },
  'loading.unconfigured': {
    zh: '未配置：复制 src/config.example.js 为 src/config.local.js 并填写通道信息',
    en: 'Not configured: copy src/config.example.js to src/config.local.js and fill in the channel details',
    ja: '未設定：src/config.example.js を src/config.local.js にコピーしてチャンネル情報を入力'
  },

  // chat bubbles
  'who.user': {
    zh: '我',
    en: 'Me',
    ja: '自分'
  },
  'reply.stopped': {
    zh: '（已停止）',
    en: '(Stopped)',
    ja: '（停止しました）'
  },
  'reply.error': {
    zh: '（出错了：{msg}）',
    en: '(Error: {msg})',
    ja: '（エラー：{msg}）'
  },
  'reply.empty': {
    zh: '（回复为空）',
    en: '(Empty reply)',
    ja: '（返信なし）'
  },
  'reply.thinking': {
    zh: '（思考中… 已思考 {n} 字）',
    en: '(Thinking… {n} chars so far)',
    ja: '（思考中… {n} 文字）'
  },
  'llm.summary': {
    zh: '200 · 思维链 {reasoning} 字 · 正文 {body} 字',
    en: '200 · reasoning {reasoning} chars · reply {body} chars',
    ja: '200 · 思考 {reasoning} 文字 · 返信 {body} 文字'
  },

  // toasts / dialogs
  'toast.jevFail': {
    zh: 'Jev 决策失败，保持上次心情',
    en: 'Jev decision failed, keeping the last mood',
    ja: 'Jev の判定に失敗しました。直前の気分を維持します'
  },
  'toast.live2dFail': {
    zh: 'Live2D 初始化失败：{msg}',
    en: 'Live2D init failed: {msg}',
    ja: 'Live2D の初期化に失敗しました：{msg}'
  },
  'toast.bootFail': {
    zh: '启动失败：{msg}',
    en: 'Boot failed: {msg}',
    ja: '起動に失敗しました：{msg}'
  },
  'toast.cleared': {
    zh: '已清空，重新开始',
    en: 'Cleared — starting over',
    ja: '消去しました。最初からやり直します'
  },
  'confirm.clear': {
    zh: '确定清空全部聊天记录、重新开始吗？',
    en: 'Clear all chat history and start over?',
    ja: 'チャット履歴をすべて消去して、最初からやり直しますか？'
  },

  // settings dialog
  'settings.title': {
    zh: '设置',
    en: 'Settings',
    ja: '設定'
  },
  'settings.channels': {
    zh: '聊天通道',
    en: 'Chat channels',
    ja: 'チャットチャンネル'
  },
  'settings.llmBase': {
    zh: 'LLM base URL（留空用内置通道）',
    en: 'LLM base URL (empty = built-in channel)',
    ja: 'LLM ベース URL（空欄 = 内蔵チャンネル）'
  },
  'settings.llmToken': {
    zh: 'LLM 访问令牌（留空用内置通道）',
    en: 'LLM access token (empty = built-in channel)',
    ja: 'LLM アクセストークン（空欄 = 内蔵チャンネル）'
  },
  'settings.model': {
    zh: '模型名（留空用内置通道）',
    en: 'Model name (empty = built-in channel)',
    ja: 'モデル名（空欄 = 内蔵チャンネル）'
  },
  'settings.jevBase': {
    zh: 'Jev base URL（留空用内置通道）',
    en: 'Jev base URL (empty = built-in channel)',
    ja: 'Jev ベース URL（空欄 = 内蔵チャンネル）'
  },
  'settings.jevToken': {
    zh: 'Jev 访问令牌（留空用内置通道）',
    en: 'Jev access token (empty = built-in channel)',
    ja: 'Jev アクセストークン（空欄 = 内蔵チャンネル）'
  },
  'settings.behavior': {
    zh: '行为',
    en: 'Behavior',
    ja: '動作'
  },
  'settings.autoSpeak': {
    zh: '默认朗读（回复完成后自动朗读；关闭时点击气泡朗读）',
    en: 'Speak by default (auto-read replies; otherwise tap a bubble to speak)',
    ja: 'デフォルトで読み上げる（返信後に自動読み上げ。オフ時はバブルをタップ）'
  },

  'settings.voice': {
    zh: '角色声音（音色预存于项目，跨供应商一致）',
    en: 'Character voice (presets live in the repo, identical across providers)',
    ja: 'キャラの声（音色はプロジェクト内蔵、プロバイダー間で共通）'
  },
  'settings.ttsProvider': {
    zh: 'TTS 供应商',
    en: 'TTS provider',
    ja: 'TTS プロバイダー'
  },
  'settings.asrProvider': {
    zh: 'ASR 供应商',
    en: 'ASR provider',
    ja: 'ASR プロバイダー'
  },
  'provider.auto': {
    zh: '自动（云端优先）',
    en: 'Auto (cloud first)',
    ja: '自動（クラウド優先）'
  },
  'provider.browser': {
    zh: '浏览器本地',
    en: 'Browser (local)',
    ja: 'ブラウザ（ローカル）'
  },
  'provider.custom': {
    zh: '自定义（OpenAI 兼容）',
    en: 'Custom (OpenAI-compatible)',
    ja: 'カスタム（OpenAI 互換）'
  },
  'settings.voiceBase': {
    zh: '自定义语音端点（OpenAI 兼容，base URL 与 Key，TTS/ASR 共用）',
    en: 'Custom voice endpoint (OpenAI-compatible base URL + key; shared by TTS/ASR)',
    ja: 'カスタム音声エンドポイント（OpenAI 互換のベース URL とキー、TTS/ASR 共用）'
  },
  'settings.thinking': {
    zh: '允许模型思维链（默认关闭以加快首字）',
    en: 'Allow model thinking / chain of thought (off by default for faster first token)',
    ja: 'モデルの思考を許可（初期表示が速い既定ではオフ）'
  },
  'settings.data': {
    zh: '数据',
    en: 'Data',
    ja: 'データ'
  },
  'settings.exportChat': {
    zh: '导出聊天记录',
    en: 'Export chat history',
    ja: 'チャット履歴を書き出す'
  },
  'settings.importChat': {
    zh: '导入聊天记录',
    en: 'Import chat history',
    ja: 'チャット履歴を読み込む'
  },
  'settings.exportLogs': {
    zh: '导出通信日志',
    en: 'Export traffic log',
    ja: '通信ログを書き出す'
  },
  'settings.save': {
    zh: '保存并重连',
    en: 'Save & reconnect',
    ja: '保存して再接続'
  },
  'settings.close': {
    zh: '关闭',
    en: 'Close',
    ja: '閉じる'
  },
  'settings.saved': {
    zh: '已保存，正在重新连接…',
    en: 'Saved — reconnecting…',
    ja: '保存しました。再接続中…'
  },
  'import.done': {
    zh: '已导入 {n} 条消息',
    en: 'Imported {n} messages',
    ja: '{n} 件のメッセージを読み込みました'
  },
  'import.badFile': {
    zh: '无法解析该文件：需要 {role, content} 数组',
    en: 'Could not parse that file: expected an array of {role, content}',
    ja: 'ファイルを解析できません：{role, content} の配列が必要です'
  },

  // per-message actions
  'bubble.speakHint': {
    zh: '点击朗读',
    en: 'Tap to speak',
    ja: 'タップで読み上げ'
  },
  'btn.mic': {
    zh: '语音输入',
    en: 'Voice input',
    ja: '音声入力'
  },
  'mic.listening': {
    zh: '正在听…（再点一次结束）',
    en: 'Listening… (tap again to stop)',
    ja: '聞き取っています…（もう一度タップで終了）'
  },
  'mic.transcribing': {
    zh: '正在转写…',
    en: 'Transcribing…',
    ja: '文字起こし中…'
  },
  'mic.unsupported': {
    zh: '此浏览器不支持语音输入',
    en: 'Voice input is not supported in this browser',
    ja: 'このブラウザは音声入力に対応していません'
  },
  'tts.unsupported': {
    zh: '此浏览器不支持语音合成',
    en: 'Speech synthesis is not supported in this browser',
    ja: 'このブラウザは音声合成に対応していません'
  },
  'tts.fail': {
    zh: '云端语音失败，已改用浏览器语音',
    en: 'Cloud voice failed, falling back to the browser voice',
    ja: 'クラウド音声に失敗し、ブラウザ音声にフォールバックしました'
  },

  // traffic log tools
  'traffic.all': {
    zh: '全部',
    en: 'All',
    ja: 'すべて'
  },
  'traffic.copy': {
    zh: '复制 JSON',
    en: 'Copy JSON',
    ja: 'JSON をコピー'
  },
  'traffic.copied': {
    zh: '已复制',
    en: 'Copied',
    ja: 'コピーしました'
  },

  // emotion timeline
  'jev.timeline': {
    zh: '情绪轨迹（最近 {n} 次决策）',
    en: 'Emotion timeline (last {n} decisions)',
    ja: '感情の推移（直近 {n} 回の判定）'
  }
}
