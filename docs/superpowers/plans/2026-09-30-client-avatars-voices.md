# Client Avatars — Voices (Plan 3 of 3)

**Goal:** An avatar declares a voice in the Avatar Studio — its engine's own, or a named
ElevenLabs voice picked, saved or cloned for the client.

**Spec:** `docs/superpowers/specs/2026-09-29-client-avatars-design.md` §3.4, §6 · **ADR:** D292, D293

This plan was built inline in one session, test-first, by the same author who wrote it, so it
records the design and the file map rather than repeating every line of code. The commits are
the reference: `451e5dcb` (server side) and the commit that adds this file (browser side).

## What was built

| Piece | Files |
|---|---|
| Which voices belong to which client | `supabase/migrations/0043_client_voices.sql`, `src/lib/db/client-voices.ts` |
| Scoping and clone rules (pure) | `src/lib/elevenlabs/client-voices.ts` — `clientPickerVoices`, `isVoiceAvailableToClient`, `validateVoiceCloneInput` |
| ElevenLabs calls | `cloneVoice`, `deleteVoice` in `src/lib/elevenlabs/voice-catalog.ts`; the slot-limit message in `route-errors.ts` |
| Client voice routes | `src/app/api/clients/[id]/voices/` — `GET` list, `save`, `clone`, `DELETE [voiceId]` |
| Voice rules (pure) | `src/lib/avatars/voice.ts` — `allowedVoiceModes`, `isVoiceAllowed`, `voiceAfterFrontChange`, label and snapshot helpers |
| The declaration route | `src/app/api/clients/[id]/avatars/[avatarId]/voice/route.ts` (`PUT`) |
| Picker, client-scoped | `clientId` on `use-voice-browser.ts`, `video-gen-change-voice-browser.tsx`, `video-gen-change-voice-picker.tsx`; remove control in `video-gen-voice-picker-row.tsx` |
| Clone form | `src/components/voice/voice-clone-form.tsx` |
| Studio | `src/hooks/use-avatar-voice.ts`, `src/components/avatars/avatar-studio-voice-step.tsx`, the Voice tab and card row |

## Rules

- A generated avatar may declare Native or a Named voice; a real person only a Named voice.
- A named voice must be the client's own (cloned or saved for it) or an ElevenLabs stock voice.
  Another client's voice is a 404.
- A front change that makes the avatar a real person drops a Native voice.
- Cloning needs the consent tick; the audio may total 4 MB.
- A voice is removed only by the operator, and only when no live avatar uses it. The ElevenLabs
  voice is deleted only when no other client has it recorded.

## Deferred

- The Anchor declaration (needs a generated clip; arrives with canvas use).
- Scoping Change voice on Video Gen to the client (needs a way to attach existing account voices
  to a client first).
- Moving the picker files to `src/components/voice/`.
- Clone uploads over 4 MB (needs the signed-upload path).
- Billing ElevenLabs usage in credits.

## Verify in the running app

Apply migration `0043` first (see `docs/auth-production-migration.md`).

1. Open an avatar with a front image → **3 · Voice**.
2. A generated avatar shows two options; **The engine's own voice** saves at once and the card's
   Voice row says so.
3. **A named voice** → the picker opens on **This client** with the stock voices. Pick one; the
   card shows its name and the preview button plays it.
4. **Voice Library** → pick a voice. It is saved, selected, and appears under This client on the
   next open.
5. **+ Clone voice** → add an mp3, name it, tick the permission, Clone. It is selected, and on
   ElevenLabs it is named `<client> · <name>`.
6. Hover one of the client's own voices → the bin → Remove. Refused, naming the avatar, while an
   avatar uses it; removed otherwise.
7. A real-person avatar shows only the named voice option.
8. Replace a generated front with an uploaded photo on an avatar using the engine's own voice:
   the Voice row goes back to Optional.
9. Open another client's Studio: the first client's cloned voice is not listed.

---

## Addendum — voice preview (D294, same day)

**Goal:** From the Voice step, generate a 6-second clip of the front image speaking one line in
the avatar's named voice. Spec §6.6. No migration.

| Piece | Files |
|---|---|
| Rules (pure): default line, prompt, cost, staleness, timeout | `src/lib/avatars/voice-preview.ts`, constants in `constants.ts`, `VoicePreview` in `schema.ts` |
| The task's steps (clip once, voice change retried) | `src/lib/avatars/voice-preview-run.ts` |
| Background task | `trigger/avatar-voice-preview.ts` |
| Settlement from the webhook | `src/lib/avatars/complete-voice-preview.ts`, one branch in `src/lib/generations/complete.ts` |
| Route (`GET` latest, `POST` start) | `src/app/api/clients/[id]/avatars/[avatarId]/voice-preview/route.ts` |
| Storage and read | `signAvatarVoicePreviewUrl`, `pathForAvatarVoicePreview`, `getLatestAvatarVoicePreview` |
| Studio | `src/hooks/use-avatar-voice-preview.ts`, `src/components/avatars/avatar-voice-preview.tsx` |

### Verify in the running app

The task runs on Trigger.dev: run `npx trigger.dev@latest dev` locally (or deploy the tasks)
first, with `APP_URL`, `TRIGGER_WEBHOOK_SECRET`, `GOOGLE_GENAI_API_KEY` and
`ELEVEN_LABS_API_KEY` set. Each preview costs real money (about $0.61).

1. Open an avatar with a named voice → **3 · Voice**. A Preview block shows under the voice,
   with the default line and the cost on the button.
2. **Generate preview**. A placeholder shows; within about a minute the clip appears and plays
   with the avatar's voice, in sync with the lips. "Spent on this avatar" rises by the cost.
3. Pick a different voice. The clip stays and is labelled out of date; regenerate replaces it.
4. Switch to "The engine's own voice" (generated avatar): the Preview block is hidden.
5. Leave the Voice step while a preview runs and come back: it is still running or done.
6. A real person's photo may be refused by Google: the message shows under the button and no
   credits are charged.
