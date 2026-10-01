# Avatar voice: three ways to choose — design

**Status:** design approved 2026-10-01 · **ADR:** D301 · **Mockup:** https://claude.ai/artifact/HHnzDwH3uERP31cKNu2J6m (v2)
**Builds on:** D292 (client voices, Clone), D293 (the voice declaration), D294/D296 (the preview and the voice reference), D297 (the Studio), D299 (the presenter's voice in videos)

## 1. What this is

The Studio's Voice step offers three choices, one selected at a time:

| Card | What it saves |
|---|---|
| **Choose a voice for me** | The engine's own voice (`native`). Made in the Preview step. |
| **Pick from the library** | A named ElevenLabs voice, from the picker that exists today. |
| **Create a custom voice** | A named voice cloned from an uploaded recording, behind a consent tick. |

All three are offered for every face, Generic and Specific. Voice stays optional, and "Remove the
voice" stays.

### 1.1 Decisions taken in review (2026-10-01)

| Question | Decision |
|---|---|
| What "Create a custom voice" does | Clone from an uploaded recording (Instant Voice Clone, D292). Not Voice Design |
| Where the recording comes from | Upload only (mp3, wav, m4a). No in-browser recording |
| Which engine makes "Choose a voice for me" | Seedance when the face was made with Seedream 5.0 Lite; Gemini Omni for every other face |
| How that voice is kept for other models | Its audio is cloned into an ElevenLabs voice for the avatar (the **auto voice**), for every face — Seedream ones too |
| What the screens say | No engine, model or provider names, and no provider costs, on the Voice and Preview steps. Plain words about what happens |

## 2. The Voice step

Three option cards in a row (one column on narrow screens), behaving as a radio group: a dot on the
selected card, a short line under each title, and a small tag.

| Card | Line | Tag |
|---|---|---|
| Choose a voice for me | We create a voice that suits {name}'s look. You hear it in the next step. | Quickest |
| Pick from the library | Listen and choose from hundreds of ready voices, or this client's own. | Most choice |
| Create a custom voice | Upload a recording of someone speaking, and {name} talks in their voice. | Needs their permission |

Below the cards, the selected card's panel:

- **Choose a voice for me** — saved the moment the card is clicked ("Saving…" in place, then
  "Saved"). The panel: "We'll pick a voice that suits {name}. Continue to Preview to hear {name} say a
  line. Not right? Make another until it is. Once you keep one, {name} sounds the same in every
  video."
- **Pick from the library** — the existing voice picker (D292), inline. Picking a voice saves it,
  with the check on that row.
- **Create a custom voice** — the existing clone form (`src/components/voice/voice-clone-form.tsx`)
  inline rather than in a dialog: upload (one speaker, 1–2 minutes works best, at least 30 s), a
  voice name filled with the avatar's name, the consent tick ("I have this person's permission to use
  their voice."), and **Create voice** ("Creating the voice…" while it runs). Once made, the voice is
  saved as the avatar's voice and the panel shows it with a play button and "Use a different
  recording". The word "clone" does not appear on screen.

Every click shows its result at once (D297 review): the card selects on click, and saving shows in
place.

**Which card is selected when the step opens.** `native` → Choose a voice for me. A named voice →
Create a custom voice when the voice is one of this client's clones (`client_voices.source =
'clone'`), otherwise Pick from the library. Recorded on the declaration as `origin` (§4) so no
lookup is needed.

## 3. "Choose a voice for me": the engine and the auto voice

### 3.1 The engine

| Face | Preview engine | Clip |
|---|---|---|
| Generic, made with Seedream 5.0 Lite | Seedance | 480p, 5 s (as D296) |
| Any other face — another image model, or uploaded (Specific) | Gemini Omni, its own voice, no re-voice | 720p, the Omni preview's length |

The engine follows the **current front** (`isSeedanceFaceModel` on its source). The preview's cost
estimate follows the engine.

### 3.2 What is kept

When the preview succeeds:

1. Its audio is extracted (as D296 does for Seedance today) and stored as the avatar's
   `voice_sample` — the voice reference Seedance videos receive (D299). For an Omni preview the
   sample is still stored; it is what the auto voice is cloned from.
2. That audio is cloned into an ElevenLabs voice: the **auto voice**, named
   `{client} · {avatar} (auto)`. Its id is recorded on the declaration (§4).
3. An auto voice made by an earlier preview of this avatar is deleted from the account, so an avatar
   holds at most one.

The auto voice is not recorded in `client_voices`, so it never appears in the library picker; it
belongs to the avatar. It is not deleted when the avatar is archived (D292: archived avatars stay on
canvases that may still be re-voiced).

### 3.3 In videos

| Model | The voice |
|---|---|
| Seedance (Seedream face only) | `reference_audio` from `voice_sample`, as D299 |
| Gemini Omni, Kling, Veo | Edit voice opens with the **auto voice** pre-selected (D299 §5.3 extended to `native` with an auto voice). Never applied automatically |

D299's note "Only Seedance keeps the engine's own voice the same across clips." is shown only when
the avatar has no auto voice.

## 4. Data

`AvatarVoice` (the `avatars.voice` jsonb — no migration):

```ts
type AvatarVoice =
  | { mode: "native"; autoVoice?: { voiceId: string; sourceKey: string } }
  | { mode: "named"; voiceId: string; name: string; labels: …; previewUrl: string | null;
      origin?: "library" | "custom" };
```

- `autoVoice.sourceKey` is the preview generation it was cloned from, matching
  `voice_sample.sourceKey`; a sample and an auto voice from different previews never pair.
- `origin` only picks which card is selected; a missing `origin` reads as `"library"`.
- `allowedVoiceModes` returns both modes for every person type. `voiceAfterFrontChange` no longer
  drops `native` when the face becomes a real person; the preview goes stale as today (its
  `frontUrl` no longer matches).

## 5. Wording elsewhere

- **Preview step:** the "Made with {model} · 480p · 5 s" box is removed. The native help text says
  "The voice you keep here is the one {name} uses in every video."
- **Summary card and the Look step's status:** "Generic" or "Specific" alone — no model name.
- **Voice summary:** "Chosen for me", the library voice's name, or the custom voice's name.

## 6. Failures

| Case | Behaviour |
|---|---|
| The clone fails (ElevenLabs down, slot limit) | The preview and `voice_sample` stand. No auto voice is recorded; the Preview step says "{name}'s voice couldn't be kept for every video. Make the preview again to retry." Videos fall back to D299's behaviour without it |
| Deleting the old auto voice fails | Logged; the new auto voice is still recorded. The old one is an orphan on the account |
| The audio is too short to clone | Treated as a failed clone (above) |
| The custom clone fails | The form shows the ElevenLabs message (existing `elevenLabsRouteError`); nothing is saved |
| The face changes after a voice was chosen | The preview goes stale; the next preview uses the new face's engine and replaces the auto voice |

## 7. What changes, where

| Where | Change |
|---|---|
| `src/lib/avatars/schema.ts`, `voice.ts` | `autoVoice`, `origin`; both modes for every face |
| `src/lib/avatars/voice-preview.ts` | The native engine follows the face (§3.1): model, params shape, estimate |
| Voice-preview route + `trigger/avatar-voice-preview.ts` | Omni native previews; after the sample, clone the auto voice and delete the previous one |
| `src/components/avatars/avatar-studio-voice-step.tsx` (split by card) | Three cards and their panels; the clone form inline |
| `src/components/voice/voice-clone-form.tsx` | Usable inline; on success the voice is declared with `origin: "custom"` |
| `avatar-voice-preview.tsx`, summary, `studio.ts` labels | Wording (§5) |
| `src/components/nodes/video-gen-focus-view.tsx`, `presenter.ts` | The auto voice as Edit voice's default; the note only without one |

## 8. Testing

- **Pure:** the engine per face; the estimate per engine; `allowedVoiceModes`; which card a
  declaration selects; the presenter's default voice for `native` with and without an auto voice;
  the auto voice pairs only with its own sample.
- **Routes / task:** an Omni native preview is queued with Omni's params; a succeeded preview clones
  the auto voice, records it and deletes the previous one; a failed clone leaves the sample and
  records nothing.
- **Browser:** the mockup's flows in the running app.

## 9. Out of scope

Voice Design (a voice from a text description). Recording in the browser. Showing auto voices in the
library. Billing ElevenLabs clones (client avatars spec §7.3).
