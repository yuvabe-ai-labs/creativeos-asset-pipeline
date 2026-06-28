# Image Editing (targeted edits on an existing image) — Design

**Date:** 2026-06-28
**Status:** Design / spec (awaiting review → writing-plans). Recorded as **ADR D27** in
`2026-05-30-creativeos-staging-roadmap.md` §7.
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

### 1.1 Supported scenarios

One engine — **base image + instruction (+ optional extra reference) → preservation prompt** —
covers all of these (the only switches are *what is the base*, *is there an extra reference*,
and *which template fires*):

| # | Scenario | Base image | Extra ref? | Intent → template |
|---|----------|-----------|-----------|-------------------|
| 1 | **Replace a product** | generated attempt **or** uploaded reference | ✅ product (connected File) | replace → add/replace |
| 2 | **Add a product / object** | generated attempt **or** uploaded reference | ✅ product | add → add/replace |
| 3 | **Remove an element** | generated attempt **or** uploaded reference | ❌ | remove → change/remove |
| 4 | **Modify an attribute** (recolor / relight / restyle one element) | generated attempt **or** uploaded reference | ❌ | modify → change/remove |
| 5 | **Add/replace described in words** (no reference image) | generated attempt **or** uploaded reference | ❌ | freeform → change/remove |
| 6 | **Iterative chaining** (edit the edit) | the *previous* edit attempt | optional | per step |

**Base source is in scope both ways:** a generated Image Gen attempt **and** an uploaded
File/Draw reference (§7, §11). Scenarios 1–6 are one code path — only `editIntent` and whether
`extraReferenceUrls` is non-empty vary.

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
  editInstruction?: string;    // NEW — current edit instruction (the delta), persists on the node
  editIntent?: "remove" | "modify" | "replace" | "add" | "freeform"; // NEW — selected edit action
};
```

`editInstruction` + `editIntent` ride the existing autosave (`flowToPersisted` already
persists `data`). They are the **current working instruction and action**; both are snapshotted
per attempt when an edit runs. `editIntent` is set by the UI quick-action chips (§10) and
selects the server template (§6); it defaults to `freeform` when the user just types.

### 5.2 Version breadcrumbs — `inputs_used` (JSONB, no migration)
Edits put richer structured breadcrumbs into the existing `node_versions.inputs_used` JSON:

```
V1 (fresh generate)    inputs_used: { promptVersionId, referenceImageUrls }
V2 (edit "remove cup") inputs_used: { promptVersionId, baseVersionId: V1, intent: "remove", instruction, extraReferenceUrls }
V3 (edit "add bottle") inputs_used: { promptVersionId, baseVersionId: V2, intent: "add", instruction, extraReferenceUrls: [productUrl] }
```

- `baseVersionId` — present ⇒ this attempt is an edit; absent ⇒ a fresh generation. Also the
  lineage pointer.
- `instruction` — the exact edit text used (the correction label).
- `promptVersionId` — **carried forward** from the base attempt so every variation still
  points at the prompt that seeded the family (provenance/eval), even though the base prompt
  text is *not* resent to the model (§6).
- `extraReferenceUrls` — connected reference images used as edit inputs (e.g. the product to
  add), kept distinct from the base image.
- `intent` — the selected edit action (`remove`/`modify`/`replace`/`add`/`freeform`); records
  *what kind* of edit it was and which template produced the prompt.

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

**Template selection by intent.** `editIntent` (§5.1) picks the template — `remove`/`modify`/
`freeform` → change/remove; `replace`/`add` → add/replace. (`hasExtraReference` is the fallback
when intent is absent, and a validation signal: `replace`/`add` *expect* a connected product
reference — if none is connected we **warn, don't block**, D9/D21.) The raw operator
instruction is interpolated; the scaffolding is deterministic so it stays a stable eval variable.

**Trace ≠ resend (deliberate).** The base prompt is *recorded* on every edit
(`promptVersionId`) but is **not** resent to the edit model — the Gemini guide shows
instruction-only edits preserve better; re-sending the original generation prompt pushes the
model to regenerate. So: base prompt always **mapped** (provenance), never **resent**
(preservation).

Helper lives at `src/lib/image-gen/edit-prompt.ts` —
`buildEditPrompt({ instruction, intent, hasExtraReference }): string`. Pure, unit-tested.

**Where the scaffold lives (deliberate).** The deterministic preservation wrapper stays
**server-side** in `buildEditPrompt`; the instruction box holds only the human *delta* ("the
cup on the table"), and the UI shows the **composed final prompt read-only before generation**
(PRD §12 / D3). *Rejected:* dumping the full editable template into the box (pass-through) — it
lets the preservation clause be mangled, so the template stops being a stable eval variable.

## 7. Reference handling (base vs. extra)

The model receives images as an ordered list; **base image first**, then extras:

```
referenceUrls = [ baseImageUrl, ...connectedReferenceUrls ]
prompt        = buildEditPrompt(...)
```

- **Base image** — resolved two ways, **both first-class** (§11): (a) the output URL of
  `baseVersionId` (a prior attempt of this node, looked up server-side), or (b) an explicit
  `baseImageUrl` when editing a raw File/Draw reference that has no version of its own.
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
body (edit): { modelId?, params?, instruction, intent?, baseVersionId?  | baseImageUrl? }
```

Flow when editing:
1. Resolve `baseImageUrl` — from `baseVersionId` (look up that version's `output`) or the
   explicit `baseImageUrl`.
2. Collect connected reference URLs (unchanged) → these are `extraReferenceUrls`.
3. `referenceUrls = [baseImageUrl, ...extraReferenceUrls]` (clamped to `maxReferenceImages`).
4. `prompt = buildEditPrompt({ instruction, intent, hasExtraReference: extra.length > 0 })`.
5. `config.generate(...)` → upload → `insertVersion` with
   `inputsUsed: { promptVersionId, baseVersionId, intent, instruction, extraReferenceUrls }` →
   `setActiveVersion`.

When `instruction` is absent the route behaves exactly as today (fresh generation from the
connected Prompt node). The `promptVersionId` for an edit is carried from the base attempt's
`inputs_used` (fallback: the currently connected Prompt node's active version).

Failed edits still log a version with `error` set (eval captures failures too).

## 10. UI — focus view edit affordance

In [image-gen-focus-view.tsx](../../../src/components/nodes/image-gen-focus-view.tsx),
`mode === "result"` gains an **Edit** affordance below/over the image:

- **Quick-action chips** (discoverable dashed-border primary chips, per AGENTS.md): **Remove**,
  **Modify**, **Replace product**, **Add product**. Clicking one sets `data.editIntent` *and*
  pre-populates the instruction box with an editable starter for the delta (e.g. Remove → "the
  cup on the table"; Replace product → "the bottle, using the connected product reference").
  This is the lightweight "populate the box" model the designer asked for — the chip seeds
  intent + text; the user finishes the specifics.
- A compact **instruction textarea** (shadcn `Textarea` — never native, per house rule),
  bound to `data.editInstruction` via `onPatch`. Placeholder rotates the workflows
  ("remove the cup…", "replace the bottle with the product reference…", "add the product…").
- A **composed-prompt preview** (read-only) showing `buildEditPrompt(...)` output before
  generation — satisfies "the final compiled prompt is visible before generation" (PRD §12 /
  D3). For `replace`/`add` with no product reference connected, an inline **warn** (not a block).
- An **Edit image** button → calls a new `handleEdit()` that POSTs the edit body
  (`{ modelId, params, intent, instruction, baseVersionId: activeVersionId }`), then `onPatch({
  parsed: newUrl })`, sets the new attempt active, refetches versions. Mirrors `handleGenerate`.
- The **version history** ([image-gen-version-history.tsx](../../../src/components/nodes/image-gen-version-history.tsx))
  shows the edit chain: each edit row displays its `intent` + `instruction` and a lineage hint
  ("edited from v2"). Restore already works (re-points active → display follows, D19).
- The **inline eval bar** already binds to the active version, so an edit attempt gets its
  own pass/fail + note with no change.

Discoverability follows the house style: the Edit action is a clear button, the instruction
field invites typing (dotted-underline/`bg-primary/5` affordance per AGENTS.md), not a
sterile box.

## 11. Entry points

Both are **in scope for v1**:

1. **Edit a generated attempt:** the Edit affordance in the Image Gen focus view (base = the
   active attempt). Chainable (edit the edit).
2. **Edit an uploaded reference:** an **"Edit"** action on a File-node (or Draw-node) image.
   Because a File node has no version log, it **seeds an Image Gen node** wired from that file,
   passing the file URL as `baseImageUrl` for the first edit attempt — so the rule **all edits
   land in an Image Gen version log** (the only place with version/attempt/eval machinery) still
   holds. Decision for the plan: the action **creates a new Image Gen node auto-wired to the
   File node** (one-click path) rather than requiring a pre-existing connection.

## 12. Testing strategy (drives TDD in the plan)

- **`buildEditPrompt` (pure):** unit tests — each intent selects the right template
  (`remove`/`modify`/`freeform` → change/remove; `replace`/`add` → add/replace), instruction
  interpolation, fallback to `hasExtraReference` when intent is absent, no template leakage.
  *(Write first, RED.)*
- **Route edit branch:** the request shape selects the edit path; base image resolves from
  **either** `baseVersionId` (lookup) **or** an explicit `baseImageUrl` (File/Draw source);
  `referenceUrls` is `[base, ...extras]` and clamped; `inputs_used` records `baseVersionId` +
  `intent` + `instruction` + carried `promptVersionId`; absent `instruction` ⇒ unchanged
  fresh-generation behavior. (Mock `config.generate` + storage.)
- **Traceability:** given a 3-deep edit chain, the lineage and `promptVersionId` are
  recoverable from `inputs_used` alone.
- **Existing suites stay green:** `registry.test.ts`, `cost.test.ts`, `canvas-store.test.ts`.

## 13. Rollout / scope order

1. `buildEditPrompt` helper (intent → template) + tests.
2. `ImageGenNodeData.editInstruction` + `editIntent` + autosave passthrough.
3. Route edit branch (`baseVersionId` **or** `baseImageUrl`) + `inputs_used` breadcrumbs + tests.
4. Focus-view Edit affordance: quick-action chips (set `editIntent` + pre-fill box), instruction
   box, composed-prompt preview, Edit button + `handleEdit`.
5. File-node/Draw-node **"Edit"** action → create-and-wire an Image Gen node with `baseImageUrl`
   (entry point §11.2) — **in v1**.
6. Version-history lineage display (intent + instruction + "edited from vN").

## 14. Open questions (resolved)

- **New node vs. attribute on Image Gen node?** → Attribute/attempt on the Image Gen node
  (§4).
- **Does the instruction steer fresh generations too?** → No; scoped to edits, preserving the
  §12 controls split (the Prompt node owns the words for fresh generations). Revisit only if
  designers ask for inline steer on fresh gens.
- **Resend the base prompt on edits?** → No; record it, don't resend (§6).
- **Hard-block non-Gemini models for edits?** → No; suggest Gemini, allow override (§8).
- **Surface the edit actions as UI controls?** → Yes; quick-action chips that set `editIntent`
  and pre-fill the instruction box (§10) — the lightweight "populate the box" model.
- **Where does the preservation scaffold live — box or server?** → Server (`buildEditPrompt`);
  the box holds the delta, a read-only preview shows the composed prompt (§6, §10).
- **Edit an uploaded reference (not just a generated image)?** → In scope for v1 (§11), via a
  create-and-wire "Edit" action on the File/Draw node.
