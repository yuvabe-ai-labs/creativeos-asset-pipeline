# Client avatars — library, studio and voices

**29 September 2026 · design spec · Phase 1**
ADRs: D287–D293. Builds on D264–D266 (Character node), D283–D284 (voice picker, Change voice)
and D285 (Seedream). Visual summary: https://claude.ai/artifact/QtMgQLh161QfodbQQDajW2

---

## 1. Problem

A person in a client's videos is rebuilt by hand on every canvas: the operator uploads faces into a
Character node (D264, unmerged on `feat/character-node`) and picks a voice again each time. Nothing
is shared between canvases, nothing records where a face came from, and there is no place to make a
character in the first place.

**Goal.** A client-level library of avatars. An avatar is a front image, a profile sheet, an
optional ElevenLabs voice and an optional background story. It is created once in a dedicated
studio, with credit costs shown, and is the single record later phases read from.

**In scope (Phase 1).** The Avatars page, the Avatar Studio, the shared voice picker with a
client-scoped tab and voice cloning, the per-avatar voice sample, source and person-type records,
Seedance eligibility shown on the avatar, and billing of image generations through the existing
ledger.

**Out of scope.**

| Item | Where it goes |
|---|---|
| Character node reading `{ avatarId }`; Kling element cache keyed on the avatar; Change voice pre-selecting the avatar's voice; Seedance actually consuming eligible avatars | Phase 2, after `feat/character-node` merges (its `0039_character_provider_registrations` migration must be renumbered) |
| Billing ElevenLabs usage (clone, voice sample, saving a library voice) in credits | Deferred, §7.3 |
| BytePlus private virtual portrait library and real-human asset library (`asset://`) | Later; needs paid Advanced Creation Rights and AK/SK auth |
| ElevenLabs Voice Design; OpenArt's "Build your character" wizard | Not planned |

---

## 2. Routes and navigation

| Route | Purpose |
|---|---|
| `/clients/[id]/avatars` | Library grid |
| `/clients/[id]/avatars/new` | Studio, creates a draft on first Generate or upload |
| `/clients/[id]/avatars/[avatarId]` | Studio, editing an existing avatar or resuming a draft |

An **Avatars** link joins Brand KB and Market on the client page. There is no "brand settings"
area today (Brand Kit lives in the Post editor, D129–D135) and this spec does not add one.

All API routes live under `src/app/api/clients/[id]/avatars/` and
`src/app/api/clients/[id]/voices/`, use `withClient`, and return through `apiOk` / `apiError`.

---

## 3. Data

Migration `0041_client_avatars.sql`. Additive except for one relaxed constraint on `generations`.
Both new tables enable RLS with zero policies, as `0027_brand_kit.sql` does.

### 3.1 `client_avatars`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `client_id` | uuid not null → `clients(id)` on delete cascade | |
| `name` | text | empty while a draft |
| `story` | text | optional |
| `person_type` | text check in (`generic`, `specific`) | derived from the front image's source, §3.3 |
| `front` | jsonb | an `AvatarImage`, §3.2 |
| `sheet` | jsonb | an `AvatarImage`, §3.2 |
| `sheet_stale` | boolean default false | set when `front` changes after a sheet exists |
| `voice` | jsonb | `{ voiceId, name, labels, previewUrl }`, the ElevenLabs account voice |
| `voice_sample` | jsonb | `{ url, durationSeconds, sourceKey }`, §6.3 |
| `status` | text check in (`draft`, `ready`) | §4.4 |
| `archived_at` | timestamptz | null = live |
| `created_by`, `created_at`, `updated_at` | | |

Index on `(client_id, archived_at)`.

### 3.2 Image source (`AvatarImage`)

Every avatar image records how it was made. Seedance eligibility (§8) is computed from these
fields and is never stored.

```ts
// src/lib/avatars/schema.ts
export type AvatarImageSource =
  | { kind: "upload"; filename: string; uploadedBy: string; uploadedAt: string }
  | {
      kind: "generated";
      modelId: string;          // registry id, e.g. "seedream:seedream-5-0-lite"
      mode: "text" | "edit";    // text-to-image, or made from another image
      prompt: string;           // the full prompt sent, including the fixed framing
      generatedAt: string;      // ISO — the vendor's generation time
      generationId: string;     // generations.id, for the credit trail
      untouched: boolean;       // stored bytes are exactly the vendor's bytes
    };

export type AvatarImage = {
  url: string; width: number; height: number; sizeBytes: number;
  source: AvatarImageSource;
};
```

### 3.3 Person type

Person type follows the front image's source. The operator is never asked (amended 2026-09-30,
D289).

| Front image | `person_type` |
|---|---|
| Uploaded | `specific` |
| Generated in the Studio (any model) | `generic` |
| None yet | null |

It is set whenever the front image is set or replaced. There is no declaration, no consent tick
and no record of who confirmed. The library shows a "Real person" tag on `specific` avatars and
filters by type.

An uploaded image of a fictional face is therefore filed as `specific`. That is accepted: the
label errs toward the stricter treatment (a `specific` avatar is never Seedance-eligible, §8).

### 3.4 `client_voices`

One ElevenLabs account serves every client, so ownership is recorded on our side.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `client_id` | uuid not null → `clients(id)` on delete cascade | |
| `elevenlabs_voice_id` | text not null | the account voice id |
| `name` | text not null | |
| `source` | text check in (`library`, `clone`) | |
| `labels` | jsonb | gender, age, accent, language, use case |
| `preview_url` | text | |
| `created_by`, `created_at` | | |

Unique on `(client_id, elevenlabs_voice_id)`.

### 3.5 `generations`

`generations.node_id` becomes nullable and the table gains
`avatar_id uuid references client_avatars(id) on delete set null`, with
`check (node_id is not null or avatar_id is not null)`. Existing rows are untouched.
`generations.client_id` (0016) is always set for avatar generations. The canvas-touch trigger
(0008) matches on `node_id` and does nothing for avatar rows.

---

## 4. Avatar Studio

A full page, not a dialog. Left column: the current step. Right column: a sticky avatar card that
fills in (front, sheet, voice, Seedance status, name, story) and shows credits spent so far. A
step tracker in the header: **Look → Profile sheet → Voice**. Steps can be revisited in any order
once a front image exists.

### 4.1 Look

A segmented control: **Describe | Upload photo**. Switching keeps everything already entered.

**Describe.**
- A prompt `Textarea`, plus optional attribute chips (gender, age range, ethnicity). Chips add
  plain phrases to the prompt; they are not stored separately.
- A fixed framing clause is appended by `buildAvatarFrontPrompt` and shown as a read-only chip:
  facing the camera, waist-up, even light, plain background.
- Settings row: **Model** (text-to-image models from `image-gen/registry.ts`), **Style**
  (photoreal, illustrated, 3D — a prompt phrase), a **count stepper** (1 to the model's maximum,
  default 4), and **Generate ✦ N**. Aspect ratio is fixed at 3:4.
- Seedream 5.0 Lite carries a "Seedance" tag in the model list (§8).
- Each Generate is one batch. Batches stack newest first and stay for the life of the draft, so
  models can be compared. Clicking an image sets it as the front.

**Upload photo.** The existing signed-upload pattern (`sign` → PUT → `finalize`), validated with
`validateFileExtension` / `validateFileSize`. The avatar becomes a `specific` person (§3.3).

### 4.2 Profile sheet

Generated from the front image by an image-edit model with `buildAvatarSheetPrompt`: front, ¾,
side and back; same person and outfit; plain light-grey background; one 16:9 image.

- Starts automatically the first time a front image is set.
- Controls: a model picker (default Gemini, to be confirmed by §10.1), **Regenerate ✦ N**,
  **Upload my own**.
- If the front image changes later, `sheet_stale` is set and the slot shows "Front image changed —
  regenerate the sheet". It is never regenerated silently.
- The loading placeholder occupies the exact box the finished sheet will, so nothing moves.

### 4.3 Voice

One field, identical to Change voice's trigger (name, gender · language · accent, preview button).
It opens the shared picker (§6). Optional.

### 4.4 Draft, ready, archive

- The avatar row is created as `draft` at the first Generate or upload. Drafts appear in the
  library with a "Draft" badge.
- `ready` requires a name, a front image and a non-stale sheet.
  `isAvatarReady(avatar)` is the single check, used by the Save button and the route.
- Text fields save last-write-wins. Front, sheet and voice are separate actions.
- Delete archives (`archived_at`). Archived avatars leave the library and pickers; their files and
  voice stay.

---

## 5. Library

An 8-across grid of square tiles (4 at tablet width, 3 at phone width). The name and voice sit on a
soft gradient over the face. The first tile is a dashed-border primary "New" tile. Tile badges:
Draft, Real person, and "Seedance · {date}" while eligible. Clicking a tile opens the Studio for
that avatar. A filter for person type; search by name once a client has more than one screen of
avatars.

---

## 6. Voices

### 6.1 Shared picker

The picker moves from `src/components/nodes/video-gen-change-voice-*` and
`video-gen-voice-picker-*` to `src/components/voice/`, since it now has two consumers. Layout,
filters, search, sort and rows are unchanged. Changes:

| Change | Detail |
|---|---|
| "My voices" → **This client** | Lists `client_voices` for the client plus ElevenLabs stock voices tagged *default*. Rows are tagged *cloned* or *from library*. |
| **Voice Library** tab | Unchanged. Picking a voice calls the existing save route, which now also inserts a `client_voices` row. |
| **+ Clone voice** | A dashed primary button in the dialog header. The dialog body swaps to the clone form with a back arrow. |
| Client context | The picker takes a `clientId`. Change voice on Video Gen passes the canvas's client, so it shows the same client-scoped list. |

Voices already chosen on existing nodes keep working; nodes store the ElevenLabs id.

### 6.2 Clone

`POST /api/clients/[id]/voices/clone`, multipart. Fields: one or more audio files (mp3, wav, m4a)
or a browser recording, name, labels, remove-background-noise, and a required consent flag. It
calls ElevenLabs `POST /v1/voices/add` with the name `{client name} · {name}`, inserts
`client_voices` with `source = 'clone'`, invalidates the account-voice cache, and returns the
voice selected. Without consent the route returns 400.

### 6.3 Voice sample

When an avatar's voice is set or changed, the route has ElevenLabs speak a fixed neutral script
(`AVATAR_VOICE_SAMPLE_SCRIPT`, versioned, about 20 seconds), stores the mp3, measures its
duration against Kling's 5–30 s window (D264) and writes `voice_sample` with
`sourceKey = voiceId + script version`. A failure leaves the voice saved and shows "Voice sample
missing — retry" on the card.

### 6.4 Removing a voice

Voices are never deleted automatically. **This client → ⋯ → Remove voice** deletes the voice from
ElevenLabs and its `client_voices` row, and is allowed only when no non-archived avatar of that
client uses it (`canRemoveVoice`).

### 6.5 Slot limits

ElevenLabs plans cap custom voices, and library saves and clones both count. A voice-limit error
is translated to: "The ElevenLabs account has no free voice slots. Remove an unused voice, or
upgrade the plan."

---

## 7. Credits

### 7.1 Estimates

Every generate control shows **✦ N** from the existing path: `image-gen/estimate.ts` and
`image-gen/cost.ts` → `usdToFinalCredits`. A batch costs the per-image estimate times the count.

### 7.2 Ledger

Each batch and each sheet is one `generations` row with `avatar_id` and `client_id`. The route
calls `reserveCredits`, runs the provider, then settles on the provider's reported cost or refunds
(`refundReservation`) on failure. A cap refusal returns 402. The stuck-reservation sweep, admin
generations table and org breakdowns work unchanged. "Spent so far" on the card is the sum of
consumption for the avatar's generations.

### 7.3 Deferred: ElevenLabs costs

Cloning, voice samples and library saves are not charged in Phase 1. They are to be priced and
billed in a later credits pass. Until then the cost is absorbed.

---

## 8. Seedance eligibility

BytePlus refuses Seedance reference images that show a realistic face, except original
face-containing outputs of Seedream 5.0 Lite text-to-image generated on the same account within
30 days (`ref/byteplus-docs/`, "Use trusted model outputs as input assets"). Avatars follow that
rule exactly.

```ts
// src/lib/avatars/seedance.ts
seedanceEligibility(avatar, now): 
  | { eligible: true; expiresAt: string; expiringSoon: boolean }   // soon = 7 days or less
  | { eligible: false; reason: "real-person" | "not-seedream-lite" | "edited" | "modified" | "expired" }
```

Eligible when all hold: `person_type = 'generic'`; `front.source.kind = 'generated'`;
the model is Seedream 5.0 Lite; `mode = 'text'`; `untouched = true`; and `generatedAt` is less
than 30 days ago. Only the front image is ever sent to Seedance. The sheet is an edit and is
excluded.

**Storage rule.** For Seedream Lite text-to-image outputs, the Studio stores the decoded
`b64_json` bytes as they arrive, with no resize, re-encode or metadata strip, and sets
`untouched = true`. Any path that transforms the bytes sets it to false.

**Phase 1 shows** the status on the avatar card and library tile: "Seedance · usable until
{date}", a warning in the last 7 days, then "Seedance expired". **Phase 2 enforces** it: Seedance
receives eligible avatars' front image and refuses the rest before reserving credits, stating the
reason.

---

## 9. Failures

| Failure | Behaviour |
|---|---|
| Monthly credit cap | 402; "Monthly credit limit reached" on the control; nothing charged |
| Provider error or content block | The batch shows an error card with the provider's message and Try again; reservation refunded |
| Sheet generation fails | Sheet slot shows the error with Regenerate and Upload my own; avatar cannot become `ready` |
| Upload wrong type or too large | Rejected before upload, stating the rule |
| Clone fails | ElevenLabs' message; translated for voice-slot limit, plan limit and audio too short |
| Voice sample fails | Voice is kept; card shows "Voice sample missing — retry" |
| Another client's avatar or voice id | 404 from `withClient` scoping |

---

## 10. Open questions

1. **Sheet model.** Compare Gemini, GPT Image and Seedream on the same front images for
   face consistency across angles before fixing the default.
2. **Trust of stored Seedream bytes.** One real Seedance call with a stored Seedream 5.0 Lite
   portrait. If refused, also keep the original in BytePlus TOS and send that URL.
3. **Voice slots.** Confirm the plan's custom-voice cap and whether stock voices are exempt.

Question 2 blocks only the Phase 2 Seedance path. Phase 1 records the facts either way.

---

## 11. Testing

Vitest, run per directory (the full run has known timeout flakes).

- **Pure:** `buildAvatarFrontPrompt`, `buildAvatarSheetPrompt`, `isAvatarReady`,
  `canRemoveVoice`, `seedanceEligibility` (each reason, the 30-day boundary, the 7-day warning).
- **Routes:** client scoping on every avatar and voice route; draft → ready; reserve → settle and
  reserve → refund; cap → 402; clone with and without consent; person type set from the front
  image's source on every front change.
- **Migration:** a generation needs a node or an avatar; existing rows pass.
- **UI:** the picker's This client tab lists only that client's voices plus defaults; Studio
  placeholders match the size of what replaces them.
- **Manual:** create a Describe avatar on Seedream Lite and an Upload avatar with a cloned voice;
  check spent credits against the ledger and the Seedance badge date; archive one.
