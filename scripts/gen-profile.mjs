// Generates the soullink.profile.json required by the SoulLink performance engine from model3.json / cdi3.json
// Without LLM config, the heuristic provider is used (offline, deterministic); Hiyori's standard parameter names map well.
import path from 'node:path'
import process from 'node:process'
import { Live2DProfileAutoGenerator } from '@soullink-emotion/profile-generator'

const modelsRoot = path.resolve(process.cwd(), 'resources', 'models')
const modelDir = process.argv[2] ?? 'hiyori'

const gen = new Live2DProfileAutoGenerator({ modelsRoot })
const result = await gen.ensure({ modelDir })

console.log(
  JSON.stringify(
    {
      generated: result.generated,
      reason: result.reason,
      provider: result.provider,
      profileUrl: result.profileUrl,
      notes: result.notes
    },
    null,
    2
  )
)
if (!result.profile) {
  console.error('profile generation failed')
  process.exit(1)
}
