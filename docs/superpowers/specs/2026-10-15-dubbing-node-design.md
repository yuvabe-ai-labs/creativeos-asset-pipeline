# Dubbing node — design

*2026-10-15 · ADRs D374–D377*

A **Dubbing** node takes one Video Gen node's current version, dubs it into another Indian
language in the presenter's own voice, and can then lip-sync the presenter's mouth to the dub.
It is deliberately small: one input, one language select, two buttons, no voice or model choices.

## 1. The node

- **Type** `dubbing`, label **Dubbing**, quick-add mnemonic **B** (free; "duBbing").
- **Input:** exactly **one** Video Gen node (`VALID_CONNECTIONS["video-gen"]` gains `"dubbing"`).
  A second incoming wire is refused (`MAX_INCOMING = { dubbing: 1 }`, checked wherever
  `canConnect` is). Video Gen gains an output handle so it can be wired from the canvas.
- **Output:** none for now (`VALID_CONNECTIONS.dubbing = []`).
- **Node data:** `{ title?: string; language?: DubLanguage }`. `language` is the last picked
  target and the select's value; it is not the source of truth for any version.
- **Card on canvas:** title, the active version's best video (lip-synced, else dubbed) as a
  thumbnail, a language chip, and a state word: *Not dubbed*, *Dubbing…*, *Dubbed*,
  *Lip-syncing…*, *Lip-synced*. Needs a connected video before anything runs.

## 2. Source

The source is the connected Video Gen node's **active version at the moment Dub runs**, read on
the server (never the client's cached copy). It is used as-is: a voice-changed take is dubbed
with its changed voice, because the dub clones whatever voice it hears. The route rejects:

- no connected Video Gen node — "Connect a video to dub.";
- its active version missing, failed or not stored by us — "The connected video has no finished take yet.";
- no recorded duration — "This take has no recorded length, so it can't be priced.";
- longer than `DUB_MAX_SECONDS` (60) — "Dubbing works on clips up to a minute.".

**Spoken language of the source is English (`en-IN`).** The vendor requires it and the view has
one select by design. Non-English sources are a follow-up.

## 3. Versions

Each **Dub** run creates a new version on the Dubbing node and makes it active. Its `output`:

```ts
type DubbingOutput = {
  language: DubLanguage;          // target, e.g. "hi-IN"
  original: string;               // the source take's stored video URL (not copied)
  dubbed: string;                 // our stored dubbed video
  dubbedAudio: string;            // our stored dubbed audio track (lip sync's input)
  lipSynced: string | null;       // filled by Lip sync; overridden by each run
};
```

`inputs_used.dub = { sourceNodeId, sourceVersionId, srcLang, targetLang, provider, model, vendorJobId }`.

**Lip sync** runs on the **active** version and writes `lipSynced` into that same version (an
update, not a new version). Running it again overrides it. Re-dubbing makes a new version, so
earlier dubs stay in History. `inputs_used.lipSync = { provider, model, vendorRequestId, ranAt }`
is merged into the same row.

History lists versions newest first; each row shows **Original · Dubbed · Lip-synced** with the
language, and the user can make any version active (the existing restore-version route).

## 4. Focus view

Composite's shell (back to canvas, editable title, rail | middle | right).

- **Rail:** *Dubbing* (the controls) · *Connected* (the one video node; selecting it shows its
  read-only `ConnectedDetailView`, with a disconnect control) · *History* (count). The Connected
  header has the usual **Add** chip; it hides once one video is wired.
- **Middle (Dubbing):**
  - **Dub into** — shadcn `Select` of the target languages (all vendor languages except the
    source's `en-IN`), default Hindi.
  - **Dub** — primary button with its credit cost. While running: "Dubbing…" with the progress
    the task reports. A failure shows `GenerationErrorBadge` with plain copy.
  - **Lip sync** — secondary button with its credit cost, enabled once the active version has a
    `dubbed` video. Label becomes **Lip sync again** when `lipSynced` is set.
  - No voice picker, settings, or model picker.
- **Right:** the video player for the active version with an **Original / Dubbed / Lip-synced**
  segmented switch (a stage with no video is disabled). Defaults to the furthest stage present.
  With no version yet it shows the connected take's video.

## 5. Engines (one each, behind a provider seam)

```ts
// src/lib/dubbing/providers.ts
export const DUB_ENGINE = { provider: "sarvam", model: "sarvam-dub" } as const;
export const LIP_SYNC_ENGINE = { provider: "fal", model: "lipsync-2-pro" } as const;
```

Each engine is a module implementing a small interface (`DubEngine.start/poll/exports`,
`LipSyncEngine.submit/poll/result`). Adding a model or vendor later is a new module plus a
picker; the node, routes and versions don't change.

### Sarvam dubbing (`src/lib/sarvam/`)

`api-subscription-key` header, env `SARVAM_API_KEY`.
1. `POST /dubbing/jobs` `{ src_lang: "en-IN", target_langs: [lang], voice_cloning: true,
   num_speakers: 1, disable_watermark: true, editor_flow: false }` → `job_id`, `upload_url`.
   `export_options` is left unset, which exports the dubbed video, its audio and an mp3 of it.
2. `PUT upload_url` with the source bytes (`x-ms-blob-type: BlockBlob`, `Content-Type: video/mp4`).
3. `POST /dubbing/jobs/{id}/start`.
4. Poll `GET …/live-status` until `completed` or `failed`.
5. `GET …/export-status` → per (language, format) `download_url`s; take `video` and `mp3`.

Languages: `hi bn gu kn ml mr or pa ta te as` + `-IN`. Billed per whole second of source × 1
language (₹40/min on Starter). **Verify the live-status and export-status JSON keys against a
real job before relying on them** — the docs name the endpoints but not the field names; the
client parses them through zod and fails loudly on a mismatch.

### fal sync lip sync (`src/lib/fal/`)

Queue REST API, env `FAL_KEY` (`Authorization: Key …`).
- Submit `POST https://queue.fal.run/fal-ai/sync-lipsync/v2` `{ model: "lipsync-2-pro",
  video_url, audio_url, sync_mode: "cut_off" }` → `request_id`.
- Poll `GET …/requests/{id}/status` until `COMPLETED`; `GET …/requests/{id}` → `video.url`.
- `video_url` = the version's `original` (signed GET), `audio_url` = its `dubbedAudio` (signed GET).
- ≈ $5/min of video (listed; verify on fal's model page before launch).

## 6. Background jobs

Two Trigger tasks modelled on `video-voice-change`: route resolves and prices, reserves credits,
signs our upload URLs, triggers; the task posts the generation webhook; `completeGeneration`
writes the version.

- **`video-dub`**: create → upload → start (each **once**) → poll with `wait.for({ seconds: 10 })`
  → download exports → `putBytes` to our storage → webhook `succeeded` with the URLs.
- **`video-lip-sync`**: submit (**once**) → poll with `wait.for` → download → store → webhook.
- **Never pay twice** (performance rule 12): the paid call is outside any retried block. Polls
  and downloads retry in place (bounded). Task `retry.maxAttempts: 1`; a thrown error after the
  paid call reports `failed` only via `onFailure`, and the credits are refunded. A stored result
  whose webhook can't be delivered is left for the stuck sweep (the voice-change
  `DeliveryFailedError` pattern).
- Wall time: `wait.for` checkpoints don't count against `maxDuration`, but the run must settle
  inside the stuck-reservation threshold (50 minutes, migration 0055); polls give up at **12 minutes** with
  "The dub took too long. Your credits were returned."
- Generation types `dub` and `lipsync`. `generations.type` is free text (migration 0007, no
  check constraint), so **no migration**; `GenerationRow["type"]` widens in TypeScript.
  `completeGeneration`: `dub` → insert version + set active; `lipsync` → update the target
  version's `output.lipSynced` and `inputs_used.lipSync` (the generation's
  `inputs_snapshot.lipSync.versionId` names it). Both settle the reservation at the actual cost.

## 7. Credits

- `computeDubCost(seconds)` = `ceil(seconds) / 60 × SARVAM_DUB_INR_PER_MIN` → USD → credits.
- `computeLipSyncCost(seconds)` = `seconds / 60 × FAL_LIPSYNC_PRO_USD_PER_MIN` → credits.
- Both are pure, live in `src/lib/dubbing/cost.ts`, and feed the button labels and the route's
  reservation, so the number on the button is the number reserved.
- Reserve, settle at actual cost and refund on failure exactly as Change voice does; the stuck
  sweep covers both types unchanged.

### Showing usage

- **Per-version credits are summed.** A Dubbing version is charged by one dub generation plus
  every lip sync run on it. `getCreditsChargedByVersionIds` currently keeps one generation per
  version (a `Map` that the last row overwrites); it sums instead. This also fixes any future
  type that charges a version twice.
- **Node and pipeline totals** (`useNodeCost`, the canvas cost query) already sum settled
  generations by node, so dub and lip sync count with no change.
- **Usage popover** on the Dubbing node's credits footer (`UsagePopoverShell`, like Video Gen's):
  one row per version, "Hindi dub · lip sync ×2" with that version's summed credits (the dub
  plus every lip sync on it); node total; pipeline total with the connected video upstream.
- **Generation kinds:** `GenerationJobKind` gains `dub` and `lipsync` (today an unknown type
  falls back to `video`); the generation tray gains a `dub` kind labelled **Dub** / **Lip sync**
  (today it would fall back to "Image Prompt").

## 8. API

Both under `withNode`, `apiOk`/`apiError`, 202 + `{ generationId }`:

- `POST /api/nodes/[id]/dub` `{ language }` — node must be `dubbing`; server finds the one
  connected Video Gen node from edges and reads its active version (rules 10, 14: the source is
  found by the server, never taken from the client).
- `POST /api/nodes/[id]/lip-sync` `{ versionId }` — the version must be on this node, active,
  and have `dubbed` + `dubbedAudio`; a lip sync already running on it → 409.

Missing keys → 400 "Dubbing isn't set up yet." (no vendor names in UI copy).

## 9. Client

- `nodeGenerationService.startDub` / `startLipSync` in `src/services/node-generation.service.ts`
  (the existing start-a-generation service, `readJson`).
- `useStartDub(nodeId)`, `useStartLipSync(nodeId)` in `src/hooks/queries/node-generation.ts`; on settle
  they refresh `nodeVersionKeys.list(nodeId)`. Running state comes from the canvas's existing
  generation channel (`use-canvas-generations`), never a per-node subscription.
- Versions through `useNodeVersions` / `useRefreshNodeVersions`.
- Components in `src/components/nodes/dubbing-*.tsx`: node card, focus view, rail, controls,
  player-with-stage-switch, version history. Each under ~200 lines; shadcn primitives only.

## 10. Errors (plain copy)

| Case | Copy |
| --- | --- |
| No speech / vendor rejects media | "This take has no speech we could dub." |
| Vendor job failed | "The dub couldn't be made. Your credits were returned." |
| Lip sync failed | "Lip sync couldn't be finished. Your credits were returned." |
| Timed out | "The dub took too long. Your credits were returned." |

## 11. Testing

Vitest, dependencies injected like `revoice.test.ts`: Sarvam and fal clients (`fetchImpl`), the
two task step functions (paid call happens once across poll failures; timeout path), cost
functions, per-version credit summing (dub + two lip syncs on one version), tray and job kinds, both routes (source resolution, one-input rule, 409), `completeGeneration` for both
types, the connection limit, and `nodeRowToFlow` for the new type.

## 12. Out of scope

Choosing voices, settings, models or vendors; non-English sources; more than one speaker;
dubbing uploads or non-Video-Gen inputs; outputs from the Dubbing node to other nodes.
