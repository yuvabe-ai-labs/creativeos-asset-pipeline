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
| Using an avatar on a canvas: one avatar per reel, attached once to the Script node and chosen before shots are grouped; the engine follows the avatar's kind (§8); re-voicing runs automatically after generation | Phase 2, per the handoff spec §6 — designed in `2026-10-01-avatars-on-canvas-design.md` (D298, part 1: the avatar on the canvas as the Script's presenter) and `2026-10-01-avatars-in-videos-design.md` (D299, part 2: its face and voice in the stills and videos). The `feat/character-node` branch (D264–D266: per-shot Character nodes and Kling elements) is not the route for avatars. |
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
| `status` | text check in (`draft`, `ready`) | §4.6 |
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

A full page in three columns (D297): a **side stepper** on the left, the current step's **panel**
in the middle, and a sticky **summary card** on the right. Approved mockup (v2, 2026-09-30):
https://claude.ai/artifact/6Mg4qUZ5Ptw61HAxV6SxDR — it is the reference for layout and copy.

### 4.0 Frame

**Header.** A ghost **‹ Avatars** back button; the eyebrow `{client name} · Avatars`; the title,
which **is the avatar's name** and is edited in place (the design system's inline-edit affordance:
a dotted underline and `bg-primary/5` on hover, placeholder "Untitled avatar"); a status badge
(§4.6); once a draft exists, an autosave indicator (`Saving…` / `Saved`); once anything has been
charged, the credits spent on this avatar (**✦ N spent**); and the **⋯** menu (§4.6).

**Stepper.** Five steps, in order:

| # | Step | Required | Status line under the title |
|---|---|---|---|
| 1 | Look | Yes | Needed · the image model's name · Uploaded photo · Needs permission |
| 2 | Profile sheet | No | Optional · Generating… · Added · Out of date · Skipped |
| 3 | Voice | No | Optional · Engine's own voice · {voice name} · Skipped |
| 4 | Preview | No | Optional · Generating… · Clip ready · Voice reference saved · Out of date · Skipped |
| 5 | Name & save | Yes | Needs a name · Ready to save · In the library |

A finished step shows a check in place of its number. **Look is always open. The other four open
once Look is done** — a front image and, for an uploaded photo, the confirmed permission; until
then they show a lock and cannot be clicked. Any open step can be clicked, in any order. "Skipped"
means an optional step was left unfinished with **Continue** in this visit; it is not stored, so on
a later visit the step reads "Optional" again.

**Where the Studio opens.** Derived from what is stored, never remembered:

| Avatar | Opens on |
|---|---|
| New, or a draft without a finished Look | Look |
| A draft with Look done | Profile sheet when there is no sheet or it is out of date; else Voice when none is declared; else Preview. The preview loads after the page, so it is not consulted: a draft whose preview is done still opens on Preview, one Continue from saving |
| In the library | Name & save, with every step open (editing, not creating) |

**Panel.** A header — eyebrow `Step N of 5` (`· Optional` on optional steps), the step's heading
in the display face, and one line saying what the step is for — then the step's content, then a
footer pinned to the bottom of the panel:

- **Left:** `‹ Back to {previous step}`. Absent on Look.
- **Right:** exactly one primary button, `Continue to {next step}`. On an optional step this is
  also how it is skipped: there is **no separate Skip button** (D297). On Look it is disabled until
  Look is done, with the reason beside it — "Pick a front image to continue" or "Confirm
  permission to continue". On Name & save it is **Save to library** for a draft and **Done** for
  an avatar already in the library (back to the library).

**Summary card.** The front image (square), the name (or "Untitled avatar"), and rows for Face
(`Generated · Seedream`, `Generated · {model}`, or `Real person`), Profile sheet, Voice, and —
only with the engine's own voice — Voice reference (`4.8 s saved` / `Not yet`). Then **Works
with**: the names of the video models this avatar can be used with (§8), nothing more. The card
carries no Save and no Archive.

**Narrow screens.** Under 780 px the stepper becomes a horizontal row of titles above the panel
and the summary card moves below it.

### 4.1 Look

A segmented control: **Describe | Upload a photo**. Switching keeps everything already entered.

**Describe.**
- A prompt `Textarea`, plus optional attribute chips (gender, age range, ethnicity). Chips add
  plain phrases to the prompt; they are not stored separately.
- A fixed framing clause is appended by `buildAvatarFrontPrompt` and stated in the step's
  header: facing the camera, waist-up, even light, plain background. It is not a field.
- Settings row: **Model** (text-to-image models from `image-gen/registry.ts`), **Style**
  (photoreal, illustrated, 3D — a prompt phrase), a **count stepper** (1–8, default 2), and
  **Generate ✦ N**. Aspect ratio is fixed at 3:4. Each image is its own request, so a batch of N
  is N requests with N reservations.
- Under the settings row, one line names the models the chosen image model's faces will work
  with (§8): "Works with Seedance, Gemini Omni, Kling and Veo." for Seedream 5.0 Lite; "Works with
  Gemini Omni, Kling and Veo. For Seedance too, use Seedream 5.0 Lite." for any other. The choice
  that decides Seedance is made here, so this is where it is said.
- Each Generate click is one batch. Batches stack newest first and stay for the life of the
  draft, so models can be compared. Clicking an image sets it as the front; clicking the current
  front does nothing.

**Upload a photo.** The existing signed-upload pattern (`sign` → PUT → `finalize`), validated with
`validateFileExtension` / `validateFileSize`. The avatar becomes a `specific` person. Beside the
photo, a note ("An uploaded photo is treated as a real person. Real faces work with Gemini Omni
and Kling.") and the consent statement (§3.3), which Continue waits for.

Once a front image is chosen, a strip under it reads **This face works with** and names the models.

### 4.2 Profile sheet

**Optional (D295).** An avatar is ready without one. The sheet is made by editing the front
image, and Seedance refuses an edited image as a reference (§8), so a sheet can never be a
production input — it is a reference document for the people working on the client.

One generated image at 16:9 showing three full-body views of the person, head to toe: front,
side profile and back (operator decisions, 2026-09-30). The front image is waist-up, so the prompt
asks for the whole body outright and tells the model to continue the outfit down to the feet. It
is made from the front image by an image-edit model with `buildAvatarSheetPrompt`: same person
and outfit in every view, plain light-grey background.

- Generated when the operator clicks **Generate ✦ N**. It does not start on its own: operators
  sometimes bring their own sheet, and an automatic run would spend credits they did not ask to
  spend.
- Controls: a model picker (default Nano Banana Pro, per the handoff design), **Generate** /
  **Regenerate**, and **Add your own** (upload).
- If the front image changes later, `sheet_stale` is set and the step says so. It is never
  regenerated silently.
- The loading placeholder occupies the exact box the finished sheet will, so nothing moves.

### 4.3 Voice

Two option cards, the chosen one checked:

- **The engine's own voice** — generated avatars only. "Seedance invents a voice. Keep it in the
  Preview step and every Seedance video reuses it. No ElevenLabs cost."
- **A named voice** — "An ElevenLabs voice, applied after generation. The same voice on every
  model." Choosing it shows the voice field, identical to Change voice's trigger (name, gender ·
  language · accent, preview button), which opens the shared picker (§6).

A real person sees only the named voice, with a note: "A real person runs on Gemini Omni and
Kling. Neither takes a voice reference, so the voice is applied after generation." A ghost
**Remove the voice** clears the declaration. The preview is no longer on this step (§4.4).

### 4.4 Preview

The voice preview of §6.6, as a step of its own. Two columns:

- **Left:** a "Made with" line naming the engine and settings (`Seedance 2.5 · 480p · 5 s`, or
  `Gemini Omni 1.1 Flash · 720p · 6 s, then {voice} applied`); the **What the avatar says** box
  (default "Hi, I'm {name}. This is how I sound."); and the generate button with its cost —
  **Generate preview** / **Regenerate** for a named voice, **Generate voice & reference** /
  **Generate a new voice** for the engine's own. With the engine's own voice, a card shows the
  saved reference ("Voice reference saved · 4.8 s — sent with every Seedance video of this
  avatar"), or before one exists, a note that the voice generated here becomes the reference.
- **Right:** the 9:16 clip — an empty frame, then a placeholder of the same size while it runs
  ("You can keep working on other steps"), then the clip with its line under it and, when the
  face or voice has changed since, an **Out of date** badge.

With no voice declared, the step shows an empty state — "Choose a voice first. The voice decides
which model makes the preview." — and a **Back to voice** button. Continue still moves on.

### 4.5 Name & save

**Name** (required) and **Background story** (optional), side by side. **Save to library**
checks the name only: every other requirement is already met, because this step opens only once
Look is done. An empty name shows "Give the avatar a name to save it." under the field and puts
the focus there. `isAvatarReady` stays the server's single check.

### 4.6 Lifecycle and its actions

**An action appears only when the thing it acts on exists** (D297). Destructive actions live in
the header's **⋯** menu, never beside Save.

| State | How it begins | Header badge | ⋯ menu |
|---|---|---|---|
| New | Opening **New avatar**; no row exists yet | New | No menu |
| Draft | The first Generate or upload creates the row — it is what the spent credits belong to | Draft | **Discard draft** |
| In the library | **Save to library** (`status = ready`) | In the library | **Archive avatar** |

- Creating the draft is silent. It happens on the first Generate or upload, where a toast about
  saving read as out of place; the header's badge turning to **Draft** and the ⋯ menu appearing
  are the signal (operator, 2026-10-01).
- **Discard draft** asks first: "Discard this draft? The draft and its images are removed." plus,
  when anything was charged, "The N credits already spent on it stay spent." It archives the draft
  through the existing `DELETE` route — no second deletion path.
- **Archive avatar** asks first: "Archive {name}? It leaves the library and can no longer be
  picked. Videos that already use it keep working."
- Either way, the operator goes back to the library. Drafts appear there with a "Draft" badge;
  archived avatars leave the library and pickers, and their files and voice stay.

**Saving as you go.** Name and story save as the operator types (debounced, about 600 ms,
`PATCH`) once a row exists; before that they are held and sent with the request that creates
the draft. Front, sheet, voice and preview were already separate actions that save themselves.
**Save to library** is the only deliberate save. An avatar already in the library never
autosaves an empty name — that would drop it back to draft — and the field says "An avatar in
the library needs a name." instead.

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
| Anchor | Not a separate declaration: a native avatar's preview clip supplies the `reference_audio` that keeps its voice the same (§6.7) | Generated avatars (Seedance) | Built (D296) |

A real-person avatar runs on Gemini Omni, which accepts no audio input, so its only option is a
named voice. `PUT /api/clients/[id]/avatars/[avatarId]/voice` takes `{ mode: "none" | "native" }`
or `{ mode: "named", voiceId }`; the server looks a named voice up on the account, checks it is
this client's or a stock voice, and stores a snapshot (id, name, labels, preview URL) in `voice`.
The write is conditioned on the front image that decided what was allowed. A front change that
turns a generated avatar into a real person drops a native voice; a named voice survives.
`voice_sample` holds the anchor the native preview extracts (§6.7).

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

### 6.6 Voice preview (D294, D296)

A short clip of the avatar speaking, so the operator can judge the pairing of voice and face
before making videos. The preview follows the declaration, because the declaration decides the
engine:

| | Named voice | The engine's own voice |
|---|---|---|
| Shown when | `voice.mode = "named"` | `voice.mode = "native"` (generated avatars only) |
| Engine | Gemini Omni 1.1 Flash, front image as the first frame | Seedance 2.5, front image as `reference_image` |
| Clip | 6 s, 720p, 9:16 | 5 s, 480p, 9:16 |
| Voice | the clip's audio is extracted, converted with ElevenLabs speech-to-speech (default settings) and put back; more than 0.25 s of drift is rejected | Seedance invents it with the clip (`generate_audio` defaults to true) |
| Cost | about 615 credits — clip plus voice change | about 515 credits — the clip alone |
| Keeps | the clip | the clip **and** the voice reference (§6.7) |

There is no button until a voice is declared: with nothing declared there is no engine to pick,
and the operator has not said what they want to hear. A real person can only declare a named
voice (§6.3), so the Seedance branch is reached only by a generated avatar — which is also the
only kind Seedance accepts as a reference (D290).

Input either way: the front image and one line of up to 120 characters, default
"Hi, I'm {name}. This is how I sound."

**Flow.** `POST /api/clients/[id]/avatars/[avatarId]/voice-preview` checks the avatar has a front
image and a declared voice and that no preview is already running (409), inserts a video
`generations` row owned by the avatar (`inputs_snapshot`: slot `voice-preview`, mode, line,
prompt, front URL, and for a named voice its id, name and price multiplier), reserves the
credits, signs the uploads — the clip, plus the mp3 on a native preview — and queues the
`avatar-voice-preview` task. The task runs the mode's steps and calls the generation webhook;
`completeGeneration` settles the real cost, records the clip as the generation's output, and on a
native preview writes the voice reference onto the avatar. `GET` on the same path returns the
latest preview and the next one's cost; the Studio polls it every four seconds while one runs.

**Failure.** Any failure refunds the whole reservation: a refused generation, an out-of-sync
re-voice, a clip with no audio track, a sample below Seedance's 2 s floor. The paid clip is
generated once per run — only the ElevenLabs step is retried, against the same clip. A preview
still running after 15 minutes is failed and refunded when the Studio next reads it, and by the
reconciliation sweep.

**Out of date.** A preview records the mode, the voice and the front image it was made with. When
the avatar's differ, the clip stays playable and is labelled out of date.

### 6.7 The voice reference (D296)

Seedance invents a new voice for every clip, so without an anchor one avatar would speak with a
different voice in every video. The anchor is the native preview's own audio, kept:

| | |
|---|---|
| Extraction | In the task, from the stored clip: `-vn -ac 1 -ar 24000 -b:a 96k -t 30` → a mono mp3 — the bench's flags (`src/lib/ugc/voice.ts`), which match Seedance's limits: mp3 or wav, 2–30 s. |
| Stored | `clients/{clientId}/avatars/{avatarId}/voice-sample/{generationId}.mp3`, beside the clip. |
| Recorded | `client_avatars.voice_sample` = `{ url, durationSeconds, sourceKey: generationId }`, the column migration 0041 already added. **No migration.** |
| Used | `buildSeedanceContent()` appends `{ type: "audio_url", audio_url: { url }, role: "reference_audio" }`. Audio is a *third* part type: the frames-XOR-references exclusion does not apply to it. |
| Cost to use | Free — audio sits outside Seedance's token formula. A reference *video* would add its own duration to the bill, which is why the audio is extracted rather than the clip re-sent. |

Regenerating a native preview replaces the reference. A front change that turns the avatar into a
real person drops the native declaration and the reference together, since Omni accepts no audio
input. The canvas sends the reference on an avatar's videos in Phase 2; the provider accepts it
now, so the stored file is usable rather than inert.

**Vendor-stated weakness** (handoff §3.4): the generated voice can "differ significantly" from
the reference. The mitigation, when the canvas lane arrives, is to describe the voice in words as
well and to say *timbre only*, so the anchor clip's effects do not ride along with its timbre.

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

**The face decides which models an avatar works with** (D297, refining D290). It is derived,
never stored:

| Face | Works with |
|---|---|
| Generated with Seedream 5.0 Lite | Seedance 2.5, Gemini Omni, Kling, Veo 3.1 |
| Generated with any other image model | Gemini Omni, Kling, Veo 3.1 |
| An uploaded photo (a real person) | Gemini Omni, Kling |

The Studio shows these **names only** (§4.0, §4.1). A per-model table — how the face goes in, what
happens to the voice, the longest clip — was built into the first mockup and cut in review as too
technical for the people using the Studio (D297). For the record, and for the canvas lane:

| Model | How the face goes in | Longest clip |
|---|---|---|
| Seedance 2.5 | Reference image | 30 s |
| Gemini Omni 1.1 Flash | First frame or reference image | 10 s |
| Kling 3.0 Omni · Kling O1 | Reference image | 15 s · 10 s |
| Kling 3.0 | First frame only | 15 s |
| Veo 3.1 Fast · Quality | Up to 3 reference images | 8 s |
| Veo 3.1 Lite | First frame only | 8 s |

- **Kling follows Gemini Omni's rule for now:** the front image goes in as a plain reference. Kling
  3.0 Omni's Elements — a registered subject built from two to four views of the same person — are
  not set up (§10).
- **Veo is left off a real person.** It accepts people, but Google may refuse a real, identifiable
  face depending on region, and a names-only list cannot say "maybe".
- **The voice** follows §6.3 on every model: a named voice is applied after generation, and the
  engine's own voice is kept consistent only on Seedance, through the voice reference (§6.7).
- **The preview's engine** is still chosen by the voice declaration (§6.6), not from this list.

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

- **Kling Elements from the profile sheet.** Kling 3.0 Omni builds an Element from two to four views
  of one person, which is what the profile sheet is. Registering the sheet as an Element could
  give Kling a stronger identity lock than a single reference image — and give the sheet its first
  production use. Untested; Kling follows Omni's plain-reference rule until then (§8).

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
