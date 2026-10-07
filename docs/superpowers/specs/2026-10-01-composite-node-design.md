# The Composite node — design

**Date:** 2026-10-01 · **Rewritten:** 2026-10-06 (after the avatar work, D287–D299, landed on
staging) · **Branch:** `worktree-composite-node` · **Spec C** of the UGC avatar work · **ADR:** D312

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
| ~~With an avatar wired, the model is locked to the Seedance face model~~ — **withdrawn**: Seedream by default, other models selectable, the picker says where each can go (§5) | 2026-10-07 |
| The prompt places people into scenes and, unless the instruction names a camera, frames for a UGC clip's reference (§4) | 2026-10-07 |
| Edit, as Image Gen's typed edit, on the composite's current version (§5.1) | 2026-10-07 |
| Fixed preamble; **no LLM pass** over the instruction | 2026-10-06 |

## 1. The node

```ts
export type CompositeNodeData = {
  title?: string;
  /** The operator's instruction, typed here, stored with `@[Label](nodeId)` chips (D272). */
  instruction?: string;
  /** Seedream by default; the operator may choose another (§5). */
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
avatar:      ["script", "composite"],                    // D298 had ["script"] only — see D312
file:        [... , "composite"],
draw:        [... , "composite"],
"image-gen": [... , "composite"],
composite:   ["prompt", "video-gen", "video-prompt", "multishot-prompt", "shot", "post", "composite"],
```

**Rationale.** A composite is a reference image, so its outputs are Image Gen's outputs, exactly.
`composite → composite` is the operator's own flow: a location sheet made first, then used as the
background of an avatar composite. `avatar → composite` is what D298 rejected for Image Gen and
Video Gen ("a second path through every rule"); here it is the point — the wire says *this
picture contains this person* (handoff §0.2). D312 records it.

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
3. **Edit** (§5.1) takes the composite's current version as image 1.

Provider registry, cost, credits, storage and versions are reused unchanged.

### 3.1 The avatar's images

An avatar contributes its **front image**, and its **profile sheet** when there is one and it is
not stale (`sheetStale`, D288/D295) — **as D308 already does for a shot**: the loader replaces the
avatar's row with `presenterUpstreamRows` (`src/lib/avatars/presenter.ts`), so the front travels
under the Avatar node's id and the sheet under `avatarSheetId` (`"<id>:sheet"`), each its own entry
and its own chip ("Riya", "Riya sheet"), identity only. One convention for an avatar's images
across shots and composites; no change to shared `ref-binding.ts`. The roster is the composite's
own module, `src/lib/composite/references.ts`.

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

**Placing a person into a scene** (only with an avatar wired, added 2026-10-07 after the first
real composite pasted the avatar in at portrait scale): realistic scale on real surfaces at the
camera's eye level; the scene's own light with contact shadows; a pose inside the space, never the
portrait's crop or studio framing; no cut-out edges, halo or pasted-on look.

**Default framing.** The composite is a UGC clip's reference, so unless the instruction sets the
camera or framing it is framed like a still from an eye-level phone video: the person facing the
camera, face and hands clearly visible, the room readable around them. The instruction's camera
and framing always win. The rule block adds no lens effects, lighting setups or colour treatment.

**No LLM pass.** The instruction already is the brief; a rewrite risks losing the operator's
wording, costs a text call, and makes the result less predictable. Revisit only if real output
from terse instructions is poor — it would then be a new prompt record in the handoff's inventory.

**D281 downstream.** A composite feeding a Multishot or Motion Prompt is, by D281, identity-only
unless the Direction names it as the source of the look. For a location or composite sheet that is
usually what the operator wants named — the writer is told so in the Direction, not by this node.

## 5. The model

**Seedream 5.0 Lite by default** (`COMPOSITE_DEFAULT_MODEL_ID` = `SEEDANCE_FACE_MODEL_ID`), every
image model selectable. With an avatar wired, the picker says where the composite's face can go,
from the avatar's own `imageModelWorksWith` (never a restated list):

| Model | Note under the picker |
|---|---|
| Seedream | *Works with Seedance, Gemini Omni, Kling and Veo.* |
| any other (Nano Banana, GPT Image) | *Works with Gemini Omni, Kling and Veo — not Seedance.* |

No avatar, no note. The first build locked the model with an avatar wired; withdrawn 2026-10-07 —
a clip bound for Gemini Omni need not pay Seedream's constraints.

### 5.1 Edit

A switch, *Edit this picture*, appears once the composite has a version. It swaps the instruction
for Image Gen's edit panel — the Remove / Replace product / Add product / Modify chips, a mention
instruction, the references to tick and the editable final prompt. Typed edits only (Seedream and
Nano Banana take no mask).

- **Base** — the composite's current version, sent as image 1; the route refuses a version that
  is not this node's.
- **References** — the ticked inputs plus any the instruction mentions, numbered from image 2.
- **Prompt** — Image Gen's per-intent template plus the composite's preservation rules (the
  person when an avatar is wired, the product, no cut-out look). The panel previews it with the
  route's own builder and sends it only when hand-edited, so the server's numbering always wins.
- Through `composite-generate` (`edit` in the body), sharing `runCompositeGeneration`.

## 6. Output, versions, cost

Identical to Image Gen. The bytes are uploaded with `uploadImageGen`; the URL is the version's
`output`; `node-output.ts` returns it downstream. `paramsUsed` carries `modelId`, the validated
params, `tokensUsed`, dimensions, `fileSizeBytes`; `inputsUsed` records `avatarIds`, the prompt id
(`composite-generate-v1`), the instruction and the exact prompt sent. Cost is `estimateImageGenerationCostUsd` / `computeImageCost`;
Seedream is priced per image (`SEEDREAM_IMAGE_PRICE_TABLE`), Nano Banana by tokens. No new tables.

## 7. Errors

The image-generate failure path is reused verbatim. Refused **before `insertGeneration`**, so
nothing is reserved:

| Case | Message intent |
|---|---|
| No instruction | say what to make |
| A chip names a reference that is no longer connected | name it — `ref-binding`'s missing handling |
| An avatar with no front image | the avatar isn't ready; finish it in the Studio |

**No references is not an error** — a background sheet from text alone is a valid composite.

## 8. Testing

| Test | Covers |
|---|---|
| `canvas-nodes.test.ts` | `canConnect` for every new edge, and that `avatar` still reaches nothing else |
| `canvas-node-options.test.ts` | `C` is unique and resolves to `composite` |
| `node-output.test.ts` | `case "composite"` returns the active version's URL |
| composite mentionables test | every wired input — file, draw, image-gen, composite, avatar — is offered by `@`; the avatar reads "Avatar: {name}" with its front as thumbnail |
| `composite/references.test.ts` | the avatar's front and fresh sheet are entries 1 and 2 under D308's ids; a stale sheet is skipped and later numbering holds; chips resolve to "Name (image N)" |
| `image-node-types.test.ts` | a composite counts as a generated image for every downstream reader; a composite is never auto-promoted to start frame |
| `composite-generate` prompt test | the rule block holds both preservation rules and the sheet rule; the person rule appears only with an avatar; it adds no lens, lighting or grade terms |
| route test (mirrors `image-generate`'s) | refuses with no instruction, a dangling chip or an avatar with no front; allows any model with an avatar wired; edits base-first with ticked and mentioned references, refuses another node's version; generates with zero references; sends the avatar's front + fresh sheet and skips a stale sheet; reserves then settles; refunds on provider failure |

## 9. Interactions to know about

- **D299's presenter switch.** A composite feeding a Prompt or Multishot Prompt whose shot has the
  presenter "in this shot" means the writer sees the face twice: the presenter's front image as
  identity, the composite as a picture of the same person. That is consistent — both say the same
  person — and nothing is changed here; worth watching in real output.
- **Avatar edits after the fact.** The avatar is always the latest (D287), so regenerating an old
  composite uses the avatar as it is now. The version's recorded avatar id says whose face, not
  which revision — the same trade D287 already accepted.
