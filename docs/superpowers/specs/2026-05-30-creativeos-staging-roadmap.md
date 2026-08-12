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

### D14 — Stage 1 auth: none yet *(**SUPERSEDED by D43** — pilot auth, 2026-07-15)*
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

### D36 — Guided next-node flow: declarative chain of "Create next" CTAs; never auto-generates *(recorded 2026-07-05; builds on D35, D21, D24, D8; preserves D11; the deferred second half of the D35 origin note)*
**Decision.** A contextual **"Create next"** action on each pipeline node that **saves → creates →
connects → places → opens** the next node, and **never runs a model** (the designer sets controls,
verifies inputs, clicks Generate — preserves D11). The chain: `Shot →(image prompt) prompt →(image
generation) image-gen →(video prompt) video-prompt →(video generation) video-gen` (video-gen is
terminal). The whole progression is **one declarative config** `GUIDED_CHAIN` + a pure
`planGuidedNext(source, nodes, edges)` (mirrors `deriveTrayItems`/`planReconcile`): returns the
`nextType`, an `existingId` (**idempotent** — if the next node already exists it **navigates**, never
duplicates), a `position` (`placeNextTo` = +360 x, nudge y on overlap), and `edgesToCreate`. Two steps
wire **two** parents (D24): image-gen→video-prompt also wires **shot** (action context); video-prompt→
video-gen also wires **image-gen** (start frame) — resolved by promoting the tray's `findShotAncestor`
to a shared `findAncestorOfType` in `canvas/graph.ts` (findShotAncestor becomes a one-line delegate).
A store action `guidedCreateNext(sourceId)` applies the plan (or returns the existing id) and flushes
autosave; a shared `<GuidedNextButton>` renders as a **dashed-primary chip** on the Shot card (no focus
view) or a **primary button** in the prompt/image-gen/video-prompt focus-view footers, and on click
navigates via **`focusedNodeId`** (the D35 seam, now extended to `prompt`/`video-prompt` nodes). The
image-gen CTA is **enabled once a still exists**, with a **"Not approved yet" nudge** when unapproved —
approval **guides, never gates** (D29). **Why.** Four node-creates + six edges per shot was most of the
setup clicks on a fanned-out reel; the tray removed *waiting* friction, this removes *setup* friction —
and the tray already built the two seams it needs (`focusedNodeId`, the ancestor walk). **Rejected.**
Auto-generating any step, even cheap prompt text (contradicts D11; the designer must set controls +
verify inputs); a dedicated linear "Runner" surface (stays in-canvas); auto-selecting reference images
(speculative/error-prone — the designer wires refs); creating a duplicate on repeat click (navigate
instead); inferring "next" from `VALID_CONNECTIONS` (it allows multiple targets — a curated chain is
needed). **Preserves D11** (never schedules a generation). **Deferred.** The dedicated Runner surface;
batch "fan all shots' chains"; reference auto-selection. **Originated.**
`2026-07-05-guided-next-node-flow-design.md`.

### D37 — Image Edit mode: a tabbed composer (annotation + connected-ref selection) over the D27 edit pipeline

**Decision.** Add a `Generate | Edit` tab to the Image Gen focus view. Edit mode adds (a) a
separate-layer annotation overlay on the base image, (b) toggle tiles to mark which *connected*
nodes are the edit's references, and (c) a "Modify" intent chip. It sends an annotated
composite + a chosen `extraReferenceUrls` to the **existing** D27 edit route; the base image is
shown even with no prior attempt, so a connected/clipped reference is editable immediately.

**Why.** Designers need to *point* at edit regions and to *choose* which reference feeds an
edit, and editing a connected/clipped reference must be visible without a prior generation —
all without a new pipeline or storage mechanism.

**Rejected.** Ad-hoc uploaded references in the composer (would add a storage path — instead
mark connected nodes); pixel masks (prose-level visual hint only); a separate Edit node /
second route (violates D27 §4.1).

**Refines.** D27 (adds the composer UI + two additive route fields; the edit pipeline is
unchanged).

**Originated.** `2026-07-05-image-edit-mode-design.md`.

### D38 — Model-aware image-edit region control (mask vs text); retire the burned-in composite

**Decision.** The Edit region is carried in the *selected model's* native channel — OpenAI via a
real alpha **mask** (`images.edit` mask; the user **paints the region**; the base image is sent
**clean**), Gemini via **text only** (no drawing). A `supportsMask` capability flag on the model
spec drives both the UI (paint vs type) and the payload. The D37 burned-in annotation composite
is **retired**.

**Why.** Compositing the drawn marks into the base image reproduces them into the output (a black
scribble rendered onto the edited photo); native channels (mask / text) don't. Mask polarity is
locked by empirical verification.

**Rejected.** Keeping the composite (it is the bug); passing an annotated image as a Gemini
reference (reintroduces marks-in-pixels, off-pattern for Gemini multi-image, undocumented);
auto-interpreting freehand marks / drawing on Gemini (deferred, not this cut).

**Refines.** D37 (partially reverses its "pixel masks are a non-goal" stance) / D27.

**Originated.** `2026-07-06-image-edit-model-aware-masking-design.md`.

### D39 — Explicit "Set as base" for connected reference images

**Decision.** The edit base is an **explicit, persisted choice** (`baseReferenceNodeId` on
`ImageGenNodeData`), surfaced as a hover **pin** on each non-base reference tile. Resolution
(pure `resolveBaseNodeId`): a generated attempt always wins (base = the attempt); otherwise the
pinned node wins **when still connected**, else fall back to the first-connected image (the prior
implicit rule) — never a dangling base. The pin is hidden while an attempt is the base
(`canSetBase = !baseIsAttempt`). The chosen base drives both the annotated preview and the
`baseImageUrl` sent to the edit route; the previous base rejoins the selectable extras.

**Why.** The base was silently `connectedImageNodes[0]` — the earliest node in the canvas node
list (≈ creation order), *not* connection order — so it reassigned invisibly as the operator
connected/disconnected references and could never be chosen. An explicit pin makes the base
operator-controlled and stable across reconnection.

**Rejected.** Re-basing onto a reference *after* a generation exists (bigger behavioral change to
the generate→iterate loop; YAGNI for this cut — attempt still wins); a full base-picker in
`ConnectedInputsCard`; inferring base from edge-creation order (still invisible/unstable).

**Refines.** D37 / D27 (fills the base-selection gap both specs flagged as unbuilt).

### D40 — Prompt focus view becomes a left-rail master–detail

**Decision.** The Prompt focus view (`prompt-focus-view.tsx`) is reorganized into a **left rail +
detail pane** (master–detail). Rail items, top to bottom: **Prompt** (default) → a **Connected · N**
group listing each upstream node → **Details** → **Sent to model**. The right pane renders the
selected item:
- **Prompt** — the compose editor: **Instruction** (textarea + one-row shot controls + Generate) on
  top, **Generated prompt** below (eyebrow + a `v1 v2…` **version-chip strip**: hover = version
  details, click = switch via the existing restore; output at 16px, capped height).
- **A connected node** — that node's read-only detail (reuses `ConnectedDetailView`; no back button
  needed — the rail returns).
- **Details** — Brand KB slices, then an `hr`, then Review (eval + approval). Carries the approval
  status badge on its rail item.
- **Sent to model** — the frozen request as `line`-variant tabs (System prompt / Compiled input /
  Attachments), heading supplied by the rail item.
Usage/cost stays in the header. **All controls are shadcn primitives** (`Button`, `Textarea`, `Tabs`)
— no native controls (this rule was codified in `CLAUDE.md`). New pieces: `prompt-version-chips.tsx`,
pure helpers `describeApprovalPill` / `buildVersionChips` (`lib/nodes/prompt-focus.ts`), and
`NodeIcon` exported from `connected-inputs-card.tsx`. Folds in **YUV-165** (the "Generated prompt"
eyebrow + output prominence); YUV-165's Video Prompt view is a tracked fast follow.

**Why.** The view showed everything at once, so the primary path (write → generate → read) competed
with metadata/approval/eval/model-request, and the generated output sat *last*, unlabelled (YUV-165).
A master–detail rail makes Prompt the primary surface and turns each secondary concern (each connected
input, the Brand KB + review, the model request) into a plain "select → render" item — simpler and a
better fit than peer tabs for "one editor + a list of inspectable things."

**Rejected.** Segmented **Compose/Details tabs** (first built; the Base UI `Tabs` controlled-value
switching fought the bottom-sheet flex layout and didn't switch reliably — replaced by the rail);
a right-side drawer; collapsible icon rails; a fully-minimal editor with no review-state signal (kept
the approval badge on the Details rail item instead).

**Refines.** Supersedes YUV-165's "keep bars but de-emphasize" with "move off the primary surface into
rail items." Preserves D29 (approval flag), D33 (read-only sessions), D35/D36 (`GuidedNextButton` in
the header). **Originated →** `2026-07-12-yuv187-prompt-focus-simplify-design.md` (that spec's tab
design was superseded during implementation by this rail; see its top note).

### D41 — Reference gallery is a right drawer, not a modal *(recorded 2026-07-14)*

**Decision.** The reference-image picker becomes a **right-side drawer** (`Sheet` primitive) that
stays open across canvas interactions. Two tabs — **References** (Drive) and **Assets** (canvas
generations) — feed a masonry / list content area with `react-intersection-observer` infinite
scroll. Selection persists across tabs; commit is either the Add button or **drag-and-drop** onto
the canvas pane or an eligible node (auto-connects on node drop). Drive images are queried
**flat by recency** across My Drive + Shared with me + shared drives in a single call — no folder
tree; folder + "shared only" filters live in a popover and are applied client-side over the
loaded pages. Full-res is only fetched when the operator commits (click-Add or drop), then
streamed to GCS via the existing `/api/nodes/[id]/file/drive` endpoint. Session-cached
(module-level singletons); an explicit refresh button re-fetches.

**Why.** The old dialog blocked the canvas — the operator couldn't drag a picked image onto a
specific node. Folder-tree navigation was slow when the actual mental model is "recent images
across everything." A drawer that stays open + recency-sorted flat listing + drag-drop turns the
picker into a working surface.

**Rejected.** Modal dialog (blocks canvas, no drag-onto-node); left sidebar (cramps the canvas
surface); floating palette (fights the generation tray); server-side Drive search (deferred —
client-side substring over loaded pages is enough for v1); persistent selection across
drawer close (deliberate reset on close to avoid stale-selection surprises); infinite scroll
via `scroll` event handler (`react-intersection-observer` is cleaner).

**Refines.** Supersedes the D8-era modal picker. Preserves D33 (autosave flush is called before
Drive uploads, so the newly-added node rows exist by the time `/api/nodes/[id]/file/drive`
runs — falls back to a bounded retry on "not found"). Preserves D14 (Drive thumbnail/file
proxies remain unauthenticated but obscurity-gated). Preserves D29/D34 (adding via the drawer
doesn't touch approval state; it just spawns new file nodes).

**Originated →** `2026-07-14-gallery-drawer-design.md`.

### D42 — Organizations: the tenant layer above `clients` *(recorded 2026-07-15; extends the D1/D10 single ownership tree; promotes the tenancy half of F1)*

**Decision.** A new `organizations` table is the tenant and isolation boundary. `clients`
gains an `org_id` FK; because every table already FKs up to `clients`, every row inherits
its org through the tree — no other table changes. Users live in `profiles`
(`user_id` → `auth.users`, `org_id`, `display_name`, `role`), membership-shaped so
multi-seat later is additive rows, not a schema change. The pilot runs **one user per org**.

**Why.** First external agency. Agencies never share client brands, so org = agency is the
smallest model with hard isolation; user-as-tenant breaks the moment an agency wants a
second seat.

**Rejected.** User-as-tenant (no org layer); per-agency separate deployments (operational
dead end — every fix ships N times, no product-level org concept).

**Originated →** `docs/CreativeOS Multi-Tenancy Pilot PRD.md` (§4, §6.1).

### D43 — Supabase Auth (email+password, invite-only) fills the D29 identity seam *(recorded 2026-07-15; supersedes D14; fulfills the seam D29 reserved)*

**Decision.** Supabase Auth with email+password, **invite-only** (seed script creates each
org + user; no self-serve signup). Next.js middleware guards every page and API route
(no session → `/login`); webhook/cron routes keep shared-secret auth. `useIdentity()`
swaps its *source* from localStorage to the session + `profiles` row — call sites
unchanged, exactly as D29 planned. `node_versions.operator` / `approved_by` stay text,
now stamped from the profile's display name; promotion to `user_id` FKs remains backlog.
Role stays cosmetic (D29). The D33 lock is unchanged (per-tab, composes with login).

**Why.** Real isolation needs a real caller identity; Supabase Auth is already in the
stack and password reset comes free.

**Rejected.** SSO / Google login (pilot); self-serve signup; enforced RBAC (needs
multi-seat to matter).

**Originated →** `docs/CreativeOS Multi-Tenancy Pilot PRD.md` (§5).

### D44 — App-layer org enforcement at the chokepoints; RLS only where the browser reads *(recorded 2026-07-15; builds on D42/D43; preserves the D14-era service-role server path)*

**Decision.** The service-role server client stays. Org isolation is enforced in app code
at the existing chokepoints: `withClient` verifies `client.org_id` = caller's org
(**404** on mismatch — never confirm foreign resources exist); deeper routes (nodes,
canvas, eval, server actions) walk their ownership chain (node → canvas → client) and
apply the same check; list queries filter by `org_id`; `/api/ingest-image` loses its
deliberate D14 openness. RLS is enabled on exactly the two browser-read tables
(`generations`, `client_kb_jobs`) so authenticated realtime only delivers the caller's
org's rows.

**Why.** Same isolation for a fraction of the risk: an RLS-everywhere rewrite touches all
34 service-role call sites and 10+ tables; the chokepoints already exist.

**Rejected.** RLS-everywhere (deferred to hardening as defense-in-depth, not undone by
this path); per-agency deploys (see D41).

**Originated →** `docs/CreativeOS Multi-Tenancy Pilot PRD.md` (§6.2–6.3).

### D45 — Learning scopes: platform / segment / client; knowledge flows downward only *(recorded 2026-07-15; extends D6/D17's ambient-context model across the tenant boundary)*

**Decision.** Three scopes: **platform** (common system prompts/playbooks — code, ships to
all orgs), **segment** (e.g. DTC — future, a tag on clients + platform-curated artifacts),
**client** (Brand KB / instruction set — that org only). Shared pools are
**hand-curated by Yuvabe only** — never pipeline-fed from tenant data. Tenant data never
flows up or sideways; "do you learn from our data?" → no. No segment schema in the pilot.

**Why.** Composition downward is safe; automatic upward distillation would move one
agency's client insights into another agency's outputs — a data leak in IP form.

**Originated →** `docs/CreativeOS Multi-Tenancy Pilot PRD.md` (§8).

### D46 — Pilot accepts public GCS capability URLs; signed access is hardening *(recorded 2026-07-15; extends D30; risk accepted in writing)*

**Decision.** Generated/uploaded files stay public GCS URLs in the pilot. Paths embed
UUIDs (unguessable capability links, server-derived per D30), but a leaked URL is
world-readable indefinitely. Accepted because signed URLs / an authenticated media proxy
touch every image/video render path — too much surface for the pilot. Step-2 fix: signed
URLs or a media proxy.

**Originated →** `docs/CreativeOS Multi-Tenancy Pilot PRD.md` (§10).

### D47 — Org credits: derived-on-read metering, monthly hard cap, off-platform invoicing *(recorded 2026-07-15; extends D9 and the D26 generation substrate)*

**Decision.** 1 credit = 1 USD of provider cost (the existing
`generations.credits_consumed` unit). `organizations.monthly_credit_limit` (`null` =
unlimited); month-to-date usage is **derived on read** — `SUM(credits_consumed)` over the
org's tree for the calendar month; no ledger table, no cron. A single
`assertOrgWithinBudget` check at the generate chokepoint hard-stops new model runs at the
limit (viewing/editing/approving unaffected; in-flight overshoot accepted). Monitoring:
org-facing `used / limit` readout; Yuvabe-facing `org_credit_usage` DB view. Payments,
invoices, plans stay off-platform.

**Why.** The pilot needs to *monitor* consumption per org (and cap runaways) — not to be
a billing product. Metering already existed; only the org dimension was missing.

**Originated →** `docs/CreativeOS Multi-Tenancy Pilot PRD.md` (§9).

### D48 — Multi-tenancy hardening of the Drive gallery: subtree containment; folder picker is platform-org-only *(recorded 2026-07-15; builds on D41 and `clients.drive_root_folder_id`; closes the cross-tenant gaps the PRD's artifact inventory surfaced)*

**Decision.** The per-client Drive root that already ships
(**`clients.drive_root_folder_id`**, set via the client-settings folder picker) becomes
the Drive **tenancy boundary**: `/api/drive/browse` and the file/thumbnail proxies are
session-guarded and **server-constrained to the client's configured root subtree**
(retiring D41's "unauthenticated but obscurity-gated" proxies note). The **folder picker**
(`/api/drive/folders`) necessarily browses the whole platform Drive, so it is restricted
to **Yuvabe's org**; agency clients get their root set by Yuvabe — an agency-shared
folder can be wired the same way, no per-org OAuth. A `null` root (the default) means no
Drive gallery for that client. Scoping is by folder **ID**, never name-matching.
`ingest-image` likewise loses its D14 openness and joins the org-checked chokepoints.

**Why.** The Drive token is Yuvabe's account: without containment, an external agency
could browse Yuvabe's Drive (other clients' references) — and the picker exposes exactly
that by design. Name-matching was rejected because renames break it and a name collision
(an agency naming its client after a Yuvabe folder) would cross orgs.

**Rejected.** Org-level on/off gate (coarser than the shipped per-client root);
name-matching; per-org Drive OAuth (too heavy for the pilot).

**Originated →** `docs/CreativeOS Multi-Tenancy Pilot PRD.md` (§7).

### D49 — Org membership is a join table from day one *(recorded 2026-07-16 from the auth design spec of 2026-07-15; design-stage, not yet built. Note: the spec originally numbered its decisions D48–D52, colliding with D48 above — renumbered here to D49–D53; the spec was corrected to match)*

**Decision.** User↔org membership lives in an **`org_memberships` join table** from day one — not a `profiles.org_id` column.

**Why.** Multi-seat orgs become row inserts, never a schema migration.

**Rejected.** A single `org_id` column on profiles.

**Originated →** `2026-07-15-auth-multi-tenancy-design.md` (§13).

### D50 — Two role axes: `platform_role` in the JWT, `org_role` on the membership *(recorded 2026-07-16; design-stage)*

**Decision.** `platform_role` lives in `auth.users.app_metadata` (a server-set JWT claim); `org_role` lives on `org_memberships` (mutable, per-membership).

**Why.** Platform powers and org seats are independent axes — two homes, no collision.

**Rejected.** One merged role field.

**Originated →** `2026-07-15-auth-multi-tenancy-design.md` (§13).

### D51 — `proxy.ts` is optimistic-only; the DAL owns identity *(recorded 2026-07-16; design-stage)*

**Decision.** Next.js 16 `proxy.ts` performs only an optimistic session check; full identity/org context resolution lives in the DAL (`src/lib/dal.ts`) wrapped in React `cache()`.

**Why.** Authorization must live at the data-access layer, resolved once per request — the edge proxy can only be a fast first filter.

**Rejected.** Resolving full auth context in middleware.

**Originated →** `2026-07-15-auth-multi-tenancy-design.md` (§13).

### D52 — Impersonation via HttpOnly cookie override *(recorded 2026-07-16; design-stage)*

**Decision.** Super-admin impersonation is an HttpOnly cookie (`orgId` override read in the DAL) — no session swap — with a persistent banner.

**Why.** No credential switching, trivially reversible, always visible.

**Rejected.** Swapping the Supabase session.

**Originated →** `2026-07-15-auth-multi-tenancy-design.md` (§13).

### D53 — `useIdentity()` API frozen; internals swapped *(recorded 2026-07-16; design-stage)*

**Decision.** The `useIdentity()` public API is frozen; its internals move from localStorage to Supabase session + profiles.

**Why.** Every call site survives the auth migration unchanged.

**Rejected.** A new identity hook plus a call-site rewrite.

**Originated →** `2026-07-15-auth-multi-tenancy-design.md` (§13).

### D54 — Copilot architecture: server thinks, client acts, human gates *(recorded 2026-07-16; the copilot build — D54–D71 — merged to main this date. Specs: `2026-07-14-creativeos-copilot-design.md` (part 1), `../../copilot/copilot-design-part-2.md`, `2026-07-13-copilot-playbook-runner-design.md`; principles P1–P8 in `../../copilot/copilot-primitives-and-patterns.md`)*

**Decision.** The copilot's model only ever returns decisions, proposals, and references; **all graph mutation is client-side** through the canvas store's recipes.

**Why.** Keeps the security/undo boundary in the client — a confused model can propose, never mutate.

**Rejected.** Server-applied mutations; one mega-call streaming prose+refs+actions (forces partial-JSON parsing).

**Originated →** `2026-07-14-creativeos-copilot-design.md` (§4, §7).

### D55 — Three stateless calls per copilot turn *(recorded 2026-07-16)*

**Decision.** Prose (stream), references (`json_schema`), and actions (`tools`) are three separate stateless calls orchestrated by the client.

**Why.** Zero partial-JSON parsing; each call has one job.

**Rejected.** Unified AI-SDK streaming with interleaved tool calls.

**Originated →** `2026-07-14-creativeos-copilot-design.md` (§4, §7).

### D56 — Node ref handle: uuid-derived `TYPE-XXXX` *(recorded 2026-07-16)*

**Decision.** Every node has a stable, human-visible handle (`nodeHandle` = type abbrev + first 4 uuid chars, a pure function). Chat, tools, @-mentions, and elicitation all speak handles.

**Why.** Referenceable identity with zero storage that can never re-point; agent-created nodes are usually untitled.

**Rejected.** Positional numbering (rots on add/delete); a persisted counter (storage + concurrency).

**Originated →** `2026-07-14-creativeos-copilot-design.md` (§3, §7).

### D57 — @-mention is human-directed grounding *(recorded 2026-07-16)*

**Decision.** The human names the nodes that matter (`@HANDLE`, `@selected`); resolution is client-side (`resolveMentions`, zero model calls); the copilot never volunteers candidate pickers.

**Why.** Removes LLM guessing/enumeration; the human owns relevance.

**Rejected.** A model-asks-clarifying-questions candidate-picker flow.

**Originated →** `2026-07-14-creativeos-copilot-design.md` (§7, §10.1).

### D58 — CreativeOS is a workflow with one agentic cell *(recorded 2026-07-16)*

**Decision.** The script→shots→image run is a deterministic workflow; genuine agency (an observe-decide loop) is reserved for the per-shot "is this image good enough?" repair cell — added later, budget-capped, plugged into one playbook step's `run`.

**Why.** The flow's steps are enumerable in advance, so an agent adds latency/cost without benefit; a loop earns its cost only where outcomes are unpredictable. Test: *in a workflow you can number the steps before running; in an agent you can only number the iterations.*

**Rejected.** An autonomous agent that plans the whole run.

**Originated →** `2026-07-14-creativeos-copilot-design.md` (§8.1–8.3, §8.7, §10.4).

### D59 — One single-shot lane first; parallelize after it works *(recorded 2026-07-16)*

**Decision.** Build one shot's lane end-to-end (script → shot → prompt → image) before any multi-shot orchestration.

**Why.** The parallel run is the same lane repeated per row — proving one lane de-risks everything and wastes nothing.

**Rejected.** Building the multi-shot orchestrator up front.

**Originated →** `2026-07-14-creativeos-copilot-design.md` (§8.4, §8.7).

### D60 — The copilot is the run's command bar + driver + narrator *(recorded 2026-07-16; refines D54's docked-panel interaction model)*

**Decision.** Language drives the existing nodes; the canvas holds the work. The copilot is not a container you work inside.

**Why.** Work stays visible and editable in the graph the rest of the product understands.

**Originated →** `2026-07-14-creativeos-copilot-design.md` (§8.7).

### D61 — Speed comes from workflow techniques, not agency *(recorded 2026-07-16)*

**Decision.** The speed levers are parallelism, a language entry point, and model-filled control defaults — all workflow techniques.

**Why.** Names the real levers so agency isn't mistaken for a speed tool.

**Originated →** `2026-07-14-creativeos-copilot-design.md` (§8.3, §8.7).

### D62 — Parallel runs visualize on the canvas matrix *(recorded 2026-07-16; agreed direction, DEFERRED — not built)*

**Decision.** When runs parallelize: rows = shots, columns = stages; the run moves a spotlight across columns; completed stages collapse to compact launchers.

**Why.** The canvas already IS the parallel view (fan-out lays N rows); anything else duplicates it.

**Rejected.** Per-shot tabs (parallel in name only); a floating run-board panel (a second canvas to keep in sync).

**Originated →** `2026-07-14-creativeos-copilot-design.md` (§8.5, §8.7).

### D63 — Copilot writes gate by blast radius *(recorded 2026-07-16)*

**Decision.** Cheap / reversible / structural ops (`create_script_node`, `parse_script`, `add_node`, `open_node`, `connect_nodes`) execute instantly via client recipes; only real-cost, irreversible ops (generation) pause for the human.

**Why.** Friction only where it earns its keep.

**Rejected.** Gating every mutation (the original read-only proposal card, since removed).

**Originated →** `2026-07-14-creativeos-copilot-design.md` (§9.1, §9.5).

### D64 — `open_node` is one general verb, not per-type openers *(recorded 2026-07-16)*

**Decision.** One opener drives the shared `focusedNodeId` store signal; each node type owns which surface opens (Composer for a Shot, focus view otherwise). All 10 node types are wired to the signal.

**Why.** Keeps the `create → open → act` grammar general; the tray and guided flow already drove the same signal.

**Rejected.** `open_shot_composer` and friends — one opener per node type.

**Originated →** `2026-07-14-creativeos-copilot-design.md` (§9.1, §9.5, §10.3 prep).

### D65 — `parse_script` auto-fans-out *(recorded 2026-07-16)*

**Decision.** Parsing a script drops its Shot nodes onto the canvas directly (the same `fanOutShots` engine as the manual button).

**Why.** Fan-out is the next lane step and the engine already existed.

**Rejected.** Leaving fan-out a separate manual click.

**Originated →** `2026-07-14-creativeos-copilot-design.md` (§9.2, §9.5).

### D66 — The ref handle shows on every node, in the header *(recorded 2026-07-16; refines D56)*

**Decision.** All 10 node types render the handle in the card header next to the type label — what you SEE is byte-identical to what you TYPE (`@SHOT-1A2B`).

**Why.** Uniform, discoverable, and identical to what the copilot and @-mentions resolve.

**Rejected.** Handle on only title-bearing types; above-the-title placement.

**Originated →** `2026-07-14-creativeos-copilot-design.md` (§9.3, §9.5).

### D67 — Complex copilot commands are routed playbooks, not agent plans *(recorded 2026-07-16; the playbook runner shipped in the same merge)*

**Decision.** The model routes a sentence to a **hardcoded playbook** (`run_playbook(name, slots)`) and extracts slot values at predefined decision points; code owns all step sequencing. Playbooks are data — new ones are registry additions, not architecture.

**Why.** Every target flow's steps are enumerable in advance (routing is a workflow pattern, per Anthropic); debuggability and cost.

**Rejected.** Model-authored step lists; an autonomous planning agent.

**Originated →** `2026-07-13-copilot-playbook-runner-design.md` (§2.1–2.2, §10).

### D68 — Slot-filling is frame-based with authored elicitation *(recorded 2026-07-16)*

**Decision.** Playbook slots are required/optional fields with **authored per-slot questions**; completeness is checked by CODE. Replies resolve client-first (`@`-mentions / "none" — zero model calls) with a model fallback; inferable slots are never asked (one shot on canvas → it's the shot).

**Why.** The task-oriented-dialogue pattern: deterministic, testable asks; Ask-when-Needed.

**Rejected.** Letting the model decide when and what to ask.

**Originated →** `2026-07-13-copilot-playbook-runner-design.md` (§2.2, §8, §10).

### D69 — Human actions are first-class playbook steps with store-predicate completion *(recorded 2026-07-16)*

**Decision.** A run pauses on a human step and resumes when a **pure predicate over the canvas store** goes true — level-triggered: one subscription is the wake-up, the predicate over current state is the decision. The advance is **published to the store before any recipe fires** (idempotent advance — a re-entrant subscription call must no-op; violating this duplicated 931 image nodes in testing).

**Why.** LangGraph's HITL shape with zero framework — the client-side brain already shares state with the UI; level-triggering survives pre-completed steps, and missed or duplicate wake-ups are harmless.

**Rejected.** LangGraph/AG-UI infrastructure; polling the model to ask "is the user done?"; edge-triggered event listeners (the lost-signal problem).

**Originated →** `2026-07-13-copilot-playbook-runner-design.md` (§2.3, §10); principles P5–P6.

### D70 — Generation steps always pause: the L6 HITL gate *(recorded 2026-07-16; refines D63)*

**Decision.** In a playbook run, generation steps are HUMAN steps — the run never auto-fires a generation. The long-owed HITL gate lands as a *pause in the run*, not an approve-button card.

**Why.** Blast-radius rule: real cost + irreversibility pause; structural steps stay instant.

**Originated →** `2026-07-13-copilot-playbook-runner-design.md` (§2.5, §10).

### D71 — One run at a time, session-scoped; cancel keeps created nodes *(recorded 2026-07-16)*

**Decision.** A new complex command mid-run asks finish-or-cancel; cancelled runs keep the nodes they created; run state lives in the canvas store with no page-reload durability.

**Why.** v1 simplicity; created nodes are real work (delete is one click); Trigger.dev is this repo's durability answer *if ever needed*.

**Rejected.** Concurrent runs; cross-session checkpoint persistence.

**Originated →** `2026-07-13-copilot-playbook-runner-design.md` (§2.3, §6, §10).

### D72 — One connect semantics: `canConnect(src, tgt)` backs every connection entry point *(recorded 2026-07-16)*

**Decision.** One ordered helper in `canvas-nodes.ts` validates all four connection call sites — manual drag, drag affordance, the copilot's `connect_nodes`, and the focus-view `+ Add`. Chat and canvas are two entry points into the same semantics; connect itself is instant (cheap/reversible, per D63).

**Why.** The rule was inlined twice and two more consumers arrived; one helper prevents divergence. Ordered on purpose — direction is load-bearing.

**Rejected.** Per-surface ad-hoc wiring; a symmetric `areConnectable`; a proposal gate for connect.

**Originated →** `2026-07-12-copilot-connect-and-selection-design.md` (§9).

### D73 — `@selected` is insert-time expansion to visible handle tokens *(recorded 2026-07-16)*

**Decision.** Picking `@selected` expands the current canvas selection into literal `@HANDLE name` tokens in the composer at insert time; the resolver is unchanged.

**Why.** Transparent and editable; can't drift between typing and send; reuses `resolveMentions`.

**Rejected.** A live `@selected` keyword resolved at send time (selection drift; resolver special-case).

**Originated →** `2026-07-12-copilot-connect-and-selection-design.md` (§9).

### D74 — Implicit selection context travels side-channel, dismissible per turn *(recorded 2026-07-16)*

**Decision.** The canvas selection rides along as ids merged into `mentionedIds` at send — the typed message is never rewritten — shown as a dismissible chip whose dismissal is keyed to the selection signature.

**Why.** Grounding without polluting the visible history; dismissal must reset when the selection actually changes.

**Rejected.** Prepending expanded `@HANDLE` tokens (pollutes history); always-attached context (forces deselection to ask unrelated questions).

**Originated →** `2026-07-14-copilot-selection-context-design.md` (§6).

### D75 — Agent-created nodes place at the viewport center *(recorded 2026-07-16)*

**Decision.** `add_node` / `create_script_node` place the new node at the visible canvas center (`screenToFlowPosition`), offset half a node so its center sits there.

**Why.** "Appears where I'm looking" beats off-screen-right on a populated canvas.

**Rejected.** Cursor position (undefined for chat-driven actions); the rightmost-plus-offset `placeNewNode` heuristic for copilot creates.

**Originated →** `2026-07-12-copilot-connect-and-selection-design.md` (§9).

### D76 — Ref badges flip size at a zoom threshold, never counter-scale *(recorded 2026-07-16)*

**Decision.** Node ref badges switch between two sizes at a zoom threshold via a boolean store selector — no continuous `scale(1/zoom)` counter-scaling.

**Why.** Constant-size labels overflow and collide at far zoom; continuous interpolation re-renders on every zoom tick.

**Rejected.** `scale(1/zoom)`; continuous font interpolation.

**Originated →** `2026-07-14-copilot-selection-context-design.md` (§6).

### D77 — Credit accounting becomes an append-only ledger with atomic row-locked reservation; supersedes D47 *(recorded 2026-07-21; from the auth staging rollout plan, Stage 3)*

**Decision.** `credit_transactions` (`org_id`, `generation_id`, `amount`, `type` ∈
{reservation, consumption, refund, adjustment}, `created_at`) replaces the derived-on-read
`SUM(credits_consumed)`. `reserveCredits()` locks the org's row, sums this-month
reservation+consumption rows, rejects if the estimate would exceed the limit, else inserts a
`reservation` row before the job dispatches. Job success settles the reservation to actual
cost via a `consumption` row; failure/cancel zeroes it via a `refund` row. Month boundary
pinned to UTC.

**Why.** Derived-on-read summing can't stop two concurrent requests near the cap from both
passing — nothing is reserved until after the job runs. A row lock at reservation time closes
that race, and an append-only ledger gives reconciliation and future billing a real audit
trail instead of one mutable number.

**Rejected.** Keeping `SUM(credits_consumed)` derived-on-read (D47's original shape) —
right-sized for the initial design, revisited once the race condition and audit-trail gap
were named explicit requirements for the rollout.

**Originated →** `2026-07-21-auth-staging-rollout-plan.md` (Stage 3).

### D78 — RLS backstop expands to every independently-read org_id table; standing rule going forward; refines D44 *(recorded 2026-07-21; Stage 2)*

**Decision.** RLS moves from "the two Realtime tables" (D44) to every table that carries
`org_id` directly and is read by something other than a `withClient()`-guarded route —
`generations`, `node_files`, `client_kb_jobs`, `canvases`, `credit_transactions`. Standing
rule: any future migration adding an `org_id` column adds its RLS policy in the same
migration. Each policy also matches the JWT's `platform_role` claim directly, so a
super_admin's own Realtime subscription or impersonation session isn't blocked. `clients`
itself stays app-layer-only (D44) — it's never read outside a `withClient()`-guarded path.

**Why.** Workers, webhooks, and Realtime subscriptions read these tables independently of
`clients` — D44's chokepoint-only model didn't reach them once `org_id` was pushed down
directly onto each one.

**Rejected.** RLS on every table regardless of read path (D44's original reasoning still
holds for `clients`, `nodes`, `node_versions` — no independent read path exists for them yet).

**Originated →** `2026-07-21-auth-staging-rollout-plan.md` (Stage 2).

### D79 — Async workers revalidate a job's org_id against the resource's current org_id before processing *(recorded 2026-07-21; Stage 2)*

**Decision.** Generation workers run under the service-role key (RLS-bypassing by design, no
session to check against). Each job row carries its `client_id`/`org_id` immutably from
creation; before processing, the worker re-fetches the target resource and confirms its
current `org_id` still matches the job's. A mismatch is dropped and logged, never processed.

**Why.** D44's app-layer chokepoints and D78's RLS both assume a session; workers have
neither. The job row is the only trustworthy source of tenant identity available to them.

**Originated →** `2026-07-21-auth-staging-rollout-plan.md` (Stage 2).

### D80 — org_memberships: one active org per user enforced by a unique index; last owner of an org can't be removed or demoted; refines D49 *(recorded 2026-07-21; Stage 1)*

**Decision.** `UNIQUE(user_id)` on `org_memberships` makes "one org per user" a database
guarantee in the pilot, not just convention. A trigger blocks removing or demoting the last
`owner` row of an org.

**Why.** D49 designed the join table for future multi-seat but left both invariants implicit;
an org silently left without an owner, or a user in two orgs at once during the single-seat
pilot, are bugs worth making structurally impossible now rather than debugging later.

**Originated →** `2026-07-21-auth-staging-rollout-plan.md` (Stage 1).

### D81 — Impersonation adds an audit log and a read-only default; writes require explicit elevated-mode entry; refines D52 *(recorded 2026-07-21; Stage 4)*

**Decision.** Impersonation sessions are read-only by default. Making a write as an
impersonated org requires a separate, explicit "enter elevated support mode" action.
`impersonation_audit_log` records operator, target org, start/end time, mode, and actions for
every session and every elevated-mode entry. The impersonation cookie is also re-checked
against the operator's *live* super_admin status on every request, not just when the cookie
was set.

**Why.** D52 established the no-session-swap cookie mechanism but didn't distinguish looking
from acting, or log either — for a feature whose whole purpose is one operator quietly
seeing/touching another org's data, both are the difference between "support tool" and
"unaudited backdoor."

**Originated →** `2026-07-21-auth-staging-rollout-plan.md` (Stage 4).

### D82 — No CLI onboarding script; org/user creation ships as the admin UI in Stage 1 *(recorded 2026-07-21; Stage 1)*

**Decision.** `scripts/seed-org.ts` is dropped from the plan. `/admin/orgs/new` (org + user +
membership in one submission) is the only onboarding path, built as part of Stage 1 rather
than deferred behind a script-first MVP. Bootstrapping the very first Yuvabe super_admin
account (before any UI can exist to create it) is a one-time manual step via the Supabase
dashboard/admin API, documented as a setup note — not app code, not a maintained script.

**Why.** A CLI script and a UI form for the same six steps is duplicated logic with two things
to keep in sync; building the UI first (not the script-then-UI dual path the 2026-07-15 spec
described) means there's exactly one onboarding path to test and maintain, and it's the one
non-technical Yuvabe staff can actually use.

**Rejected.** Script-first with the UI as a later nice-to-have (the 2026-07-15 spec's original
§10/§11 shape); building both in parallel.

**Originated →** `2026-07-21-auth-staging-rollout-plan.md` (Stage 1).

### D83 — Auth ships to staging as four independently-deployable stages *(recorded 2026-07-21)*

**Decision.** The auth build lands on staging as four ordered stages, each a mergeable,
demoable increment: **(1)** foundation — schema, Supabase Auth, DAL, `withClient()` org check,
and the admin onboarding UI; **(2)** RLS backstop + async worker tenant check (D78/D79); **(3)**
credit ledger (D77); **(4)** impersonation (D81). (1) is a hard prerequisite for the rest. (2)
ships next because it's the cheapest, most isolated hardening with no new user-visible
surface — no reason to hold it behind feature work. (3) and (4) each depend only on (1) and
can build in parallel with (2); (4) is sequenced last because it's the highest-blast-radius
feature (an operator viewing/acting inside another org's data), and benefits from (1)–(3)
having already proven out on staging first.

**Why.** Each stage is independently testable and reversible on staging; a defect isolated to
one stage (say a ledger bug in Stage 3) doesn't block onboarding new agencies via Stage 1 or
require re-testing impersonation to isolate.

**Originated →** `2026-07-21-auth-staging-rollout-plan.md` (all sections).

### D84 — Forced password change on first login is deferred, not built in the pilot *(recorded 2026-07-21; Stage 1C)*

**Decision.** No forced password-change flow ships in this pass. `loginAction` redirects
straight to `/` on a successful sign-in — no `must_change_password` app_metadata flag, no
`/account/password` page. Applies to every login, operator or future agency owner alike: they
sign in with whatever password they were given and that's it.

**Why.** Cut to reduce complexity in the pilot's first login pass — an explicit scope
reduction, not an oversight. Nothing about the rest of the design depends on it; the temp
password shown once at org-creation time (D82) remains the only credential-handoff step.

**Rejected.** Building it now as originally sketched in the 2026-07-15 spec's User Lifecycle
(§ "Prompted to change password on first login").

**Note for 1D:** the future `createOrgWithOwner` (Stage 1D, admin onboarding UI) must not set
`must_change_password` either — this decision applies there too, not just to the Stage 1C
login path.

**Originated →** `2026-07-21-auth-stage-1c-login-enforcement.md`.

### D85 — super_admin's normal app view is scoped to their own org; cross-org visibility lives only in /admin and (later) impersonation *(recorded 2026-07-21; Stage 1D; resolves a tension between D42's spec §6 and §7)*

**Decision.** `withClient()` and the client/canvas list queries (`listClients`,
`listArchivedClients`, `listRecentCanvases`) no longer bypass the org check for
`super_admin`. On the normal app — client list, canvases, everything outside `/admin` —
`developer@yuvabe.com` sees only Yuvabe's own clients, exactly like any other org's owner.
Cross-org visibility is confined to `/admin`'s own queries (`listOrgsWithClientCount`,
`getOrgById`, `listOrgMembers`), which operate on `organizations`, not `clients`, and are
already `requireSuperAdmin()`-gated. Broader cross-org access (viewing another org's actual
canvas workspace) is deferred to Stage 4 impersonation — until it ships, not even
super_admin can browse an agency's data outside `/admin`'s summary view.

**Why.** The original 2026-07-15 spec (D42) was internally inconsistent: §6 said list
queries have "no filter for super_admin" (unfiltered, always); §7's impersonation flow
implied the opposite — `resolveOrgId()` returns the caller's own org from the membership
table by default, only switching on an explicit impersonation cookie. Built to §6 first
(1C/1D initial pass), then caught during 1D's manual isolation testing: with §6's behavior,
the Yuvabe operator's own workspace showed every onboarded agency's clients mixed in with
Yuvabe's — doesn't scale past a couple of agencies, and makes the whole point of an audited
impersonation feature moot (why build "enter as org," logged, if you can already see
everything all the time regardless). §7's model is more secure, matches the design's own
stated impersonation semantics, and keeps blast radius proportional to intent: "administering
the platform" (`/admin`) is a different action from "acting as an org" (the normal app).

**Rejected.** Keeping the blanket bypass (§6 as literally written) — simpler, no rework, but
doesn't scale and undercuts D52's impersonation design.

**Originated →** `2026-07-21-auth-stage-1d-admin-onboarding-ui.md`.

### D86 — Dropped a pre-existing `anon_read_generations` RLS policy that silently defeated the new org-isolation policy *(recorded 2026-07-23; Stage 2B)*

**Decision.** `generations` carried a pre-existing `anon_read_generations` policy
(`qual: true`, `roles: {public}`) predating this rollout — not recorded in any migration,
likely a leftover from the pre-auth era (D14, "whole app open," never cleaned up when login
was added). Postgres OR's permissive RLS policies together, so this unconditional policy
granted public read access to every row — including to unauthenticated `anon` requests
hitting Supabase's REST API directly, bypassing the Next.js app entirely — regardless of
0014's new org-scoped `org isolation` policy on the same table. Dropped in migration `0015`.

**Why.** Found only by inspecting `pg_policies` directly after applying 0014; the migration's
own `rowsecurity`/row-count checks reported success without revealing a second policy quietly
overriding the first. Left in place, the RLS backstop just built for `generations` would have
been cosmetic — present in the catalog, provably inert in practice.

**Originated →** `2026-07-21-auth-stage-2b-rls-backstop.md`.

### D88 — Default-deny RLS enabled on every remaining table; supersedes the "app-layer only, no RLS" half of D44 *(recorded 2026-07-23; Stage 2B follow-on)*

**Decision.** All 10 tables that still had RLS disabled after 2B (`clients`, `nodes`,
`node_versions`, `edges`, `organizations`, `profiles`, `org_memberships`,
`client_brand_images`, `client_kb_documents`, `client_kb_versions`) now have RLS enabled
with **zero policies** — default-deny for `anon`/`authenticated`. `org_memberships`
additionally got one narrow policy (`user_id = auth.uid()`, self-read only), because the
`org isolation` policies on `canvases`/`client_kb_jobs`/`generations` (D78) subquery it to
find the caller's org, and RLS applies across that subquery too.

**Why.** Confirmed via `information_schema.role_table_grants` on staging: `anon` — fully
unauthenticated, no login required — held `SELECT`/`INSERT`/`UPDATE`/`DELETE`/`TRUNCATE` on
all 10 tables, reachable directly through Supabase's REST API using the public anon key
(embedded in every page the site serves), completely bypassing `proxy.ts`, the DAL, and
every `withClient`/`withCanvas`/`withNode` check built across Stage 1 and 2A. D44's
"app-layer only, RLS deferred as backstop" reasoning assumed these tables were merely
*unreached* by direct browser access — it did not verify the underlying grants, which
(per Supabase's default project setup) make "RLS disabled" equivalent to "world-readable
and world-writable" for any table the default grants still cover. This was a live,
currently-exploitable gap on staging, not a theoretical one.

**Fix was cheap, unlike what D44 avoided.** D44 rejected "RLS-everywhere" because writing
and maintaining correct per-org *policies* across ~34 service-role call sites and 10+
tables was too large a lift for the pilot. This decision does not do that — it enables RLS
with **no policies**, which is a single `alter table ... enable row level security`
per table and nothing else, since the app's real data access always goes through the
service-role client (`createServerSupabase()`), which bypasses RLS regardless of policy
count. Nothing in the app's behavior changes. Only the unintended direct-REST-API path
closes.

**Rejected.** Leaving these tables as app-layer-only (D44 as originally scoped) — correct
in spirit, but never actually verified against the real grant state, and wrong in practice
once checked.

**Originated →** `2026-07-21-auth-stage-2-index.md` (post-2B finding).

### D89 — Authenticate the generation completion webhook with a shared secret *(recorded 2026-07-23; Stage 2C)*

**Decision.** `/api/webhooks/generation` had no authentication at all — unlike
`/api/webhooks/kb-build`, which already checked `Authorization: Bearer
TRIGGER_WEBHOOK_SECRET` before processing anything. Fixed with the same secret, in two
forms: the internal Trigger.dev path (`video-generate.ts` calling this app's own webhook)
sends the identical `Authorization` header; the Kling path (an external provider calling
back a URL, not guaranteed to forward custom headers) carries the secret as a `token`
query parameter on the callback URL instead. Both checks share one extracted helper,
`isAuthorizedWebhook()`, now used by both webhooks.

**Why.** Found while scoping Stage 2C's originally-planned D79 tenant check — a distinct,
larger gap than D79 itself. Without this, anyone who knew or guessed a `generationId` (or
a Kling `provider_job_id`) could POST a fake "succeeded" result with an
attacker-controlled `videoUrl`, which the server fetches and uploads to GCS as if it were
the real output — a data-integrity issue and a mild SSRF-adjacent risk, not just a
missing-check formality.

**Superseded in part by D90.** The Kling path described above (URL-token auth, since an
external provider calling back isn't guaranteed to forward headers) no longer exists — D90's
Kling rewrite moved completion to internal polling, so Kling never calls this webhook at all
anymore. `isAuthorizedWebhook()`'s header-based check (the internal Trigger.dev path) still
stands unchanged; only the now-dead Kling branch and its `?provider=kling&token=...` URL
shape were removed from `route.ts` when merging D90's rewrite in.

**Originated →** `2026-07-21-auth-stage-2c-worker-tenant-check.md`.

### D90 — Kling integration rebuilt against verified docs; polling replaces webhook *(recorded 2026-07-23; renumbered from a D77 collision at merge — this branch had already assigned D77 to the credit-ledger decision above)*

**Decision.** The 6 live Kling models (`v1-5`/`v1-6`/`v2-1`/`v2-1-master`/`v2-6`/`v3`) were
built with no working citation and no working host — every Kling generation on `main` is
broken. Turns out Kling runs two real API generations side by side: a legacy unified
`/v1/videos/image2video` endpoint (`model_name` field selects version; this is where
`cfg_scale`/`camera_control`/`mode` genuinely live) and 5 dedicated per-model endpoints
(`contents[]`/`settings`/`options` shape, no `cfg_scale`/`camera_control`/`mode` at all).
The old code reached for generation-1 fields but called the wrong host with the wrong
body shape, so it never worked either way. Rebuilt against exactly the 5
latest-generation models, verified from official docs the user fetched directly from
`kling.ai/document-api/`: `kling-3.0-turbo`, `kling-2.6`, `kling-2.5-turbo`, `kling-3.0`,
`kling-o1`. The legacy-endpoint models (`v1`/`v1-5`/`v1-6`/`v2-master`/`v2-1`/
`v2-1-master`) are confirmed real but deliberately out of scope for this pass, not
re-added. Completion moves from webhook (`callback_url` + `provider_job_id` DB lookup) to
polling `GET /tasks` inside the Trigger.dev task, matching the existing Veo pattern —
chosen specifically for log visibility into in-flight/failed jobs, which the pure-webhook
design couldn't provide (webhook route had no logging, and a lost callback left a
generation stuck with no trace).

**Why.** Unverified third-party API surfaces are exactly where a plausible-looking
contract silently fails end-to-end; the fix is citing every field against a real, fetched
doc, not re-deriving from memory or assuming "looks familiar" means "verified." Polling
was chosen over webhook+reconciliation because it's the simpler mechanism already proven
by `veo.ts`, and per-iteration logging directly answers "is this job alive and what's it
doing" without a second scheduled job.

**Rejected.** Re-adding the legacy-endpoint models in this pass (real, but needs the
linked Capability Map page first to know which fields apply per model — not implementing
without that source, same mistake otherwise). Webhook + structured logging only (still
has a delivery-failure blind spot). Webhook + scheduled reconciliation sweep (adds a
second job/code path for marginal benefit over polling, which already logs and can't
lose a callback since there is none).

**Originated →** `2026-07-23-kling-api-correction-design.md`, supersedes
`2026-07-11-kling-video-gen-integration-design.md`.

### D78 — Video Prompt → Video Gen is provider-aware (Target selector + text-camera variants) *(recorded 2026-07-23; refines D24; the Kling `camera_control` path is SUPERSEDED by D79)*

**Decision.** The motion prompt is shaped for its target provider (`text-camera` for Veo/Sora,
`external-camera` for Kling), selected by a Target selector on the Video Prompt node that locks to a
connected Video Gen node's provider when present. For Kling, camera was originally driven by a native
`camera_control` param via a curated visual grid on the Video Gen node, and the prompt written
camera-silent. A default `negative_prompt` is prefilled for Kling.

**Why.** D24 shipped a Veo-only motion prompt; the registry has since grown Kling models with a
different prompt shape. The Target selector + provider-shaped prompt variants are the durable part of
this decision; the `camera_control` channel is not (see D79).

**Rejected — text-primary (A).** Simpler/single-node but leaves Kling's camera to prose and the
`negative_prompt` unused.

**Refines** D24. **Originated →** `2026-07-23-provider-aware-video-prompt-design.md`.

### D79 — Uniform text-camera across all providers *(recorded 2026-07-25; refines D24; reverses D78's Kling `camera_control` signal)*

**Decision.** Camera is a uniform text-in-prompt control authored on the Video Prompt node (the
`CameraSelect` grid) for every provider. Kling's `camera_control` path — gen-node grid, axis sliders,
`kling-camera.ts`, and the request emission — is removed. The Target selector is retained and switches
only the prompt variant (shared spine + minimal per-provider deltas).

**Roster (integrated `main`).** Veo 3.1 Lite/Fast/Quality + Sora 2 + Kling's five verified models
(D77). NOTE: the consolidation design as originally written paired uniform text-camera with a *pruned*
roster (Kling 3.0 only, Sora + legacy Kling dropped); that pruning is **not** adopted — the integrated
`main` keeps D77's full verified Kling roster and Sora 2. Only the uniform-text-camera design is taken
from the consolidation work. *(ADR numbering reconciled during the 2026-07-26 three-branch integration;
these were recorded as clashing D77/D78 entries on parallel branches — final numbering to confirm on review.)*

**Why.** D78 assumed Kling drives camera via `camera_control`; the official Kling capability map shows
`camera_control` is Kling-1.5-only — Kling 3.0+ use a separate, un-integrated Motion Control feature.
Both vendors' prompt guides recommend camera-in-text. Uniform text-camera is less code and a more
consistent UX.

**Rejected — finish D78 as built.** Would ship a camera control no kept model honors and diverge the
Prompt-node UX by provider for no capability gain.

**Refines** D24. **Reverses** D78's camera-signal model. **Originated →**
`2026-07-25-video-provider-consolidation-design.md` (research:
`../../architecture/2026-07-25-video-provider-capability-research.md`).

### D80 — Preservation-first motion prompt + Veo `negativePrompt` *(recorded 2026-07-26; refines D24; builds on D79)*

**Decision.** The shared motion-prompt spine (D79) is made **preservation-first**: it drops the hard
word cap and restates the fixed subject identity (product shape, label, logo, lettering, colours,
props, lighting) so branded products hold — uniformly, for every provider, not just Veo. The camera
catalog uses precise, invariant-naming vocabulary ("constant distance, height, focal length"). Veo
visual-defect suppression is driven by its native `negativePrompt` param with a product-tuned default
(no bare `text`/`logo`, so a product's real label survives); bare "No X, no Y" negations stay out of
the positive prompt. Veo's built-in prompt rewriter (`enhancePrompt`) is left enabled.

**Why.** D24/D79 shipped a terse author. Google's Veo 3.1 guidance — "more detail, more control", a
dedicated negative-prompt field, and specific camera vocabulary — are quality levers the terse path
can't reach, and they matter most for branded-product preservation. Folding preservation into the
shared spine keeps it uniform across providers (D79).

**Rejected.** Negatives-only (positive prompt stays lean → identity never stated); an intent-driven
preservation *mode* toggle; `enhancePrompt: false` now (rewriter kept on — the first lever if QA shows
preservation slipping).

**Refines** D24; builds on D79 (folds preservation into the shared spine). **Originated →**
`2026-07-26-veo-preservation-first-prompt-design.md`. *(Originally drafted as a clashing D78 on the Veo
branch; renumbered during the 2026-07-26 three-branch integration — final numbering to confirm on review.)*

### D81 — Kling O1 params follow the live endpoint, not the 3.0-omni doc table *(recorded 2026-07-27; corrects the O1 row of `2026-07-23-kling-api-correction-design.md` §Per-model settings fields)*

**Decision.** `kling:kling-o1`'s params are pinned to what `POST /omni-video/kling-o1` actually
accepts, which is **not** what the published omni docs describe:
- **duration** — a `5` / `10` **select**, not a 3–10 slider. Kling returns
  `400 {"code":1201,"message":"Duration only supports 5 or 10 seconds when no refer_image is provided"}`,
  and `buildKlingContents` only ever emits `first_frame`/`last_frame`, so the unrestricted branch is
  unreachable by construction. Two non-contiguous stops cannot be a range control, so the control
  *type* changes for O1 — 3.0 keeps its slider.
- **audio** — `native` / `off`, not `original` / `off`. `original` retains a *reference video's*
  soundtrack; we never send `base_video`/`feature_video`, so it produced silence. O1 previously had
  no reachable audio-on value at all. A stored `original` migrates to `native` (same billing tier).
- **multi_shot** — now always sent, defaulting `false`, and exposed as a toggle like 3.0. Omitting
  it was not neutral: Kling's server-side default is `true`, so every O1 clip was silently opting
  into shot cuts, against the product intent recorded for 3.0.

Both duration and audio are additionally normalised in `buildO1Settings`, because nothing
re-validates persisted node params on load.

**Why.** The O1 row was read off the `/omni-video/kling-3.0-omni` doc page, which enumerates
duration 3–15 with no `refer_image` caveat — but that page documents a **different path** than the
one we call. The live endpoint's own validator is the only authority we have for `kling-o1`; there is
no O1-specific doc page. Kling 3.0's 3–15 range **was** re-verified against
`/image-to-video/kling-3.0` and is correct — the two models genuinely differ.

**Rejected.** Widening duration to 3–15 on the strength of the omni doc page (wrong endpoint);
implementing `refer_image` as part of this fix (that is the real feature — Ref chip → up to 7 images,
`@image_n` prompt refs, arbitrary duration — and needs its own design); clamping 3.0's duration too
(doc-confirmed correct); dropping stale `original` audio to `off` (loses the user's intent to have
sound).

**Known-unfixed, surfaced by the same doc pass:** `settings.negative_prompt` appears in **neither**
endpoint's schema — we send it on both Kling models with a long prefilled default and Kling silently
ignores it, so that textarea is currently decorative. `build3_0Settings` also falls back to
`multi_shot ?? true`, contradicting `multiShotParam`'s declared `false` default, so pre-toggle 3.0
nodes still generate multi-shot. Neither is changed here.

**Corrects** the O1 row of `2026-07-23-kling-api-correction-design.md` (which remains authoritative
for the other four Kling models). **Originated →** live-API debugging, 2026-07-27; official Kling
docs pasted in by the user (kling.ai returns HTTP 446 to automated fetches).

### D91 — OpenAI reference images are normalized server-side, never blocked on dimensions *(recorded 2026-07-28)*

**Decision.** For OpenAI image-gen models, aspect-ratio (>3:1), max-edge (3840px), and
multiple-of-16 constraints are enforced by **auto-correcting the image server-side**
(center-crop, downscale, round-down) immediately before the `images.edit`/`images.generate`
call, instead of gating on them in `validateReferenceImages`. Per-image size (50MB) and Gemini's
aggregate size cap remain hard blocks — no resize fixes an outright-too-large file.
`background: "transparent"` + `output_format: "jpeg"` (invalid combo — JPEG has no alpha) is
silently corrected to `output_format: "png"`, same philosophy.

**Why.** Root-caused 27 of 35 staging+prod OpenAI image-gen failures
(`generations.status='failed'`) to a leaky validation gate: `validate.ts` skips its
dimension checks whenever image metadata wasn't backfilled, which happens routinely on
multi-reference edits (up to 16 images via `assembleEditReferences`) — so bad-dimension images
reached OpenAI and failed there with an unactionable error instead of being caught upfront.
Normalizing unconditionally, right before the provider call, can't be bypassed the way a
pre-flight metadata-dependent gate can.

**Rejected.** Fixing the validation backfill instead (still leaves a block-the-user UX for a
problem that's trivially auto-fixable); padding instead of cropping for the aspect-ratio fix
(adds visible blank space to what OpenAI sees as reference content).

**Originated →** `2026-07-28-openai-image-gen-error-remediation-design.md`.

### D92 — Pre-generation input-token estimate becomes a static derived formula, not a live vendor call *(recorded 2026-08-03)*

**Decision.** Replace `countOpenAIInputTokens`/`countGeminiInputTokens` (OpenAI's
`responses.inputTokens.count`, Gemini's `countTokens` — both real network calls made on every
debounced param change) with pure synchronous functions: `180 + refCount × 260` for Gemini
(all 4 variants — the fit is model-independent), `190 + refCount × {330 | 1550}` for OpenAI
(per-model per-reference constant; `gpt-image-2` tokenizes references at ~5× the rate of
`gpt-image-1`/`-1-mini`). Constants derived from 659 real (non-test-client) historical image
generations across staging + production, rounded up from p90 to preserve the existing
never-under-reserve philosophy. Output-cost tables in `cost.ts` are untouched — they were
already static and were never the latency source.

**Why.** The "Est. N credits" label felt laggy because every param tweak triggered a real
vendor round-trip purely to count input tokens, even though input cost is a small fraction of
total cost for every priced model here (output pricing dominates) and this estimate never
touches real billing — settlement always uses the actual provider `usage` from the real
generation call, not this pre-flight number.

**Rejected.** Caching live results by `(model, quality, size, refCount, promptHash)` (still
pays live latency on first hit of any new combination); keeping the live call for accuracy
(unnecessary — real settlement doesn't read this value, and input cost's share of the total
is too small to matter).

**Originated →** `2026-08-03-image-input-cost-static-estimate-design.md`.

### D93 — Image-gen's pre-generation estimate is computed client-side, no API route at all; refines D92 *(recorded 2026-08-03)*

**Decision.** Delete `/api/nodes/[id]/image-generate/estimate/route.ts` entirely.
`image-gen-focus-view.tsx` now imports `estimateImageGenerationCostUsd` (D92) directly and
calls it inside `useMemo` — matching video-gen's `computeVideoCost`, which has always been
called straight in the render body with no route at all. Required moving
`aspectRatioToOpenAISize` from `providers/openai.ts` (which imports `sharp` + the OpenAI SDK,
real server-only dependencies) into `cost.ts` (which has never had one), and dropping
`estimate.ts`'s now-unnecessary `"server-only"` guard.

**Why.** D92 made the estimate's own computation synchronous, but
`image-gen-focus-view.tsx` still reached it through a `fetch()` to our own API route, and that
route's `withNode` wrapper does a real Supabase query (`nodes` joined to `canvases`/`clients`)
plus `resolveCallerContext()` on every single call — a genuine DB + auth round trip on every
param change, independent of how fast the estimate math itself is. The user caught this
directly by comparing image-gen's estimate against video-gen's (verifiably instant) and asking
why they didn't match. D92 alone was an incomplete fix for the underlying complaint (perceived
latency), even though it correctly eliminated the actual vendor API call it targeted.

**Rejected.** Keeping the route but optimizing `withNode` (e.g. caching the node lookup) —
solves the wrong layer; video-gen proves the lookup isn't needed for a preview estimate at
all, since nothing about *cost* depends on node/canvas/client identity, only on
model/quality/size/referenceCount, all already known client-side.

**Refines →** D92 (same commit family, same design doc, extends its scope after
implementation surfaced a latency source D92's own analysis didn't cover).

**Originated →** `2026-08-03-image-input-cost-static-estimate-design.md` §6.
### D92 — Client Moodboards are URL-first; bytes are re-hosted only on use *(recorded 2026-07-28; builds on D13, D14; revises the reference-clipper target model)*

**Decision.** A **client-level Moodboard** — a named, reusable collection of reference images ("Face
cream", "Mother's Day") owned by a client, like the Brand KB and Drive references (PRD §6). Boards are
filled by a small **MV3 capture extension** (right-click any image on the web → "Add to moodboard",
sticky target board) and by in-app **add-by-URL**, and are browsed as a **Moodboards tab** in the
existing Gallery drawer (board list → board contents, mirroring the Drive folder drill-down). Storage
is **URL-first**: an item is a row holding the image URL + the provenance page URL — nothing is fetched
or stored at add time, and boards render by hotlinking. **Full-res bytes are re-hosted to GCS only when
an item is dragged onto the canvas** and becomes an ordinary File node (`POST /api/nodes/[id]/file/from-url`,
a near-clone of the existing Drive re-host route). Two tables (`moodboards`, `moodboard_items`); the
extension-facing routes are open, per D14.

**Why.** Pinterest cannot be embedded (it sends `x-frame-options: SAMEORIGIN` + CSP `frame-ancestors
'self'`, verified 2026-07-22) and its API exposes only a user's own boards — so browsing stays in the
real browser, and the fixable part is the path from "found a reference" to "usable in the canvas."
URL-first is the least code and zero storage to validate that loop, and re-host-on-use puts durable
storage exactly where durability starts to matter: the image now feeds generation and lands in the
archive bundle (PRD §16). The v1 schema is a strict **subset** of the durable/semantic model, so
thumbnails (link-rot insurance) and CLIP embeddings for shot→reference search (PRD F6) are additive
`ALTER TABLE … ADD COLUMN` later — nothing is stored that must be migrated or thrown away.

**Accepted caveat.** A CDN URL can rotate, so a long-idle board can show a broken tile and a
drag-to-use can fail; the File node surfaces the existing `uploadError` state. Mitigation (add-time
thumbnail cache) is the first deferred increment, not v1.

**Rejected.** (a) Embed/iframe Pinterest — browser-blocked; (b) store full bytes at add time and purge
later — more work at both ends, and vector search needs small *embeddings*, not hoarded images;
(c) URL-only File **nodes** on the canvas — link rot on a live reference that feeds generation and the
archive (re-host on use instead); (d) inline board-creation from the extension (Slice B v1 picks
existing boards only).

**Revises** the **reference clipper** (`2026-07-05-reference-clipper-design.md`) — which is **shipped**
(`clipper-extension/`, `POST /api/ingest-image`, `src/lib/reference-clipper/`), not a paper design. Its
capture target was "push to the **active canvas tab** as File nodes, then reload the tab"; D92 moves the
target to "add to a chosen **client moodboard** (staging), with moodboard → canvas as a separate,
re-hosting drag." The two models differ in *when* an image becomes a canvas node: the clipper pushes
straight onto a canvas at capture time, the moodboard stages it against a client for later reuse.

*(Numbering note: the clipper design claimed **D36** for itself but was never appended to this log, and
D36 was subsequently taken by the guided next-node flow. The moodboard spec inherits that bad citation.
The clipper therefore still has **no D-number**; assign one if it is kept.)*

> **Resolved by D93** — the two capture extensions did *not* coexist for long: the clipper was
> retired the same week and removed from the codebase. See below.

**Originated →** `2026-07-22-client-moodboards-design.md`.

### D93 — The reference clipper is retired; moodboards are the single capture path *(recorded 2026-07-28; supersedes the reference clipper, which never received a D-number; resolves the D92 follow-up)*

**Decision.** The **reference clipper is removed from the codebase** — `clipper-extension/`,
`POST /api/ingest-image`, and `src/lib/reference-clipper/` (with its 8 unit tests) are deleted.
**`moodboard-extension/` (D92) is the one browser capture path** into CreativeOS. The clipper's design
spec and plan are kept as historical records with retirement banners, not deleted.

**Why.** Both extensions offered the same gesture — right-click an image on the web, send it to
CreativeOS, re-host to GCS — differing only in destination. Shipping two is a maintenance and
teaching cost (two manifests, two configured origins, two ingest routes to secure) for one user
intent. The moodboard target is the better of the two: it **stages against a client** so a reference
is reusable across every canvas for that client, where the clipper pushed onto whichever canvas
happened to be in the active tab and had to **reload the tab** to render. The clipper's push-now
convenience is recoverable later as a moodboard feature (add-and-immediately-drop) if it is missed —
the reverse (rebuilding client-level staging inside the clipper) is the larger job.

**What is lost.** The one-step "web image → node on the canvas I'm looking at" path. Under D92 the
same image takes two steps: capture to a board, then drag it onto the canvas. Accepted — the drag is
where re-hosting happens (D92), and the extra step buys client-level reuse.

**Also removes** the slug-based open ingest route, which shrinks the deferred-auth surface: the
multi-tenancy pilot's plan to put `/api/ingest-image` behind a session + org check (**D48**) is now
moot — there is no such route. `moodboard-extension/`'s open endpoints inherit that hardening job
instead.

**Rejected.** (a) Keep both behind a destination picker in one extension — more code than either
alone, for an intent the moodboard already covers; (b) keep the clipper unmaintained — an open,
unauthenticated write path into the canvas is not something to leave lying around untended;
(c) delete the clipper's spec/plan docs — the *why* is worth keeping even when the code is not.

**Supersedes** the reference clipper (`2026-07-05-reference-clipper-design.md`). **Resolves** the D92
follow-up.

### D94 — Eval viewer generalizes to a per-node, all-action-types, version-aware error-analysis surface *(recorded 2026-07-02; **renumbered from D35** when the branch was integrated on 2026-07-30 — main had meanwhile assigned D35 to the Generation Tray above, and D36 builds on that; builds on D4/D18/D22; extends the built eval viewer; consumes the model-request capture; separate axis from D29/D34)*
**Decision.** The eval viewer becomes a per-canvas surface that lists **all generated nodes grouped by
action** (a `listNodeTraces` query + pure `mapNodeTraces`), whose detail focuses on **input → output**
(polymorphic renderers), shows the **exact request sent** (the actual `inputs_used.request` content —
system / compiled user / attachments — via the reused `ModelRequestPanel`), supports **open coding only**
(Good/Bad + note on the *viewed* version via `setVersionLabelAction`), and lets a reviewer **walk a node's
versions** with a **Δ that names what the human changed** — computed by **structured field comparison**
(pure `diffVersions`: `controls` / `instruction` / `kbSlices` / upstream `reference` / `promptVersion`),
**no LLM**; media outputs compared side-by-side; a **re-roll** flagged when nothing structured changed
(same request, output moved = model nondeterminism). A list+detail **`EvalWorkbench` replaces the
sequential `ReviewScreen`** for this route. **The quality/learning axis (`decision`/`note`) stays distinct
from the sign-off axis (`approval_status`, D29/D34).** **Why.** "See what we can learn to improve the
prompt" — Hamel/Shankar error analysis (*look → open-code → cluster → fix*); the viewer is the microscope.
Naming the Δ (not just diffing a blob) is possible because inputs are captured as *structured* fields.
**Rejected.** Failure tags / axial clustering in this surface (deferred to a later analyse step, by-hand
first); a blob text-diff as the *primary* Δ (loses the ability to name the changed knob); an LLM for the Δ
(unnecessary, non-deterministic). **No migration** — a query + mapping generalization over the existing
envelope. **Deferred.** Tags/axial, cross-client rollup, LLM-judge scorers, production upstream-input
resolution for panel A, structured (script) rich rendering.

**Integration notes (2026-07-30).** The `/eval/[canvasId]` route **keeps the org-isolation guard** the
auth rollout added to it — a canvas outside the caller's org renders as not-found, never confirming a
foreign org's canvas exists — so the workbench swap did not reopen that path. `ModelRequestPanel` kept
main's tabbed shell (it renders inside the "Sent to model" rail pane, which supplies the heading) and
gained this branch's `splitBlocks` sectioning for the compiled-input tab; the branch's separate drawer
was dropped as redundant with the rail. `listEvalTraces` + `ReviewScreen` are left in place but are now
**unreferenced** — the sequential reviewer this decision replaces.
**Originated.** `2026-07-02-eval-viewer-error-analysis-design.md`; plan `2026-07-02-eval-viewer.md`.

### Parked / out-of-scope (with revisit triggers)
| Item | Status | Revisit when |
|---|---|---|
| **Brief node** (upstream-brief parsing) | Defined MVP node type; **retained, not built** — Script node shipped instead (D16) | A project needs to start from a brief, not a finished script |
| Context "% slider" / relevance ranking | Parked (D7) | Client KB outgrows the context window → add RAG |
| Full client KB (structured + files + selection) | ✅ Pulled forward into Stage 1 (D17) | — |
| Multi-tenant auth | 🟡 In staged rollout (Stage 1 of 4 — see `2026-07-21-auth-staging-rollout-plan.md`) | — |
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

### D95 — Start + end frame is the default shape of a video generation, expressed by layout and never by a gate *(recorded 2026-07-28; **renumbered from D83** when the branch was integrated on 2026-08-02 — main had meanwhile assigned D83–D88 to the auth/RLS decisions above; originated → `2026-07-28-video-start-end-spine-design.md`)*
**Decision.** The video focus view leads with a **shot spine** — Start → End | Reference in narrative
order — that reports which roles are filled and what duration the combination yields. A missing end
frame is an **empty slot at rest**, never an error and never a block on Generate. Slots the model cannot
use are shown as `unsupported` rather than omitted, so absence stays legible. The spine is **read-only**:
roles are assigned from the connected thumbnails, so its slots are status pips, deliberately not the
dashed-primary + plus treatment this codebase reserves for Add affordances.
**Why.** An image costs ~$0.067 against $0.40–$4.20 for a video re-roll, so composing an end frame is
6–63× cheaper than re-rolling until the motion is right — and it forces the operator to decide what the
action actually *is*. Opinionated, but a preference the layout states rather than a rule that blocks.
**Rejected.** Requiring an end frame; a confirm dialog on the way to Generate (both make an opinion feel
like a defect). **Refines** D35's tray-first generation flow.

### D96 — The end frame is derived by editing the start frame, not generated fresh *(recorded 2026-07-28; **renumbered from D84**; builds on D27 image-edit)*
**Decision.** "Create end frame" spawns an **image-gen node seeded with the start frame as its edit
base**, wired straight back into the video node. Seeding is done with a **graph edge**, not a data field:
the image-gen focus view already derives its edit base from the connected upstream image, so connecting
the start frame *is* how you seed the edit. **Why.** Interpolation morphs in proportion to how far apart
the two frames are; a freshly generated "ending" is a different scene, and the model tweens between two
strangers. An edit keeps scene, lighting and subject and moves only what should move.
**Rejected.** A fresh text-to-image generation for the end frame. **Status:** the button was removed on
2026-08-02 pending a fuller treatment; `use-derive-end-frame.ts` and `derive-end-frame.ts` remain.

### D97 — The API route rejects rule violations; it never auto-corrects *(recorded 2026-07-28; **renumbered from D85**; refines D31's server-authority stance)*
**Decision.** Constraint rules are evaluated in the UI, and `validateAgainstRules` runs again in
`video-generate/route.ts` as a **backstop that returns 400** — never a fixup. The server's check is
**stricter** than the client's: it counts references that actually resolved to URLs after upstream
traversal and capping, not roles merely assigned, and it runs **before** `insertGeneration` and
`reserveCredits` so a rejected request records no generation and leaves the credit balance untouched.
**Why.** Auto-correcting silently changes both what the caller asked for and what they are billed. 13 Veo
generations were spent on references at duration 4 or 6 before this existed.
**Rejected.** Clamping params server-side to the nearest legal value.

### D98 — Locked parameter values are written into params state, not merely displayed *(recorded 2026-07-28; **renumbered from D86**)*
**Decision.** `reconcileLockedParams` merges rule-locked values into the params that get **posted**, and
every read — panel, cost estimate, request — goes through the merged object. Derived at render rather
than synchronised through an effect: there is no divergence to sync if there is only one source.
**Why.** The panel rendered `lockedParams[name]` while `params[name]` kept the stale value, and the
control was `disabled` so nothing could reconcile them. Since `params` is what gets sent, the UI showed a
locked 8 and sent 6 — 11 observed generation failures. The same divergence would have mis-quoted the
credit estimate, which is why it reads the reconciled values too.
**Rejected.** Syncing through a `useEffect` (adds a render where the two disagree).

### D99 — Kling 3.0 and Kling O1 carry separate capability descriptors *(recorded 2026-07-28; **renumbered from D87**; refines D90's Kling rebuild)*
**Decision.** No shared `KLING_IMAGE_INPUTS_WITH_END`. Each Kling model declares its own
`imageInputs` and its own rule list. **Why.** Their reference mechanisms differ in kind — 3.0 uses an
`element` registry, O1 takes inline `refer_image` — and a single shape can only be wrong for one of them.
3.0's 3–15s range is left untouched: the 5/10 restriction is evidenced only on the omni endpoint and is
not narrowed on inference. **Rejected.** One descriptor with optional fields.

### D100 — Kling O1 takes inline reference images, budgeted conservatively at 5 *(recorded 2026-07-28; **renumbered from D88**; builds on D99)*
**Decision.** O1 emits `refer_image` contents inline, with `maxReferenceImages: 5` against the omni
endpoint's documented cap of 7 total images. **Why.** Whether `first_frame`/`last_frame` count toward
that 7 is undocumented; 5 stays in budget with both frames in use. Being wrong this way costs two slots,
being wrong the other way causes 400s. **Open.** Whether references widen O1's 5/10 duration restriction
is UNVERIFIED — confirm before relaxing. O1's 4k tier is likewise unsettled: the branch added one on
inference, but the pricing table verified from kling.ai on 2026-07-24 has no O1 4k row, so the merge kept
720p/1080p rather than expose a resolution that cannot be priced. **Rejected.** Sourcing O1's limits from
fal.ai's wrapper, whose narrower values produced the wrong duration, audio and resolution sets.

### D101 — Header identity chrome consolidates into a profile popover; `/api/me` gains a real `orgRole` alongside the collapsed gating `role` *(recorded 2026-08-05)*
**Decision.** Replace the always-visible name pill + adjacent sign-out button (`IdentityChip`) and the
org-name span in `HeaderBrand` with a single avatar-triggered popover (name, real role, org, sign out).
`/api/me` adds an additive `orgRole: OrgRole` field for display purposes, separate from the existing
collapsed `Identity.role` (frozen per D53, still used only for Approve-gating). **Why.** Identity chrome
was split across both ends of the header for no functional reason; consolidating reduces permanent bar
width and matches the Canva-style chrome the rest of the editor follows. The collapsed `role` field
cannot be shown to users directly — it would display "Senior" for an Owner. **Rejected.** Showing the
collapsed `role` in the popover directly (wrong for Owners) instead of adding `orgRole`. Folding the
credits pill or the `Admin` link into the popover (one's a glanceable live meter, the other's
navigation, not an account action). **Refines.** D53 (Identity's frozen shape — unchanged; `orgRole` is
an additive sibling field on the `/api/me` response, same pattern the admin-UX-consistency spec used for
`platformRole`). **Originated.** `2026-08-05-profile-popover-header-design.md`. *This branch was cut
from `main`, whose ADR log tops out at D100 here — `staging` has since moved ahead independently (up to
~D119); this number may need renumbering at merge time per this log's existing convention.*
### D102 — Edit references are explicit: an empty selection sends no extras *(recorded 2026-08-04; **renumbered from D101** on 2026-08-12 — the profile-popover entry above had independently claimed D101, and that entry's own note anticipated a collision; the later position in this log takes the higher number so the sequence stays ascending; reverses D27's "empty = all connected" default; refines D37/D39)*
**Decision.** In Image Gen **Edit** mode, only the connected image nodes the operator has
**ticked** under "References for this edit" are sent as `extraReferenceUrls`. An empty
selection sends **no extras** — the edit sees only the base image. This replaces the D27
default, in which an empty selection expanded to *all* other connected images. Enforced at
both boundaries: `selectEditReferenceUrls` no longer falls back to `nonBase`, and the edit
route no longer falls back to `connectedImageUrls` when the field is absent. **The Generate
tab is unchanged** — there, all connected images remain references.

**Why.** The tiles rendered as *unselected* (dashed border, no check) while the selection
logic read `[]` as "unspecified → use everything", so edits silently received reference
images the operator never picked — observed as a product tin bleeding into an edit whose
tile was visibly unticked. The empty state also made "send no references" unreachable:
deselecting the last tile returned `[]`, which re-expanded to all. One value, `[]`, carried
two contradictory meanings across the view/logic seam; making selection explicit collapses
them to one.

**Rejected.** Seeding the selection with every connected id on open and keeping the D27
default (would have preserved existing behaviour and only made it *visible*, but leaves the
operator opted-in by default — the opposite of "explicit"); using `undefined` vs `[]` as a
never-chosen/cleared discriminator (same effect, extra state ambiguity to carry in
`editReferenceNodeIds` forever).

**Migration.** None. `editReferenceNodeIds` keeps its shape; nodes that never ticked a tile
now send no extras, which changes edit output on canvases tuned under the old default — the
accepted cost of the fix. The `replace`/`add` intent warning was reworded to say ticking is
required, since "connected" is no longer sufficient.

**Originated.** Bug report 2026-08-04 (Image Gen edit mode); regression test in
`src/lib/image-gen/__tests__/edit-prompt.test.ts`.

### D103 — In-app onboarding is pull-not-push: empty states carry the actions, a global Help menu carries the explanations *(recorded 2026-08-12; originated → `2026-08-12-onboarding-empty-states-and-help-chapters-design.md`)*

**Decision.** Onboarding for design partners is two surfaces only: list empty states with a
concept line plus one CTA, and a global `Help ▾` menu of chaptered, video-led explainers the
user opens on demand. Nothing is pushed, sequenced, or fired on first view.

**Why.** Every V1 user receives a personalised live demo and has active tech support, so the
job is recall, not teaching. Pushed onboarding fires when the user has intent to act, shows
once, and is then gone — the worst possible property for a recall aid. Pull-based help is
available at every future moment of hesitation and needs no per-user state, which is why V1
adds no tables and no columns.

**Rejected.** First-view modals per key screen (they need seen-state infrastructure that costs
more than the onboarding it delivers at this user count); product tours and tooltip sequences
(completion collapses from ~72% at 3 steps to ~16% at 7); a single long canvas overview video
(linear, so it cannot convey the shape of a multi-step flow, and it is the wrong content 6/7
of the time). Also **dropped during implementation**: a planned empty-canvas overlay —
`createCanvasAction` seeds every canvas with a KB node plus a connected Script node, and that
node already carries a complete empty state, so the overlay would have been unreachable code.

### D104 — Help chapters are authored data with a map page, not derived from the pipeline definition *(recorded 2026-08-12; builds on D103; originated → `2026-08-12-onboarding-empty-states-and-help-chapters-design.md`)*

**Decision.** Chapters live in `src/lib/help/chapters.ts` as authored records (`slug`,
`question`, `summary`, `steps[]`, `mapStyle?`, `draft?`). **Every** chapter opens on a **map
page** — its description plus the whole journey as numbered blocks derived from
`steps[].title` — then steps through description-plus-clip pages. `mapStyle` selects whether
those blocks are drawn connected (`sequence`, the default) or unconnected (`alternatives`,
for chapters that are several routes to one outcome rather than an ordered flow).

**Why.** The map page is what makes multi-step explainable: video is linear, so a viewer sees
the current frame but never the shape; the map turns the sequence into a spatial object
grasped at a glance, after which each step is a lookup. It is mandatory even for 2-step
chapters — the viewer arrives having asked a question, and the intro is where that question
gets answered before the mechanics start; a uniform shape also means the surface never
behaves differently based on a length the user cannot see in advance. Deriving map captions
from step titles means a chapter's sequence is authored once and cannot drift.

**Rejected.** Indexing chapters off `GUIDED_CHAIN` in `src/lib/guided-flow.ts` — it is not
trusted as a dependency for user-facing content, and it structurally cannot cover client
creation, KB build and KB review, where the worst friction lives. Also rejected: a carousel
library (no swipe requirement, fully controlled content); GIFs for step clips (an order of
magnitude heavier than muted autoplay video for identical behaviour); and visible "coming
soon" menu entries for unrecorded chapters (`draft: true` hides them instead — promising
absent help is worse than silence when a human support channel is the fallback).
