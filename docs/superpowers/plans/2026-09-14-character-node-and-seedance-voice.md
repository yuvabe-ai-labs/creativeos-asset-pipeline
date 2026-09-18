# Character Node + Seedance Voice Lane — Implementation Plan (1 of 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `character` canvas node (name + 1–4 faces + one voice sample) whose faces reach every video generation as reference images and whose voice reaches Seedance 2.5 as a `reference_audio` clip, so the same person sounds the same across separately generated clips.

**Architecture:** A Character is a source-only node. Everywhere the pipeline walks upstream and collects images, a Character contributes one image entry per face (`id = "<characterId>#<faceIndex>"`), so the existing `<IMAGE_REF_N>` / `@Image N` / `@image_N` numbering, reference strips and role assignment work unchanged. The voice travels as a new `characters: CharacterRef[]` field on `VideoGenInput`; a `voiceInput` flag on each model spec says whether a provider uses it. This plan ships Seedance's `reference_audio` lane; Kling's element lane is plan 2 (`2026-09-14-kling-character-elements.md`) and until it lands Kling declares `voiceInput: "none"` and receives faces as plain references.

**Tech Stack:** Next.js (App Router, this repo's vendored version — read `node_modules/next/dist/docs/` before touching routes), React 19, `@xyflow/react`, shadcn/Base UI primitives in `src/components/ui/*`, Zustand canvas store, Supabase (service role, server-side), GCS signed uploads (`src/lib/uploads/client.ts`, `src/lib/storage`), Trigger.dev tasks (`trigger/`), Vitest (`npx vitest run <path>`).

**Spec:** `docs/superpowers/specs/2026-09-14-character-node-voice-reference-design.md` (D264–D266 in the ADR log §7).

## Global Constraints

- **Controls are shadcn primitives only** (`Button`, `Textarea`, `Input`, …) from `src/components/ui/*`, composed with the Base UI `render` prop — never a raw `<button>`, `<textarea>`, `<select>`. The one accepted exception in this codebase is a *hidden* `<input type="file">` triggered by a `Button` (see `file-empty-state.tsx`); follow that pattern exactly.
- **Two fonts only** (Clash Display via `font-display`, Gilroy default). Purple `primary` sparingly. Cards: `rounded-lg border border-border bg-card shadow-card`. Motion easing `cubic-bezier(0.22,1,0.36,1)` only. Icons: Lucide, `strokeWidth={1.5}`.
- **"Add" affordances are dashed-border primary chips** (`border border-dashed border-primary/40 hover:bg-primary/5`), never faint text links.
- **API routes:** `apiError` / `apiOk` from `src/lib/api/route-helpers.ts`, never `NextResponse.json`. Node-scoped routes use `withNode`. Uploads validate with the helpers there.
- **Import, don't redefine.** Constants live in `src/lib/character/constants.ts`; nothing re-declares a limit locally.
- **Voice sample:** wav or mp3 · 5–30 s · ≤ 15 MB. **Face:** jpg/jpeg/png · ≤ 10 MB · ≥ 300 px on both sides · 1–4 per character, `faces[0]` is the frontal. **Seedance:** total voice seconds per request ≤ 30; `@Audio N` is 1-based over audio entries in request order; audio is never sent on a first-frame request.
- **Copy (verbatim):** voice rule text *"wav or mp3 · 5–30 seconds · one clean speaker, no music"*; voice rejection *"Voice samples must be wav or mp3, 5–30 seconds — Kling and Seedance both require it."*; face rejection *"Kling elements take jpg or png, at least 300 px."*; frontal empty state *"Add a frontal face — Kling builds the character from this one"*; muted pill *"Voice not used by {model label}"*; empty chip *"{name} · no faces yet"*.
- Run only the tests you touched per task (`npx vitest run <file>`); the full suite has known timeout flakes in API route tests.
- Commit after every task with a conventional message ending in `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

---

## File structure

| File | Responsibility |
|---|---|
| `src/lib/character/constants.ts` | Every limit (faces, voice, Seedance totals). |
| `src/lib/character/validate.ts` (+ test) | Pure `validateFace` / `validateVoice` → error string or `null`. Client and server both call these. |
| `src/lib/character/refs.ts` (+ test) | Face-ref ids (`<id>#<i>`), `characterFaceEntries(node)`, `isFrontalFaceId`. The single place that knows how a Character expands into image entries. |
| `src/lib/character/audio-duration.ts` | Browser-only: measure a `File`'s duration with an `<audio>` element. |
| `src/lib/canvas-nodes.ts` | `CharacterNodeData` and the connection table. |
| `src/lib/canvas-node-options.ts`, `src/lib/canvas-store.ts`, `src/components/canvas/canvas.tsx`, `src/components/canvas/quick-add-menu.tsx`, `src/lib/nodes/describe-node.ts`, `src/lib/nodes/node-output.ts`, `src/app/api/copilot/actions/route.ts` | Node-type registration (one line each). |
| `src/app/api/nodes/[id]/character/sign/route.ts`, `.../character/finalize/route.ts`, `.../character/remove/route.ts` | Upload authorisation, ownership check + public URL, object removal. |
| `src/services/character-node.service.ts` | Client wrapper: `uploadFace`, `uploadVoice`, `removeObject`. |
| `src/components/nodes/character-node.tsx` | Canvas card. |
| `src/components/nodes/character-focus-view.tsx` | Sheet: header, faces, voice, notes. |
| `src/components/nodes/character-face-grid.tsx` | The four face tiles + add chip. |
| `src/components/nodes/character-voice-slot.tsx` | The one voice slot. |
| `src/lib/nodes/compose-message.ts`, `src/lib/nodes/resolve-mention-tokens.ts` | `isVisionAttachment` / `isVisionNode` accept `character` entries. |
| `src/lib/nodes/resolve-inputs.ts` | `expandVideoUpstream(u)` — flatMaps a Character into per-face `UpstreamPreview`s. |
| `src/components/nodes/video-prompt-node.tsx`, `multishot-prompt-node.tsx`, `mention-instruction-editor.tsx`, `connected-inputs-card.tsx` | Client upstream expansion, `@` menu entry, labels/icons. |
| `src/lib/video-gen/collect-upstream-images.ts` (+ test) | Pure image collection shared by `video-generate` and `upstream-images` routes (extracted; adds characters). |
| `src/lib/video-gen/assign-image-roles.ts` | Character faces are always `reference`. |
| `src/lib/video-gen/types.ts`, `client-models.ts`, `providers/*.ts` | `voiceInput`, `CharacterRef`, `VideoGenInput.characters`. |
| `src/lib/video-gen/character-refs.ts` (+ test) | Pure: build `CharacterRef[]` from upstream + ordered images; Seedance total-seconds guard. |
| `src/app/api/nodes/[id]/video-generate/route.ts`, `trigger/video-generate.ts` | Carry `characters` to the provider; guards; `warnings` in the 202. |
| `src/app/api/nodes/[id]/upstream-images/route.ts`, `src/lib/video-gen/api.ts`, `src/components/nodes/video-gen-connected-section.tsx`, `video-gen-character-chip.tsx`, `video-gen-focus-view.tsx` | Character chip in the Video Gen focus view. |
| `src/lib/video-gen/providers/seedance.ts`, `seedance-voice-roster.ts` (+ test) | `reference_audio` entries + roster line. |
| `src/lib/nodes/video-prompt.ts` | One sentence for the writer about characters. |

---

### Task 1: Constants and validation

**Files:**
- Create: `src/lib/character/constants.ts`
- Create: `src/lib/character/validate.ts`
- Test: `src/lib/character/validate.test.ts`

**Interfaces:**
- Produces: `validateFace(input: FaceInput): string | null`, `validateVoice(input: VoiceInput): string | null`, and every `CHARACTER_*` constant listed below.

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/character/validate.test.ts
import { describe, it, expect } from "vitest";
import { validateFace, validateVoice } from "./validate";

const face = (over: Partial<Parameters<typeof validateFace>[0]> = {}) => ({
  ext: "jpg", sizeBytes: 1_000_000, width: 800, height: 1200, ...over,
});
const voice = (over: Partial<Parameters<typeof validateVoice>[0]> = {}) => ({
  ext: "mp3", sizeBytes: 2_000_000, durationSeconds: 12, ...over,
});

describe("validateFace", () => {
  it("accepts jpg, jpeg and png within limits", () => {
    expect(validateFace(face())).toBeNull();
    expect(validateFace(face({ ext: "jpeg" }))).toBeNull();
    expect(validateFace(face({ ext: "png" }))).toBeNull();
  });
  it("rejects webp — Kling elements refuse it", () => {
    expect(validateFace(face({ ext: "webp" }))).toBe("Kling elements take jpg or png, at least 300 px.");
  });
  it("rejects a side under 300 px", () => {
    expect(validateFace(face({ width: 299 }))).toBe("Kling elements take jpg or png, at least 300 px.");
    expect(validateFace(face({ height: 100 }))).toBe("Kling elements take jpg or png, at least 300 px.");
  });
  it("rejects over 10 MB", () => {
    expect(validateFace(face({ sizeBytes: 10 * 1024 * 1024 + 1 }))).toBe("Face images must be 10 MB or smaller.");
  });
  it("ignores dimensions when they are unknown (server cannot measure)", () => {
    expect(validateFace({ ext: "png", sizeBytes: 10 })).toBeNull();
  });
});

describe("validateVoice", () => {
  const MSG = "Voice samples must be wav or mp3, 5–30 seconds — Kling and Seedance both require it.";
  it("accepts wav and mp3 within 5–30 s", () => {
    expect(validateVoice(voice())).toBeNull();
    expect(validateVoice(voice({ ext: "wav", durationSeconds: 5 }))).toBeNull();
    expect(validateVoice(voice({ durationSeconds: 30 }))).toBeNull();
  });
  it("rejects m4a", () => {
    expect(validateVoice(voice({ ext: "m4a" }))).toBe(MSG);
  });
  it("rejects under 5 s and over 30 s", () => {
    expect(validateVoice(voice({ durationSeconds: 4.9 }))).toBe(MSG);
    expect(validateVoice(voice({ durationSeconds: 30.1 }))).toBe(MSG);
  });
  it("rejects over 15 MB", () => {
    expect(validateVoice(voice({ sizeBytes: 15 * 1024 * 1024 + 1 }))).toBe("Voice samples must be 15 MB or smaller.");
  });
  it("ignores duration when unknown (server cannot measure)", () => {
    expect(validateVoice({ ext: "mp3", sizeBytes: 10 })).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/character/validate.test.ts`
Expected: FAIL — cannot resolve `./validate`.

- [ ] **Step 3: Write constants and validation**

```ts
// src/lib/character/constants.ts
// Every limit a Character node enforces, with the vendor that sets it. A Character's faces and
// voice go to more than one model, so each value is the INTERSECTION of what Seedance 2.5 and
// Kling 3.0 Omni accept — one upload that is valid everywhere, rather than a per-model warning.
//
// Sources: ref/kling-docs/Kling 3.0 Element Management.md (faces), ref/kling-docs/Kling 3.0
// Voice Management.md (voice floor), ref/byteplus-docs/Create a video generation task.md
// (§Audio input requirements: formats, ceiling, size, per-request total).

/** 1 frontal + up to 3 other angles — Kling's `element_image_list` shape exactly. */
export const CHARACTER_MAX_FACES = 4;
/** Kling elements accept jpg/jpeg/png only — NOT webp, which the File node otherwise allows. */
export const CHARACTER_FACE_EXTENSIONS = new Set(["jpg", "jpeg", "png"]);
export const CHARACTER_FACE_MAX_BYTES = 10 * 1024 * 1024;
export const CHARACTER_FACE_MIN_PX = 300;

/** Both vendors: wav or mp3. */
export const CHARACTER_VOICE_EXTENSIONS = new Set(["wav", "mp3"]);
/** Kling's floor is 5 s (Seedance allows 2); both cap at 30. */
export const CHARACTER_VOICE_MIN_SECONDS = 5;
export const CHARACTER_VOICE_MAX_SECONDS = 30;
/** Seedance's per-file cap. Kling states none. */
export const CHARACTER_VOICE_MAX_BYTES = 15 * 1024 * 1024;

/** Seedance 2.5: up to 10 audio clips whose durations sum to ≤ 30 s. */
export const SEEDANCE_VOICE_MAX_CLIPS = 10;
export const SEEDANCE_VOICE_TOTAL_MAX_SECONDS = 30;

export const CHARACTER_VOICE_RULE = "wav or mp3 · 5–30 seconds · one clean speaker, no music";
export const CHARACTER_VOICE_REJECTION =
  "Voice samples must be wav or mp3, 5–30 seconds — Kling and Seedance both require it.";
export const CHARACTER_FACE_REJECTION = "Kling elements take jpg or png, at least 300 px.";
```

```ts
// src/lib/character/validate.ts
// Pure checks, shared by the focus view (before the upload) and the sign route (before the signed
// URL). The server cannot measure pixels or seconds, so those fields are optional: absent means
// "not checked here", never "invalid".
import {
  CHARACTER_FACE_EXTENSIONS,
  CHARACTER_FACE_MAX_BYTES,
  CHARACTER_FACE_MIN_PX,
  CHARACTER_FACE_REJECTION,
  CHARACTER_VOICE_EXTENSIONS,
  CHARACTER_VOICE_MAX_BYTES,
  CHARACTER_VOICE_MAX_SECONDS,
  CHARACTER_VOICE_MIN_SECONDS,
  CHARACTER_VOICE_REJECTION,
} from "./constants";

export type FaceInput = { ext: string; sizeBytes: number; width?: number; height?: number };
export type VoiceInput = { ext: string; sizeBytes: number; durationSeconds?: number };

export function validateFace(input: FaceInput): string | null {
  if (!CHARACTER_FACE_EXTENSIONS.has(input.ext.toLowerCase())) return CHARACTER_FACE_REJECTION;
  if (input.sizeBytes > CHARACTER_FACE_MAX_BYTES) return "Face images must be 10 MB or smaller.";
  if (input.width !== undefined && input.width < CHARACTER_FACE_MIN_PX) return CHARACTER_FACE_REJECTION;
  if (input.height !== undefined && input.height < CHARACTER_FACE_MIN_PX) return CHARACTER_FACE_REJECTION;
  return null;
}

export function validateVoice(input: VoiceInput): string | null {
  if (!CHARACTER_VOICE_EXTENSIONS.has(input.ext.toLowerCase())) return CHARACTER_VOICE_REJECTION;
  if (input.sizeBytes > CHARACTER_VOICE_MAX_BYTES) return "Voice samples must be 15 MB or smaller.";
  const d = input.durationSeconds;
  if (d !== undefined && (d < CHARACTER_VOICE_MIN_SECONDS || d > CHARACTER_VOICE_MAX_SECONDS)) {
    return CHARACTER_VOICE_REJECTION;
  }
  return null;
}

/** Lower-cased extension of a filename, "" when it has none. */
export function extOf(filename: string): string {
  const i = filename.lastIndexOf(".");
  return i === -1 ? "" : filename.slice(i + 1).toLowerCase();
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/character/validate.test.ts`
Expected: PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/character/constants.ts src/lib/character/validate.ts src/lib/character/validate.test.ts
git commit -m "feat(character): constants and face/voice validation

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Node data type, connections, and face-ref ids

**Files:**
- Modify: `src/lib/canvas-nodes.ts` (types after `DrawNodeData`; `AppNode` union; `VALID_CONNECTIONS`)
- Create: `src/lib/character/refs.ts`
- Test: `src/lib/character/refs.test.ts`
- Test: `src/lib/canvas-nodes.test.ts` (add a case)

**Interfaces:**
- Produces: `CharacterFace`, `CharacterVoice`, `CharacterNodeData` (in `canvas-nodes.ts`); `faceRefId(characterId, i)`, `parseFaceRefId(id)`, `isFrontalFaceId(id)`, `characterFaceEntries(node)`, `CharacterFaceEntry`, `characterDisplayName(data)` (in `refs.ts`).

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/character/refs.test.ts
import { describe, it, expect } from "vitest";
import {
  faceRefId, parseFaceRefId, isFrontalFaceId, characterFaceEntries, characterDisplayName,
} from "./refs";

const node = {
  id: "c1",
  data: {
    title: "Riya",
    faces: [
      { url: "https://x/f0.jpg", filename: "front.jpg", width: 800, height: 1000, sizeBytes: 1 },
      { url: "https://x/f1.jpg", filename: "side.jpg", width: 800, height: 1000, sizeBytes: 1 },
    ],
  },
};

describe("face ref ids", () => {
  it("round-trips characterId and faceIndex", () => {
    expect(faceRefId("c1", 2)).toBe("c1#2");
    expect(parseFaceRefId("c1#2")).toEqual({ characterId: "c1", faceIndex: 2 });
  });
  it("returns null for a plain node id", () => {
    expect(parseFaceRefId("c1")).toBeNull();
    expect(parseFaceRefId("c1#x")).toBeNull();
  });
  it("identifies the frontal face", () => {
    expect(isFrontalFaceId("c1#0")).toBe(true);
    expect(isFrontalFaceId("c1#1")).toBe(false);
    expect(isFrontalFaceId("c1")).toBe(false);
  });
});

describe("characterFaceEntries", () => {
  it("yields one entry per face, frontal first, labelled by name", () => {
    expect(characterFaceEntries(node)).toEqual([
      { id: "c1#0", characterId: "c1", faceIndex: 0, label: "Riya (frontal)", url: "https://x/f0.jpg", filename: "front.jpg" },
      { id: "c1#1", characterId: "c1", faceIndex: 1, label: "Riya (angle 2)", url: "https://x/f1.jpg", filename: "side.jpg" },
    ]);
  });
  it("yields nothing for a character with no faces", () => {
    expect(characterFaceEntries({ id: "c2", data: { title: "Sam" } })).toEqual([]);
  });
  it("falls back to 'Character' when untitled", () => {
    expect(characterDisplayName({})).toBe("Character");
    expect(characterFaceEntries({ id: "c3", data: { faces: node.data.faces.slice(0, 1) } })[0].label)
      .toBe("Character (frontal)");
  });
});
```

Add to `src/lib/canvas-nodes.test.ts` (inside its existing `describe` of `canConnect`, or a new one if none):

```ts
it("a character feeds only the video lanes", () => {
  expect(canConnect("character", "video-gen")).toBe(true);
  expect(canConnect("character", "video-prompt")).toBe(true);
  expect(canConnect("character", "multishot-prompt")).toBe(true);
  expect(canConnect("character", "image-gen")).toBe(false);
  expect(canConnect("character", "prompt")).toBe(false);
  expect(canConnect("file", "character")).toBe(false);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/lib/character/refs.test.ts src/lib/canvas-nodes.test.ts`
Expected: FAIL — `./refs` unresolved; `canConnect("character", "video-gen")` is `false`.

- [ ] **Step 3: Add the node data type and connections**

In `src/lib/canvas-nodes.ts`, after `DrawNodeData`:

```ts
export type CharacterFace = {
  url: string;
  filename: string;
  width: number;
  height: number;
  sizeBytes: number;
};

export type CharacterVoice = {
  url: string;
  filename: string;
  sizeBytes: number;
  durationSeconds: number;
};

/**
 * One person (D264): a name, up to four faces and one voice. Source-only — it is uploaded into,
 * never fed. `faces[0]` is the FRONTAL image: Kling builds an element from it and the beat
 * editors cite it, so its position is meaningful and the focus view lets the operator choose it.
 *
 * Provider registrations (Kling voice/element ids) are NOT stored here — autosave upserts this
 * whole object from the client's store, so a server-side write would be clobbered on the next
 * save. They live in `character_provider_registrations` (plan 2, D266).
 */
export type CharacterNodeData = {
  title?: string;           // the NAME — the @-mention label ("Riya")
  faces?: CharacterFace[];  // 1–4; index 0 is the frontal
  voice?: CharacterVoice;   // exactly one
  notes?: string;           // one-liner for writers; Kling's element_description
};
```

Add to the `AppNode` union: `| Node<CharacterNodeData, "character">`.

In `VALID_CONNECTIONS`, after the `draw:` row:

```ts
  // D264 — a Character feeds the video lanes only in this pass. Its faces become reference images
  // and its voice a voice reference; neither has a consumer on the still-image lanes yet.
  character:          ["video-gen", "video-prompt", "multishot-prompt"],
```

- [ ] **Step 4: Write `refs.ts`**

```ts
// src/lib/character/refs.ts
// How a Character expands into the image entries the rest of the pipeline already understands.
//
// A Character carries several faces but every reference roster in this codebase counts ONE entry
// per image (`visionAttachmentsOf`, `orderImagesForPromptTokens`, `imageRoles`). Rather than teach
// each of those about a node with N images, the Character is expanded HERE into N entries whose
// ids encode the face position. The dialects, strips and role maps then work unchanged.
//
// Pure and browser-safe: the node components, the API routes and the tests all import it.
import type { CharacterNodeData } from "@/lib/canvas-nodes";

const SEP = "#";

export function faceRefId(characterId: string, faceIndex: number): string {
  return `${characterId}${SEP}${faceIndex}`;
}

export function parseFaceRefId(id: string): { characterId: string; faceIndex: number } | null {
  const at = id.lastIndexOf(SEP);
  if (at === -1) return null;
  const faceIndex = Number(id.slice(at + 1));
  if (!Number.isInteger(faceIndex) || faceIndex < 0) return null;
  return { characterId: id.slice(0, at), faceIndex };
}

/** The entry a beat cites for the character — its frontal face. */
export function isFrontalFaceId(id: string): boolean {
  return parseFaceRefId(id)?.faceIndex === 0;
}

export function characterDisplayName(data: Pick<CharacterNodeData, "title">): string {
  return data.title?.trim() || "Character";
}

export type CharacterFaceEntry = {
  /** `<characterId>#<faceIndex>` — what imageRoles, dialects and mentions key on. */
  id: string;
  characterId: string;
  faceIndex: number;
  /** "Riya (frontal)", "Riya (angle 2)" — read by the writer's roster and the reference strip. */
  label: string;
  url: string;
  filename: string;
};

export function characterFaceEntries(node: {
  id: string;
  data: Pick<CharacterNodeData, "title" | "faces">;
}): CharacterFaceEntry[] {
  const name = characterDisplayName(node.data);
  return (node.data.faces ?? []).map((face, i) => ({
    id: faceRefId(node.id, i),
    characterId: node.id,
    faceIndex: i,
    label: i === 0 ? `${name} (frontal)` : `${name} (angle ${i + 1})`,
    url: face.url,
    filename: face.filename,
  }));
}
```

- [ ] **Step 5: Run to verify they pass**

Run: `npx vitest run src/lib/character/refs.test.ts src/lib/canvas-nodes.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/canvas-nodes.ts src/lib/canvas-nodes.test.ts src/lib/character/refs.ts src/lib/character/refs.test.ts
git commit -m "feat(character): node data type, connections, and face-ref ids

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Register the node type everywhere a node type is listed

**Files:**
- Modify: `src/lib/canvas-node-options.ts`
- Modify: `src/components/canvas/quick-add-menu.tsx:34-46` (ICONS map)
- Modify: `src/lib/canvas-store.ts:102-125` (`defaultData`)
- Modify: `src/components/canvas/canvas.tsx:60-74` (`nodeTypes`)
- Modify: `src/lib/nodes/describe-node.ts` (switch + `NODE_ABBREV`)
- Modify: `src/lib/nodes/node-output.ts` (switch)
- Modify: `src/app/api/copilot/actions/route.ts:20-28` (addable types list)
- Test: `src/lib/canvas-node-options.test.ts` (existing — add the mnemonic case), `src/lib/nodes/node-output.test.ts` (add a case)

**Interfaces:**
- Consumes: `CharacterNodeData`, `characterDisplayName` (Task 2).
- Produces: the `"character"` type is addable (mnemonic **C**), renders via `CharacterNode` (a placeholder until Task 6 replaces it), and has a text output for writers.

- [ ] **Step 1: Write the failing tests**

In `src/lib/canvas-node-options.test.ts` add:

```ts
it("C adds a Character", () => {
  expect(mnemonicToType("c")).toBe("character");
});
```

In `src/lib/nodes/node-output.test.ts` add:

```ts
describe("character", () => {
  it("renders name, notes, face count and voice state for writers", () => {
    expect(getNodeOutput({
      type: "character",
      data: {
        title: "Riya", notes: "late 20s, warm",
        faces: [{ url: "u", filename: "f", width: 1, height: 1, sizeBytes: 1 }],
        voice: { url: "v", filename: "v.mp3", sizeBytes: 1, durationSeconds: 12 },
      },
      activeOutput: null,
    })).toBe("Character: Riya — late 20s, warm (1 face reference attached; voice bound — do not describe the voice)");
  });
  it("omits notes and says no voice when absent", () => {
    expect(getNodeOutput({ type: "character", data: { title: "Sam", faces: [{ url: "u", filename: "f", width: 1, height: 1, sizeBytes: 1 }, { url: "u2", filename: "f2", width: 1, height: 1, sizeBytes: 1 }] }, activeOutput: null }))
      .toBe("Character: Sam (2 face references attached; no voice)");
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/lib/canvas-node-options.test.ts src/lib/nodes/node-output.test.ts`
Expected: FAIL.

- [ ] **Step 3: Register the type**

`src/lib/canvas-node-options.ts` — add `| "character"` to `AddNodeType` and, after the `file` row:

```ts
  // "C" for Character — a person the video lanes reference by face and voice (D264).
  { type: "character", label: "Character", mnemonic: "C" },
```

`src/components/canvas/quick-add-menu.tsx` — import `UserRound` from `lucide-react` and add `character: UserRound,` to `ICONS`.

`src/lib/canvas-store.ts` `defaultData` — add `case "character": return { title: "", faces: [] };`

`src/components/canvas/canvas.tsx` — `import { CharacterNode } from "@/components/nodes/character-node";` and `character: CharacterNode,` in `nodeTypes`. (Task 6 creates the component; until then create a minimal placeholder so the app compiles:)

```tsx
// src/components/nodes/character-node.tsx  (placeholder — replaced in Task 6)
"use client";
import type { NodeProps } from "@xyflow/react";
export function CharacterNode(_props: NodeProps) {
  return <div className="w-44 rounded-lg border border-border bg-card p-3 text-xs">Character</div>;
}
```

`src/lib/nodes/describe-node.ts` — in the switch, before `case "kb":`: `case "character": return "character";` and in `NODE_ABBREV`: `character: "CHAR",`.

`src/lib/nodes/node-output.ts` — import `characterDisplayName` from `@/lib/character/refs` and add:

```ts
    case "character": {
      // What a prompt WRITER learns about a person: the name it must cite, the note, and that the
      // voice is already bound — so it never writes a voice description that would fight the
      // sample. The faces themselves travel as vision parts (visionAttachmentsOf), not as text.
      const d = node.data as { title?: string; notes?: string; faces?: unknown[]; voice?: unknown };
      const name = characterDisplayName(d);
      const notes = String(d.notes ?? "").trim();
      const faces = Array.isArray(d.faces) ? d.faces.length : 0;
      const voice = d.voice ? "voice bound — do not describe the voice" : "no voice";
      return `Character: ${name}${notes ? ` — ${notes}` : ""} (${faces} face reference${faces === 1 ? "" : "s"} attached; ${voice})`;
    }
```

`src/app/api/copilot/actions/route.ts` — add `"character",` to the addable-types array (after `"draw",`).

- [ ] **Step 4: Run to verify they pass, and type-check**

Run: `npx vitest run src/lib/canvas-node-options.test.ts src/lib/nodes/node-output.test.ts && npx tsc --noEmit`
Expected: PASS; no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/canvas-node-options.ts src/components/canvas/quick-add-menu.tsx src/lib/canvas-store.ts src/components/canvas/canvas.tsx src/components/nodes/character-node.tsx src/lib/nodes/describe-node.ts src/lib/nodes/node-output.ts src/app/api/copilot/actions/route.ts src/lib/canvas-node-options.test.ts src/lib/nodes/node-output.test.ts
git commit -m "feat(character): register the node type (quick-add C, store, canvas, describe, output)

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Upload routes (sign, finalize, remove)

**Files:**
- Create: `src/app/api/nodes/[id]/character/sign/route.ts`
- Create: `src/app/api/nodes/[id]/character/finalize/route.ts`
- Create: `src/app/api/nodes/[id]/character/remove/route.ts`
- Test: `src/app/api/nodes/[id]/character/sign/route.test.ts`

**Interfaces:**
- Consumes: `validateFace`, `validateVoice`, `extOf` (Task 1); `signNodeFileUpload`, `publicUrlFor` from `@/lib/storage`; `resolveOwnership` from `@/lib/storage/ownership`; `removeNodeFileObject` from `@/lib/storage/node-file-cleanup`; `apiError`, `apiOk`, `assertImpersonationWriteAllowed` from `@/lib/api/route-helpers`.
- Produces: `POST /character/sign { slot: "face"|"voice", filename, contentType, size, width?, height?, durationSeconds? }` → `{ signedUrl, path, url }`; `POST /character/finalize { path }` → `{ url }`; `POST /character/remove { url }` → `{ ok: true }`.

Look at `src/app/api/nodes/[id]/file/sign/route.ts` and `.../file/finalize/route.ts` first — these three are the same shape minus the File node's kind branching. Check how an existing route test mocks `@/lib/storage` (e.g. `grep -rl "signNodeFileUpload" src/app/api --include=*.test.ts`) and copy that mocking style.

- [ ] **Step 1: Write the failing test for sign**

```ts
// src/app/api/nodes/[id]/character/sign/route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/api/route-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/route-helpers")>();
  return { ...actual, assertImpersonationWriteAllowed: vi.fn(async () => null) };
});
const sign = vi.fn(async () => ({ signedUrl: "https://gcs/put", path: "clients/c/canvases/v/nodes/n/files/x.mp3", url: "https://cdn/x.mp3" }));
vi.mock("@/lib/storage", () => ({ signNodeFileUpload: sign }));

const post = async (body: unknown) => {
  const { POST } = await import("./route");
  const req = new Request("http://x/api/nodes/n/character/sign", { method: "POST", body: JSON.stringify(body) });
  return POST(req, { params: Promise.resolve({ id: "n" }) });
};

beforeEach(() => sign.mockClear());

describe("POST /character/sign", () => {
  it("signs a valid voice", async () => {
    const res = await post({ slot: "voice", filename: "riya.mp3", contentType: "audio/mpeg", size: 100, durationSeconds: 12 });
    expect(res.status).toBe(200);
    expect(sign).toHaveBeenCalledWith({ nodeId: "n", filename: "riya.mp3", contentType: "audio/mpeg" });
  });
  it("rejects a voice outside 5–30 s with the shared message", async () => {
    const res = await post({ slot: "voice", filename: "riya.mp3", contentType: "audio/mpeg", size: 100, durationSeconds: 3 });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Voice samples must be wav or mp3, 5–30 seconds — Kling and Seedance both require it.");
    expect(sign).not.toHaveBeenCalled();
  });
  it("rejects a webp face", async () => {
    const res = await post({ slot: "face", filename: "riya.webp", contentType: "image/webp", size: 100, width: 800, height: 800 });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Kling elements take jpg or png, at least 300 px.");
  });
  it("rejects an unknown slot", async () => {
    const res = await post({ slot: "hat", filename: "x.png", contentType: "image/png", size: 1 });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run "src/app/api/nodes/[id]/character/sign/route.test.ts"`
Expected: FAIL — `./route` unresolved.

- [ ] **Step 3: Write the three routes**

```ts
// src/app/api/nodes/[id]/character/sign/route.ts
import { apiError, apiOk, assertImpersonationWriteAllowed } from "@/lib/api/route-helpers";
import { signNodeFileUpload } from "@/lib/storage";
import { extOf, validateFace, validateVoice } from "@/lib/character/validate";

// POST /api/nodes/:id/character/sign — authorise a direct browser → GCS upload of one face image
// or the voice sample. Same three-hop shape as file/sign; the difference is the `slot`, which
// picks the validation. Pixels and seconds come from the client (the server cannot measure
// them) and are re-checked by the vendor at generation time.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: nodeId } = await params;

  const blocked = await assertImpersonationWriteAllowed(req);
  if (blocked) return blocked;

  const body = (await req.json().catch(() => null)) as {
    slot?: string;
    filename?: string;
    contentType?: string;
    size?: number;
    width?: number;
    height?: number;
    durationSeconds?: number;
  } | null;
  if (!body?.filename || typeof body.size !== "number") {
    return apiError("filename and size are required.", 400);
  }
  if (body.slot !== "face" && body.slot !== "voice") {
    return apiError("slot must be 'face' or 'voice'.", 400);
  }

  const ext = extOf(body.filename);
  const problem =
    body.slot === "face"
      ? validateFace({ ext, sizeBytes: body.size, width: body.width, height: body.height })
      : validateVoice({ ext, sizeBytes: body.size, durationSeconds: body.durationSeconds });
  if (problem) return apiError(problem, 400);

  try {
    const { signedUrl, path, url } = await signNodeFileUpload({
      nodeId,
      filename: body.filename,
      contentType: body.contentType || "application/octet-stream",
    });
    return apiOk({ signedUrl, path, url });
  } catch (e) {
    return apiError(e instanceof Error ? e.message : "Could not authorize upload.", 404);
  }
}
```

```ts
// src/app/api/nodes/[id]/character/finalize/route.ts
import { apiError, apiOk, assertImpersonationWriteAllowed } from "@/lib/api/route-helpers";
import { publicUrlFor } from "@/lib/storage/gcs";
import { resolveOwnership } from "@/lib/storage/ownership";

// POST /api/nodes/:id/character/finalize — confirm an uploaded object belongs to this node and
// return its public URL. Unlike file/finalize it deletes nothing: a Character holds several
// objects, so which one (if any) is being replaced is the focus view's call, via /remove.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: nodeId } = await params;

  const blocked = await assertImpersonationWriteAllowed(req);
  if (blocked) return blocked;

  const body = (await req.json().catch(() => null)) as { path?: string } | null;
  if (!body?.path) return apiError("path is required.", 400);

  let expectedPrefix: string;
  try {
    const { clientId, canvasId } = await resolveOwnership(nodeId);
    expectedPrefix = `clients/${clientId}/canvases/${canvasId}/nodes/${nodeId}/files/`;
  } catch (e) {
    return apiError(e instanceof Error ? e.message : "Node not found.", 404);
  }
  if (!body.path.startsWith(expectedPrefix)) {
    return apiError("Upload path does not belong to this node.", 400);
  }

  return apiOk({ url: publicUrlFor(body.path) });
}
```

```ts
// src/app/api/nodes/[id]/character/remove/route.ts
import { apiError, apiOk, assertImpersonationWriteAllowed } from "@/lib/api/route-helpers";
import { removeNodeFileObject } from "@/lib/storage/node-file-cleanup";

// POST /api/nodes/:id/character/remove — delete one of this node's objects (a replaced face or
// voice). Sole-owner check inside removeNodeFileObject; best-effort like file/finalize's cleanup.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: nodeId } = await params;

  const blocked = await assertImpersonationWriteAllowed(req);
  if (blocked) return blocked;

  const body = (await req.json().catch(() => null)) as { url?: string } | null;
  if (!body?.url) return apiError("url is required.", 400);

  try {
    await removeNodeFileObject(nodeId, body.url);
  } catch {
    // Best-effort — an orphaned object is not worth failing the operator's edit over.
  }
  return apiOk({ ok: true });
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run "src/app/api/nodes/[id]/character/sign/route.test.ts" && npx tsc --noEmit`
Expected: PASS (4 tests); no type errors.

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/nodes/[id]/character"
git commit -m "feat(character): sign, finalize and remove upload routes

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Client service and audio duration helper

**Files:**
- Create: `src/services/character-node.service.ts`
- Create: `src/lib/character/audio-duration.ts`

**Interfaces:**
- Consumes: `uploadViaSignedUrl`, `readImageSize` from `@/lib/uploads/client`; `validateFace`, `validateVoice`, `extOf` (Task 1); `CharacterFace`, `CharacterVoice` (Task 2).
- Produces: `characterNodeService.uploadFace(nodeId, file): Promise<CharacterFace>`, `uploadVoice(nodeId, file): Promise<CharacterVoice>`, `removeObject(nodeId, url): Promise<void>`; `readAudioDuration(file): Promise<number | undefined>`.

- [ ] **Step 1: Write the duration helper**

```ts
// src/lib/character/audio-duration.ts
// Browser-only. Measures a voice sample's length before upload with a detached <audio> element —
// a media element, not a control, so the shadcn-only rule does not apply. Returns undefined when
// the browser cannot decode the file; the caller then lets the vendor be the judge.
export function readAudioDuration(file: File): Promise<number | undefined> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const audio = document.createElement("audio");
    audio.preload = "metadata";
    const done = (value: number | undefined) => {
      URL.revokeObjectURL(url);
      resolve(value);
    };
    audio.onloadedmetadata = () =>
      done(Number.isFinite(audio.duration) ? Math.round(audio.duration * 10) / 10 : undefined);
    audio.onerror = () => done(undefined);
    audio.src = url;
  });
}
```

- [ ] **Step 2: Write the service**

```ts
// src/services/character-node.service.ts
import type { CharacterFace, CharacterVoice } from "@/lib/canvas-nodes";
import { extOf, validateFace, validateVoice } from "@/lib/character/validate";
import { readAudioDuration } from "@/lib/character/audio-duration";
import { uploadViaSignedUrl, readImageSize } from "@/lib/uploads/client";

type Finalized = { url: string };

// Same three-hop upload as fileNodeService (sign → PUT to GCS → finalize), with the Character's
// own validation run BEFORE the sign request so a bad file is refused without a round trip.
class CharacterNodeService {
  async uploadFace(nodeId: string, file: File): Promise<CharacterFace> {
    const { imageWidth, imageHeight } = await readImageSize(file);
    const problem = validateFace({
      ext: extOf(file.name), sizeBytes: file.size, width: imageWidth, height: imageHeight,
    });
    if (problem) throw new Error(problem);

    const { url } = await uploadViaSignedUrl<Finalized>(file, {
      signEndpoint: `/api/nodes/${nodeId}/character/sign`,
      finalizeEndpoint: `/api/nodes/${nodeId}/character/finalize`,
      signBody: { slot: "face", width: imageWidth, height: imageHeight },
    });
    return {
      url, filename: file.name, sizeBytes: file.size,
      width: imageWidth ?? 0, height: imageHeight ?? 0,
    };
  }

  async uploadVoice(nodeId: string, file: File): Promise<CharacterVoice> {
    const durationSeconds = await readAudioDuration(file);
    const problem = validateVoice({ ext: extOf(file.name), sizeBytes: file.size, durationSeconds });
    if (problem) throw new Error(problem);

    const { url } = await uploadViaSignedUrl<Finalized>(file, {
      signEndpoint: `/api/nodes/${nodeId}/character/sign`,
      finalizeEndpoint: `/api/nodes/${nodeId}/character/finalize`,
      signBody: { slot: "voice", durationSeconds },
    });
    return { url, filename: file.name, sizeBytes: file.size, durationSeconds: durationSeconds ?? 0 };
  }

  async removeObject(nodeId: string, url: string): Promise<void> {
    await fetch(`/api/nodes/${nodeId}/character/remove`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
  }
}

export const characterNodeService = new CharacterNodeService();
```

- [ ] **Step 3: Type-check and commit**

Run: `npx tsc --noEmit`
Expected: no errors.

```bash
git add src/services/character-node.service.ts src/lib/character/audio-duration.ts
git commit -m "feat(character): client upload service and audio duration helper

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: Character card and focus view

**Files:**
- Replace: `src/components/nodes/character-node.tsx`
- Create: `src/components/nodes/character-focus-view.tsx`
- Create: `src/components/nodes/character-face-grid.tsx`
- Create: `src/components/nodes/character-voice-slot.tsx`

**Interfaces:**
- Consumes: `characterNodeService` (Task 5); `CharacterNodeData` (Task 2); `CHARACTER_MAX_FACES`, `CHARACTER_VOICE_RULE` (Task 1); the shared node chrome `NodeCardHeader`, `NodeContextMenu`, `useNodeConnectionState`, `useDeleteNode`, `useFocusViewRegistration`, `EditableField`, `Sheet`, `Button`, `Textarea` (all existing — read `file-node.tsx` and `file-focus-view.tsx` for how they compose).
- Produces: `CharacterNode` (React Flow node), `CharacterFocusView`.

- [ ] **Step 1: The card**

```tsx
// src/components/nodes/character-node.tsx
"use client";

import { useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { AudioLines, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useCanvasStore } from "@/components/canvas/canvas-store-provider";
import { useDeleteNode } from "@/hooks/use-delete-node";
import { useFocusViewRegistration } from "@/hooks/use-focus-view-open";
import type { CharacterNodeData } from "@/lib/canvas-nodes";
import { CharacterFocusView } from "./character-focus-view";
import { useNodeConnectionState } from "./use-node-connection-state";
import { NodeContextMenu } from "./node-context-menu";
import { NodeCardHeader } from "./node-card-header";

function formatSeconds(s: number): string {
  const whole = Math.round(s);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

export function CharacterNode({ id, data, selected }: NodeProps) {
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const deleteNode = useDeleteNode();
  const duplicateNode = useCanvasStore((s) => s.duplicateNode);
  const focusedNodeId = useCanvasStore((s) => s.focusedNodeId);
  const setFocusedNodeId = useCanvasStore((s) => s.setFocusedNodeId);
  const d = data as CharacterNodeData;
  const [focusOpen, setFocusOpen] = useState(false);
  const connState = useNodeConnectionState(id, "character");

  const faces = d.faces ?? [];
  const frontal = faces[0];
  const hasFaces = faces.length > 0;

  const focusViewOpen = focusOpen || focusedNodeId === id;
  const handleFocusOpenChange = (next: boolean) => {
    setFocusOpen(next);
    if (!next && focusedNodeId === id) setFocusedNodeId(null);
  };
  useFocusViewRegistration(id, focusViewOpen);

  return (
    <>
      <NodeContextMenu onDuplicate={() => duplicateNode(id)} onDelete={() => deleteNode(id)}>
        <div
          onDoubleClick={(e) => {
            e.stopPropagation();
            setFocusOpen(true);
          }}
          className={cn(
            "group w-44 rounded-lg border border-border bg-card shadow-card",
            "transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:scale-[1.006]",
            selected && "ring-2 ring-primary ring-offset-1 ring-offset-background",
            connState === "invalid" && "opacity-60 pointer-events-none",
          )}
        >
          <NodeCardHeader
            icon={UserRound}
            nodeId={id}
            nodeType="character"
            title={d.title ?? ""}
            placeholder="Unnamed character"
            onCommitTitle={(t) => updateNodeData(id, { title: t })}
            status={
              <span
                className={cn("size-1.5 rounded-full", hasFaces ? "bg-primary" : "bg-muted-foreground/40")}
                title={hasFaces ? `${faces.length} face${faces.length === 1 ? "" : "s"}` : "No faces yet"}
              />
            }
          />

          {/* Frontal face large, other angles as small squares beneath it. */}
          {hasFaces && (
            <div className="border-b border-border bg-muted/40">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={frontal.url} alt={frontal.filename} className="h-16 w-full object-cover" />
              {faces.length > 1 && (
                <div className="flex gap-1 px-2 py-1.5">
                  {faces.slice(1).map((f, i) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={i} src={f.url} alt={f.filename} className="size-6 rounded object-cover" />
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="px-3 py-3">
            {d.voice ? (
              <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[0.65rem] font-medium text-muted-foreground">
                <AudioLines className="size-3" strokeWidth={1.5} />
                voice · {formatSeconds(d.voice.durationSeconds)}
              </span>
            ) : (
              <p className="text-[0.65rem] text-muted-foreground/70">no voice</p>
            )}
            <Button
              variant="ghost"
              onClick={() => setFocusOpen(true)}
              className="nodrag -mx-1.5 mt-3 h-auto gap-1 rounded-md border-0 px-1.5 py-1 text-xs text-primary transition-colors hover:bg-primary/10 hover:text-primary"
            >
              Open ↗
            </Button>
          </div>

          <Handle type="source" position={Position.Right} className="size-4! border-2! border-card! bg-primary!" />
        </div>
      </NodeContextMenu>

      <CharacterFocusView
        open={focusViewOpen}
        onOpenChange={handleFocusOpenChange}
        nodeId={id}
        data={d}
        onPatch={(patch) => updateNodeData(id, patch)}
      />
    </>
  );
}
```

- [ ] **Step 2: The face grid**

```tsx
// src/components/nodes/character-face-grid.tsx
"use client";

import { type ChangeEvent, type DragEvent, useRef, useState } from "react";
import { Loader2, Plus, Star, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { CharacterFace } from "@/lib/canvas-nodes";
import { CHARACTER_MAX_FACES } from "@/lib/character/constants";

type Props = {
  faces: CharacterFace[];
  uploading: boolean;
  onAdd: (file: File) => void;
  onRemove: (index: number) => void;
  onMakeFrontal: (index: number) => void;
};

const ACCEPT = ".jpg,.jpeg,.png";

export function CharacterFaceGrid({ faces, uploading, onAdd, onRemove, onMakeFrontal }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const canAdd = faces.length < CHARACTER_MAX_FACES && !uploading;

  function handleInput(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) onAdd(file);
    e.target.value = "";
  }
  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file && canAdd) onAdd(file);
  }

  return (
    <section
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      className={cn("rounded-2xl transition-colors", dragOver && "bg-primary/5")}
    >
      <p className="text-eyebrow mb-3">Faces</p>
      <div className="grid grid-cols-4 gap-3">
        {Array.from({ length: CHARACTER_MAX_FACES }).map((_, i) => {
          const face = faces[i];
          if (face) {
            return (
              <div key={face.url} className="group relative aspect-[4/5] overflow-hidden rounded-xl border border-border bg-muted/40">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={face.url} alt={face.filename} className="size-full object-cover" />
                <span className="absolute left-2 top-2 rounded bg-background/90 px-1.5 py-0.5 text-[0.65rem] font-medium text-foreground">
                  {i === 0 ? "Frontal" : `Angle ${i + 1}`}
                </span>
                <div className="absolute inset-x-2 bottom-2 flex justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  {i !== 0 && (
                    <Tooltip>
                      <TooltipTrigger render={<Button size="icon-sm" variant="secondary" onClick={() => onMakeFrontal(i)} />}>
                        <Star className="size-3.5" strokeWidth={1.5} />
                      </TooltipTrigger>
                      <TooltipContent>Make frontal</TooltipContent>
                    </Tooltip>
                  )}
                  <Tooltip>
                    <TooltipTrigger render={<Button size="icon-sm" variant="secondary" onClick={() => onRemove(i)} />}>
                      <Trash2 className="size-3.5 text-destructive" strokeWidth={1.5} />
                    </TooltipTrigger>
                    <TooltipContent>Remove</TooltipContent>
                  </Tooltip>
                </div>
              </div>
            );
          }
          // The first empty tile is the add chip; later empties are quiet placeholders.
          const isNext = i === faces.length;
          if (!isNext) {
            return <div key={i} className="aspect-[4/5] rounded-xl border border-dashed border-border/60" />;
          }
          return (
            <Button
              key={i}
              variant="ghost"
              disabled={!canAdd}
              onClick={() => inputRef.current?.click()}
              className="flex aspect-[4/5] h-auto flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-primary/40 text-xs text-primary hover:bg-primary/5"
            >
              {uploading ? <Loader2 className="size-4 animate-spin" strokeWidth={1.5} /> : <Plus className="size-4" strokeWidth={1.5} />}
              {i === 0 ? (
                <span className="px-2 text-center leading-snug">Add a frontal face — Kling builds the character from this one</span>
              ) : (
                <span>Add face</span>
              )}
            </Button>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-muted-foreground/70">jpg or png · at least 300 px · up to 10 MB · up to 4 angles</p>
      <input ref={inputRef} type="file" accept={ACCEPT} className="hidden" onChange={handleInput} />
    </section>
  );
}
```

Check `src/components/ui/button.tsx` for the exact `size` variant names before using `icon-sm`; if it doesn't exist use the smallest icon size that does.

- [ ] **Step 3: The voice slot**

```tsx
// src/components/nodes/character-voice-slot.tsx
"use client";

import { type ChangeEvent, useRef, useState } from "react";
import { AudioLines, Loader2, Pause, Play, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CharacterVoice } from "@/lib/canvas-nodes";
import { CHARACTER_VOICE_RULE } from "@/lib/character/constants";

type Props = {
  voice: CharacterVoice | undefined;
  uploading: boolean;
  onUpload: (file: File) => void;
  onRemove: () => void;
};

const ACCEPT = ".wav,.mp3";

export function CharacterVoiceSlot({ voice, uploading, onUpload, onRemove }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);

  function handleInput(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) onUpload(file);
    e.target.value = "";
  }
  function toggle() {
    const el = audioRef.current;
    if (!el) return;
    if (playing) { el.pause(); setPlaying(false); } else { void el.play(); setPlaying(true); }
  }

  return (
    <section>
      <p className="text-eyebrow mb-3">Voice</p>
      {voice ? (
        <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 shadow-card">
          {/* Media element, not a control — playback is driven by the shadcn Button beside it. */}
          <audio ref={audioRef} src={voice.url} onEnded={() => setPlaying(false)} preload="metadata" />
          <Button size="icon" variant="outline" onClick={toggle} aria-label={playing ? "Pause" : "Play"}>
            {playing ? <Pause className="size-4" strokeWidth={1.5} /> : <Play className="size-4" strokeWidth={1.5} />}
          </Button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm">{voice.filename}</p>
            <p className="text-xs text-muted-foreground">{Math.round(voice.durationSeconds)} s</p>
          </div>
          <Button variant="ghost" onClick={() => inputRef.current?.click()} disabled={uploading}>
            <RefreshCw className="size-4 text-primary" strokeWidth={1.5} /> Replace
          </Button>
          <Button variant="ghost" onClick={onRemove}>
            <Trash2 className="size-4 text-destructive" strokeWidth={1.5} />
          </Button>
        </div>
      ) : (
        <Button
          variant="ghost"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          className="flex h-auto w-full flex-col items-center gap-2 rounded-xl border border-dashed border-primary/40 py-6 text-primary hover:bg-primary/5"
        >
          {uploading ? <Loader2 className="size-5 animate-spin" strokeWidth={1.5} /> : <AudioLines className="size-5" strokeWidth={1.5} />}
          <span className="text-sm font-medium">Add voice sample</span>
          <span className="text-xs text-muted-foreground">{CHARACTER_VOICE_RULE}</span>
        </Button>
      )}
      <input ref={inputRef} type="file" accept={ACCEPT} className="hidden" onChange={handleInput} />
    </section>
  );
}
```

- [ ] **Step 4: The focus view**

```tsx
// src/components/nodes/character-focus-view.tsx
"use client";

import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { CharacterNodeData } from "@/lib/canvas-nodes";
import { characterNodeService } from "@/services/character-node.service";
import { EditableField } from "./editable-field";
import { CharacterFaceGrid } from "./character-face-grid";
import { CharacterVoiceSlot } from "./character-voice-slot";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nodeId: string;
  data: CharacterNodeData;
  onPatch: (patch: Partial<CharacterNodeData>) => void;
};

export function CharacterFocusView({ open, onOpenChange, nodeId, data, onPatch }: Props) {
  const [faceUploading, setFaceUploading] = useState(false);
  const [voiceUploading, setVoiceUploading] = useState(false);
  const [notes, setNotes] = useState(data.notes ?? "");
  const faces = data.faces ?? [];

  async function addFace(file: File) {
    setFaceUploading(true);
    try {
      const face = await characterNodeService.uploadFace(nodeId, file);
      onPatch({ faces: [...faces, face] });
      toast.success(faces.length === 0 ? "Frontal face added" : "Face added");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setFaceUploading(false);
    }
  }

  function removeFace(index: number) {
    const target = faces[index];
    onPatch({ faces: faces.filter((_, i) => i !== index) });
    void characterNodeService.removeObject(nodeId, target.url);
  }

  function makeFrontal(index: number) {
    const next = [faces[index], ...faces.filter((_, i) => i !== index)];
    onPatch({ faces: next });
  }

  async function uploadVoice(file: File) {
    setVoiceUploading(true);
    try {
      const previous = data.voice?.url;
      const voice = await characterNodeService.uploadVoice(nodeId, file);
      onPatch({ voice });
      if (previous) void characterNodeService.removeObject(nodeId, previous);
      toast.success("Voice attached");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setVoiceUploading(false);
    }
  }

  function removeVoice() {
    const previous = data.voice?.url;
    onPatch({ voice: undefined });
    if (previous) void characterNodeService.removeObject(nodeId, previous);
  }

  return (
    <TooltipProvider>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="bottom"
          showCloseButton={false}
          className="gap-0 overflow-hidden rounded-t-2xl bg-background data-[side=bottom]:h-[92vh]"
        >
          <div className="shrink-0 border-b">
            <div className="mx-auto w-full max-w-7xl px-6 pb-5 pt-3">
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                className="h-auto gap-1.5 border-0 p-0 text-muted-foreground transition-colors hover:bg-transparent hover:text-foreground"
              >
                <ArrowLeft className="size-4" /> Back to canvas
              </Button>
              <header className="mt-4">
                <SheetTitle className="p-0 font-display text-3xl font-semibold tracking-tight">
                  <EditableField
                    value={data.title ?? ""}
                    onCommit={(t) => onPatch({ title: t })}
                    placeholder="Character name"
                    className="font-display text-3xl font-semibold tracking-tight"
                  />
                </SheetTitle>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  The name is what you @-mention in a beat. Faces become reference images; the voice is sent to models that take one.
                </p>
              </header>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto grid w-full max-w-7xl gap-10 px-6 py-8 md:grid-cols-[3fr_2fr]">
              <CharacterFaceGrid
                faces={faces}
                uploading={faceUploading}
                onAdd={addFace}
                onRemove={removeFace}
                onMakeFrontal={makeFrontal}
              />
              <div className="flex flex-col gap-8">
                <CharacterVoiceSlot
                  voice={data.voice}
                  uploading={voiceUploading}
                  onUpload={uploadVoice}
                  onRemove={removeVoice}
                />
                <section>
                  <p className="text-eyebrow mb-3">Notes</p>
                  <Textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    onBlur={() => onPatch({ notes })}
                    placeholder="late 20s, warm, Tamil accent"
                    rows={3}
                  />
                  <p className="mt-2 text-xs text-muted-foreground/70">Shown to the prompt writer. Also Kling's element description (first 100 characters).</p>
                </section>
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </TooltipProvider>
  );
}
```

- [ ] **Step 5: Type-check and try it**

Run: `npx tsc --noEmit`, then `npm run dev`, open a canvas, press **C**, name the node, add two jpg faces and one mp3 voice, drop a webp face (expect the Kling rejection toast), drop a 3-second mp3 (expect the 5–30 s toast), remove and re-add, reload the page and confirm everything persisted.

- [ ] **Step 6: Commit**

```bash
git add src/components/nodes/character-node.tsx src/components/nodes/character-focus-view.tsx src/components/nodes/character-face-grid.tsx src/components/nodes/character-voice-slot.tsx
git commit -m "feat(character): canvas card and focus view with faces, voice and notes

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: Character faces are vision attachments (server expansion + client expansion + `@` menu)

**Files:**
- Modify: `src/lib/nodes/compose-message.ts:30-40` (`isVisionAttachment`)
- Modify: `src/lib/nodes/resolve-mention-tokens.ts:17-25` (`isVisionNode`)
- Modify: `src/lib/nodes/resolve-inputs.ts` (add `expandVideoUpstream`; use it in `resolveVideoPromptInputs` and `resolveMultishotPromptInputs`)
- Modify: `src/app/api/nodes/[id]/compile-preview/route.ts` (same substitution — `grep -n mapUpstreamForVideo` there)
- Modify: `src/components/nodes/video-prompt-node.tsx:45-70`, `src/components/nodes/multishot-prompt-node.tsx:65-95` (client upstream `useMemo`)
- Modify: `src/components/nodes/mention-instruction-editor.tsx:64-75, 300-312`
- Modify: `src/components/nodes/connected-inputs-card.tsx:79, 200, 246` and the label lookup near line 171
- Test: `src/lib/nodes/__tests__/map-upstream-for-video.test.ts` (add), `src/lib/nodes/compose-message.test.ts` (add)

**Interfaces:**
- Consumes: `characterFaceEntries` (Task 2).
- Produces: `expandVideoUpstream(u: RawUpstream): UpstreamPreview[]` (server); `characterUpstreamNodes(node): UpstreamNode[]` in `src/lib/character/refs.ts` (client). An expanded face entry has `type: "character"`, `fileKind: "image"`, `fileUrl`, `nodeId`/`id` = `faceRefId`, `label` = "Riya (frontal)".

- [ ] **Step 1: Write the failing tests**

Add to `src/lib/nodes/compose-message.test.ts`:

```ts
it("treats an expanded character face as a vision attachment", () => {
  expect(isVisionAttachment({ type: "character", fileKind: "image", fileUrl: "https://x/f0.jpg" })).toBe(true);
  expect(isVisionAttachment({ type: "character", fileKind: "image", fileUrl: "" })).toBe(false);
});
```

Add to `src/lib/nodes/__tests__/map-upstream-for-video.test.ts`:

```ts
import { expandVideoUpstream } from "@/lib/nodes/resolve-inputs";

describe("expandVideoUpstream", () => {
  it("expands a character into one vision preview per face, frontal first", () => {
    const out = expandVideoUpstream({
      nodeId: "c1", versionId: null, type: "character", activeOutput: null,
      data: {
        title: "Riya", notes: "warm",
        faces: [
          { url: "https://x/f0.jpg", filename: "f0.jpg", width: 1, height: 1, sizeBytes: 1 },
          { url: "https://x/f1.jpg", filename: "f1.jpg", width: 1, height: 1, sizeBytes: 1 },
        ],
      },
    });
    expect(out.map((u) => [u.nodeId, u.type, u.label, u.fileUrl, u.fileKind])).toEqual([
      ["c1#0", "character", "Riya (frontal)", "https://x/f0.jpg", "image"],
      ["c1#1", "character", "Riya (angle 2)", "https://x/f1.jpg", "image"],
    ]);
    // The character's text (name, notes, voice state) rides on the FRONTAL entry only, so the
    // writer's user turn states the person once, not once per angle.
    expect(out[0].text).toContain("Character: Riya");
    expect(out[1].text).toBe("");
  });
  it("yields a single text-only entry for a character with no faces", () => {
    const out = expandVideoUpstream({ nodeId: "c2", versionId: null, type: "character", activeOutput: null, data: { title: "Sam" } });
    expect(out).toHaveLength(1);
    expect(out[0].fileUrl).toBeUndefined();
    expect(out[0].text).toContain("Character: Sam");
  });
  it("maps every other type exactly as mapUpstreamForVideo does", () => {
    const u = { nodeId: "f", versionId: null, type: "file", activeOutput: null, data: { fileUrl: "https://x/a.png", fileKind: "image" } };
    expect(expandVideoUpstream(u)).toEqual([mapUpstreamForVideo(u)]);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/lib/nodes/compose-message.test.ts src/lib/nodes/__tests__/map-upstream-for-video.test.ts`
Expected: FAIL.

- [ ] **Step 3: Server side**

`compose-message.ts` `isVisionAttachment` — add before the image-gen check:

```ts
  // An expanded Character face (character/refs.ts) — already one entry per image.
  if (u.type === "character" && hasImageUrl) return true;
```

`resolve-mention-tokens.ts` `isVisionNode` — add the identical line.

`resolve-inputs.ts` — import `characterFaceEntries` from `@/lib/character/refs` and add after `mapUpstreamForVideo`:

```ts
/**
 * `mapUpstreamForVideo`, lifted to a list: a Character (D264) becomes one vision preview PER FACE
 * so every downstream roster counts its images the way it counts everyone else's, and every other
 * node maps to exactly one preview as before. The character's own text (name, notes, voice state
 * — getNodeOutput) rides on the frontal entry only; a character with no faces yields one text-only
 * entry so the writer still hears of it.
 */
export function expandVideoUpstream(u: RawUpstream): UpstreamPreview[] {
  if (u.type !== "character") return [mapUpstreamForVideo(u)];
  const text = getNodeOutput({ type: u.type, data: u.data, activeOutput: u.activeOutput });
  const faces = characterFaceEntries({ id: u.nodeId, data: u.data as { title?: string; faces?: never[] } });
  if (faces.length === 0) {
    return [{ nodeId: u.nodeId, versionId: u.versionId, label: "Character", type: "character", text }];
  }
  return faces.map((f, i) => ({
    nodeId: f.id,
    versionId: u.versionId,
    label: f.label,
    type: "character",
    text: i === 0 ? text : "",
    fileUrl: f.url,
    fileKind: "image",
  }));
}
```

(Type the `data` cast properly: `u.data as Pick<CharacterNodeData, "title" | "faces">`, importing the type from `@/lib/canvas-nodes`.)

In `resolveVideoPromptInputs` and `resolveMultishotPromptInputs` replace `ups.map((u) => mapUpstreamForVideo({...}))` with `ups.flatMap((u) => expandVideoUpstream({ nodeId: u.nodeId, versionId: u.versionId, type: u.type, data: u.data, activeOutput: u.activeOutput }))`. Do the same in `compile-preview/route.ts`. Add `character: "Character",` to `TYPE_LABEL`.

- [ ] **Step 4: Client side**

Add to `src/lib/character/refs.ts`:

```ts
/** The client-side twin of `expandVideoUpstream` for the node components' `upstream` lists. */
export function characterUpstreamNodes(node: {
  id: string;
  data: Pick<CharacterNodeData, "title" | "faces">;
}): Array<{ id: string; label: string; type: "character"; fileUrl: string; fileKind: "image" }> {
  return characterFaceEntries(node).map((f) => ({
    id: f.id, label: f.label, type: "character", fileUrl: f.url, fileKind: "image",
  }));
}
```

In `video-prompt-node.tsx` and `multishot-prompt-node.tsx`, change the `upstream` `useMemo` from `directNodes.map(...)` to `directNodes.flatMap((n) => { if (n.type === "character") return characterUpstreamNodes({ id: n.id, data: n.data as CharacterNodeData }); return [ /* the existing mapped object */ ]; })`, and add `character: "Character"` to each file's `TYPE_LABEL`.

`mention-instruction-editor.tsx`:
- `nodeTypeLabel`: `if (type === "character") return "Character";`
- `NodeIcon`: `if (type === "character") return <UserRound className="size-3 shrink-0" />;` (import from lucide).
- `eligible`: change the filter to `.filter((u) => u.type === "image-gen" || u.type === "draw" || u.type === "file" || (u.type === "character" && isFrontalFaceId(u.id)))` and, for character entries, label `Character: ${u.label.replace(/ \(frontal\)$/, "")}` so the menu reads "Character: Riya" (import `isFrontalFaceId` from `@/lib/character/refs`).

`connected-inputs-card.tsx`: where `(u.type === "file" || u.type === "draw") && fileKind === "image"` gates an image thumbnail (lines ~79 and ~200), add `|| u.type === "character"`; in the icon function add `if (type === "character") return <UserRound className="size-3 shrink-0 text-primary" />;`; in the label lookup near line 171 add a `"character"` → `"Character"` branch.

- [ ] **Step 5: Run tests, type-check, try it**

Run: `npx vitest run src/lib/nodes/compose-message.test.ts src/lib/nodes/__tests__/map-upstream-for-video.test.ts src/lib/nodes/resolve-mention-tokens.test.ts && npx tsc --noEmit`
Expected: PASS, no type errors.

Dev check: connect a Character with two faces to a Multishot Prompt; the reference strip shows both faces labelled "Riya (frontal)" / "Riya (angle 2)"; typing `@` in a beat offers "Character: Riya" once; picking it inserts a chip that renders the frontal face; the rendered prompt shows the model's token for that face's position.

- [ ] **Step 6: Commit**

```bash
git add src/lib/nodes/compose-message.ts src/lib/nodes/resolve-mention-tokens.ts src/lib/nodes/resolve-inputs.ts "src/app/api/nodes/[id]/compile-preview/route.ts" src/lib/character/refs.ts src/components/nodes/video-prompt-node.tsx src/components/nodes/multishot-prompt-node.tsx src/components/nodes/mention-instruction-editor.tsx src/components/nodes/connected-inputs-card.tsx src/lib/nodes/compose-message.test.ts src/lib/nodes/__tests__/map-upstream-for-video.test.ts
git commit -m "feat(character): faces expand into vision attachments; @ menu offers the character once

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: One image-collection function for both video-gen routes, with characters

**Files:**
- Create: `src/lib/video-gen/collect-upstream-images.ts`
- Test: `src/lib/video-gen/__tests__/collect-upstream-images.test.ts`
- Modify: `src/app/api/nodes/[id]/video-generate/route.ts:145-170` (replace the inline loop)
- Modify: `src/app/api/nodes/[id]/upstream-images/route.ts:45-75` (replace the inline filter/map; add `characters` to the response)
- Modify: `src/lib/video-gen/api.ts:11-16` (`UpstreamImage.characterId?`, new `UpstreamCharacter`)
- Modify: `src/lib/video-gen/assign-image-roles.ts` (`autoAssignImageRoles`)
- Test: `src/lib/video-gen/__tests__/auto-assign-image-roles.test.ts` (add)

**Interfaces:**
- Consumes: `characterFaceEntries` (Task 2); `UpstreamOutput` from `@/lib/db/nodes`.
- Produces:
  ```ts
  export type CollectedImage = { nodeId: string; url: string; type: string; filename?: string; characterId?: string };
  export type CollectedCharacter = { id: string; name: string; notes?: string; faceUrls: string[]; voice?: { url: string; durationSeconds: number } };
  export function collectUpstreamImages(allUpstream: UpstreamOutput[], opts: { directIds: Set<string>; multishotPromptUpstreamIds: Set<string> }): { images: CollectedImage[]; characters: CollectedCharacter[] };
  ```
  `UpstreamImage` gains `characterId?: string`; the `upstream-images` response gains `characters: UpstreamCharacter[]` where `UpstreamCharacter = { id: string; name: string; faceCount: number; hasVoice: boolean; voiceDurationSeconds?: number }`.

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/video-gen/__tests__/collect-upstream-images.test.ts
import { describe, it, expect } from "vitest";
import { collectUpstreamImages } from "../collect-upstream-images";

const up = (nodeId: string, type: string, data: Record<string, unknown> = {}, activeOutput: unknown = null) =>
  ({ nodeId, type, data, activeOutput, versionId: null });

describe("collectUpstreamImages", () => {
  it("takes file/draw images with a url and skips non-image kinds", () => {
    const { images } = collectUpstreamImages(
      [up("f1", "file", { fileKind: "image", fileUrl: "https://x/a.png", filename: "a.png" }), up("f2", "file", { fileKind: "document", fileUrl: "https://x/b.pdf" })],
      { directIds: new Set(["f1", "f2"]), multishotPromptUpstreamIds: new Set() },
    );
    expect(images).toEqual([{ nodeId: "f1", url: "https://x/a.png", type: "file", filename: "a.png" }]);
  });
  it("takes an image-gen still only when direct or under a multishot-prompt", () => {
    const ups = [up("g1", "image-gen", {}, "https://x/g1.png"), up("g2", "image-gen", {}, "https://x/g2.png"), up("g3", "image-gen", {}, "https://x/g3.png")];
    const { images } = collectUpstreamImages(ups, { directIds: new Set(["g1"]), multishotPromptUpstreamIds: new Set(["g2"]) });
    expect(images.map((i) => i.nodeId)).toEqual(["g1", "g2"]);
  });
  it("expands a character into per-face images tagged with its id, and lists the character", () => {
    const { images, characters } = collectUpstreamImages(
      [up("c1", "character", {
        title: "Riya", notes: "warm",
        faces: [{ url: "https://x/f0.jpg", filename: "f0.jpg", width: 1, height: 1, sizeBytes: 1 }, { url: "https://x/f1.jpg", filename: "f1.jpg", width: 1, height: 1, sizeBytes: 1 }],
        voice: { url: "https://x/v.mp3", filename: "v.mp3", sizeBytes: 1, durationSeconds: 12 },
      })],
      { directIds: new Set(["c1"]), multishotPromptUpstreamIds: new Set() },
    );
    expect(images).toEqual([
      { nodeId: "c1#0", url: "https://x/f0.jpg", type: "character", filename: "f0.jpg", characterId: "c1" },
      { nodeId: "c1#1", url: "https://x/f1.jpg", type: "character", filename: "f1.jpg", characterId: "c1" },
    ]);
    expect(characters).toEqual([{ id: "c1", name: "Riya", notes: "warm", faceUrls: ["https://x/f0.jpg", "https://x/f1.jpg"], voice: { url: "https://x/v.mp3", durationSeconds: 12 } }]);
  });
  it("lists a face-less character with no images", () => {
    const { images, characters } = collectUpstreamImages([up("c2", "character", { title: "Sam" })], { directIds: new Set(["c2"]), multishotPromptUpstreamIds: new Set() });
    expect(images).toEqual([]);
    expect(characters).toEqual([{ id: "c2", name: "Sam", notes: undefined, faceUrls: [], voice: undefined }]);
  });
});
```

Add to `auto-assign-image-roles.test.ts`:

```ts
it("a character face is always a reference and is never promoted to a frame", () => {
  expect(autoAssignImageRoles([img("c1#0", "character"), img("c1#1", "character")], {}, { supportsStartFrame: true, supportsReferences: false }))
    .toEqual({});
  expect(autoAssignImageRoles([img("c1#0", "character")], { "c1#0": "start_frame" })).toEqual({ "c1#0": "reference" });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/lib/video-gen/__tests__/collect-upstream-images.test.ts src/lib/video-gen/__tests__/auto-assign-image-roles.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write the collector**

```ts
// src/lib/video-gen/collect-upstream-images.ts
// The upstream images a Video Gen node could send, in traversal order — ONE definition, read by
// both api/nodes/[id]/video-generate (the request) and api/nodes/[id]/upstream-images (the focus
// view). They used to carry the same loop twice; the roles keyed by node id only mean the same
// thing on both sides while the two lists are the same list.
import type { UpstreamOutput } from "@/lib/db/nodes";
import type { CharacterNodeData } from "@/lib/canvas-nodes";
import { characterDisplayName, characterFaceEntries } from "@/lib/character/refs";

export type CollectedImage = {
  nodeId: string;
  url: string;
  type: string;
  filename?: string;
  /** Set on a Character's face entries — the node the face belongs to. */
  characterId?: string;
};

export type CollectedCharacter = {
  id: string;
  name: string;
  notes?: string;
  /** Frontal first. Empty for a character with no faces yet. */
  faceUrls: string[];
  voice?: { url: string; durationSeconds: number };
};

export function collectUpstreamImages(
  allUpstream: UpstreamOutput[],
  opts: { directIds: Set<string>; multishotPromptUpstreamIds: Set<string> },
): { images: CollectedImage[]; characters: CollectedCharacter[] } {
  const images: CollectedImage[] = [];
  const characters: CollectedCharacter[] = [];

  for (const node of allUpstream) {
    const data = node.data as Record<string, unknown>;

    if (node.type === "character") {
      const d = data as CharacterNodeData;
      characters.push({
        id: node.nodeId,
        name: characterDisplayName(d),
        notes: d.notes?.trim() || undefined,
        faceUrls: (d.faces ?? []).map((f) => f.url),
        voice: d.voice ? { url: d.voice.url, durationSeconds: d.voice.durationSeconds } : undefined,
      });
      for (const f of characterFaceEntries({ id: node.nodeId, data: d })) {
        images.push({ nodeId: f.id, url: f.url, type: "character", filename: f.filename, characterId: node.nodeId });
      }
      continue;
    }

    let url: string | undefined;
    if (node.type === "file" || node.type === "draw") {
      if (data.fileKind !== "image") continue;
      url = typeof data.fileUrl === "string" ? data.fileUrl : undefined;
    } else if (
      node.type === "image-gen" &&
      (opts.directIds.has(node.nodeId) || opts.multishotPromptUpstreamIds.has(node.nodeId))
    ) {
      url = typeof node.activeOutput === "string" ? node.activeOutput : undefined;
    }
    if (!url) continue;
    images.push({
      nodeId: node.nodeId,
      url,
      type: node.type,
      filename: typeof data.filename === "string" ? data.filename : undefined,
    });
  }

  return { images, characters };
}
```

- [ ] **Step 4: Use it in both routes**

`video-generate/route.ts` — replace the `upstreamImages` loop (the `for (const node of allUpstream)` block) with:

```ts
    const { images: upstreamImages, characters: upstreamCharacters } = collectUpstreamImages(
      allUpstream,
      { directIds, multishotPromptUpstreamIds },
    );
```

(`UpstreamImageRef` is `{ nodeId; url; type? }` — `CollectedImage` satisfies it structurally.) Keep `upstreamCharacters` in scope; Task 9 uses it.

`upstream-images/route.ts` — replace the `images` filter/map with the collector and shape the response:

```ts
      const { images: collected, characters } = collectUpstreamImages(allUpstream, { directIds, multishotPromptUpstreamIds });
      const images = collected.map((i) => ({
        id: i.nodeId, type: i.type, imageUrl: i.url, filename: i.filename,
        ...(i.characterId && { characterId: i.characterId }),
      }));
      const characterSummaries = characters.map((c) => ({
        id: c.id, name: c.name, faceCount: c.faceUrls.length,
        hasVoice: Boolean(c.voice), voiceDurationSeconds: c.voice?.durationSeconds,
      }));
      …
      return apiOk({ images, characters: characterSummaries, promptNode });
```

(The old map also returned `fileSizeBytes`/`imageWidth`/`imageHeight`; `grep -n "fileSizeBytes\|imageWidth" src/components/nodes/video-gen-*.tsx` — if nothing reads them from `UpstreamImage`, drop them; otherwise add them to `CollectedImage`.)

`api.ts`:

```ts
export type UpstreamImage = { id: string; type: string; imageUrl: string; filename?: string; characterId?: string };
export type UpstreamCharacter = { id: string; name: string; faceCount: number; hasVoice: boolean; voiceDurationSeconds?: number };
```

and extend the `fetchUpstreamImages` return type to include `characters: UpstreamCharacter[]` (find it with `grep -n fetchUpstreamImages src/lib/video-gen/api.ts`).

`assign-image-roles.ts` `autoAssignImageRoles` — at the top of the `for` loop body, before `if (next[nodeId]) continue;`:

```ts
    // A Character's face is a reference and nothing else (D264): it is never a frame, whatever
    // the stored role says, and on a model that takes no references it is simply not sent.
    if (type === "character") {
      if (opts.supportsReferences) next[nodeId] = "reference";
      else delete next[nodeId];
      continue;
    }
```

- [ ] **Step 5: Run tests, type-check**

Run: `npx vitest run src/lib/video-gen/__tests__/collect-upstream-images.test.ts src/lib/video-gen/__tests__/auto-assign-image-roles.test.ts src/lib/video-gen/__tests__/assign-image-roles.test.ts "src/app/api/nodes/[id]/video-generate" && npx tsc --noEmit`
Expected: PASS; no type errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/video-gen/collect-upstream-images.ts src/lib/video-gen/__tests__/collect-upstream-images.test.ts "src/app/api/nodes/[id]/video-generate/route.ts" "src/app/api/nodes/[id]/upstream-images/route.ts" src/lib/video-gen/api.ts src/lib/video-gen/assign-image-roles.ts src/lib/video-gen/__tests__/auto-assign-image-roles.test.ts
git commit -m "refactor(video-gen): one upstream-image collector for both routes, with character faces

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 9: `voiceInput`, `CharacterRef`, and the request carries characters

**Files:**
- Modify: `src/lib/video-gen/types.ts` (`VideoGenInput.characters`, `CharacterRef`, `VideoGenModelSpec.voiceInput`)
- Modify: every provider spec: `providers/veo.ts` (3 specs), `providers/sora.ts`, `providers/kling.ts` (3), `providers/gemini-omni.ts`, `providers/seedance.ts`; and every entry in `client-models.ts`
- Create: `src/lib/video-gen/character-refs.ts`
- Test: `src/lib/video-gen/__tests__/character-refs.test.ts`
- Modify: `src/app/api/nodes/[id]/video-generate/route.ts` (build `characters`; guards; payload; `warnings`)
- Modify: `trigger/video-generate.ts` (payload → `generate`)
- Test: `src/lib/video-gen/__tests__/kling-3-0-omni-registration.test.ts` (add a `voiceInput` assertion for every registered model)

**Interfaces:**
- Consumes: `CollectedCharacter` (Task 8); `SEEDANCE_VOICE_TOTAL_MAX_SECONDS`, `SEEDANCE_VOICE_MAX_CLIPS` (Task 1).
- Produces:
  ```ts
  export type VoiceInput = "none" | "inline-audio" | "element";
  export type CharacterRef = {
    characterId: string; name: string; notes?: string;
    faceUrls: string[];                       // frontal first
    voice?: { url: string; durationSeconds: number };
    faceRefIndexes: number[];                 // this character's faces' positions in referenceUrls
  };
  // VideoGenInput gains: characters: CharacterRef[]
  // VideoGenModelSpec gains: voiceInput: VoiceInput
  export function buildCharacterRefs(characters: CollectedCharacter[], referenceUrls: string[]): CharacterRef[];
  export function checkSeedanceVoices(characters: CharacterRef[]): string | null;
  ```

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/video-gen/__tests__/character-refs.test.ts
import { describe, it, expect } from "vitest";
import { buildCharacterRefs, checkSeedanceVoices } from "../character-refs";

const riya = { id: "c1", name: "Riya", notes: "warm", faceUrls: ["https://x/r0.jpg", "https://x/r1.jpg"], voice: { url: "https://x/r.mp3", durationSeconds: 12 } };
const sam = { id: "c2", name: "Sam", faceUrls: ["https://x/s0.jpg"], voice: undefined };

describe("buildCharacterRefs", () => {
  it("records where each character's faces landed in referenceUrls", () => {
    const refs = buildCharacterRefs([riya, sam], ["https://x/product.png", "https://x/r0.jpg", "https://x/r1.jpg", "https://x/s0.jpg"]);
    expect(refs).toEqual([
      { characterId: "c1", name: "Riya", notes: "warm", faceUrls: riya.faceUrls, voice: riya.voice, faceRefIndexes: [1, 2] },
      { characterId: "c2", name: "Sam", notes: undefined, faceUrls: sam.faceUrls, voice: undefined, faceRefIndexes: [3] },
    ]);
  });
  it("drops faces that were capped out of referenceUrls", () => {
    const refs = buildCharacterRefs([riya], ["https://x/r0.jpg"]);
    expect(refs[0].faceRefIndexes).toEqual([0]);
  });
  it("keeps a face-less character so its voice can still be sent", () => {
    const refs = buildCharacterRefs([{ id: "c3", name: "Narrator", faceUrls: [], voice: { url: "https://x/n.mp3", durationSeconds: 8 } }], []);
    expect(refs[0].faceRefIndexes).toEqual([]);
    expect(refs[0].voice?.url).toBe("https://x/n.mp3");
  });
});

describe("checkSeedanceVoices", () => {
  const voiced = (id: string, seconds: number) => ({ characterId: id, name: id, faceUrls: [], faceRefIndexes: [], voice: { url: "u", durationSeconds: seconds } });
  it("passes under 30 s total", () => {
    expect(checkSeedanceVoices([voiced("a", 12), voiced("b", 18)])).toBeNull();
  });
  it("names the characters when the total exceeds 30 s", () => {
    expect(checkSeedanceVoices([voiced("Riya", 20), voiced("Sam", 15)]))
      .toBe("Seedance takes at most 30 seconds of voice per request; Riya and Sam total 35 s. Shorten a sample or drop a character.");
  });
  it("rejects more than 10 voiced characters", () => {
    const eleven = Array.from({ length: 11 }, (_, i) => voiced(`c${i}`, 1));
    expect(checkSeedanceVoices(eleven)).toBe("Seedance takes at most 10 voice clips per request; 11 characters have a voice.");
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/lib/video-gen/__tests__/character-refs.test.ts`
Expected: FAIL.

- [ ] **Step 3: Types**

In `types.ts`, after `ImageInputCapabilities`:

```ts
/**
 * How a model takes a character's voice (D264/D265).
 *   none         — no voice input; the character's faces still go in as references
 *   inline-audio — a `reference_audio` entry on the generate call (Seedance 2.5)
 *   element      — a pre-registered element carrying faces + voice (Kling 3.0 Omni, plan 2)
 */
export type VoiceInput = "none" | "inline-audio" | "element";

/** One Character (D264) as the request sees it. */
export type CharacterRef = {
  characterId: string;
  name: string;
  notes?: string;
  /** Frontal first. */
  faceUrls: string[];
  voice?: { url: string; durationSeconds: number };
  /** Positions of this character's faces inside `referenceUrls` — the face↔voice pairing. */
  faceRefIndexes: number[];
};
```

`VideoGenInput` gains `characters: CharacterRef[];`. `VideoGenModelSpec` gains `voiceInput: VoiceInput;` after `imageInputs`.

Then add `voiceInput` to every spec — the compiler lists them: `veoLite`, `veoFast`, `veoQuality`, `sora*`, `kling30`, `klingO1`, `kling30Omni`, `geminiOmni` → `"none"`; `seedance25` → `"inline-audio"`. Mirror the same values in every `videoGenClientModelMap` entry (`VideoGenClientModelSpec` is `Omit<VideoGenModelSpec, "generate">`, so the compiler enforces it). Kling 3.0 Omni stays `"none"` until plan 2 flips it.

- [ ] **Step 4: `character-refs.ts`**

```ts
// src/lib/video-gen/character-refs.ts
import type { CharacterRef } from "./types";
import type { CollectedCharacter } from "./collect-upstream-images";
import { SEEDANCE_VOICE_MAX_CLIPS, SEEDANCE_VOICE_TOTAL_MAX_SECONDS } from "@/lib/character/constants";

/**
 * Pair each character with where its faces ended up in the request's reference list. Done AFTER
 * role assignment and capping, against the final `referenceUrls`, because that is the list the
 * provider numbers `@Image N` / `image_N` over — a face capped out of it has no index.
 */
export function buildCharacterRefs(
  characters: CollectedCharacter[],
  referenceUrls: string[],
): CharacterRef[] {
  const indexOf = new Map(referenceUrls.map((url, i) => [url, i]));
  return characters.map((c) => ({
    characterId: c.id,
    name: c.name,
    notes: c.notes,
    faceUrls: c.faceUrls,
    voice: c.voice,
    faceRefIndexes: c.faceUrls.map((u) => indexOf.get(u)).filter((i): i is number => i !== undefined),
  }));
}

/** Seedance's per-request audio budget. Null when it fits; a sentence naming who doesn't. */
export function checkSeedanceVoices(characters: CharacterRef[]): string | null {
  const voiced = characters.filter((c) => c.voice);
  if (voiced.length > SEEDANCE_VOICE_MAX_CLIPS) {
    return `Seedance takes at most ${SEEDANCE_VOICE_MAX_CLIPS} voice clips per request; ${voiced.length} characters have a voice.`;
  }
  const total = voiced.reduce((s, c) => s + (c.voice?.durationSeconds ?? 0), 0);
  if (total > SEEDANCE_VOICE_TOTAL_MAX_SECONDS) {
    const names = voiced.map((c) => c.name);
    const list = names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names[0];
    return `Seedance takes at most ${SEEDANCE_VOICE_TOTAL_MAX_SECONDS} seconds of voice per request; ${list} total ${Math.round(total)} s. Shorten a sample or drop a character.`;
  }
  return null;
}
```

- [ ] **Step 5: The route and the task**

In `video-generate/route.ts`, after `referenceUrls` is capped (`if (referenceUrls.length > maxRefs) referenceUrls.splice(maxRefs);`) and before the D97 `validateAgainstRules` block:

```ts
    // D264 — the characters this request references, paired with where their faces landed.
    // Built for every model: faces are references regardless; the provider decides what to do with
    // a voice from its own `voiceInput`.
    let characters = buildCharacterRefs(upstreamCharacters, referenceUrls);
    const warnings: string[] = [];

    if (config.voiceInput === "inline-audio") {
      // Seedance: audio rides with references and is mutually exclusive with frames. A voiced
      // character on a first-frame shot is not an error — the operator asked for that shot —
      // but the voice cannot go, and they should hear so.
      if (startFrameUrl && characters.some((c) => c.voice)) {
        characters = characters.map((c) => ({ ...c, voice: undefined }));
        warnings.push("Voices dropped: Seedance can't take a voice on a first-frame shot.");
      }
      const voiceProblem = checkSeedanceVoices(characters);
      if (voiceProblem) return apiError(voiceProblem, 400);
    }
```

Add `characters` to `inputsSnapshot`, to the `tasks.trigger("video-generate", {...})` payload, and return `apiOk({ generationId: generation.id, warnings }, 202)`. Import `buildCharacterRefs`, `checkSeedanceVoices` from `@/lib/video-gen/character-refs`.

In `trigger/video-generate.ts`: add `characters?: CharacterRef[]` to the payload type (`import type { CharacterRef } from "@/lib/video-gen/types"` — type-only, so no server-only pull), log `characterCount: payload.characters?.length ?? 0`, and pass `characters: payload.characters ?? []` into `config.generate({...})`.

- [ ] **Step 6: Every model declares `voiceInput`**

Add to `src/lib/video-gen/__tests__/kling-3-0-omni-registration.test.ts` (or a new `voice-input.test.ts` next to it if that file is specific to one model):

```ts
it("every registered model declares how it takes a voice (D265)", async () => {
  const { videoGenRegistry } = await import("../registry");
  const { videoGenClientModelMap } = await import("../client-models");
  for (const [id, spec] of Object.entries(videoGenRegistry)) {
    expect(["none", "inline-audio", "element"]).toContain(spec.voiceInput);
    expect(videoGenClientModelMap[id]?.voiceInput).toBe(spec.voiceInput);
  }
  expect(videoGenRegistry["seedance:seedance-2-5"].voiceInput).toBe("inline-audio");
});
```

- [ ] **Step 7: Run, type-check, commit**

Run: `npx vitest run src/lib/video-gen/__tests__/character-refs.test.ts src/lib/video-gen/__tests__/kling-3-0-omni-registration.test.ts "src/app/api/nodes/[id]/video-generate" && npx tsc --noEmit`
Expected: PASS; no type errors.

```bash
git add src/lib/video-gen/types.ts src/lib/video-gen/providers src/lib/video-gen/client-models.ts src/lib/video-gen/character-refs.ts src/lib/video-gen/__tests__/character-refs.test.ts src/lib/video-gen/__tests__/kling-3-0-omni-registration.test.ts "src/app/api/nodes/[id]/video-generate/route.ts" trigger/video-generate.ts
git commit -m "feat(video-gen): characters travel on the request; voiceInput per model; Seedance voice guards

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 10: Seedance sends `reference_audio` and a voice roster

**Files:**
- Create: `src/lib/video-gen/providers/seedance-voice-roster.ts`
- Test: `src/lib/video-gen/providers/__tests__/seedance-voice-roster.test.ts`
- Modify: `src/lib/video-gen/providers/seedance.ts:36-56` (`buildSeedanceContent`), `:58-72` (`buildSeedanceBody` — prompt)
- Test: `src/lib/video-gen/providers/__tests__/seedance.test.ts` (extend; check what it already exports/tests first)

**Interfaces:**
- Consumes: `CharacterRef` (Task 9).
- Produces: `renderSeedanceVoiceRoster(characters: CharacterRef[]): string` (pure; `""` when no character has a voice); `buildSeedanceContent` appends audio entries in the reference branch only.

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/video-gen/providers/__tests__/seedance-voice-roster.test.ts
import { describe, it, expect } from "vitest";
import { renderSeedanceVoiceRoster } from "../seedance-voice-roster";

const c = (name: string, faceRefIndexes: number[], seconds?: number) => ({
  characterId: name, name, faceUrls: [], faceRefIndexes,
  voice: seconds === undefined ? undefined : { url: `https://x/${name}.mp3`, durationSeconds: seconds },
});

describe("renderSeedanceVoiceRoster", () => {
  it("states each voiced character's faces and audio handle, numbered in request order", () => {
    expect(renderSeedanceVoiceRoster([c("Riya", [0, 1], 12), c("Sam", [2], 8)])).toBe(
      "Riya: appearance from @Image 1, @Image 2; voice timbre from @Audio 1.\n" +
      "Sam: appearance from @Image 3; voice timbre from @Audio 2.",
    );
  });
  it("skips an unvoiced character in the audio numbering", () => {
    expect(renderSeedanceVoiceRoster([c("Riya", [0]), c("Sam", [1], 8)])).toBe(
      "Sam: appearance from @Image 2; voice timbre from @Audio 1.",
    );
  });
  it("describes a voice with no faces as voice only", () => {
    expect(renderSeedanceVoiceRoster([c("Narrator", [], 8)])).toBe("Narrator: voice timbre from @Audio 1.");
  });
  it("is empty with no voices", () => {
    expect(renderSeedanceVoiceRoster([c("Riya", [0])])).toBe("");
  });
});
```

Add to `seedance.test.ts` (import `buildSeedanceContent`, `buildSeedanceBody` — export them from `seedance.ts` if they aren't already; the file uses `vi.stubGlobal("fetch", …)` like `kling-provider.test.ts`):

```ts
describe("voices", () => {
  const riya = { characterId: "c1", name: "Riya", faceUrls: ["https://x/r0.jpg"], faceRefIndexes: [0], voice: { url: "https://x/r.mp3", durationSeconds: 12 } };
  it("appends reference_audio after the reference images", () => {
    const content = buildSeedanceContent({ prompt: "p", referenceUrls: ["https://x/r0.jpg"], params: {}, characters: [riya] }, 30);
    expect(content).toEqual([
      { type: "text", text: "p" },
      { type: "image_url", image_url: { url: "https://x/r0.jpg" }, role: "reference_image" },
      { type: "audio_url", audio_url: { url: "https://x/r.mp3" }, role: "reference_audio" },
    ]);
  });
  it("sends no audio on a first-frame request", () => {
    const content = buildSeedanceContent({ prompt: "p", startFrameUrl: "https://x/s.png", referenceUrls: [], params: {}, characters: [riya] }, 30);
    expect(content.some((c) => c.type === "audio_url")).toBe(false);
  });
  it("prepends the voice roster to the prompt", () => {
    const body = buildSeedanceBody({ prompt: "A woman speaks.", referenceUrls: ["https://x/r0.jpg"], params: {}, characters: [riya] }, 30);
    expect((body.content as Array<{ text?: string }>)[0].text).toBe(
      "Riya: appearance from @Image 1; voice timbre from @Audio 1.\n\nA woman speaks.",
    );
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/lib/video-gen/providers/__tests__/seedance-voice-roster.test.ts src/lib/video-gen/providers/__tests__/seedance.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// src/lib/video-gen/providers/seedance-voice-roster.ts
import type { CharacterRef } from "../types";

/**
 * D265 — the face↔voice pairing, stated ONCE at the top of the prompt rather than cited in every
 * beat. Seedance's own prompt rules ask for exactly this: "Use @Image 1, @Video 1, and @Audio 1 to
 * refer to reference assets. Specify what each asset provides, such as appearance … or timbre"
 * (ref/byteplus-docs/Dreamina Seedance 2.5 tutorial.md, Prompt rules).
 *
 * `@Image N` is 1-based over the request's images (= `referenceUrls` order, which is what
 * `faceRefIndexes` indexes); `@Audio N` is 1-based over the audio entries in the order
 * `buildSeedanceContent` appends them — voiced characters, in `characters` order. Both numberings
 * are counted per asset type, exactly as the vendor's Private virtual portrait doc states.
 */
export function renderSeedanceVoiceRoster(characters: CharacterRef[]): string {
  const lines: string[] = [];
  let audioNo = 0;
  for (const c of characters) {
    if (!c.voice) continue;
    audioNo += 1;
    const faces = c.faceRefIndexes.map((i) => `@Image ${i + 1}`).join(", ");
    const appearance = faces ? `appearance from ${faces}; ` : "";
    lines.push(`${c.name}: ${appearance}voice timbre from @Audio ${audioNo}.`);
  }
  return lines.join("\n");
}
```

In `seedance.ts`:
- Import `renderSeedanceVoiceRoster`.
- `buildSeedanceContent`: after the reference-image loop (reference branch only — the frames branch already `return`s before it), append:

```ts
  // Voices (D264): one `reference_audio` per voiced character, AFTER the images so `@Audio N`
  // and `@Image N` each count their own type from 1. Never on the frames branch above — audio
  // is a reference-task input and the endpoint refuses to mix the two.
  for (const c of input.characters ?? []) {
    if (!c.voice) continue;
    content.push({ type: "audio_url", audio_url: { url: c.voice.url }, role: "reference_audio" });
  }
```

- `buildSeedanceBody`: build the prompt as `const roster = input.startFrameUrl ? "" : renderSeedanceVoiceRoster(input.characters ?? []); const prompt = roster ? `${roster}\n\n${input.prompt}` : input.prompt;` and pass `{ ...input, prompt }` into `buildSeedanceContent`.
- Export `buildSeedanceContent` and `buildSeedanceBody` if they aren't.
- Check `fitSeedanceImages` (`seedance-images.ts`) spreads the whole input through (`...input`) so `characters` survives re-encoding; if it rebuilds the object field by field, add `characters`.

- [ ] **Step 4: Run, type-check, commit**

Run: `npx vitest run src/lib/video-gen/providers/__tests__ && npx tsc --noEmit`
Expected: PASS.

```bash
git add src/lib/video-gen/providers/seedance.ts src/lib/video-gen/providers/seedance-voice-roster.ts src/lib/video-gen/providers/__tests__
git commit -m "feat(seedance): reference_audio per voiced character and a voice roster line

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 11: The Video Gen focus view shows a character as one chip

**Files:**
- Create: `src/components/nodes/video-gen-character-chip.tsx`
- Modify: `src/components/nodes/video-gen-connected-section.tsx` (partition `images`; render chips; new props)
- Modify: `src/components/nodes/video-gen-focus-view.tsx` (hold `characters` from the fetch; pass `characters`, `voiceInput`, model label into the section; toast `warnings` from the 202)
- Modify: `src/lib/video-gen/api.ts` (`startGeneration` return type includes `warnings?: string[]`)

**Interfaces:**
- Consumes: `UpstreamCharacter`, `UpstreamImage.characterId` (Task 8); `VoiceInput` (Task 9).
- Produces: `VideoGenCharacterChip({ character, faces, voiceInput, modelLabel })`.

- [ ] **Step 1: The chip**

```tsx
// src/components/nodes/video-gen-character-chip.tsx
"use client";

import { AudioLines, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { UpstreamCharacter, UpstreamImage } from "@/lib/video-gen/api";
import type { VoiceInput } from "@/lib/video-gen/types";

type Props = {
  character: UpstreamCharacter;
  faces: UpstreamImage[];
  voiceInput: VoiceInput;
  modelLabel: string;
};

/**
 * One Character = one chip (D264): its faces are references and not role-switchable, so the
 * per-image role buttons the other thumbnails get would only offer choices that do nothing.
 */
export function VideoGenCharacterChip({ character, faces, voiceInput, modelLabel }: Props) {
  const voiceUsed = character.hasVoice && voiceInput !== "none";
  const voiceTitle = !character.hasVoice
    ? "No voice attached"
    : voiceInput === "none"
      ? `Voice not used by ${modelLabel}`
      : `Voice sent to ${modelLabel}`;

  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-border px-2.5 py-2">
      <div className="flex -space-x-2">
        {faces.length === 0 ? (
          <span className="flex size-8 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <UserRound className="size-4" strokeWidth={1.5} />
          </span>
        ) : (
          faces.slice(0, 3).map((f) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={f.id} src={f.imageUrl} alt={f.filename ?? ""} className="size-8 rounded-full border-2 border-card object-cover" />
          ))
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold text-foreground">{character.name}</p>
        <p className="text-[0.65rem] text-muted-foreground">
          {faces.length === 0
            ? `${character.name} · no faces yet`
            : `Reference · ${faces.length} face${faces.length === 1 ? "" : "s"}`}
        </p>
      </div>
      <Tooltip>
        <TooltipTrigger
          render={
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[0.65rem] font-medium",
                voiceUsed ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground/60",
              )}
            />
          }
        >
          <AudioLines className="size-3" strokeWidth={1.5} />
          {character.hasVoice ? `${Math.round(character.voiceDurationSeconds ?? 0)} s` : "no voice"}
        </TooltipTrigger>
        <TooltipContent>{voiceTitle}</TooltipContent>
      </Tooltip>
    </div>
  );
}
```

- [ ] **Step 2: Wire the section**

In `video-gen-connected-section.tsx`:
- Add props `characters: UpstreamCharacter[]`, `voiceInput: VoiceInput`, `modelLabel: string`.
- Partition: `const characterFaces = images.filter((i) => i.characterId); const plainImages = images.filter((i) => !i.characterId);` and use `plainImages` wherever the component currently maps `images` to role-chip thumbnails.
- Above the plain image list, render one `VideoGenCharacterChip` per `characters` entry with `faces={characterFaces.filter((f) => f.characterId === c.id)}`.
- `hasContent` becomes `promptNode !== null || images.length > 0 || characters.length > 0`.

In `video-gen-focus-view.tsx`:
- Where `fetchUpstreamImages(nodeId)` resolves and calls `setUpstreamImages(images)`, also `setUpstreamCharacters(characters)` (new `useState<UpstreamCharacter[]>([])`).
- Pass `characters={upstreamCharacters}`, `voiceInput={model.voiceInput}` and `modelLabel={model.label}` to `<VideoGenConnectedSection>` (the selected client model spec is already in scope near line 1570 — find the variable name with `grep -n "videoGenClientModelMap\[" src/components/nodes/video-gen-focus-view.tsx`).
- Where the 202 response of `startGeneration` is handled, `for (const w of result.warnings ?? []) toast.warning(w);` — and in `api.ts` extend `startGeneration`'s return type to `{ generationId: string; warnings?: string[] }`.

- [ ] **Step 3: Type-check and try it**

Run: `npx tsc --noEmit`. Dev: connect a Character to a Video Gen node; the connected section shows one chip with stacked face thumbnails, "Reference · 2 faces", and the voice pill — muted with "Voice not used by Gemini Omni 1.1" on Gemini, primary on Seedance. Generate on Seedance with a start frame → the "Voices dropped" toast appears and the clip still generates.

- [ ] **Step 4: Commit**

```bash
git add src/components/nodes/video-gen-character-chip.tsx src/components/nodes/video-gen-connected-section.tsx src/components/nodes/video-gen-focus-view.tsx src/lib/video-gen/api.ts
git commit -m "feat(video-gen): a character is one chip in the connected section, with its voice state

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 12: The single-take writer hears about characters

**Files:**
- Modify: `src/lib/nodes/video-prompt.ts:97-140` (`buildCompositionBlock`)
- Test: `src/lib/nodes/__tests__/video-prompt.test.ts` (add)

**Interfaces:**
- Consumes: expanded character previews (`type: "character"`, Task 7).

- [ ] **Step 1: Write the failing test**

Look at how `video-prompt.test.ts` builds `compileVideoPrompt` inputs and add, in the same style:

```ts
it("tells the writer to cite a character's frontal face and never describe its voice", () => {
  const { user } = compileVideoPrompt({
    clientContext: "",
    instruction: "",
    targetProvider: "seedance",
    upstream: [
      { nodeId: "c1#0", label: "Riya (frontal)", type: "character", text: "Character: Riya (2 face references attached; voice bound — do not describe the voice)", fileUrl: "https://x/f0.jpg", fileKind: "image" },
      { nodeId: "c1#1", label: "Riya (angle 2)", type: "character", text: "", fileUrl: "https://x/f1.jpg", fileKind: "image" },
    ],
  });
  expect(user).toContain("@Image 1 — Riya (frontal)");
  expect(user).toContain("@Image 2 — Riya (angle 2)");
  expect(user).toContain("A CHARACTER's faces are labelled by name");
});
```

(Adjust the destructured field to whatever `compileVideoPrompt` returns for the user turn — check the existing tests.)

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/nodes/__tests__/video-prompt.test.ts`
Expected: FAIL on the "A CHARACTER's faces" assertion.

- [ ] **Step 3: Add the sentence**

In `buildCompositionBlock`, after `scopeLine` is computed:

```ts
  // D264/D265 — a Character's faces arrive as several attachments with one name. The writer
  // cites the person by the FRONTAL face's handle and leaves the other angles uncited (they are
  // references the model sees regardless), and it never writes a voice: the voice is bound on
  // the request and prose about it would only fight the sample.
  const characterLine = visionNodes.some((u) => u.type === "character")
    ? "A CHARACTER's faces are labelled by name — \"Riya (frontal)\", \"Riya (angle 2)\". Cite the person ONCE per beat by the (frontal) handle; do not cite the other angles. Never describe how a character's voice sounds — it is already bound."
    : "";
```

and include `characterLine` in the returned array before `scopeLine`.

- [ ] **Step 4: Run, commit**

Run: `npx vitest run src/lib/nodes/__tests__/video-prompt.test.ts`
Expected: PASS.

```bash
git add src/lib/nodes/video-prompt.ts src/lib/nodes/__tests__/video-prompt.test.ts
git commit -m "feat(video-prompt): the writer cites a character's frontal face and never its voice

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 13: End-to-end check and spec sync

**Files:**
- Modify: `docs/superpowers/specs/2026-09-14-character-node-voice-reference-design.md` (§3.2 rename `VoiceRef` → `CharacterRef`; §2.1 note that registrations live in a table; §4.2 first line: elements are built for every character with a frontal face)
- Modify: `docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md` (D266 — replace "cached on the node" with the table, and record why)

- [ ] **Step 1: Run the touched suites together**

Run: `npx vitest run src/lib/character src/lib/video-gen src/lib/nodes "src/app/api/nodes/[id]/character" "src/app/api/nodes/[id]/video-generate" && npx tsc --noEmit && npm run lint`
Expected: all PASS, no type or lint errors.

- [ ] **Step 2: Real generation on Seedance**

Dev server: Script → fan-out → Multishot → Multishot Prompt (target Seedance 2.5) with a Character (2 faces, 12 s voice) connected. Generate the plan, `@`-mention the character in the beat where she speaks, connect Video Gen, generate. Confirm in the Trigger.dev run log that the request body's `content` ends with a `reference_audio` entry and the prompt starts with `Riya: appearance from @Image 1, @Image 2; voice timbre from @Audio 1.`. Note: a real face will trip Seedance's real-person rejection — use a generated/illustrated face for this check (spec §4.4).

- [ ] **Step 3: Sync the spec and the ADR**

In the spec: rename `VoiceRef` to `CharacterRef` and update the type block to the Task 9 shape; in §2.1 remove the `kling?:` field and add the sentence *"Provider registrations live in `character_provider_registrations` (plan 2) — autosave upserts the whole `data` object from the client store, so a server-side write there would be clobbered."*; in §4.2 change "for voiced characters" wording to *"every character with a frontal face gets an element; the voice is bound when present"*.

In D266: change the title to *"Kling voices and elements are registered lazily, cached in `character_provider_registrations`, keyed by source"*, the Decision's storage sentence to the table, and add to **Why**: *"On the node was the first cut, and it is wrong: `saveCanvasNodes` upserts each node's whole `data` from the client store, so a registration written server-side is overwritten by the next autosave. A table the client never writes has no such race."* Move "a separate table" out of **Rejected** and put "on the node's `data`" there with that reason.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/2026-09-14-character-node-voice-reference-design.md docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md
git commit -m "docs(spec): CharacterRef naming, registrations table, element-for-every-face (D266 amended)

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Self-review notes

- **Spec coverage.** §2 node → Tasks 1–6. §3.1 faces as references → Tasks 7–8. §3.2 `characters` on the request + `voiceInput` → Task 9. §3.3 mentions → Task 7 (the frontal-face id makes every existing dialect work unchanged; Kling's `@element_N` is plan 2). §4.1 Seedance → Tasks 9–10. §4.3 Google/Sora → `voiceInput: "none"` in Task 9. §4.2 Kling → plan 2. §5 errors → Tasks 1, 4, 9, 11. §7 tests → each task's test step. §8 build order items 1–4 → this plan.
- **Deviations recorded in Task 13:** `VoiceRef` → `CharacterRef`; registrations in a table, not on the node; Kling elements for every character with a frontal face.
- **Type consistency.** `CharacterFace`/`CharacterVoice`/`CharacterNodeData` (Task 2) are what Tasks 5–8 read; `faceRefId` ids (`c1#0`) are what Tasks 7, 8, 11 key on; `CollectedCharacter` (Task 8) feeds `buildCharacterRefs` (Task 9) which produces the `CharacterRef` the Seedance roster (Task 10) renders.
