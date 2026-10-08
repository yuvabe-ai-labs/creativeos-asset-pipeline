# Avatar Voice Reference Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the profile sheet and the voice optional, and give a generated avatar a voice of its own: a Seedance preview whose audio is extracted and kept as the `reference_audio` every later generation sends.

**Architecture:** The existing `avatar-voice-preview` task gains a second mode. A named voice still runs Gemini Omni and re-voices it through ElevenLabs; the engine's own voice runs Seedance 2.5 (5 s, 480p) from the front image, stores the clip, extracts its audio to a mono mp3 and stores that too. The generation webhook settles the cost and writes `client_avatars.voice_sample`. `buildSeedanceContent()` learns the `reference_audio` part so the sample is usable.

**Tech Stack:** Next.js 16 · TypeScript · Supabase · GCS · Trigger.dev · BytePlus Seedance 2.5 · ffmpeg (Trigger's `ffmpeg()` build extension, `FFMPEG_PATH`) · vitest.

**Spec:** `docs/superpowers/specs/2026-09-29-client-avatars-design.md` §4.2, §4.4, §6.6, §6.7 · **ADR:** D294 (amended), D295, D296

## Global Constraints

- **No migration.** `client_avatars.voice_sample` already exists (migration 0041).
- Every interactive control is a shadcn primitive from `src/components/ui/*` (Base UI: `render`, not `asChild`). Never a raw `<button>`/`<input>`/`<textarea>`.
- Import, don't redefine: `VOICE_MIN_SECONDS` / `VOICE_MAX_SECONDS` come from `@/lib/ugc/constants` (Seedance's own limits, recorded there); `SEEDANCE_MODEL_ID` from `@/lib/video-gen/client-models`; cost from `computeVideoCost` / `computeVoiceChangeCost`; credits from `usdToFinalCredits`.
- API routes use `withClient` / `apiOk` / `apiError` / `withTryCatch`.
- Trigger tasks must not statically import a `server-only` module. `@/lib/video-gen/registry` stays a dynamic `await import`.
- Seedance sample limits: mp3 or wav, **2–30 s**. Clip length **5 s at 480p**, aspect **9:16**.
- Yuvabe design system: tokens only, Lucide at `strokeWidth={1.5}`, `.text-eyebrow` for small-caps labels.
- vitest runs in node (no DOM): components and hooks are verified by `npx tsc --noEmit` and `npx eslint`, not by tests.

---

### Task 1: The sheet and the voice stop blocking Ready (D295)

**Files:**
- Modify: `src/lib/avatars/utils.ts` (`avatarReadinessGaps`)
- Modify: `src/lib/avatars/constants.ts` (`READINESS_GAP_LABELS`)
- Modify: `src/components/avatars/avatar-studio-card.tsx` (the sheet row)
- Test: `src/lib/avatars/__tests__/utils.test.ts`

**Interfaces:**
- Produces: `ReadinessGap = "name" | "front" | "consent"` — the `sheet` and `sheet-stale` members are removed, so `avatar-studio-card.tsx` can no longer call `has("sheet")`.

- [ ] **Step 1: Write the failing tests**

```ts
it("a sheet is optional — an avatar with none is still ready", () => {
  expect(avatarReadinessGaps(makeAvatar({ sheet: null }))).toEqual([]);
});

it("a stale sheet does not block ready either", () => {
  expect(avatarReadinessGaps(makeAvatar({ sheetStale: true }))).toEqual([]);
});
```

Update the two existing cases that expect `"sheet"` / `"sheet-stale"`: the "everything missing" case becomes `["name", "front"]`.

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/lib/avatars/__tests__/utils.test.ts`
Expected: FAIL — `["sheet"]` received where `[]` was expected.

- [ ] **Step 3: Drop the two gaps**

```ts
export function avatarReadinessGaps(avatar: ReadinessInput): ReadinessGap[] {
  const gaps: ReadinessGap[] = [];
  if (!avatar.name.trim()) gaps.push("name");
  if (!avatar.front) gaps.push("front");
  if (needsLikenessConsent(avatar)) gaps.push("consent");
  return gaps;
}
```

Delete `sheet` and `"sheet-stale"` from `READINESS_GAP_LABELS`. Keep `ReadinessInput` as it is: `sheet` and `sheetStale` still feed the card's row.

- [ ] **Step 4: Make the card row informational**

```tsx
<Row
  done={Boolean(avatar?.sheet) && !avatar?.sheetStale}
  label="Profile sheet"
  detail={!avatar?.sheet ? "Optional" : avatar.sheetStale ? "Out of date" : "Added"}
/>
```

- [ ] **Step 5: Run the tests, the type-check and the linter**

Run: `npx vitest run src/lib/avatars && npx tsc --noEmit && npx eslint src/lib/avatars src/components/avatars`
Expected: PASS, no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/avatars src/components/avatars
git commit -m "feat(avatars): the profile sheet and the voice no longer block Ready (D295)"
```

---

### Task 2: Preview modes — the pure rules (D296)

**Files:**
- Modify: `src/lib/avatars/voice-preview.ts`
- Modify: `src/lib/avatars/constants.ts`
- Modify: `src/lib/avatars/schema.ts` (`VoicePreview`)
- Test: `src/lib/avatars/__tests__/voice-preview.test.ts`

**Interfaces:**
- Produces:
  - `type VoicePreviewMode = "named" | "native"`
  - `voicePreviewMode(avatar: Pick<Avatar, "voice">): VoicePreviewMode | null`
  - `VOICE_PREVIEW_ENGINE: Record<VoicePreviewMode, { modelId: string; resolution: string; seconds: number }>`
  - `voicePreviewParams(mode): Record<string, unknown>`
  - `buildVoicePreviewPrompt(line: string, mode: VoicePreviewMode): string`
  - `voicePreviewCostUsd(mode, durationSeconds, resolution, priceMultiplier): number | null`
  - `estimateVoicePreviewCredits(mode, priceMultiplier?): number | null`
  - `voicePreviewBlocker(avatar): string | null`
  - `VoicePreview` gains `mode: VoicePreviewMode` and `voiceId: string | null`.

- [ ] **Step 1: Write the failing tests**

```ts
describe("voicePreviewMode", () => {
  it("a named voice is heard through Omni and a re-voice", () => {
    expect(voicePreviewMode(makeAvatar({ voice: NAMED }))).toBe("named");
  });
  it("the engine's own voice is heard through Seedance", () => {
    expect(voicePreviewMode(makeAvatar({ voice: { mode: "native" } }))).toBe("native");
  });
  it("there is nothing to preview until a voice is declared", () => {
    expect(voicePreviewMode(makeAvatar({ voice: null }))).toBeNull();
  });
});

describe("cost per mode", () => {
  it("a named preview is the Omni clip plus the voice change", () => {
    const video = computeVideoCost(GEMINI_OMNI_MODEL_ID, 6, false, "720p")!.usd;
    expect(voicePreviewCostUsd("named", 6, "720p", 2)).toBeCloseTo(video + computeVoiceChangeCost(6, 2).usd);
  });
  it("a native preview is the Seedance clip alone — Seedance's own voice costs nothing", () => {
    expect(voicePreviewCostUsd("native", 5, "480p", 1))
      .toBeCloseTo(computeVideoCost(SEEDANCE_MODEL_ID, 5, false, "480p")!.usd);
  });
});

describe("voicePreviewParams", () => {
  it("sends Omni its aspect_ratio and Seedance its ratio", () => {
    expect(voicePreviewParams("named")).toEqual({ resolution: "720p", duration: 6, aspect_ratio: "9:16" });
    expect(voicePreviewParams("native")).toEqual({ resolution: "480p", duration: 5, ratio: "9:16" });
  });
});

describe("buildVoicePreviewPrompt", () => {
  it("tells Seedance to speak the line in one clear voice", () => {
    const prompt = buildVoicePreviewPrompt("Hello there.", "native");
    expect(prompt).toContain('"Hello there."');
    expect(prompt).toMatch(/no music/i);
  });
});

describe("voicePreviewBlocker", () => {
  it("needs a declared voice", () => {
    expect(voicePreviewBlocker(makeAvatar({ voice: null }))).toMatch(/choose a voice/i);
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run src/lib/avatars/__tests__/voice-preview.test.ts`
Expected: FAIL — `voicePreviewMode is not a function`.

- [ ] **Step 3: Add the constants**

```ts
// D296 — a native preview is a Seedance clip whose own voice becomes the avatar's reference.
// 480p is the draft tier and the sample is audio, which no resolution improves.
export const AVATAR_VOICE_SAMPLE_SECONDS = 5;
export const AVATAR_VOICE_SAMPLE_RESOLUTION = "480p";
```

- [ ] **Step 4: Implement the rules**

```ts
export type VoicePreviewMode = "named" | "native";

export const VOICE_PREVIEW_ENGINE: Record<VoicePreviewMode, {
  modelId: string; resolution: string; seconds: number;
}> = {
  named: { modelId: GEMINI_OMNI_MODEL_ID, resolution: AVATAR_VOICE_PREVIEW_RESOLUTION, seconds: AVATAR_VOICE_PREVIEW_SECONDS },
  native: { modelId: SEEDANCE_MODEL_ID, resolution: AVATAR_VOICE_SAMPLE_RESOLUTION, seconds: AVATAR_VOICE_SAMPLE_SECONDS },
};

export function voicePreviewMode(avatar: Pick<Avatar, "voice">): VoicePreviewMode | null {
  return avatar.voice?.mode ?? null;
}

export function voicePreviewParams(mode: VoicePreviewMode): Record<string, unknown> {
  const engine = VOICE_PREVIEW_ENGINE[mode];
  const base = { resolution: engine.resolution, duration: engine.seconds };
  // Omni's ratio param is `aspect_ratio`; Seedance's is `ratio`. Neither accepts the other's.
  return mode === "named"
    ? { ...base, aspect_ratio: AVATAR_VOICE_PREVIEW_ASPECT }
    : { ...base, ratio: AVATAR_VOICE_PREVIEW_ASPECT };
}

export function voicePreviewCostUsd(
  mode: VoicePreviewMode, durationSeconds: number, resolution: string | undefined, priceMultiplier: number,
): number | null {
  const video = computeVideoCost(VOICE_PREVIEW_ENGINE[mode].modelId, durationSeconds, false, resolution);
  if (!video) return null;
  // Seedance generates its own voice with the clip; only a named voice is paid for separately.
  return mode === "named" ? video.usd + computeVoiceChangeCost(durationSeconds, priceMultiplier).usd : video.usd;
}
```

`buildVoicePreviewPrompt(line, mode)` keeps the shared body (the person faces the camera, says exactly the line and nothing else, locked-off camera, one clear voice, no music) and adds, for `native`, that the voice should be natural and suit the person — Seedance invents it.

`voicePreviewBlocker` returns "Add a front image before generating a preview." with no front, "Choose a voice before generating a preview." with no declaration, and null otherwise.

- [ ] **Step 5: Run the tests**

Run: `npx vitest run src/lib/avatars`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/avatars
git commit -m "feat(avatars): the preview's engine follows the voice declaration (D296)"
```

---

### Task 3: Extract a voice reference from a clip

**Files:**
- Modify: `src/lib/media/ffmpeg.ts`
- Modify: `src/lib/avatars/voice-preview-run.ts`
- Test: `src/lib/avatars/__tests__/voice-preview-run.test.ts`

**Interfaces:**
- Consumes: `runVoicePreview` and `VoicePreviewRunDeps` from Task 2's file.
- Produces:
  - `extractVoiceReference(video: Buffer, maxSeconds: number): Promise<Buffer>` in `media/ffmpeg.ts`
  - `runNativeVoicePreview(payload, deps): Promise<{ clipUrl, durationSeconds, sample: { url, durationSeconds } }>`
  - `NativeVoicePreviewPayload = { frontUrl, prompt, params, clipPutUrl, clipUrl, samplePutUrl, sampleUrl }`

- [ ] **Step 1: Write the failing tests**

```ts
it("generates from the front image, stores the clip and stores its extracted voice", async () => {
  const deps = makeNativeDeps();
  const result = await runNativeVoicePreview(NATIVE_PAYLOAD, deps);
  expect(deps.generateClip).toHaveBeenCalledWith(
    expect.objectContaining({ referenceUrls: [NATIVE_PAYLOAD.frontUrl], startFrameUrl: undefined }),
  );
  expect(deps.putBytes).toHaveBeenCalledWith(NATIVE_PAYLOAD.clipPutUrl, Buffer.from("video"), "video/mp4");
  expect(deps.putBytes).toHaveBeenCalledWith(NATIVE_PAYLOAD.samplePutUrl, Buffer.from("mp3"), "audio/mpeg");
  expect(result.sample).toEqual({ url: NATIVE_PAYLOAD.sampleUrl, durationSeconds: 5 });
});

it("refuses a clip with no audio track, and stores no sample", async () => {
  const deps = makeNativeDeps({ extractVoiceReference: vi.fn(async () => { throw new Error("no audio"); }) });
  await expect(runNativeVoicePreview(NATIVE_PAYLOAD, deps)).rejects.toThrow(/audio/);
  expect(deps.putBytes).not.toHaveBeenCalledWith(NATIVE_PAYLOAD.samplePutUrl, expect.anything(), expect.anything());
});

it("refuses a sample below Seedance's two-second floor", async () => {
  const deps = makeNativeDeps({ probeDurationSeconds: vi.fn(async () => 1.2) });
  await expect(runNativeVoicePreview(NATIVE_PAYLOAD, deps)).rejects.toThrow(/2 s|two seconds|too short/i);
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run src/lib/avatars/__tests__/voice-preview-run.test.ts`
Expected: FAIL — `runNativeVoicePreview is not a function`.

- [ ] **Step 3: Add the ffmpeg helper**

```ts
/**
 * The clip's voice as a mono mp3 Seedance accepts as `reference_audio` (mp3/wav, 2–30 s).
 * The flags are the UGC bench's (`src/lib/ugc/voice.ts`), which is where this shape was proven;
 * this runs through FFMPEG_PATH, as the rest of this file does, rather than ffmpeg-static.
 */
export async function extractVoiceReference(video: Buffer, maxSeconds: number): Promise<Buffer> {
  return inTempDir(async (dir) => {
    const input = path.join(dir, "in.mp4");
    const output = path.join(dir, "voice.mp3");
    await writeFile(input, video);
    await run(["-i", input, "-map", "0:a:0", "-vn", "-ac", "1", "-ar", "24000",
               "-b:a", "96k", "-t", String(maxSeconds), output]);
    return readFile(output);
  });
}
```

- [ ] **Step 4: Implement the native run**

The steps, in order: `generateClip` (reference image, no start frame — Seedance treats frames and references as mutually exclusive, and a face is a reference) → `fetchBytes(clip.videoUrl)` (the vendor URL expires in 24 h) → `putBytes(clipPutUrl, …, "video/mp4")` → `extractVoiceReference(bytes, VOICE_MAX_SECONDS)` → `probeDurationSeconds(mp3, "mp3")` → throw below `VOICE_MIN_SECONDS` → `putBytes(samplePutUrl, mp3, "audio/mpeg")`. Every failure throws; the task refunds.

- [ ] **Step 5: Run the tests**

Run: `npx vitest run src/lib/avatars`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/avatars src/lib/media
git commit -m "feat(avatars): the native preview's steps — Seedance clip, stored, voice extracted (D296)"
```

---

### Task 4: Store the sample, record it on the avatar

**Files:**
- Modify: `src/lib/storage/paths.ts`, `src/lib/storage/index.ts`
- Modify: `src/lib/avatars/utils.ts` (`AvatarPatch`), `src/lib/avatars/rows.ts` (`COLUMN`)
- Modify: `src/lib/avatars/complete-voice-preview.ts`
- Test: `src/lib/generations/complete.test.ts`

**Interfaces:**
- Produces:
  - `pathForAvatarVoiceSample({ clientId, avatarId, generationId }): string`
  - `signAvatarVoiceSampleUrl({ clientId, avatarId, generationId }): Promise<{ putUrl, url }>`
  - `AvatarPatch` gains `voiceSample`; `COLUMN.voiceSample = "voice_sample"`.

- [ ] **Step 1: Write the failing test**

```ts
it("records the extracted voice on the avatar and settles the Seedance clip alone", async () => {
  mocks.generation = { ...nativePreviewRow };
  await completeGeneration({
    generationId: "g1", status: "succeeded", stored: true, videoUrl: CLIP, durationSeconds: 5,
    meta: { voiceSample: { url: SAMPLE, durationSeconds: 4.8 } },
  });
  expect(mocks.updateAvatar).toHaveBeenCalledWith("c1", "a1", {
    voiceSample: { url: SAMPLE, durationSeconds: 4.8, sourceKey: "g1" },
  });
  expect(mocks.settleGeneration).toHaveBeenCalledWith(expect.objectContaining({
    actualAmount: usdToFinalCredits(voicePreviewCostUsd("native", 5, "480p", 1)!),
  }));
});

it("a failed native preview writes no sample and refunds", async () => {
  mocks.generation = { ...nativePreviewRow };
  await completeGeneration({ generationId: "g1", status: "failed", error: "That clip has no audio track." });
  expect(mocks.updateAvatar).not.toHaveBeenCalled();
  expect(mocks.refundReservation).toHaveBeenCalled();
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/lib/generations/complete.test.ts`
Expected: FAIL — `updateAvatar` never called.

- [ ] **Step 3: Implement**

`pathForAvatarVoiceSample` → `clients/{clientId}/avatars/{avatarId}/voice-sample/{generationId}.mp3`, signed with `audio/mpeg` and `VOICE_UPLOAD_EXPIRY_MS`. In `completeAvatarVoicePreview`, read the mode off `inputs_snapshot`, cost it with `voicePreviewCostUsd(mode, …)`, and on a native success patch the avatar. The patch is best-effort in one direction only: if it throws, the generation still settles — the operator paid for a clip they can play — and the failure is logged.

- [ ] **Step 4: Drop the sample when the front change drops the native voice**

A reference belongs to a declaration Omni cannot honour, so the two go together.

```ts
it("a photo of a real person drops the engine's own voice and its reference together", () => {
  const avatar = makeAvatar({ personType: "generic", voice: { mode: "native" }, voiceSample: SAMPLE });
  expect(frontChangePatch(avatar, makeImage())).toMatchObject({ voice: null, voiceSample: null });
});

it("a named voice and its avatar's reference survive a front change", () => {
  const avatar = makeAvatar({ personType: "generic", voice: NAMED, voiceSample: SAMPLE });
  expect(frontChangePatch(avatar, makeImage(GENERATED)).voiceSample).toBeUndefined();
});
```

In `frontChangePatch`, extend the existing conditional so the sample is cleared in the same
branch that clears the voice: `...(voice !== current.voice ? { voice, voiceSample: null } : {})`.

- [ ] **Step 5: Run the tests**

Run: `npx vitest run src/lib/generations src/lib/avatars src/lib/storage`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib
git commit -m "feat(avatars): store the voice sample and record it on the avatar (D296)"
```

---

### Task 5: The task and the route learn the second mode

**Files:**
- Modify: `trigger/avatar-voice-preview.ts`
- Modify: `src/app/api/clients/[id]/avatars/[avatarId]/voice-preview/route.ts`
- Test: `src/app/api/clients/[id]/avatars/[avatarId]/voice-preview/route.test.ts`

**Interfaces:**
- Consumes: `runVoicePreview`, `runNativeVoicePreview`, `voicePreviewMode`, `voicePreviewParams`, `estimateVoicePreviewCredits`, `signAvatarVoicePreviewUrl`, `signAvatarVoiceSampleUrl`.
- Produces: the task payload is a discriminated union on `mode`.

- [ ] **Step 1: Write the failing tests**

```ts
it("queues a Seedance run for the engine's own voice, with both uploads signed", async () => {
  vi.mocked(getAvatar).mockResolvedValue(makeAvatar({ personType: "generic", front: makeImage(GENERATED), voice: { mode: "native" } }));
  const { POST } = await import("./route");
  expect((await POST(post({ line: "Hi." }), { params })).status).toBe(202);
  expect(reserveCredits).toHaveBeenCalledWith("org-1", "g1", estimateVoicePreviewCredits("native"));
  expect(tasks.trigger).toHaveBeenCalledWith("avatar-voice-preview", expect.objectContaining({
    mode: "native",
    samplePutUrl: "https://signed/sample",
    params: expect.objectContaining({ resolution: "480p", duration: 5 }),
  }));
  expect(getVoiceCached).not.toHaveBeenCalled();
});

it("refuses a preview when no voice is declared", async () => {
  vi.mocked(getAvatar).mockResolvedValue(makeAvatar({ voice: null }));
  const { POST } = await import("./route");
  expect((await POST(post({ line: "Hi." }), { params })).status).toBe(400);
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run "src/app/api/clients/[id]/avatars/[avatarId]/voice-preview"`
Expected: FAIL — the trigger payload has no `mode`.

- [ ] **Step 3: Implement**

The route branches once, on `voicePreviewMode(avatar)`: `named` keeps today's path (look the voice up, price by its multiplier, sign the clip); `native` skips ElevenLabs entirely, prices with `estimateVoicePreviewCredits("native")` and signs both uploads. The task branches the same way and reports `meta.voiceSample` on a native success. Only the ElevenLabs step retries; the paid clip is generated once.

- [ ] **Step 4: Run the tests and the type-check**

Run: `npx vitest run "src/app/api/clients/[id]/avatars" && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app trigger
git commit -m "feat(avatars): the preview route and task run either engine (D296)"
```

---

### Task 6: Seedance accepts a voice reference

**Files:**
- Modify: `src/lib/video-gen/types.ts` (`VideoGenInput`)
- Modify: `src/lib/video-gen/providers/seedance.ts` (`buildSeedanceContent`)
- Test: `src/lib/video-gen/__tests__/seedance.test.ts` (or the file that already covers `buildSeedanceBody`)

**Interfaces:**
- Produces: `VideoGenInput.referenceAudioUrl?: string`.

- [ ] **Step 1: Write the failing tests**

```ts
it("sends the voice reference alongside a first frame", () => {
  const content = buildSeedanceBody({ ...input, startFrameUrl: "f", referenceAudioUrl: "a.mp3" }, 4).content;
  expect(content).toContainEqual({ type: "audio_url", audio_url: { url: "a.mp3" }, role: "reference_audio" });
  expect(content).toContainEqual(expect.objectContaining({ role: "first_frame" }));
});

it("sends it alongside reference images too — audio is outside the frames/references exclusion", () => {
  const content = buildSeedanceBody({ ...input, referenceUrls: ["i.png"], referenceAudioUrl: "a.mp3" }, 4).content;
  expect(content).toContainEqual(expect.objectContaining({ role: "reference_image" }));
  expect(content).toContainEqual(expect.objectContaining({ role: "reference_audio" }));
});

it("sends no audio part when there is no reference", () => {
  const content = buildSeedanceBody(input, 4).content;
  expect(content.some((c) => c.role === "reference_audio")).toBe(false);
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run src/lib/video-gen`
Expected: FAIL — no `reference_audio` part.

- [ ] **Step 3: Implement**

Restructure `buildSeedanceContent` so both branches fall through to one audio append rather than returning early:

```ts
function buildSeedanceContent(input: VideoGenInput, maxRefs: number): SeedanceContent[] {
  const content: SeedanceContent[] = [{ type: "text", text: input.prompt }];
  if (input.startFrameUrl) {
    content.push({ type: "image_url", image_url: { url: input.startFrameUrl }, role: "first_frame" });
    if (input.endFrameUrl) {
      content.push({ type: "image_url", image_url: { url: input.endFrameUrl }, role: "last_frame" });
    }
  } else {
    for (const url of (input.referenceUrls ?? []).slice(0, maxRefs)) {
      content.push({ type: "image_url", image_url: { url }, role: "reference_image" });
    }
  }
  // D296 — audio is a THIRD part type: the frames-XOR-references rule above does not apply to
  // it, so a voice reference travels with either. Free: audio is outside the token formula.
  if (input.referenceAudioUrl) {
    content.push({ type: "audio_url", audio_url: { url: input.referenceAudioUrl }, role: "reference_audio" });
  }
  return content;
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/lib/video-gen`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/video-gen
git commit -m "feat(video-gen): Seedance takes a reference_audio part (D296)"
```

---

### Task 7: The Studio shows the sample

**Files:**
- Modify: `src/components/avatars/avatar-voice-preview.tsx`
- Modify: `src/components/avatars/avatar-studio-voice-step.tsx`
- Modify: `src/components/avatars/avatar-studio-card.tsx`
- Modify: `src/hooks/use-avatar-voice-preview.ts`

- [ ] **Step 1: Show the preview for either declaration**

In the Voice step, the block renders whenever a voice is declared, not only a named one. Its copy follows the mode: for `native`, "A 5-second Seedance clip. Its voice is saved as this avatar's voice reference and sent with every later video, so the voice stays the same." The button reads **Generate voice & sample** / **Regenerate**, with the credit cost as before.

- [ ] **Step 2: Show the saved reference**

Under a finished native clip, an `<audio controls>` for `avatar.voiceSample.url` and a line "Voice reference saved · 4.8s". Use the `Badge` primitive for the out-of-date marker, as the named branch already does.

- [ ] **Step 3: Add the card row**

```tsx
{avatar?.voiceSample && (
  <Row done label="Voice reference" detail={`${avatar.voiceSample.durationSeconds.toFixed(1)}s`} />
)}
```

- [ ] **Step 4: Keep the hook in step**

`useAvatarVoicePreview` already refetches when the declared voice changes; widen its `voiceId` dependency to the declaration itself (`voice?.mode === "named" ? voiceId : voice?.mode ?? null`) so switching between native and named reloads the estimate. A finished native preview must also refresh the avatar, since the sample now lives on it — extend `onSettled` to reload the avatar through `avatarsService.get`.

- [ ] **Step 5: Check it compiles and lints**

Run: `npx tsc --noEmit && npx eslint src/components/avatars src/hooks`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/components src/hooks
git commit -m "feat(avatars): the Voice step generates and shows the voice reference (D296)"
```

---

### Task 8: Record it

**Files:**
- Modify: `docs/superpowers/plans/2026-09-30-avatar-voice-reference.md` (this file — the "as built" note)
- Modify: `docs/superpowers/specs/2026-09-29-client-avatars-design.md` if anything landed differently

- [ ] **Step 1: Run everything**

Run: `npx vitest run src/lib src/app && npx tsc --noEmit && npx eslint src trigger`
Expected: PASS.

- [ ] **Step 2: Note what differs from the spec, if anything, and commit**

```bash
git add docs
git commit -m "docs(avatars): voice reference as built (D296)"
```

---

## Verify in the running app

The task runs on Trigger.dev: `npx trigger.dev@latest dev`, with `APP_URL`, `TRIGGER_WEBHOOK_SECRET`, `BYTEPLUS_API_KEY`, `GOOGLE_GENAI_API_KEY` and `ELEVEN_LABS_API_KEY` set. A native preview costs about $0.52 of real money.

1. Open a **generated** avatar (front from Seedream 5.0 Lite) → **3 · Voice** → **The engine's own voice**.
2. The Preview block appears, explaining that the clip's voice becomes the avatar's reference. Generate.
3. Within a couple of minutes the clip plays with a voice Seedance invented, the audio player shows the saved reference, and the card gains a **Voice reference** row. "Spent on this avatar" rises by about 515.
4. Regenerate: the new clip's voice replaces the reference, and its length updates.
5. Switch to **A named voice** and preview: the Omni + re-voice path still runs, and no sample is written.
6. Replace the generated front with an uploaded photo: the native declaration and the reference both go, and the Voice row reads Optional.
7. Save an avatar with **no sheet at all**: it goes Ready. The card's sheet row reads Optional.
8. An avatar with a stale sheet also saves; the row reads Out of date.

---

## As built (2026-09-30)

Built inline in one session, test-first, in the order above. Commits: `75f342bc` (D295),
`c3f302ab` (D296). Checks at that head: **2811 tests pass**, `tsc --noEmit` clean, eslint clean
on every file touched.

Three things landed differently from the plan, all noted in the spec:

- **`buildSeedanceBody` is now exported** rather than tested through `generate()`. The request's
  shape is the fact worth pinning down, and Gemini Omni's provider already exports its body
  builder for exactly this reason (`buildOmniRequestBody`). New file:
  `src/lib/video-gen/__tests__/seedance-request.test.ts`, which also pins the
  frames-XOR-references rule that was previously untested.
- **The voice reference is written best-effort, after settlement.** If the row cannot be updated
  the generation still succeeds: the clip is generated, stored and paid for by then, and an
  operator who can regenerate is in a better place than one refunded for a clip they can watch.
  The failure is logged.
- **`useAvatarStudio` gained `reload(avatarId)`.** A native preview writes to the avatar row from
  a background task, so the Studio has to re-read it; `replaceAvatar`'s staleness guard applies,
  and the id is a parameter so the callback's identity stays stable for the polling effect.

**Still unmeasured:** no generation has used a stored reference yet — the canvas sends it in
Phase 2, and the vendor's "can differ significantly" warning (handoff §7) is untested either way.
