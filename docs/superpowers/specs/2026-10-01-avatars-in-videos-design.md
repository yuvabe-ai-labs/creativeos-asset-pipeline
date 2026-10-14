# Avatars on the canvas — part 2: the presenter in the stills and videos

**Status:** design approved 2026-10-01 · **ADR:** D299 · **Follows:** `2026-10-01-avatars-on-canvas-design.md` (part 1, D298) · **Builds on:** D284 (Edit voice), D290/D297 (which models a face works with), D296 (the voice reference)

## 1. What this is

Part 1 makes an avatar a script's **presenter**. This part puts the presenter into the work the
script becomes:

- the **face** goes into the stills and videos of the shots the presenter appears in;
- on **Seedance**, the **voice** goes in as an audio reference, so the clip is generated in the
  presenter's voice;
- on the models that take no audio, **Edit voice** opens with the presenter's named voice already
  chosen — but nothing is re-voiced until the operator applies it;
- the **model list** only offers models that can use the presenter's face.

### 1.1 Decisions taken in review (2026-10-01)

| Question | Answer |
|---|---|
| Where "is the presenter in this shot" is decided | On the node that writes the shot's prompt (§3) |
| Stills | Yes, with the same switch (§3) |
| Re-voicing | Never automatic. Edit voice is pre-selected; the operator applies it (§6) |
| A named voice on Seedance | Its ElevenLabs sample goes as the audio reference; with no sample (common for cloned voices), ElevenLabs reads a short line once to make one (§5) |
| Avatar → Image Gen / Video Gen directly | Not now — the presenter comes only through a script |

## 2. Finding a shot's presenter

A generation is fed by a prompt-writing node — **Prompt** (stills), **Motion Prompt** or
**Multishot Prompt** (video) — which sits downstream of a **Shot** or **Multishot**. Those carry
`seededFrom.scriptNodeId`, the script that created them. The presenter is that script's avatar
(part 1 §4: the newest avatar edge into it).

So **the presenter of a prompt node** is found by walking upstream from it to the nearest Shot or
Multishot, then to its script, then to the script's avatar. Nothing is copied along the way: a
presenter connected, changed or removed on the script is what every shot sees next time.

A prompt node with no Shot or Multishot upstream, or whose script has no presenter, has no
presenter — and everything in this spec stays out of its way.

## 3. The switch: "In this shot"

The **Prompt**, **Motion Prompt** and **Multishot Prompt** nodes — the ones that write a shot's
prompt — show the presenter when they have one: a small round face, "Presenter: Riya", and an
**In this shot** switch. It appears in the node's focus view beside its other inputs, and as a
small face on the node card when on.

- **Default:** on when the shot has an **on-camera line** — a parsed VO line whose `speaker` is
  not `"narrator"` (the Shot's lines; for a Multishot, its cuts' lines and its sequence lines).
  Off for narration-only shots and b-roll. Computed, never stored.
- **The operator's choice wins.** Flipping the switch stores `presenter: { inShot: boolean }` on
  the prompt node; from then on that is the answer, through regenerations and edits.
- **Image Gen and Video Gen have no switch of their own.** They follow the prompt node that feeds
  them, so a shot is answered once, where its prompt is written.

*Rejected:* a switch on every Video Gen node (the shot would be answered in two places, once for
the still and once for the video, and could disagree). Asking the prompt-writing model to decide
(the Motion Prompt returns plain text, with no clean place for a yes or no, and the decision
would change on every regeneration).

## 4. The face

With the switch on, the presenter's **front image** joins the prompt node's references as one
more image, labelled **"Presenter: Riya"**. It goes through the same reference roster uploaded
images use (`refEntriesOf`, the `@Image N` binding, references stored by id — BUG-010), so citing
it, storing it, the per-model image limits and the missing-reference checks all apply unchanged.

- **The prompt writer** is told the image is the presenter and writes them into the shot by that
  reference.
- **The still** — Image Gen fed by that Prompt — is made with the face as a reference image.
- **The video** — Video Gen fed by that Motion or Multishot Prompt — sends the face within the
  model's own image rules: a reference image on Seedance, Kling and Veo; a reference or first frame
  on Gemini Omni, as its planner already decides.
- **Seedance with a still upstream.** Seedance takes a first frame *or* reference images, never
  both. When the shot's still is its first frame, the face cannot go too: it is left out, and the
  Video Gen focus view says so ("Seedance uses the still as its first frame, so the presenter's
  face can't be sent as well. The voice still is."). The voice reference still goes (§5).
  *(As built: the note is shown; suggesting the Multishot lane in the picker was not built — see
  §11.)*

## 5. The voice

### 5.1 On Seedance: an audio reference

When the presenter is in the shot and the model is **Seedance 2.5**, the request carries the
avatar's **voice reference** as a `reference_audio` part — the part D296 already taught
`buildSeedanceContent` to send. Following the vendor's guidance (handoff spec §3.4, BytePlus
Seedance 2.5 tutorial):

- The request's text binds it by position and limits it: "Reference only the voice timbre in
  @Audio 1, not its music or sound effects."
- It also describes the voice in words — a named voice's labels (gender, language, accent,
  description), or "the presenter's own voice" — which is the vendor's mitigation for a generated
  voice that drifts from its reference.
- Limits met by construction: mp3, 2–30 s, one clip, well under 15 MB, served from our public
  bucket. Audio is outside Seedance's token formula, so it adds **no cost**.

### 5.2 What the voice reference is

One stored sample on the avatar — `client_avatars.voice_sample` (migration 0041) — recorded with
the voice it belongs to, in `sourceKey`. A sample whose `sourceKey` does not match the avatar's
current declaration is ignored, never sent.

| Declaration | The voice reference | `sourceKey` |
|---|---|---|
| The engine's own voice | The audio extracted from its Seedance preview (D296) | the preview's generation id |
| A named ElevenLabs voice | The voice's ElevenLabs sample, copied into our bucket — or, when it has none, a short line read by ElevenLabs text-to-speech in that voice | `elevenlabs:{voiceId}` |
| No voice | None | — |

**Making a named voice's reference.** Only for avatars that can run on Seedance — a Seedream face
(D297). When the named voice is declared, the voice route prepares it, best-effort:

1. If the ElevenLabs voice has a preview sample, download it and store it in our bucket.
2. Otherwise, call ElevenLabs text-to-speech with that voice reading one line — "Hi, I'm {name}.
   This is how I sound when I talk about the things I care about." (about 10 s) — and store the
   mp3.
3. Record it as `voice_sample` with `sourceKey: elevenlabs:{voiceId}` and its measured duration.

If preparing fails, the declaration still stands. The video route prepares it on demand the first
time a Seedance generation needs it, and caches the result the same way. Text-to-speech costs a few
cents per voice; it is absorbed with the other ElevenLabs costs until those are billed (client
avatars spec §7.3).

### 5.3 On Gemini Omni, Kling and Veo: Edit voice, pre-selected

These take no audio input, so their clips speak in the engine's own voice. **Edit voice** (D284)
— the existing re-voice on a finished take — opens with the **presenter's named voice already
chosen** when the shot has the presenter and the node has no voice choice of its own. It runs only
when the operator presses Apply; nothing is re-voiced automatically.

With the engine's own voice declared, a non-Seedance shot cannot keep the voice consistent: the
Video Gen focus view says "Only Seedance keeps the engine's own voice the same across clips."

## 6. The model list

While the presenter is in the shot, the Video Gen model picker disables the models the presenter's
face does not work with (`avatarWorksWith`, D297) and says why — "Seedance refuses a real person's
face", "Seedance only takes faces made with Seedream 5.0 Lite". A node that already has such a
model selected shows the same reason in place of Generate. Image Gen is not restricted: every
image model takes a reference image.

## 7. What changes, where

| Piece | Change |
|---|---|
| Presenter lookup | A pure walk (prompt node → Shot/Multishot → script → newest avatar edge), used by the browser from the canvas store and by the routes from the database |
| Prompt, Motion Prompt, Multishot Prompt nodes | `presenter?: { inShot: boolean }`; the presenter row and switch; the face in their reference roster |
| Prompt-writing routes | The presenter's image in the roster when in the shot, with one line telling the writer who it is |
| `image-generate` and `video-generate` routes | The face as a reference when the feeding prompt node has the presenter in the shot |
| Seedance request | `reference_audio` + the binding and voice-description text |
| Voice route (`PUT …/avatars/[avatarId]/voice`) | Prepares a named voice's reference (§5.2) |
| ElevenLabs client | Text-to-speech, for voices with no sample |
| Edit voice | Defaults to the presenter's named voice |
| Video Gen model picker | Disables models the face does not work with |

No migration: `voice_sample` exists (0041) and node data is JSON.

## 8. Failures

| Case | Behaviour |
|---|---|
| The presenter is removed from the script | Every shot loses it on its next prompt or generation; finished takes are untouched |
| The voice reference cannot be prepared | The Seedance shot generates without `reference_audio` (the engine invents a voice). The focus view says the reference is missing for the engine's own voice with no sample; a named voice's reference is made at generation time, so the browser cannot know in advance that it will fail (§11) |
| A named voice is changed | The old sample no longer matches and is ignored; the new one is prepared |
| Seedance refuses the face | The provider's message is shown and the generation is refunded, as today |
| The prompt node's switch is on but the shot's model cannot take any image | The face is left out, with the reason |

## 9. Testing

- **Pure:** the presenter lookup (a Shot, a Multishot, no seed, no presenter, an archived
  avatar); the switch default from VO lines; which voice reference matches a declaration; the
  binding and voice-description text; the model-picker rule per face.
- **Routes:** a Seedance generation with the presenter sends the face and `reference_audio`; with
  a still upstream it sends the audio but not the face; Omni sends the face and no audio; with the
  switch off, nothing is added; the voice route prepares a sample from a preview, and by
  text-to-speech when there is none.
- **Browser:** the checklist in the plan.

## 10. Out of scope

Avatars connecting straight to Image Gen or Video Gen. Several presenters per script. Billing
ElevenLabs text-to-speech. Kling Elements from the profile sheet (client avatars spec §10).

## 11. As built (2026-10-01)

Built as designed, with these differences:

- **Where it lives.** The pure rules are in `src/lib/avatars/presenter.ts`: the presenter lookup,
  the switch default, the virtual File row, voice-reference matching, the Seedance text,
  `unavailableModelsFor` (§6) and `presenterVideoNotes` (the focus-view notes). The server reads
  them through `src/lib/avatars/presenter-server.ts` (`getPromptUpstream`, `withStillPresenter`,
  `presenterVoiceForSeedance`); the browser through `useShotPresenter`. Both feed the same rows
  to the same functions, so the switch shows what generation does.
- **The switch** sits in the focus view's rail, under the connected inputs — in the shared
  shell (Motion Prompt, Multishot Prompt) and in the image Prompt's own view. The card's face sits
  beside the status dot in the header.
- **The model list.** Ruled-out models stay visible but disabled, with the reason on hover. Veo
  on a real person's face says "Google may refuse a real person's face". A node already on a
  ruled-out model shows the reason under the picker and in place of Generate.
- **Edit voice** pre-selects the presenter's named voice only while the node has stored no voice
  choice at all. Once anything is stored — a pick, a clear, or a voice ElevenLabs no longer has —
  the node's own choice wins, so a deleted voice can't loop.
- **The missing-reference note** covers the engine's own voice with no sample (make a voice
  preview in the Studio). A named voice's reference is made on demand when Seedance generates.
- **Not built:** suggesting the Multishot lane in the picker for Seedance shots with a still (§4).
- **No migration.** The switch is node data; the voice reference reuses `voice_sample`. Named
  references are stored at `clients/{c}/avatars/{a}/voice-sample/elevenlabs-{voiceId}.mp3`.

### 11.1 Fix after the first Seedance multishot on staging (2026-10-05)

The request named the avatar in the beats ("Razel, the woman…") but voiced the lines as the
script's speaker (`creator says: "…"`), so the model heard two people. The look also invented "a clean
white studio background for the presenter cut" from the portrait. Now:

- **The avatar speaks the on-camera lines.** With the avatar in the shot and exactly one on-camera
  speaker in the script, that speaker is renamed to the avatar (`withAvatarAsSpeaker`) where the
  avatar joins the prompt node's upstream. The writer, the stored plan, the request and the Multishot
  Prompt preview all read the same name. Two or more on-camera speakers are left as written.
- **The avatar image is identity only:** its text for the writer asks for face, hair, build and
  clothing, never the portrait's background, lighting or framing.
- **Seedance's voice line is in words:** "female, middle-aged, English, Indian accent", not
  ElevenLabs' slugs.

