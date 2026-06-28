# Image Editing (targeted edits on an existing image) — Design

**Date:** 2026-06-28
**Status:** Design / spec (awaiting review → writing-plans)
**Author:** Cyril + Claude
**Relates to:** PRD §11.6 (Image Gen node), §12 (controls split), §13 (versioning), §4.4
(learn from every attempt); D18/D19/D20/D22; the eval flywheel
(`docs/evals/2026-06-14-eval-flywheel-rationale.md`).
**Grounded in:** Gemini image-editing docs —
https://ai.google.dev/gemini-api/docs/image-generation#image-editing-prompts

---

## 1. Problem

The most common real creative loop is **iterative, targeted edits on one image**: a
designer generates (or uploads) an image they mostly like, then wants to change *one thing*
while everything else stays pixel-faithful. Three concrete workflows:

1. **Replace a product** — get the whole shot right, then swap in the real product.
2. **Add a product** — take an existing/generated scene and place a product into it.
3. **Remove an element** — delete one object from a generated image.

Today CreativeOS can't express this well:

- There is **no place to type an edit instruction**. `ImageGenNodeData` is
  `{ title, modelId, params, parsed }` — no instruction field. The descriptive steer lives
  on the Prompt node (§12), which is the wrong surface for a one-off "remove the cup."
- An image attempt records *which* prompt produced it (`inputs_used.promptVersionId`) but
  **no freeform instruction of its own**, so the *intent* of a variation is never captured.

The capability is *almost* present: `generateWithGemini` already sends
`[...referenceImages, prompt]` ([gemini.ts](../../../src/lib/image-gen/providers/gemini.ts)),
and the route already wires connected File/Image-Gen/Draw images in as references
([image-generate/route.ts](../../../src/app/api/nodes/[id]/image-generate/route.ts)). The
gap is **workflow, prompt construction, and traceability**, not raw model capability.

## 2. Goals

- A designer can take an existing image (a generated attempt **or** an uploaded reference)
  and apply a targeted edit via a typed instruction, producing a **new attempt** that
  preserves everything else.
- Each variation is **fully traceable**: from any variation you can recover (a) the base
  prompt that seeded the image family, (b) the image it was derived from, and (c) the exact
  instruction that changed it.
- Reuse the existing version log / attempts / approval / eval surfaces — no new node type,
  no schema migration.

## 3. Non-goals

- **Masking / brush region selection.** Gemini does "semantic masking" via prose; we rely
  on text instructions only for v1. A pixel-mask UI is a future refinement.
- **A separate Image Edit node** (rejected — see §4).
- **Editing video frames.** Image only.
- **Re-sending the full base prompt to the edit model** (deliberately avoided — §6).
- Changing the Prompt node or the §12 controls split.

## 4. Core decision — an edit is a new *attempt* on the Image Gen node

An AI image edit **calls the model, costs tokens, and produces new bytes**, so by D18 ("a
version is created only when the model runs") it is a **generation attempt** — recorded with
`insertVersion(...)`, **never** the in-place `updateActiveVersionOutput` path (that is for
manual edits to an output, which is impossible for pixels).

That new attempt lives in the **existing Image Gen node's append-only version log**, *not* a
new node. Rationale (the versioning + eval architecture decides this):

| Constraint | Why same-node wins |
|---|---|
| **D19 single-source / D20 edit-at-source** | The active pointer stays "current best image"; downstream mirrors auto-follow. A separate node would orphan everything wired to the original until re-pointed. |
| **§8 no separate Generated/Output node** | A chain of edit nodes re-introduces exactly the output-node sprawl the PRD deleted. |
| **Eval flywheel** | The whole refinement journey is one queryable log (`v1 generate → v2 remove cup → v3 add product`); each edit's instruction is an explicit correction label. A separate node fragments the trace across nodes/edges. |
| **§11.6 attempts model** | "Generation attempts → set active → approve/reject per attempt" already exists; an edit is just another attempt. |

The image domain gets the eval **before/after signal for free**: each edit is a new row, so
the prior attempt's `output` is never overwritten (text needed the two-write trick in
[versions.ts](../../../src/lib/db/versions.ts) to keep the "before"; an image edit chain
preserves every "before" inherently).

## 5. Data model (no migration)

### 5.1 Node data — the instruction box
Add one optional field to `ImageGenNodeData`
([canvas-nodes.ts](../../../src/lib/canvas-nodes.ts)):

```ts
export type ImageGenNodeData = {
  title?: string;
  modelId?: string;
  params?: Record<string, unknown>;
  parsed?: unknown;            // active image URL (display only, D19)
  editInstruction?: string;    // NEW — current edit instruction, persists on the node
};
```

`editInstruction` rides the existing autosave (`flowToPersisted` already persists `data`).
It is the **current working instruction**; it is snapshotted per attempt when an edit runs.

### 5.2 Version breadcrumbs — `inputs_used` (JSONB, no migration)
Edits put richer structured breadcrumbs into the existing `node_versions.inputs_used` JSON:

```
V1 (fresh generate)    inputs_used: { promptVersionId, referenceImageUrls }
V2 (edit "remove cup") inputs_used: { promptVersionId, baseVersionId: V1, instruction, extraReferenceUrls }
V3 (edit "add bottle") inputs_used: { promptVersionId, baseVersionId: V2, instruction, extraReferenceUrls: [productUrl] }
```

- `baseVersionId` — present ⇒ this attempt is an edit; absent ⇒ a fresh generation. Also the
  lineage pointer.
- `instruction` — the exact edit text used (the correction label).
- `promptVersionId` — **carried forward** from the base attempt so every variation still
  points at the prompt that seeded the family (provenance/eval), even though the base prompt
  text is *not* resent to the model (§6).
- `extraReferenceUrls` — connected reference images used as edit inputs (e.g. the product to
  add), kept distinct from the base image.

### 5.3 Traceability (the requirement, satisfied)

```
V3 ──baseVersionId──▶ V2 ──baseVersionId──▶ V1     (edit lineage)
 │                     │                     │
 └──promptVersionId────┴──promptVersionId────┘
                       ▼
        node_versions.output of the prompt version = base prompt text
        (append-only → never lost; Prompt node stays connected)
```

For **every** variation you can answer: *what base prompt* (`promptVersionId` →
`node_versions.output`), *what image it came from* (`baseVersionId`), *what changed it*
(`instruction`).

## 6. Prompt construction (the preservation behavior)

Preservation comes entirely from **prompt phrasing + image ordering**, not an API flag. A
pure helper builds the edit prompt from the instruction using the Gemini doc templates:

- **Remove / modify:** `"Using the provided image, change only {instruction}. Keep
  everything else exactly the same — preserve the original style, lighting, composition, and
  all other elements."`
- **Add / replace a product (with an extra reference):** `"Using the first image as the
  base scene, {instruction} using the product shown in the additional reference image(s).
  Match the scene's lighting, perspective, and shadows. Keep everything else in the base
  image unchanged."`

Template selection: extra reference(s) present ⇒ add/replace template; otherwise change/remove
template. The raw operator instruction is interpolated; the scaffolding is deterministic.

**Trace ≠ resend (deliberate).** The base prompt is *recorded* on every edit
(`promptVersionId`) but is **not** resent to the edit model — the Gemini guide shows
instruction-only edits preserve better; re-sending the original generation prompt pushes the
model to regenerate. So: base prompt always **mapped** (provenance), never **resent**
(preservation).

Helper lives at `src/lib/image-gen/edit-prompt.ts` —
`buildEditPrompt({ instruction, hasExtraReference }): string`. Pure, unit-tested.

## 7. Reference handling (base vs. extra)

The model receives images as an ordered list; **base image first**, then extras:

```
referenceUrls = [ baseImageUrl, ...connectedReferenceUrls ]
prompt        = buildEditPrompt(...)
```

- **Base image** = the output URL of `baseVersionId` (looked up server-side), or — when
  editing a raw File reference that has no version yet — an explicit `baseImageUrl`.
- **Extra references** = the connected File/Image-Gen/Draw images the route already collects
  (this is where "the product to add" comes from — no new wiring).
- Existing `maxReferenceImages` clamp still applies (base counts toward the limit).

## 8. Model default

Editing defaults to a **Gemini editing model** (Nano Banana family —
`gemini-2.5-flash-image` / `gemini-3.1-flash-image` / `gemini-3-pro-image`), since that is
the editing workhorse and the reference-image plumbing already targets it. The node's
current default is `openai:gpt-image-2`; when the user opens the edit affordance, if the
selected model is not an editing-capable model, we default/suggest a Gemini model (the model
picker stays available — gpt-image edits too, but Gemini is recommended). Decision: **suggest,
don't hard-block** (consistent with "mark, don't block", D9/D21).

## 9. API route changes

[image-generate/route.ts](../../../src/app/api/nodes/[id]/image-generate/route.ts) gains an
**edit branch**, keyed by the presence of `instruction` (+ a base) in the body:

```
body (edit): { modelId?, params?, instruction, baseVersionId?  | baseImageUrl? }
```

Flow when editing:
1. Resolve `baseImageUrl` — from `baseVersionId` (look up that version's `output`) or the
   explicit `baseImageUrl`.
2. Collect connected reference URLs (unchanged) → these are `extraReferenceUrls`.
3. `referenceUrls = [baseImageUrl, ...extraReferenceUrls]` (clamped to `maxReferenceImages`).
4. `prompt = buildEditPrompt({ instruction, hasExtraReference: extra.length > 0 })`.
5. `config.generate(...)` → upload → `insertVersion` with
   `inputsUsed: { promptVersionId, baseVersionId, instruction, extraReferenceUrls }` →
   `setActiveVersion`.

When `instruction` is absent the route behaves exactly as today (fresh generation from the
connected Prompt node). The `promptVersionId` for an edit is carried from the base attempt's
`inputs_used` (fallback: the currently connected Prompt node's active version).

Failed edits still log a version with `error` set (eval captures failures too).

## 10. UI — focus view edit affordance

In [image-gen-focus-view.tsx](../../../src/components/nodes/image-gen-focus-view.tsx),
`mode === "result"` gains an **Edit** affordance below/over the image:

- A compact **instruction textarea** (shadcn `Textarea` — never native, per house rule),
  bound to `data.editInstruction` via `onPatch`. Placeholder rotates the three workflows
  ("remove the cup…", "replace the bottle with the product reference…", "add the product…").
- An **Edit image** button → calls a new `handleEdit()` that POSTs the edit body
  (`{ modelId, params, instruction, baseVersionId: activeVersionId }`), then `onPatch({
  parsed: newUrl })`, sets the new attempt active, refetches versions. Mirrors `handleGenerate`.
- The **version history** ([image-gen-version-history.tsx](../../../src/components/nodes/image-gen-version-history.tsx))
  shows the edit chain: each edit row displays its `instruction` and a lineage hint
  ("edited from v2"). Restore already works (re-points active → display follows, D19).
- The **inline eval bar** already binds to the active version, so an edit attempt gets its
  own pass/fail + note with no change.

Discoverability follows the house style: the Edit action is a clear button, the instruction
field invites typing (dotted-underline/`bg-primary/5` affordance per AGENTS.md), not a
sterile box.

## 11. Entry points

1. **Primary — edit a generated attempt:** the Edit affordance in the Image Gen focus view
   (base = the active attempt). Chainable (edit the edit).
2. **Secondary — edit an uploaded reference:** an "Edit" action on a File-node image seeds an
   Image Gen node with that file URL as `baseImageUrl` for the first edit attempt. This keeps
   the rule **all edits land in an Image Gen version log** (the only place with the
   version/attempt/eval machinery). *(May ship after the primary path — see §13.)*

## 12. Testing strategy (drives TDD in the plan)

- **`buildEditPrompt` (pure):** unit tests — change/remove template, add/replace template
  with extra reference, instruction interpolation, no template leakage. *(Write first, RED.)*
- **Route edit branch:** the request shape selects the edit path; base image is resolved from
  `baseVersionId`; `referenceUrls` is `[base, ...extras]` and clamped; `inputs_used` records
  `baseVersionId` + `instruction` + carried `promptVersionId`; absent `instruction` ⇒
  unchanged fresh-generation behavior. (Mock `config.generate` + storage.)
- **Traceability:** given a 3-deep edit chain, the lineage and `promptVersionId` are
  recoverable from `inputs_used` alone.
- **Existing suites stay green:** `registry.test.ts`, `cost.test.ts`, `canvas-store.test.ts`.

## 13. Rollout / scope order

1. `buildEditPrompt` helper + tests.
2. `ImageGenNodeData.editInstruction` + autosave passthrough.
3. Route edit branch + `inputs_used` breadcrumbs + tests.
4. Focus-view Edit affordance (instruction box + Edit button + `handleEdit`).
5. Version-history lineage/instruction display.
6. *(Follow-on)* File-image edit entry point (§11.2).

## 14. Open questions (resolved)

- **New node vs. attribute on Image Gen node?** → Attribute/attempt on the Image Gen node
  (§4).
- **Does the instruction steer fresh generations too?** → No; scoped to edits, preserving the
  §12 controls split (the Prompt node owns the words for fresh generations). Revisit only if
  designers ask for inline steer on fresh gens.
- **Resend the base prompt on edits?** → No; record it, don't resend (§6).
- **Hard-block non-Gemini models for edits?** → No; suggest Gemini, allow override (§8).
