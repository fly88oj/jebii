/**
 * Live2D driver: the SoullinkRuntime per-frame parameter loop plus the
 * emotion → motion/expression mapping, on top of the bundled Hiyori model.
 * Resources are located under the /app/ prefix (static files served by the
 * reverse proxy).
 */
import type { RuntimeSnapshot } from '@soullink-emotion/engine'
import type { EmotionResult } from './types'
import { EMOTION_MOTION, EMOTION_FACS } from './model-performance'

const CORE_URL = '/app/core/live2dcubismcore.min.js'
const MODEL_URL = '/app/models/hiyori/hiyori_pro_t11.model3.json'
const PROFILE_URL = '/app/models/hiyori/soullink.profile.json'

export interface Live2DHandle {
  applyEmotion(result: EmotionResult): void
  onUserMessage(text: string): void
  /**
   * Mouth movement for voice playback. With an external level getter (cloud TTS:
   * WebAudio analyser RMS) the engine reads real audio levels; without one
   * (browser speechSynthesis exposes no audio stream) a synthetic flapping
   * envelope drives the analyzer instead.
   */
  setVoiceActive(active: boolean, getLevel?: () => number): void
  reset(): void
}

export async function initLive2D(container: HTMLElement): Promise<Live2DHandle> {
  const [{ Live2DRenderer, createScriptTagCubismLoader }, engine] = await Promise.all([
    import('@soullink-emotion/live2d-pixi'),
    import('@soullink-emotion/engine')
  ])

  const cubismLoader = createScriptTagCubismLoader(CORE_URL)
  const renderer = new Live2DRenderer(container, { cubismLoader })
  try {
    await renderer.load(MODEL_URL)
    // The adapter's default framing (anchor at 56% height + 1.02x) crops the feet: shrink slightly
    // and move up so the whole body stays visible
    renderer.setViewScale(0.96)
    renderer.setViewOffset({ x: 0, y: -Math.round(container.clientHeight * 0.045) })
  } catch (err) {
    console.error('[live2d] model load failed:', MODEL_URL, err)
    throw err
  }

  const { profile } = await engine.loadModelProfile(PROFILE_URL)
  const runtime = new engine.SoullinkRuntime({
    profile,
    motionStyle: engine.motionStylePresets.natural
  })
  runtime.setLipSyncEnabled(true)

  // Audio level source for TTS lip sync: delegates to the external getter when the
  // caller has real audio (WebAudio analyser), otherwise to the synthetic flap below.
  const level = { v: 0 }
  let levelProvider: (() => number) | null = null
  const analyzer = {
    getLevel: () => (levelProvider ? levelProvider() : level.v),
    getPeak: () => (levelProvider ? levelProvider() : level.v),
    isAvailable: () => true,
    reset: () => { level.v = 0 }
  }
  let mouthRaf = 0
  let mouthT0 = 0

  let last = performance.now() / 1000
  let raf = 0
  let lastNativeToken = -1
  let motionToken = 1

  const loop = (): void => {
    const now = performance.now() / 1000
    const dt = Math.min(now - last, 0.1)
    last = now
    const snap = runtime.update(now, dt)
    renderer.setParameters(snap.live2dParams)
    const anim = snap.nativeAnimation
    if (anim && anim.token !== lastNativeToken) {
      lastNativeToken = anim.token
      renderer.applyNativeAnimation(anim)
    }
    raf = requestAnimationFrame(loop)
  }
  // Suspend the render loop while the tab is hidden (zero CPU/battery) and resume on
  // return; the dt clamp inside loop() absorbs the time jump on resume.
  const stopLoop = (): void => { cancelAnimationFrame(raf); raf = 0 }
  const startLoop = (): void => { if (!raf) { last = performance.now() / 1000; raf = requestAnimationFrame(loop) } }
  document.addEventListener('visibilitychange', () => (document.hidden ? stopLoop() : startLoop()))
  if (!document.hidden) raf = requestAnimationFrame(loop)

  return {
    // Jev decision → engine intent (VAD/FACS) + native motion + manual expression layer
    applyEmotion(result) {
      const now = performance.now() / 1000
      runtime.triggerIntent(
        { emotion: result.emotion, intensity: result.intensity, contextTags: [] },
        now,
        { provider: result.source }
      )
      const mv = EMOTION_MOTION[result.emotion]
      if (mv) {
        motionToken += 1
        renderer.applyNativeAnimation({
          token: motionToken,
          expression: null,
          motion: { group: mv.group, index: mv.index, priority: 'force' },
          suppressParamIds: []
        })
      }
      const facs = EMOTION_FACS[result.emotion]
      if (facs) {
        const scaled: Record<string, number> = {}
        for (const [k, v] of Object.entries(facs)) scaled[k] = v * Math.min(1, result.intensity + 0.15)
        runtime.setManualFACS(scaled)
        // Clear the manual layer once the emotion has naturally faded (the engine's own decay does not act on manual)
        setTimeout(() => {
          try {
            runtime.clearManualFACS()
          } catch {
            /* ignore once the runtime lifecycle has ended */
          }
        }, Math.max(6000, result.intensity * 12000))
      }
    },
    // Instant reaction to user messages (rule-based classifier, zero-latency fallback)
    onUserMessage(text) {
      runtime.sendMessage(text, performance.now() / 1000)
    },
    setVoiceActive(active, getLevel) {
      levelProvider = getLevel ?? null
      runtime.setVoicePlaybackActive(active)
      runtime.setAudioLevelAnalyzer(active ? analyzer : null)
      cancelAnimationFrame(mouthRaf)
      if (active && !getLevel) {
        mouthT0 = performance.now()
        const flap = (): void => {
          const t = (performance.now() - mouthT0) / 90
          level.v = 0.18 + 0.5 * Math.abs(Math.sin(t)) * (0.6 + 0.4 * Math.random())
          mouthRaf = requestAnimationFrame(flap)
        }
        mouthRaf = requestAnimationFrame(flap)
      } else {
        level.v = 0
      }
    },
    // Clear conversation / restart: engine emotion state and the manual expression layer are all reset
    reset() {
      runtime.clearManualFACS()
      runtime.reset(performance.now() / 1000)
    }
  }
}
