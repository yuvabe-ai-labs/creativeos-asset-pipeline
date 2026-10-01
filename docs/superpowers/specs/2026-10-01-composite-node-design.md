# The Composite node — design

**Date:** 2026-10-01 · **Branch:** `worktree-composite-node` · **Spec C** of the UGC avatar work.

**Read first:** the illustrated guide — https://claude.ai/artifact/5ZEEb4SWQp87e79aaPpayt — and
`2026-09-22-seedream-seedance-handoff.md` §0.2 (the design) and §0.3 (the six specs). This spec
does not restate the architecture.

## Problem

A UGC shot needs a picture of the avatar **with the product, in a setting**. That picture belongs
to *that shot* — the next one wants a different product and a different room — so it cannot live
on the avatar, which is a client-level record shared across reels.

Nothing today does "a few images plus a typed line → one image". The Image Gen lane can generate
it, but needs a **separate Prompt node** wired in and every asset wired to *both* it and the
generator. For an asset step that is more wiring than it is worth.

## Goal

One node. Image references in, **a prompt typed on the node itself**, one image out — reusing the
image-gen execution path and the already-shipped providers.

## Non-goals

- **The Avatar node** — spec B1. This spec assumes it exists and can be wired in.
- **UGC motion prompts** — spec D.
- **Changing the Image Gen node.** It stays exactly as it is.
- **Making a hero still.** A composite is a *reference*; see §4.

## Decisions already taken

| Decision | When |
|---|---|
| Composites are not avatar data — they belong to a shot | 2026-09-28 |
| Its own node, not the Image Gen lane | 2026-09-28 |
| The prompt is typed on the node, not a separate Prompt node | 2026-09-28 |
| Its prompt must **not** style the image (see §4) | 2026-09-30 |

## 1. The node

```ts
export type CompositeNodeData = {
  title?: string;
  /** The operator's line, typed here. There is no connected Prompt node. */
  instruction?: string;
  /** Defaults to Nano Banana; Seedream is also valid. */
  modelId?: string;
  params?: Record<string, unknown>;
  /** D19: the active version's output (an image URL) — display only, never persisted. */
  parsed?: unknown;
};
```

Registration mirrors every other node type — eight touchpoints, all of which `post` demonstrates:

| File | Change |
|---|---|
| `src/lib/canvas-nodes.ts` | `CompositeNodeData`, the `CanvasNode` union member, `VALID_CONNECTIONS` (§2) |
| `src/lib/canvas-node-options.ts` | `AddNodeType` + `ADD_NODE_OPTIONS` — label **Composite**, mnemonic **C** (free; `G` is reserved for the Gallery drawer, D137) |
| `src/components/canvas/canvas.tsx` | the `nodeTypes` map |
| `src/components/nodes/composite-node.tsx` | the card |
| `src/components/nodes/composite-focus-view.tsx` | the focus view: references, the instruction field, Generate, version history |
| `src/lib/canvas-store.ts` | node creation defaults |
| `src/lib/nodes/node-output.ts` | `case "composite"` → the active version's image URL, exactly as `image-gen` does |
| `src/app/api/nodes/[id]/composite-generate/route.ts` | §3 |

**UI.** The focus view is the Image Gen focus view minus the prompt lane: a list of connected
references with the avatar's model sheet among them, one multiline instruction field, a model
picker, Generate, and the version strip. Every control is a shadcn primitive from
`src/components/ui/*` — the instruction field is `Textarea`, not a raw `<textarea>`.

## 2. Connections

```ts
file:        [... , "composite"],
draw:        [... , "composite"],
"image-gen": [... , "composite"],
avatar:      [... , "composite"],      // added by B1
composite:   ["video-gen", "video-prompt", "multishot-prompt", "post"],
```

**Rationale.** A composite *is* a reference image, so it goes everywhere a reference image goes
and accepts everything an image lane accepts. The one new idea is `avatar → composite`, which is
what tells the lane this picture contains the person (handoff §0.2) — B1 owns the avatar side of
that edge; this spec owns the composite side.

## 3. Generation

**Reuse `api/nodes/[id]/image-generate/route.ts` as the template, not as the route.** It already
does: resolve upstream images → `validateReferenceImages` → `insertGeneration` →
`estimateImageGenerationCostUsd` → `reserveCredits` → `config.generate(...)` → `uploadImageGen` →
`insertVersion` + `setActiveVersion` → `settleGeneration` + `succeedGeneration`, with a failure
path that records a version, fails the generation and refunds.

A composite route differs in exactly one place: **where the prompt text comes from.** Image Gen
requires a connected Prompt node with output; a composite reads `node.data.instruction`.

Everything else — the provider registry, cost, credits, storage, versions — is reused unchanged.

**Open choice, §9.1:** whether the typed line goes to the image model directly behind a fixed
preamble, or through an LLM pass first.

## 4. The prompt

A composite is a **reference**, and D281's rule downstream says a reference's *"background,
backdrop, studio lighting, camera angle or framing"* is never carried into a beat. So styling a
composite is effort the video writer is instructed to discard — and worse, a styled reference can
bleed a grade into the clip.

The composite prompt therefore **keeps**:

- the subject and what they are doing with the product
- which element comes from which reference, and how they are spatially combined
- lighting and colour unified *across the combined elements* so it reads as one photograph
- the transcribe-the-setting rule: what is stated, never completed; a plain neutral backdrop when
  nothing states one
- brand rules — colours by name and hex, the casting descriptor verbatim, the never-use list

and **drops**, deliberately:

- any lens spec — focal length, aperture, depth of field
- any lighting recipe — "three-point softbox", "golden hour backlighting"
- style and medium — film stock, grain, colour grade
- the Shot-controls override (`prompt-generate.ts` honours a Shot controls block; a composite has
  no shot to take controls from)

It must also carry the preservation rule in both directions: **the product survives unchanged**
(shape, proportions, colour, lettering, logo) **and the person is not altered** — the face, build,
hair and wardrobe of the reference, varied only in angle, framing and setting.

> A probe on 2026-09-24 generated a shoe specified as *"no text, no logo"*, and by the third
> second Seedance had invented lettering on its side panel. A prompt silent on preservation puts
> hallucinated branding on the client's product.

## 5. Output and versions

Identical to Image Gen: the generated bytes are uploaded with `uploadImageGen`, the GCS URL
becomes the version's `output`, and `node-output.ts` returns that URL downstream. `paramsUsed`
carries `modelId`, the validated params, `tokensUsed`, dimensions and `fileSizeBytes`, as it does
today. No new storage, no new tables.

## 6. Cost

Reuse `estimateImageGenerationCostUsd` and `computeImageCost`. Both models are already priced:
Nano Banana token-based, Seedream per-image via `SEEDREAM_IMAGE_PRICE_TABLE` (shipped
2026-09-19). If §9.1 resolves to an LLM pass, its cost is a text call and is settled with the
generation, not separately.

## 7. Errors

Reuse the image-generate failure path verbatim — a failed attempt still records a version with
its error, fails the generation, and refunds the reservation. Two cases worth a specific message:

- **No references connected.** A composite with nothing to compose is an operator error, not a
  model failure: refuse before `insertGeneration`, so nothing is reserved.
- **No instruction.** Same — refuse before reserving.

## 8. Testing

| Test | Covers |
|---|---|
| `canvas-nodes.test.ts` | `canConnect` for every new edge, both directions |
| `canvas-node-options.test.ts` | the mnemonic is unique and resolves |
| `node-output.test.ts` | `case "composite"` returns the active version's URL |
| prompt unit test | the composite record contains the preservation rules and **does not** mention lens, aperture or grade |
| route test | mirrors `image-generate`'s: refuses with no references, refuses with no instruction, reserves then settles on success, refunds on provider failure |

## 9. Open

**9.1 — does the typed line need an LLM pass?** Two options:

| | Fixed preamble | LLM pass |
|---|---|---|
| How | the composite rules as a constant, plus the operator's line, straight to the image model | an LLM expands the line into a full composition brief first |
| Cost | one image call | one text call + one image call |
| Behaviour | deterministic | better with terse input |

**Recommendation: start with the fixed preamble.** The operator is already describing what they
want, and a composite is a utility asset, not a hero frame. Add the LLM pass only if real output
is poor — and if it is added, it becomes the eighth prompt record in the handoff's inventory.

**9.2 — the avatar edge.** `avatar → composite` is listed in §2, but the `avatar` node type does
not exist until B1. Either B1 lands first, or this spec ships with the file/draw/image-gen edges
and B1 adds its own.

## Prerequisites

- **B1 (the Avatar node)** for the `avatar → composite` edge only. Everything else in this spec
  stands alone and can be built and tested with File and Image Gen references.
- The Seedream provider is **already shipped** (`image-gen/providers/seedream.ts`) — but see the
  handoff's §0.3 warning: the shipped model id (`seedream-5-0-lite-260128`) is not the one our
  probes used (`seedream-5-0-260128`). That matters for B1, not for this spec, which defaults to
  Nano Banana.
