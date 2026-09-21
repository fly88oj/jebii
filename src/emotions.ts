/**
 * Emotion taxonomy — the single source of truth for the whole repo.
 * Keys align with emotionVADPresets of @soullink-emotion/engine (a type-level constraint:
 * adding an emotion without syncing the engine vocabulary fails at compile time).
 */
import type { emotionVADPresets } from '@soullink-emotion/engine'

type EngineEmotions = keyof typeof emotionVADPresets

export const EMOTION_KEYS = [
  'neutral',
  'calm',
  'happy',
  'excited',
  'shy',
  'affectionate',
  'curious',
  'surprised',
  'confused',
  'concerned',
  'sad',
  'anxiety',
  'anger',
  'tired'
] as const satisfies readonly EngineEmotions[]

export type EmotionKey = (typeof EMOTION_KEYS)[number]

/** Jev Choice criteria: emotion → decision description */
const EMOTION_CRITERIA: Record<EmotionKey, string> = {
  neutral: '平静、无明显情绪起伏',
  calm: '放松、安心、舒适',
  happy: '开心、愉悦、被逗笑',
  excited: '兴奋、激动、迫不及待',
  shy: '害羞、不好意思、脸红',
  affectionate: '亲昵、温柔、关心对方',
  curious: '好奇、感兴趣、想知道更多',
  surprised: '惊讶、出乎意料',
  confused: '困惑、没听懂、不确定',
  concerned: '担心、挂念对方的状态',
  sad: '难过、低落、失落',
  anxiety: '紧张、不安、焦虑',
  anger: '生气、不满、恼火',
  tired: '疲惫、困倦、没精神'
}

/** Chinese short labels for the UI (also the zh row of the label table below) */
const EMOTION_ZH: Record<EmotionKey, string> = {
  neutral: '平静',
  calm: '安心',
  happy: '开心',
  excited: '兴奋',
  shy: '害羞',
  affectionate: '亲昵',
  curious: '好奇',
  surprised: '惊讶',
  confused: '困惑',
  concerned: '担心',
  sad: '难过',
  anxiety: '不安',
  anger: '生气',
  tired: '疲惫'
}

/** Intensity tiers (Jev Choice criteria → engine intensity mapping) */
const INTENSITY_CRITERIA = {
  mild: '轻微流露，几乎只在眼神和眉梢体现',
  moderate: '正常表达，表情动作清晰可见',
  strong: '强烈表达，全身动作幅度明显'
} as const

export type IntensityChoice = keyof typeof INTENSITY_CRITERIA

export const INTENSITY_VALUE: Record<IntensityChoice, number> = {
  mild: 0.6,
  moderate: 0.9,
  strong: 1.0
}

export const INTENSITY_FALLBACK = 0.9

/** Empty-state detail rows: the fixed taxonomy all at 0 (status = first detail row) */
export function zeroEmotionRows(): Array<[string, number]> {
  return EMOTION_KEYS.map((k) => [k, 0])
}

// ---------------------------------------------------------------------------
// i18n vocabulary (zh / en / ja)
// ---------------------------------------------------------------------------

/** Supported UI locales for the emotion vocabulary */
export type Locale = 'zh' | 'en' | 'ja'

/** English short labels for the UI */
const EMOTION_EN: Record<EmotionKey, string> = {
  neutral: 'neutral',
  calm: 'calm',
  happy: 'happy',
  excited: 'excited',
  shy: 'shy',
  affectionate: 'affectionate',
  curious: 'curious',
  surprised: 'surprised',
  confused: 'confused',
  concerned: 'concerned',
  sad: 'sad',
  anxiety: 'anxiety',
  anger: 'anger',
  tired: 'tired'
}

/** Japanese short labels for the UI */
const EMOTION_JA: Record<EmotionKey, string> = {
  neutral: '穏やか',
  calm: '安らぎ',
  happy: '嬉しい',
  excited: 'ワクワク',
  shy: '恥ずかしい',
  affectionate: '親密',
  curious: '好奇心',
  surprised: '驚き',
  confused: '困惑',
  concerned: '心配',
  sad: '悲しい',
  anxiety: '不安',
  anger: '怒り',
  tired: '疲れ'
}

/** Locale → emotion label; every locale must cover the full key set (compile-time checked) */
const EMOTION_LABELS: Record<Locale, Record<EmotionKey, string>> = {
  zh: EMOTION_ZH,
  en: EMOTION_EN,
  ja: EMOTION_JA
}

/** English decision criteria: when to judge the message as this emotion */
const EMOTION_CRITERIA_EN: Record<EmotionKey, string> = {
  neutral: 'The tone is even, with no noticeable emotional movement.',
  calm: 'The speaker feels relaxed, at ease, and comfortable.',
  happy: 'The speaker is pleased or amused, laughing along.',
  excited: 'The speaker is thrilled and worked up, hardly able to wait.',
  shy: 'The speaker feels embarrassed or sheepish, even blushing.',
  affectionate: 'The speaker is tender and warm, caring about the other person.',
  curious: 'The speaker is intrigued and interested, wanting to know more.',
  surprised: 'The speaker is taken aback; something unexpected came up.',
  confused: 'The speaker did not follow and feels unsure.',
  concerned: 'The speaker worries about how the other person is doing.',
  sad: 'The speaker feels down, low, and dispirited.',
  anxiety: 'The speaker feels tense, uneasy, and anxious.',
  anger: 'The speaker is annoyed, displeased, and fed up.',
  tired: 'The speaker feels exhausted, sleepy, and low on energy.'
}

/** Japanese decision criteria (plain である style: when to judge the message as this emotion) */
const EMOTION_CRITERIA_JA: Record<EmotionKey, string> = {
  neutral: '感情の起伏がなく、穏やかな状態である。',
  calm: 'リラックスしており、安心感があり、心地よい状態である。',
  happy: '楽しく、嬉しく、思わず笑みがこぼれる状態である。',
  excited: 'わくわくしており、気持ちが高ぶって、待ちきれない状態である。',
  shy: '恥ずかしく、気恥ずかしく、顔が赤らんでいる状態である。',
  affectionate: '親密で、優しく、相手を気にかけている。',
  curious: '好奇心を持ち、興味を惹かれ、もっと知りたがっている。',
  surprised: '驚いており、予想外のことが起きている。',
  confused: '困惑しており、意味が分からず、確信が持てない状態である。',
  concerned: '心配しており、相手の様子を気にかけている。',
  sad: '悲しく、落ち込んで、しょんぼりしている状態である。',
  anxiety: '緊張しており、不安が募り、気が休まらない状態である。',
  anger: '腹が立ち、不満が溜まり、いらだちを感じている状態である。',
  tired: '疲れており、眠く、元気が出ない状態である。'
}

/** Locale → decision criteria; zh reuses EMOTION_CRITERIA so it stays byte-identical */
const EMOTION_CRITERIA_I18N: Record<Locale, Record<EmotionKey, string>> = {
  zh: EMOTION_CRITERIA,
  en: EMOTION_CRITERIA_EN,
  ja: EMOTION_CRITERIA_JA
}

/** Locale → intensity tier word (the short label shown next to a tier) */
const INTENSITY_WORDS: Record<Locale, Record<IntensityChoice, string>> = {
  zh: { mild: '轻微', moderate: '适中', strong: '强烈' },
  en: { mild: 'mild', moderate: 'moderate', strong: 'strong' },
  ja: { mild: '軽い', moderate: '普通', strong: '強い' }
}

/** English intensity tier criteria */
const INTENSITY_CRITERIA_EN: Record<IntensityChoice, string> = {
  mild: 'Barely showing: mostly in the eyes and eyebrows.',
  moderate: 'Normally expressed: the facial expression and motions are clearly visible.',
  strong: 'Strongly expressed: the whole body moves with obvious amplitude.'
}

/** Japanese intensity tier criteria (plain である style) */
const INTENSITY_CRITERIA_JA: Record<IntensityChoice, string> = {
  mild: 'かすかに表れており、目や眉の動きにほぼ限られる。',
  moderate: '通常の表現であり、表情や動きがはっきりと見える。',
  strong: '強く表れており、全身の動きの幅が大きい。'
}

/** Locale → intensity tier criteria; zh reuses INTENSITY_CRITERIA so it stays byte-identical */
const INTENSITY_CRITERIA_I18N: Record<Locale, Record<IntensityChoice, string>> = {
  zh: INTENSITY_CRITERIA,
  en: INTENSITY_CRITERIA_EN,
  ja: INTENSITY_CRITERIA_JA
}

/**
 * Lenient localized label lookup. Unknown keys fall back to the raw
 * English key.
 */
export function emotionLabel(key: string, locale: Locale): string {
  const table = EMOTION_LABELS[locale] as Record<string, string | undefined>
  return table[key] ?? key
}

/** Localized intensity tier word; unknown levels fall back to the raw level string */
export function intensityWord(level: string, locale: Locale): string {
  const table = INTENSITY_WORDS[locale] as Record<string, string | undefined>
  return table[level] ?? level
}

/** Localized emotion decision criterion; unknown keys fall back to the raw key */
export function emotionCriterion(key: string, locale: Locale): string {
  const table = EMOTION_CRITERIA_I18N[locale] as Record<string, string | undefined>
  return table[key] ?? key
}

/** Localized intensity tier criterion; unknown levels fall back to the raw level string */
export function intensityCriterion(level: string, locale: Locale): string {
  const table = INTENSITY_CRITERIA_I18N[locale] as Record<string, string | undefined>
  return table[level] ?? level
}
