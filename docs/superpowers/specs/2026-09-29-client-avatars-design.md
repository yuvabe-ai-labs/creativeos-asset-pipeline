# Client avatars — library, studio and voices

**29 September 2026 · design spec · Phase 1**
ADRs: D287–D293. Builds on D264–D266 (Character node), D283–D284 (voice picker, Change voice)
and D285 (Seedream). Visual summary: https://claude.ai/artifact/QtMgQLh161QfodbQQDajW2

**Amended 30 September 2026** to follow `2026-09-22-seedream-seedance-handoff.md` (the UGC avatar
design this feature serves) and two operator decisions taken that day. Changed: §3.3 (person type
and consent), §6.3 (voice), §8 (engines and Seedance), the phase 2 row of the out-of-scope table,
and §10.

---

## 1. Problem

The handoff design makes the avatar a persistent, client-level asset set: what is true of the
person wherever they appear — face, model sheet, voice. Nothing holds that today. A person in a
client's videos is rebuilt by hand on every canvas, nothing records where a face came from, and
there is no place to make one.

**Goal.** A client-level library of avatars. An avatar is a front image, a profile sheet, an
optional voice declaration and an optional background story. It is created once in a dedicated
studio, with credit costs shown, and is the single record later phases read from.

**In scope (Phase 1).** The Avatars page, the Avatar Studio, the shared voice picker with a
client-scoped tab and voice cloning, the avatar's voice declaration, source and person-type
records, likeness consent for real people, and billing of image generations through the existing
ledger.

**Out of scope.**

| Item | Where it goes |
|---|---|
| Using an avatar on a canvas: one avatar per reel, attached once to the Script node and chosen before shots are grouped; the engine follows the avatar's kind (§8); re-voicing runs automatically after generation | Phase 2, per the handoff spec §6. The `feat/character-node` branch (D264–D266: per-shot Character nodes and Kling elements) is not the route for avatars. |
| Billing ElevenLabs usage (clone, saving a library voice) in credits | Deferred, §7.3 |
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
| `likeness_consent_by` / `likeness_consent_at` | uuid / timestamptz | who confirmed permission for a real person's likeness, and when, §3.3 |
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

Every avatar image records how it was made. The person type (§3.3) and the engine (§8) follow
from it. Plan 2 adds `vendorUrl` to the generated source — the vendor's original URL, kept as
insurance and read by nothing (§8).

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
  url: string; width: number | null; height: number | null; sizeBytes: number;
  source: AvatarImageSource;
};
```

### 3.3 Person type and consent

Person type follows the front image's source. The operator is never asked whether the person is
real (D289).

| Front image | `person_type` | Consent |
|---|---|---|
| Uploaded | `specific` (a real person) | required |
| Generated in the Studio (any model) | `generic` | none |
| None yet | null | — |

The type is set whenever the front image is set or replaced.

**Consent.** A real person's likeness needs a record of who agreed and when (handoff design:
"Consent — required: who agreed, and when"). For an uploaded front the Studio shows one statement
to tick: "I have this person's permission to use their likeness". Confirming records
`likeness_consent_by` and `likeness_consent_at`. Replacing the front image clears both, so a new
photo asks again. A generated front carries no consent. An avatar with an uploaded front cannot
become `ready` without it.

An uploaded image of a fictional face is filed as `specific` and asked for consent. That is
accepted: the label errs toward the stricter treatment.

The library shows a "Real person" tag on `specific` avatars and filters by type.

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
- A fixed framing clause is appended by `buildAvatarFrontPrompt` and stated in the step's
  header: facing the camera, waist-up, even light, plain background. It is not a field.
- Settings row: **Model** (text-to-image models from `image-gen/registry.ts`), **Style**
  (photoreal, illustrated, 3D — a prompt phrase), a **count stepper** (1–8, default 4), and
  **Generate ✦ N**. Aspect ratio is fixed at 3:4. Each image is its own request, so a batch of N
  is N requests with N reservations.
- The non-pro Seedream 5.0 model carries a "Seedance" tag in the model list (§8).
- Each Generate click is one batch. Batches stack newest first and stay for the life of the
  draft, so models can be compared. Clicking an image sets it as the front; clicking the current
  front does nothing. What was typed in Describe survives switching to Upload photo or to the
  sheet step and back.

**Upload photo.** The existing signed-upload pattern (`sign` → PUT → `finalize`), validated with
`validateFileExtension` / `validateFileSize`. The avatar becomes a `specific` person and the
consent statement appears under the image (§3.3).

### 4.2 Profile sheet

One generated image at 16:9 showing three full-body views of the person, head to toe: front,
side profile and back (operator decisions, 2026-09-30). The front image is waist-up, so the prompt
asks for the whole body outright and tells the model to continue the outfit down to the feet. It is made from the front image by an image-edit model with
`buildAvatarSheetPrompt`: same person and outfit in every view, plain light-grey background.

- Generated when the operator clicks **Generate ✦ N** on the sheet step. It does not start on
  its own: operators sometimes bring their own sheet, and an automatic run would spend credits
  they did not ask to spend.
- Controls: a model picker (default Nano Banana Pro, per the handoff design), **Generate** /
  **Regenerate**, and **Add your own** (upload).
- If the front image changes later, `sheet_stale` is set and the step says so. It is never
  regenerated silently.
- The loading placeholder occupies the exact box the finished sheet will, so nothing moves.

### 4.3 Voice

One field, identical to Change voice's trigger (name, gender · language · accent, preview button).
It opens the shared picker (§6). Optional.

With a named voice declared, a **Preview** block sits under the field (§6.6).

### 4.4 Draft, ready, archive

- The avatar row is created as `draft` at the first Generate or upload. Drafts appear in the
  library with a "Draft" badge.
- `ready` requires a name, a front image, a non-stale sheet and, for an uploaded front, the
  likeness consent.
  `isAvatarReady(avatar)` is the single check, used by the Save button and the route.
- Text fields save last-write-wins. Front, sheet and voice are separate actions.
- Delete archives (`archived_at`). Archived avatars leave the library and pickers; their files and
  voice stay.

---

## 5. Library

An 8-across grid of square tiles (4 at tablet width, 3 at phone width). The name and voice sit on a
soft gradient over the face. The first tile is a dashed-border primary "New" tile. Tile badges:
Draft and Real person. Clicking a tile opens the Studio for
that avatar. A filter for person type; search by name once a client has more than one screen of
avatars.

---

## 6. Voices

### 6.1 Shared picker

The Change voice picker is reused as it is, with an optional `clientId`. Layout, filters,
search, sort and rows are unchanged. With a `clientId`:

| Change | Detail |
|---|---|
| "My voices" → **This client** | The client's voices (`client_voices`) plus ElevenLabs stock voices, read from `GET /api/clients/[id]/voices`. |
| **Voice Library** tab | Unchanged. The Studio saves a pick through `POST /api/clients/[id]/voices/save`, which saves it to the account (or reuses the copy there) and records it for the client. |
| **+ Clone voice** | A dashed primary button in the dialog header. The dialog body swaps to the clone form with a back arrow; a cloned voice is used straight away. |
| Remove | A client's own voice has a remove control in its row, confirmed in the row. |

**As built (2026-09-30), two things are deferred:**

- **Change voice on Video Gen still lists the whole account.** Voices chosen there before this
  feature, or cloned by hand, are recorded for no client, so switching it to "This client" now
  would hide them. It passes no `clientId` and behaves exactly as before. Switching it needs a
  way to attach existing account voices to a client first.
- **The picker files stay under `src/components/nodes/video-gen-*`.** They now have two
  consumers and belong in `src/components/voice/` (where the clone form already is); the move
  is mechanical and was left out to keep this change small.

### 6.2 Clone

`POST /api/clients/[id]/voices/clone`, multipart: one to ten audio files (mp3, wav, m4a), a name,
an optional description, remove-background-noise, and a required consent flag. It calls
ElevenLabs `POST /v1/voices/add` with the name `{client name} · {name}`, records the voice in
`client_voices` with `source = 'clone'`, invalidates the account-voice cache, and returns the
voice selected. Without consent the route returns 400.

The audio passes through a serverless function, whose request body is capped at 4.5 MB, so the
files may total at most 4 MB — a one to two minute mp3, which is what ElevenLabs recommends, is
well inside that. Larger uploads need the signed-upload path and are not supported yet.

### 6.3 Voice declaration

The avatar declares one voice and every generation realises it (handoff design, "voice
consistency"). It is set in the Studio's third step, **Voice**, which is optional.

| Declaration | Meaning | Available for | Status |
|---|---|---|---|
| Native | The engine's own generated voice | Generated avatars (Seedance) | Built |
| Named voice | An ElevenLabs account voice, applied by re-voicing after generation (D282–D284) | Both kinds | Built |
| Anchor | The audio of the first clip the operator likes, carried forward as `reference_audio` | Generated avatars (Seedance) | Deferred: it needs a generated clip, so it arrives with canvas use |

A real-person avatar runs on Gemini Omni, which accepts no audio input, so its only option is a
named voice. `PUT /api/clients/[id]/avatars/[avatarId]/voice` takes `{ mode: "none" | "native" }`
or `{ mode: "named", voiceId }`; the server looks a named voice up on the account, checks it is
this client's or a stock voice, and stores a snapshot (id, name, labels, preview URL) in `voice`.
The write is conditioned on the front image that decided what was allowed. A front change that
turns a generated avatar into a real person drops a native voice; a named voice survives.
`voice_sample` is unused until Anchor is built.

### 6.4 Removing a voice

Voices are never deleted automatically. A client's own voice has a remove control in the
picker. `DELETE /api/clients/[id]/voices/[voiceId]` is refused (409, naming the avatars) while a
non-archived avatar of that client declares it. The ElevenLabs voice itself, and its slot, is
deleted only when no other client has the same voice recorded; ElevenLabs is called first, so a
refusal leaves the record in place.

### 6.5 Slot limits

ElevenLabs plans cap custom voices, and library saves and clones both count. A `voice_limit_reached` error from
ElevenLabs is answered with 409 and: "The ElevenLabs account has no free voice slots. Remove an unused voice, or
upgrade the plan."

### 6.6 Voice preview (D294)

A short clip of the avatar speaking in its named voice, so the operator can judge the pairing of
voice and face before making videos.

| | |
|---|---|
| Where | Voice step, under the voice field, when the declared voice is a named one. |
| Input | The front image and one line, up to 120 characters. Default: "Hi, I'm {name}. This is how I sound." |
| Clip | Gemini Omni 1.1 Flash, 6 seconds, 720p, 9:16, front image as the first frame. |
| Voice | The clip's audio is extracted, converted with ElevenLabs speech-to-speech to the avatar's voice (default settings) and put back. A result more than 0.25 s out of sync is rejected. |
| Cost | The Omni clip plus the voice change over the same seconds: about 615 credits at the standard voice rate. Shown on the button. |

**Flow.** `POST /api/clients/[id]/avatars/[avatarId]/voice-preview` checks the avatar has a front
image and a named voice and that no preview is already running (409), inserts a video
`generations` row owned by the avatar (`inputs_snapshot`: slot `voice-preview`, line, prompt,
voice id and name, price multiplier, front URL), reserves the credits, signs the clip's upload
and queues the `avatar-voice-preview` task. The task generates the clip, re-voices it, uploads
it and calls the generation webhook; `completeGeneration` settles the real cost and records the
clip as the generation's output. `GET` on the same path returns the latest preview and the cost
of the next one; the Studio polls it every four seconds while a preview is running.

**Failure.** Any failure — Google refusing the face, the voice change failing twice, an
out-of-sync result — fails the generation with the provider's message and refunds the whole
reservation. The task runs once; only the voice change is retried, against the same clip. A
preview still running after 15 minutes is failed and refunded when the Studio next reads it (the
reconciliation sweep does the same on its own schedule).

**Out of date.** A preview records the voice and the front image it was made with. When either
differs from the avatar's current one, the clip stays playable and is labelled out of date.

---

## 7. Credits

### 7.1 Estimates

Every generate control shows **✦ N** from the existing path: `image-gen/estimate.ts` and
`image-gen/cost.ts` → `usdToFinalCredits`. A batch costs the per-image estimate times the count.

### 7.2 Ledger

Each image — every front candidate and every sheet — and each voice preview (§6.6) is one `generations` row with
`avatar_id` and `client_id` (a batch of four is four rows). The route
calls `reserveCredits`, runs the provider, then settles on the provider's reported cost or refunds
(`refundReservation`) on failure. A cap refusal returns 402. The stuck-reservation sweep, admin
generations table and org breakdowns work unchanged. "Spent on this avatar" on the card is the sum of
`credits_charged` over the avatar's succeeded generations, returned by the server after each
request (success or failure) rather than added up in the browser. It differs from ledger
consumption only in the inherited edge case where `succeedGeneration` fails after settlement.

### 7.3 Deferred: ElevenLabs costs

Cloning and library saves are not charged in Phase 1. They are to be priced and
billed in a later credits pass. Until then the cost is absorbed.

---

## 8. Engines and Seedance

**The avatar's kind decides the engine** (handoff design). Nothing about the engine is stored on
the avatar; it is derived.

| Avatar | Engine | Clip ceiling | Face reference |
|---|---|---|---|
| Generated (`generic`) | Seedance 2.5 | 30 s | A Seedream-generated face |
| Real person (`specific`) | Gemini Omni | 10 s | The uploaded photograph, Google's filters permitting |

Kling and Veo are not used for avatars: neither takes a trusted face reference.

**Seedance accepts only Seedream 5.0 non-pro faces.** The face of a generated avatar must come
from the non-pro Seedream 5.0 model; the pro variant's faces are refused. Take the model id from
`GET /api/v3/models`, not from the vendor's docs (handoff spec §0). The Studio tags that model
"Seedance" in the Describe model list and warns when another model is chosen for a generated
avatar.

**No freshness machinery.** The vendor's documented policy trusts only original outputs, for 30
days. A probe on 2026-09-24 sent a byte-identical copy from our own bucket and Seedance accepted
it; the evidence fits a real-likeness detector, not a provenance check (handoff spec §0.1,
finding 1). So there is no expiry date, no expiry badge and no age check. The generated source
records `generatedAt`, the model and, as insurance, the vendor's original URL; nothing reads them
at generation time. If BytePlus starts enforcing provenance, those fields are what lets us react.

**Open.** Whether Seedance accepts the Nano Banana profile sheet of a Seedream face is untested
(§10). Until it is, a generated avatar sends Seedance the front image only.

## 9. Failures

| Failure | Behaviour |
|---|---|
| Monthly credit cap | 402; "Monthly credit limit reached" on the control; nothing charged |
| Provider error or content block | A toast with the provider's message (one per distinct message in a batch); that image's placeholder goes; its reservation is refunded. An error card with Try again in the batch is deferred. |
| Sheet generation fails | A toast with the message; the Generate and Add your own controls stay available; the avatar cannot become `ready` |
| The front changes while the sheet generates | The front cannot be picked or uploaded while a sheet generates. If it changes anyway, the sheet is refused with 409; its credits are spent and shown |
| Upload wrong type or too large | Rejected before upload, stating the rule |
| Clone fails | ElevenLabs' message; translated for voice-slot limit, plan limit and audio too short |
| Voice sample fails | Voice is kept; card shows "Voice sample missing — retry" |
| Another client's avatar or voice id | 404 from `withClient` scoping |

---

## 10. Open questions

1. **Sheet model.** The handoff design takes the model sheet from Nano Banana (Gemini) for both
   kinds. Confirm face consistency across angles on Seedream faces before fixing the default.
2. **The sheet on Seedance.** One probe: a generated avatar's Nano Banana sheet as a second
   `reference_image`. Accepted means both images go; refused means front only.
3. **Seedream model id.** The shipped provider (D285) names a "lite" id; the handoff design says
   only the non-pro 5.0 id exists. Read `GET /api/v3/models` and correct whichever is wrong.
4. **Voice slots.** Confirm the ElevenLabs plan's custom-voice cap and whether stock voices are
   exempt.

## 11. Testing

Vitest, run per directory (the full run has known timeout flakes).

- **Pure:** `buildAvatarFrontPrompt`, `buildAvatarSheetPrompt`, `isAvatarReady`,
  `canRemoveVoice`, the engine derived from the avatar's kind.
- **Routes:** client scoping on every avatar and voice route; draft → ready; reserve → settle and
  reserve → refund; cap → 402; clone with and without consent; person type set from the front
  image's source on every front change; likeness consent required for an uploaded front and
  cleared when the front is replaced.
- **Migration:** a generation needs a node or an avatar; existing rows pass.
- **UI:** the picker's This client tab lists only that client's voices plus defaults; Studio
  placeholders match the size of what replaces them.
- **Manual:** create a Describe avatar on Seedream Lite and an Upload avatar with a cloned voice;
  check spent credits against the ledger and the Seedance tag on the model list; archive one.
