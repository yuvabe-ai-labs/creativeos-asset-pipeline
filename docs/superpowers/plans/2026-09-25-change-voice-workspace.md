# Change Voice Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn voice change into a deliberate version action: Generate is plain video again; a "Change voice" toggle on the Video Gen focus view opens a centred workspace (voice browser + all timing-safe ElevenLabs settings) that re-voices a chosen version's original audio into a new version, billed for the voice only, with a sync check.

**Architecture:** Remove D282's generate-time voice path. Add a `video-voice-change` Trigger task that runs the existing revoice steps (now with ElevenLabs settings and a duration-drift check) and posts the webhook itself. A new `POST /api/nodes/[id]/voice-change` route resolves the root (original-audio) version, reserves voice-only credits and creates a `type: "voice"` generation; `completeGeneration` gains a voice branch that appends a new version copying the root's model/params/inputs plus `inputs_used.voiceChange`. The UI reuses D283's browser pieces inside a new workspace that replaces the player while the toggle is on.

**Tech Stack:** Next.js route handlers, Trigger.dev v4 SDK (`@trigger.dev/sdk/v3` import path), ffmpeg, ElevenLabs REST, zod, vitest, React + shadcn (Base UI) `Switch` / `Slider` / `Select` / `Input` / `Tabs` / `Button` / `Badge`, Lucide.

**Spec:** `docs/superpowers/specs/2026-09-25-change-voice-workspace-design.md` (ADR D284; supersedes D282's generate-time voice and D283's popover).

## Global Constraints

- Generate (the `video-generate` route, payload and task) carries **no voice** after Task 1 — its request body schema has no `voiceId`, the trigger payload has no `voice` key, and the task has no voice branch.
- Voice change settings and defaults, exactly: Stability 0–100 default **50**; Similarity 0–100 default **75**; Style exaggeration 0–100 default **0**; Speaker boost default **on**; Remove background noise default **off**; Model `eleven_multilingual_sts_v2` (default, label "Multilingual") or `eleven_english_sts_v2` ("English"); Seed optional integer 0–4294967295. Sent to ElevenLabs as `voice_settings` JSON `{ stability, similarity_boost, style }` divided by 100 plus `use_speaker_boost`, form fields `model_id`, `remove_background_noise`, `seed`. **Speed is never offered or sent.**
- Sync check: if `|duration(source audio) − duration(returned audio)| > 0.25 s` the job fails non-retryably with the message **"The new voice came back out of sync, so nothing was changed."**; the successful version records `driftMs`.
- Re-voicing always uses the **root** version's video: if the chosen version has `inputs_used.voiceChange.rootVersionId`, use that root; otherwise the chosen version itself.
- Voice-change billing: `computeVoiceChangeCost(durationSeconds, priceMultiplier)` only — never any video cost. Generation `type: "voice"`.
- New version: `model_used` = root's model; `params_used` = root's params (+ `durationSeconds`); `inputs_used` = root's inputs + `voiceChange: { baseVersionId, rootVersionId, sourceUrl, voiceId, voiceName, priceMultiplier, settings, driftMs }`. Failure → no version, reservation refunded.
- `video-voice-change` task: `maxDuration: 120`, `retry.maxAttempts: 2`, `queue: { concurrencyLimit: 2 }`; non-retryable failures throw `AbortTaskRunError`.
- UI rules (CLAUDE.md/AGENTS.md): shadcn primitives only (Base UI, `render` prop, never raw `<button>`/`<input>`/`<select>`); Lucide icons, `strokeWidth={1.5}`; token colors only; no new arbitrary font sizes; one component per file, prefixed by parent name; logic in `src/lib/…` with tests.
- Nothing the Trigger tasks import may import `server-only`. API routes use `apiOk`/`apiError` and `withNode`.
- Run tests per path (known full-suite flakes). Windows Git Bash; quote bracketed paths. ffmpeg tests need `FFMPEG_PATH="C:/Users/yuvab/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-9.0.2-full_build/bin/ffmpeg.exe"`.
- Every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

---

### Task 1: Remove generate-time voice (back to plain Generate)

**Files:**

- Modify: `src/app/api/nodes/[id]/video-generate/route.ts` (+ `route.test.ts`), `trigger/video-generate.ts`, `src/lib/generations/complete.ts` (+ `complete.test.ts`), `src/lib/voice-change/types.ts`, `src/lib/storage/index.ts` (+ `video-gen-voice-urls.test.ts`), `src/components/nodes/video-gen-focus-view.tsx`, `src/components/nodes/video-gen-node.tsx`, `src/lib/canvas-nodes.ts`, `src/lib/video-gen/api.ts`
- Delete: `src/lib/voice-change/deliver.ts` + `__tests__/deliver.test.ts`, `src/components/nodes/video-gen-voice-picker.tsx` + `__tests__/video-gen-voice-picker.test.tsx`, `src/hooks/use-selected-voice.ts`

**Interfaces:**

- Produces: `video-generate` body without `voiceId`; trigger payload without `voice`; `completeGeneration` with no `meta.voice` settlement; `VoicePayload` and `RevoiceResult` removed from `types.ts` (`VoiceMeta`, `RevoicePayload` stay); `signVideoGenVoiceUrls` removed from storage (Task 4 adds `signRevoicedVideoUrl`); focus view with no voice picker, no `voiceId` sent, estimate video-only; `VideoGenNodeData.voiceId` removed.
- Kept for later tasks: `voice-catalog.ts`, `voices-cache.ts`, `voice-filters.ts`, `voice-labels.ts`, `api.ts` (`elevenLabsApi`), all `/api/elevenlabs/voices*` routes, `use-voice-browser.ts`, `video-gen-voice-picker-{filters,list,row,meta}.tsx`, `readVoiceMeta` (legacy display), `video-revoice.ts` (replaced in Task 3).

- [ ] **Step 1: Update tests to describe the new behaviour (they fail first)**

In `src/app/api/nodes/[id]/video-generate/route.test.ts`: delete the whole `describe("POST video-generate — voice change (D282)", …)` block and the `getVoiceCached`/`signVideoGenVoiceUrls` mocks and the `@/lib/elevenlabs/voices-cache` / `@/lib/storage` `vi.mock`s it used; keep the `simpleGraph` helper; add:

```ts
describe("POST video-generate — no voice at generate time (D284)", () => {
  it("ignores a voiceId in the body and never sends a voice to the task", async () => {
    mocks.graph = simpleGraph();
    const res = await post({ modelId: GEMINI_OMNI_MODEL_ID, params: {}, voiceId: "v1" });
    expect(res.status).toBe(202);
    expect(mocks.triggerTask.mock.calls[0][1]).not.toHaveProperty("voice");
  });
});
```

In `src/lib/generations/complete.test.ts`: delete the three `stored: true` voice tests that expect `meta.voice` settlement and the custom-rate settlement test; keep the non-stored regression test and the bucket-guard test; add:

```ts
it("ignores a legacy meta.voice on a video generation — video cost only, no voice in params", async () => {
  await completeGeneration({
    generationId: "g1", status: "succeeded", stored: true, videoUrl: ORIGINAL, durationSeconds: 8,
    meta: { voice: voice("applied") },
  });
  expect(mocks.settleGeneration).toHaveBeenCalledWith(expect.objectContaining({ actualAmount: usdToFinalCredits(videoUsd()) }));
  expect(mocks.insertVersion).toHaveBeenCalledWith(
    expect.objectContaining({ paramsUsed: expect.not.objectContaining({ voice: expect.anything() }) }),
  );
});
```

In `src/lib/storage/video-gen-voice-urls.test.ts`: delete the `signVideoGenVoiceUrls` describe (keep `pathForVideoGenVoice` and `isOwnStoredUrl`).

- [ ] **Step 2: Run to see failures**

Run: `npx vitest run "src/app/api/nodes/[id]/video-generate" src/lib/generations src/lib/storage`
Expected: the new tests FAIL (voice still forwarded / still settled).

- [ ] **Step 3: Remove the code**

`video-generate/route.ts`: remove `voiceId` from `GenerateBodySchema`; delete the whole D282 voice-guard block (from `const voiceId = mockMode ? …` through `voicePriceMultiplier = …`), the `voiceUsd` term (estimate becomes `usdToFinalCredits(estimate.usd)`), the `let voice: VoicePayload | undefined; if (voiceId && voiceName) {…}` block and the `...(voice ? { voice } : {})` spread; delete now-unused imports (`voiceChangeBlockedReason`, `getVoiceCached`, `ElevenLabsKeyMissingError`, `VOICE_NOT_SET_UP_MESSAGE`, `computeVoiceChangeCost`, `signVideoGenVoiceUrls`, `VoicePayload`). Keep `const mockMode = body.mock === true;` where it is used.

`trigger/video-generate.ts`: restore the pre-D282 shape — imports back to `import { task, logger, wait } from "@trigger.dev/sdk/v3";` (drop `AbortTaskRunError`, `deliverWithVoice`, `OriginalStoreError`, `fetchBytes`, `putBytes`, `videoDownloadHeaders`, `VoicePayload`, `videoRevoiceTask`); remove `voice?: VoicePayload` from the payload type; delete the entire `if (payload.voice) { … return; }` block. The success `postWebhook({ generationId, status: "succeeded", videoUrl, durationSeconds })` path is the only one left. Confirm with `git diff 35af218 -- trigger/video-generate.ts` that the result equals the pre-D282 file except for any unrelated later edits.

`complete.ts`: delete `const voice = readVoiceMeta(input.meta?.voice);`, the `...(voice ? { voice } : {})` spread, the `voiceUsd`/`totalUsd` terms and the `computeVoiceChangeCost`/`readVoiceMeta` imports; settlement returns to `const actualCredits = cost ? usdToFinalCredits(cost.usd) : 0;` and `costUsd: cost?.usd`. Keep the `stored` branch and bucket guard (Task 4 uses them).

`types.ts`: delete `VoicePayload` and `RevoiceResult`. Delete `deliver.ts` and its test.

`storage/index.ts`: delete `signVideoGenVoiceUrls` and `VoiceUploadUrls` (keep `VOICE_UPLOAD_EXPIRY_MS` — Task 4 reuses it — and `isOwnStoredUrl`).

Focus view (`video-gen-focus-view.tsx`): delete the imports of `VideoGenVoicePicker`/`resolveEffectiveVoiceId`/`PendingVoiceSave`, `useSelectedVoice`, `voiceChangeBlockedReason`, `computeVoiceChangeCost`; delete `voiceId: voiceIdProp` from Props/destructure; delete `pendingVoice`, `voiceRefreshKey`, `selectedVoice`, `voiceBlockedReason`, `effectiveVoiceId`, `effectiveSelectedVoice`, `voiceCostUsd`; estimate returns to `const estimatedCredits = videoCostEstimate ? usdToFinalCredits(videoCostEstimate.usd) : null;`; remove `...(effectiveVoiceId ? { voiceId: effectiveVoiceId } : {})` from `doGenerate`; remove the `|| Boolean(pendingVoice)` term and its tooltip branch from `disableGenerate`/`disableGenerateReason`; delete the `<LeftSection icon={Mic} label="Voice">…</LeftSection>` block (and the `Mic` import if unused). KEEP `activeVoice = readVoiceMeta(...)` and its "Voice change failed" note (legacy versions).

`video-gen-node.tsx`: remove `voiceId={d.voiceId ?? null}`. `canvas-nodes.ts`: remove `voiceId` from `VideoGenNodeData`. `video-gen/api.ts`: remove `voiceId` from `StartGenerationPayload`.

Delete `video-gen-voice-picker.tsx`, its test, and `src/hooks/use-selected-voice.ts`.

- [ ] **Step 4: Verify**

Run: `npx vitest run "src/app/api/nodes/[id]/video-generate" src/lib/generations src/lib/storage src/lib/voice-change src/components/nodes && npx tsc --noEmit -p . && grep -rn "voiceId" src/app/api/nodes/\[id\]/video-generate/route.ts trigger/video-generate.ts src/lib/video-gen/api.ts`
Expected: tests PASS, tsc clean, grep prints nothing.

- [ ] **Step 5: Commit**

```bash
git add -A "src/app/api/nodes/[id]/video-generate" trigger/video-generate.ts src/lib/generations src/lib/voice-change src/lib/storage src/components/nodes src/hooks src/lib/canvas-nodes.ts src/lib/video-gen/api.ts
git commit -m "refactor(voice): Generate is plain video again; drop generate-time voice (D284)"
```

---

### Task 2: Voice change settings + ElevenLabs request fields

**Files:**

- Create: `src/lib/elevenlabs/voice-settings.ts`, `src/lib/elevenlabs/__tests__/voice-settings.test.ts`
- Modify: `src/lib/elevenlabs/client.ts` (`speechToSpeech`), `src/lib/elevenlabs/__tests__/client.test.ts`

**Interfaces:**

- Produces:
  - `VOICE_CHANGE_MODELS: readonly [{ value: "eleven_multilingual_sts_v2"; label: "Multilingual" }, { value: "eleven_english_sts_v2"; label: "English" }]`
  - `VoiceChangeSettingsSchema` (zod) and `type VoiceChangeSettings = { stability: number; similarity: number; style: number; speakerBoost: boolean; removeBackgroundNoise: boolean; modelId: "eleven_multilingual_sts_v2" | "eleven_english_sts_v2"; seed?: number }`
  - `DEFAULT_VOICE_CHANGE_SETTINGS: VoiceChangeSettings`
  - `elevenLabsVoiceSettings(s): { stability: number; similarity_boost: number; style: number; use_speaker_boost: boolean }`
  - `speechToSpeech(args: { audio: Buffer; voiceId: string; settings?: VoiceChangeSettings }, fetchImpl?)`

- [ ] **Step 1: Write the failing tests**

`src/lib/elevenlabs/__tests__/voice-settings.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  DEFAULT_VOICE_CHANGE_SETTINGS, VoiceChangeSettingsSchema, elevenLabsVoiceSettings, VOICE_CHANGE_MODELS,
} from "../voice-settings";

describe("voice change settings", () => {
  it("defaults to ElevenLabs' own defaults", () => {
    expect(DEFAULT_VOICE_CHANGE_SETTINGS).toEqual({
      stability: 50, similarity: 75, style: 0, speakerBoost: true, removeBackgroundNoise: false,
      modelId: "eleven_multilingual_sts_v2",
    });
    expect(VOICE_CHANGE_MODELS.map((m) => m.value)).toEqual(["eleven_multilingual_sts_v2", "eleven_english_sts_v2"]);
  });

  it("validates ranges, the model and the seed; never accepts speed", () => {
    expect(VoiceChangeSettingsSchema.safeParse(DEFAULT_VOICE_CHANGE_SETTINGS).success).toBe(true);
    expect(VoiceChangeSettingsSchema.safeParse({ ...DEFAULT_VOICE_CHANGE_SETTINGS, stability: 101 }).success).toBe(false);
    expect(VoiceChangeSettingsSchema.safeParse({ ...DEFAULT_VOICE_CHANGE_SETTINGS, modelId: "eleven_v3" }).success).toBe(false);
    expect(VoiceChangeSettingsSchema.safeParse({ ...DEFAULT_VOICE_CHANGE_SETTINGS, seed: 4294967296 }).success).toBe(false);
    expect(VoiceChangeSettingsSchema.safeParse({ ...DEFAULT_VOICE_CHANGE_SETTINGS, seed: 42 }).success).toBe(true);
    const parsed = VoiceChangeSettingsSchema.parse({ ...DEFAULT_VOICE_CHANGE_SETTINGS, speed: 1.2 });
    expect(parsed).not.toHaveProperty("speed");
  });

  it("maps 0–100 sliders to ElevenLabs' 0–1 voice_settings", () => {
    expect(elevenLabsVoiceSettings({ ...DEFAULT_VOICE_CHANGE_SETTINGS, stability: 30, similarity: 90, style: 10, speakerBoost: false }))
      .toEqual({ stability: 0.3, similarity_boost: 0.9, style: 0.1, use_speaker_boost: false });
  });
});
```

In `client.test.ts`, add to the `speechToSpeech` describe:

```ts
it("sends model, voice_settings, noise removal and seed when settings are given", async () => {
  process.env.ELEVEN_LABS_API_KEY = "k";
  const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
    const form = init.body as FormData;
    expect(form.get("model_id")).toBe("eleven_english_sts_v2");
    expect(JSON.parse(String(form.get("voice_settings")))).toEqual({ stability: 0.5, similarity_boost: 0.75, style: 0, use_speaker_boost: true });
    expect(form.get("remove_background_noise")).toBe("true");
    expect(form.get("seed")).toBe("7");
    expect(form.has("speed")).toBe(false);
    return new Response(new Uint8Array([1]));
  });
  await speechToSpeech(
    {
      audio: Buffer.from([1]), voiceId: "v",
      settings: { stability: 50, similarity: 75, style: 0, speakerBoost: true, removeBackgroundNoise: true, modelId: "eleven_english_sts_v2", seed: 7 },
    },
    fetchImpl as unknown as typeof fetch,
  );
});
```

(Keep the existing test that checks the default `model_id` with no settings.)

- [ ] **Step 2: Run to see failures**

Run: `npx vitest run src/lib/elevenlabs`
Expected: FAIL — `../voice-settings` missing; settings not sent.

- [ ] **Step 3: Implement**

`src/lib/elevenlabs/voice-settings.ts`:

```ts
// D284 — every timing-safe ElevenLabs speech-to-speech setting. Speed is deliberately absent:
// it changes timing and would break lip sync.
import { z } from "zod";

export const VOICE_CHANGE_MODELS = [
  { value: "eleven_multilingual_sts_v2", label: "Multilingual" },
  { value: "eleven_english_sts_v2", label: "English" },
] as const;

const percent = z.number().int().min(0).max(100);

export const VoiceChangeSettingsSchema = z.object({
  stability: percent,
  similarity: percent,
  style: percent,
  speakerBoost: z.boolean(),
  removeBackgroundNoise: z.boolean(),
  modelId: z.enum(["eleven_multilingual_sts_v2", "eleven_english_sts_v2"]),
  seed: z.number().int().min(0).max(4294967295).optional(),
});

export type VoiceChangeSettings = z.infer<typeof VoiceChangeSettingsSchema>;

/** ElevenLabs' own defaults (style 0 is also their recommendation). */
export const DEFAULT_VOICE_CHANGE_SETTINGS: VoiceChangeSettings = {
  stability: 50,
  similarity: 75,
  style: 0,
  speakerBoost: true,
  removeBackgroundNoise: false,
  modelId: "eleven_multilingual_sts_v2",
};

export function elevenLabsVoiceSettings(s: VoiceChangeSettings) {
  return {
    stability: s.stability / 100,
    similarity_boost: s.similarity / 100,
    style: s.style / 100,
    use_speaker_boost: s.speakerBoost,
  };
}
```

(zod `z.object` strips unknown keys like `speed` by default — that's what the test asserts.)

`client.ts` `speechToSpeech`:

```ts
export async function speechToSpeech(
  args: { audio: Buffer; voiceId: string; settings?: VoiceChangeSettings },
  fetchImpl: typeof fetch = fetch,
): Promise<Buffer> {
  const form = new FormData();
  form.append("audio", new Blob([new Uint8Array(args.audio)], { type: "audio/mpeg" }), "audio.mp3");
  form.append("model_id", args.settings?.modelId ?? VOICE_CHANGE_MODEL_ID);
  if (args.settings) {
    form.append("voice_settings", JSON.stringify(elevenLabsVoiceSettings(args.settings)));
    form.append("remove_background_noise", String(args.settings.removeBackgroundNoise));
    if (args.settings.seed !== undefined) form.append("seed", String(args.settings.seed));
  }
  …rest unchanged…
}
```

with `import { elevenLabsVoiceSettings, type VoiceChangeSettings } from "./voice-settings";`.

- [ ] **Step 4: Verify**

Run: `npx vitest run src/lib/elevenlabs && npx tsc --noEmit -p .`
Expected: PASS, clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/elevenlabs
git commit -m "feat(voice): voice change settings and ElevenLabs request fields (D284)"
```

---

### Task 3: Sync check + the `video-voice-change` task

**Files:**

- Modify: `src/lib/media/ffmpeg.ts` (+ `__tests__/ffmpeg.test.ts`), `src/lib/voice-change/revoice.ts` (+ `__tests__/revoice.test.ts`), `src/lib/voice-change/types.ts`, `trigger/video-generate.ts`
- Create: `src/lib/generations/post-webhook.ts` (+ `post-webhook.test.ts`), `trigger/video-voice-change.ts`
- Delete: `trigger/video-revoice.ts`

**Interfaces:**

- Consumes: `speechToSpeech(args with settings)`, `VoiceChangeSettings` (Task 2)
- Produces:
  - `probeDurationSeconds(media: Buffer, ext: string): Promise<number>`
  - `MAX_SYNC_DRIFT_SECONDS = 0.25`; `SYNC_DRIFT_MESSAGE = "The new voice came back out of sync, so nothing was changed."`
  - `RevoicePayload = { sourceUrl: string; voiceId: string; revoicedPutUrl: string; settings: VoiceChangeSettings }`
  - `revoiceVideo(payload, deps): Promise<{ driftMs: number }>` — deps gain `probeDurationSeconds`
  - `postGenerationWebhook(body: object): Promise<Response>` and `postGenerationWebhookSafely(body: object, context: string): Promise<void>` (moved out of `video-generate.ts`)
  - Trigger task `videoVoiceChangeTask` id `"video-voice-change"`, payload `VoiceChangeTaskPayload = RevoicePayload & { generationId: string; revoicedUrl: string; durationSeconds: number }`

- [ ] **Step 1: Failing tests**

`ffmpeg.test.ts` (inside the existing `describe.skipIf(!hasFfmpeg)`):

```ts
it("measures media duration", async () => {
  const audio = await extractAudio(makeClip(true));
  expect(await probeDurationSeconds(audio, "mp3")).toBeGreaterThan(1.8);
  expect(await probeDurationSeconds(audio, "mp3")).toBeLessThan(2.3);
});
```

(import `probeDurationSeconds`).

`revoice.test.ts` — update `deps()` to add `probeDurationSeconds: vi.fn(async () => 8)`, add `settings: DEFAULT_VOICE_CHANGE_SETTINGS` to `PAYLOAD`, update the order test to expect `speechToSpeech` called with `{ audio, voiceId: "v1", settings: DEFAULT_VOICE_CHANGE_SETTINGS }` and the result `{ driftMs: 0 }`, and add:

```ts
it("records the drift and fails non-retryably when the new voice is out of sync", async () => {
  const ok = deps({ probeDurationSeconds: vi.fn().mockResolvedValueOnce(8).mockResolvedValueOnce(8.1) });
  expect(await revoiceVideo(PAYLOAD, ok)).toEqual({ driftMs: 100 });

  const bad = deps({ probeDurationSeconds: vi.fn().mockResolvedValueOnce(8).mockResolvedValueOnce(8.4) });
  const err = await revoiceVideo(PAYLOAD, bad).catch((e) => e);
  expect(err).toBeInstanceOf(NonRetryableRevoiceError);
  expect(err.message).toBe("The new voice came back out of sync, so nothing was changed.");
  expect(bad.putBytes).not.toHaveBeenCalled();
});
```

`src/lib/generations/post-webhook.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { postGenerationWebhook, postGenerationWebhookSafely } from "./post-webhook";

beforeEach(() => { process.env.APP_URL = "https://app.example"; process.env.TRIGGER_WEBHOOK_SECRET = "s"; });
afterEach(() => vi.restoreAllMocks());

describe("postGenerationWebhook", () => {
  it("posts JSON with the bearer secret to /api/webhooks/generation", async () => {
    const f = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}"));
    await postGenerationWebhook({ generationId: "g", status: "failed", error: "x" });
    expect(f).toHaveBeenCalledWith("https://app.example/api/webhooks/generation", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer s" },
      body: JSON.stringify({ generationId: "g", status: "failed", error: "x" }),
    });
  });

  it("the safe variant never throws on a transport failure", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("fetch failed"));
    await expect(postGenerationWebhookSafely({ generationId: "g" }, "test")).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to see failures**

Run: `FFMPEG_PATH=… npx vitest run src/lib/media src/lib/voice-change src/lib/generations/post-webhook.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

`ffmpeg.ts` — add (reads the `Duration:` line ffmpeg prints for any input; no ffprobe dependency):

```ts
/** Duration of an audio/video buffer in seconds, from ffmpeg's own input probe. */
export async function probeDurationSeconds(media: Buffer, ext: string): Promise<number> {
  return inTempDir(async (dir) => {
    const input = path.join(dir, `in.${ext}`);
    await writeFile(input, media);
    const stderr = await new Promise<string>((resolve, reject) => {
      const proc = spawn(ffmpegBin(), ["-hide_banner", "-i", input], { stdio: ["ignore", "ignore", "pipe"] });
      let out = "";
      proc.stderr.on("data", (d: Buffer) => { out += d.toString(); });
      proc.on("error", (e) => reject(new Error(`ffmpeg could not start: ${e.message}`)));
      proc.on("close", () => resolve(out)); // exits non-zero (no output file) — the probe text is what we want
    });
    const m = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(stderr);
    if (!m) throw new Error("ffmpeg could not read the media duration");
    return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
  });
}
```

`types.ts`: `export type RevoicePayload = { sourceUrl: string; voiceId: string; revoicedPutUrl: string; settings: VoiceChangeSettings };` (import type from `@/lib/elevenlabs/voice-settings`).

`revoice.ts`:

```ts
export const MAX_SYNC_DRIFT_SECONDS = 0.25;
export const SYNC_DRIFT_MESSAGE = "The new voice came back out of sync, so nothing was changed.";

export type RevoiceDeps = {
  fetchBytes: (url: string) => Promise<Buffer>;
  extractAudio: (video: Buffer) => Promise<Buffer>;
  speechToSpeech: (args: { audio: Buffer; voiceId: string; settings: VoiceChangeSettings }) => Promise<Buffer>;
  probeDurationSeconds: (media: Buffer, ext: string) => Promise<number>;
  replaceAudio: (video: Buffer, audio: Buffer) => Promise<Buffer>;
  putBytes: (url: string, body: Buffer, contentType: string) => Promise<void>;
};
```

In `revoiceVideo`: pass `settings: payload.settings` to `speechToSpeech`; after it:

```ts
  const [sourceSeconds, voicedSeconds] = [
    await deps.probeDurationSeconds(audio, "mp3"),
    await deps.probeDurationSeconds(voiced, "mp3"),
  ];
  const drift = Math.abs(sourceSeconds - voicedSeconds);
  if (drift > MAX_SYNC_DRIFT_SECONDS) throw new NonRetryableRevoiceError(SYNC_DRIFT_MESSAGE);
```

then replace + put as before, and `return { driftMs: Math.round(drift * 1000) };`. Update the doc comments ("video-voice-change task").

`src/lib/generations/post-webhook.ts` — move `postWebhook`/`postWebhookSafely` out of `trigger/video-generate.ts` unchanged in behaviour:

```ts
// The Trigger.dev tasks' callback into this app (D89: shared-secret auth). No `server-only`.
function target() {
  const appUrl = process.env.APP_URL;
  if (!appUrl) throw new Error("APP_URL env var not set");
  const secret = process.env.TRIGGER_WEBHOOK_SECRET;
  if (!secret) throw new Error("TRIGGER_WEBHOOK_SECRET env var not set");
  return { url: `${appUrl}/api/webhooks/generation`, secret };
}

export async function postGenerationWebhook(body: object): Promise<Response> {
  const { url, secret } = target();
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "(unreadable)");
    console.error("Generation webhook call failed", { status: res.status, body: text });
  }
  return res;
}

/** Report without letting a transport failure replace the thing being reported. */
export async function postGenerationWebhookSafely(body: object, context: string): Promise<void> {
  try {
    await postGenerationWebhook(body);
  } catch (e) {
    const chain: string[] = [];
    let cur: unknown = e;
    for (let i = 0; i < 4 && cur instanceof Error; i += 1) {
      const code = (cur as { code?: unknown }).code;
      chain.push(typeof code === "string" ? `${cur.message} [${code}]` : cur.message);
      cur = (cur as { cause?: unknown }).cause;
    }
    console.error("Generation webhook unreachable", { context, reason: chain.join(" ← ") });
  }
}
```

In `trigger/video-generate.ts` replace the inline `postWebhook`/`postWebhookSafely` with these imports (keep its `logger` calls around them; the long D-numbered comments move with the functions). Behaviour must be identical.

`trigger/video-voice-change.ts` (delete `trigger/video-revoice.ts`):

```ts
import { task, logger, AbortTaskRunError } from "@trigger.dev/sdk/v3";
import { revoiceVideo, NonRetryableRevoiceError } from "@/lib/voice-change/revoice";
import { fetchBytes, putBytes } from "@/lib/voice-change/http";
import { extractAudio, replaceAudio, probeDurationSeconds } from "@/lib/media/ffmpeg";
import { speechToSpeech } from "@/lib/elevenlabs/client";
import { postGenerationWebhook, postGenerationWebhookSafely } from "@/lib/generations/post-webhook";
import type { RevoicePayload } from "@/lib/voice-change/types";

export type VoiceChangeTaskPayload = RevoicePayload & {
  generationId: string;
  revoicedUrl: string;
  durationSeconds: number;
};

// D284 — re-voices a stored version's ORIGINAL audio into a new version. The route resolved the
// source, reserved voice-only credits and signed the upload. maxDuration 120 × 2 attempts keeps a
// run inside the 15-minute stuck-reservation sweep; concurrency 2 matches the ElevenLabs plan's
// speech-to-speech limit (raise both together).
export const videoVoiceChangeTask = task({
  id: "video-voice-change",
  maxDuration: 120,
  retry: { maxAttempts: 2, minTimeoutInMs: 2000, maxTimeoutInMs: 15000, factor: 2 },
  queue: { concurrencyLimit: 2 },
  run: async (payload: VoiceChangeTaskPayload, { ctx }) => {
    logger.info("Changing voice", { generationId: payload.generationId, voiceId: payload.voiceId });
    let driftMs: number;
    try {
      ({ driftMs } = await revoiceVideo(payload, {
        fetchBytes: (url) => fetchBytes(url),
        extractAudio,
        speechToSpeech: (args) => speechToSpeech(args),
        probeDurationSeconds,
        replaceAudio,
        putBytes,
      }));
    } catch (e) {
      const message = e instanceof Error ? e.message : "Voice change failed";
      const finalAttempt = e instanceof NonRetryableRevoiceError || ctx.attempt.number >= 2;
      if (finalAttempt) {
        await postGenerationWebhookSafely({ generationId: payload.generationId, status: "failed", error: message }, "voice change failure");
      }
      if (e instanceof NonRetryableRevoiceError) throw new AbortTaskRunError(message);
      throw e;
    }
    try {
      await postGenerationWebhook({
        generationId: payload.generationId,
        status: "succeeded",
        stored: true,
        videoUrl: payload.revoicedUrl,
        durationSeconds: payload.durationSeconds,
        meta: { voiceChange: { driftMs } },
      });
    } catch (e) {
      // The re-voiced video is stored; retrying would only pay ElevenLabs again.
      throw new AbortTaskRunError(
        `Voice changed but the webhook was unreachable — videoUrl=${payload.revoicedUrl}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  },
});
```

Before writing it, confirm in `node_modules/@trigger.dev/sdk` / `@trigger.dev/core` types that the run function's second argument exposes `ctx.attempt.number` in SDK 4.6.3; if the shape differs, adapt and note it. If "last attempt" can't be detected reliably, post the failure webhook on every failed attempt instead — `completeGeneration` is idempotent (a later success on a failed generation is ignored), so prefer: post failure only for non-retryable errors, and rely on the 15-minute sweep for exhausted retries; document whichever you choose.

- [ ] **Step 4: Verify**

Run: `FFMPEG_PATH=… npx vitest run src/lib/media src/lib/voice-change src/lib/generations && npx tsc --noEmit -p . && grep -rn "video-revoice\|videoRevoiceTask" src trigger`
Expected: PASS; tsc clean; grep prints nothing.

- [ ] **Step 5: Commit**

```bash
git add -A src/lib/media src/lib/voice-change src/lib/generations/post-webhook.ts src/lib/generations/post-webhook.test.ts trigger
git commit -m "feat(voice): video-voice-change task with ElevenLabs settings and a sync check (D284)"
```

---

### Task 4: `POST /api/nodes/[id]/voice-change` + completion as a new version

**Files:**

- Create: `src/lib/voice-change/record.ts`, `src/lib/voice-change/source.ts` (+ `__tests__/source.test.ts`), `src/app/api/nodes/[id]/voice-change/route.ts` (+ `route.test.ts`)
- Modify: `src/lib/storage/index.ts` (+ test), `src/lib/db/types.ts:113`, `src/lib/voice-change/types.ts`, `src/lib/generations/complete.ts` (+ `complete.test.ts`)

**Interfaces:**

- Consumes: `VoiceChangeSettingsSchema`, `VoiceChangeSettings` (Task 2); `videoVoiceChangeTask` payload shape (Task 3); `getVoiceCached` (D283); `computeVoiceChangeCost`; `getVersionById`; `isOwnStoredUrl`; `insertGeneration`, `failGeneration`, `reserveCredits`, `refundReservation`, `CreditLimitError`
- Produces:
  - `GenerationRow["type"]` gains `"voice"`
  - `type VoiceChangeRecord = { baseVersionId: string; rootVersionId: string; sourceUrl: string; voiceId: string; voiceName: string; priceMultiplier: number; settings: VoiceChangeSettings; driftMs?: number }`
  - `readVoiceChange(value: unknown): VoiceChangeRecord | null`
  - `resolveVoiceChangeSource(nodeId, baseVersionId, getVersion): Promise<{ ok: true; base: NodeVersionRow; root: NodeVersionRow; sourceUrl: string; durationSeconds: number } | { ok: false; reason: string }>`
  - `signRevoicedVideoUrl(args: { nodeId: string; generationId: string }): Promise<{ putUrl: string; url: string }>`
  - Route body `{ baseVersionId, voiceId, settings }` → `202 { generationId }`

- [ ] **Step 1: Failing tests**

`src/lib/voice-change/__tests__/source.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { resolveVoiceChangeSource, readVoiceChange } from "../source";

vi.mock("@/lib/storage", () => ({ isOwnStoredUrl: (u: string) => u.startsWith("https://storage.googleapis.com/b/") }));

const V = (id: string, over: Record<string, unknown> = {}) => ({
  id, node_id: "n1", org_id: "o", error: null, model_used: "gemini:omni",
  output: `https://storage.googleapis.com/b/${id}.mp4`,
  params_used: { durationSeconds: 8 }, inputs_used: {}, generated_output: null, decision: null, note: null,
  operator: null, operator_user_id: null, ...over,
});

describe("resolveVoiceChangeSource", () => {
  it("uses the chosen version when it is an original", async () => {
    const get = vi.fn(async (id: string) => (id === "v2" ? V("v2") : null));
    const r = await resolveVoiceChangeSource("n1", "v2", get as never);
    expect(r).toMatchObject({ ok: true, sourceUrl: "https://storage.googleapis.com/b/v2.mp4", durationSeconds: 8 });
    if (r.ok) expect(r.root.id).toBe("v2");
  });

  it("follows a voice-changed version back to its root's original audio", async () => {
    const v3 = V("v3", { inputs_used: { voiceChange: { rootVersionId: "v2" } } });
    const get = vi.fn(async (id: string) => (id === "v3" ? v3 : id === "v2" ? V("v2") : null));
    const r = await resolveVoiceChangeSource("n1", "v3", get as never);
    expect(r.ok && r.root.id).toBe("v2");
    expect(r.ok && r.base.id).toBe("v3");
  });

  it("rejects another node's version, a failed version, a non-stored output and an unknown duration", async () => {
    expect((await resolveVoiceChangeSource("n1", "x", vi.fn(async () => V("x", { node_id: "other" })) as never)).ok).toBe(false);
    expect((await resolveVoiceChangeSource("n1", "x", vi.fn(async () => V("x", { error: "boom" })) as never)).ok).toBe(false);
    expect((await resolveVoiceChangeSource("n1", "x", vi.fn(async () => V("x", { output: "https://provider/x.mp4" })) as never)).ok).toBe(false);
    expect((await resolveVoiceChangeSource("n1", "x", vi.fn(async () => V("x", { params_used: {} })) as never)).ok).toBe(false);
    expect((await resolveVoiceChangeSource("n1", "missing", vi.fn(async () => null) as never)).ok).toBe(false);
  });
});

describe("readVoiceChange", () => {
  it("reads a record and rejects garbage", () => {
    const rec = { baseVersionId: "v3", rootVersionId: "v2", sourceUrl: "u", voiceId: "a", voiceName: "Anjali", priceMultiplier: 2, settings: { stability: 50, similarity: 75, style: 0, speakerBoost: true, removeBackgroundNoise: false, modelId: "eleven_multilingual_sts_v2" } };
    expect(readVoiceChange(rec)).toEqual(rec);
    expect(readVoiceChange({ ...rec, priceMultiplier: 0.5 })?.priceMultiplier).toBe(1);
    expect(readVoiceChange({ voiceId: 3 })).toBeNull();
    expect(readVoiceChange(undefined)).toBeNull();
  });
});
```

`src/app/api/nodes/[id]/voice-change/route.test.ts` — follow `video-generate/route.test.ts`'s harness (hoisted mocks; `withNode` bypass calling `fn("n1", {}, { userId: "u1", email: "u@x.com" }, "client-1", "org-1")`):

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { DEFAULT_VOICE_CHANGE_SETTINGS } from "@/lib/elevenlabs/voice-settings";
import { computeVoiceChangeCost } from "@/lib/elevenlabs/cost";
import { usdToFinalCredits } from "@/lib/credits/units";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  resolve: vi.fn(),
  getVoiceCached: vi.fn(),
  insertGeneration: vi.fn(async () => ({ id: "gen-9" })),
  failGeneration: vi.fn(async () => undefined),
  reserveCredits: vi.fn(async () => ({ ok: true })),
  refundReservation: vi.fn(async () => undefined),
  sign: vi.fn(async () => ({ putUrl: "https://put/r", url: "https://storage.googleapis.com/b/gen-9-revoiced.mp4" })),
  trigger: vi.fn(async () => ({ id: "run" })),
}));
vi.mock("@/lib/api/route-helpers", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/route-helpers")>("@/lib/api/route-helpers");
  return { ...actual, withNode: (_r: Request, _p: unknown, fn: (...a: unknown[]) => Promise<Response>) => fn("n1", {}, { userId: "u1", email: "u@x.com" }, "client-1", "org-1") };
});
vi.mock("@/lib/voice-change/source", async () => ({ ...(await vi.importActual<object>("@/lib/voice-change/source")), resolveVoiceChangeSource: mocks.resolve }));
vi.mock("@/lib/elevenlabs/voices-cache", () => ({ getVoiceCached: mocks.getVoiceCached }));
vi.mock("@/lib/db/generations", () => ({ insertGeneration: mocks.insertGeneration, failGeneration: mocks.failGeneration }));
vi.mock("@/lib/db/credit-transactions", () => ({ reserveCredits: mocks.reserveCredits, refundReservation: mocks.refundReservation, CreditLimitError: class extends Error {} }));
vi.mock("@/lib/db/versions", () => ({ getVersionById: vi.fn() }));
vi.mock("@/lib/storage", () => ({ signRevoicedVideoUrl: mocks.sign }));
vi.mock("@trigger.dev/sdk/v3", () => ({ tasks: { trigger: mocks.trigger } }));

import { POST } from "./route";

const ROOT = { id: "v2", model_used: "gemini:omni", params_used: { durationSeconds: 8, resolution: "720p" }, inputs_used: { prompt: "p" } };
const BASE = { id: "v3" };
const post = (body: unknown) => POST(new Request("http://x/api/nodes/n1/voice-change", { method: "POST", body: JSON.stringify(body) }), { params: Promise.resolve({ id: "n1" }) });
const BODY = { baseVersionId: "v3", voiceId: "a1", settings: DEFAULT_VOICE_CHANGE_SETTINGS };

beforeEach(() => {
  vi.clearAllMocks();
  process.env.ELEVEN_LABS_API_KEY = "k";
  mocks.resolve.mockResolvedValue({ ok: true, base: BASE, root: ROOT, sourceUrl: "https://storage.googleapis.com/b/v2.mp4", durationSeconds: 8 });
  mocks.getVoiceCached.mockResolvedValue({ voiceId: "a1", name: "Anjali", priceMultiplier: 2 });
});

describe("POST /api/nodes/[id]/voice-change", () => {
  it("reserves voice-only credits, records the root's model/params and triggers the task", async () => {
    const res = await post(BODY);
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ generationId: "gen-9" });
    expect(mocks.insertGeneration).toHaveBeenCalledWith(expect.objectContaining({
      nodeId: "n1", orgId: "org-1", type: "voice", modelUsed: "gemini:omni",
      paramsSnapshot: { durationSeconds: 8, resolution: "720p" },
      inputsSnapshot: {
        prompt: "p",
        voiceChange: {
          baseVersionId: "v3", rootVersionId: "v2", sourceUrl: "https://storage.googleapis.com/b/v2.mp4",
          voiceId: "a1", voiceName: "Anjali", priceMultiplier: 2, settings: DEFAULT_VOICE_CHANGE_SETTINGS,
        },
      },
    }));
    expect(mocks.reserveCredits).toHaveBeenCalledWith("org-1", "gen-9", usdToFinalCredits(computeVoiceChangeCost(8, 2).usd));
    expect(mocks.trigger).toHaveBeenCalledWith("video-voice-change", {
      generationId: "gen-9", sourceUrl: "https://storage.googleapis.com/b/v2.mp4", voiceId: "a1",
      settings: DEFAULT_VOICE_CHANGE_SETTINGS, revoicedPutUrl: "https://put/r",
      revoicedUrl: "https://storage.googleapis.com/b/gen-9-revoiced.mp4", durationSeconds: 8,
    });
  });

  it("400s before recording anything on a bad source, a gone voice, bad settings or no key", async () => {
    mocks.resolve.mockResolvedValueOnce({ ok: false, reason: "Pick a finished video version." });
    expect((await post(BODY)).status).toBe(400);
    mocks.getVoiceCached.mockResolvedValueOnce(null);
    expect((await post(BODY)).status).toBe(400);
    expect((await post({ ...BODY, settings: { ...DEFAULT_VOICE_CHANGE_SETTINGS, stability: 500 } })).status).toBe(400);
    delete process.env.ELEVEN_LABS_API_KEY;
    expect((await post(BODY)).status).toBe(400);
    expect(mocks.insertGeneration).not.toHaveBeenCalled();
    expect(mocks.reserveCredits).not.toHaveBeenCalled();
  });

  it("fails and refunds if the trigger throws after reserving", async () => {
    mocks.trigger.mockRejectedValueOnce(new Error("trigger down"));
    const res = await post(BODY);
    expect(res.status).toBe(500);
    expect(mocks.failGeneration).toHaveBeenCalled();
    expect(mocks.refundReservation).toHaveBeenCalledWith({ orgId: "org-1", generationId: "gen-9" });
  });
});
```

`complete.test.ts` — add (fixture: `mocks.generation` with `type: "voice"`, `model_used: "gemini:omni"` (use `GEMINI_OMNI_MODEL_ID`), `params_snapshot: { durationSeconds: 8 }`, `inputs_snapshot: { prompt: "p", voiceChange: { …record with priceMultiplier 2… } }`):

```ts
describe("completeGeneration — voice change (D284)", () => {
  it("appends a new version with the root's model/params, the voice record + drift, and charges the voice only", async () => {
    mocks.generation = { ...mocks.generation, type: "voice", params_snapshot: { durationSeconds: 8 }, inputs_snapshot: { prompt: "p", voiceChange: VC } };
    await completeGeneration({ generationId: "g1", status: "succeeded", stored: true, videoUrl: REVOICED, durationSeconds: 8, meta: { voiceChange: { driftMs: 40 } } });
    expect(mocks.insertVersion).toHaveBeenCalledWith(expect.objectContaining({
      output: REVOICED,
      modelUsed: GEMINI_OMNI_MODEL_ID,
      paramsUsed: { durationSeconds: 8 },
      inputsUsed: { prompt: "p", voiceChange: { ...VC, driftMs: 40 } },
    }));
    expect(mocks.settleGeneration).toHaveBeenCalledWith(expect.objectContaining({ actualAmount: usdToFinalCredits(computeVoiceChangeCost(8, 2).usd) }));
  });

  it("a failed voice change creates no version and refunds", async () => {
    mocks.generation = { ...mocks.generation, type: "voice", inputs_snapshot: { voiceChange: VC } };
    await completeGeneration({ generationId: "g1", status: "failed", error: "The new voice came back out of sync, so nothing was changed." });
    expect(mocks.insertVersion).not.toHaveBeenCalled();
    expect(mocks.refundReservation).toHaveBeenCalled();
  });
});
```

with `const VC = { baseVersionId: "v3", rootVersionId: "v2", sourceUrl: ORIGINAL, voiceId: "a1", voiceName: "Anjali", priceMultiplier: 2, settings: DEFAULT_VOICE_CHANGE_SETTINGS };`.

Storage test — add:

```ts
describe("signRevoicedVideoUrl", () => {
  it("signs one 2-hour video/mp4 upload for the generation", async () => {
    const r = await signRevoicedVideoUrl({ nodeId: "n1", generationId: "g1" });
    const p = "clients/c1/canvases/ca1/nodes/n1/video-gen/g1-revoiced.mp4";
    expect(r).toEqual({ putUrl: `https://signed.example/${p}`, url: `https://storage.googleapis.com/test-bucket/${p}` });
    expect(_signPutUrl).toHaveBeenCalledWith(p, "video/mp4", 2 * 60 * 60 * 1000);
  });
});
```

- [ ] **Step 2: Run to see failures**

Run: `npx vitest run src/lib/voice-change src/lib/generations src/lib/storage "src/app/api/nodes/[id]/voice-change"`
Expected: FAIL.

- [ ] **Step 3: Implement**

`db/types.ts:113`: `type: "image" | "video" | "prompt" | "voice";`

`voice-change/types.ts` — add `VoiceChangeRecord` (as in Interfaces).

`src/lib/voice-change/record.ts` (client-safe — no storage import; the UI in Tasks 5–6 reads it):

```ts
import { VoiceChangeSettingsSchema } from "@/lib/elevenlabs/voice-settings";
import type { VoiceChangeRecord } from "./types";

export function readVoiceChange(value: unknown): VoiceChangeRecord | null {
  const v = value as Record<string, unknown> | null;
  if (!v || typeof v !== "object") return null;
  const str = (k: string) => (typeof v[k] === "string" ? (v[k] as string) : null);
  const settings = VoiceChangeSettingsSchema.safeParse(v.settings);
  if (!str("baseVersionId") || !str("rootVersionId") || !str("voiceId") || !str("voiceName") || !str("sourceUrl") || !settings.success) return null;
  return {
    baseVersionId: str("baseVersionId")!, rootVersionId: str("rootVersionId")!, sourceUrl: str("sourceUrl")!,
    voiceId: str("voiceId")!, voiceName: str("voiceName")!,
    priceMultiplier: typeof v.priceMultiplier === "number" && v.priceMultiplier >= 1 ? v.priceMultiplier : 1,
    settings: settings.data,
    ...(typeof v.driftMs === "number" ? { driftMs: v.driftMs } : {}),
  };
}
```

`src/lib/voice-change/source.ts` (server-side — imports storage):

```ts
import type { NodeVersionRow } from "@/lib/db/types";
import { isOwnStoredUrl } from "@/lib/storage";

export { readVoiceChange } from "./record";

function durationOf(params: Record<string, unknown>): number {
  const d = Number(params.durationSeconds ?? params.duration ?? params.seconds);
  return Number.isFinite(d) && d > 0 ? d : 0;
}

/** D284 — the version to re-voice: the chosen one, or (if it was itself voice-changed) its root's original audio. */
export async function resolveVoiceChangeSource(
  nodeId: string,
  baseVersionId: string,
  getVersion: (id: string) => Promise<NodeVersionRow | null>,
): Promise<
  | { ok: true; base: NodeVersionRow; root: NodeVersionRow; sourceUrl: string; durationSeconds: number }
  | { ok: false; reason: string }
> {
  const base = await getVersion(baseVersionId);
  if (!base || base.node_id !== nodeId) return { ok: false, reason: "That version isn't on this node." };
  const rootId = (base.inputs_used?.voiceChange as { rootVersionId?: unknown } | undefined)?.rootVersionId;
  const root = typeof rootId === "string" ? await getVersion(rootId) : base;
  if (!root || root.node_id !== nodeId) return { ok: false, reason: "The original version of this take is gone." };
  if (root.error || typeof root.output !== "string" || !isOwnStoredUrl(root.output)) {
    return { ok: false, reason: "Pick a finished video version to change its voice." };
  }
  const durationSeconds = durationOf(root.params_used ?? {});
  if (!durationSeconds) return { ok: false, reason: "This version has no recorded duration, so its voice can't be priced." };
  return { ok: true, base, root, sourceUrl: root.output, durationSeconds };
}
```

(If `@/lib/storage` imports `server-only`, that's fine here — `source.ts` is only used by the route.)

`storage/index.ts`:

```ts
// D284 — the task has no GCS credentials; the voice-change route signs the one upload up front.
export async function signRevoicedVideoUrl(args: { nodeId: string; generationId: string }): Promise<{ putUrl: string; url: string }> {
  const { clientId, canvasId } = await resolveOwnership(args.nodeId);
  const path = pathForVideoGenVoice({ clientId, canvasId, nodeId: args.nodeId, generationId: args.generationId, variant: "revoiced" });
  return { putUrl: await _signPutUrl(path, "video/mp4", VOICE_UPLOAD_EXPIRY_MS), url: publicUrlFor(path) };
}
```

`src/app/api/nodes/[id]/voice-change/route.ts`:

```ts
import { z } from "zod";
import { tasks } from "@trigger.dev/sdk/v3";
import { apiError, apiOk, withNode } from "@/lib/api/route-helpers";
import { getVersionById } from "@/lib/db/versions";
import { insertGeneration, failGeneration } from "@/lib/db/generations";
import { reserveCredits, refundReservation, CreditLimitError } from "@/lib/db/credit-transactions";
import { usdToFinalCredits } from "@/lib/credits/units";
import { computeVoiceChangeCost } from "@/lib/elevenlabs/cost";
import { VoiceChangeSettingsSchema } from "@/lib/elevenlabs/voice-settings";
import { VOICE_NOT_SET_UP_MESSAGE } from "@/lib/elevenlabs/constants";
import { getVoiceCached } from "@/lib/elevenlabs/voices-cache";
import { resolveVoiceChangeSource } from "@/lib/voice-change/source";
import { signRevoicedVideoUrl } from "@/lib/storage";
import type { VoiceChangeRecord } from "@/lib/voice-change/types";

const BodySchema = z.object({
  baseVersionId: z.string().min(1),
  voiceId: z.string().min(1),
  settings: VoiceChangeSettingsSchema,
});

// D284 — Change voice on an existing version: a new `voice` generation that appends a version.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withNode(req, params, async (nodeId, _node, caller, clientId, effectiveOrgId) => {
    const parsed = BodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return apiError("Invalid voice change settings.", 400);
    const { baseVersionId, voiceId, settings } = parsed.data;
    if (!process.env.ELEVEN_LABS_API_KEY) return apiError(VOICE_NOT_SET_UP_MESSAGE, 400);

    const source = await resolveVoiceChangeSource(nodeId, baseVersionId, getVersionById);
    if (!source.ok) return apiError(source.reason, 400);

    let voice;
    try {
      voice = await getVoiceCached(voiceId);
    } catch {
      return apiError("Could not reach ElevenLabs to check the voice. Try again.", 400);
    }
    if (!voice) return apiError("That voice is no longer on the ElevenLabs account. Pick another voice.", 400);

    const voiceChange: VoiceChangeRecord = {
      baseVersionId,
      rootVersionId: source.root.id,
      sourceUrl: source.sourceUrl,
      voiceId,
      voiceName: voice.name,
      priceMultiplier: voice.priceMultiplier,
      settings,
    };
    const generation = await insertGeneration({
      nodeId,
      orgId: effectiveOrgId,
      clientId,
      userId: caller.userId,
      userEmail: caller.email,
      type: "voice",
      modelUsed: source.root.model_used ?? undefined,
      paramsSnapshot: source.root.params_used ?? {},
      inputsSnapshot: { ...(source.root.inputs_used ?? {}), voiceChange },
    });

    try {
      const credits = usdToFinalCredits(computeVoiceChangeCost(source.durationSeconds, voice.priceMultiplier).usd);
      const reservation = await reserveCredits(effectiveOrgId, generation.id, credits);
      if (!reservation.ok) throw new CreditLimitError("Monthly credit limit reached");
      const upload = await signRevoicedVideoUrl({ nodeId, generationId: generation.id });
      await tasks.trigger("video-voice-change", {
        generationId: generation.id,
        sourceUrl: source.sourceUrl,
        voiceId,
        settings,
        revoicedPutUrl: upload.putUrl,
        revoicedUrl: upload.url,
        durationSeconds: source.durationSeconds,
      });
      return apiOk({ generationId: generation.id }, 202);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Voice change failed";
      await failGeneration({ generationId: generation.id, error: message }).catch(() => null);
      await refundReservation({ orgId: effectiveOrgId, generationId: generation.id }).catch(() => null);
      return apiError(message, e instanceof CreditLimitError ? 402 : 500);
    }
  });
}
```

`complete.ts` — after the stored-URL block, branch on the generation type:

```ts
  // D284 — a voice change appends a version: the root's model/params/inputs + the voice record.
  const voiceChange = generation.type === "voice" ? readVoiceChange(generation.inputs_snapshot?.voiceChange) : null;
  if (generation.type === "voice" && !voiceChange) {
    await failAndRefund(input.generationId, generation.org_id, "Voice change record is missing");
    return;
  }
  const driftMs = (input.meta?.voiceChange as { driftMs?: unknown } | undefined)?.driftMs;
```

In `insertVersion`: `inputsUsed: voiceChange ? { ...(generation.inputs_snapshot ?? {}), voiceChange: { ...voiceChange, ...(typeof driftMs === "number" ? { driftMs } : {}) } } : generation.inputs_snapshot ?? {}`. Params stay `{ ...params_snapshot, durationSeconds }`, `modelUsed: generation.model_used` (the route stored the root's model).
Cost:

```ts
  const cost = voiceChange
    ? computeVoiceChangeCost(input.durationSeconds, voiceChange.priceMultiplier)
    : generation.model_used
      ? computeVideoCost(generation.model_used, input.durationSeconds, audioEnabled, resolution)
      : null;
  const actualCredits = cost ? usdToFinalCredits(cost.usd) : 0;
```

and `costUsd: cost?.usd`. Import `readVoiceChange` from `@/lib/voice-change/source` and `computeVoiceChangeCost`.

- [ ] **Step 4: Verify**

Run: `npx vitest run src/lib/voice-change src/lib/generations src/lib/storage "src/app/api/nodes/[id]/voice-change" "src/app/api/nodes/[id]/video-generate" && npx tsc --noEmit -p .`
Expected: PASS, clean.

- [ ] **Step 5: Commit**

```bash
git add -A src/lib/voice-change src/lib/generations src/lib/storage src/lib/db/types.ts "src/app/api/nodes/[id]/voice-change"
git commit -m "feat(voice): voice-change route and completion as a new version (D284)"
```

---

### Task 5: The Change voice workspace (UI)

**Files:**

- Create: `src/hooks/use-voice-choice.ts`, `src/hooks/use-change-voice.ts`, `src/lib/voice-change/workspace.ts` (+ `__tests__/workspace.test.ts`), `src/components/nodes/video-gen-change-voice.tsx`, `src/components/nodes/video-gen-change-voice-browser.tsx`, `src/components/nodes/video-gen-change-voice-settings.tsx`, `src/components/nodes/video-gen-change-voice-toggle.tsx`
- Modify: `src/lib/canvas-nodes.ts` (`VideoGenNodeData.voiceChange`), `src/components/nodes/video-gen-node.tsx`, `src/components/nodes/video-gen-focus-view.tsx` (the right-column header ~1884 and body ~1888)

**Interfaces:**

- Consumes: `useVoiceBrowser` (D283, pass `open` = workspace open), `VideoGenVoicePickerFilters`/`VideoGenVoicePickerList`/`VideoGenVoicePickerMeta` (D283), `elevenLabsApi.saveVoice`, `DEFAULT_VOICE_CHANGE_SETTINGS`/`VOICE_CHANGE_MODELS`/`VoiceChangeSettings` (Task 2), `computeVoiceChangeCost`, `usdToFinalCredits`, `readVoiceChange` (Task 4), `VideoGenVersionSummary`
- Produces:
  - `VideoGenNodeData.voiceChange?: { voiceId: string | null; settings: VoiceChangeSettings }`
  - Pure helpers (`workspace.ts`): `sourceVersionOptions(versions): Array<{ id: string; label: string }>` (succeeded video versions, newest first, labelled `v{n}` by chronological order, suffix " · voice: {name}" for voice-changed ones); `defaultSourceVersionId(versions, activeVersionId): string | null`; `voiceChangeEstimateCredits(durationSeconds, multiplier): number`; `canApplyVoiceChange({ sourceId, voice, saving, running }): { ok: boolean; reason?: string }`
  - `<VideoGenChangeVoice nodeId versions activeVersionId value onChange onApplied />`

- [ ] **Step 1: Failing test for the pure helpers**

`src/lib/voice-change/__tests__/workspace.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { sourceVersionOptions, defaultSourceVersionId, voiceChangeEstimateCredits, canApplyVoiceChange } from "../workspace";
import { computeVoiceChangeCost } from "@/lib/elevenlabs/cost";
import { usdToFinalCredits } from "@/lib/credits/units";

const v = (id: string, createdAt: string, extra: Record<string, unknown> = {}) => ({
  id, createdAt, output: `https://s/${id}.mp4`, error: null, paramsUsed: { durationSeconds: 8 }, inputsUsed: {}, ...extra,
});
const VERSIONS = [
  v("c", "2026-09-25T12:00:00Z", { inputsUsed: { voiceChange: { voiceName: "Anjali", rootVersionId: "b" } } }),
  v("x", "2026-09-25T11:30:00Z", { output: null, error: "boom" }),
  v("b", "2026-09-25T11:00:00Z"),
  v("a", "2026-09-25T10:00:00Z"),
];

describe("workspace helpers", () => {
  it("lists succeeded versions newest first with chronological labels", () => {
    expect(sourceVersionOptions(VERSIONS as never)).toEqual([
      { id: "c", label: "v4 · voice: Anjali" },
      { id: "b", label: "v2" },
      { id: "a", label: "v1" },
    ]);
  });

  it("defaults to the active version when it succeeded, else the newest succeeded one", () => {
    expect(defaultSourceVersionId(VERSIONS as never, "b")).toBe("b");
    expect(defaultSourceVersionId(VERSIONS as never, "x")).toBe("c");
    expect(defaultSourceVersionId([] as never, null)).toBeNull();
  });

  it("estimates voice-only credits with the multiplier", () => {
    expect(voiceChangeEstimateCredits(8, 2)).toBe(usdToFinalCredits(computeVoiceChangeCost(8, 2).usd));
  });

  it("explains why Apply is disabled", () => {
    expect(canApplyVoiceChange({ sourceId: null, voice: true, saving: false, running: false })).toEqual({ ok: false, reason: "Pick a version to change." });
    expect(canApplyVoiceChange({ sourceId: "b", voice: false, saving: false, running: false })).toEqual({ ok: false, reason: "Pick a voice." });
    expect(canApplyVoiceChange({ sourceId: "b", voice: true, saving: true, running: false })).toEqual({ ok: false, reason: "Adding the voice to your ElevenLabs account…" });
    expect(canApplyVoiceChange({ sourceId: "b", voice: true, saving: false, running: true })).toEqual({ ok: false, reason: "A generation is already running on this node." });
    expect(canApplyVoiceChange({ sourceId: "b", voice: true, saving: false, running: false })).toEqual({ ok: true });
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run src/lib/voice-change/__tests__/workspace.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement the helpers**

`src/lib/voice-change/workspace.ts`:

```ts
import { computeVoiceChangeCost } from "@/lib/elevenlabs/cost";
import { usdToFinalCredits } from "@/lib/credits/units";

type VersionLike = {
  id: string;
  createdAt: string;
  output: string | null;
  error: string | null;
  inputsUsed?: { voiceChange?: { voiceName?: string } } & Record<string, unknown>;
};

const succeeded = (v: VersionLike) => Boolean(v.output) && !v.error;

export function sourceVersionOptions(versions: VersionLike[]): Array<{ id: string; label: string }> {
  const chrono = [...versions].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const number = new Map(chrono.map((v, i) => [v.id, i + 1]));
  return [...versions]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .filter(succeeded)
    .map((v) => {
      const voiceName = v.inputsUsed?.voiceChange?.voiceName;
      return { id: v.id, label: `v${number.get(v.id)}${voiceName ? ` · voice: ${voiceName}` : ""}` };
    });
}

export function defaultSourceVersionId(versions: VersionLike[], activeVersionId: string | null): string | null {
  const ok = versions.filter(succeeded);
  if (activeVersionId && ok.some((v) => v.id === activeVersionId)) return activeVersionId;
  return sourceVersionOptions(versions)[0]?.id ?? null;
}

export function voiceChangeEstimateCredits(durationSeconds: number, priceMultiplier: number): number {
  return usdToFinalCredits(computeVoiceChangeCost(durationSeconds, priceMultiplier).usd);
}

export function canApplyVoiceChange(a: { sourceId: string | null; voice: boolean; saving: boolean; running: boolean }): { ok: boolean; reason?: string } {
  if (!a.sourceId) return { ok: false, reason: "Pick a version to change." };
  if (!a.voice) return { ok: false, reason: "Pick a voice." };
  if (a.saving) return { ok: false, reason: "Adding the voice to your ElevenLabs account…" };
  if (a.running) return { ok: false, reason: "A generation is already running on this node." };
  return { ok: true };
}
```

Note: the version labels use chronological position including failed versions (v3 = the failed "x" above), matching how History numbers rows — check `VersionHistoryList`'s numbering and match it exactly; adjust the test if History numbers only succeeded versions.

- [ ] **Step 4: Implement the hooks**

`src/hooks/use-voice-choice.ts` — the selected voice for the workspace, with D283's optimistic Library save moved here from the deleted picker:

```ts
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { elevenLabsApi } from "@/lib/elevenlabs/api";
import type { PickerVoice } from "@/lib/elevenlabs/voice-catalog";

/**
 * D284 — which voice the workspace will apply. `voiceId` persists on the node; `voice` is the full
 * PickerVoice (resolved via the single-voice route, or taken straight from the clicked row). A
 * Library pick is selected instantly and saved to the account in the background; Apply waits on
 * `saving`. A refused save reverts to the previous voice with a toast.
 */
export function useVoiceChoice(voiceId: string | null, onVoiceIdChange: (id: string | null) => void, enabled: boolean) {
  const [voice, setVoice] = useState<PickerVoice | null>(null);
  const [saving, setSaving] = useState(false);
  const pickReq = useRef(0);

  // Resolve a stored id (e.g. reopening the workspace) — only when we don't already hold it.
  useEffect(() => {
    if (!enabled || !voiceId || voice?.voiceId === voiceId || saving) return;
    let cancelled = false;
    fetch(`/api/elevenlabs/voices/${encodeURIComponent(voiceId)}`, { cache: "no-store" })
      .then(async (res) => {
        const json = (await res.json().catch(() => null)) as { voice?: PickerVoice } | null;
        if (cancelled) return;
        if (res.ok && json?.voice) setVoice(json.voice);
        else if (res.status === 404) onVoiceIdChange(null);
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [enabled, voiceId, voice?.voiceId, saving, onVoiceIdChange]);

  const choose = useCallback(
    async (next: PickerVoice) => {
      if (saving) return;
      const previous = { id: voiceId, voice };
      setVoice(next);
      onVoiceIdChange(next.voiceId);
      if (next.source === "account") return;
      const myReq = ++pickReq.current;
      setSaving(true);
      try {
        const saved = await elevenLabsApi.saveVoice({
          publicOwnerId: next.publicOwnerId ?? "",
          voiceId: next.voiceId,
          name: next.name,
        });
        if (myReq !== pickReq.current) return;
        setVoice(saved);
        if (saved.voiceId !== next.voiceId) onVoiceIdChange(saved.voiceId);
      } catch (e) {
        if (myReq !== pickReq.current) return;
        setVoice(previous.voice);
        onVoiceIdChange(previous.id);
        toast.error(`Couldn't use "${next.name}": ${e instanceof Error ? e.message : "Could not save this voice."}`);
      } finally {
        if (myReq === pickReq.current) setSaving(false);
      }
    },
    [saving, voiceId, voice, onVoiceIdChange],
  );

  return { voice: voiceId ? voice : null, saving, choose };
}
```

`src/hooks/use-change-voice.ts`:

```ts
"use client";

import { useState } from "react";
import type { VoiceChangeSettings } from "@/lib/elevenlabs/voice-settings";

/** D284 — posts the voice change. Progress/results arrive through the node's normal generation status + versions. */
export function useChangeVoice(nodeId: string) {
  const [submitting, setSubmitting] = useState(false);
  async function apply(body: { baseVersionId: string; voiceId: string; settings: VoiceChangeSettings }): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/nodes/${nodeId}/voice-change`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) return { ok: true };
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      return { ok: false, error: json?.error ?? "Voice change failed.", status: res.status };
    } finally {
      setSubmitting(false);
    }
  }
  return { apply, submitting };
}
```

- [ ] **Step 5: Implement the components**

`src/components/nodes/video-gen-change-voice-toggle.tsx`:

```tsx
"use client";

import { AudioLines } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

// D284 — the preview header's switch between the player and the Change voice workspace.
export function VideoGenChangeVoiceToggle({ checked, disabled, onCheckedChange }: { checked: boolean; disabled: boolean; onCheckedChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center gap-2">
      <AudioLines className="size-3.5 text-primary" strokeWidth={1.5} />
      <Label htmlFor="change-voice-toggle" className="text-xs font-medium">Change voice</Label>
      <Switch id="change-voice-toggle" checked={checked} disabled={disabled} onCheckedChange={onCheckedChange} />
    </div>
  );
}
```

`src/components/nodes/video-gen-change-voice-browser.tsx` — the D283 browser as a panel (no popover):

```tsx
"use client";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { hasActiveFilters } from "@/lib/elevenlabs/voice-filters";
import type { PickerVoice } from "@/lib/elevenlabs/voice-catalog";
import { useVoiceBrowser, type VoiceTab } from "@/hooks/use-voice-browser";
import { VideoGenVoicePickerFilters } from "./video-gen-voice-picker-filters";
import { VideoGenVoicePickerList } from "./video-gen-voice-picker-list";

// D284 — left half of the workspace: My voices / Voice Library, search, filters, rows with preview.
export function VideoGenChangeVoiceBrowser({ selectedId, onSelect }: { selectedId: string | null; onSelect: (v: PickerVoice) => void }) {
  const b = useVoiceBrowser(true);
  const lib = b.tab === "library";
  return (
    <div className="flex min-h-0 flex-col gap-3">
      <Tabs value={b.tab} onValueChange={(t) => b.setTab(t as VoiceTab)}>
        <TabsList>
          <TabsTrigger value="account">My voices</TabsTrigger>
          <TabsTrigger value="library">Voice Library</TabsTrigger>
        </TabsList>
      </Tabs>
      <VideoGenVoicePickerFilters tab={b.tab} filters={b.filters} accountAll={b.accountAll} onFilter={b.setFilter} onClear={b.clearFilters} />
      <VideoGenVoicePickerList
        tab={b.tab}
        voices={lib ? b.library.voices : b.accountVoices}
        selectedId={selectedId}
        loading={lib ? b.library.loading : b.accountLoading}
        error={lib ? b.library.error : b.accountError}
        filtered={hasActiveFilters(b.filters)}
        infinite={lib ? { hasMore: b.library.hasMore, onMore: b.library.loadMore } : null}
        playingId={b.preview.playingId}
        onSelect={(v) => v && onSelect(v)}
        onTogglePreview={b.preview.toggle}
        onRetry={b.retry}
        onClearFilters={b.clearFilters}
        showOriginal={false}
        fill
      />
    </div>
  );
}
```

Modify `video-gen-voice-picker-list.tsx` props: add `showOriginal?: boolean` (default `true`; when false, don't render the "Original (no change)" row) and `fill?: boolean` (when true the `ScrollArea` uses `className="min-h-0 flex-1"` instead of the fixed `h-[340px]`, and the list's outer wrapper is `flex min-h-0 flex-1 flex-col`). Keep the `contentClassName="w-full min-w-0!"` fix.

`src/components/nodes/video-gen-change-voice-settings.tsx`:

```tsx
"use client";

import { Loader2, Pause, Play, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { EstimatedCreditsLabel } from "./estimated-credits-label";
import { VideoGenVoicePickerMeta } from "./video-gen-voice-picker-meta";
import { VOICE_CHANGE_MODELS, type VoiceChangeSettings } from "@/lib/elevenlabs/voice-settings";
import type { PickerVoice } from "@/lib/elevenlabs/voice-catalog";

type Props = {
  sources: Array<{ id: string; label: string }>;
  sourceId: string | null;
  onSourceChange: (id: string) => void;
  sourceUrl: string | null;
  voice: PickerVoice | null;
  saving: boolean;
  playing: boolean;
  onTogglePreview: () => void;
  settings: VoiceChangeSettings;
  onSettings: (patch: Partial<VoiceChangeSettings>) => void;
  estimatedCredits: number | null;
  applyBlockedReason: string | null;
  submitting: boolean;
  onApply: () => void;
};

function SliderRow({ id, label, hint, value, onChange }: { id: string; label: string; hint?: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <Label htmlFor={id} className="text-xs font-medium">{label}</Label>
        <span className="text-xs tabular-nums text-muted-foreground">{value}</span>
      </div>
      <Slider id={id} min={0} max={100} step={1} value={[value]} onValueChange={(v) => onChange(Array.isArray(v) ? v[0] : v)} className="nodrag" />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

// D284 — right half of the workspace: source version, chosen voice, every timing-safe setting, Apply.
export function VideoGenChangeVoiceSettings(p: Props) {
  return (
    <div className="flex min-h-0 flex-col gap-4 overflow-y-auto rounded-xl border border-border bg-card p-4 shadow-card">
      <div className="flex flex-col gap-1.5">
        <span className="text-eyebrow">Source</span>
        <Select value={p.sourceId ?? undefined} onValueChange={(v) => v && p.onSourceChange(String(v))}>
          <SelectTrigger size="sm" className="nodrag" aria-label="Version to change">
            <SelectValue>{p.sources.find((s) => s.id === p.sourceId)?.label ?? "Pick a version"}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {p.sources.map((s) => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
        {p.sourceUrl && (
          <video src={p.sourceUrl} controls className="aspect-[9/16] max-h-40 w-fit rounded-lg border border-border bg-muted/20" />
        )}
        <p className="text-xs text-muted-foreground">Always re-voiced from this take's original audio.</p>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-eyebrow">Voice</span>
        {p.voice ? (
          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" size="icon-sm" className="nodrag shrink-0" aria-label={`${p.playing ? "Stop" : "Play"} preview of ${p.voice.name}`} disabled={!p.voice.previewUrl} onClick={p.onTogglePreview}>
              {p.playing ? <Pause className="size-4" strokeWidth={1.5} /> : <Play className="size-4" strokeWidth={1.5} />}
            </Button>
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="flex items-center gap-1.5">
                <span className="truncate text-sm font-medium">{p.voice.name}</span>
                {p.voice.priceMultiplier > 1 && <Badge variant="secondary">{p.voice.priceMultiplier}×</Badge>}
              </span>
              {p.saving ? (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Loader2 className="size-3 animate-spin" strokeWidth={1.5} /> Adding to your voices…
                </span>
              ) : (
                <VideoGenVoicePickerMeta labels={p.voice.labels} fields={["gender", "language", "accent"]} />
              )}
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Pick a voice from the list.</p>
        )}
      </div>

      <div className="flex flex-col gap-4">
        <span className="text-eyebrow">Settings</span>
        <SliderRow id="vc-stability" label="Stability" value={p.settings.stability} onChange={(v) => p.onSettings({ stability: v })} hint="Lower is more expressive; higher is steadier." />
        <SliderRow id="vc-similarity" label="Similarity" value={p.settings.similarity} onChange={(v) => p.onSettings({ similarity: v })} hint="How closely to match the chosen voice." />
        <SliderRow id="vc-style" label="Style exaggeration" value={p.settings.style} onChange={(v) => p.onSettings({ style: v })} hint="ElevenLabs recommends 0." />
        <div className="flex items-center justify-between">
          <Label htmlFor="vc-boost" className="text-xs font-medium">Speaker boost</Label>
          <Switch id="vc-boost" checked={p.settings.speakerBoost} onCheckedChange={(v) => p.onSettings({ speakerBoost: v })} />
        </div>
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <Label htmlFor="vc-noise" className="text-xs font-medium">Remove background noise</Label>
            <Switch id="vc-noise" checked={p.settings.removeBackgroundNoise} onCheckedChange={(v) => p.onSettings({ removeBackgroundNoise: v })} />
          </div>
          <p className="text-xs text-muted-foreground">Also removes music and ambience.</p>
        </div>
        <div className="flex items-center justify-between gap-3">
          <Label className="text-xs font-medium">Model</Label>
          <Select value={p.settings.modelId} onValueChange={(v) => v && p.onSettings({ modelId: v as VoiceChangeSettings["modelId"] })}>
            <SelectTrigger size="sm" className="nodrag w-40" aria-label="Model">
              <SelectValue>{VOICE_CHANGE_MODELS.find((m) => m.value === p.settings.modelId)?.label}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {VOICE_CHANGE_MODELS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="vc-seed" className="text-xs font-medium">Seed</Label>
          <Input
            id="vc-seed"
            inputMode="numeric"
            placeholder="Random"
            className="nodrag h-8 w-40"
            value={p.settings.seed ?? ""}
            onChange={(e) => {
              const raw = e.target.value.trim();
              const n = Number(raw);
              p.onSettings({ seed: raw === "" || !Number.isInteger(n) || n < 0 || n > 4294967295 ? undefined : n });
            }}
          />
        </div>
        <p className="text-xs text-muted-foreground">Timing is kept, so lip sync holds. Speed isn't offered because it would break sync.</p>
      </div>

      <Tooltip>
        <TooltipTrigger render={<span className="block w-full" />}>
          <Button type="button" size="lg" className="w-full" onClick={p.onApply} disabled={Boolean(p.applyBlockedReason) || p.submitting}>
            {p.submitting ? <Loader2 className="size-4 animate-spin" strokeWidth={1.5} /> : <Sparkles className="size-4" strokeWidth={1.5} />}
            Change voice
            {!p.submitting && p.estimatedCredits !== null && <EstimatedCreditsLabel credits={p.estimatedCredits} />}
          </Button>
        </TooltipTrigger>
        {p.applyBlockedReason && <TooltipContent side="top">{p.applyBlockedReason}</TooltipContent>}
      </Tooltip>
    </div>
  );
}
```

Before finishing, open `src/components/ui/slider.tsx`, `switch.tsx`, `label.tsx`, `input.tsx` and `select.tsx` and adapt prop names to their actual APIs (e.g. Base UI Slider's `value`/`onValueChange` may take a number or an array; Switch's `onCheckedChange(checked, details)`), noting each adaptation. The seed `Input` shows a raw number; keep the input controlled by a local string state if the controlled-number approach fights typing (e.g. can't clear) — describe what you chose.

`src/components/nodes/video-gen-change-voice.tsx` — the workspace shell:

```tsx
"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { DEFAULT_VOICE_CHANGE_SETTINGS, type VoiceChangeSettings } from "@/lib/elevenlabs/voice-settings";
import { sourceVersionOptions, defaultSourceVersionId, voiceChangeEstimateCredits, canApplyVoiceChange } from "@/lib/voice-change/workspace";
import { useVoiceChoice } from "@/hooks/use-voice-choice";
import { useChangeVoice } from "@/hooks/use-change-voice";
import { useVoiceBrowser } from "@/hooks/use-voice-browser";
import type { VideoGenVersionSummary } from "./video-gen-version-history";
import { VideoGenChangeVoiceBrowser } from "./video-gen-change-voice-browser";
import { VideoGenChangeVoiceSettings } from "./video-gen-change-voice-settings";

export type VoiceChangeNodeState = { voiceId: string | null; settings: VoiceChangeSettings };

type Props = {
  nodeId: string;
  versions: VideoGenVersionSummary[];
  activeVersionId: string | null;
  running: boolean;
  value: VoiceChangeNodeState | undefined;
  onChange: (next: VoiceChangeNodeState) => void;
  onApplied: () => void;
};

// D284 — the Change voice workspace: browser (left) + settings and Apply (right).
export function VideoGenChangeVoice({ nodeId, versions, activeVersionId, running, value, onChange, onApplied }: Props) {
  const state: VoiceChangeNodeState = value ?? { voiceId: null, settings: DEFAULT_VOICE_CHANGE_SETTINGS };
  const sources = useMemo(() => sourceVersionOptions(versions), [versions]);
  const [sourceId, setSourceId] = useState<string | null>(() => defaultSourceVersionId(versions, activeVersionId));
  const sourceVersion = versions.find((v) => v.id === sourceId) ?? null;
  const choice = useVoiceChoice(state.voiceId, (voiceId) => onChange({ ...state, voiceId }), true);
  const preview = useVoiceBrowser(false).preview; // single-voice preview in the settings card
  const { apply, submitting } = useChangeVoice(nodeId);

  const duration = Number(sourceVersion?.paramsUsed?.durationSeconds ?? sourceVersion?.paramsUsed?.duration ?? 0);
  const estimatedCredits = choice.voice && duration > 0 ? voiceChangeEstimateCredits(duration, choice.voice.priceMultiplier) : null;
  const gate = canApplyVoiceChange({ sourceId, voice: Boolean(choice.voice), saving: choice.saving, running });

  async function onApply() {
    if (!gate.ok || !sourceId || !state.voiceId) return;
    const r = await apply({ baseVersionId: sourceId, voiceId: state.voiceId, settings: state.settings });
    if (r.ok) {
      toast.success("Changing the voice — the new version will appear when it's ready.");
      onApplied();
    } else {
      toast.error(r.error);
    }
  }

  return (
    <div className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)_320px] gap-4">
      <VideoGenChangeVoiceBrowser selectedId={state.voiceId} onSelect={(v) => void choice.choose(v)} />
      <VideoGenChangeVoiceSettings
        sources={sources}
        sourceId={sourceId}
        onSourceChange={setSourceId}
        sourceUrl={sourceVersion?.output ?? null}
        voice={choice.voice}
        saving={choice.saving}
        playing={Boolean(choice.voice && preview.playingId === choice.voice.voiceId)}
        onTogglePreview={() => choice.voice && preview.toggle(choice.voice)}
        settings={state.settings}
        onSettings={(patch) => onChange({ ...state, settings: { ...state.settings, ...patch } })}
        estimatedCredits={estimatedCredits}
        applyBlockedReason={gate.ok ? null : gate.reason ?? null}
        submitting={submitting}
        onApply={() => void onApply()}
      />
    </div>
  );
}
```

Note on `useVoiceBrowser(false).preview`: a second hook instance just for the card's preview would run its own account fetch only when `open` is true — passing `false` keeps it idle. If that reads awkwardly, extract the preview part of `useVoiceBrowser` into `src/hooks/use-voice-preview.ts` and use it from both — preferred; do it if it keeps `use-voice-browser.ts` smaller.

- [ ] **Step 6: Wire into the node and focus view**

`canvas-nodes.ts`: add to `VideoGenNodeData`:

```ts
  /** D284 — the Change voice workspace's last choice (voice + settings). */
  voiceChange?: { voiceId: string | null; settings: import("@/lib/elevenlabs/voice-settings").VoiceChangeSettings };
```

(use a normal `import type` at the top instead of an inline import if the file's style prefers it).

`video-gen-node.tsx`: pass `voiceChange={d.voiceChange}` to `VideoGenFocusView`.

`video-gen-focus-view.tsx`:

- Props: `voiceChange?: VoiceChangeNodeState;` + destructure.
- State: `const [changeVoiceOpen, setChangeVoiceOpen] = useState(false);`
- The right-column header (the `<div className="flex items-center gap-1.5">` with `Clapperboard` + "Video" at ~1884) becomes `flex items-center justify-between` with the toggle on the right:

```tsx
<div className="flex items-center justify-between gap-2">
  <div className="flex items-center gap-1.5">
    <Clapperboard className="size-3.5 text-primary" strokeWidth={1.5} />
    <span className="text-eyebrow">{changeVoiceOpen ? "Change voice" : "Video"}</span>
  </div>
  <VideoGenChangeVoiceToggle
    checked={changeVoiceOpen}
    disabled={!editable || !versions.some((v) => v.output && !v.error)}
    onCheckedChange={setChangeVoiceOpen}
  />
</div>
```

- The body `<div className="min-h-0 flex-1">`: when `changeVoiceOpen`, render only

```tsx
<VideoGenChangeVoice
  nodeId={nodeId}
  versions={versions}
  activeVersionId={activeVersionId}
  running={isGenerating}
  value={voiceChangeProp}
  onChange={(next) => onPatch({ voiceChange: next })}
  onApplied={() => setChangeVoiceOpen(false)}
/>
```

  and otherwise the existing skeleton/empty/result branches unchanged.

- Close the workspace when review annotating starts (`reviewAnnotating` true) — the two modes don't combine: in the effect or handler that sets `reviewAnnotating(true)`, also `setChangeVoiceOpen(false)`.

- [ ] **Step 7: Verify**

Run: `npx vitest run src/lib/voice-change src/components/nodes src/lib/elevenlabs && npx tsc --noEmit -p . && npm run lint -- src/components/nodes/video-gen-change-voice*.tsx src/components/nodes/video-gen-voice-picker-list.tsx src/components/nodes/video-gen-focus-view.tsx src/hooks/use-voice-choice.ts src/hooks/use-change-voice.ts src/lib/voice-change/workspace.ts`
Expected: PASS, clean (pre-existing unrelated warnings only).

- [ ] **Step 8: Commit**

```bash
git add -A src/components/nodes src/hooks src/lib/voice-change src/lib/canvas-nodes.ts
git commit -m "feat(voice): Change voice workspace on the Video Gen node (D284)"
```

---

### Task 6: Versions show where the voice came from

**Files:**

- Modify: `src/components/nodes/video-gen-version-history.tsx`, `src/components/nodes/video-gen-usage-popover.tsx`, `src/components/nodes/video-gen-request-panel.tsx`, `src/lib/generations/version-params.ts` (+ test)
- Test: `src/lib/voice-change/__tests__/describe.test.ts`
- Create: `src/lib/voice-change/describe.ts`

**Interfaces:**

- Consumes: `readVoiceChange` (Task 4), `readVoiceMeta` (legacy)
- Produces: `describeVoiceChange(inputsUsed, labelById: Map<string, string>): { title: string; detail: string } | null` — title `"Voice: Anjali"` (+ `" · 2×"` when multiplier > 1), detail `"changed from v2 · stability 50 · similarity 75 · style 0 · speaker boost on · noise removal off · Multilingual"` (+ `" · seed 7"` when set, + `" · drift 40 ms"` when recorded)

- [ ] **Step 1: Failing test**

`src/lib/voice-change/__tests__/describe.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { describeVoiceChange } from "../describe";
import { DEFAULT_VOICE_CHANGE_SETTINGS } from "@/lib/elevenlabs/voice-settings";

const VC = { baseVersionId: "v3id", rootVersionId: "v2id", sourceUrl: "u", voiceId: "a", voiceName: "Anjali", priceMultiplier: 2, settings: { ...DEFAULT_VOICE_CHANGE_SETTINGS, seed: 7 }, driftMs: 40 };

describe("describeVoiceChange", () => {
  it("summarises voice, source and settings", () => {
    expect(describeVoiceChange({ voiceChange: VC }, new Map([["v3id", "v3"]]))).toEqual({
      title: "Voice: Anjali · 2×",
      detail: "changed from v3 · stability 50 · similarity 75 · style 0 · speaker boost on · noise removal off · Multilingual · seed 7 · drift 40 ms",
    });
  });

  it("returns null for a normal generation", () => {
    expect(describeVoiceChange({ prompt: "p" }, new Map())).toBeNull();
  });
});
```

- [ ] **Step 2: Run to see it fail** — `npx vitest run src/lib/voice-change/__tests__/describe.test.ts` → FAIL.
- [ ] **Step 3: Implement**

`src/lib/voice-change/describe.ts`:

```ts
import { VOICE_CHANGE_MODELS } from "@/lib/elevenlabs/voice-settings";
import { readVoiceChange } from "./record";

export function describeVoiceChange(inputsUsed: Record<string, unknown> | undefined, labelById: Map<string, string>) {
  const vc = readVoiceChange(inputsUsed?.voiceChange);
  if (!vc) return null;
  const s = vc.settings;
  const model = VOICE_CHANGE_MODELS.find((m) => m.value === s.modelId)?.label ?? s.modelId;
  const parts = [
    `changed from ${labelById.get(vc.baseVersionId) ?? "an earlier version"}`,
    `stability ${s.stability}`, `similarity ${s.similarity}`, `style ${s.style}`,
    `speaker boost ${s.speakerBoost ? "on" : "off"}`, `noise removal ${s.removeBackgroundNoise ? "on" : "off"}`,
    model,
    ...(s.seed !== undefined ? [`seed ${s.seed}`] : []),
    ...(vc.driftMs !== undefined ? [`drift ${vc.driftMs} ms`] : []),
  ];
  return { title: `Voice: ${vc.voiceName}${vc.priceMultiplier > 1 ? ` · ${vc.priceMultiplier}×` : ""}`, detail: parts.join(" · ") };
}
```

`describe.ts` imports `readVoiceChange` from the client-safe `record.ts` (Task 4), never from `source.ts` (which imports server-only storage).

UI:

- `video-gen-version-history.tsx`: build `labelById` (version id → `v{n}` using the same numbering History uses); widen `VideoGenVersionInputs` with `voiceChange?: unknown`; in each row's `meta`, when `describeVoiceChange(v.inputsUsed, labelById)` is non-null, render its `title` as the first line (`text-primary`, same small text class as the model label) and its `detail` in the param-summary slot; keep the legacy D282 `readVoiceMeta(v.paramsUsed.voice)` line for old versions.
- `video-gen-usage-popover.tsx`: a version whose `inputsUsed.voiceChange` exists shows `meta: "voice change · {voiceName}"` instead of duration/model (its credits are already voice-only). Keep the legacy "· voice" suffix for D282 versions.
- `video-gen-request-panel.tsx` ("Sent to model"): when the version is a voice change, add a "Voice change" section listing the `detail` parts one per row (voice name, source, each setting, drift).
- `version-params.ts`: add `"voiceChange"` handling is not needed (it lives in inputs, not params) — only confirm `describeAllVersionParams` doesn't choke on it; no change expected.

- [ ] **Step 4: Verify**

Run: `npx vitest run src/lib/voice-change src/lib/generations src/components/nodes && npx tsc --noEmit -p . && npm run lint -- <touched files>`
Expected: PASS, clean.

- [ ] **Step 5: Commit**

```bash
git add -A src/lib/voice-change src/components/nodes src/lib/generations
git commit -m "feat(voice): versions show the voice, settings and source of a voice change (D284)"
```

---

### Task 7: Manual check in the running app

- [ ] Run `npm run dev` and `npm run dev:trigger` (`.env.local` has `FFMPEG_PATH`); confirm the Trigger CLI lists `video-voice-change` and no longer `video-revoice`.
- [ ] Generate a Gemini Omni clip → it's plain (no voice step; no `video-voice-change` run).
- [ ] Toggle **Change voice** → workspace replaces the player; Source defaults to the active version; pick a Library voice (instant; "Adding to your voices…" then settles); adjust sliders; Apply shows ≈credits; click Apply → toast, toggle closes, node shows generating, a new version appears; it plays in sync; History row: "Voice: … · changed from vN" with settings; usage row shows "voice change".
- [ ] Change voice again starting from that new version → the job's source is the ORIGINAL version's video (check the `video-voice-change` run payload `sourceUrl`), History says "changed from v{new}".
- [ ] Force a failure (invalid ELEVEN_LABS_API_KEY in the Trigger env only) → no new version, error shown on the node, credits refunded.
- [ ] Restore the original version from History → plays with its original voice.
