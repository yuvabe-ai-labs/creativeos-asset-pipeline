# Change voice as a version action — design

*Recorded 2026-09-25. ADR: D284 in the roadmap §7. Supersedes D282's generate-time voice and
D283's popover picker; reuses D282's `video-revoice` job, ffmpeg helpers and billing plumbing and
D283's voice catalog, routes, hooks, filters and rows.*

## Problem

D282 re-voices every generation that has a voice selected — including drafts nobody keeps — and
the voice is a dropdown beside the model params. Operators want the opposite flow: generate
normally, and only when a take is worth keeping, change its voice as a deliberate step that
produces a new version, keeps the original, and charges only for the voice change.

## Flow

1. **Generate** is plain video again: no voice picker, no `voiceId`, no voice step in the job.
2. On the Video Gen focus view, a **Change voice** toggle (shadcn `Switch` with label) sits in the
   preview header. Enabled when the node has at least one succeeded video version.
3. Toggle on → the **centre area** (where the player is) becomes the voice workspace:
   **left** the voice browser, **right** the settings panel with the Apply button.
4. **Apply** → a background job re-voices the chosen version and creates a **new version**. The
   source version is untouched. Toggle turns off and the new version becomes active.

## Workspace UI

- **Voice browser (left)** — D283's browser opened up as a full panel, no popover: `Tabs`
  My voices / Voice Library, `InputGroup` search, icon filter `Select`s, rows with inline preview
  (one plays at a time), infinite scroll for the Library. Clicking a row selects it (`✓`).
  Library picks are saved to the account in the background (D283 optimistic flow); Apply waits
  until the save resolves.
- **Settings (right)**, top to bottom:
  - **Source** — "v2 · original audio" with a small player of the version whose *audio* will be
    re-voiced (see Source audio). A `Select` lets the operator pick another succeeded video version;
    defaults to the active version.
  - **Voice** — the selected voice's name, meta chips, `N×` badge, preview button.
  - **Stability** `Slider` 0–100, default 50 · **Similarity** 0–100, default 75 ·
    **Style exaggeration** 0–100, default 0 (hint: "ElevenLabs recommends 0").
  - **Speaker boost** `Switch`, default on · **Remove background noise** `Switch`, default off
    (hint: "Also removes music and ambience").
  - **Model** `Select`: Multilingual (`eleven_multilingual_sts_v2`, default) / English
    (`eleven_english_sts_v2`).
  - **Seed** `Input` (optional integer 0–4294967295; blank = random).
  - **Apply** `Button`: "Change voice · ≈N credits" — disabled until a voice is chosen and any
    Library save has finished; shows a spinner while running.
- **Not offered:** Speed (changes timing → breaks lip sync); output format (we control it).
- Settings persist on the node (`data.voiceChange = { voiceId, settings }`) so reopening the
  workspace restores the last choice.

## Sync guarantees

Voice change (speech-to-speech) keeps the source's timing; none of the offered settings change
timing. Two guards cover encoder padding and anything unexpected:

1. **Video length wins** — `replaceAudio` pads short audio with silence (`-af apad`) and trims long
   audio (`-shortest`), picture stream-copied (existing).
2. **Sync check** — the job measures the source audio and the returned audio with ffprobe. If the
   durations differ by more than **0.25 s**, the job fails ("The new voice came back out of sync, so
   nothing was changed."), the reservation is refunded, and no version is created. The measured
   drift (ms) is recorded on successful versions.

## Source audio

Re-voicing always starts from the **original model audio**, even when the operator picks a
version that was itself voice-changed: the server follows `inputs_used.voiceChange.rootVersionId`
back to the root version and uses that video. History still says "changed from v3" (the version
the operator picked); the version records both ids. Each change is first-generation quality.

## Server

### `POST /api/nodes/[id]/voice-change`

Body (zod): `{ baseVersionId: string, voiceId: string, settings: VoiceChangeSettings }` where
`VoiceChangeSettings = { stability: 0–100, similarity: 0–100, style: 0–100, speakerBoost: boolean,
removeBackgroundNoise: boolean, modelId: "eleven_multilingual_sts_v2" | "eleven_english_sts_v2",
seed?: integer }`.

Guards (before any generation row or reservation): `withNode`; base version belongs to this node,
is a succeeded video version with an `output` in our bucket (`isOwnStoredUrl`); resolve the root
version (see Source audio) and its `output`; voice exists (`getVoiceCached`) → `voiceName`,
`priceMultiplier`; `ELEVEN_LABS_API_KEY` present. Duration = root version's
`params_used.durationSeconds` (fallback `duration`/`seconds`).

Then: `insertGeneration({ type: "voice", modelUsed: settings.modelId, paramsSnapshot: settings,
inputsSnapshot: { baseVersionId, rootVersionId, sourceUrl, voice } })`; reserve
`computeVoiceChangeCost(duration, priceMultiplier)` credits; sign ONE PUT URL
(`…/video-gen/{generationId}-revoiced.mp4`, 2 h); trigger `video-voice-change`.

### Trigger task `video-voice-change`

Payload `{ generationId, sourceUrl, voiceId, settings, revoicedPutUrl, revoicedUrl }`. Runs the
D282 revoice steps with the settings: download → `extractAudio` → `speechToSpeech({ audio,
voiceId, settings })` → sync check (`probeDurationSeconds` on both audio files) →
`replaceAudio` → PUT. Retries: `maxDuration: 120`, `maxAttempts: 2`, queue `concurrencyLimit: 2`,
non-retryable failures (no audio stream, ElevenLabs 4xx ≠ 429, sync-check failure) abort
immediately. Webhook: success `{ generationId, status: "succeeded", stored: true, videoUrl:
revoicedUrl, durationSeconds, meta: { voiceChange: { driftMs } } }`; failure `{ status: "failed",
error }`.

`speechToSpeech` gains optional `settings`: `model_id`, `voice_settings` JSON
(`stability`/`similarity_boost`/`style` as 0–1, `use_speaker_boost`), `remove_background_noise`,
`seed`.

### `completeGeneration` for `type: "voice"`

- Stored-URL path (existing) — no download/upload.
- New version: `output` = re-voiced URL; `model_used` = the **root version's** model (the video
  model — so the History row and restore keep working); `params_used` = the root version's params;
  `inputs_used` = the root version's inputs plus
  `voiceChange: { baseVersionId, rootVersionId, voiceId, voiceName, priceMultiplier, settings,
  modelId, driftMs }`.
- Settle **voice cost only**: `computeVoiceChangeCost(durationSeconds, priceMultiplier)`.
- Failure: fail + refund (existing), no version.

## Removed (D282 generate-time voice)

`voiceId` in the video-generate route body, guards, reservation and payload; `VoicePayload`;
`deliverWithVoice` and the voice branch in `trigger/video-generate.ts`; original-video signing;
`meta.voice` handling in `completeGeneration` for video generations (versions already carrying
`params_used.voice` keep displaying via `readVoiceMeta` — read-only back-compat); the D283 popover
trigger and its focus-view wiring; `data.voiceId` on the node (ignored if present).

Kept and reused: `video-revoice` internals (`revoiceVideo` steps) → renamed/extended into
`video-voice-change`; ffmpeg helpers; voice catalog, routes, caches, filters, labels, row/list/
filters components, `useVoiceBrowser`.

## Versions & history

- History row for a voice-changed version: "v3 · Voice: Anjali · changed from v2", plus the `N×`
  badge when > 1. "Sent to model" shows the voice settings.
- Usage popover: voice-change versions show "· voice change" and their (voice-only) credits.
- Restore works like any version (the output is a normal video).
- Admin credit breakdown shows voice changes as their own `voice` type (the breakdown groups by
  `generations.type`; no migration needed — the column has no check constraint).

## Errors

| Failure | Result |
|---|---|
| Base version not a stored video of this node | 400 before any row/reservation |
| Voice gone / key missing / ElevenLabs unreachable | 400 with a clear message, nothing reserved |
| ElevenLabs 4xx ≠ 429, no audio stream, sync drift > 0.25 s | job aborts, generation failed, refund, no version, message shown on the node |
| Transient (429, 5xx, network) | retried once, then as above |

## Testing

Unit: settings schema + mapping to ElevenLabs fields (0–100 → 0–1); root-version resolution;
voice-change route guards and reservation (voice only, multiplier); `speechToSpeech` form fields;
`revoiceVideo` with sync check (pass, drift fail → non-retryable); `completeGeneration` for
`type: "voice"` (version inputs/params/model, voice-only settlement, failure refund); video-generate
route no longer accepts/forwards a voice; ffmpeg `probeDurationSeconds` integration test.
Manual: generate → toggle → pick a Library voice → apply → new version plays in sync; change v3
again (source = original audio); a forced failure refunds and creates nothing.
