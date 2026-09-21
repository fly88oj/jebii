// Shared domain types (consumed by the Live2D driver and UI logic)

/** Jev emotion decision result (fed to the SoulLink engine) */
export interface EmotionResult {
  emotion: string
  intensity: number
  confidence: number
  source: 'jev' | 'rules'
  /** Probability distribution over emotion options returned by Jev (for the technical demo) */
  probabilities?: Record<string, number>
  /** Intensity tier name (mild/moderate/strong) */
  intensityChoice?: string
}
