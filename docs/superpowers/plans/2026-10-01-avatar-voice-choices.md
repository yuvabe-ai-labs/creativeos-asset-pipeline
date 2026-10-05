# Avatar Voice Choices Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Studio's Voice step offers three choices — chosen for me, the library, a custom (cloned) voice — and "chosen for me" is made by the engine the face allows and kept on every model as an ElevenLabs auto voice.

**Architecture:** The preview gains an *engine* (`seedance` | `omni`) beside its *mode* (`native` | `named`): named is always Omni + re-voice; native is Seedance on a Seedream face, Omni otherwise. The generation webhook, after storing a native preview's voice sample, clones it into an auto voice recorded on `avatar.voice.autoVoice`, then marks the preview succeeded. The Voice step is three radio cards over the existing picker and clone form.

**Tech Stack:** Next.js route handlers, Trigger.dev task, ElevenLabs REST (`cloneVoice`, `deleteVoice`), React 19 + Base UI/shadcn, TanStack Query (D300), vitest.

**Spec:** `docs/superpowers/specs/2026-10-01-avatar-voice-choices-design.md` (D301).

## Global Constraints

- No engine, model or provider names, and no provider costs, on the Voice and Preview steps (spec §1.1, §5).
- Copy verbatim from spec §2: card titles "Choose a voice for me", "Pick from the library", "Create a custom voice"; tags "Quickest", "Most choice", "Needs their permission"; consent "I have this person's permission to use their voice."; button "Create voice" / "Creating the voice…". The word "clone" never appears on screen in the Studio.
- No migration: `avatars.voice` is jsonb.
- shadcn/Base UI primitives only; Lucide 1.5 stroke; every click shows feedback at once.
- Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Verify per directory (`npx vitest run <dir>`), plus `npx tsc --noEmit -p .` and eslint on touched files.

---

### Task 1: The preview's engine follows the face

**Files:**
- Modify: `src/lib/avatars/voice-preview.ts`, `src/lib/avatars/voice-preview-run.ts` (payload type), `src/lib/avatars/complete-voice-preview.ts`, `src/lib/avatars/studio-server.ts`, `src/app/api/clients/[id]/avatars/[avatarId]/voice-preview/route.ts`, `trigger/avatar-voice-preview.ts`
- Test: `src/lib/avatars/__tests__/voice-preview.test.ts`, `src/app/api/clients/[id]/avatars/[avatarId]/voice-preview/route.test.ts`, `src/lib/generations/complete.test.ts`

**Interfaces — Produces:**
```ts
export type VoicePreviewEngine = "seedance" | "omni";
export const VOICE_PREVIEW_ENGINE: Record<VoicePreviewEngine, { modelId: string; resolution: string; seconds: number }>;
export function voicePreviewEngine(avatar: Pick<Avatar, "voice" | "front">): VoicePreviewEngine | null;
export function voicePreviewParams(engine: VoicePreviewEngine): Record<string, unknown>;
export function voicePreviewCostUsd(mode, engine, durationSeconds, resolution, priceMultiplier?): number | null;
export function estimateVoicePreviewCredits(mode, engine, priceMultiplier?): number | null;
export function voicePreviewRowEngine(row: Pick<GenerationRow, "inputs_snapshot">): VoicePreviewEngine;
```

- [x] **Step 1: Failing tests** in `voice-preview.test.ts`:
```ts
describe("voicePreviewEngine", () => {
  it("named is always Omni", () => {
    expect(voicePreviewEngine({ voice: NAMED, front: makeImage(GENERATED) })).toBe("omni");
  });
  it("native is Seedance on a Seedream face, Omni on any other", () => {
    expect(voicePreviewEngine({ voice: { mode: "native" }, front: makeImage(GENERATED) })).toBe("seedance");
    expect(voicePreviewEngine({ voice: { mode: "native" }, front: makeImage() })).toBe("omni");
    const nano = { ...GENERATED, modelId: "gemini:gemini-3.1-flash-image" } as typeof GENERATED;
    expect(voicePreviewEngine({ voice: { mode: "native" }, front: makeImage(nano) })).toBe("omni");
  });
  it("is null without a voice or a front", () => {
    expect(voicePreviewEngine({ voice: null, front: makeImage() })).toBeNull();
    expect(voicePreviewEngine({ voice: { mode: "native" }, front: null })).toBeNull();
  });
});
it("params follow the engine's field names", () => {
  expect(voicePreviewParams("omni")).toHaveProperty("aspect_ratio");
  expect(voicePreviewParams("seedance")).toHaveProperty("ratio");
});
it("a native Omni preview costs the clip alone", () => {
  expect(voicePreviewCostUsd("native", "omni", 6, "720p")).toBeLessThan(voicePreviewCostUsd("named", "omni", 6, "720p")!);
});
it("old rows read their engine from the mode", () => {
  expect(voicePreviewRowEngine({ inputs_snapshot: { mode: "native" } } as never)).toBe("seedance");
  expect(voicePreviewRowEngine({ inputs_snapshot: { mode: "native", engine: "omni" } } as never)).toBe("omni");
  expect(voicePreviewRowEngine({ inputs_snapshot: {} } as never)).toBe("omni");
});
```
- [x] **Step 2:** Run `npx vitest run src/lib/avatars/__tests__/voice-preview.test.ts` — FAIL (not exported).
- [x] **Step 3: Implement** in `voice-preview.ts`:
```ts
export type VoicePreviewEngine = "seedance" | "omni";
export const VOICE_PREVIEW_ENGINE = {
  omni: { modelId: GEMINI_OMNI_MODEL_ID, resolution: AVATAR_VOICE_PREVIEW_RESOLUTION, seconds: AVATAR_VOICE_PREVIEW_SECONDS },
  seedance: { modelId: SEEDANCE_MODEL_ID, resolution: AVATAR_VOICE_SAMPLE_RESOLUTION, seconds: AVATAR_VOICE_SAMPLE_SECONDS },
} satisfies Record<VoicePreviewEngine, { modelId: string; resolution: string; seconds: number }>;

/** D301 — named voices are re-voiced Omni clips; the engine's own voice is Seedance's only on a
 *  face Seedance accepts (Seedream 5.0 Lite), and Omni's on every other face. */
export function voicePreviewEngine(avatar: Pick<Avatar, "voice" | "front">): VoicePreviewEngine | null {
  if (!avatar.voice || !avatar.front) return null;
  if (avatar.voice.mode === "named") return "omni";
  const source = avatar.front.source;
  return source.kind === "generated" && isSeedanceFaceModel(source.modelId) ? "seedance" : "omni";
}
export function voicePreviewParams(engine: VoicePreviewEngine) {
  const e = VOICE_PREVIEW_ENGINE[engine];
  const base = { resolution: e.resolution, duration: e.seconds };
  return engine === "omni" ? { ...base, aspect_ratio: AVATAR_VOICE_PREVIEW_ASPECT } : { ...base, ratio: AVATAR_VOICE_PREVIEW_ASPECT };
}
export function voicePreviewCostUsd(mode, engine, durationSeconds, resolution, priceMultiplier = 1) {
  const video = computeVideoCost(VOICE_PREVIEW_ENGINE[engine].modelId, durationSeconds, false, resolution);
  if (!video) return null;
  return mode === "native" ? video.usd : video.usd + computeVoiceChangeCost(durationSeconds, priceMultiplier).usd;
}
export function estimateVoicePreviewCredits(mode, engine, priceMultiplier = 1) {
  const e = VOICE_PREVIEW_ENGINE[engine];
  const usd = voicePreviewCostUsd(mode, engine, e.seconds, e.resolution, priceMultiplier);
  return usd === null ? null : usdToFinalCredits(usd);
}
export function voicePreviewRowEngine(row) {
  const inputs = (row.inputs_snapshot ?? {}) as { engine?: unknown; mode?: unknown };
  if (inputs.engine === "seedance" || inputs.engine === "omni") return inputs.engine;
  return inputs.mode === "native" ? "seedance" : "omni"; // rows before D301
}
```
`isSeedanceFaceModel` is imported from `./generation`. Update the header comment: native is Seedance on a Seedream face, Omni otherwise; its voice is kept either way.
- [x] **Step 4: Callers.**
  - Route POST: `const engine = voicePreviewEngine(avatar)!` (the blocker already guarantees a voice and a front); `voicePreviewParams(engine)`; `modelUsed: VOICE_PREVIEW_ENGINE[engine].modelId`; `inputsSnapshot.engine = engine`; `estimateVoicePreviewCredits(mode, engine, …)`; native payload gains `engine`.
  - `voice-preview-run.ts`: `AvatarVoicePreviewTaskPayload` native variant gains `engine: VoicePreviewEngine`; named stays Omni.
  - Task: `const modelId = VOICE_PREVIEW_ENGINE[payload.mode === "native" ? payload.engine : "omni"].modelId`.
  - `complete-voice-preview.ts`: `voicePreviewCostUsd(mode, voicePreviewRowEngine(generation), …)`.
  - `studio-server.ts` `estimateFor`: `const engine = voicePreviewEngine(avatar); if (!engine) return null;` then pass `engine`.
  - Tests: route test's `VOICE_PREVIEW_ENGINE.named/native` become `.omni/.seedance`; native-on-uploaded-face case expects `modelUsed: VOICE_PREVIEW_ENGINE.omni.modelId` and `engine: "omni"` in the payload; complete.test's `voicePreviewParams("named")` → `("omni")`, `("native")` → `("seedance")`, cost calls gain the engine.
- [x] **Step 5:** `npx vitest run src/lib/avatars src/lib/generations "src/app/api/clients/[id]/avatars"` — PASS; `npx tsc --noEmit -p .`.
- [x] **Step 6: Commit** `feat(avatars): the voice preview's engine follows the face (D301)`.

---

### Task 2: The declaration — every face, `autoVoice`, `origin`, and the presenter's default

**Files:**
- Modify: `src/lib/avatars/schema.ts`, `src/lib/avatars/voice.ts`, `src/lib/avatars/presenter.ts`, `src/app/api/clients/[id]/avatars/[avatarId]/voice/route.ts`, `src/services/avatars.service.ts` (`setVoice` body), `src/components/nodes/video-gen-focus-view.tsx`
- Test: `src/lib/avatars/__tests__/voice.test.ts`, `presenter.test.ts`, voice route test

**Interfaces — Produces:**
```ts
type AvatarVoice =
  | { mode: "native"; autoVoice?: { voiceId: string; sourceKey: string } }
  | { mode: "named"; voiceId: string; name: string; labels: Record<string, string | undefined>;
      previewUrl: string | null; origin?: "library" | "custom" };
export function presenterDefaultVoiceId(avatar: Pick<Avatar, "voice">): string | null;
export function avatarAutoVoiceMissing(avatar: Pick<Avatar, "voice" | "voiceSample">): boolean;
```

- [x] **Step 1: Failing tests.**
```ts
// voice.test.ts
it("every face may use either mode", () => {
  expect(allowedVoiceModes("specific")).toEqual(["native", "named"]);
  expect(voiceAfterFrontChange({ mode: "native" }, "specific")).toEqual({ mode: "native" });
});
it("labels the chosen voice in plain words", () => {
  expect(avatarVoiceLabel({ mode: "native" })).toBe("Chosen for me");
});
// presenter.test.ts
it("Edit voice defaults to the named voice, or the auto voice", () => {
  expect(presenterDefaultVoiceId(makeAvatar({ voice: NAMED }))).toBe("v1");
  expect(presenterDefaultVoiceId(makeAvatar({ voice: { mode: "native", autoVoice: { voiceId: "auto1", sourceKey: "g1" } } }))).toBe("auto1");
  expect(presenterDefaultVoiceId(makeAvatar({ voice: { mode: "native" } }))).toBeNull();
});
it("the auto voice is missing when the sample is newer than it", () => {
  const sample = { url: "u", durationSeconds: 5, sourceKey: "g2" };
  expect(avatarAutoVoiceMissing({ voice: { mode: "native", autoVoice: { voiceId: "a", sourceKey: "g1" } }, voiceSample: sample })).toBe(true);
  expect(avatarAutoVoiceMissing({ voice: { mode: "native", autoVoice: { voiceId: "a", sourceKey: "g2" } }, voiceSample: sample })).toBe(false);
  expect(avatarAutoVoiceMissing({ voice: { mode: "native" }, voiceSample: null })).toBe(false);
});
it("only says Seedance alone keeps the voice when there is no auto voice", () => {
  const withAuto = makeAvatar({ voice: { mode: "native", autoVoice: { voiceId: "a", sourceKey: "g" } } });
  expect(presenterVideoNotes({ avatar: withAuto, provider: "kling", hasStartFrame: false })).toEqual([]);
});
// voice route test
it("declares a custom voice with its origin", async () => { /* PUT { mode: "named", voiceId: "v1", origin: "custom" } → stored voice.origin === "custom" */ });
it("keeps the auto voice when native is declared again", async () => { /* current native+autoVoice, PUT native → voice unchanged */ });
it("deletes the auto voice when the declaration moves off it", async () => { /* current native+autoVoice, PUT named → after() calls deleteVoice("auto1") */ });
```
- [x] **Step 2:** Run the three test files — FAIL.
- [x] **Step 3: Implement.**
  - `schema.ts`: the type above.
  - `voice.ts`: `allowedVoiceModes` returns `["native", "named"]` for any person type (empty for `null`); `avatarVoiceLabel` native → `"Chosen for me"`; `pickerVoiceToAvatarVoice(picked, origin?)` sets `origin` when given.
  - `presenter.ts`:
```ts
/** D299/D301 — the voice Edit voice pre-selects: the named voice, or "chosen for me"'s auto voice. */
export function presenterDefaultVoiceId(avatar: Pick<Avatar, "voice">): string | null {
  const v = avatar.voice;
  if (v?.mode === "named") return v.voiceId;
  return v?.mode === "native" ? v.autoVoice?.voiceId ?? null : null;
}
/** A native preview's voice was kept as a sample but not (yet) as an auto voice for other models. */
export function avatarAutoVoiceMissing(avatar: Pick<Avatar, "voice" | "voiceSample">): boolean {
  if (avatar.voice?.mode !== "native" || !avatar.voiceSample) return false;
  if (avatar.voiceSample.sourceKey.startsWith(NAMED_SAMPLE_PREFIX)) return false;
  return avatar.voice.autoVoice?.sourceKey !== avatar.voiceSample.sourceKey;
}
```
    and in `presenterVideoNotes`, the non-Seedance branch pushes "Only Seedance keeps…" only when `!(avatar.voice?.mode === "native" && avatar.voice.autoVoice)` (widen its `avatar` Pick to include `voice`).
  - Voice route: schema named variant gains `origin: z.enum(["library", "custom"]).optional()`. Native: `voice = current.voice?.mode === "native" ? current.voice : { mode: "native" }`. Named: `pickerVoiceToAvatarVoice(picked, choice.origin)`. After a successful write — and on `none` — if `current.voice?.mode === "native" && current.voice.autoVoice` and the new voice is not that same object, `after(() => deleteVoice(id).catch(log))` (import `deleteVoice` from `@/lib/elevenlabs/voice-catalog`). Remove the "A real person's avatar needs a named voice" branch's reason (it can no longer fire; keep `isVoiceAllowed` for the null person type).
  - `avatars.service.ts` `setVoice` choice type gains `origin?`.
  - `video-gen-focus-view.tsx`: `presenterVoiceId = presenterAvatar ? presenterDefaultVoiceId(presenterAvatar) : null`.
- [x] **Step 4:** Run `npx vitest run src/lib/avatars "src/app/api/clients/[id]/avatars"` — PASS; `tsc`.
- [x] **Step 5: Commit** `feat(avatars): any face may have the voice chosen for it; the auto voice is Edit voice's default (D301)`.

---

### Task 3: Keep "chosen for me" as an auto voice

**Files:**
- Create: `src/lib/avatars/auto-voice.ts`
- Modify: `src/lib/avatars/complete-voice-preview.ts`
- Test: `src/lib/avatars/__tests__/auto-voice.test.ts`, `src/lib/generations/complete.test.ts`

**Interfaces — Produces:**
```ts
export type AutoVoiceDeps = {
  fetchBytes: (url: string) => Promise<ArrayBuffer>;
  cloneVoice: typeof cloneVoice;
  deleteVoice: (voiceId: string) => Promise<void>;
  getAvatar: (clientId: string, avatarId: string) => Promise<Avatar | null>;
  updateAvatar: (clientId: string, avatarId: string, patch: { voice: AvatarVoice }) => Promise<unknown>;
  invalidate: (voiceId: string) => void;
};
export function autoVoiceName(clientName: string, avatarName: string): string; // "{client} · {avatar} (auto)"
export async function keepAutoVoice(args: { clientId: string; clientName: string; avatarId: string; sample: AvatarVoiceSample }, deps?: AutoVoiceDeps): Promise<string | null>;
```

- [x] **Step 1: Failing tests** (`auto-voice.test.ts`, deps injected):
  - clones the sample's bytes as one mp3 file named `autoVoiceName(...)`, records `{ mode: "native", autoVoice: { voiceId: "new1", sourceKey: sample.sourceKey } }`, deletes the previous auto voice `"old1"`, calls `invalidate("new1")`, returns `"new1"`;
  - does nothing (no clone) when the avatar's voice is no longer native;
  - when the clone throws: returns null, records nothing, deletes nothing;
  - when deleting the old voice throws: still records the new one and returns its id;
  - when the voice changed while cloning (re-read shows named): deletes the new clone and records nothing.
- [x] **Step 2:** Run — FAIL.
- [x] **Step 3: Implement** `auto-voice.ts` (`import "server-only"`):
```ts
export async function keepAutoVoice({ clientId, clientName, avatarId, sample }, deps = DEFAULT_DEPS) {
  const before = await deps.getAvatar(clientId, avatarId);
  if (before?.voice?.mode !== "native") return null;
  let voiceId: string;
  try {
    const bytes = await deps.fetchBytes(sample.url);
    voiceId = await deps.cloneVoice({
      name: autoVoiceName(clientName, before.name),
      removeBackgroundNoise: false,
      files: [{ name: "voice.mp3", type: "audio/mpeg", bytes }],
    });
  } catch (e) { log("clone failed", e); return null; }
  // Re-read: the operator may have changed the voice while the clone ran.
  const now = await deps.getAvatar(clientId, avatarId);
  if (now?.voice?.mode !== "native") { await deps.deleteVoice(voiceId).catch(() => {}); return null; }
  const previous = now.voice.autoVoice?.voiceId;
  await deps.updateAvatar(clientId, avatarId, { voice: { mode: "native", autoVoice: { voiceId, sourceKey: sample.sourceKey } } });
  deps.invalidate(voiceId);
  if (previous && previous !== voiceId) await deps.deleteVoice(previous).catch((e) => log("old auto voice not removed", e));
  return voiceId;
}
```
  `DEFAULT_DEPS`: `fetch(url).then(r => { if (!r.ok) throw …; return r.arrayBuffer(); })`, `cloneVoice`/`deleteVoice` from `voice-catalog`, `getAvatar`/`updateAvatar` from `@/lib/db/avatars`, `invalidateAccountVoices`.
- [x] **Step 4:** In `completeAvatarVoicePreview`, move the sample write and add the auto voice **before** `succeedGeneration`, so the Studio, which reloads the avatar when the preview turns succeeded, sees both:
```ts
await settleGeneration(...);
const sample = voicePreviewKeepsSample(mode) ? readVoiceSample(input.meta) : null;
if (sample && generation.avatar_id) {
  try {
    const voiceSample = { ...sample, sourceKey: generation.id };
    await updateAvatar(client.id, generation.avatar_id, { voiceSample });
    await keepAutoVoice({ clientId: client.id, clientName: client.name, avatarId: generation.avatar_id, sample: voiceSample });
  } catch (e) { console.error(...) }
}
await succeedGeneration(...);
```
  complete.test: mock `@/lib/avatars/auto-voice`; the native case asserts `keepAutoVoice` was called with the sample and that it ran before `succeedGeneration` (`mock.invocationCallOrder`).
- [x] **Step 5:** `npx vitest run src/lib/avatars src/lib/generations` — PASS.
- [x] **Step 6: Commit** `feat(avatars): "chosen for me" is kept as an auto voice for every model (D301)`.

---

### Task 4: The Voice step — three cards

**Files:**
- Create: `src/components/avatars/avatar-voice-options.tsx` (the three cards), `src/components/avatars/avatar-voice-auto-panel.tsx`, `src/components/avatars/avatar-voice-custom-panel.tsx`
- Modify: `src/components/avatars/avatar-studio-voice-step.tsx`, `src/components/voice/voice-clone-form.tsx`, `src/hooks/use-avatar-voice.ts`, `src/lib/avatars/studio.ts`
- Test: `src/lib/avatars/__tests__/studio.test.ts`

**Interfaces — Produces:**
```ts
export type VoiceChoice = "auto" | "library" | "custom";
export function voiceChoiceOf(voice: AvatarVoice | null): VoiceChoice | null; // native→auto; named origin custom→custom; named→library
// useAvatarVoice: chooseNamed(voice: PickerVoice, origin?: "library" | "custom")
// VoiceCloneForm: new props { inline?: boolean; defaultName?: string } — inline drops the dialog
//   padding/description/noise rows and uses the Studio wording (spec §2).
```

- [x] **Step 1: Failing test** (`studio.test.ts`):
```ts
it("opens the card the declaration came from", () => {
  expect(voiceChoiceOf({ mode: "native" })).toBe("auto");
  expect(voiceChoiceOf({ ...NAMED, origin: "custom" })).toBe("custom");
  expect(voiceChoiceOf(NAMED)).toBe("library");
  expect(voiceChoiceOf(null)).toBeNull();
});
```
- [x] **Step 2:** Run — FAIL. **Step 3:** add `voiceChoiceOf` to `studio.ts`.
- [x] **Step 4: Components.**
  - `AvatarVoiceOptions({ name, selected, saving, onSelect })` — a `role="radiogroup"` of three `Button variant="outline"` cards (`role="radio"`, `aria-checked`), each with a dot, title, line and tag (spec §2 copy; `{name}` falls back to "this avatar"). The card being saved shows a `Loader2` instead of the dot. Three columns at `sm`, one below.
  - `AvatarVoiceAutoPanel({ name, saved, saving })` — Sparkles icon, "We'll pick a voice that suits {name}", the spec §2 line, and "Saving…" / "Saved".
  - Library panel: the existing `VideoGenChangeVoicePicker` block, moved as is; `onSelect` calls `chooseNamed(picked, "library")`.
  - `AvatarVoiceCustomPanel({ clientId, name, voice, saving, onCreated })` — when the declared voice is custom: a row with the voice's name and a play button (`useVoicePreview`) and a "Use a different recording" button that shows the form again; otherwise `<VoiceCloneForm inline clientId defaultName={name} onCloned={(v) => onCreated(v)} />`. `onCreated` → `chooseNamed(v, "custom")` (an account voice, so no library save).
  - `VoiceCloneForm` `inline`: no outer padding, the name prefilled from `defaultName`, description and noise rows hidden (noise stays `true`), upload hint "mp3, wav or m4a · one speaker · 1–2 minutes works best, at least 30 seconds", consent label "I have this person's permission to use their voice.", button "Create voice" / "Creating the voice…", success toast "Voice created". The dialog use is unchanged.
  - `AvatarStudioVoiceStep`: `selected` = the open card (initial `voiceChoiceOf(declared)`), `pending` mapped to a card for "saving". Selecting "auto" calls `chooseNative()` at once; "library"/"custom" only open their panel. Below the panels, "Remove the voice" as today. Remove `MODE_COPY` and the real-person note.
  - `useAvatarVoice.chooseNamed(voice, origin)` passes `origin` to `declare`.
- [x] **Step 5:** `npx vitest run src/lib/avatars src/components/avatars src/hooks`; `tsc`; eslint on the touched files.
- [x] **Step 6: Commit** `feat(avatars): the Voice step offers three ways to choose a voice (D301)`.

---

### Task 5: Plain wording on the Preview step and labels

**Files:**
- Modify: `src/components/avatars/avatar-voice-preview.tsx`, `src/lib/avatars/studio.ts` (`avatarFaceLabel`, `stepStatusLine`), `src/components/avatars/avatar-studio-summary.tsx`
- Test: `src/lib/avatars/__tests__/studio.test.ts`

- [x] **Step 1: Failing tests:** `avatarFaceLabel(generated())` → `"Generic"`; `stepStatusLine("look", …)` for a generated front → `"Generic"`; `stepStatusLine("voice", native)` → `"Chosen for me"`.
- [x] **Step 2:** Run — FAIL. **Step 3:** implement (drop `imageModelLabel` if unused).
- [x] **Step 4:** `AvatarVoicePreview`: remove the "Made with" box and `engineLine`; native help text "The voice you keep here is the one {name} uses in every video."; button labels — native "Make a voice" / "Make another"; when `avatarAutoVoiceMissing(avatar)` and not busy, an info line "{name}'s voice couldn't be kept for every video. Make the preview again to retry." The engine wait hint becomes "Usually a minute or two. You can keep working on other steps." for both modes.
- [x] **Step 5:** Tests, `tsc`, eslint. **Step 6: Commit** `feat(avatars): the Preview step and labels name no models (D301)`.

---

### Task 6: Record it

- [x] As-built notes appended to this plan; spec amended where the build differs; commit `docs(avatars): voice choices as built (D301)`.

## As built (2026-10-05)

All six tasks done. Commits: `5034051e` (engine follows the face), `bda4e8b6` (declaration,
Edit voice default), `0d1f04ce` (auto voice), `2b343cad` (Voice step), `c632ebf1` (Preview
wording and labels).

- **Engine.** `VOICE_PREVIEW_ENGINE` is keyed by engine (`omni` / `seedance`); the engine is
  recorded on the generation (`inputs_snapshot.engine`) and read back with `voicePreviewRowEngine`,
  which infers it for older rows. Task 1 also removed the Preview step's "Made with" box, since it
  indexed the table by mode.
- **Releasing the auto voice.** Besides a new preview replacing it, the voice route removes the auto
  voice from the ElevenLabs account (after the response, best-effort) when the declaration moves to
  a named voice or to none. Choosing "for me" again keeps it.
- **The custom panel** shows the voice being saved as soon as it is created, so the form doesn't
  flash back while the declaration saves.
- **The clone form's `inline` mode** hides the description and the noise-removal tick (noise removal
  stays on) and counts the prefilled name as untouched, so no error shows before the operator starts.
- **Wording beyond the spec.** "Voice reference" reads "Voice kept" on the Preview step, the summary
  and the stepper; native preview buttons read "Make a voice" / "Make another".
- **Not verified in a browser.** Components were checked with `tsc` and eslint; vitest runs in node.

## Verify in the running app

1. A Seedream avatar → Choose a voice for me → saved at once → Preview → the clip plays; the summary says "Chosen for me"; no model names anywhere on Voice or Preview.
2. A Nano Banana 2 avatar and an uploaded (Specific) one: same flow; the preview is made (Omni). After it lands, Video Gen with this presenter on Kling opens Edit voice with the auto voice selected.
3. Pick from the library → pick a voice → the row shows the check; reopening the Studio opens the Library card.
4. Create a custom voice → upload, tick consent → Create voice → the voice shows with play; reopening opens the Custom card; the voice is in this client's library.
5. Regenerate a native preview: the ElevenLabs account has one `(auto)` voice for the avatar, not two.
