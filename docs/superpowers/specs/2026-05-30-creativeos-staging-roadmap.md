# CreativeOS — Staging Roadmap

**Date:** 2026-05-30 (status updated 2026-06-18)
**Status:** Approved (sequence). **Stages 1–3 shipped + Stage 4 part 1 shipped** — all on `main`.
- **Stage 1** — Script node (D16) + Client KB pulled forward (D17).
- **Stage 2** — edges + cycle check, Text node, **File node** (vision + extraction), Prompt node
  (resolve → compile → generate, image-prompt v2), **Shot fan-out (D21)**. Canvas UX: right-click
  add-node, box-select + multi-delete, connected-input detail view.
- **Stage 3 — Image Gen node ✅ shipped** (merged via PRs #10/#11): config-driven provider registry
  (OpenAI + Gemini), per-attempt cost (USD/INR), reference images, approve/reject (`decision:
  "pass"|"fail"`), zoomable output. Spec: `2026-06-17-image-gen-node-design.md`. **Output contract:
  a node's active output is a public image URL *string*.**
- **Stage 4 part 1 — Video Prompt node ✅ shipped** (this session, merged to `main`): synchronous
  text-LLM that vision-reads the approved Image Gen still and writes a Veo motion prompt, steered by
  camera/speed master controls (**D24**). Plan: `docs/superpowers/plans/2026-06-18-video-prompt-node.md`;
  how-it-works walkthrough: `docs/architecture/2026-06-18-video-prompt-node-walkthrough.md`.
**Generation-execution model (this session):** ADR **D26** + `docs/architecture/2026-06-18-generation-execution-flows.md`
— one `generations` substrate, **duration-driven**: synchronous in-request for fast image, async
submit→reconcile→graduate for video / slow image. PRD §11.6/§11.7/§20 now note async generation.
**Eval flywheel:** Step 1 shipped (**D22**, `node_versions.generated_output`). Remaining (not built):
②accumulate ③error-analysis viewer ④evals.
**👉 NEXT SESSION — Stage 4 part 2: the Video Gen node (the async half).**
Spec: `2026-06-18-stage-4-video-gen-node-design.md` (ADRs **D24/D25**); flows:
`docs/architecture/2026-06-18-generation-execution-flows.md`. This is the **first genuinely async
node** — the only part of the spine the synchronous request/response pattern can't carry. Build:
**(1)** the `generations` table (migration `0007_generations.sql`, `queued→running→succeeded/failed`,
`provider_job_id`, `version_id`); **(2)** a new Gemini/**Veo** provider client (`lib/google/server.ts`,
needs `GEMINI_API_KEY`); **(3)** the submit route `POST /api/nodes/:id/video` (compile → Veo submit →
insert generations row); **(4)** the **Vercel Cron** reconciler `GET /api/jobs/reconcile` (Veo is
poll-based, no webhook) that **graduates** a terminal job into a `node_versions` row + `setActive`;
**(5)** Supabase Realtime push to the canvas. It consumes the **Video Prompt node's active output**
(motion text) + the **Image Gen still** (start frame) — the *diamond*.
Open before starting: topology authority is the **Video Prompt spec §2 / PRD §9.2,§10** (the
video-gen spec §1 was reconciled to defer to it — `prompt → video-gen` is retained as inline
fallback); `video-prompt → video-gen` is already in `VALID_CONNECTIONS`; graduation must be
**idempotent** (handler-or-Cron closer); D9 staleness badge still unbuilt. `main` is current and
synced — branch off `main` (e.g. `feat/video-gen-node`).
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

### Stage 1 — Persistent canvas + Brief node  ✅ *shipped (as the Script node — see D16)*
- **Ships:** Create a client/canvas, parse a brief (upload/paste → Parse), keep every
  parse in version history. Replaces one tool-switch immediately.
  *(As built: the node shipped is the **Script node** — parses a finished reel script; the
  **Brief node** (upstream-brief parsing) remains a defined MVP node type, retained for later,
  not removed — and the **Client KB was pulled forward** here, reversing D7. See D16, D17.)*
- **Builds the spine:** clients → canvases → nodes data model; version log; file storage;
  first secret-holding Route Handler.
- **New concepts:** node data model · append-only version log · secrets in a server Route
  Handler · file storage.

### Stage 2 — Text + File nodes + edges + Prompt node + Shot fan-out
- **Ships:** Compose brief + notes + references into a generated image prompt. This is the
  **connections & context-engineering** stage. **Shot fan-out** (D21) turns one parsed script
  into N independent **Shot** nodes, so the pipeline expresses *1 script → N shots → N images*.
- **New concepts:** edges as data · resolving upstream inputs · context compilation · the
  three input levels (client context / canvas edges / inline files) · **shot fan-out
  (seed-and-fork; the shot is the through-line) (D21)**.

### Stage 3 — Image Gen node  ✅ *shipped (PRs #10/#11)*
- **Ships:** Brief → prompt → image, with multiple attempts you approve/reject and set
  active. The core loop, end to end.
- **New concepts:** master-controls schema vs selected values vs **attempt snapshot** ·
  the visible final compiled prompt · active-output pointer · stale-downstream detection.
- *(As built: config-driven OpenAI+Gemini provider registry, per-attempt USD/INR cost, reference
  images, `decision: "pass"|"fail"`. Active output = a public image URL string. Spec:
  `2026-06-17-image-gen-node-design.md`.)*

### Stage 4 — Video Prompt node → Video Gen node *(decomposed into two nodes — D24)*
- **Part 1 — Video Prompt node ✅ shipped** (synchronous LLM; vision-reads the approved still and
  writes a Veo motion prompt, camera/speed master controls). **Part 2 — Video Gen node 🔜 NEXT**
  (the async Veo job). The **diamond**: `image-gen` feeds both — the Video Prompt node (as a vision
  reference) and the Video Gen node (as the literal first frame).
- **Ships:** Approved image → motion prompt → video (image-to-video). Full reel-asset pipeline.
- **New concepts:** long-running async **job state machine** (submit → reconcile → resolve;
  `generations` row graduates into a `node_versions` row — D25) · **fork-and-rejoin (diamond)
  topology** · **vision-grounded prompt generation** · synchronous vs async `runAction`.
- **Specs:** `2026-06-18-video-prompt-node-design.md` (part 1, built first),
  `2026-06-18-stage-4-video-gen-node-design.md` (part 2).

### Stage 5 — Archive + Client KB in prompts  🟡 *Client KB built early (D17); archive bundle still pending*
- **Ships:** Complete a project; review exactly how each output was made. The learning
  payoff (PRD §16 archive bundle + reusable client context).
- **New concepts:** relational bundle assembly · reusable client-level context selection.
  *(The reusable Client KB half landed in Stage 1 — see D17. What remains for Stage 5 is the
  **relational archive bundle**.)*

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
| Shot fan-out (seed-and-fork; shot as through-line node) | Stage 2 (D21) |
| Schema vs selected-values vs attempt-snapshot | Stage 3 |
| Final compiled prompt (pure function, snapshotted) | Stage 3 |
| Active-output pointer + stale detection | Stage 3 |
| Vision-grounded prompt generation (read the frame to write motion) | Stage 4 (D24) |
| Fork-and-rejoin (diamond) topology | Stage 4 (D24) |
| Long-running job state machine (`generations` graduates into `node_versions`) | Stage 4 (D25) |
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

### D12 — Async generation infra: job table + Supabase Realtime (no queue infra)
**Decision.** Stages 3–4 generation is tracked as rows in a `generations` table
(`queued → running → succeeded/failed`); results are pushed to the UI via **Supabase
Realtime** (not polling). No Redis/SQS/BullMQ/workers.
**Why.** Model providers are themselves async (submit → `job_id` → result), so *they* absorb
the compute queue; internal concurrency is low. A DB table + Realtime *is* the starter queue.
**Revisit when:** own GPU inference, high concurrency, or complex retries/fan-out create real
backpressure.

### D13 — MVP infra philosophy: "the table is the starter queue"; rent async from providers
**Decision.** Minimum viable infra = Vercel (Next.js) + Supabase (Postgres + Storage +
Realtime; Auth later) + model-provider APIs. No Redis/queue/Docker/k8s/worker fleet for MVP.
Large media (images/videos) live in **object storage**, never Postgres — the DB stores only
the path. Durable job state in the DB is the one async piece we cannot skip.
**Why.** Queues exist for backpressure across high concurrency / your own compute — neither
applies to an internal MVP. Start with a `status` column + Realtime; graduate to real queue
infra only when a named pressure forces it.

### D14 — Stage 1 auth: none yet
**Decision.** Ship Stage 1 as an open app (private/internal URL); add Supabase Auth in a
later stage.
**Why.** PRD §18 puts multi-tenant auth out of scope; speed to a usable increment.
**Consequence.** `node_versions.operator` is generic/empty until auth exists; no RLS yet
(server uses the service-role key; secrets never reach the client).

### D15 — Stage 1 brief input formats: paste + `.md`/`.txt` only
**Decision.** Stage 1 accepts pasted text and `.md`/`.txt` uploads — plain text, handled
identically (read as text, no parsing libraries). `.docx`/`.pdf` extraction deferred.
**Why.** Keeps Stage 1 lean and avoids document-parsing edge cases; Markdown/text covers the
common internal case.

### D16 — Stage 1 ships the "Script node"; the "Brief node" is retained for later *(recorded 2026-06-08; amended 2026-06-09)*
**Decision.** The node Stage 1 *ships* is a **Script node**, not the Brief node. Its job is to
parse a **finished reel script** (uploaded `.md`/`.txt` or pasted) into a structured output,
reviewed/edited in a full-screen **Script focus view** (EMPTY → SKELETON → PARSED). The
**Brief node remains a defined MVP node type** (PRD §11.2) — **retained for later, not built
and not removed**: it parses an *upstream brief* into structured context, for projects that
start from a brief rather than a written script.
**Why.** The real first-tool-switch we remove is turning a written script into structured,
editable asset-ready fields — not summarizing an upstream brief — so the Script node was the
higher-value Stage-1 slice. Both share the same spine (parse via a secret-holding Route
Handler, append-only `node_versions`, active pointer); only the node's semantics differ, so
**adding the Brief node later is a `compile` + prompt swap, not new architecture (D3)**.
**Originated.** `2026-06-06-script-parse-kb-context-design.md` (parse + KB slices),
`2026-06-07-script-focus-view-design.md` (Sheet-free 3-state focus view).
**Amends, not supersedes.** §5 Stage 1 and §6 now describe the Script node as the *shipped*
Stage-1 node; the Brief node's PRD definition (§11.2) stands, retained for a later stage. The
original `data.parsed` storage in this entry was later corrected by **D19** (single-source
output — no display cache).

### D17 — Client KB pulled forward into Stage 1; reverses D7 *(recorded 2026-06-08)*
**Decision.** Replace D7's thin `clients.context_notes` text field with a real **versioned
Brand KB** built now: document uploads + vision-analyzed brand images → an append-only
`client_kb_versions` extraction log with an `active_kb_version_id` pointer and a `kb_status`
gate (`pending → in_review → ready`). Script parsing injects user-selectable **KB slices**
(compliance, tone, personality, brand profile) as context.
**Why.** Parse quality depends on brand voice/compliance context; the thin `context_notes`
field could not carry it, so the Stage-5 "full client KB" was pulled forward because Stage 1's
own output needed it. The KB deliberately **reuses the spine pattern** (append-only versions +
active pointer, mirroring `node_versions`).
**Consequence.** `context_notes` was built then dropped (`0003_kb_onboarding.sql`); D7's
"context slider" remains parked. The Stage-5 **archive bundle** is still unbuilt.
**Originated.** `0002_client_kb.sql`, `0003_kb_onboarding.sql`,
`2026-06-06-script-parse-kb-context-design.md`.

### D18 — A version is an LLM attempt; manual edits fold into the active version *(recorded 2026-06-08)*
**Decision.** A `node_versions` row is created **only when the model runs** (parse, Re-extract,
and failed attempts). A version's `inputs_used` / `params_used` / `model_used` are **frozen**
(the provenance of the attempt); its **`output` is human-refinable**. A manual edit + Save
updates the **active version's `output` in place** — it does **not** append a new row. No LLM,
no new version.
**Why.** For a creative tool you want to compare *model attempts*, not replay every keystroke;
per-edit versions are noise. This keeps compare/restore across attempts intact while making the
edited/approved result the thing downstream consumes.
**Refines D4/D5.** "Append-only" now means append-only over the *set of LLM attempts*; the
active version's `output` is mutable working state. The immutable record is *(inputs, params,
model)*, not `output`.
**Consequence / gap to close.** Today Save writes edits to `data.parsed` (display cache) only —
**not** the active version's `output`. The fix is folded into **D19** (drop the cache; the active
version's `output` becomes the single source). `listVersions` exists but is still unused (no
history/restore/compare UI yet).

### D19 — Node = own content + output; output has a single source (no display cache) *(recorded 2026-06-08)*
**Decision.** A node holds **three kinds of data**, stored distinctly:
1. **Machinery** — `id`, `type`, `position`, `active_version_id` → `nodes` columns.
2. **Own content / params** — `title`, `description`, attachments, `source`, control values,
   `kbSlices` → `nodes.data` jsonb (+ Storage/child rows for files). **Human-authored, one
   editable copy on the node, not versioned.**
3. **Output** — the model-produced result (parsed script, image) → `node_versions.output`,
   append-only (D18). **The active version's `output` is the single source of truth.**

Rendering a node = its own fields (from the `nodes` row) **+** its current output (from the
active version, via a join on canvas load / a small `GET`). **Drop `nodes.data.parsed`** — it
was a duplicate of `node_versions.output`. Manual edits `UPDATE` the active version's `output`
(D18); restore = repoint `active_version_id` and display follows automatically.
**Why.** Output lived in two places (`data.parsed` *and* the version log), which can drift — the
exact Stage-2 bug (downstream reads the log, display reads the cache). One source removes the bug
class entirely; the only read it optimized (canvas load) is one cheap `JOIN`, so the cache was
all cost, no benefit. Own content is *not* a duplicate of anything, so it stays on the node.
**Provenance.** A version snapshots *which* own-content/params it consumed (by reference: source
hash, attachment ids, `kbVersionId`) in `inputs_used`/`params_used` — so an attempt remembers
what produced it even after the node's fields change. This is also what powers staleness (D9).
**Test for "where does a field go?"** Did a model produce it *and* do you compare/restore it
across attempts? Yes → version log. No (human-authored identity/config) → on the node.

### D20 — A node's output is edited at the source, never overridden downstream *(recorded 2026-06-11)*
**Decision.** A node's output is owned and edited **only at the node that produces it**. A
downstream consumer (e.g. a Prompt node reading a connected Script/Note) **never** keeps an
editable copy or per-consumer override of an upstream node's output. Connected-input views are
**read-only mirrors** of the upstream node's current output. To change the context feeding a
consumer, edit it at the source: edit the **Note** node's content (its content *is* its output),
or edit the **Script** node's output (folds into its active version, D18). Those edits then flow
to *every* consumer of that node, live.
**Why.** A per-consumer override copies upstream output downstream and freezes it, re-introducing
the exact two-sources-of-truth drift D19 just removed — the consumer's frozen copy silently goes
stale when the source changes, and the pattern doesn't generalize (an N-node graph would sprout
copies everywhere, and the graph stops being the source of truth). Editing at the source keeps one
authoritative copy per node and preserves the graph's reactivity. If a consumer ever genuinely
needs hand-authored context distinct from an upstream node, that context is itself a **node**
(a Note), edited at its own source — not an override stashed on the consumer.
**Consequence.** Connected/upstream panels render upstream output read-only; the affordance for
changing them is "edit at the source node," not an inline editor on the consumer.

### D21 — A script fans out into Shot nodes; seed-and-fork, mark don't block *(recorded 2026-06-11)*
**Decision.** A reel is **1 script → N shots → N images → N clips → 1 reel**. The shot — not the
whole script — is the unit of generation. A human-triggered **"Fan out shots"** action on a
parsed Script **materializes each shot into its own first-class `Shot` node** (seed-and-fork):
- A **`Shot` node** carries `{ script, order, seededFrom }`, where `script` is the parent
  `ReelScript` **narrowed to its single shot** — *"a Script node with one shot."* It keeps the
  full metadata (objective, on-screen text, voiceover, caption, …), not just the shot line
  (**amended 2026-06-12** — originally just the shot description). Like the Text/Note node, its
  **content *is* its output** — no AI, no version log (D19/D20). *For image prompts the carried
  script is rendered via `renderShotForImage`, which keeps only the visually-actionable fields
  (**refined by D23, 2026-06-16** — was `renderScriptAsText`).* It feeds a
  `Prompt → Image` now and a Video clip in Stage 4; its shot `duration` + `order` are what the
  Stage-5 reel assembly needs. The shot is the **through-line** of the whole pipeline.
- Fan-out is a **one-time copy**, not a live link. Each Shot gets a fresh permanent id and is
  **independent thereafter**; later edits to the script do **not** propagate. A **dashed
  Script → Shot lineage edge** is drawn for provenance (**amended 2026-06-12** — originally "no
  edge"): it is *visual only* — resolution never traverses it (a Shot returns its own carried
  `script`; nothing queries a Shot's upstream), so the seed-and-fork guarantee holds. The dashed
  style is derived from node types (script→shot) at render time, so no schema change. The origin
  is also recorded as `seededFrom = { scriptNodeId, shotIndex, scriptTitle }`.
- **Mark, don't block (D9).** Re-extracting the script stays **enabled** (append-only, D4/D18 —
  non-destructive). `seededFrom` lets a Shot derive a "script updated since fork" signal on read.
  *MVP ships a provenance label* ("Shot 2 of '…'"); the version-comparison **staleness badge ships
  with D9 in Stage 3** (it needs the script's active-version id exposed client-side).
**Why.** Live-linking shots to the script would require matching a **non-deterministic LLM
re-parse** back to stable shot ids — unsolvable cleanly; referencing by array index is even more
fragile (insert one shot → every downstream points at the wrong visual). Forking once into nodes
with stable identity dissolves the problem — the same lesson as D19/D20, one level up: *anything
downstream depends on wants stable identity, and in this app that identity is a **node**, not an
array element inside another node's output.* "Mark, don't block" follows the D4/D5/D9 spine:
flag the consequence on read, never freeze the edit.
**Relation to D11 / §15.** Fan-out runs only on an explicit human click — a bulk **manual** action
(the §15 "duplicate node" philosophy, applied to shots), not the system auto-running or
auto-rewiring the graph. It creates the Shot nodes plus a **dashed lineage edge** per shot
(provenance, not a live data edge); the human still wires each functional `Shot → Prompt`. This is
a bounded carve-out of "no auto-branching," consistent with D11 (the human remains the scheduler).
**Scope.** Rounds out Stage 2 (the connections/context-engineering stage) and bridges to Stage 3
(per-shot image generation). The Image Gen node itself stays Stage 3.

### D22 — Preserve the raw model generation; `output` is the editable working copy *(recorded 2026-06-14)*
**Decision.** Add an immutable `node_versions.generated_output` (jsonb): the model's
output **as produced**, written once at generation and never mutated. The existing
`output` stays the **human-editable** working copy (D18 unchanged). A manual edit still
folds into `output` in place; it never touches `generated_output`. Both Script and Prompt
edits funnel through the same `updateActiveVersionOutput`, so one `insertVersion` change
covers both nodes; the edit path needs no change at all (it already updates only `output`).

### D23 — A Shot's image context is trimmed to the visually-actionable fields *(recorded 2026-06-16; refines D21)*
**Decision.** When a `Shot` node feeds a **Prompt → image**, render only the **shot's own visual
description** + the **production medium** (`ai_production_type`), via a dedicated
`renderShotForImage`. Drop the rest of the carried reel script — title, type, duration,
strategic objective, on-screen text, voiceover, music & sound, caption, CTA, thumbnail hook.
D21 still holds (the Shot *carries* the full narrowed script, with stable node identity); this
only changes how that script is **flattened for an image prompt**. The full-reel
`renderScriptAsText` is unchanged and still used by **Script** nodes (which legitimately want the
whole brief as downstream text context).
**Why.** A Shot feeds **one reference image**, not a reel. Reading the 20 real Run-01 eval
`shotText`s ([run-01 doc](../../evals/2026-06-14-run-01-prakriti-image-prompt-bootstrap.md)): of
~14 labelled fields, **exactly one** (the shot description) describes what's in frame — the visual
signal is ~5–10% of the context by word count. The rest is **audio / marketing / overlay copy**
that actively hurts an image prompt:
- **Drives homogeneity** (the dominant Run-01 failure). `strategic_objective` has only three
  values across the campaign, keyed to reel type — every VISUAL shot is told, identically, *"create
  product desire through tactile, cinematic, slow luxury visuals,"* manufacturing the one
  lens/lighting/palette recipe the eval flagged. `title`/`caption`/`production` re-assert the same
  brand tone the **Brand-context (KB) block already supplies** — double-dosing.
- **Risks baked-in text.** `on_screen_text`, `caption`, `cta`, `thumbnail_hook` are *overlay* copy
  composited in post, not things in the photographed scene — feeding them invites garbled rendered
  text in the reference plate (and `caption` even carries the FDA compliance words the prompt's
  never-use rule fights).
- **Pure noise.** `type`, `duration`, `voiceover` ("No voiceover…"), `music_sound` (a repeated
  ~50-word boilerplate × 20) carry zero visual information.

Brand palette + casting come from the KB block; lens/composition/lighting from the descriptive
Shot controls (§11.5/§12, D-prompt-controls). So the per-shot text should carry only the subject
and the medium — orthogonal to the prompt-template fix (`prompt-generate` v3).
**Relation to D22 / the eval flywheel.** This is a **context** change, separable from the prompt
template. To A/B the trimmed context against the original, a **global switch** `renderShotContext(script, mode)`
sits behind both renderers, with the mode resolved from the **`SHOT_CONTEXT_MODE`** env var
(`shotContextMode()`): unset/anything → `minimal` (D23 default); `=full` → the pre-D23 full-reel
`renderScriptAsText`. The switch drives **both production *and* the eval-bootstrap route** (which
also records the arm in `inputs_used.contextMode`), so a **Run-02** against the frozen 20-shot
fixture isolates context as the single variable: run once `minimal`, once `SHOT_CONTEXT_MODE=full`,
compare homogeneity. It is **app-wide, not per-experiment** — you can't run both arms at once; flip
the env var and re-run. Keep any `prompt-generate` change out of the same run or attribution is lost
(Run-01 doc §3).
**Scope.** Two pure functions (`renderShotForImage`, `renderShotContext`) + a one-line env reader
(`shotContextMode`) + the `getNodeOutput` `case "shot"` line + the eval route. No schema change; the
Shot node still stores the full narrowed `script`, so flipping the switch needs no re-fan-out.
**Why.** This is the **rail for the eval flywheel** (Step 1 of 4): the highest-value signal
for improving a prompt is the *correction* — *model wrote X, human shipped Y* — and today an
edit overwrites X, destroying it (the one time-sensitive gap: lost signal is unrecoverable).
`generated_output` and `output` answer **two different questions** — *"what did the model
produce?"* (frozen provenance, an attribute of the attempt like `inputs_used`/`params_used`/
`model_used`) vs *"what does the node currently hold/feed downstream?"* (mutable state) — and
are **meant to diverge** after an edit; that divergence *is* the data.
**Refines D18/D19.** D18's "append-only over LLM attempts" now freezes *(inputs, params,
model, **generated_output**)*; `output` remains mutable. D19 is **intact** — `output` is still
the *single* source for display/downstream; `generated_output` is never rendered as the node's
current value, so it is **not** the drift-prone display cache D19 outlawed (a cache is two
fields meant to *match* that can drift; these are two fields meant to *differ*). "Was edited"
is derived (`generated_output IS DISTINCT FROM output`) — no stored flag.
**Scope.** Capture only — no diff (a mechanical, client-side display concern), no viewer, no
`decision`/`note` writes (those land in Step 3 error analysis), no per-save edit trail (two
points is what error analysis consumes; a trail reverses D18 for no current goal).
**Originated.** `2026-06-14-raw-generation-capture-design.md`.

### D24 — Stage 4 splits into Video Prompt → Video Gen; the motion prompt is its own node *(recorded 2026-06-18)*
**Decision.** Stage 4 ships **two** nodes, mirroring the image side (Prompt Stage 2 → Image Gen
Stage 3): a **Video Prompt node** (synchronous text-LLM; writes a Veo-ready *motion prompt*) then
a **Video Gen node** (async Veo job). The motion prompt is a **dedicated node type**
(`video-prompt`) — *not* (A) inline text on the Video Gen node, nor (B) a `target:'image'|'video'`
mode on the existing Prompt node. The Video Prompt node **vision-reads the approved Image Gen
still** to ground the motion in what's on screen, and exposes master controls (camera move /
motion speed) structured from the verified **Veo 3.1 prompting guide** (camera as a standalone
clause, no scene re-description — for image-to-video the frame already carries subject/setting/
style). Inline motion text on the Video Gen node is kept only as a **fallback** for quick tests.
**Why.** A good motion prompt is an *iterated, controlled, vision-grounded* artifact — it earns
versioned attempts (compare), the visible compiled prompt (D3), the eval flywheel (D22), and a
curated controls catalog, exactly like the image Prompt node. The image Prompt node itself is the
*wrong* host: it is hard-tuned for static frames (`prompt-generate` writes "image-generation
prompts for Nano Banana"; controls are lens/composition/lighting), so reusing it would feed Veo a
frozen-frame description. **C over B** was chosen for **canvas legibility** — designers read a node
labelled "Video Prompt" more easily than a hidden mode toggle. **Cost accepted:** some duplicated
machinery + new `VALID_CONNECTIONS` edges (`image-gen/shot/file/draw/text → video-prompt`,
`video-prompt → video-gen`). **Topology — the diamond:** the approved still is needed two ways, so
`image-gen` forks to **both** the Video Prompt node (vision reference) *and* the Video Gen node
(literal first frame), rejoining at Video Gen. A chain can't work — the Video Prompt node's output
is *text*, so the image would never reach Veo. **Amends the PRD** (§7 adds a Video Prompt node;
§9.2/§10 add its edges) — the original single-Prompt-feeds-both model (PRD §10 "Prompt node → Video
Gen node") is superseded for the default path, retained as the fallback.
**Originated.** `2026-06-18-video-prompt-node-design.md`.

### D25 — Async video job: a `generations` row graduates into a `node_versions` row *(recorded 2026-06-18; resolves D12 ↔ D4/D18)*
**Decision.** An in-flight Veo job lives in a new **`generations`** table
(`queued → running → succeeded/failed`, `provider_job_id`, `params`, `error`, `version_id`). On a
**terminal** state it **graduates** into a `node_versions` row — success writes `output` (the clip
storage path) + `setActive`; failure writes `error`. The `generations` row is the disposable async
*scratchpad*; `node_versions` only ever gains **finished** attempts. Veo's Gemini API is
**poll-based (long-running operation, no webhook)**, so a **Vercel Cron** route reconciles running
jobs (~1/min); results reach the canvas via **Supabase Realtime** (D12: "pushed, not polling").
Clip bytes live in Storage `outputs/`; the DB stores only the path (D13).
**Why.** D12 named a `generations` table; D4/D18 say "a `node_versions` row *is* the attempt" —
never reconciled. Async adds `running`/abandoned/retried states; routing that churn through
`node_versions` (a `status` column + in-place `UPDATE` of `output`) fills the append-only attempt
log — the thing the product treats as truth — with half-written rows. A disposable `generations`
table keeps the log clean while honoring "job state must survive a page refresh" (§3.2 — state is
in the DB, never the browser). **Rejected.** Status-on-the-version-row (simpler, but pollutes the
log and bends D18's append-only). **Refines D12.** The table D12 sketched is now built (Stage 4)
with an explicit *graduation* rule into `node_versions`.
**Originated.** `2026-06-18-stage-4-video-gen-node-design.md`.

### D26 — Generation execution is duration-driven; image & video share the `generations` substrate *(recorded 2026-06-18; generalizes D12/D25)*
**Decision.** Every Generate node runs **one execution model with two paths over the same
`generations` row**, chosen by **duration, not modality**:
- **Path A — synchronous.** Provider is request/response and finishes inside the serverless
  function budget (image models today). The Route Handler writes `generations(running)`, awaits the
  model, **graduates** into a `node_versions` row, and returns the finished asset in one request.
- **Path B — asynchronous.** Provider is a webhook-less long-running operation (Veo, D25) **or** a
  Path-A call exceeds its time budget. The handler submits, stores `provider_job_id`, returns
  "Generating…", and a **Vercel Cron reconciler** graduates the row later; Realtime pushes the
  result (D12).
The `generations` row is **always written**; the only difference is **who graduates it** (handler
vs Cron) and **when**. Path is selected **provider-contract-by-default** (each model adapter
declares request/response vs long-running-op), with a **time-budget fallback** that degrades A→B
**with no schema change**. Because either the handler or Cron may graduate, **graduation is
idempotent** — the `generations.version_id` latch + a guarded `UPDATE … WHERE status='running'`
makes it *one generation → at most one `node_versions` row*.
**Why.** D12 named the `generations` table and D25 specced its *graduation* rule, but both were
written **video-first**; image gen was only implied by D12's "Stages 3–4." Stating the model once,
modality-agnostically, stops the Stage-3 Image Gen node from inventing a synchronous shortcut
straight to `node_versions` — which would make the slow-image fallback and the Stage-4 reconciler a
*retrofit* rather than *reuse*. Duration, not "image vs video," is the real axis: image is
synchronous *because today's image APIs are*, and the same substrate reroutes a slow image model
with no new infra.
**Rejected.** (a) *Async-always* (route even fast image calls through Cron) — punishes the common
case with up to a Cron-tick of latency on a call that already finished. (b) *Image fully
synchronous, no `generations` row* — leaves no durable record when an image job stalls or a batch
backs up, and forces a rewrite the day an image model turns slow.
**Refines D12/D25.** D12's "Stages 3–4 … generations table" and D25's graduation rule now hold for
**both** modalities; D26 adds the synchronous closer and the idempotency latch. **D11 unchanged**
(the human still triggers each generation).
**Originated.** `docs/architecture/2026-06-18-generation-execution-flows.md` (full flows + diagrams).

### D27 — Image editing is a new *attempt* on the Image Gen node, not a new node *(recorded 2026-06-28; refines D18/D19/D20/D22; extends Stage 3)*
**Decision.** A targeted image edit (remove / replace / add an element while preserving the
rest of the frame) is modeled as a **new generation attempt in the existing Image Gen node's
append-only version log** (`insertVersion` → `setActive`) — **not** a new "Image Edit" node,
and **not** an in-place output edit (`updateActiveVersionOutput`). Because an edit calls the
model and produces new bytes, it **is** an LLM attempt (D18). The attempt's `inputs_used`
carries lineage breadcrumbs: `baseVersionId` (the attempt it was derived from), `intent`
(`remove`/`replace`/`add`/`freeform`), `instruction` (the edit text), `extraReferenceUrls` (e.g.
a product to add), and a **carried-forward** `promptVersionId` (the base prompt that seeded the
image family). The working `editInstruction` + `editIntent` live on `nodes.data` (human-authored
config, D19) and are snapshotted per attempt. The base image is *the node's current image* — a
prior attempt (`baseVersionId`) **or** a connected File/Draw reference (`baseImageUrl`); editing
an upload **reuses the existing connect-image-to-Image-Gen workflow, not a new node-spawning
case**. Mechanically the whole feature is the existing generate pipeline with only `compile`
swapped for a preservation `buildEditPrompt` (D3) — no second route, no Edit node, no
node-creation action. The UI surfaces the actions as **3 quick-action chips** (Remove/Replace/Add)
that set `editIntent` and pre-fill the instruction box. Each intent composes a **distinct**
template; the composed text is shown as an **editable Final prompt** the operator can override
before running (the sent text is recorded in `inputs_used.editPrompt`, D3). **No schema migration** —
breadcrumbs are `inputs_used` jsonb. The base prompt is
**recorded** on every variation but **not resent** to the edit model (instruction-only edits
preserve better — Gemini image-editing guide). Default to a Gemini editing model (Nano Banana
family); **suggest, don't hard-block** (D9/D21 "mark, don't block").
**Why.** A separate Edit node would place output on a different node than the original,
orphaning everything wired to it (breaks D19/D20) and re-introducing the per-image output-node
sprawl the PRD deleted (§8); it would also fragment the eval refinement trace across nodes.
Keeping edits as attempts in one log makes the journey (`generate → remove cup → add product`)
a single queryable lineage, and turns each edit instruction into an explicit **correction
label** — generalizing D22's generated-vs-shipped signal into the image domain (pixels can't be
hand-edited, so the AI edit *is* the correction). The chain preserves every "before" inherently
(each edit is a new row), so it needs no two-write trick.
**Rejected.** (a) A dedicated **Image Edit node** — breaks D19/D20, sprawls outputs (§8),
fragments the trace, and still needs most of the edit UI. (b) **In-place edit** via
`updateActiveVersionOutput` — that path is for manual edits with no model call; an AI edit runs
the model, so by D18 it must be a new attempt.
**Refines.** D18 (an edit that runs the model is an attempt — now applies to images),
D19/D20 (output stays single-source, edited at the source node), D22 (the before/after
correction signal extends to images via the edit chain). **D26 unchanged** — edits run on the
same duration-driven execution substrate (synchronous today).
**Originated.** `2026-06-28-image-editing-design.md`.

### D28 — Shot Composer: role-aware divergent ideation as a *capture-only* action on the Shot node *(recorded 2026-06-28; refines D21/D23; builds on D22)*
**Decision.** Add a **"Compose variations"** action on the Shot node that turns one thin shot
seed into **4 role-aware, divergent, production-ready ideas**. The designer **picks one** to
rewrite the shot's description (edit-at-source, D20), or **multi-selects** to **promote** extras
into **sibling Shot nodes** (one per idea, **no edges** — human wires each, D11/§15). Inputs: the
shot's **own** `data.script` run through `renderShotForImage` (the D23 trim) + a
**designer-picked role** (required; no inference) + KB compliance/tone/personality slices +
optionally a **vision-read reference image** wired to a new **image-grounding target handle** on
the Shot (image-typed upstreams only — `file`/`draw`/`image-gen`). The role catalog
(`shot-roles.ts`, 10 roles × `slots`/`avoid`) is a curated constant; "learned later" = refine it
from evals. A compose run writes a `node_versions` row (D22 freezes `generated_output = {ideas}`)
but is **NEVER made active** — so the Shot keeps rendering its own description (D19/D20 intact);
on pick, the row's `output` folds in `{selectedIndex, finalDescription}` (the eval signal). No
schema migration. Mechanically the route is ~the Video Prompt route (resolve KB+image →
`buildUserContent` vision → LLM structured JSON → `insertVersion`), minus `setActiveVersion`.
**Why.** Of the deep-research report's four ideas, three already exist (Prompt-node enrichment,
duplicate-to-compare §15, KB compliance). The genuine gap is **divergent ideation** + a **role**
concept the codebase lacked. Composing *after* fan-out (not a gate at fan-out) keeps fan-out
instant and preserves "the human is the scheduler" (D11). Capture-without-activation is D22's own
"two fields meant to differ" pattern (frozen provenance, not a second source of truth), so the
Shot's invariants hold. Seed-from-own-data + image-only grounding mean the dashed Script→Shot
lineage edge is never traversed (seed-and-fork, D21).
**Rejected.** (a) Compose-then-materialize **gate at fan-out** — a blocking review screen, fights
D11. (b) A dedicated **Shot Composer node type** — extra wiring/node. (c) **Role inference** —
less predictable than a picked role. (d) Feeding the composer `strategic_objective` — re-introduces
the Run-01 homogeneity D23 removed. (e) A user-facing **version panel** on the Shot — capture is
enough for MVP.
**Refines.** D21 (adds an enrichment action atop fan-out; keeps seed-and-fork), D23 (carries the
image trim up into ideation). **Builds on** D22 (capture/freeze). **D19/D20 unchanged** (the Shot's
output is still its own `data.script`; compose rows never go active).
**Originated.** `2026-06-28-shot-composer-design.md`. **Runtime walkthrough:**
`docs/architecture/2026-06-28-shot-composer-walkthrough.md`.

### D29 — Approval flag: maker-checker on the version envelope; flag-only, no gate yet *(recorded 2026-06-29; builds on D4/D5/D18/D14; preserves D11)*
**Decision.** Add an **approval flag** to the **uniform `node_versions` envelope (D4)** — so
every node type gets it at once — recording **maker-checker** sign-off on each LLM attempt.
New columns: `approval_status` (`'pending' | 'approved' | 'changes_requested'`, default
`pending`), `approved_by` (soft-identity name of the **checker**), `approved_at`. The existing
`note` carries "changes requested" feedback; the existing **`operator`** column (D14-reserved,
previously empty) is now filled with the **maker's** identity at generation time. Approval
attaches to the **version** (D18), so a **re-generate starts back at `pending`** (old approval
does not carry). Set via an **approval control in the focus view** beside the eval bar
(Approve / Request changes+note / Reset), writing to the **active** version. Shown as a node
status pill (`kb-status-badge` style) + per-attempt status in version history. **Identity is
soft and set once at app start** — a "who are you?" gate (name + `role: senior|designer`) →
`localStorage["creativeos.identity"]`, switchable via a top-bar chip, read by `useIdentity()`;
**spoofable by design** (audit trail without auth). Distinct from `decision: pass/fail` — that
is the **D22 quality/learning** signal, this is the **sign-off gate** (an output can be "good
but not signed off"). **This is a flag only.**
**Why.** "A senior may want to validate LLM outputs before I proceed." Brainstormed down from a
full gating/triggering workflow to its simplest useful primitive. The flag is the foundation
that gating/triggering/RBAC would later read from, so shipping it first delivers the audit value
immediately and de-risks the rest. Filling `operator` finally gives the D14-reserved maker field
meaning. App-start identity (not lazy-on-approval) attributes **both** maker and checker, and is
the natural seam a real login slots into later (soft→hard = a *data* migration, not a redesign).
**Rejected.** (a) **Connection gating now** (unapproved output can't be wired downstream) —
deferred; the flag must exist first. (b) **Auto-advance / trigger-on-approval** — would revisit
D11 (human-is-scheduler); explicitly dropped for MVP. (c) **Reusing `decision` for approval** —
zero-migration but conflates quality-eval with sign-off; they diverge. (d) **Lazy identity at
approval time** — loses the maker's identity. (e) **RBAC enforcement** — needs real auth.
**Preserves.** D11 (nothing auto-runs; the flag changes no scheduling). **Builds on** D4
(envelope), D5 (active pointer), D18 (per-attempt), D14 (identity seam).
**Originated.** `2026-06-29-approval-flag-design.md`.

### D30 — Storage backend moves to GCS (single bucket, ownership-prefixed paths) *(recorded 2026-06-30; preserves D14)*
**Decision.** New uploads go to a single Google Cloud Storage bucket `creativeos-assets`
(region `asia-south1`, uniform access, public-read via `allUsers: Storage Object Viewer`).
Objects are organized by ownership, not asset kind:
`clients/{clientId}/canvases/{canvasId}/nodes/{nodeId}/{kind}/{name}` for node-scoped
assets, `clients/{clientId}/{kind}/...` for client-scoped assets. Filenames are
`{sanitized-slug}__{UTC-iso-ms}Z.{ext}`. A thin `src/lib/storage/` wrapper exposes
per-kind upload helpers (`uploadNodeFile`, `uploadImageGen`, `uploadVideoGen`,
`uploadClientLogo`, `uploadBrandImage`, `uploadKBDocument`) plus a polymorphic
`removeObject` that routes by URL shape (GCS URL → GCS delete; `supabase.co` URL →
Supabase delete, for legacy assets). The seven existing call sites swap mechanically.
DB columns continue holding plain `text` URLs — no schema migration; old `supabase.co`
URLs continue to resolve.
**Why.** Supabase Storage free tier caps at 1 GB; CreativeOS storage growth
(image-gen + video-gen + KB docs + node files) outpaces that quickly. GCP is already
on the plan. Ownership-prefixed paths enable per-client / per-canvas listing, audit,
and bulk-delete from the bucket alone — capabilities the flat
`{kind}/{nodeId}/...` layout inherited from Supabase did not allow.
**Rejected.** (a) **Multi-bucket GCS** — Supabase's per-kind buckets were
organizational, not security; GCS does the same with prefixes in one bucket and
avoids per-bucket IAM/CORS/lifecycle duplication. (b) **Migration of existing
Supabase assets** — MVP scope; old URLs continue to resolve from Supabase. (c)
**Signed URLs / private bucket** — no behavior change from current Supabase setup
(everything is public-by-URL today); can split a private bucket out for KB docs
later if privacy becomes a requirement.
**Preserves.** D14 (storage credential lives server-side only via service-account
key — no browser-side GCS uploads in this iteration).
**Originated.** `2026-06-30-gcs-storage-migration-design.md`.

### D31 — Canvas autosave is non-destructive: delete only client-tracked tombstones *(recorded 2026-06-30; builds on D8/D11)*
**Decision.** The whole-canvas snapshot save upserts present rows but deletes **only the
node/edge ids the client explicitly removed since load** (tracked as `removedNodeIds` /
`removedEdgeIds` tombstones in the canvas store), never "everything not in my snapshot." A
pure `planReconcile(snapshotIds, removedIds)` computes the delete set; the DB layer is a thin
caller. **Why.** The old `delete … NOT IN (snapshot)` made every client an authority on the
entire canvas, so a stale session's autosave **deleted nodes another session had just added** —
the reported data loss (and the same bug for one user with two tabs). Deleting only observed
removals means a node this client never saw is never touched. **Rejected.** Per-node delta
saves (more correct — never rewrites an untouched shared node — but adds dirty-tracking and
reshapes the action contract; deferred as YAGNI for MVP). **Builds on** D8 (edges point to
nodes), D11 (human-is-scheduler; saves stay whole-canvas, just safe).
**Originated.** `2026-06-30-canvas-autosave-concurrency-design.md`.

### D32 — Optimistic concurrency via `updated_at`; conflict = save-mine-then-merge *(recorded 2026-06-30; builds on D31; canvas-level complement to D11; **SUPERSEDED by D33**)*
> **Superseded.** Two concurrent sessions ping-ponged (`replaceCanvas` re-triggered autosave → position oscillation) and mine-wins resurrected deleted nodes. Replaced by the D33 pessimistic lock. The merge machinery (`replaceCanvas`, the `updated_at` token) was removed; D31 non-destructive deletes were kept.
**Decision.** Autosave carries the `canvases.updated_at` loaded with the canvas as an optimistic
token (bumped by the migration-0008 child-table triggers — no new column). On a token mismatch
the server **force-writes the local edits** (safe per D31, so the other session's added nodes
survive) and returns the **refetched** canvas, which — because my write already landed — is
exactly *mine ∪ their additions*; the client adopts it silently via `replaceCanvas` (preserving
selection). **Why.** Detect overlap and never silently lose work, without real-time infra. The
common disjoint-edit case keeps both sessions' work; only same-node edits resolve **mine-wins**.
**Accepted limitations.** (a) same-node edit → mine wins; (b) a node the other session deleted
but I still hold is resurrected; (c) a tiny in-flight-edit window can be overwritten by the
merge. All inherent to safe-snapshot + mine-wins. **Rejected.** A new `version` column + RPC
(YAGNI — `updated_at` already detects overlap); a Reload-button UX (discards in-flight work);
silent auto-reload (discards local edits). **Deferred.** Real-time sync (Level 2, Supabase
Realtime) and CRDT same-field merge (Level 3). **Builds on** D31; complements D11.
**Originated.** `2026-06-30-canvas-autosave-concurrency-design.md`.

### D33 — Pessimistic single-writer canvas lock; retires D32's optimistic merge *(recorded 2026-07-01; supersedes D32; builds on D31, D29, D9, D13)*
**Decision.** A canvas is edited by one session at a time. The lock lives in `canvases` columns
(`editing_session_id` / `editing_name` / `editing_heartbeat_at`, migration `0010` — `0009` was
D29), keyed by an unguessable **per-tab session id** (not identity, so even the same person's
second tab is read-only); held iff the heartbeat is within `STALE_MS` (45s), refreshed every 15s.
An atomic `acquire_canvas_lock` RPC does acquire + stale take-over in one statement.
**Server-enforced** — `saveCanvasAction` rejects writes from non-holders (`{ ok: false, lockLost
}`). Second openers are **strict read-only** (one `canEdit` gate via `CanvasEditableContext`
blocks canvas edits, generation, parse, AND D29 approval) with a "{name} is editing" banner and an
explicit **take-over-when-stale** button. Depends on the D29 identity system (`<IdentityGate>`
guarantees a holder name). **Why.** Mine-wins full-snapshot merge (D32) cannot give clean
concurrent editing — preventing concurrency at the source is simpler and correct. **Rejected.**
Realtime Presence (new dep; still needs a server guard — future), `pg_advisory_lock`
(connection-bound; incompatible with serverless actions), client-only enforcement (a stale tab
could still write), a per-person key (wouldn't stop the same person's two tabs), keep-D32-and-
guard-the-loop (treats a symptom). **Deferred.** Live viewer sync (Level 2) + CRDT (Level 3);
server-guarding the generate/approval routes for defense-in-depth (append-only, so client gate
suffices for MVP). **Retires** D32's conflict/merge/`replaceCanvas`; **keeps** D31 (deletes now
stick — no second writer). **Originated.** `2026-07-01-canvas-pessimistic-lock-design.md`.

### D34 — Canvas-level read-only Review surface; approval decoupled from the D33 lock *(recorded 2026-07-02; builds on D29, D33, D18/D5, D8; preserves D11; promotes the review-surface half of F4)*
**Decision.** A per-canvas **read-only review queue** at `/clients/[id]/canvases/[cid]/review` — a
master-detail surface (reusing the eval-review viewer shell) listing one row per node of type
`prompt | video-prompt | image-gen | video-gen` whose **active** version (D18/D5) needs review
(`approval_status ∈ pending | changes_requested`; an Approved filter flips it). Reached from a
"Review" action on each canvas row (never via the lock-acquiring editor). Reuses `listNodes` (**no new
query**) + a pure `buildReviewQueue`; Approve/Request-changes reuse `setVersionApprovalAction`, writing
to the **displayed** version id. Detail pane is **progressive disclosure**: Tier 0 (output + maker/when
+ status + actions) eager; Tier 1 (prompt · refs/still · shot) lazy on expand via the existing
`getUpstreamOutputs` (a `GET /api/nodes/[id]/context` route); Tier 2 = Open in canvas. **Approval is
decoupled from the D33 lock** — the review route is not the canvas editor and the action has no lock
guard, so a senior reviews N items without opening N canvases (D33's "viewers can't approve" is a
canvas-UI gate, not a server guard). **Why.** The D29 approval *state* existed but had no fast surface;
node-by-node canvas review is too slow for production volume. **Rejected.** Client-level aggregate
inbox *for the MVP* (deferred — a later data-source swap on the same component), a submit-for-review
state, gating/auto-advance generation (would revisit D11), a media-grid layout (fails text prompts), an
in-editor review panel (would fight the D33 lock). **Preserves D11** (no auto-advance; human still
schedules). **Deferred.** Cross-canvas inbox, submit lifecycle, notifications, batch approve, count
badges, shot-based grouping (needs shot lineage downstream nodes don't store), campaign entity.
**Originated.** `2026-07-02-production-review-mode-design.md`.

### D35 — Generation Tray: canvas-scoped, navigation-only job shelf derived from the `generations` substrate; image gen joins the substrate *(recorded 2026-07-05; builds on D26, D12/D25, D9, D33, D18/D5; preserves D11)*
**Decision.** A **flat, canvas-scoped shelf** floating over the canvas (right-edge overlay, hidden when
empty) listing one item **per generation node** (`image-gen | video-gen`) whose latest `generations`
job row is `running | succeeded | failed`, rendered **Running / Ready / Failed** with shot label +
asset type. **Clicking an item does one thing: fly the canvas to that node (`setCenter`) and open its
focus view.** No tray-level actions. Item **leaves** on approval of the active version (retention =
"until approved"), a newer generation, or node deletion. Everything is **derived on read** (D9) — a
pure `deriveTrayItems(nodes, edges, latestJobs, approvals, now)` + `resolveShotLabel` (upstream
edge-walk to the nearest `shot`, fallback to node title); **no tray table, no new column, no
migration.** Live via **one canvas-level Supabase Realtime channel** on `generations`
(`node_id`-filtered client-side; coexists with the untouched per-node `use-video-gen-status`). **Image
gen joins the substrate** — the (still synchronous) image route now writes `insertGeneration` →
`succeedGeneration`/`failGeneration` (the primitives video already uses), which is what D26 always
assumed but the route never did; a `running` **image** row past a ~60s threshold is **derived stale →
Failed** (D9), covering a client that disconnects mid-request. Requires two small reusable plumbing
additions: wrap the canvas in `<ReactFlowProvider>` (viewport API reachable from a sibling) and lift
`focusedNodeId` to the canvas store (open a focus view programmatically). **Why.** Video was already
non-blocking but had no consolidated cross-reel view of "what's generating / just finished"; image
blocked its drawer and left **no** record at all. The tray removes waiting confusion and gives one
click back to the finished node. **Rejected.** A stored `tray` table (duplicates derivable state —
violates D9); denormalizing `canvas_id` onto `generations` (a migration for no gain — filter
client-side); promoting image gen to trigger.dev async (contradicts D26's sync fast path; the row is
memory, not a completion guarantee); tray-level approve/retry/edit (belongs in the focus view — concept
note §8.4); prompt/compose/parse jobs in the tray (only long-running generation). **Preserves D11** (the
tray never auto-advances or triggers a step — click = navigate). **Deferred.** The **guided next-node
flow** (auto-create/connect/place the next node + "Save and create…" CTAs) — the *other half* of the
origin note, a separate spec built on this one; live approval reconciliation across sessions (currently
next-load); a cross-canvas/global tray. **Originated.** `2026-07-05-generation-tray-design.md`.

### Parked / out-of-scope (with revisit triggers)
| Item | Status | Revisit when |
|---|---|---|
| **Brief node** (upstream-brief parsing) | Defined MVP node type; **retained, not built** — Script node shipped instead (D16) | A project needs to start from a brief, not a finished script |
| Context "% slider" / relevance ranking | Parked (D7) | Client KB outgrows the context window → add RAG |
| Full client KB (structured + files + selection) | ✅ Pulled forward into Stage 1 (D17) | — |
| Multi-tenant auth | Out of scope (PRD §18) | Post-MVP external access |
| Automated branching / auto-rewiring | Out of scope (PRD §15) — **except** human-triggered Shot fan-out, which creates nodes (not edges) on explicit click (D21) | Not planned (beyond D21's bounded, manual fan-out) |
| Edge `pinned_version_id` (freeze a connection) | Optional extension (D8) | If "don't auto-follow active" is ever needed |
| Real queue infra (Redis/SQS/BullMQ + workers) | Parked (D12/D13) | Own GPU compute, high concurrency, or complex retries |
| `.docx`/`.pdf` brief extraction | Deferred (D15) | After Stage 1, when non-text briefs are needed |

---

## 8. Next step

The reusable spine — node lifecycle, the node×input-kinds matrix, the version envelope, and
the full Supabase schema — now lives in its own reference:
**`2026-05-30-creativeos-architecture.md`**.

Stage 1 has shipped (Script node + Client KB — see D16/D17). Next, design **Stage 2 (Text +
File nodes + edges + Prompt node)** as its own build spec — how edges persist as adjacency-list
data in React Flow (create/validate with a cycle check, D8/D11), how `resolveInputs` walks the
edge graph plus the ambient client KB (D6), the pure `compile` step that produces the visible
"final compiled prompt" (D3), the Prompt-generate Route Handler (holding the model key), and
Stage 2 scope cuts. It will reference the architecture doc for the schema rather than restating it.
