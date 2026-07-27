# Provider-aware Video Prompt → Video Gen (Kling `camera_control`)

**Date:** 2026-07-23
**Status:** Approved (design). Implementation pending (test-first).
**Type:** Architecture + frontend spec. Makes the Video Prompt → Video Gen pair
**provider-aware**: the motion prompt is shaped for its target model, and Kling's camera is
driven by its native `camera_control` API instead of a text clause.
**ADR:** **D77** (refines **D24**, which assumed a Veo-only motion-prompt shape).

---

## 1. Why

The Video Prompt node writes a single hardcoded **Veo 3.1** motion prompt
([video-prompt-generate.ts](../../../src/prompts/video-prompt-generate.ts) — *"You are a motion
director writing image-to-video prompts for Veo 3.1"*). But the Video Gen registry now targets
**ten models across three providers** ([client-models.ts](../../../src/lib/video-gen/client-models.ts))
— including **six Kling** variants. So a Veo-shaped prompt gets authored, then sent to a model
that wants a different shape.

Two concrete mismatches when the target is Kling:

1. **Camera is double-steered.** The prompt leads with a text camera clause ("Slow push-in.");
   Kling *also* exposes a native `camera_control` param
   ([providers/kling.ts:56](../../../src/lib/video-gen/providers/kling.ts#L56)). Today the six raw
   axis sliders default to 0, so by default the text clause silently drives Kling's camera — but
   the moment a slider moves, two camera signals compete. The sliders are also a poor affordance
   (`pan −10…10` with no visual feedback) for what is an inherently *visual* choice, and they
   violate the design system's "show-don't-tell" rule.
2. **No negative prompt.** Kling's `negative_prompt` field
   ([params/kling.ts:100](../../../src/lib/video-gen/params/kling.ts#L100)) is an empty textarea —
   a free quality lever left unused.

The prompt is also model-*blind*: the target model is only chosen one node downstream at
[video-generate/route.ts:30](../../../src/app/api/nodes/[id]/video-generate/route.ts#L30), and the
prompt is often authored before the Video Gen node even exists.

## 2. The camera-signal model — the core decision (Option B)

Camera is the **only** control that can live in two channels: as words in the prompt text, *and*
as Kling's numeric `camera_control` param. Everything else Kling-specific (`negative_prompt`,
`mode`, `cfg_scale`) is unambiguously a generation param.

We evaluated two ways to resolve the double-steer:

- **A — text-primary.** Kling reads camera from the prompt's text clause (today's default). One
  channel, one home, prompt node untouched; `camera_control` sliders stay as an optional override.
  Smallest change.
- **B — `camera_control`-primary (CHOSEN).** Kling's camera comes from the native param, driven by
  the visual move grid; the prompt is written **camera-silent** so the two never compete. More
  precise/deterministic, but it forces the prompt node to become provider-aware (to omit the camera
  sentence for Kling) and relocates the camera control between nodes by provider.

**Chosen: B.** The determinism of Kling's native camera path is worth the coordination cost, and it
lets the visual move grid — already built for the prompt node — drive a real API instead of prose.

**Key consequence:** because **Veo/Sora have no camera param** (camera is *only* expressible as text
for them), camera's home depends on the provider — text-camera providers keep it on the Prompt node;
Kling moves it to the Video Gen node.

## 3. Decisions (from the brainstorm)

- **D-source for provider-awareness — hybrid selector (§4).** The Prompt node gets its own **Target**
  selector, but it **locks to a connected downstream Video Gen node** when one exists, so the two can
  never silently disagree.
- **Prompt shape — two variants over one shared spine (§5).** `text-camera` (Veo, Sora) and
  `external-camera` (Kling). Kling's variant is camera-silent and uses sequential phrasing.
- **Camera → `camera_control` — curate per provider (§6, §10).** Kling's grid shows only moves it can
  natively hit; un-mappable moves are dropped, not faked.
- **Negative prompt — author a real default (§7).** A curated visual-defect list, prefilled and
  editable. (This is *distinct* from the positive-prompt hype-word hygiene, which stays for all
  providers — see §5.)

## 4. Target selector (Video Prompt node)

New node field: **`data.targetProvider`** (`"veo" | "kling" | "openai"`; default `"veo"`).

- Rendered as a 3-way chip group (Veo / Kling / Sora) in the compose column of
  [video-prompt-focus-view.tsx](../../../src/components/nodes/video-prompt-focus-view.tsx), using the
  existing `ParamChipGroup` (shadcn — Base UI).
- **Lock-to-downstream:** the focus view reads the node's **downstream** Video Gen node(s) from the
  canvas store. If exactly one exists, the selector **disables** and shows that node's provider —
  *"Kling · set by connected video node."* If two exist on **different** providers, it locks to
  **"Mixed — provider-neutral"** and the prompt uses the neutral (text-camera) shape.
- This is the one genuinely new piece of machinery: the Prompt node has never needed to read its
  *children* before. A canvas-store selector `downstreamOfType(nodeId, "video-gen")` backs it.

Provider → prompt-variant derivation: `kling → external-camera`; everything else → `text-camera`.
(Veo and Sora share the text-camera shape today; the selector stays provider-level so they can
diverge later without a data migration.)

## 5. Provider-aware prompt text

[video-prompt-generate.ts](../../../src/prompts/video-prompt-generate.ts) goes from one record to a
**shared spine + two deltas** (per the reuse rule in AGENTS.md — compose, don't duplicate). Each
variant keeps its own `id`/`version` for eval provenance.

**Shared spine (all providers):** the i2v core — describe how the still comes to life over ~8s;
do **not** re-describe subject/setting/style (the frame carries them); 40–90 words, one prose
paragraph; the hype-word hygiene (*don't write "cinematic masterpiece / ultra realistic / 8K /
stunning / beautiful"*) stays here.

**`text-camera` (Veo, Sora):** today's behavior — a standalone camera clause first, then action.

**`external-camera` (Kling):**
- **No camera sentence.** Camera is owned by `camera_control`; the prompt describes only the
  secondary motion already implied by the frame (steam drifts, fabric sways, light shifts).
- **Sequential phrasing** — encourage "first… then… finally" ordering (Kling rewards temporal
  structure).

`compileVideoPrompt` ([video-prompt.ts](../../../src/lib/nodes/video-prompt.ts)) takes the resolved
`targetProvider`, selects the variant, and — for `external-camera` — skips the camera-control clause.
`renderVideoControls` ([video-controls.ts](../../../src/lib/nodes/video-controls.ts)) becomes
provider-aware: it **emits the camera prose only for text-camera providers** (Speed prose is emitted
for all). The Prompt route
([video-prompt/route.ts](../../../src/app/api/nodes/[id]/video-prompt/route.ts)) reads
`data.targetProvider` and threads it into the compile call.

## 6. Camera on the Video Gen node (Kling)

When the selected model's provider is **Kling**, a curated visual camera grid renders in the params
panel ([video-gen-params-panel.tsx](../../../src/components/nodes/video-gen-params-panel.tsx)),
reusing `ShotTileStrip`/`CameraSelect`:

- **Tiles shown = Kling-mappable moves only** (§10). Selecting a tile writes the corresponding
  `camera_control`.
- The six raw axis controls survive as a collapsed **"Fine-tune"** expander beneath the grid — an
  axis-based tile pre-fills the sliders; the user can nudge. Not buried, just demoted from the
  primary affordance.
- **Veo/Sora show no camera grid here** — they have no camera param; their camera is the prompt's
  text clause.

## 7. Kling `negative_prompt` default

Change [params/kling.ts](../../../src/lib/video-gen/params/kling.ts) `negative_prompt.defaultValue`
from `""` to a curated visual-defect list — proposed starting value:

> `blurry, low quality, distorted, deformed, warped hands, extra fingers, morphing, flickering, jitter, text, watermark, logo`

Prefilled but fully editable; tunable later from eval results (a data change, not architecture).
This is **not** related to the §5 hype-word hygiene — that governs the *positive* prompt's wording;
this governs *output* artifacts Kling should suppress.

## 8. What each node shows, by provider

| Provider | Video Prompt node | Video Gen node |
|---|---|---|
| **Veo / Sora** | camera grid (→ text clause) + Target selector | no camera grid |
| **Kling** | Target selector + breadcrumb *"🎥 Camera — set on the connected video node"* | curated camera grid (→ `camera_control`) + Fine-tune expander + prefilled `negative_prompt` |

## 9. End-to-end data flow (Kling)

1. User sets **Target = Kling** on the Prompt node (or it locks to a connected Kling gen node).
2. Prompt node generates **camera-silent, sequential** motion text; the on-node camera grid is
   replaced by a breadcrumb.
3. On the Video Gen node (Kling model), the user picks a **camera move** on the curated grid →
   `camera_control` config (optionally fine-tuned).
4. Kling API receives: `image (start frame) + action-only prompt + camera_control + negative_prompt`.
   **One camera signal, no double-steer.**

## 10. Camera → `camera_control` mapping

Kling's `camera_control` is either a `simple` type with a single dominant axis
(`horizontal / vertical / pan / tilt / roll / zoom`) or a fixed preset `type`
(`down_back / forward_up / left_turn_forward / right_turn_forward`).
**Axis-naming gotcha (inverted from film):** Kling's `pan` is a *vertical-plane* rotation (what film
calls a **tilt**); Kling's `tilt` is a *horizontal-plane* rotation (what film calls a **pan**).
Rotations use Kling `pan`/`tilt`; lateral/vertical *translations* use Kling `horizontal`/`vertical`.
Exact sign/magnitude per tile is confirmed against the Kling API at plan time.

| Tile | Film move | Kling `camera_control` | In Kling grid? |
|---|---|---|---|
| Static | — | none (no motion) | ✅ |
| Push in | dolly/zoom in | `simple` · `zoom +` | ✅ |
| Pull back | dolly/zoom out | `simple` · `zoom −` | ✅ |
| Pan | horizontal rotation | `simple` · `tilt` (Kling's horizontal-plane rotation) | ✅ |
| Tilt | vertical rotation | `simple` · `pan` (Kling's vertical-plane rotation) | ✅ |
| Tracking | horizontal translation | `simple` · `horizontal` | ✅ |
| Crane | vertical translation | `simple` · `vertical +` | ✅ |
| **Orbit** | arc around subject | preset `type: left_turn_forward` (fixed; fine-tune axes disabled) | ✅ (approx.) |
| **Handheld** | jitter/texture | no primitive — **not shown for Kling** | ❌ |

**Implementation wrinkle:** Orbit uses a preset `type`, but `buildKlingRequestBody`
([providers/kling.ts:34](../../../src/lib/video-gen/providers/kling.ts#L34)) today only emits the
`customize` shape. Supporting Orbit requires it to emit a preset `type` (with no config). If that is
descoped in the plan, **Orbit drops from Kling's grid like Handheld** — no faked orbit.

A new pure module `src/lib/video-gen/kling-camera.ts` owns the tile→`camera_control` mapping and the
Kling-mappable tile list; it is unit-tested (like `camera-preview.ts`).

## 11. Components (touch-points)

| File | Change |
|---|---|
| `src/prompts/video-prompt-generate.ts` | one record → shared spine + `text-camera` / `external-camera` variants (versioned) |
| `src/lib/nodes/video-prompt.ts` | `compileVideoPrompt` takes `targetProvider`, selects variant, omits camera clause for Kling |
| `src/lib/nodes/video-controls.ts` | `renderVideoControls` emits camera prose only for text-camera providers |
| `src/app/api/nodes/[id]/video-prompt/route.ts` | read `data.targetProvider`, thread into compile |
| `src/components/nodes/video-prompt-focus-view.tsx` | Target selector + downstream-edge read + Kling camera breadcrumb |
| canvas store | selector `downstreamOfType(nodeId, "video-gen")` |
| node data types (`src/lib/canvas-nodes.ts`) | add `targetProvider` to video-prompt node data |
| `src/lib/video-gen/kling-camera.ts` *(new)* | tile→`camera_control` mapping + mappable tile list (pure, tested) |
| `src/components/nodes/video-gen-params-panel.tsx` | curated Kling camera grid + Fine-tune expander |
| `src/lib/video-gen/params/kling.ts` | `negative_prompt.defaultValue` = curated list |
| `src/lib/video-gen/providers/kling.ts` | `buildKlingRequestBody` emits preset `type` for Orbit (or Orbit descoped) |

## 12. Tests (written first)

- **`kling-camera.test.ts`** (pure): mappable tile list excludes Handheld; each mapped tile returns
  the exact `camera_control` shape (axis or preset); Static returns none; the film→Kling axis
  inversion is asserted (Pan → `horizontal`).
- **`video-prompt.test.ts`** (extend): `external-camera` compile omits the camera clause and any
  `controls.camera` prose; `text-camera` compile is byte-for-byte unchanged from today; Speed prose
  is present in both.
- **`video-prompt-generate.test.ts`** (extend): both variants exist with stable `id`/`version`; the
  Kling variant contains no camera-direction instruction; the hype-word hygiene is in the shared
  spine.
- **`kling-params.test.ts`** (extend): `negative_prompt` default is the curated list.
- UI (Target selector, downstream lock, gen-node camera grid) is markup — verified by `tsc` +
  `eslint` + manual QA (the suite has no jsdom/RTL).

## 13. Scope cuts / non-goals

- **Sora rides the text-camera path** — no Kling-style camera API; treated like Veo for prompt shape.
- **No eval-system changes.** Prompt variants keep the existing versioned-record discipline.
- **No new node types**; the diamond topology (D24) is unchanged.
- **Handheld** (and Orbit, if the preset-`type` work is descoped) are simply **not offered** for
  Kling — never faked.
- **The Fine-tune axis expander is retained**, not removed — this spec demotes it, it does not bury
  legitimate Kling controls.

## 14. ADR — D77 (refines D24)

**Decision.** The Video Prompt → Video Gen pair is **provider-aware**. The motion prompt is shaped
for its target provider (`text-camera` vs `external-camera`), resolved via a Target selector on the
Prompt node that **locks to the connected Video Gen node's provider** when present. For **Kling**,
camera is driven by the native **`camera_control`** param through a curated visual move grid on the
Video Gen node, and the prompt is written **camera-silent** — one camera signal, never two.

**Why.** D24 shipped a Veo-only motion prompt when Veo was the sole target; the registry has since
grown six Kling models with a different prompt shape and a native camera API. Deterministic Kling
camera + a proper `negative_prompt` are real quality levers the Veo-shaped path can't reach.

**Rejected — A (text-primary).** Simpler and single-node, but leaves Kling's camera to prose and the
`negative_prompt` unused; it optimizes for the smallest diff over the better Kling result.

**Refines.** D24 (motion-prompt shape), the D26 generation substrate (unchanged), the 2026-07-23
camera-visual-selectors spec (reuses its `ShotTileStrip`).

## 15. Verification

- New pure tests green; `tsc` + `eslint` clean; existing suites unbroken.
- Manual (Kling): Target=Kling → prompt output has **no camera sentence** and reads sequentially →
  gen node shows the curated camera grid (no Handheld) + Fine-tune + prefilled negative → generate
  sends `camera_control` (verified in the frozen request provenance) and the model honors the move.
- Manual (Veo): unchanged — camera grid on the Prompt node, text clause in the prompt, no gen-node
  camera grid, identical compiled output to today.
- Design-system: brand purple only on the active tile/chip; grid legible at focus-view width.

### Open risks

- **Downstream-edge read** is new for the Prompt node; confirm the canvas store exposes edges to the
  focus view cheaply (no extra fetch).
- **Kling preset `type` for Orbit** may not compose with `mode`/`duration` on every model — verify
  against the Kling API during the plan, and descope Orbit to a dropped tile if it doesn't hold.
