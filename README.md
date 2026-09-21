# Jebii

**Live2D character chat — Jev decides the emotion, SoulLink performs it.**

Jebii is a Live2D character chat application that runs in the browser.
**Jev** (the System One decision model by TypeSafe AI) makes the emotion
decisions, the **SoulLink** performance engine turns each emotion into
per-frame Live2D expression and motion parameters, and a regular
OpenAI-compatible LLM generates the conversation text. The UI ships in
Simplified Chinese, English, and Japanese. The default character persona is
**Tsukimi Amane (月見天音)**.

## Features

- **Emotion decisions without prompt engineering** — after each exchange, Jev
  answers a typed `Choice` question and returns an emotion with calibrated
  probabilities and confidence. No emotion tags pollute the chat prompt.
- **Per-frame Live2D performance** — the SoulLink engine
  (`@soullink-emotion/*`) blends VAD/FACS emotion synthesis, idle motion, and
  parameter mixing into Live2D values on every frame.
- **Any OpenAI-compatible chat API** — bring your own endpoint (base URL
  including `/v1`, model name, API key); replies stream over SSE.
- **Multilingual UI** — Simplified Chinese, English, and Japanese; the
  language is auto-detected from the browser and can be switched at runtime.
- **Multi-provider voice with repo-built-in character voices** — voice presets
  live in the repository (`src/voices.js`), so every provider renders the same
  cast; TTS and ASR providers are chosen independently in Settings (MiMo and
  MiniMax adapters included, browser-native fallback). Mouth movement is driven
  by the real playback audio; the mic button records and transcribes via cloud
  ASR.
  Both fall back to the browser's native speech APIs when the voice channel
  is not configured.
- **In-app settings** — channel overrides (LLM/Jev base URL, token, model),
  auto-speak and model-thinking toggles, chat export/import and traffic-log
  export; the latest reply can be regenerated with one click.
- **PWA** — installable to the home screen with an offline app shell; API
  traffic is never cached.
- **Mobile-friendly** — a dedicated narrow-screen mobile layout.
- **Keys stay out of the app** — optional built-in channels route LLM/Jev
  traffic through a reverse proxy; real API keys live only on the proxy side.
- **Full observability** — a communication log records the complete request
  and response bodies of every LLM and Jev call (auth headers excluded),
  filterable by channel with one-click JSON copy; an emotion panel shows
  probability bars for all emotions, the current pick and its confidence,
  and a timeline strip visualizes the last 20 emotion decisions.

### Preview

| Boot | Conversation + Jev panel |
|:---:|:---:|
| ![Boot screen](docs/screenshots/en-1-boot.png) | ![Conversation with the Jev panel expanded](docs/screenshots/en-4-panel.png) |

Both captured live through the deployed channels. More screenshots — the other
UI languages, additional conversation rounds, and the expanded panels — live in
[`docs/screenshots/`](docs/screenshots/).

## Architecture

```
User message
   |
   |---> Chat LLM (any OpenAI-compatible API) ---> streamed text (SSE)
   |
   |---> Jev (TypeSafe System One model)
   |       Choice: which emotion, at what intensity?
   |       (calibrated probabilities + confidence)
   |
   +---> SoulLink performance engine
           VAD/FACS + idle motion + parameter mixing
           ---> per-frame Live2D parameters
                    |
                    v
           Live2D rendering (PixiJS + Cubism Core)
```

| Concern | Handled by | Where |
|---|---|---|
| Chat text | Any OpenAI-compatible LLM, SSE streaming | `src/main.js` |
| Emotion decision | Jev — `POST /v1/systemone` (`jev-latest`), a typed `Choice` question for emotion and intensity | `src/main.js` |
| Performance | `@soullink-emotion/*` engine (VAD/FACS, idle, parameter mixing) driving the per-frame parameter loop | `src/live2d.ts` |
| UI strings | `t()` dictionary with zh/en/ja, auto-detect + runtime switch | `src/i18n.js` |
| Persona | Default character profile **Tsukimi Amane (月見天音)** | system prompt in `src/main.js` |

### Terminology

- **Jev** — TypeSafe AI's System One decision model. It does not generate
  text; it answers typed questions (`Noul` / `Choice` / `Score`) with
  structured, probability-calibrated results that code can branch on directly.
- **SoulLink** — the `@soullink-emotion/*` family of packages: a
  framework-agnostic Live2D expression and motion engine with continuous VAD
  emotion, FACS/AU synthesis, layered animation, and automatic model
  adaptation.

## Installation

Prerequisites: Node.js with npm, and a copy of this repository.

```bash
npm install
```

> **npm >= 12 note:** the installation script for `esbuild` must be approved
> explicitly: `npm install-scripts approve esbuild`.

Then generate the SoulLink performance profile for the bundled model. This is
an offline, deterministic heuristic derived from the model's `cdi3` parameter
metadata — no LLM is involved:

```bash
npm run gen:profile   # generates soullink.profile.json (default model: hiyori)
```

## Usage

1. Open the app in a browser. The loading gate runs a connectivity check
   automatically — with a built-in channel configured, everything works out
   of the box; otherwise copy `src/config.example.js` to
   `src/config.local.js` and fill in:
   - **Chat LLM** (required): base URL of any OpenAI-compatible API
     (including `/v1`), model name, API key.
   - **Jev emotion decisions** (optional): official `https://api.typesafe.ai`
     or the relay `https://jev-ai.pro/api` — the key must match the endpoint.
     If left empty, the app falls back to SoulLink rule-based emotions.
2. Start chatting. The emotion badge next to the reply is the top entry
   (highest probability) of Jev's probability detail.
3. Switch the interface language at any time with the language switcher in
   the top bar (auto-detected from the browser on first visit).

### When is Jev triggered? — no prompts needed

A Jev decision fires automatically exactly once per message, after the reply
completes; at send time the SoulLink rule-based classifier drives an instant
reaction without calling Jev. The state sent to Jev is the recent conversation
with your latest message emphasized. Typical reactions: praise → happy/shy,
venting → sad/concerned, provocation → anger, good news → excited.

### Inspecting what happens

- **Communication log** (left panel on wide screens, the Logs tab on mobile):
  the complete request and response bodies of every LLM and Jev call, without
  auth headers.
- **Jev emotion panel**: probability bars for every emotion, the currently
  selected emotion, and its confidence.

## Configuration

Copy `src/config.example.js` to `src/config.local.js` (gitignored) and point
it at your endpoints. The built-in channel pattern routes LLM/Jev traffic at
a reverse proxy together with a low-value access token — real API keys exist
only on the proxy side and never enter the application. Direct endpoint
entries (base URL + key) work too.

The in-app settings dialog (gear in the top bar) stores the same channel
overrides in the browser's localStorage — no rebuild needed when
self-hosting a prebuilt bundle. It also holds the voice and behavior
switches and the chat-history export/import actions.

## Build

| Command | Purpose |
|---|---|
| `npm run dev` | Start the vite dev server |
| `npm run typecheck` | Type-check the TypeScript sources and syntax-check `src/main.js` |
| `npm run gen:profile` | Regenerate `soullink.profile.json` from model `cdi3` |
| `npm run build` | Build the web app (vite + asset packing + precompression) |
| `node scripts/web-smoke.mjs [url]` | Headless smoke test (defaults to `npx vite preview --port 4173`) |

The build output in `dist-web/` is a self-contained static site. It expects
to be served under the `/app/` base path (see `vite.config.mts`); adjust the
`base` option to deploy elsewhere.

## Project Structure

```
src/            Web app: index.html, main.js (chat + Jev + UI logic),
                i18n.js (zh/en/ja strings), live2d.ts (Live2D driver),
                emotions.ts (trilingual emotion taxonomy, compile-time
                aligned with the engine vocabulary), types.ts,
                model-performance.ts (Hiyori motion/FACS presets),
                style sheets, config.example.js template
resources/      Cubism Core, Hiyori model, soullink.profile.json
scripts/        Profile generation, web asset packing, build-time compression
docs/           Research notes, screenshots, translated READMEs
```

## Models & Live2D Licensing

- **Code** — MIT (see [LICENSE](LICENSE)).
- `resources/core/live2dcubismcore.min.js` — **Cubism Core**, proprietary
  license by Live2D Inc. Publication is fee-exempt for individuals and
  small-scale enterprises with annual sales below 10 million JPY (except
  Expandable Applications). See the
  [Live2D SDK license page](https://www.live2d.com/en/sdk/license/).
- `resources/models/hiyori/` — the official Live2D sample model **Hiyori**,
  under the Free Material License: distribute as-is, do not alter the
  character design, do not ship the official audio. See
  [resources/MODEL_LICENSE.md](resources/MODEL_LICENSE.md).
- **No arbitrary model import, by design.** Applications that let users load
  their own Live2D models count as
  [Expandable Applications](https://www.live2d.com/en/sdk/license/expandable/)
  and require a Live2D review plus a special publication license regardless
  of publisher size. Jebii deliberately ships with the single bundled model.

## Known Limitations

- Cloud voice goes through the built-in relay channel (keys stay on the
  proxy); without it, voice quality falls back to the browser's native speech
  APIs, whose coverage depends on the platform.
- Only the Hiyori model is bundled (see
  [Models & Live2D Licensing](#models--live2d-licensing)).

## Acknowledgements

- [TypeSafe AI](https://typesafe.ai/) — the Jev System One decision model.
- [SoulLink_Live2D](https://github.com/nanlingyin/SoulLink_Live2D) and
  [soullink-emotion-sdk](https://github.com/nanlingyin/soullink-emotion-sdk) —
  the SoulLink performance engine and its npm packages.
- [Live2D Inc.](https://www.live2d.com/) — Cubism Core and the Hiyori sample
  model.
- [PixiJS](https://pixijs.com/), pixi-live2d-display, and Vite.
- The historical technology research behind this project is preserved in
  [docs/research.md](docs/research.md).

## License

- Code: MIT — see [LICENSE](LICENSE).
- `resources/core/live2dcubismcore.min.js`: proprietary license by Live2D Inc.
  (publication fee exemption for individuals and small-scale enterprises with
  annual sales below 10 million JPY).
- `resources/models/hiyori/`: Live2D official sample data under the Free
  Material License (distribute as-is, no design changes, no official audio).
- Details: [resources/MODEL_LICENSE.md](resources/MODEL_LICENSE.md) and
  [docs/research.md](docs/research.md).

---

**English** | [简体中文](docs/README.zh-CN.md) | [日本語](docs/README.ja.md)
