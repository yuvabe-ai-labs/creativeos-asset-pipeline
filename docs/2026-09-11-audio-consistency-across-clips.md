# Voice Continuity Across Clips

**11 September 2026 · CreativeOS video pipeline**
Findings from the Kling, BytePlus and Google API documentation.

---

## What we are actually seeing

**Lip-sync is mostly working fine.** The problem is **audio consistency**, and it comes from the
fact that we generate a reel as **separate clips**. Each generation invents its own voice, room tone
and music from nothing — no audio state carries from one API call to the next — so the voice changes
person and the ambience jumps at every join.

*Reported by Vanchi.*

---

## Two of our three providers accept a voice reference at generation time

Seedance 2.5 and Kling 3.0 Omni both let us supply a voice **before** the render, which is the only
point in the pipeline where the same voice can be made to come out of clip one and clip five. Kling
also has a lip-sync API that accepts video from any source, and that is the only route open for the
Google models, which take no voice input at all. All of it sits on API keys we already hold. How well
it holds up on our own footage still needs testing.

---

## What each provider supports

Checked against each vendor's own API documentation. The first column is the one that matters most —
whether we can set the voice before the model renders.

| Model | Voice reference in | Native audio out | Re-sync needed |
|---|---|---|---|
| **Kling 3.0 Omni** (Kling) | **Yes** — voice bound to a character via `element_voice_id` on a custom element | Opt-in (`audio: native`) | **Not needed** — voice given at generation. Still available if a clip comes back wrong. |
| **Seedance 2.5** (BytePlus) | **Yes** — up to **10** audio clips per request, cited in the prompt as `【Audio 1】` | Always (`generate_audio`) | **Not needed** — voice given at generation. Kling can still re-sync the output if needed. |
| **Gemini Omni 1.1** (Google) | **No** — images only; dialogue is prompt text | Always, cannot be switched off | **Yes — Kling.** No voice given at generation, so this is the only route. |
| **Veo 3.1** (Google) | **No** — `reference_images` only | Always, lip-sync inside the pass | **Yes — Kling.** No voice given at generation, so this is the only route. |

It works out as a simple rule. If we give the voice at generation time, nothing needs re-syncing
afterwards. If we cannot — or if a clip comes back wrong anyway — we can still re-sync it after the
fact on Kling, whose face-detection endpoint accepts any `.mp4`/`.mov` URL, including output from the
other three models. Seedance and Kling Omni can take either path. The two Google models only have the
second one.

---

## Three stages, in this order

The order matters. Binding a voice before the render is cheap and exact, while repairing one
afterwards costs a second paid pass and carries real limits. Stage 3 is there for the Google models
and for clips that come back wrong, and should stay the exception.

### 1. Cast the voice before generating — *Kling · Seedance*

A character carries a voice the same way it already carries a reference image. This is where we get
control over the voice from the start.

- **Kling** — `POST /v1/general/custom-voices` with a clean single-speaker sample returns a
  `voice_id`. Attach it to a character element via `element_voice_id`, then pass that element into
  the generation as `contents: [{ type: "element", element_id }]`.
- **Seedance** — simpler: attach the audio directly to the generate call as
  `{ type: "audio_url", role: "reference_audio" }` and cite it in the prompt text ("voice style
  referenced from `【Audio 1】`"). No element lifecycle, no pre-registration.

> Kling sample 5–30s · `.mp3` / `.wav` / `.mp4` / `.mov` · Seedance 2–30s per clip · up to 10 clips,
> ≤30s total · ≤15 MB each

### 2. One generation per audio-continuous span — *all models*

Each join between two generations is also a join in the soundtrack. The multishot lane already lets a
whole run of cuts come out of one call with one audio pass, so splitting a continuous stretch of
sound across fewer calls leaves less to reconcile afterwards. Seedance holds 30s, Kling 3.0 Omni 15s,
Gemini Omni 10s.

### 3. Re-sync the finished clip to our own track — *Kling, for any provider's output*

How we cover Gemini and Veo. Two calls, on the Kling key we already hold:

- **Detect** — `POST /v1/videos/identify-face` with a `video_url` returns a `session_id` plus a
  `face_data[]` list: each face with a `face_id`, a cropped **thumbnail**, and the `start_time` /
  `end_time` it appears on screen.
- **Sync** — `POST /v1/videos/advanced-lip-sync` with the chosen `face_id` and our audio, placed to
  the millisecond via `sound_insert_time`, `sound_start_time` and `sound_end_time`.
- **Keep the ambience** — `sound_volume` and `original_audio_volume` (both 0–2) mix our VO *over* the
  model's generated sound design rather than replacing it.

> Input video 2–60s · 720p / 1080p, 512–2160px · ≤100 MB · audio 2–60s, ≤5 MB · one face per pass

---

## Attaching a voice in the prompt node

A voice is attached exactly where a reference image already is — in the prompt node, `@`-mentioned
into the beat where that character speaks. Nothing new for the operator to learn, and nothing to keep
in sync anywhere else.

This also keeps the rule we already set for references: the writer never assigns reference tokens
itself, the operator attaches them by hand after reading the draft. The same reasoning applies with
more force to a voice — a binding the model guessed would put a specific person's voice in a
character's mouth silently, and a wrong binding raises no error. It is only visible in a clip already
paid for.

Mechanically it is the extension point we have already built. `prompt-token-dialect.ts` turns an
upstream picked from the `@` menu into whatever token the target model reads — today the image
dialects (`@image_1` vs `@Image 1` vs `<IMAGE_REF_0>`). An audio reference is one more dialect beside
them: it emits `【Audio 1】` on Seedance, and resolves to the bound character element on Kling.

Which character the voice belongs to needs no detection at all — the beat already names who is on
screen and what they say, and the audio chip sits inside that beat. Seedance's allowance of ten audio
clips per request is what lets several speakers coexist in one generation.

Face detection still has its place in the re-sync lane in Stage 3, where it works as a picker over a
single rendered clip.

---

## What will bite us

| | Constraint |
|---|---|
| **Hard** | **Lip-sync handles one person per pass.** Kling states it outright. A two-hander conversation cannot be repaired in one call — it needs a pass per speaker, or it has to come out right at generation time. |
| **Hard** | **Seedance refuses reference images containing a real human face.** We already handle this error. It means a real actor's face and their voice cannot both go in on that lane — use their digital-character library, or put that shot on Kling. |
| **Bounded** | **Re-sync input caps at 60 seconds and 720p/1080p.** Our 720p default fits and a 30s Seedance clip fits. It runs per clip, so it happens before the edit, never over a finished reel. |
| **Bounded** | **Kling voice binding is for character or humanoid elements only.** Not a product, not a logo, not a landscape. |
| **Bounded** | **Everything depends on the quality of the voice sample.** Both vendors ask for one speaker, clean background, moderate pace, consistent emotion. A noisy or two-speaker sample is the likeliest way this goes wrong, and it produces no error — the clip just comes back with a bad voice. |
| **Unverified** | **Indian-language lip-sync is not documented.** Kling names five languages — Chinese, English, Japanese, Korean, Spanish. For our market that needs a real test before we promise it. |

---

## Build order

| # | Item | Size |
|---|---|---|
| 1 | **Audio as an attachable input** — an audio file can be attached to a prompt node the way reference images already are. | Medium |
| 2 | **Audio token dialect** — one more dialect beside the image ones, and audio in the `@` menu. Emits `【Audio 1】` for Seedance. | Small |
| 3 | **Seedance voice lane** — one extra `contents` entry on the generate call. Cheapest real proof: no new endpoints, no element lifecycle. | Small |
| 4 | **Kling element lane** — the `voice_id` → `element_id` lifecycle: a real object needing create, list and delete. | Large |
| 5 | **Re-sync step** — face detection, a face picker built from the returned thumbnails, then lip-sync with placement and the two volume controls. Only needed for the Google lane and for clips that came back wrong. | Large |

Items 1–3 belong together: an audio file attached, mentioned in a beat, sent to Seedance. They prove
the whole idea end to end before we take on Kling's element lifecycle, which is the largest piece of
the generation-time work.

---

## Decisions needed

**Where do the voices come from?**
Recorded VO per character, or a synthetic voice? Kling's lip-sync also accepts an `audio_id` from
their own text-to-speech, which would remove the recording step entirely — but we have not judged
that voice quality yet.

**Do we need two people talking in one clip?**
If yes, Stage 1 becomes mandatory. The repair lane cannot do two faces in one pass, and that changes
which models a dialogue scene can use at all.

**Do we commit to Indian-language dialogue?**
Undocumented on every lane we checked. If it matters for the roadmap we should test it this week,
since it could rule out on-camera dialogue for those scripts entirely.

---

*Sources: Kling API documentation (lip-sync, face recognition, voice customization, 3.0 Omni elements
and video), BytePlus ModelArk video generation reference, Google Veo 3.1 documentation.*
