# CreativeOS — Staging Roadmap

**Date:** 2026-05-30
**Status:** Approved (sequence) — Stage 1 to be designed in detail next
**Type:** Decomposition / roadmap (parent doc; each stage gets its own design spec)

---

## 1. Context

CreativeOS is an internal canvas-based asset-generation tool for a creative/marketing
studio. The MVP wedge: **help designers create the prompt, image, and video assets for a
reel without switching between multiple AI tools** (GPT, Claude, Gemini, OpenArt, etc.).

Full product intent is captured in `CreativeOS MVP PRD.md`. This document is **not** a
restatement of the PRD — it records the **build strategy**: how we slice the PRD into
shippable stages, and the decisions that frame every stage.

### Goal driving this plan
- **Ship to real designers.** Each stage must be genuinely usable in a designer's real
  workflow — not a demo, not a throwaway. Pragmatism over architectural completeness.

---

## 2. Locked decisions

| Decision | Choice | Why |
|---|---|---|
| **Persistence** | **Supabase** (Postgres + Storage + Auth + Edge Functions) | The PRD forces a server boundary on day one (see §3). Supabase gives a frontend dev a real DB, file storage, and a place to hold API secrets without running servers. Postgres also makes the relational *archive bundle* (PRD §16) clean. |
| **Frontend** | **React + Vite** | Standard, fast, matches developer fluency. |
| **Canvas** | **React Flow (`@xyflow/react`)** | Purpose-built for node/edge editors; nodes & edges are plain data arrays we own, mapping ~1:1 onto Supabase tables. (tldraw = wrong abstraction; hand-rolled = reinventing React Flow.) |

---

## 3. Why a backend is required from day one

Three properties of the PRD make pure local-first impossible for real designers:

1. **Generation needs secrets.** Every Generate / Parse / Process action calls an LLM,
   image, or video model. Those API keys cannot live in browser code → need a
   server-side function (Supabase Edge Function) to hold keys and make the call.
2. **Video generation is long-running and async.** Submit job → poll → resolve. Job
   state must survive a page refresh → needs durable server-side state.
3. **Archives + client KB are shared and durable.** PRD §16 archive bundles and the
   reusable client KB are explicitly persistent and reviewable later → not browser-local.

**Takeaway:** persistence cannot be deferred to a later stage. Stage 1 already needs
durable storage; the data-model "spine" is built once, in Stage 1, and reused unchanged
through Stage 5.

---

## 4. Slicing approach

**Chosen: Vertical slices — one usable capability at a time.**
Build one node type end-to-end per stage (persist + UI + AI action + history), in the
dependency order the PRD's own pipeline dictates.

Approaches considered:
- **A. Vertical slices** *(chosen)* — every stage is genuinely usable; cost is paying the
  "spine tax" (reusable substrate) up front in Stage 1.
- **B. Horizontal layers** — rejected: nothing usable until late, violates the core goal.
- **C. Thin end-to-end thread** — rejected: produces a demo, not shippable increments.

> The dependency order is not arbitrary — a Prompt node is useless with nothing to connect
> to; Image Gen is useless without a prompt. **The PRD's pipeline _is_ the build order.**

---

## 5. The five stages

Each stage ships standalone value and **reuses** the prior stage's foundation (additions,
not rewrites). The data model built in Stage 1 is still the one in use at Stage 5.

### Stage 1 — Persistent canvas + Brief node
- **Ships:** Create a client/canvas, parse a brief (upload/paste → Parse), keep every
  parse in version history. Replaces one tool-switch immediately.
- **Builds the spine:** clients → canvases → nodes data model; version log; file storage;
  first secret-holding Edge Function.
- **New concepts:** node data model · append-only version log · secrets in an Edge
  Function · file storage.

### Stage 2 — Text + File nodes + edges + Prompt node
- **Ships:** Compose brief + notes + references into a generated image prompt. This is the
  **connections & context-engineering** stage.
- **New concepts:** edges as data · resolving upstream inputs · context compilation · the
  three input levels (client context / canvas edges / inline files).

### Stage 3 — Image Gen node
- **Ships:** Brief → prompt → image, with multiple attempts you approve/reject and set
  active. The core loop, end to end.
- **New concepts:** master-controls schema vs selected values vs **attempt snapshot** ·
  the visible final compiled prompt · active-output pointer · stale-downstream detection.

### Stage 4 — Video Gen node
- **Ships:** Approved image → video (image-to-video). Full reel-asset pipeline.
- **New concepts:** long-running async **job state machine** (submit → poll → resolve).

### Stage 5 — Archive + Client KB in prompts
- **Ships:** Complete a project; review exactly how each output was made. The learning
  payoff (PRD §16 archive bundle + reusable client context).
- **New concepts:** relational bundle assembly · reusable client-level context selection.

---

## 6. Concept map (where each thing is learned)

| Concept | Introduced in |
|---|---|
| Node model (type + JSONB data) | Stage 1 |
| Append-only version log + active pointer | Stage 1 |
| Secrets via Edge Functions | Stage 1 |
| File storage | Stage 1 |
| Edges as adjacency-list data | Stage 2 |
| Upstream input resolution & context compilation | Stage 2 |
| Three input levels | Stage 2 |
| Schema vs selected-values vs attempt-snapshot | Stage 3 |
| Final compiled prompt (pure function, snapshotted) | Stage 3 |
| Active-output pointer + stale detection | Stage 3 |
| Long-running job state machine | Stage 4 |
| Relational archive bundle | Stage 5 |

---

## 7. Next step

Design **Stage 1 (Persistent canvas + Brief node)** in full detail as its own spec —
including the concrete Supabase schema for `clients` / `canvases` / `nodes` /
`node_versions`, how the canvas persists React Flow state, and how the Brief-parse Edge
Function works. That spec is where the data-modeling and graph concepts get pinned down
concretely.
