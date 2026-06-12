# Shot fan-out — Shot nodes from a parsed script

**Date:** 2026-06-11
**Branch:** (new) `feat/shot-fan-out`
**Status:** Approved design
**Decision record:** ADR **D21** (`2026-05-30-creativeos-staging-roadmap.md` §7)
**PRD:** §7 (node types), §10 (connections), §14 (flow), §15 (manual branching)

## Problem

A reel script is an **ordered list of shots** (`visual_script.shots[]` — Reel #1 has 5:
turmeric root 3s, rose petal 4s, oil drop 3s, product range 8s, logo 7s). The Stage-2
Prompt node flattens the **whole** script into **one** compiled prompt → **one** image.
That's the wrong granularity: production-wise each shot is its own image (and later its own
video clip), and the reel is the *assembly* of those N clips. The pipeline is
**`1 script → N shots → N images → N clips → 1 reel`**, but the graph only expresses 1→1.

## Goal

A human-triggered **"Fan out shots"** action on a parsed Script that materializes each shot
into its own first-class **Shot node**, so the designer can build one `Shot → Prompt → Image`
chain per shot.

## Decisions carried in (settled during brainstorming → D21)

- **Granularity:** one image per shot; the shot is the unit of generation.
- **Seed-and-fork:** fan-out is a **one-time copy**, not a live link. Each Shot is an
  independent node with a fresh permanent id; later script edits do **not** propagate; there
  is **no Script→Shot edge** (an edge would mean live resolution, D8 — this is a seed).
- **Shot is the through-line:** it feeds a `Prompt → Image` now and a Video clip in Stage 4;
  its `duration`/`order` are what the Stage-5 reel assembly needs — so it's a real node, not
  an array element (the D19/D20 lesson, one level up).
- **Mark, don't block (D9):** re-extracting the script stays **enabled** (append-only,
  non-destructive — D4/D18). Each Shot records `seededFrom` and shows a **provenance label**.
  The version-comparison **staleness badge is deferred to Stage 3** (it needs the script's
  active-version id exposed client-side, which D9's Stage-3 work adds).
- **Fan-out creates Shot nodes** plus a dashed Script→Shot lineage edge each — **no
  auto-created Prompt nodes**. The human wires the functional `Shot → Prompt` (D11; PRD §15).
  It's a manual bulk action, not graph automation.

## Architecture

### New node type: `Shot`

> **Amended 2026-06-12:** the Shot carries the **full script narrowed to one shot** (not just
> the shot text), and fan-out draws a **dashed Script→Shot lineage edge**. Updated below.

```ts
// src/lib/canvas-nodes.ts
export type ShotNodeData = {
  // The parent ReelScript narrowed to a SINGLE shot — "a Script node with one shot".
  // Keeps the full metadata (objective, on-screen text, voiceover, caption…) so
  // downstream prompts don't lose creative context. Editable; this node's output (D19/D20).
  script?: ReelScript;
  order?: number;       // 1-based position in the script (display + Stage 5 assembly)
  seededFrom?: {        // provenance of the fork (D21)
    scriptNodeId: string;
    shotIndex: number;   // 0-based index in visual_script.shots at fork time
    scriptTitle?: string; // for the provenance label without a lookup
  };
};
```

Added to the `AppNode` union: `| Node<ShotNodeData, "shot">`. Like the Text node, **its
content IS its output** — no AI, no version log (D19/D20); rendered via `renderScriptAsText`
(the same renderer the Script node uses). The shot description is editable on the node
(written back into the carried `script`; edit-at-source, D20). Handles: a **source** handle
(feeds downstream) plus a **target** handle (lands the dashed Script→Shot lineage edge).

### Fan-out is a client-only store action

No new route, no DB change — Shot nodes persist through the existing autosave (`nodes.data`
jsonb, D10). New store action on the canvas store:

```ts
// src/lib/canvas-store.ts — reads the script node's hydrated parsed output (data.parsed,
// the active version's ReelScript, D19) and creates one Shot node per shot.
fanOutShots: (scriptNodeId: string) => void;
```

It lays the Shot nodes out in a column to the right of the Script (`base.x + 360`, stacked by
`base.y + i * 170`), each seeded with `{ script: <parent narrowed to shot i>, order: i+1,
seededFrom }`, and adds a **dashed Script→Shot lineage edge** per shot. The dashed style is
derived in `canvas.tsx` from node types (source `script` → target `shot`), so it survives
reload without a schema change; resolution never traverses it (seed-and-fork preserved).

### Wiring fan-out into the UI

- **`ScriptFocusView`** (parsed-mode header, beside Re-extract/Replace/Save) gets a
  **"Fan out N shots"** button — `N = parsed.visual_script?.shots?.length`, shown only when
  `N > 0`. Clicking calls an `onFanOut` prop, toasts `"N shots fanned out"`, and closes the
  sheet to reveal the new nodes.
- **`ScriptNode`** holds store access (like `PromptNode`); it passes
  `onFanOut={() => { fanOutShots(id); setFocusOpen(false); }}` to the focus view.

### The Shot node component

`src/components/nodes/shot-node.tsx` — a compact card:
- Header: a `Clapperboard` (Lucide) icon + `Shot {order}` + the **provenance label**
  `from "{scriptTitle}"` (muted). No staleness badge yet (deferred).
- An editable **description** `textarea` (`updateNodeData(id, { description })`) — edit at
  source (D20). Optional `{duration}` chip.
- A **source** handle on the right (feeds a Prompt).

Registered in `canvas.tsx` `nodeTypes` as `shot: ShotNode`. **Not** added to the "Add node"
palette — Shot nodes are created by fan-out, not by hand.

### Downstream: Shot → Prompt already works

`getNodeOutput` gains a `case "shot"` that renders the carried script via
`renderScriptAsText` (so the prompt gets the full context — objective/tone/on-screen/voiceover
+ the one shot); the type labels gain `shot: "Shot"`. With those, the **existing** Prompt node
consumes a Shot exactly like a Script. No Prompt-node changes beyond the label maps.

## Data flow

```
Script node (parsed, data.parsed = ReelScript)
   │  user clicks "Fan out 5 shots"  (ScriptFocusView → ScriptNode → store)
   ▼
fanOutShots(scriptId):  read data.parsed.visual_script.shots
   │   create Shot node ×N  { script (one shot), order, seededFrom } + dashed lineage edge
   ▼
N independent Shot nodes on the canvas  ──(human wires each)──►  Prompt ──► Image (Stage 3)
   │                                                                       │
   provenance label "Shot 2 · from 'Nature's Intelligence'"               ordered by `order`,
   (re-extracting the script never blocked; forks unchanged — D21)        timed by `duration`
                                                                          → reel (Stage 5)
```

## Files

| File | Change |
|---|---|
| `src/lib/canvas-nodes.ts` | Add `ShotNodeData` + union member |
| `src/lib/canvas-store.ts` | `defaultData` `case "shot"`; add `fanOutShots` action (+ type) |
| `src/lib/canvas-store.test.ts` | Test `fanOutShots` (TDD) |
| `src/lib/nodes/node-output.ts` | `case "shot"` → description |
| `src/lib/nodes/node-output.test.ts` | Test the shot case |
| `src/lib/nodes/resolve-inputs.ts` | `TYPE_LABEL.shot = "Shot"` |
| `src/components/nodes/prompt-node.tsx` | `TYPE_LABEL.shot = "Shot"` |
| `src/components/nodes/shot-node.tsx` | New Shot node card |
| `src/components/nodes/script-focus-view.tsx` | "Fan out N shots" button + `onFanOut` prop |
| `src/components/nodes/script-node.tsx` | Pass `onFanOut` (calls `fanOutShots`, closes sheet) |
| `src/components/canvas/canvas.tsx` | Register `shot: ShotNode` |

## Testing

- **`fanOutShots` (TDD, store):** seed a store with a `script` node whose `data.parsed`
  has 2 shots; call `fanOutShots(scriptId)`; assert 2 `shot` nodes exist with correct
  `description`/`order`/`seededFrom.scriptNodeId`, and **no new edges**.
- **`getNodeOutput` shot case (TDD):** `getNodeOutput({ type: "shot", data: { description: " x " }, activeOutput: null })` → `"x"`.
- **Types/lint:** `tsc --noEmit`, `npm run lint` clean on touched files.
- **Manual e2e:** parse Reel #1 → "Fan out 5 shots" → 5 Shot nodes appear, each with its
  description + `Shot N · from '…'` label; edit a Shot's description (persists on reload);
  wire `Shot → Prompt`, open the Prompt → the Connected card shows that shot's text; generate.
  Re-extract the script → fan-out's existing Shot nodes are untouched.

## Out of scope (YAGNI / deferred)

- The **"script updated since fork" staleness badge** — deferred to Stage 3 with D9 (needs the
  script's active-version id client-side). We record `seededFrom` now so it's ready.
- Auto-creating Prompt/Image nodes or edges on fan-out (human wires — D11/§15).
- A Shot **focus view** — the inline editable description on the card is enough for MVP.
- Manual Shot creation from the palette.
- Re-fan-out reconciliation (creating fresh Shots after a re-extract just adds new nodes).
