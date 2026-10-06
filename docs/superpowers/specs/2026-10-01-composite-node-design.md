# The Composite node — design

**Date:** 2026-10-01 · **Rewritten:** 2026-10-06 (after the avatar work, D287–D299, landed on
staging) · **Branch:** `worktree-composite-node` · **Spec C** of the UGC avatar work · **ADR:** D309

**Read first:** `2026-09-22-seedream-seedance-handoff.md` §0.2 (the design) and §0.3 (the specs),
and D298/D299 in the ADR log (the Avatar node and how its face reaches a shot). This spec does not
restate them.

## Problem

A UGC shot needs a picture of **the avatar, in a setting, often with the product** — and often a
picture of the setting alone, from several angles, to place the avatar into afterwards. The
operator's reference examples (2026-10-06) are all of this kind:

| Example | What it is |
|---|---|
| An open-plan office, four angles in a 2×2 sheet, extras at desks | a **location sheet** — no avatar, no product |
| The same office with the avatar placed in it, four angles | a **composite sheet** — built from the location sheet's own frames |
| A bedroom, four angles, warm late-day light, empty | a **location sheet** made from text alone |

These belong to a shot, not to the avatar — the next shot wants a different room and product.
Today the only way to make them is a Prompt node feeding an Image Gen node, with every asset wired
to both. The operator wants **one place to do it all at once.**

## Goal

One node. The avatar, background and product references in — all optional — **an instruction
typed on the node itself** that says what each reference is for and, when wanted, the camera,
lighting and composition. One image out: a single frame or a multi-angle sheet, whichever the
instruction asks for.

## Non-goals

- **Changing the Image Gen node.** It stays exactly as it is.
- **Changing the Avatar node or D299's presenter path.** The composite reads the avatar; it does
  not change how a script's presenter reaches a shot.
- **UGC motion prompts** — spec D.
- **A layout control.** Sheet versus single image is the instruction's call (§4).

## Decisions taken

| Decision | When |
|---|---|
| Composites are not avatar data — they belong to a shot | 2026-09-28 |
| Its own node, not the Image Gen lane; the prompt is typed on the node | 2026-09-28 |
| ~~Its prompt must not style the image~~ — **withdrawn**: the node adds no styling of its own, and carries whatever styling the operator types | 2026-10-06 |
| References are given roles by **@-mentions in the instruction**, not role slots (as D281 chose) | 2026-10-06 |
| Single image or sheet is decided **by the instruction**; no layout control | 2026-10-06 |
| All references are optional — a background from text alone is a valid composite | 2026-10-06 |
| The **Avatar node is a direct input** (`avatar → composite`) | 2026-10-06 |
| With an avatar wired, the model is **locked to the Seedance face model** | 2026-10-06 |
| Fixed preamble; **no LLM pass** over the instruction | 2026-10-06 |

## 1. The node

```ts
export type CompositeNodeData = {
  title?: string;
  /** The operator's instruction, typed here, stored with `@[Label](nodeId)` chips (D272). */
  instruction?: string;
  /** Seedream by default; locked to SEEDANCE_FACE_MODEL_ID while an avatar is wired (§5). */
  modelId?: string;
  params?: Record<string, unknown>;
  /** D19: the active version's output (an image URL) — display only, never persisted. */
  parsed?: unknown;
};
```

Registration mirrors every other node type:

| File | Change |
|---|---|
| `src/lib/canvas-nodes.ts` | `CompositeNodeData`, the `CanvasNode` union member, `VALID_CONNECTIONS` (§2) |
| `src/lib/canvas-node-options.ts` | `AddNodeType` + `ADD_NODE_OPTIONS` — label **Composite**, mnemonic **C** (free; `G` is the Gallery drawer, D137) |
| `src/components/canvas/canvas.tsx` | the `nodeTypes` map |
| `src/components/nodes/composite-node.tsx` | the card |
| `src/components/nodes/composite-focus-view.tsx` | the focus view (below) |
| `src/lib/canvas-store.ts` | node creation defaults |
| `src/lib/nodes/node-output.ts` | `case "composite"` → the active version's image URL, exactly as `image-gen` |
| `src/app/api/nodes/[id]/composite-generate/route.ts` | §3 |

**Focus view.** The Image Gen focus view's shell and headings (reuse, don't reinvent), minus the
prompt lane:

- the connected references, the avatar among them, shown as one entry under its name;
- the **Instruction** field — `MentionInstructionEditor`, the same component as Multishot's
  Direction (`multishot-prompt-focus-view.tsx`), with a placeholder showing a background typed
  rather than wired: *"@Riya at her desk holding @Sandals, in a bright open-plan office. A 2×2
  sheet, four angles, warm window light."*;
- the model picker (§5);
- Generate, and the version strip.

Every control is a shadcn primitive from `src/components/ui/*`.

**Nothing is mandatory; everything wired is mentionable.** The operator may wire any mix of
avatar, background and product — or none, and type the whole picture. Whatever *is* wired must be
offered by `@`. The editor's default menu offers only `image-gen`, `draw` and `file` upstreams
(`mention-instruction-editor.tsx`), so an Avatar or an upstream Composite would be wired but
never offered. The focus view therefore passes the editor's existing `mentionables` prop, built
from **every wired reference**: files and draws, Image Gen and Composite outputs, and the avatar
as *"Avatar: {name}"* with its front image as the chip's thumbnail. The editor itself is not
changed. A wired reference the operator never mentions is still sent, labelled, so an unchipped
image is not silently dropped.

## 2. Connections

```ts
avatar:      ["script", "composite"],                    // D298 had ["script"] only — see D309
file:        [... , "composite"],
draw:        [... , "composite"],
"image-gen": [... , "composite"],
composite:   ["prompt", "video-gen", "video-prompt", "multishot-prompt", "shot", "post", "composite"],
```

**Rationale.** A composite is a reference image, so its outputs are Image Gen's outputs, exactly.
`composite → composite` is the operator's own flow: a location sheet made first, then used as the
background of an avatar composite. `avatar → composite` is what D298 rejected for Image Gen and
Video Gen ("a second path through every rule"); here it is the point — the wire says *this
picture contains this person* (handoff §0.2). D309 records it.

## 3. Generation

**`api/nodes/[id]/image-generate/route.ts` is the template, not the route.** It already does:
resolve upstream images → `validateReferenceImages` → `insertGeneration` →
`estimateImageGenerationCostUsd` → `reserveCredits` → `config.generate(...)` → `uploadImageGen` →
`insertVersion` + `setActiveVersion` → `settleGeneration` + `succeedGeneration`, with a failure
path that records a version, fails the generation and refunds.

A composite route differs in three places:

1. **The prompt** is built from `node.data.instruction` (§4), not a connected Prompt node.
2. **An avatar input becomes virtual File rows** — the D299 pattern (`presenterUpstreamRow`,
   `src/lib/avatars/presenter.ts`), reached by a real edge instead of the walk from a shot to its
   script. The avatar is read live by id (D298); archived avatars still resolve (D287).
3. **The model is enforced server-side** when an avatar is wired (§5) — the picker's lock is a
   convenience, not the guard.

Provider registry, cost, credits, storage and versions are reused unchanged.

### 3.1 The avatar's images

An avatar contributes its **front image**, and its **profile sheet** when there is one and it is
not stale (`sheetStale`, D288/D295). Both are the same person, so they are labelled as one:
*"Reference images 1–2 (Riya, the avatar): the same person — take only their face, hair, build
and clothing, never the images' background, lighting or framing."*

**This needs one change in shared code.** Today one upstream node yields one image, and a chip
`@[Label](nodeId)` resolves to one `reference image N` (`refEntriesOf`, `resolveRefMentions` in
`src/lib/nodes/ref-binding.ts`). An avatar node yields up to two. The roster must let one node id
own a run of images so that `@Riya` resolves to *"reference images 1–2 (Riya)"*. The change is
additive — every existing node still yields one image and resolves exactly as today — and is
covered by `ref-binding.test.ts`.

## 4. The prompt

What the image model receives, in order:

1. each reference image, labelled `Reference image N (name):` — the avatar's as one run (§3.1);
2. the operator's instruction with its chips resolved to those labels (`resolveRefMentions`);
3. a fixed rule block — a constant in `src/prompts/composite-generate.ts`.

**The rule block holds only what is always true:**

- **The person is unaltered** — face, build, hair and wardrobe of the avatar's images, varied
  only in angle, pose, framing and setting. *Present only when an avatar is wired*, so a
  background photo with people in it (the office sheet) is not over-protected.
- **The product is unchanged** — shape, proportions, colour, lettering, logo; **no text, logo or
  branding it does not already carry**. A 2026-09-24 probe had Seedance invent lettering on a
  shoe specified "no text, no logo"; a prompt silent on preservation puts hallucinated branding on
  the client's product.
- **One photograph** — the combined elements share one light and one perspective.
- **Transcribe, never complete** — the setting is what the instruction or a reference states;
  nothing is added that neither states.
- **A sheet is one place** — when the instruction asks for several panels or angles, every panel
  shows the same place, in the same light, at the same time of day.
- **No styling of its own** — no lens, lighting recipe, film stock or grade unless the
  instruction asks for one.

**Camera, lighting and composition come only from the operator's words.** The rule block never
adds them and never forbids them.

**No LLM pass.** The instruction already is the brief; a rewrite risks losing the operator's
wording, costs a text call, and makes the result less predictable. Revisit only if real output
from terse instructions is poor — it would then be a new prompt record in the handoff's inventory.

**D281 downstream.** A composite feeding a Multishot or Motion Prompt is, by D281, identity-only
unless the Direction names it as the source of the look. For a location or composite sheet that is
usually what the operator wants named — the writer is told so in the Direction, not by this node.

## 5. The model

| Wired | Model |
|---|---|
| an avatar | **`SEEDANCE_FACE_MODEL_ID`** (`src/lib/avatars/constants.ts`), locked. The picker shows it with one line: *"Made with Seedream so Seedance and Gemini Omni accept it."* |
| no avatar | the picker is free; the default is the same Seedream model |

**Why locked.** A composite is a new picture of the avatar's face, and Seedance accepts a face
only from that model (D290; `AVATAR_WORKS_WITH.seedream` covers Seedance, Gemini Omni, Kling and
Veo). A composite drawn by another model would be a face Seedance may refuse. The constant is
imported, never restated, so a change to the avatar's face model moves the composite with it.

**Real-person avatars** (an uploaded front, D289) run on Gemini Omni and Kling only
(`AVATAR_WORKS_WITH.real`). The lock costs them nothing and keeps one route.

**Server-side.** The route rejects a request whose `modelId` differs from the lock while an avatar
is wired — a stale client or a copilot call must not slip a different model through.

Seedream Lite takes up to 14 references (`client-models.ts`) — `validateReferenceImages` enforces
it as for Image Gen.

## 6. Output, versions, cost

Identical to Image Gen. The bytes are uploaded with `uploadImageGen`; the URL is the version's
`output`; `node-output.ts` returns it downstream. `paramsUsed` carries `modelId`, the validated
params, `tokensUsed`, dimensions, `fileSizeBytes` — plus the avatar's id when one was wired, so a
version records whose face it used. Cost is `estimateImageGenerationCostUsd` / `computeImageCost`;
Seedream is priced per image (`SEEDREAM_IMAGE_PRICE_TABLE`), Nano Banana by tokens. No new tables.

## 7. Errors

The image-generate failure path is reused verbatim. Refused **before `insertGeneration`**, so
nothing is reserved:

| Case | Message intent |
|---|---|
| No instruction | say what to make |
| A chip names a reference that is no longer connected | name it — `ref-binding`'s missing handling |
| An avatar with no front image | the avatar isn't ready; finish it in the Studio |
| A model other than the lock while an avatar is wired | §5 |

**No references is not an error** — a background sheet from text alone is a valid composite.

## 8. Testing

| Test | Covers |
|---|---|
| `canvas-nodes.test.ts` | `canConnect` for every new edge, and that `avatar` still reaches nothing else |
| `canvas-node-options.test.ts` | `C` is unique and resolves to `composite` |
| `node-output.test.ts` | `case "composite"` returns the active version's URL |
| composite mentionables test | every wired input — file, draw, image-gen, composite, avatar — is offered by `@`; the avatar reads "Avatar: {name}" with its front as thumbnail |
| `ref-binding.test.ts` | one node owning two images resolves to "reference images 1–2 (name)"; single-image nodes unchanged |
| `composite-generate` prompt test | the rule block holds both preservation rules and the sheet rule; the person rule appears only with an avatar; it adds no lens, lighting or grade terms |
| route test (mirrors `image-generate`'s) | refuses with no instruction, a dangling chip, an avatar with no front, or the wrong model under the lock; generates with zero references; sends the avatar's front + fresh sheet and skips a stale sheet; reserves then settles; refunds on provider failure |

## 9. Interactions to know about

- **D299's presenter switch.** A composite feeding a Prompt or Multishot Prompt whose shot has the
  presenter "in this shot" means the writer sees the face twice: the presenter's front image as
  identity, the composite as a picture of the same person. That is consistent — both say the same
  person — and nothing is changed here; worth watching in real output.
- **Avatar edits after the fact.** The avatar is always the latest (D287), so regenerating an old
  composite uses the avatar as it is now. The version's recorded avatar id says whose face, not
  which revision — the same trade D287 already accepted.
