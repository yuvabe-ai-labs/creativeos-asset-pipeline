# ElevenLabs voice change on the Video Gen node — design

*Recorded 2026-09-24. ADR: D282 in the roadmap §7.*

## Problem

Every Video Gen generation picks its narrator's voice from scratch, so a multi-shot ad (the
Jackfruit365 UGC script: 6 shots, 48 s) plays back as six different people. Today the team fixes
this outside CreativeOS: merge in VN → extract audio → ElevenLabs Voice Changer → replace audio in
VN. ElevenLabs speech-to-speech keeps the original timing and delivery, so lip sync survives.

## Goal

An **optional** voice on the Video Gen node. With no voice selected, generation is byte-for-byte
today's path. With a voice selected, the background job generates the video, extracts its audio,
re-voices it with ElevenLabs speech-to-speech, puts the new audio back and returns the re-voiced
video as the node's version.

## Non-goals (later phases)

A separate Voice node, text-to-speech narration, creating/cloning voices inside CreativeOS, a
default voice per client. Voices are created in the ElevenLabs website for now.

## Decisions taken in brainstorming

| Question | Decision |
|---|---|
| What the node keeps | **One version** — the re-voiced video. The original is stored in GCS and its URL recorded on the version. If the voice change fails, the version is the original, with a "voice change failed" note. |
| Which voices the picker shows | **Everything on our ElevenLabs account**, live from `GET /v1/voices` (custom voices first, then stock). |
| Billing | **Charged** — ElevenLabs' $0.12/min is added to the generation's estimate and to the settled cost, only when the voice change was applied. |
| Where the work runs | **A separate `video-revoice` child task**, called with `triggerAndWait` from `video-generate` after the original is stored. |

## 1. The node (UI)

- The Video Gen focus view gains a **Voice** control (shadcn `Select`, never native). The first
  option is **Original (no change)**, the default. Then the account's voices, grouped: custom
  voices (ElevenLabs `category` `cloned` / `generated` / `professional`) first, then stock
  (`premade`). Each row shows the name and a small preview button that plays ElevenLabs'
  `preview_url`.
- The selection persists on the node as `data.voiceId` (same mechanism as `data.imageRoles`, via
  `onPatch`). `undefined` means Original.
- The control is **disabled with a reason** when the generation will have no audio to change:
  - the model declares an `audio` param and its effective value is not audio-on
    (`isVideoAudioEnabled` is false) — e.g. Kling with audio off;
  - mock mode.
  Reason text follows the existing locked-param reason pattern.
- The credit estimate on the node adds the voice cost when a voice is selected.
- A version whose `params_used.voice.status === "failed"` shows a small note on the node:
  *"Voice change failed — showing the original audio."*
- The version history shows the voice name on versions that were re-voiced.

## 2. Voice list route

`GET /api/elevenlabs/voices` (auth-gated like other app routes; `apiOk` / `apiError`).

- Calls `GET https://api.elevenlabs.io/v1/voices` with `xi-api-key: ELEVEN_LABS_API_KEY`.
- Returns `{ voices: Array<{ voiceId, name, category, previewUrl }> }`, custom categories first,
  then by name.
- Cached in-process for 5 minutes (a new custom voice shows within 5 minutes).
- Missing key → `apiError("Voice change isn't set up — ELEVEN_LABS_API_KEY is missing.", 503)`;
  the picker shows that message instead of a list.
- The key never reaches the browser.

Client call lives in `src/lib/elevenlabs/api.ts` (browser-safe fetch wrapper); the ElevenLabs HTTP
client lives in `src/lib/elevenlabs/client.ts` (`server-only` for the route; the task imports the
same pure functions — no `server-only` import in anything the task needs).

## 3. Pipeline

```
POST /api/nodes/[id]/video-generate   body: { ..., voiceId? }
  ├─ D97-style guards (before insertGeneration / reserveCredits):
  │    voiceId present + audio off        → 400
  │    voiceId present + key missing      → 400
  │    voiceId present + mock             → ignored (mock never re-voices)
  ├─ estimate = videoCost + (voiceId ? voiceChangeCost(duration) : 0) → reserveCredits
  ├─ if voiceId: signVideoGenPutUrls(nodeId, generationId)
  │      → { originalPutUrl, originalUrl, revoicedPutUrl, revoicedUrl }   (2 h expiry)
  └─ tasks.trigger("video-generate", { ...today, voice?: { voiceId, originalPutUrl, originalUrl,
                                                           revoicedPutUrl, revoicedUrl } })

video-generate task
  1. config.generate(...)                                   — unchanged
  2. no `voice` in payload → webhook exactly as today        — unchanged path
  3. `voice` present:
       a. download provider video with provider auth headers
       b. PUT bytes to originalPutUrl (Content-Type video/mp4)
          failure → webhook failed (nothing stored to fall back to)
       c. r = await videoRevoiceTask.triggerAndWait({ sourceUrl: originalUrl, voiceId,
                                                      revoicedPutUrl })
       d. webhook {
            status: "succeeded", stored: true, durationSeconds,
            videoUrl: r.ok ? revoicedUrl : originalUrl,
            meta: { voice: { voiceId, status: r.ok ? "applied" : "failed",
                             error?: r.error, originalUrl } }
          }

video-revoice task (id "video-revoice", own retry policy, maxDuration 300)
  a. download sourceUrl (public GCS object)
  b. ffmpeg: extract audio → audio.mp3
  c. POST https://api.elevenlabs.io/v1/speech-to-speech/{voiceId}
       multipart: audio=@audio.mp3, model_id=eleven_multilingual_sts_v2
       header: xi-api-key: ELEVEN_LABS_API_KEY
  d. ffmpeg: mux new audio onto source video
       -map 0:v -map 1:a -c:v copy -c:a aac -shortest
  e. PUT to revoicedPutUrl
  returns { ok: true } | { ok: false, error }
```

Notes:

- `video-revoice` **throws** on transient errors inside its own run so Trigger retries it; only
  after its retries are exhausted does `triggerAndWait` return a failed result, which
  `video-generate` maps to `{ ok: false }`. `video-generate` itself never throws because of the
  voice step, so its retry can never regenerate (and re-pay for) the video.
- Provider download headers (`buildVideoDownloadHeaders` in `complete.ts`) move to a shared module
  `src/lib/video-gen/download-headers.ts` so both `complete.ts` and the task use one copy. It must
  not import `server-only`.
- ffmpeg helpers (`extractAudio`, `replaceAudio`) live in `src/lib/media/ffmpeg.ts`, spawning the
  `ffmpeg` binary with temp files under `os.tmpdir()`.

## 4. Storage and versions

- New helper `signVideoGenPutUrls({ nodeId, generationId })` in `src/lib/storage/index.ts`:
  paths `video-gen/{nodeId}/{generationId}-original.mp4` and `…-revoiced.mp4` (following
  `uploadVideoGen`'s existing prefix), using `_signPutUrl` with a 2-hour expiry, returning both
  signed PUT URLs and both public URLs.
- Webhook body gains optional `stored: boolean` and `meta`. `completeGeneration`, when
  `stored === true`, **skips the download/upload** and uses `videoUrl` as `storedVideoUrl`
  directly — only if it starts with this bucket's public prefix (reject otherwise, fail + refund).
- One version is inserted. `paramsUsed` additionally records
  `voice: { voiceId, voiceName, status, originalUrl }`. `voiceName` is resolved in the route at
  trigger time and passed through the payload so the version is readable without another API
  call.

## 5. Billing

- `src/lib/elevenlabs/constants.ts`: `VOICE_CHANGE_USD_PER_MINUTE = 0.12` (ElevenAPI price,
  checked 2026-09-24).
- `src/lib/elevenlabs/cost.ts`: `computeVoiceChangeCost(durationSeconds) → { usd, inr }`, using the
  same `USD_TO_INR` as video cost.
- Reserve: video estimate + voice estimate (when `voiceId`).
- Settle in `completeGeneration`: video cost + voice cost **only when
  `meta.voice.status === "applied"`**.
- The usage popover shows "Voice change" as its own line when the generation was re-voiced.

## 6. Errors

| Failure | Outcome |
|---|---|
| Video generation | Unchanged: generation failed, full refund |
| Download or PUT of the original | Generation failed, full refund (nothing stored to fall back to) |
| ElevenLabs / ffmpeg / re-voiced PUT | `video-revoice` retries; if still failing → node gets the original + note; voice cost not charged |
| `voiceId` with audio off | 400 in the route, before any row or reservation |
| `ELEVEN_LABS_API_KEY` missing | Voices route 503 with message; generate with `voiceId` → 400 |
| `stored: true` with a URL outside our bucket | Generation failed + refund (defensive) |

The 15-minute stuck-generation sweep (`trigger/reconcile-stuck-generations.ts`, `*/15 * * * *`)
stays correct by budget, not by accident: `video-revoice` runs with `maxDuration: 120` and
`retry.maxAttempts: 2`, so even two full-length attempts (240 s) fit inside the sweep's window
alongside `video-generate`'s own `maxDuration: 600`. Its queue is capped at
`concurrencyLimit: 2` to match the ElevenLabs Free plan's concurrent speech-to-speech limit, and
failures that can't succeed on retry (no audio stream to extract; an ElevenLabs 4xx other than
429) abort immediately via `AbortTaskRunError` instead of spending the retry budget repeating a
failure that will recur identically.

## 7. Testing

- Unit: `computeVoiceChangeCost`; voice list mapping + ordering; route `voiceId` guards (audio off,
  key missing, mock ignored) and the reservation amount; `completeGeneration` with `stored: true`
  for applied (voice cost settled) and failed (not settled), and the bucket-prefix guard.
- `video-revoice` with ffmpeg and ElevenLabs mocked: happy path; ElevenLabs 4xx/5xx → throws.
- `video-generate` with `voice`: revoice ok → revoiced URL + applied; revoice failed → original
  URL + failed; original PUT fails → failed webhook.
- `src/lib/media/ffmpeg.ts`: one local integration test against a tiny fixture clip (skipped when
  `ffmpeg` isn't on PATH).
- Manual: one real Gemini Omni clip end to end on staging.

## 8. Setup

- `npm i -D @trigger.dev/build` (pinned to the SDK's version, 4.6.3); `trigger.config.ts` adds
  `extensions: [ffmpeg()]` from `@trigger.dev/build/extensions/core`.
- `ELEVEN_LABS_API_KEY` in `.env` / `.env.local` and in the staging and production Trigger.dev
  projects' environment variables, and in the Vercel project for the voices route.
- ElevenLabs plan: Free covers development (~8.3 min/month of voice change via API, 2 concurrent
  requests). Production volume needs a paid plan.
