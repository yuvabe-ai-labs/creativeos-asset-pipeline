# Guided next-node flow — contextual "Create next" CTAs down the reel pipeline

**Date:** 2026-07-05
**Status:** Approved design. Implementation pending (test-first).
**Type:** Design spec (adds **D36**; the deferred *second half* of the "Canvas Guided Flow and Flat Generation Tray" concept note — the flat tray shipped as **D35**).
**Decision record:** ADR **D36** (`2026-05-30-creativeos-staging-roadmap.md` §7 — appended).
**Builds on:** **D35** (the Generation Tray added the two seams this rides on — `focusedNodeId`
programmatic focus-view open, and the `findShotAncestor` edge-walk), **D21** (Shot nodes; the
pipeline is `1 script → N shots → N images → N clips`), **D24** (Video Prompt → Video Gen split;
the still + shot both feed the motion prompt), **D8** (edges point to nodes), **D29** (approval is a
flag). **Preserves D11** (the human is the scheduler — the flow **never** fires a model).
**Origin:** the concept note's §7 ("guided next-node actions"). Brainstormed down to: a declarative
chain config + a pure planner + one store action + one shared CTA component — no new surface, all
inside the canvas.

---

## 1. Problem

Building a reel is repetitive graph plumbing. For every shot the designer manually adds a Prompt
node, wires `shot → prompt`, adds an Image Gen node, wires `prompt → image-gen`, then (after an
approved still) adds a Video Prompt node and wires **both** the shot and the still into it, adds a
Video Gen node and wires **both** the motion prompt and the still into it. That is four node
creations and six edges per shot, done by hand, before any creative work happens. On a fanned-out
reel this is most of the clicks.

The Generation Tray (D35) removed the *waiting* friction. This removes the *setup* friction: from
any node, one click creates the next logical node, wires it (including the extra parents), places it,
and opens it — so the designer lands ready to set controls and generate.

## 2. Goal

A contextual **"Create next"** action on each pipeline node that:

1. **Saves** the current node's edits (implicit — the canvas autosaves; creating the next node
   flushes it, §4.3),
2. **Creates** the next node in the pipeline,
3. **Connects** it — the `source → next` edge **plus** any extra parent the next node needs,
4. **Places** it to the right of the source without overlapping,
5. **Opens** its focus view (via `focusedNodeId`, D35),

and **never runs a model** — the designer sets master controls, verifies inputs, and clicks Generate
themselves (D11). The action is **idempotent**: if the next node already exists, the CTA navigates to
it instead of creating a duplicate.

The chain, in order:

```
Shot ──"Create image prompt"──▶ Prompt ──"Create image generation"──▶ Image Gen
Image Gen ──"Create video prompt"──▶ Video Prompt ──"Create video generation"──▶ Video Gen
```

## 3. Non-goals (deferred; each a clean later increment)

- **No auto-generation.** No CTA fires the model — not even the cheap prompt text. The designer
  reviews inputs/controls and clicks Generate. (Chosen explicitly; preserves D11.)
- **No dedicated "Runner" surface.** This stays inside the canvas. A separate linear production
  wizard was the concept note's biggest option and is not built here.
- **No auto-selection of reference images.** Creating an Image Gen node wires only the prompt; the
  designer wires File/Draw/approved-still references themselves (they must "verify inputs are in
  place"). Speculative auto-refs (concept note §11) are deferred — they were error-prone (§14.6).
- **No batch / fan-all-shots-at-once.** One node, one click. (Fan-out already materializes shots;
  this walks one shot's chain.)
- **No new node types.** "Image Prompt" is the existing generic `prompt` node.

## 4. Design

### 4.1 The chain config + pure planner (the spine)

One new file `src/lib/guided-flow.ts` holds the entire progression as data — the single source of
truth for "what comes next":

```ts
export type GuidedStep = {
  nextType: string;                 // node type to create
  createLabel: string;              // "Create image prompt"
  openLabel: string;                // "Open image prompt"  (shown when it already exists)
  alsoWireAncestors?: string[];     // extra parent types to wire into the new node (§4.2)
  gate?: (source: AppNode, nodes: AppNode[], edges: Edge[]) => GuidedGate;
};
export type GuidedGate = { enabled: boolean; nudge?: string };

export const GUIDED_CHAIN: Record<string, GuidedStep> = {
  shot:           { nextType: "prompt",       createLabel: "Create image prompt",      openLabel: "Open image prompt" },
  prompt:         { nextType: "image-gen",    createLabel: "Create image generation",  openLabel: "Open image generation" },
  "image-gen":    { nextType: "video-prompt", createLabel: "Create video prompt",      openLabel: "Open video prompt",
                    alsoWireAncestors: ["shot"], gate: imageGenGate },
  "video-prompt": { nextType: "video-gen",    createLabel: "Create video generation",  openLabel: "Open video generation",
                    alsoWireAncestors: ["image-gen"] },
  // video-gen is terminal — no entry, no CTA.
};
```

Pure planner (unit-testable, mirrors `deriveTrayItems` / `planReconcile`):

```ts
export type GuidedPlan = {
  nextType: string;
  existingId: string | null;               // navigate target if the next node already exists
  position: { x: number; y: number };
  edgesToCreate: { source: string; target: string }[];
  gate: GuidedGate;
};

export function planGuidedNext(source: AppNode, nodes: AppNode[], edges: Edge[]): GuidedPlan | null;
```

- Returns `null` when `source.type` has no chain entry (e.g. `file`, `text`, `video-gen`, `kb`).
- **`existingId`** = an existing node of `nextType` already wired *from* the source (`edges.some(e =>
  e.source === source.id && node(e.target).type === nextType)`). When set, the CTA shows `openLabel`
  and navigates — never a duplicate (the "navigate to existing" decision). To make a second (compare
  workflow, PRD §15), the designer uses manual duplicate / the palette.
- **`gate`** = `{ enabled: true }` for the unconditional steps; `imageGenGate` for `image-gen`
  (§4.4).

### 4.2 Multi-parent wiring via a shared ancestor walk

Two steps wire **two** parents into the new node (concept note + D24):

- **image-gen → video-prompt**: wire `image-gen → video-prompt` (the still, vision-read) **and**
  `shot → video-prompt` (action context, `renderShotForVideo`). `alsoWireAncestors: ["shot"]`.
- **video-prompt → video-gen**: wire `video-prompt → video-gen` (motion prompt) **and**
  `image-gen → video-gen` (start frame). `alsoWireAncestors: ["image-gen"]`.

`planGuidedNext` resolves each `alsoWireAncestors` type by walking edges upstream from the source to
the nearest node of that type, emitting an `ancestor → next` edge for each one found (skipped if
absent — mark, don't block).

The walk **reuses the tray's `findShotAncestor`**, promoted to a general graph util:

- Add `findAncestorOfType(nodeId, nodes, edges, type, maxDepth?): AppNode | null` to
  `src/lib/canvas/graph.ts` (which already owns `wouldCreateCycle`).
- Refactor `generation-tray.ts`'s `findShotAncestor` into a one-line delegate
  (`findAncestorOfType(nodeId, nodes, edges, "shot")`). One graph-walk, two callers; the tray's
  existing `findShotAncestor` tests guard the refactor.

All emitted edges are already valid per `VALID_CONNECTIONS` (shot→video-prompt, image-gen→video-gen,
etc.) and strictly downstream, so no cycle is possible; the store action still guards with the
existing `wouldCreateCycle` defensively (§4.3).

### 4.3 Placement + the store action

**Placement** — pure `placeNextTo(source, nodes): { x, y }`: start at `source.x + 360, source.y`
(matching `fanOutShots`), nudge `y` by +170 until the spot clears every existing node's bounding box.
Simple, testable, no dagre.

**Store action** `guidedCreateNext(sourceId: string): string | null` on the canvas store:

1. Find the source node; `plan = planGuidedNext(source, nodes, edges)`. If `null` or
   `!plan.gate.enabled`, return `null`.
2. If `plan.existingId`, return it (pure navigate — **no mutation**).
3. Else mint an id, `addNode(plan.nextType, plan.position, id)`, add every edge in
   `plan.edgesToCreate` (each guarded by `wouldCreateCycle`), and return the new id.

The action does **not** open anything or call a model — the caller navigates.

**The generate-before-persist race.** The new node is persisted by the debounced autosave (600ms).
Because nothing auto-generates and the designer must review inputs + click Generate (well over
600ms), the node is in the DB before any generate route reads it. To be safe against a fast click,
`guidedCreateNext` triggers an autosave flush after mutating (reusing `runAutosaveFlush`, the same
guard the clipboard-paste handler uses) — belt-and-suspenders, not load-bearing.

### 4.4 The CTA component + placement in the UI

One shared component `src/components/canvas/guided-next-button.tsx`:

```tsx
<GuidedNextButton sourceId variant="chip" | "button" onNavigate?={() => void} />
```

- Reads `GUIDED_CHAIN[sourceType]` + `planGuidedNext`. Renders nothing when there is no step.
- Label = `existingId ? openLabel : createLabel`. Disabled + `nudge` tooltip when `gate.enabled` is
  false; shows the `nudge` text inline when present but enabled (the approval nudge).
- On click: `const id = guidedCreateNext(sourceId); if (id) { onNavigate?.(); setFocusedNodeId(id); }`
  — `onNavigate` closes the current focus view (so only the next node's Sheet is open); setting
  `focusedNodeId` opens the next node's focus view.
- **Read-only (D33):** hidden/disabled when `!useCanvasEditable()` — creating nodes is a canvas edit.
- Design system: `variant="button"` is a **primary** Button (purple as the primary-CTA fill is the
  one sanctioned use); `variant="chip"` is a **dashed-border primary chip** matching the shot card's
  "Compose" affordance (AGENTS.md). Lucide arrow icon, 1.5 stroke.

**Where each CTA lives:**

| Source node | Host surface | Variant | Why |
| :---- | :---- | :---- | :---- |
| **Shot** | node **card** (beside "Compose") | chip | the Shot has no focus view — it edits inline + has the compose sheet |
| **Prompt** | focus-view footer | button | the designer is already reviewing the prompt here before Generate |
| **Image Gen** | focus-view footer | button | after generating/approving the still |
| **Video Prompt** | focus-view footer | button | after reviewing the motion prompt |

**`imageGenGate`** (§4.1): `enabled` once the Image Gen node has an active image (`data.parsed`
truthy / an active version output). If that version's `approvalStatus !== "approved"`, still enabled,
with `nudge: "Not approved yet"` — approval **guides, never gates** (D29/D11). If no image yet:
`{ enabled: false, nudge: "Generate an image first" }`.

**`focusedNodeId` extension.** The tray (D35) made `image-gen` and `video-gen` open their focus view
when `focusedNodeId === id` (derived `open = focusOpen || focusedNodeId === id`, no effect). Extend
the **identical** pattern to `prompt-node` and `video-prompt-node` so the chain can open every next
node. No new mechanism.

## 5. Edge cases

| Case | Behavior |
| :---- | :---- |
| Next node already exists | CTA shows `openLabel`, navigates — never duplicates (§4.1). |
| Ancestor missing (e.g. video-prompt with no shot upstream) | That `ancestor→next` edge is skipped; the primary `source→next` edge is still made (mark, don't block). |
| Source type has no chain entry (`file`/`text`/`video-gen`/`kb`) | No CTA rendered. |
| Read-only viewer (D33 lock) | CTA hidden/disabled; no canvas mutation possible. |
| Image Gen with no image yet | CTA disabled, "Generate an image first". |
| Image Gen image not approved | CTA enabled with "Not approved yet" nudge. |
| Rapid double-click | Second click sees `existingId` (first click created it) → navigates, no duplicate. |
| New node placement overlaps | `placeNextTo` nudges down until clear. |
| Cycle risk | Impossible by construction (downstream + `VALID_CONNECTIONS`); `wouldCreateCycle` guards anyway. |

## 6. Testing

Repo convention: node-env vitest over pure `src/lib/**` logic. Load-bearing logic is pure; UI is
manual (no DOM harness — same posture as the tray).

**Unit (pure, TDD):**
- `planGuidedNext` — next type per source; `existingId` set when a downstream next-type node exists
  (→ navigate, no edges); `edgesToCreate` includes the primary edge **plus** each resolved ancestor
  edge (shot→video-prompt, image-gen→video-gen); `null` for non-chain sources; gate wiring.
- `placeNextTo` — right offset; downward nudge on overlap.
- `findAncestorOfType` (in `graph.ts`) — walks to the nearest typed ancestor; null when absent; the
  refactored `findShotAncestor` still passes its existing tests.
- `imageGenGate` — disabled without image; enabled + nudge when unapproved; enabled clean when
  approved.

**Store:**
- `guidedCreateNext` — creates the node + all edges and returns the new id; returns the **existing**
  id (no new node, no new edge) when the next already exists; returns `null` for a gated/uncharted
  source.

**Manual (app):**
1. Walk a shot end-to-end: Shot chip → prompt opens → "Create image generation" → image-gen opens →
   generate + approve → "Create video prompt" → video-prompt opens (shot + still both wired) →
   "Create video generation" → video-gen opens (motion prompt + still both wired).
2. Re-click any CTA → navigates to the existing next (no duplicate).
3. Image Gen CTA before generating (disabled) / after generating but unapproved (nudge) / after
   approval (clean).
4. Read-only second tab → no CTAs.

## 7. Implementation surface (summary)

**New:**
- `src/lib/guided-flow.ts` — `GUIDED_CHAIN`, `planGuidedNext`, `placeNextTo`, `imageGenGate`, types (pure; tested).
- `src/components/canvas/guided-next-button.tsx` — the shared CTA (chip / button variants).

**Changed (small):**
- `src/lib/canvas/graph.ts` — add `findAncestorOfType`; `generation-tray.ts` `findShotAncestor` → delegate.
- `src/lib/canvas-store.ts` — add `guidedCreateNext`.
- `src/components/nodes/shot-node.tsx` — render `<GuidedNextButton variant="chip">` on the card.
- `src/components/nodes/prompt-focus-view.tsx`, `image-gen-focus-view.tsx`, `video-prompt-focus-view.tsx` — render `<GuidedNextButton variant="button">` in the footer.
- `src/components/nodes/prompt-node.tsx`, `video-prompt-node.tsx` — derived-open on `focusedNodeId` (mirror image-gen/video-gen).

**Unchanged:** node types, generation routes, the tray, the `generations`/`node_versions` schema, approval, autosave.
