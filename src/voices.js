/**
 * Project-built-in voice presets — the single source of truth for the app's
 * character voices. Stored in the repository so every TTS provider renders the
 * SAME cast: provider adapters translate a preset into whatever the provider
 * understands (a design prompt, a mapped voice_id, …). Adding a provider never
 * changes this list, and adding a voice never touches provider code.
 *
 * - id: stable settings value
 * - label: trilingual character name (voices are characters, not adjectives)
 * - design: trilingual voice-design prompt for providers with a voice-design
 *   capability (sent verbatim); descriptive providers render these traits
 */

export const VOICES = [
  {
    id: 'xiaomeng',
    label: { zh: '小梦', en: 'Xiaomeng', ja: 'シャオメン' },
    note: { zh: '元气萌妹', en: 'buoyant cutie', ja: '元気な萌え少女' },
    design: {
      zh: '一个可爱的二次元萌妹妹音色：年轻少女声线，软萌甜美，带一点奶音，语气活泼俏皮，语速轻快，像在撒娇一样亲切。',
      en: 'A cute anime-girl voice: young girl\'s timbre, soft and sweet with a slightly babyish ring, playful and lively, quick-paced, affectionate like gentle coaxing.',
      ja: 'かわいいアニメ少女の声：若い少女の声質で、柔らかく甘えん坊、わずかに赤ちゃんぽみがあり、明るく快活でテンポが速く、甘えるように親しみます。'
    }
  },
  {
    id: 'qingyu',
    label: { zh: '清雨', en: 'Qingyu', ja: 'チンユー' },
    note: { zh: '温柔清澈', en: 'gentle & clear', ja: '優しく澄んだ' },
    design: {
      zh: '一位温柔恬静的年轻女性音色：声线清澈通透，语速从容，语气平和关怀，像雨天在耳边轻声安慰的朋友。',
      en: 'A gentle, serene young woman\'s voice: clear and translucent timbre, unhurried pace, calm and caring tone, like a friend softly comforting you on a rainy day.',
      ja: '穏やかで静かな若い女性の声：澄んで透き通る声質で、落ち着いた語り口、思いやりのあるトーン。雨の日にそっと慰めてくれる友人のようです。'
    }
  },
  {
    id: 'mufan',
    label: { zh: '慕凡', en: 'Mufan', ja: 'ムーファン' },
    note: { zh: '温暖青年', en: 'warm young man', ja: '温かい青年' },
    design: {
      zh: '一位温暖可靠的年轻男性音色：声线低沉干净，语速平稳，语气沉稳幽默，像值得信赖的老朋友在闲聊。',
      en: 'A warm, dependable young man\'s voice: low and clean timbre, steady pace, composed with light humor, like a trusted old friend chatting.',
      ja: '温かく頼れる若い男性の声：低く澄んだ声質で、安定した話し方、落ち着きと軽いユーモア。信頼できる旧友のおしゃべりのようです。'
    }
  }
]

/** Trilingual lookup with zh fallback. */
export function voiceLabel(voice, locale) {
  return voice.label[locale] ?? voice.label.zh
}
