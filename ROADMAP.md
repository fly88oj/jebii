# Roadmap

Planned optimization and feature work for the Jebii web app. Each item lists
its status. Items under **Not planned** are deliberately out of scope with the
reason.

## R1 — Voice: TTS reply playback with lip sync ✅

When the built-in voice channel is configured, replies are spoken by the cloud
TTS model through the reverse proxy (default: an AI-designed cute girl voice;
preset voices selectable in Settings), and the engine's `AudioLevelAnalyzer`
input is driven by the *real* playback audio (WebAudio RMS) so the mouth tracks
the voice. Without the channel, browser-native `speechSynthesis` speaks with a
synthetic lip-flap fallback.

## R2 — Voice input (speech-to-text) ✅

With the voice channel configured, the mic button records via MediaRecorder,
converts to mono 16kHz WAV in the browser and transcribes through the cloud ASR
model via the proxy. Otherwise browser `SpeechRecognition` dictation applies.
Feature-detected: hidden when neither path exists.

## R3 — In-app settings ✅

A settings dialog (gear in the top bar) covering:

- Channel overrides: LLM base URL / token / model, Jev base URL / token —
  persisted in `localStorage`, layered over `config.local.js` (self-hosters
  can repoint the app without a rebuild)
- Auto-speak toggle (R1), model thinking (chain-of-thought) toggle
- Data management: export/import chat history, export the traffic log

## R4 — Regenerate the last reply ✅

A regenerate button on the latest assistant message: drops it and re-answers
the preceding user message.

## R5 — Traffic log: channel filter + entry copy ✅

Segmented All / LLM / JEV filter in the log header; per-entry copy button
copies the full JSON payload.

## R6 — Emotion decision timeline ✅

A mini strip inside the Jev panel showing the last 20 decisions (bar height =
confidence, color = emotion) so the session's emotional arc is visible at a
glance.

## R7 — PWA: installable + offline shell ✅

Web app manifest + service worker: the shell (HTML/CSS/JS, Cubism core,
model) is cached for offline loads and home-screen install; API channels are
never cached.

## R8 — Accessibility pass ✅

Visible keyboard focus (`:focus-visible`), `prefers-reduced-motion` disables
UI animations (typing dots, toasts).

## R9 — Committed web smoke script ✅

`scripts/web-smoke.mjs`: the headless CDP verification pass (boot gate,
canvas, placeholder state, language switching, settings dialog, mobile
viewport) as a repeatable repo tool next to `typecheck` / `build`.

## Not planned

- **User-imported Live2D models** — would make Jebii an Expandable
  Application under the Live2D license (review + special license required).

- **Additional bundled characters** — same licensing constraint as above.
