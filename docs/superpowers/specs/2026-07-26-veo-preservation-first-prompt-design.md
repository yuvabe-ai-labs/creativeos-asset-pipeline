# Veo path → best-practice compliant (preservation-first motion prompt)

**Date:** 2026-07-26
**Status:** Approved (design). Implementation pending (test-first).
**Type:** Prompt-authoring + provider spec. Brings the **Veo** side of the Video Prompt → Video Gen
pair into line with Google's own Veo 3.1 prompting guidance: rich restatement of the fixed subject
identity, precise camera vocabulary, and artifact suppression via Veo's native `negativePrompt`.
**ADR:** **D78** *(provisional — refines D24 + D77; a parallel `video-provider-consolidation` branch
also drafts a D78, reconcile the number at merge)*.

---

## 1. Why

The Veo motion-prompt author ([video-prompt-generate.ts](../../../src/prompts/video-prompt-generate.ts))
is deliberately terse: *40–90 words, "DO NOT re-describe the scene."* That rule was grounded in Veo's
image-to-video guidance (the start frame carries the subject) and shipped under **D24**. But measured
against Google's published Veo 3.1 best practices, the Veo path leaves three documented levers on the
floor:

1. **No `negativePrompt`.** `GenerateVideosConfig.negativePrompt`
   ([@google/genai node.d.ts:5167](../../../node_modules/@google/genai/dist/node/node.d.ts) — *"Explicitly
   state what should not be included in the generated videos"*) is never populated. Veo's own docs say
   artifact suppression belongs in this field, **not** as "No X, no Y" negations bolted onto the positive
   prompt. Today `generateWithVeo` ([providers/veo.ts:64](../../../src/lib/video-gen/providers/veo.ts#L64))
   builds only `aspectRatio / durationSeconds / lastFrame / referenceImages`.
2. **"More detail = more control" is inverted.** For a **branded product** (fixed label, logo, lettering,
   powder quantity), restating the exact identity to hold is precisely what buys preservation — the hard
   word cap and the absolute "don't re-describe" rule work against it.
3. **Vague camera vocabulary.** The control catalog says `"a gentle orbit around the subject"`
   ([video-controls.ts:29](../../../src/lib/nodes/video-controls.ts#L29)); Veo rewards specific phrasing
   that names invariants ("constant distance, height, and focal length"), which also makes motion
   negatives ("no zoom") implicit instead of stated.

**Concrete gap.** For an amber-jar skincare shot, the current author emits a thin *"Static locked-off
frame with a very slow, smooth rightward orbit…"* that never names the product or its label. The desired
output restates the jar's fixed identity, specifies a precise orbit at constant focal length, and pushes
visual-defect suppression into a negative channel.

**Source:** [Veo 3.1 ultimate prompting guide](https://cloud.google.com/blog/products/ai-machine-learning/ultimate-prompting-guide-for-veo-3-1)
· [DeepMind Veo prompt guide](https://deepmind.google/models/veo/prompt-guide/). Structure re-verified
against the installed `@google/genai` types.

## 2. The mapping — how the desired output decomposes

| Desired-output element | Fix |
|---|---|
| "…jar remains stationary… preserve exact jar shape, pink label, logo, lettering, powder, props, colours, lighting" | **③** positive restate of fixed identity |
| "very slow, smooth 15° orbit… maintaining height, distance, framing, focal length" | **②** precise camera vocabulary |
| "no floating objects, no changing text, no label deformation, no change in powder" | **①** Veo `negativePrompt` field |
| "No zoom, no push-in, no tilt, no object rotation" | **②** — made *implicit* by the precise positive clause (constant focal length ⇒ no zoom) |

## 3. Decisions

- **Go preservation-first, remove the conflicting caps** (user call, 2026-07-26). The word cap and the
  absolute "don't re-describe" rule are removed; the author restates the *fixed, preservation-critical
  identity*. This applies to the shared **text-camera** variant, so **Sora inherits it too** (it benefits
  equally; splitting Sora into its own variant is YAGNI).
- **Negatives live in Veo's `negativePrompt`, not the positive prompt** (§7). Motion negatives are carried
  implicitly by precise positive camera prose; visual-artifact/preservation negatives go in the field.
- **Veo's built-in prompt rewriter stays ON** (`enhancePrompt` left at its default; §8). We do **not** set
  `enhancePrompt: false`. Recorded as a known lever, not a change.
- **Extract a pure `buildVeoConfig`** so `negativePrompt` threading is unit-testable (mirrors Kling's
  `buildKlingRequestBody`).

## 4. Fix ① — Veo `negativePrompt` (Video Gen node)

**Param.** Add to `veoParams` ([params/veo.ts](../../../src/lib/video-gen/params/veo.ts)), mirroring Kling's
shape ([params/kling.ts:121](../../../src/lib/video-gen/params/kling.ts#L121)):

```ts
{
  name: "negative_prompt",
  label: "Negative Prompt",
  component: "textarea",
  group: "advanced",
  order: 0,
  visible: true,
  defaultValue: VEO_NEGATIVE_DEFAULT,
  constraints: { type: "textarea", maxLength: 2500 }, // same shape as Kling's negative_prompt
}
```

**Product-tuned default — deliberately different from Kling's.** Kling's list includes bare `text`, `logo`,
`watermark`; for a product shot the label's real text and logo must be **preserved**, so blanket `text`/`logo`
negatives would fight the goal. Proposed Veo default:

> `blurry, low quality, distorted, deformed, morphing, warped label, label deformation, text distortion, changing text, flickering, jitter, floating objects, extra objects, duplicated product, watermark`

Prefilled and fully editable; tunable later from eval results (a data change, not architecture).

**Provider threading.** Extract `buildVeoConfig(input)` (pure) from `generateWithVeo`
([providers/veo.ts:35](../../../src/lib/video-gen/providers/veo.ts#L35)); read the value the same way the
existing params are read, and add it to the config (SDK field is **camelCase** `negativePrompt`, unlike
Kling's snake_case):

```ts
const negativePrompt = String(input.params.negative_prompt ?? "").trim();
// …in the returned config:
...(negativePrompt ? { negativePrompt } : {}),
```

No new input plumbing: params already flow via `VideoGenInput.params` (that's how `duration`/`aspect_ratio`
reach the provider today).

## 5. Fix ② — precise camera vocabulary ([video-controls.ts](../../../src/lib/nodes/video-controls.ts))

Rewrite each camera option's `prose` to name invariants. Proposed:

| Option | New prose |
|---|---|
| static | `a locked-off static frame with no camera movement` |
| push-in | `a slow, steady push-in toward the subject at a constant focal length` |
| pull-back | `a smooth pull-back revealing the surrounding scene at a constant focal length` |
| orbit | `a slow, small-angle orbit around the subject, holding constant distance, height, and focal length` |
| tracking | `a smooth lateral tracking move alongside the subject at constant distance and focal length` |
| pan | `a steady horizontal pan across the frame from a fixed camera position` |
| tilt | `a deliberate vertical tilt from a fixed camera position` |
| handheld | `subtle handheld texture while otherwise holding the framing` |
| crane | `a slow rising crane move, keeping the subject centered` |

Naming "constant focal length / distance" is what makes "no zoom / no push-in" implicit — so those negations
never need to appear as bare "no X" text. Exact wording is refinable from eval results (data, not architecture).

## 6. Fix ③ — preservation-first author ([video-prompt-generate.ts](../../../src/prompts/video-prompt-generate.ts))

Rewrite the **text-camera** variant (`videoPromptGeneratePrompt`), bumping `version` **2 → 3** for eval
provenance. Changes:

- **Remove the `40–90 words` cap.** Replace with: *"Be as detailed as the shot needs to fully specify the
  motion and preserve the subject — prefer completeness over brevity, but do not pad with filler."*
- **Replace "DO NOT re-describe the scene"** with a preservation rule: *"Restate the fixed,
  preservation-critical identity that must not change — product shape, label text, logo, lettering, colours,
  prop positions, and lighting — and instruct that these be held exactly. Do not invent new objects, people,
  settings, or styles that are not in the frame, and do not pad with generic scene description."*
- **Keep** the camera-first clause ordering, the precise-camera expectation, the multi-image handling, and
  the **hype-word hygiene** (`cinematic masterpiece / ultra realistic / 8K / stunning / beautiful` stay
  banned — this is unchanged and orthogonal).

The **Kling** variant (`videoPromptGenerateKlingPrompt`) is **untouched** — it stays camera-silent and
sequential.

## 7. The negatives rule (clean division)

- **Motion / camera negatives** ("no zoom, no push-in, no tilt, no object rotation") → carried *implicitly*
  by ②'s precise positive camera clause. Never written as bare negations.
- **Visual-artifact / preservation negatives** ("morphing, warped label, text distortion, floating objects,
  changing powder") → ①'s `negativePrompt` field.
- **Never** bolt "No X, no Y" onto the positive prompt (the Veo anti-pattern the desired-output draft
  currently commits).

## 8. Prompt rewriter stays on (`enhancePrompt`)

`GenerateVideosConfig.enhancePrompt`
([node.d.ts:5169](../../../node_modules/@google/genai/dist/node/node.d.ts) — *"Whether to use the prompt
rewriting logic"*) is Veo's built-in rewriter. Per the user's call, we **leave it enabled** (do not pass
`enhancePrompt: false`); `buildVeoConfig` does not set the field.

**Known trade-off / risk (recorded, not fixed):** with the rewriter on, Veo may re-expand or reword our
detailed preservation prompt before generating, which can dilute the exact identity restatement. If
manual QA shows preservation slipping, the **first lever to try is `enhancePrompt: false`** — a one-line
change in `buildVeoConfig`, at which point exposing it as a param may be warranted.

## 9. What each node shows, by provider (delta from D77)

| Provider | Video Prompt node | Video Gen node |
|---|---|---|
| **Veo / Sora** | camera grid (→ precise text clause) + Target selector | **+ `negative_prompt` (advanced, prefilled)** |
| **Kling** | Target selector + camera breadcrumb | curated camera grid + Fine-tune + `negative_prompt` (unchanged) |

Only the Veo/Sora Video Gen node changes: it gains the prefilled `negative_prompt`. The rest of the D77
layout is unchanged.

## 10. Components (touch-points)

| File | Change |
|---|---|
| `src/lib/video-gen/params/veo.ts` | add `negative_prompt` param (advanced) + `VEO_NEGATIVE_DEFAULT` constant |
| `src/lib/video-gen/providers/veo.ts` | extract pure `buildVeoConfig`; thread `negativePrompt`; leave `enhancePrompt` unset |
| `src/lib/nodes/video-controls.ts` | rewrite camera-option `prose` to name invariants (§5) |
| `src/prompts/video-prompt-generate.ts` | text-camera variant: drop word cap, add preservation rule, `version` 2→3 |
| `docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md` | append ADR **D78** to §7 |

No changes to the Video Prompt route, `compileVideoPrompt`, `renderVideoControls` signatures, canvas store,
node data types, or the Kling path.

## 11. Tests (written first)

- **`veo-params.test.ts`** *(new, mirror `kling-params.test.ts`)*: `negative_prompt` exists in the advanced
  group with `component: "textarea"`; its default contains `warped label` and `text distortion` and
  **excludes** bare `text`/`logo` (the product-preservation distinction).
- **`veo-provider.test.ts`** *(new, mirror `kling-provider.test.ts`)*: `buildVeoConfig` includes
  `negativePrompt` when the param is non-empty and **omits** it when empty/whitespace; it never sets
  `enhancePrompt`; `durationSeconds`/`aspectRatio` still resolve as today.
- **`video-prompt-generate.test.ts`** *(extend)*: text-camera variant `version === 3`; contains the
  preservation instruction; **no** "40–90 words" text; retains the hype-word hygiene; the Kling variant is
  byte-for-byte unchanged.
- **`video-controls.test.ts`** *(extend)*: camera option prose includes the invariant phrasing (e.g. orbit
  prose contains "constant" and "focal length").
- UI is markup — verified by `tsc` + `eslint` + manual QA (the suite has no jsdom/RTL).

## 12. Scope cuts / non-goals

- **OpenAI → Gemini author swap** — descoped. The best-practice miss is prompt *content*, not vendor; the
  author stays `gpt-5.4-mini`.
- **`enhancePrompt: false`** — not applied (§8); recorded as the first QA lever.
- **`resolution` / `generateAudio` / `fps` / `seed` params** — descoped.
- **No new node types**; the D24 diamond topology is unchanged.
- **Kling path untouched.**

## 13. ADR — D78 (refines D24 + D77)

**Decision.** The **Veo** motion-prompt path is **preservation-first**. The author restates the fixed
subject identity (product shape, label, logo, lettering, colours, props, lighting) with no word cap; the
camera catalog uses precise, invariant-naming vocabulary; visual-defect suppression is driven by Veo's
native **`negativePrompt`** param with a product-tuned default; and bare "No X, no Y" negations are kept out
of the positive prompt. Veo's built-in prompt rewriter (`enhancePrompt`) is left **enabled**.

**Why.** D24 shipped a terse, Veo-only author when brevity matched a single generic target. Google's own
Veo 3.1 guidance — "more detail, more control," a dedicated negative-prompt field, and specific camera
vocabulary — are real quality levers the terse path can't reach, and they matter most for branded-product
preservation.

**Rejected — negatives-only (leave the author lean, push everything into `negativePrompt`).** Cheapest, but
the positive prompt still never says "hold the label," so preservation-critical identity goes unstated.

**Rejected — intent-driven preservation *mode* (a per-node toggle).** More flexible but adds machinery for a
distinction the author can already make implicitly (restate the *fixed* identity — dynamic scenes have
little fixed identity to hold, so they naturally restate less).

**Rejected — `enhancePrompt: false` now.** Would honor our exact wording, but the user chose to keep Veo's
rewriter on; recorded as the first lever if QA shows preservation slipping.

**Refines.** D24 (motion-prompt shape) and D77 (provider-aware pair); the D77 Kling path is unchanged.

## 14. Verification

- New pure tests green (`veo-params`, `veo-provider`, extended prompt/controls tests); `tsc` + `eslint`
  clean; existing suites unbroken.
- Manual (Veo, amber-jar shot): Target = Veo → prompt output **names and preserves** the jar's fixed
  identity and reads with a precise camera clause (constant focal length) → Video Gen node shows the
  prefilled `negative_prompt` → generated request (frozen provenance) carries `negativePrompt` and the model
  honors the preservation.
- Manual (Kling): unchanged from D77.
- Design-system: `negative_prompt` renders as the standard advanced textarea; no new controls.

### Open risks

- **Prompt-rewriter dilution (§8).** With `enhancePrompt` on, Veo may reword the preservation prompt.
  Primary mitigation is a QA check on identity fidelity; the fallback lever is `enhancePrompt: false`.
- **`buildVeoConfig` extraction** must preserve today's exact behavior for `durationSeconds` clamping and the
  `referenceImages`-vs-`startFrame` mutual exclusion — the refactor is behavior-preserving; assert it in the
  provider test.
- **Shared text-camera variant** now makes Sora prompts verbose too; acceptable, but worth a glance in Sora
  QA that the longer prompt doesn't regress its output.
