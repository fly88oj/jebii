/**
 * Performance knowledge for the Hiyori model: emotion → native motion mapping and FACS expression presets.
 * Part of the model-asset layer (void once the model is swapped), kept separate from the driver
 * logic; consumed by the shared Live2D driver.
 */

/** Emotion → Hiyori native motion (Tap/Flick body motion series, played at force priority).
 *  neutral and calm are deliberately unmapped: stillness is the right performance for them
 *  and the engine's idle scheduler already animates the character — forcing a motion there
 *  would fight the idle layer. All 12 expressive emotions map onto the 7 available groups
 *  (reuse across emotions is intended; the VAD/FACS layer differentiates the expressions). */
export const EMOTION_MOTION: Record<string, { group: string; index: number }> = {
  happy: { group: 'Tap', index: 0 },
  excited: { group: 'Tap', index: 1 },
  surprised: { group: 'FlickUp', index: 0 },
  sad: { group: 'FlickDown', index: 0 },
  anger: { group: 'Tap@Body', index: 0 },
  shy: { group: 'Flick', index: 0 },
  affectionate: { group: 'Flick@Body', index: 0 },
  curious: { group: 'Tap', index: 0 },
  confused: { group: 'Flick', index: 0 },
  concerned: { group: 'Flick@Body', index: 0 },
  anxiety: { group: 'FlickUp', index: 0 },
  tired: { group: 'FlickDown', index: 0 }
}

/** Emotion → FACS expression presets (layered on top of engine VAD→FACS for extra visibility; scaled by intensity) */
export const EMOTION_FACS: Record<string, Record<string, number>> = {
  happy: { mouthSmile: 0.7, eyeSmile: 0.55, mouthOpen: 0.25, cheek: 0.3 },
  excited: { mouthSmile: 0.9, eyeSmile: 0.7, mouthOpen: 0.5, browInnerUp: 0.4 },
  affectionate: { mouthSmile: 0.6, eyeSmile: 0.6, cheek: 0.45 },
  shy: { cheek: 0.8, eyeSmile: 0.4, gazeX: -0.3, browInnerUp: 0.25 },
  surprised: { mouthOpen: 0.7, eyeOpen: 0.4, browInnerUp: 0.7 },
  curious: { browInnerUp: 0.35, eyeOpen: 0.2 },
  confused: { browInnerUp: 0.4, eyeSquint: 0.2, mouthPucker: 0.3 },
  concerned: { browInnerUp: 0.5, mouthFrown: 0.25 },
  sad: { mouthFrown: 0.55, browInnerUp: 0.55, eyeSmile: -0.2, gazeY: -0.25 },
  anxiety: { browInnerUp: 0.5, eyeSquint: 0.3, mouthPucker: 0.2 },
  anger: { mouthFrown: 0.5, browDown: 0.6, gazeY: 0.15 },
  tired: { eyeOpen: -0.4, mouthOpen: 0.15, breath: 0.3 }
}
