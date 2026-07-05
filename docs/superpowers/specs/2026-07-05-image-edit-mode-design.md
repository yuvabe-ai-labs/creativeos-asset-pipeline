# Image Edit Mode — annotation + connected-reference selection — Design

**Date:** 2026-07-05
**Status:** Approved → to be planned. Recorded as **ADR D37** in
`2026-05-30-creativeos-staging-roadmap.md` §7.
**Author:** Cyril + Claude
**Extends:** `2026-06-28-image-editing-design.md` (the base image-edit feature, ADR D27) —
this refines *how the edit is composed*, not the edit pipeline.
**Relates to:** PRD §11.6 (Image Gen node), §12 (controls split), §13 (versioning); D18/D19/D27.
**Grounded in:** Gemini image-editing docs —
https://ai.google.dev/gemini-api/docs/image-generation#image-editing-prompts
(visual/annotation pointing + instruction-only preservation).

---

## 1. Problem

The base image-edit feature (D27) shipped an inline edit panel that works, but three real
gaps surfaced in use:

1. **No visual pointing.** A designer can *describe* an edit ("remove the cup") but can't
   *point* at the region. Gemini supports annotation-guided edits — draw a circle/arrow on
   the image and instruct against it — and we throw that signal away.
2. **Editing an ungenerated reference is invisible.** The focus view only shows the base
   image when an attempt exists (`mode = imageUrl ? "result" : "empty"`). Connect an
   internet-clipped reference with no prior generation and the right panel says *"Not
   generated yet"* — so the image is editable in principle (the panel renders on
   `canEditBase`) but you can't *see* or *annotate* what you're editing. This is why editing
   feels "only possible after a generate."
3. **No control over which references feed the edit.** Today every connected image becomes an
   edit reference (up to `maxReferenceImages`). A designer wants to say "*this* connected
   product shot is the one to swap in for this edit," not have all of them applied.

None of these need a new pipeline — the route, `config.generate`, upload, version log, and
attempts/eval UI from D27 are unchanged. The gap is the **edit composer UI** and two small
signals it must pass to the existing route.

## 2. Goals

- A designer can **draw annotations** (circle a region, arrow "put it here") on the base
  image and have those marks guide the edit — as a spatial hint, never rendered into output.
- **Editing a connected reference is first-class and visible**, with or without a prior
  attempt: the base image is shown and annotatable in both cases.
- A designer can **choose which connected image/file nodes are the references for this edit**
  via a checkbox — no new upload path, no new storage.
- Reuse the D27 edit pipeline entirely: same route, same `insertVersion`/`setActiveVersion`,
  same version log / attempts / eval surfaces. No new node type, no second route, no schema
  migration.

## 3. Non-goals

- **Ad-hoc / uploaded-in-the-composer references.** A reference must be a **connected node**;
  Edit mode only *marks* which connected nodes serve the edit. (Rejected an upload-in-composer
  path precisely to avoid a new storage/persistence mechanism — §7.)
- **Pixel masks / brush-precise region selection.** Annotation is a *prose-level* visual hint
  (Gemini "semantic masking"), not an alpha mask. The marks are guides; the model still edits
  semantically.
- **A separate Image Edit node**, a second route, or any node-spawning action (unchanged from
  D27 §3/§4.1).
- **Re-sending the base prompt** to the edit model (unchanged from D27 §6 — record, don't
  resend).
- Changing Generate mode. It stays exactly as today.

## 4. Core decision — Edit mode is a *tab*, not a new pipeline

The Image Gen focus view gains **two tabs: `Generate` | `Edit`** (default `Generate`).

- **Generate mode** — unchanged. Prompt → params → Generate.
- **Edit mode** — the composer surface for targeted edits. Everything it produces flows into
  the **existing** edit branch of `image-generate/route.ts` (D27 §9): one route, one
  `config.generate`, one append-only version log. Edit mode changes *what the composer
  gathers* (annotation + a chosen reference set), not *how an edit runs*.

This preserves the D27 "reuse, don't add cases" constraint: the tab is an **input composer**,
the pipeline is shared. Rationale mirrors D27 §4 — an edit is a generation attempt (D18), it
lives in this node's version log, downstream mirrors auto-follow the active pointer (D19).

## 5. Data model (no migration)

All new state rides the existing `nodes.data` JSONB (autosave via `flowToPersisted`) and the
existing `node_versions.inputs_used` JSONB. No DB migration.

### 5.1 Node data — `ImageGenNodeData`

The D27 fields stay; two adjustments:

```ts
export type ImageGenNodeData = {
  title?: string;
  modelId?: string;
  params?: Record<string, unknown>;
  parsed?: unknown;                       // active image URL (display only, D19)
  editInstruction?: string;               // D27 — the edit delta text
  editIntent?: EditIntent;                // now includes "modify" (§6)
  editReferenceNodeIds?: string[];        // NEW — connected node ids marked as edit refs (§7)
};
```

- `editReferenceNodeIds` — the ids of connected image/file/image-gen nodes the user has
  checked as references for the edit. Rides autosave; snapshotted per attempt. Absent/empty ⇒
  fall back to the D27 default (all *other* connected images are extras) for backward
  compatibility.
- `editIntent` gains `"modify"` (§6). No image bytes are ever stored on the node — the
  "no new persistence mechanism" constraint (§7).

### 5.2 Version breadcrumbs — `inputs_used`

Edits extend the D27 breadcrumbs with two fields:

```
inputs_used: {
  promptVersionId,          // carried from base (D27) — provenance, never resent
  baseVersionId,            // lineage pointer (D27)
  intent,                   // remove | replace | add | modify | freeform (§6)
  instruction,              // the edit delta (D27)
  extraReferenceUrls,       // the CHOSEN connected refs (from editReferenceNodeIds) (§7)
  annotated,                // NEW — true when the sent base was an annotated composite (§8)
  annotatedBaseUrl,         // NEW — the uploaded composite URL, for traceability (§8)
  editPrompt,               // the literal prompt sent (D27 §6, editable final prompt)
}
```

`annotated` + `annotatedBaseUrl` make an annotated edit fully reproducible: the exact image
the model saw (base + marks) is recorded, distinct from the un-annotated `baseVersionId`
output.

## 6. Intent — 4 chips including Modify

Edit mode surfaces **4 chips**: **Remove · Replace · Add · Modify** (freeform = typing with
no chip, unchanged). `EditIntent` becomes
`"remove" | "replace" | "add" | "modify" | "freeform"`.

- `remove` / `replace` / `add` — the D27 templates (§6 of D27), unchanged.
- `modify` — uses the **change-only** template (same family as `freeform`) but is a *labeled*
  action with its own starter ("recolor the label to matte black…") and is recorded distinctly
  in `intent`, so eval can tell a deliberate modify from an untyped freeform. It does **not**
  get a new template — recolor/relight/reshape are all "change only X, keep the rest."
- `replace` / `add` still *expect* a checked reference; if none is checked we **warn, don't
  block** (D9/D21, D27 §6).

`buildEditPrompt` (pure, D27 §6) gains the `modify` case (→ change-only template) and the
annotation clause (§8). Still shared server + client for the editable Final-prompt preview.

## 7. Edit references — mark connected nodes (no new storage)

A reference for an edit **must be a connected node**. Edit mode adds a **checkbox** to each
connected image/file/image-gen node in the composer's reference list:

- **Base image** = the node's current image (D27 §7 precedence): the active attempt if one
  exists, else the connected image being edited. The base is not itself a checkable extra.
- **Extra references** = the connected image/file/image-gen nodes the user **checks**. Their
  ids persist in `editReferenceNodeIds`; the composer resolves them to `fileUrl`s and sends
  them as `extraReferenceUrls` in the edit body.
- **Default** (nothing explicitly checked / legacy nodes): all *other* connected images are
  extras — identical to D27 behavior, so existing edits are unaffected.
- `maxReferenceImages` still clamps (base counts toward the limit, D27 §7). Over-limit shows
  the existing warning.

Because refs are always connected nodes, their images already live in our Supabase storage —
so client-side compositing of the annotation (§8) never taints the canvas, and **no upload /
storage path is added** for references.

## 8. Annotation — a separate transparent layer

Preservation and pointing come from **prompt phrasing + an annotated image**, not an API flag
(consistent with D27 §6).

### 8.1 Rendering
In Edit mode the right panel shows the base `<img>` with an absolutely-positioned,
**transparent `<canvas>` overlay** sized to the displayed image box; the canvas backing buffer
= the image's natural resolution. The existing `toCanvasPoint` maps pointer coords by
`getBoundingClientRect` ratio, so it is resolution- and zoom-independent with no new coordinate
code (reuses `useDrawingCanvas`).

### 8.2 Separate-layer drawing (the one drawing-logic change)
The Draw node's v1 eraser is a **white pen** (`draw-canvas.ts`: `source-over`, white) because
that node is a single white-background layer. An overlay over a photo must **not** paint white.
So `drawingContextSettings` gains a **transparent-layer variant**:

- init/clear: **no white fill** (transparent `clearRect` only).
- eraser: `globalCompositeOperation = "destination-out"` (clears ink to transparent, leaving
  the base image untouched).

This is pure and unit-tested. The Draw node keeps its current white-layer behavior unchanged;
the variant is opt-in for the annotation overlay.

### 8.3 Send path
On **Edit image**, if any marks exist:
1. Composite offscreen at natural resolution: `drawImage(base)` then `drawImage(overlay)`.
2. Upload the composite PNG to storage (same helper the route/Draw node use).
3. Send it as the base image the model sees; keep `baseVersionId` for lineage.
4. `buildEditPrompt({ …, annotated: true })` appends: *"I have marked the area to change
   directly on the image. Apply the edit only within the marked region and blend seamlessly;
   treat the drawn marks as guides only — do not include the marks themselves in the output."*
5. Record `annotated` + `annotatedBaseUrl` in `inputs_used` (§5.2).

Marks are **ephemeral** UI state (not persisted on the node) — but every attempt's composite
is recorded, so the edit is fully reproducible.

## 9. API route changes

`image-generate/route.ts` (the D27 edit branch) accepts two optional body fields; both are
additive and backward-compatible:

```
body (edit): {
  modelId?, params?, instruction, intent?, prompt?,      // D27
  baseVersionId? | baseImageUrl?,                         // D27 base resolution
  extraReferenceUrls?,                                    // NEW — the chosen connected refs (§7)
  annotatedBaseUrl?, annotated?,                          // NEW — annotation composite (§8)
}
```

- `extraReferenceUrls` present ⇒ use it as the edit's extras (the composer's checked set);
  absent ⇒ derive extras from connected nodes as today (D27 default).
- `annotatedBaseUrl` present ⇒ that composite is the image sent to the model; `baseVersionId`
  still drives lineage + carried `promptVersionId`. Absent ⇒ resolve base exactly as D27.
- `annotated` toggles the `buildEditPrompt` clause and is recorded in `inputs_used`.

`referenceUrls = [ baseImageUrl (or annotated composite), ...extraReferenceUrls ]`, clamped to
`maxReferenceImages` (D27 §7). Failed edits still log a version with `error` (D27 §9).

## 10. UI — the Edit tab

`image-gen-focus-view.tsx` gains a `Generate | Edit` tab control (shadcn Tabs — Base UI, per
house rule; never native).

- **Generate tab** — the current view unchanged.
- **Edit tab** — right panel: base image + annotation overlay + a compact tool strip (pen
  colors, eraser, clear) reusing the Draw node's control cluster styling. Left panel (the
  composer):
  - **Intent chips** (dashed-border primary chips, AGENTS.md): Remove · Replace · Add · Modify.
  - **References for this edit** — the connected image/file/image-gen nodes, each with a
    checkbox (shadcn `Checkbox`); checked = sent as an extra (§7). Base node is shown but not
    checkable. `replace`/`add` with nothing checked → inline **warn**, not block.
  - **Instruction** `Textarea` (bound to `editInstruction` via `onPatch`, D27).
  - **Editable Final prompt** `Textarea` (`buildEditPrompt(...)` incl. the annotation clause;
    re-derives on chip/instruction change; hand-edit overrides — D27 §6/§10).
  - **Edit image** button → `handleEdit()` composites (if marked), POSTs the edit body,
    `onPatch({ parsed })`, sets active, refetches versions (mirrors D27 `handleEdit`).
- **Base visible without an attempt (§1 gap 2 fix):** the right panel renders
  `baseImageUrl = imageUrl ?? firstConnectedImageUrl`, with a subtle "Editing connected
  reference" label when there is no attempt. This is what makes editing an internet-clipped
  reference feel first-class.
- **Version history / lineage** (D27 §10, image-gen-version-history) is unchanged; annotated
  edits read the same, with the composite recorded for provenance.

## 11. Entry points

Both run through the same Edit tab; they differ only in how the base resolves (D27 Axis B):

1. **Edit a generated attempt** — open the node, Edit tab, base = active attempt. Chainable.
2. **Edit a connected reference (incl. an internet clip)** — connect the File/clip node to an
   Image Gen node (the existing connect workflow), open it, Edit tab; with no attempt the
   connected image is the base and is shown/annotatable. The edit lands in this node's version
   log. No node-spawning, no new edge logic, no second route.

*(A one-click "Edit this image" on the File/clipper node that pre-wires the connection remains a
possible later convenience — it would only automate the existing connect step, never add a new
edit path. Out of scope here.)*

## 12. Testing strategy (drives TDD in the plan)

- **`drawingContextSettings` transparent variant (pure):** eraser → `destination-out`, no
  white fill on init/clear; the white-layer (Draw node) path is unchanged. *(RED first.)*
- **`buildEditPrompt` (pure):** `modify` → change-only template (distinct `intent`, same
  family as freeform); `annotated: true` appends the guides-only clause to every intent; no
  clause when `annotated` is false; no template leakage. *(RED first.)*
- **Reference selection (pure helper):** given connected nodes + `editReferenceNodeIds`,
  resolve `extraReferenceUrls` (chosen set, base excluded, deduped, clamped); empty selection
  falls back to the D27 all-others default.
- **Route/UI:** no route/component harness in the repo (D27 §Global Constraints) — keep logic
  in the tested pure helpers; verify the tab, checkbox, overlay, and composite manually via
  `npm run dev`.
- **Existing suites stay green:** `edit-prompt.test.ts`, `canvas-nodes.test.ts`,
  `registry.test.ts`, `cost.test.ts`, `canvas-store.test.ts`.

## 13. Rollout / scope order

1. Pure: `drawingContextSettings` transparent variant + `buildEditPrompt` `modify` case &
   `annotated` clause + reference-selection helper (+ tests).
2. `ImageGenNodeData.editReferenceNodeIds` + `editIntent: "modify"` passthrough.
3. Focus view: `Generate | Edit` tabs; Edit tab renders base from attempt-or-connected-ref
   (§1 gap 2 / §10) — the visibility fix.
4. Annotation overlay + tool strip (transparent layer, clear/erase).
5. Reference checkboxes → `extraReferenceUrls`; route accepts `extraReferenceUrls`.
6. Composite → upload → route `annotatedBaseUrl`/`annotated` branch → breadcrumbs.

## 14. Open questions (resolved)

- **New Edit node / second route?** → No. Edit mode is a tab (composer) over the D27 pipeline
  (§4, D27 §4.1).
- **Ad-hoc uploaded references in the composer?** → No — a ref must be a connected node; Edit
  mode only *marks* connected nodes, so no new storage/persistence (§3, §7).
- **Where does annotation live?** → Inline in the Edit tab, on a **separate transparent
  layer**, so clear/erase touch only the marks (§8).
- **Do the marks get rendered into the output?** → No — they are spatial guides; the prompt
  clause instructs the model to exclude them (§8.3).
- **Persist the marks?** → No; ephemeral UI state. The composite + breadcrumbs are recorded per
  attempt for reproducibility (§8.3, §5.2).
- **Is "Modify" its own template?** → No; it uses the change-only template but is a labeled
  intent recorded distinctly (§6).
- **Does this need a migration?** → No; rides `nodes.data` and `node_versions.inputs_used`
  JSONB (§5).

---

## ADR entry (append to `2026-05-30-creativeos-staging-roadmap.md` §7)

**D37 — Image Edit mode: a tabbed composer (annotation + connected-ref selection) over the D27
edit pipeline.**
- **Decision:** Add a `Generate | Edit` tab to the Image Gen focus view. Edit mode adds (a) a
  separate-layer annotation overlay on the base image, (b) checkboxes to mark which *connected*
  nodes are the edit's references, and (c) a "Modify" intent chip. It sends an annotated
  composite + a chosen `extraReferenceUrls` to the **existing** D27 edit route; base is shown
  even with no prior attempt.
- **Why:** Designers need to *point* at edit regions and to *choose* which reference feeds an
  edit, and editing a connected/clipped reference must be visible without a prior generation —
  all without a new pipeline or storage mechanism.
- **Rejected:** ad-hoc uploaded references in the composer (would add a storage path — instead
  mark connected nodes); pixel masks (prose-level visual hint only); a separate Edit node /
  second route (violates D27 §4.1).
- **Refines:** D27 (adds the composer UI + two additive route fields; pipeline unchanged).
- **Originated → spec:** `2026-07-05-image-edit-mode-design.md`.
