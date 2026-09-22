# Character node — voice reference across clips

**14 September 2026 · design spec**
Supersedes the placement half of `docs/2026-09-11-audio-consistency-across-clips.md` (which attached
audio in the prompt node). The provider findings in that doc still hold except where corrected in
§6; the build order there is replaced by this spec.

---

## 1. Problem

A reel is generated as separate clips. Each generation invents its own voice, so the same character
sounds like a different person at every join. Two of our video models accept a voice sample at
generation time (Seedance 2.5, Kling 3.0 Omni); the others take none. Today nothing in the canvas
can hold a voice, and a human reference is just an image File node — there is no object that says
"this face and this voice are one person".

**Goal.** One canvas object per person that carries their faces and their voice, and is sent to
every video generation that references them — so the same sample reaches clip one and clip five
without the operator re-citing it. Models that take a voice get it; models that don't ignore it and
still get the faces.

**Non-goals.** Re-syncing a finished clip to our own track (the Kling lip-sync lane in the 11 Sep
doc, stage 3) — a separate spec. Seedance's private real-human asset library — a follow-up (§6.4).
Feeding Image Gen, Prompt, Shot or Post from a Character — later; this pass is the video lanes.
Migrating existing image File nodes into Characters — none; operators build Characters fresh.

---

## 2. The Character node

A new node type `character`. One person = one node. Self-contained: no inputs, one source handle.
Its **title is the person's name**, and that name is what the operator `@`-mentions.

### 2.1 Data

```ts
// canvas-nodes.ts
export type CharacterFace = {
  url: string; filename: string; width: number; height: number; sizeBytes: number;
};
export type CharacterVoice = {
  url: string; filename: string; sizeBytes: number; durationSeconds: number;
};
export type CharacterNodeData = {
  title?: string;               // the NAME — the @-mention label ("Riya")
  faces?: CharacterFace[];      // 1–4. faces[0] is the FRONTAL image (Kling's frontal_image)
  voice?: CharacterVoice;       // exactly one
  notes?: string;               // one-liner for writers; doubles as Kling's element_description
  // Provider registrations. Written ONLY server-side (the Trigger task), never by the focus
  // view. Keyed on what they were built from so a changed face or voice invalidates them.
  kling?: {
    voiceId?: string;   voiceSourceUrl?: string;
    elementId?: string; elementSourceKey?: string;  // sorted face urls + voice url, joined
  };
};
```

`AppNode` gains `Node<CharacterNodeData, "character">`. `VALID_CONNECTIONS.character =
["video-gen", "video-prompt", "multishot-prompt"]`. It appears in no source list — no target handle.

### 2.2 Card

`w-44`, `NodeCardHeader` with Lucide `UserRound`, `NodeContextMenu`, `shadow-card` — the File
node's conventions. Body: the frontal face as a `h-16` thumbnail with the other faces as small
squares beneath it; the name; a `voice` pill (Lucide `AudioLines`, `mm:ss`) when a voice is
attached, muted "no voice" text otherwise; the usual `Open ↗`. Status dot: primary when at least one
face exists.

### 2.3 Focus view

Two sections plus notes, in the sheet the other nodes use.

- **Faces.** Up to four tiles. Tile 0 is labelled *Frontal* and the empty state for it reads
  "Add a frontal face — Kling builds the character from this one". A dashed-border primary chip
  adds a face (file picker, drag-drop, paste — the File node's helpers). Each tile has remove and
  "make frontal" (moves it to index 0).
- **Voice.** One slot. Empty: a dashed chip "Add voice sample" with the rule beneath it:
  *wav or mp3 · 5–30 seconds · one clean speaker, no music*. Filled: filename, duration, a play /
  pause `Button`, replace, remove. Duration is measured on select with an `<audio>` element
  (non-interactive media element — not a control) and rejected outside the window before upload.
- **Notes.** `Textarea`, placeholder "late 20s, warm, Tamil accent". Shown to prompt writers and
  sent as Kling's `element_description` (truncated to 100 chars; the name is the fallback).

Uploads use the existing browser → GCS path (`file/sign` → `file/finalize`), extended to accept
audio extensions and a `slot` (`face` | `voice`) so the finalize writes into `faces[]` / `voice`
instead of `fileUrl`. Replacing a face or the voice removes the old object best-effort, as
`removeNodeFileObject` does today.

### 2.4 Constants and validation — `src/lib/character/`

`constants.ts`:

| | Value | Source |
|---|---|---|
| `CHARACTER_MAX_FACES` | 4 | Kling: 1 frontal + 1–3 refer images |
| `CHARACTER_FACE_EXTENSIONS` | `jpg jpeg png` | Kling elements reject webp |
| `CHARACTER_FACE_MAX_BYTES` | 10 MB | Kling |
| `CHARACTER_FACE_MIN_PX` | 300 | Kling |
| `CHARACTER_VOICE_EXTENSIONS` | `wav mp3` | Seedance and Kling both |
| `CHARACTER_VOICE_MIN_SECONDS` / `MAX` | 5 / 30 | Kling's floor, both vendors' ceiling |
| `CHARACTER_VOICE_MAX_BYTES` | 15 MB | Seedance |
| `SEEDANCE_VOICE_TOTAL_MAX_SECONDS` | 30 | Seedance, per request |
| `KLING_MAX_REFS_AND_ELEMENTS` | 7 | Kling Omni, no reference video |

`validate.ts` holds the pure checks (`validateFace`, `validateVoice`) and both the focus view and
the sign route call them. The server cannot measure audio duration; it checks extension and size,
stores the client's `durationSeconds`, and the vendor is the final arbiter.

---

## 3. How a Character reaches a request

A Character contributes **faces as reference images** (the existing image pipeline) and **its
voice as a voice reference** (new).

### 3.1 Faces are reference images owned by the character

`src/lib/character/refs.ts` exports `characterImageRefs(node)` → one `UpstreamImageRef` per face:
`{ nodeId: characterId, faceIndex, url, type: "character" }`. Every site that collects upstream
images today calls it for `character` nodes: `video-generate/route.ts`, `upstream-images/route.ts`,
`visionAttachmentsOf`, `selectImageUpstreams`, `resolve-mention-tokens.ts`.

- **Role.** Always `reference`. `autoAssignImageRoles` treats character faces as pre-assigned and
  never promotes one to `start_frame`, even on a no-references model (they are dropped there, and
  the chip says so).
- **Keys.** `imageRoles` stays per image; a face's key is `${characterId}#${faceIndex}`.
- **Order.** A character's faces are contiguous, in `faces[]` order, at the character's position in
  prompt-upstream order — `orderImagesForPromptTokens`'s contract is unchanged.
- **Chip.** The Video Gen focus view shows a character as ONE chip: name, face count, voice pill —
  not four image chips. The chip is not role-switchable.

### 3.2 Voices are a new field on the request

```ts
// video-gen/types.ts
export type VoiceRef = {
  characterId: string;
  name: string;
  url: string;
  durationSeconds: number;
  /** Positions of this character's faces inside referenceUrls — the face↔voice pairing. */
  faceRefIndexes: number[];
  /** Present only on Kling, once registered. */
  klingElementId?: string;
};
export type VideoGenInput = { …; referenceUrls: string[]; voices: VoiceRef[] };
```

`VideoGenModelSpec` gains `voiceInput: "none" | "inline-audio" | "element"`:

| Model | `voiceInput` |
|---|---|
| Seedance 2.5 | `inline-audio` |
| Kling 3.0 Omni | `element` |
| Gemini Omni 1.1, Veo 3.1, Sora, Kling 3.0 (non-Omni) | `none` |

The route builds `voices` only when the flag is not `none`. The focus view reads the same flag to
grey the voice pill with "Voice not used by {model label}".

### 3.3 Mentions

The `@` menu in Video Prompt and Multishot Prompt lists a character **once, by name**. The stored
token is one mention per character (`@[Character: Riya](nodeId)` in the Instruction; the dialect's
token in a plan). Expansion to the model's shape happens at render time, never in stored text, so
retargeting a plan does not rewrite beats:

| Model | `@Riya` in a beat renders as | Voice pairing |
|---|---|---|
| Seedance | `@Image 2` (the frontal face) | Roster line, once, prepended to the prompt (§4.1) |
| Kling 3.0 Omni | `@element_1` | Inside the element — nothing in the prompt |
| Gemini Omni | `<IMAGE_REF_1>` (the frontal face) | none |

Beats cite the frontal face only; the other faces are references the model sees without a
citation. The writers' system prompts get one sentence: a character is cited by its handle, and its
voice is already bound — do not describe a voice in prose.

**Why roster-once and not `@Audio N` in every beat.** The pairing is a fact about the request,
not about a beat. Stated once it cannot be mis-cited, and a beat with two speakers stays as short
as one with none. Seedance's own prompt rules ask for exactly this ("specify what each asset
provides, such as appearance … or timbre").

---

## 4. Providers

### 4.1 Seedance 2.5 — `providers/seedance.ts`

`buildSeedanceContent` appends, after the reference images, one entry per voice:
`{ type: "audio_url", audio_url: { url }, role: "reference_audio" }`. The frames branch does not
append voices — frames and references (including audio) are mutually exclusive on this endpoint —
and the route records a warning line on the generation: *"Voices dropped: Seedance can't take a
voice on a first-frame shot."*

A pure `renderSeedanceVoiceRoster(voices)` (new, unit-tested) prepends to the prompt one line per
character: `Riya: appearance from @Image 1, @Image 2; voice timbre from @Audio 1.` `@Audio N` is
1-based over the audio entries in request order, exactly as `@Image N` is over images. Total voice
seconds > 30 → a named 400 before `insertGeneration` / `reserveCredits`.

### 4.2 Kling 3.0 Omni — `providers/kling.ts` + new `providers/kling-elements.ts`

Kling's Omni endpoint has no voice field; the element is the only path. `ensureKlingElement(node)`
runs inside the Trigger task before the generate call:

1. `kling.elementId` present and `elementSourceKey` equals the current key → reuse.
2. Voice changed (`voiceSourceUrl` ≠ `voice.url`) → `POST /v1/general/custom-voices`
   `{ voice_name: name.slice(0,20), voice_url }` → poll `GET …/custom-voices/{task_id}` until
   `succeed` → `task_result.voices[0].voice_id`. Store `voiceId`, `voiceSourceUrl`.
3. `POST /v1/general/advanced-custom-elements` `{ element_name: name.slice(0,20),
   element_description: (notes || name).slice(0,100), reference_type: "image_refer",
   element_image_list: { frontal_image: faces[0].url, refer_images: faces[1..].map(url) },
   element_voice_id: voiceId, tag_list: [{ tag_id: "o_102" }] }` → poll until `succeed` →
   `task_result.elements[0].element_id` (stringified). Store `elementId`, `elementSourceKey`.
4. Best-effort `POST /v1/general/delete-advanced-elements` / `delete-voices` for the superseded
   ids. A failure here is logged, never surfaced.

Polling uses the provider's existing cadence and retry rule (`POLL_INTERVAL_MS`, transient errors
retried). Registration state is written to the node's `data.kling` server-side; the node shows
"Registering Riya on Kling…" while it runs.

The generate call then sends `{ type: "element", element_id, id: "element_N" }` in `contents`
instead of that character's `refer_image` entries (N is 1-based over voiced characters in request
order, mirroring `image_N`), and forces `settings.audio = "native"` whenever a voiced element is
present — a bound voice is inaudible with audio off. `refer_image` count + elements ≤ 7, else a
named 400.

A Character with a voice but no faces cannot form an element (voice binds to image elements only)
→ the chip warns *"add a frontal face to use the voice on Kling"* and the route sends nothing for
it.

### 4.3 Gemini Omni, Veo, Sora, Kling 3.0

Faces go in as references; `voices` is empty. Nothing else changes.

### 4.4 Seedance and real faces — stated, not solved

Seedance refuses a reference image containing a real human face. A Character built from a real
actor's photos hits `InputImageSensitiveContentDetected`, and `explainSeedanceError` already names
the vendor's three routes. Their private real-human asset library (`asset://<id>` in place of a URL,
Advanced Creation Rights required) is the answer and is a follow-up spec; the node's `kling` slot is
named as a provider so a `seedance` slot can sit beside it.

---

## 5. Errors and states

| Situation | Behaviour |
|---|---|
| Voice outside 5–30 s / wrong format / > 15 MB | Rejected on select, before upload: *"Voice samples must be wav or mp3, 5–30 seconds — Kling and Seedance both require it."* |
| Face is webp / < 300 px / > 10 MB | Rejected on select: *"Kling elements take jpg or png, at least 300 px."* |
| Seedance total voice > 30 s | 400 naming the characters; no generation row, no credit reservation. |
| Kling refs + elements > 7 | 400 with the count. |
| Voiced character on a Seedance frames-only request | Voices dropped; warning line on the generation. |
| Kling voice / element task fails | Generation fails with *"Kling voice/element registration for Riya failed: {task_status_msg}"*; nothing stored on the node; credits refunded through the existing failed-generate path; next generate retries from scratch. |
| Character with no faces and no voice | Connectable; contributes nothing; chip reads *"Riya · no faces yet"*. |
| Model with `voiceInput: none` | Chip's voice pill muted: *"Voice not used by Gemini Omni"*. |

---

## 6. Corrections to the 11 Sep doc

1. Seedance's prompt token is `@Audio 1` (tutorial, Prompt rules), not `【Audio 1】`.
2. Seedance audio formats are wav and mp3 only.
3. Kling voice creation and element creation are both async tasks that must be polled.
4. Kling's Omni generate endpoint has no `voice_ids`; the element is the only voice path.
5. Kling element images are jpg/jpeg/png only, and `element_description` is required.

Sources: `ref/byteplus-docs/Create a video generation task.md`, `ref/byteplus-docs/Dreamina
Seedance 2.5 tutorial.md` (§Prompt rules, §Audio Requirements), `ref/kling-docs/Kling 3.0 Voice
Management.md`, `ref/kling-docs/Kling 3.0 Element Management.md`, `ref/kling-docs/kling omni prompt
guide.md` (§FAQ Elements), and https://kling.ai/document-api/api/video/3-0-omni/video-omni.md
(contents `element` type, `@xxx` handle rule, refs + elements ≤ 7, `settings.audio`).

---

## 7. Testing

Vitest, in each module's existing style.

- `lib/character/validate.test.ts` — every constraint in §2.4.
- `lib/character/refs.test.ts` — faces → refs, contiguous order, `#index` keys, frontal first.
- `lib/nodes/prompt-token-dialect.test.ts` — character mention → frontal-face handle on each
  dialect; `@element_N` on Kling; a character with no faces renders its bare name.
- `lib/video-gen/__tests__/assign-image-roles.test.ts` — character faces never promoted to
  `start_frame`; dropped, not promoted, on a no-references model.
- `lib/video-gen/providers/__tests__/seedance.test.ts` — `reference_audio` entries after images;
  roster line text and numbering; frames branch drops voices; 30 s total guard.
- `lib/video-gen/providers/__tests__/kling-elements.test.ts` (mocked fetch) — reuse on matching
  key; re-register voice on voice change only; element re-created on face change; superseded ids
  deleted; failed task stores nothing; `audio` forced to `native`; the 7-slot guard.
- `api/nodes/[id]/video-generate` — `voiceInput: none` yields empty `voices`; a voiced character
  yields one `VoiceRef` with the right `faceRefIndexes`.

---

## 8. Build order

| # | Item | Size |
|---|---|---|
| 1 | Character node: type, card, focus view, uploads, validation | Medium |
| 2 | Faces as owned references: `characterImageRefs`, roles, ordering, the single chip | Medium |
| 3 | `VoiceRef` / `voiceInput`, mentions and dialects, writer prompt sentence | Small |
| 4 | Seedance lane: `reference_audio`, roster, guards | Small |
| 5 | Kling lane: voice + element registration, element contents, `audio: native`, guards | Large |

1–4 prove the node end to end on the cheapest lane; 5 is independent of 4 and can run in parallel
once 3 lands.
