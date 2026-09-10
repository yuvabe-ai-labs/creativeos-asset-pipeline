# Seedance 2.5, and a prompt guide per model

**Status:** designed, not implemented
**Refines:** D79 (uniform text-camera), D80 (preservation-first spine), D231 (the plan is JSON), D235–D239 (the multishot capability table)

---

## 1. What this changes, and the evidence for it

Today the single-shot lane has **two** system prompts for **four** models. `SPINE` — one shared
image-to-video core — is wrapped by a Veo header and a Kling header, and Gemini Omni silently
receives the Veo record. The multishot lane already routes per model (D236) but has only two
entries.

The case for splitting is not stylistic. Each vendor publishes its own **ordered formula**, and
they disagree with each other and with ours:

| Model | The vendor's own formula | Source |
|---|---|---|
| Veo 3.1 | `[Cinematography] + [Subject] + [Action] + [Context] + [Style & Ambiance]` | `ref/veo/The ultimate prompting guide for Veo 3.1.md` |
| Gemini Omni | 6 dimensions: shot framing/motion, style, lighting, location, action, text rendering | `ref/google-omni-flash-docs/Google Omni Prompting Guide…md` |
| Seedance 2.5 | `subject + action/event + scene and environment + visual style + camera movement/shot cuts + sound` | `ref/byteplus-docs/Dreamina Seedance 2.5 tutorial.md` |
| Kling 3.0 Omni | storyboard control, element consistency, native audio | `ref/kling-docs/kling omni prompt guide.md` |

`SPINE` imposes **camera → action → preservation** on all of them. That matches none of the four
exactly, and Veo's own guide leads with cinematography while Seedance's ends with sound — an
ordering difference the vendors state explicitly enough that following one for all four is a
choice we have been making by accident.

Adding Seedance 2.5 as a fifth consumer of a prompt written for Veo would compound that. So the
model gets its own guide, and so does everything else.

## 2. Seedance 2.5 — the contract

`ref/byteplus-docs/` (7 files, supplied 2026-09-09) is the vendor's own API reference and tutorial.

```
POST https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks
{ model: "dreamina-seedance-2-5-260628", content: [...], resolution, ratio, duration, ... }
```

**A fourth transport shape.** Create returns a task id; the result is fetched by polling a
separate retrieve endpoint. Veo, Kling and Gemini Omni already differ from one another, so this is
a new provider module, not a change to a shared one.

`content` is an array mixing text and assets:

```jsonc
[ { "type": "text",      "text": "…" },
  { "type": "image_url", "image_url": { "url": "…" }, "role": "reference_image" } ]
```

### The constraints that bind

| | Value |
|---|---|
| `duration` | integer **4–30**, or `-1` (model picks). Default `-1` |
| `resolution` | `480p` \| `720p` \| `1080p`. Default `720p` |
| `ratio` | default `adaptive` |
| Reference images | **1–30**, each `role: "reference_image"` |
| Frames vs references | **mutually exclusive** — `first_frame`/`last_frame` cannot be mixed with `reference_image` |
| Prompt asset handles | `@Image 1`, `@Video 1`, `@Audio 1` — **1-based, space-separated, capitalised** |
| Shot timestamps | bare `0-3s`, `3-6s` — no brackets |
| Sound characters | `()` music, `<>` SFX, `{}` dialogue, `【】` subtitles |

### The two ids, which are not the same string

The repo keys models as `provider:model` (`kling:kling-3-0-omni`, `gemini:gemini-omni-1.1-flash`).
Seedance therefore has two identifiers and they must not be conflated:

- **Our client/server model id:** `seedance:seedance-2-5` — the key in `videoGenClientModelMap`,
  the value of `MultishotNodeData.targetModel`, and what a version row records.
- **The vendor's model string:** `dreamina-seedance-2-5-260628` — sent as `model` in the request
  body, and owned solely by the provider module.

The vendor's string carries a dated suffix that will change when BytePlus revises the model. Only
the provider module should ever mention it, so a vendor version bump is one line and not a
migration of every persisted node.

**30 seconds is triple Gemini Omni's ceiling and double Kling 3.0 Omni's.** That is the single
biggest reason to put it in the multishot lane rather than only the single-shot one.

The frames-vs-references exclusion is the same rule Veo 3.1 and Kling 3.0 already carry, so it is
expressed the same way — a `ConstraintRule`, not a special case.

## 3. The per-model seam

Neither lane needs a new mechanism; one needs widening.

- **Multishot** — `multishotPromptFor(targetModel)` already routes per model (D236). Seedance is a
  third branch. No change to the mechanism.
- **Single-shot** — `videoPromptGeneratePromptFor({ provider })` routes per *provider*, which is
  why Gemini Omni receives Veo's prompt: they share a provider-adjacent fallback. This becomes
  `videoPromptFor(modelId)`, matching the multishot lane.

Routing on the model id rather than the provider is what makes "Gemini Omni gets Veo's prompt"
unrepresentable, rather than merely fixed once.

## 4. File layout

Extending the naming convention the multishot lane already established
(`multishot-prompt-kling.ts`, `multishot-prompt-for.ts`) rather than introducing folders — one
convention, already in the repo, already understood.

```
src/prompts/
  video-prompt-shared.ts          the genuinely model-independent blocks
  video-prompt-veo.ts
  video-prompt-kling.ts
  video-prompt-gemini-omni.ts
  video-prompt-seedance.ts
  video-prompt-for.ts             videoPromptFor(modelId)

  multishot-prompt-shared.ts      (blocks already extracted 2026-09-09)
  multishot-prompt-gemini-omni.ts (renamed from multishot-prompt-generate.ts)
  multishot-prompt-kling.ts
  multishot-prompt-seedance.ts
  multishot-prompt-for.ts         (exists; gains a third branch)
```

`video-prompt-generate.ts` currently exports constants half the codebase imports —
`SUBJECT_SILENT_CAMERA`, `MOTION_AVOID_LIST`, `MULTISHOT_AUTHORING_MODEL`, `SINGLE_TAKE_LINE`,
`VideoProvider`. Those move to `video-prompt-shared.ts` and the old module re-exports them, so the
rename is not a breaking change to twenty call sites in one commit.

### What stays shared

Only what is model-independent because it describes **how generated video fails**, not how one
vendor's parser reads a prompt:

- `SUBJECT_SILENT_CAMERA` — exists because of a shipped bug where a generated crane clause made
  Kling levitate a product off its plinth. Every i2v model executes subject-state language as
  subject motion; this is not Kling-specific.
- `MOTION_AVOID_LIST` — the hype-word ban.
- The physics block (surfaces, contact, force verbs, weight) from the multishot writer.

Everything a vendor publishes about **its own** ordering, syntax or emphasis moves into that
model's file. The test is: would this sentence still be true if the vendor rewrote their guide?

## 5. What each guide is built from

Each system prompt is written from that model's own documentation, cited in the file header the
way `video-prompt-generate.ts` already cites its two Google URLs.

- **Veo 3.1** → the five-part formula, plus "the language of cinematography" and the essential
  techniques section.
- **Gemini Omni** → the official six-dimension framework. The guide also carries **system
  instruction templates**, which map onto our system prompt more directly than prose guidance does.
- **Kling** → the 3.0 Omni user guide (storyboard control, element consistency, native audio) plus
  the two cinematic-motion guides in `ref/kling-docs/`.
- **Seedance 2.5** → the documented formula, the asset-responsibility rule (state what each
  `@Image N` provides *and what it should not*), and the sound characters.

**A standing caution, learned the hard way (D238).** These are **prompt-craft** references. They
are not wire-format references. `kling-omni-system-prompt.md` documents the web console's
`Shot N (Xs):` syntax, which the API does not parse — following it would have sent prose the API
reads as a single shot. Craft guidance comes from these files; the wire format comes only from the
API reference, and `renderPlan` owns it.

## 6. Seedance in the multishot lane

### Capability

```ts
{ id: SEEDANCE_MODEL_ID, label: "Seedance 2.5",   // "seedance:seedance-2-5"
  minTotalSeconds: 4, maxTotalSeconds: 30, minCutSeconds: 1,
  maxCuts: null, maxCutChars: null, maxPromptChars: null,
  shotFormat: "bare-timecode", refTokenBase: 1 }
```

`minTotalSeconds: 4` is the first capability whose floor is not 3 — the existing
`checkLadder` already reads `cap.minTotalSeconds`, so nothing changes to support it.

### A third shot format

`renderPlan` gains a third branch. All three take their seconds from the **cuts**, never from the
plan, so the ladder and the request's duration agree by construction in every format:

```
Omni       [0-2s] A hand sweeps keys off oak.
Kling      shot 1, 2, A hand sweeps keys off oak;
Seedance   0-2s: A hand sweeps keys off oak.
```

`shotFormat` becomes `"timecode" | "triple" | "bare-timecode"`.

### A third dialect

`seedanceImageDialect` stores `@Image N` — 1-based, space-separated, capitalised. It is **not**
Kling's `@image_N`, and the two must not parse each other's tokens: `@image_1` and `@Image 1`
differ by one character's case and a space, which is exactly the kind of near-collision that binds
every citation to its neighbour silently, in a clip already paid for.

`dialectForCapability` currently branches on `refTokenBase`, which can no longer distinguish Kling
from Seedance — both are 1-based. The capability gains an explicit `refTokenDialect` field rather
than overloading the numeric base.

### The plan's stamp

`MultishotPlan.targetModel` (D240-era work) already records which model wrote a plan, and
`resolve-prompt.ts` reads it rather than the node's current field. Seedance inherits that for free:
a Seedance-stamped plan renders as bare timecodes even if the node is later switched.

## 7. Cost

Seedance's real billing is **token-based** with a per-resolution rate and a minimum, not a flat
per-second price. `computeVideoCost` is per-second, so the entry uses the vendor's own worked
examples from `seedance_2.5_PRICING.md`:

| Resolution | USD/second |
|---|---|
| 480p | 0.103 |
| 720p | 0.231 |
| 1080p | 0.569 |

Audio does not split the price for 2.5, so this is a `RESOLUTION_ONLY_PRICING` row, like Gemini
Omni's — not the Kling audio-keyed table.

**Two things to state in the file, because both are true and neither is obvious.** These figures
are the vendor's 16:9 examples and token count scales with pixel count, so they drift at other
aspect ratios. And Seedance is **expensive**: 720p at $0.231/s is 2.3× Gemini Omni and 2.75× Kling
3.0 Omni, so a 30-second clip is about **$6.93**. That is a real number for an operator to see
before clicking Generate, and the estimate already renders — it just needs to be right.

## 8. Error handling

- **Frames and references both attached** — a `ConstraintRule` disables Generate with the reason,
  exactly as Veo and Kling 3.0 already do. No new mechanism.
- **Ladder outside 4–30s** — `checkLadder` already states it; Seedance gets it by declaring the
  capability.
- **The async task fails or times out** — the provider's poll loop surfaces the vendor's error, the
  same shape `pollKlingTask` already uses.
- **`omni_reference_task_type` mismatch** — Seedance infers the task type from the assets *and the
  prompt*, and raises an asynchronous error when the inferred type contradicts the parameters. We
  send the type explicitly rather than relying on `auto`, which moves that failure from mid-task to
  request validation.

## 9. Testing

Pure logic, which is most of it:

- `renderPlan` per format — three models, one plan, three outputs; every one's seconds summing to
  the request duration.
- `seedanceImageDialect` — round-trips byte-exact, 1-based, two-digit indexes intact, and
  **does not parse `@image_1`**, with the Kling dialect not parsing `@Image 1`.
- `multishotCapabilityFor` — Seedance's 4s floor and 30s ceiling; every capability's id resolves to
  a real video-gen model.
- `videoPromptFor(modelId)` — each of the four models gets its own record, and **no two return the
  same object**. That last assertion is the one that would have caught Gemini Omni silently
  receiving Veo's prompt.
- Cost — the three resolutions priced exactly, as values rather than "not null" (the
  2026-09-09 Kling pricing correction is the precedent: a not-null assertion is what let a wrong
  rate sit there).

Route:

- The video-generate route rejects a Seedance request whose plan was stamped for another model.
- A Seedance multishot request sends `duration = totalOf(cuts)`.

**Not testable here:** whether any rewritten prompt is *better*. Nothing in this repo evaluates
prompt quality. That is why §10 sequences the rewrites one model at a time.

## 10. Sequencing — one spec, two plans

**Plan 1 — Seedance 2.5.** Provider, params, client/server registration, cost, capability entry,
the third `renderPlan` branch, the third dialect, and Seedance's own two guides. Additive:
nothing that ships today changes behaviour.

**Plan 2 — the guide rewrites.** Veo, Kling and Gemini Omni, in both lanes, rewritten from their
vendor docs. **One model per reviewable change.**

The order is not arbitrary. Five of the seven prompts are live and working, and this repo has no
automated way to tell whether a rewritten prompt is better or worse — a regression surfaces only in
generated video that someone has already paid for. Doing the additive work first means that when
prompt quality does change, the model, the transport and the renderer are already known-good, so a
bad result is attributable to the one thing that moved.

The single-shot routing seam widens in Plan 1, so Seedance is per-model from its first commit
rather than retrofitted — which is the operator's stated requirement.

## 11. ADR entries to append to §7

**D243 — Every video model gets its own system prompt, routed by model id.** The single-shot lane
stops routing by provider and stops letting Gemini Omni fall through to Veo's record. *Why:* each
vendor publishes its own ordered formula — Veo's five-part cinematography-first, Omni's six
dimensions, Seedance's six-part sound-last — and one shared `SPINE` ordering matches none of them.
*Rejected:* keeping the shared spine with per-model deltas (the deltas are the ordering itself, so
the delta would be the whole prompt); routing by provider (the shape that produced the Omni-gets-Veo
bug). *Consequence:* what remains shared is only what describes how generated video fails, not how
a vendor reads a prompt.

**D244 — Seedance 2.5 renders as bare timecodes; `shotFormat` becomes a three-way.** `0-2s: …`,
against Omni's `[0-2s] …` and Kling's `shot 1, 2, …;`. *Why:* it is the format Seedance's own
tutorial uses throughout. *Consequence:* `renderPlan`'s branch count follows the number of wire
formats, which is the thing that actually varies.

**D245 — The reference dialect is named on the capability, not derived from `refTokenBase`.**
Kling's `@image_1` and Seedance's `@Image 1` are both 1-based, so the numeric base no longer
identifies a dialect. *Why:* two dialects differing by one character's case and a space is exactly
the near-collision that binds a citation to the wrong image silently. *Rejected:* inferring from
the provider (the capability already exists and is the right home).

**D246 — Seedance is priced from the vendor's worked examples, and the approximation is stated.**
Its real billing is token-based with a minimum; `computeVideoCost` is per-second. *Why:* an absent
row makes the model registered and unable to generate. *Consequence:* the figures are 16:9 and
drift at other ratios, which the file says in place — the 2026-09-09 Kling correction is the
precedent for flagging rather than quietly shipping an approximation.
