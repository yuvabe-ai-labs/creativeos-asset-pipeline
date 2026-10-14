# Avatars in Stills and Videos (Part 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put a script's presenter into its shots: the face into stills and videos, the voice into Seedance as an audio reference, Edit voice pre-selected elsewhere, and the model list limited to what the face works with.

**Architecture:** The presenter enters as a **virtual File input on the prompt node**. Wherever a prompt node's upstream is read, one server function appends a synthetic upstream row — the Avatar node's real id, type `file`, `fileKind: "image"`, the front image's URL, titled "Presenter: {name}" — when the prompt node has the presenter in its shot. Everything downstream already handles a file image: the writers' reference roster and `@Image N` binding, stored references by id, the generation routes' upstream images, Video Gen's image roles, each model's limits, and Seedance's frames-or-references rule. The voice is the one new path: on Seedance, the video route adds `referenceAudioUrl` and a binding sentence.

**Tech Stack:** Next.js 16 route handlers · Supabase · Trigger.dev · BytePlus Seedance 2.5 · ElevenLabs · TanStack Query (D300) · vitest.

**Spec:** `docs/superpowers/specs/2026-10-01-avatars-in-videos-design.md` · **ADR:** D299 · **Builds on:** part 1 (`2026-10-01-avatars-on-canvas.md`, D298)

## Global Constraints

- **No migration.** `voice_sample` exists (0041); node data is JSON; `edges.created_at` exists.
- **Never re-voice automatically.** Edit voice is only pre-selected.
- The presenter's virtual row uses the **Avatar node's id** as its node id — the prompt writer stores references by id (BUG-010), and the generation routes resolve them against the same id.
- "On camera" reuses the voiceover module's rule: a line whose `speaker` is set and is not `"narrator"`.
- Seedance audio: one mp3 clip, 2–30 s, public URL; prompt text "Reference only the voice timbre in @Audio 1, not its music or sound effects." plus the voice described in words.
- Browser data through TanStack Query (D300); controls are shadcn primitives; Lucide 1.5.
- Routes: `withNode` / `withClient`, `apiOk` / `apiError`.

## File map

| File | Change |
|---|---|
| `src/lib/avatars/presenter.ts` | **create** — pure: presenter of a prompt node from rows, the switch default, the virtual row, voice-reference matching, the Seedance audio text |
| `src/lib/avatars/presenter-server.ts` | **create** — `server-only`: load the presenter for a prompt node; `getPromptUpstream`; `withStillPresenter` |
| `src/lib/nodes/resolve-inputs.ts` | the three prompt resolvers read `getPromptUpstream` |
| `src/app/api/nodes/[id]/video-generate/route.ts` | prompt-node upstream via `getPromptUpstream`; Seedance `referenceAudioUrl` + text |
| `src/app/api/nodes/[id]/upstream-images/route.ts` | same upstream as the routes, so the focus views list the presenter |
| `src/app/api/nodes/[id]/image-generate/route.ts` | `withStillPresenter` — the face as a connected image for a still |
| `trigger/video-generate.ts` | pass `referenceAudioUrl` to the provider |
| `src/lib/canvas-nodes.ts` | `presenter?: { inShot: boolean }` on Prompt, Motion Prompt, Multishot Prompt data |
| `src/lib/elevenlabs/client.ts` | `textToSpeech` |
| `src/lib/avatars/voice-reference.ts` | **create** — prepare a named voice's reference (preview copy, else TTS) |
| `src/app/api/clients/[id]/avatars/[avatarId]/voice/route.ts` | prepare it on declare (best-effort) |
| `src/lib/storage/*` | `pathForAvatarNamedVoiceSample`, upload helper |
| `src/components/nodes/presenter-switch.tsx` | **create** — "Presenter: {name} · In this shot" for the three prompt focus views |
| `src/hooks/use-shot-presenter.ts` | **create** — the browser side of the lookup, from the canvas store + `useAvatar` |
| prompt / video-prompt / multishot-prompt focus views | the switch |
| `video-gen-change-voice.tsx`, `video-gen-model-picker.tsx`, `video-gen-focus-view.tsx` | Edit voice default; models the face cannot use disabled; notes |

---

### Task 1: The pure rules

**Files:** create `src/lib/avatars/presenter.ts`; test `src/lib/avatars/__tests__/presenter.test.ts`.

**Interfaces — produces:**
- `type PresenterRowInput = { nodeId; type; data }` (an upstream row)
- `seedingScriptId(rows: PresenterRowInput[]): string | null` — the first Shot or Multishot upstream's `seededFrom.scriptNodeId`
- `hasOnCameraLine(rows): boolean` — any of the Shot's `script` shots' `voiceover`, or the Multishot's cuts' `voiceover` and `sequenceVoiceover`, with an on-camera speaker
- `presenterInShot(stored: { inShot: boolean } | undefined, rows): boolean` — stored wins, else `hasOnCameraLine`
- `presenterUpstreamRow(avatarNodeId: string, avatar: Pick<Avatar, "name" | "front">): UpstreamOutput | null` — `{ nodeId: avatarNodeId, type: "file", data: { title: \`Presenter: ${name}\`, fileKind: "image", fileUrl: front.url }, activeOutput: null, versionId: null }`; null without a front
- `matchingVoiceReference(avatar): AvatarVoiceSample | null` — the sample whose `sourceKey` matches the declaration (`elevenlabs:{voiceId}` for named; a non-`elevenlabs:` key for native); null otherwise
- `seedanceVoiceText(voice: AvatarVoice): string` — the binding sentence + the voice in words (named: labels; native: "the presenter's own voice")
- `namedVoiceSampleKey(voiceId: string): string` — `elevenlabs:${voiceId}`

- [x] Tests first for each (Shot with a narrator-only line → off; with "Riya" → on; stored `false` beats an on-camera line; Multishot sequence lines count; row null without a front; reference matching per declaration; the text contains "@Audio 1" and "timbre only"); run, implement, run, commit `feat(avatars): the presenter's rules for a shot (D299)`.

---

### Task 2: The presenter on the server, and the virtual input

**Files:** create `src/lib/avatars/presenter-server.ts`; modify `resolve-inputs.ts`, `video-generate/route.ts`, `upstream-images/route.ts`, `image-generate/route.ts`; tests alongside.

**Interfaces — produces:**
- `loadPresenterForPromptNode(promptNodeId, ups): Promise<{ avatarNodeId; avatar; inShot } | null>` — script from `seedingScriptId(ups)`; its newest avatar edge (`edges` where `target_node_id = script`, joined to `nodes.type = 'avatar'`, `order by created_at desc limit 1`); the avatar via `getAvatar(clientId, avatarId)` (archived included); `inShot` from the prompt node's `data.presenter` and `presenterInShot`.
- `getPromptUpstream(nodeId): Promise<UpstreamOutput[]>` — `getUpstreamOutputs(nodeId)` + the virtual row when in the shot.
- `withStillPresenter(imageGenUps): Promise<UpstreamOutput[]>` — for Image Gen: when its upstream Prompt node has the presenter in the shot, the virtual row is appended to Image Gen's own upstream (a still takes connected images directly).

- [x] Replace `getUpstreamOutputs` with `getPromptUpstream` in the three prompt resolvers, in `resolveVideoGenPrompt`'s injected fetch (video route), and for the prompt-node batches in `upstream-images`; use `withStillPresenter` in `image-generate` and for Image Gen in `upstream-images`.
- [x] Route tests: a Motion Prompt with the presenter on lists "Presenter: Riya" among its references; switched off, not; a Video Gen on Omni sends the face as a reference; on Seedance with a still as the first frame, the face is not sent (existing rules) — commit `feat(avatars): the presenter enters a shot as a virtual input on its prompt node (D299)`.

---

### Task 3: The voice on Seedance

**Files:** modify `video-generate/route.ts`, `trigger/video-generate.ts`; extend the route test.

- [x] When the model is Seedance and the prompt node's presenter is in the shot: `referenceAudioUrl = matchingVoiceReference(avatar)?.url`, appended to the task payload and passed by the task to `config.generate`; the prompt gets `seedanceVoiceText(avatar.voice)` appended. Recorded in `inputsSnapshot.presenter = { avatarId, referenceAudioUrl }`.
- [x] If the reference is missing for a named voice, prepare it on demand (Task 4's function) before sending; still missing → generate without audio, recorded.
- [x] Tests, commit `feat(avatars): Seedance hears the presenter's voice (D299)`.

---

### Task 4: A named voice's reference

**Files:** `src/lib/elevenlabs/client.ts` (`textToSpeech({ voiceId, text }): Promise<Buffer>` — `POST /v1/text-to-speech/{voiceId}`, `eleven_multilingual_v2`, mp3); `src/lib/avatars/voice-reference.ts` (`prepareNamedVoiceReference(clientId, avatar): Promise<AvatarVoiceSample | null>` — only for a Seedream face; download `voice.previewUrl` when set, else TTS of "Hi, I'm {name}. This is how I sound when I talk about the things I care about."; store at `clients/{c}/avatars/{a}/voice-sample/elevenlabs-{voiceId}.mp3`; probe its duration; write `voice_sample` with `namedVoiceSampleKey`); the voice route calls it after declaring a named voice, best-effort.

- [x] Tests with injected fetch/TTS/storage: a preview is copied; no preview → TTS; a real person → nothing; a failure leaves the declaration and returns null. Commit `feat(avatars): a named voice gets a voice reference for Seedance (D299)`.

---

### Task 5: The switch, Edit voice and the model picker

**Files:** `canvas-nodes.ts` (`presenter?`), `use-shot-presenter.ts`, `presenter-switch.tsx`, the three prompt focus views, `video-gen-change-voice.tsx`, `video-gen-model-picker.tsx`, `video-gen-focus-view.tsx`.

- [x] `useShotPresenter(promptNodeId)` walks the canvas store: prompt node → upstream Shot/Multishot → `seededFrom.scriptNodeId` → `presenterAvatarId` (part 1) → `useAvatar`; returns `{ avatar, avatarNodeId, inShot, stored }` or null — `inShot` from the same `presenterInShot`.
- [x] `PresenterSwitch` — the face, "Presenter: {name}", a `Switch` "In this shot"; toggling writes `presenter: { inShot }` to the prompt node. The three prompt node cards show the presenter's small round face while it is in the shot (spec §3).
- [x] Edit voice: with no voice of its own, its value defaults to the presenter's named voice id when the feeding prompt node has the presenter in the shot. Never applied without Apply.
- [x] Model picker: while the presenter is in the shot, models outside `avatarWorksWith` are disabled with the reason; a selected one shows it in place of Generate. Notes in the Video Gen focus view for "Seedance uses the still as its first frame…" and "Only Seedance keeps the engine's own voice the same across clips."; and, on Seedance with the presenter in the shot but no matching voice reference, "The presenter's voice reference is missing, so Seedance will invent a voice." (spec §8)
- [x] `tsc` + eslint; commit `feat(avatars): the presenter switch, Edit voice and the model list (D299)`.

---

### Task 6: Record it

- [x] As built; spec amended where it differs; commit.

## As built (2026-10-01)

All six tasks done. Commits: `bc7b77e1` (rules), `c9145237` (virtual input), `24191c81`
(named voice reference), `d73bed41` (Seedance voice), `74fed089` (switch, card face, Video Gen).

- Task 5 also added `presenter-face.tsx` (the card face) and `video-gen-presenter-notes.tsx`, plus
  two pure rules in `presenter.ts`: `unavailableModelsFor` and `presenterVideoNotes`, both tested.
- `useShotPresenter` returns `chosen` (whether the operator set the switch), not `stored`.
- Edit voice's default applies only while the node has no stored `voiceChange`: it can't loop
  on a voice ElevenLabs no longer has.
- The missing-reference note covers the engine's own voice only; a named voice's reference is made
  at generation time.
- Not built: suggesting the Multishot lane for Seedance shots with a still (spec §4, §11).
- Components were checked with `tsc` and eslint only — vitest runs in node.

## Verify in the running app

Part 1's checklist first. Then, on a parsed script with a presenter, fan out shots:

1. A Motion Prompt under a shot with an on-camera line shows "Presenter: Riya · In this shot" **on**; a narration-only shot's shows it **off**. Flip one; regenerate the prompt: it names the presenter and lists "Presenter: Riya" among its images.
2. Video Gen on Gemini Omni: the presenter appears in its inputs as a reference; the clip shows her. Edit voice opens with Riya's named voice chosen; nothing changes until Apply.
3. Video Gen on Seedance with a Seedream presenter: the face goes as a reference and the voice as audio (the inputs snapshot records the audio URL). With a still as the first frame, the note says the face can't go; the voice still does.
4. A real-person presenter: Seedance and Veo are disabled in the model picker with their reasons.
5. A still (Image Gen under a Prompt with the presenter on) is made with her face.
6. Declare a cloned named voice on a Seedream avatar: a voice reference appears in the Avatar's focus view after a few seconds.
