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
| **App framework** | **Next.js (App Router)** | One TypeScript codebase for frontend + server, one Node runtime, one deploy. Server logic (model calls, brief parsing) lives in Route Handlers / Server Actions with full npm access. Collapses the secret trust-boundary to "Server Action vs Client Component." |
| **Data layer** | **Supabase** (Postgres + Storage + Auth) | A backend is forced on day one (see §3). Supabase gives a real DB, file storage, and auth without running servers. Postgres makes the relational *archive bundle* (PRD §16) clean. **No Supabase Edge Functions for MVP** — server code lives in Next.js instead. |
| **Canvas** | **React Flow (`@xyflow/react`)** | Purpose-built for node/edge editors; nodes & edges are plain data arrays we own, mapping ~1:1 onto Supabase tables. (tldraw = wrong abstraction; hand-rolled = reinventing React Flow.) Client-only (`'use client'`). |

> See **§7. Key decisions (ADR log)** below for the full reasoning, alternatives rejected,
> and parked items behind these choices.

---

## 3. Why a backend is required from day one

Three properties of the PRD make pure local-first impossible for real designers:

1. **Generation needs secrets.** Every Generate / Parse / Process action calls an LLM,
   image, or video model. Those API keys cannot live in browser code → need a
   server-side function (a Next.js Route Handler / Server Action) to hold keys and make
   the call.
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
  first secret-holding Route Handler.
- **New concepts:** node data model · append-only version log · secrets in a server Route
  Handler · file storage.

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
| Secrets via server Route Handlers | Stage 1 |
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

## 7. Key decisions (ADR log)

Each entry records *what* we chose, *why*, and *what we rejected*, so decisions aren't
silently re-litigated. Append new decisions here as they're made.

### D1 — Stack: Next.js + React Flow + Supabase
**Decision.** Next.js (App Router) + React Flow + Supabase (Postgres + Storage + Auth).
Secret-holding server logic (model calls, brief parsing, generation) lives in Next.js
Route Handlers / Server Actions. **No Supabase Edge Functions for MVP.**
**Why.** One TS codebase + one runtime + one deploy; full npm (Anthropic SDK, `.docx`/`.pdf`
parsers); trust boundary collapses to "Server Action vs Client Component."
**Rejected.** Vite + Edge Functions (split Deno runtime/deploy); pure local-first
(impossible — secrets + long jobs + shared state); Firebase (graph/archive awkward).
**Watch-items.** React Flow is client-only; serverless time limits make the submit→poll
design for video gen (Stage 4) mandatory.

### D2 — Slicing: vertical slices, one usable node-capability per stage
**Decision.** One node type end-to-end per stage, in PRD-pipeline order (the five stages).
**Why.** Goal is shipping usable increments; only vertical slices make every stage usable.
**Rejected.** Horizontal layers (nothing usable until late); thin end-to-end thread (a demo,
not shippable increments). **Cost accepted:** Stage 1 carries the "spine tax."

### D3 — Reusable node template: one lifecycle, two varying steps
**Decision.** Every node shares `resolveInputs → compile → runAction → writeVersion →
setActive`; **only `compile` + `runAction` are type-specific.**
**Why.** PRD describes every node as Inputs→Action→Output→History. Stages 2–5 become "fill
in compile + runAction." `compile` is a pure function = testable + the visible "final
compiled prompt."

### D4 — Version envelope: append-only event log, uniform shape
**Decision.** All AI actions append to one table `node_versions` with a uniform envelope
(`inputs_used`, `params_used`, `model_used`, `output`, `error`, `decision`, `note`,
`operator`, `created_at`). Brief "parse", Prompt "generate", Image "attempt" = same shape.
**Why.** History *is* the product ("learn from every attempt"); append-only history makes
compare/restore free. **Rejected.** Overwriting output on the node — destroys history.

### D5 — Active output: a pointer (cache), not truth
**Decision.** Each node has nullable `active_version_id`; restore = move the pointer;
history never mutated.
**Why.** Event-sourcing shape — the log is truth, the pointer caches "which event is
current." Restore/compare/undo fall out safely.

### D6 — Client context is ambient, not an edge
**Decision.** Client context is reached via `node → canvas → client` (FK walk), not edges.
Always available to every node.
**Why.** Matches PRD §9.1; edges would clutter canvases and force re-wiring. Two resolution
mechanisms: ambient = walk parent FKs; explicit = walk the edge graph.

### D7 — Client context Stage 1: thin, whole-included, upgradeable
**Decision.** Stage 1 = one `clients.context_notes` field, included whole when a node opts
in via `nodes.data.client_context: "all" | "none"` (a toggle), which upgrades for free to a
selection list `["item-id", …]` when context grows. `resolveInputs` branches on shape.
**Why.** At MVP scale context is tiny vs a ~200K window — rationing solves a non-problem.
The real lever is *selection*, not *quantity*; JSONB makes toggle→multi-select migration-free.
**Parked — the "context slider."** A "% of context" slider needs relevance ranking =
**RAG/vector search** (PRD §18 out of scope). **Revisit when:** a client KB outgrows the
context window → add retrieval; the slider is its UI.

### D8 — Edges point to nodes; resolution follows the active version
**Decision.** Edges store `source_node_id`/`target_node_id` (+ handles), pointing to a
**node**. Resolution reads the source node's current `active_version_id`. (Future option:
`pinned_version_id` to freeze a connection.)
**Why.** Answers PRD §20 ("active output vs specific version?"): default = follow active.
**Status.** Table designed now; **built in Stage 2.**

### D9 — Staleness is derived on read, never stored
**Decision.** Detect stale downstream by comparing each upstream node's current
`active_version_id` against the upstream id recorded in the downstream node's latest
`inputs_used`. Mismatch → stale badge. No `is_stale` column, no triggers.
**Why.** Derived-recomputable beats stored-must-sync (no races/drift); the ids are already
stored. **Status.** Designed now; surfaces in Stage 3.

### D10 — Type-specific data via JSONB ("narrow waist")
**Decision.** Uniform columns for machinery (`type`, `position`, `active_version_id`);
flexible `nodes.data` + version payload JSONB for per-type content/params. No
table-per-node-type.
**Why.** Each type has a different shape; JSONB avoids a migration per PRD field change while
keeping shared plumbing.

### D11 — Minimal graph behavior; the human is the scheduler
**Decision.** MVP graph burden = directed edges + cycle check (Stage 2) + version-compare
staleness (Stage 3). No topological sort, auto-branching, auto-rewiring, or graph
intelligence.
**Why.** PRD §15 makes the designer manually trigger each node, so the system never runs the
whole graph in order — removing the need for scheduling algorithms. Learn graph concepts
just-in-time.

### Parked / out-of-scope (with revisit triggers)
| Item | Status | Revisit when |
|---|---|---|
| Context "% slider" / relevance ranking | Parked (D7) | Client KB outgrows the context window → add RAG |
| Full client KB (structured + files + selection) | Deferred | Stage 5 |
| Multi-tenant auth | Out of scope (PRD §18) | Post-MVP external access |
| Automated branching / auto-rewiring | Out of scope (PRD §15) | Not planned |
| Edge `pinned_version_id` (freeze a connection) | Optional extension (D8) | If "don't auto-follow active" is ever needed |

---

## 8. Next step

The reusable spine — node lifecycle, the node×input-kinds matrix, the version envelope, and
the full Supabase schema — now lives in its own reference:
**`2026-05-30-creativeos-architecture.md`**.

Next, design **Stage 1 (Persistent canvas + Brief node)** as its own build spec — how the
canvas persists React Flow state (load/save, debounced writes, client-generated UUIDs), the
Brief node UI + upload/paste flow, the Brief-parse Route Handler (holding the model key),
and Stage 1 scope cuts (e.g. which brief formats to support first). It will reference the
architecture doc for the schema rather than restating it.
