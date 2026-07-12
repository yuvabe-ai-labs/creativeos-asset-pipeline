# CreativeOS Copilot — design spec (as-built)

> **Status:** partial build on branch `worktree-minimal-agent`. This spec captures **what has
> shipped so far** so it can be merged into the MVP PRD. Sections marked **Deferred** are named but
> not built. Decisions at the end are drafted for the ADR log (`§7`); assign real D-numbers on merge.
>
> **Origin:** built as a "learn-by-building" exercise (`agent-lab/CURRICULUM.md`), but the code is
> real, lives in `src/`, and is production-shaped. This spec is the product/engineering view, not the
> lesson log.

---

## 1. Summary

The **Copilot** is a canvas-side AI chat assistant. It **sees** the current canvas (nodes + edges),
**talks** about it in streaming prose, lets the human **reference specific nodes** by handle
(`@PRM-A3F9`), points back at nodes as **clickable chips**, and can **propose** a graph action
(add a node) via function calling — surfaced for review, **not yet executed**.

The guiding architecture: **the server thinks, the client acts, the human stays in control.** The
model never mutates the canvas directly; it returns *proposals* and *references*, and all graph
mutation stays client-side through the existing Zustand store.

---

## 2. Interaction model

A docked panel (top-right of the canvas, shadcn, `✨ Copilot` toggle). Within it:

| Surface | What the human does / sees |
|---|---|
| **Prose reply** | Types intent → a streamed, token-by-token answer grounded in the real canvas. "Copilot · AI" attribution; a "thinking…" state. |
| **Node chips** | Below a reply, chips for the nodes the answer referenced. Each shows the node's **handle + label**; clicking one **highlights** (selects) that node on the canvas. |
| **@-mention** | Typing `@` in the composer opens a picker of canvas nodes (handle + title/type, type-to-filter, ↑/↓/Enter/click). Selecting inserts an `@HANDLE` token. This is **human-directed grounding** — the human names exactly which nodes matter; the copilot never volunteers a picker. |
| **Proposed action** | When the human asks to add a node, the model *requests* it (`add_node`). Rendered as a read-only "Proposed action" card. **Nothing runs** — approval/execution is Deferred. |

---

## 3. Node identity — the ref handle

To reference a node in chat, a node needs a stable, human-visible name. A node now has **three
identities**:

| Identity | Example | Audience | Visible |
|---|---|---|---|
| `uuid` | `a3f9e1c2-…` | machines (storage, edges) | never |
| **`handle`** | `PRM-A3F9` | humans referring to it | **always** |
| `title` | "Coffee hero" | optional pretty name | when set |

- **`nodeHandle(node)`** = `${TYPE_ABBREV}-${uuid.slice(0,4).toUpperCase()}` — a pure function of the
  immutable uuid, so it is **stable** (never re-points), needs **zero storage**, and survives deletes
  / reorders. Abbreviations: `SCR, KB, FILE, TXT, PRM, SHOT, DRAW, IMG, VPR, VID`.
- **`nodeLabel(node)`** → `{ name, handle }` — friendly name (title, else type-derived) + handle.
- **`resolveMentions(text, nodes)`** → node ids — parses `@HANDLE` tokens back to ids (case-insensitive).
- Shown on the **card face of every node type** — a readable eyebrow tag in the **header, next to the
  type label** (via `NodeHandle`), standardized across all 10 node types — and on **copilot chips**, so
  chat and canvas share one vocabulary. *(Until 2026-07-12 it sat above the title via `NodeTitle` on
  only the 5 title-bearing types; now uniform — see §9.3.)*

**Why uuid-derived, not a sequence/counter:** stability beats prettiness for a chat reference — a
positional "Image 2" rots when nodes are added/deleted; a uuid-derived handle cannot. Handles matter
precisely because agent-created nodes often won't be titled.

---

## 4. Architecture

**Three stateless calls per turn**, orchestrated by the client. Each is independent so there is
**zero partial-JSON parsing** anywhere.

| Call | Route | Mode | Returns |
|---|---|---|---|
| **1 — prose** | `POST /api/copilot` | `stream: true` | a `ReadableStream` of token deltas (plain text) |
| **2 — references** | `POST /api/copilot/references` | `response_format: json_schema` (strict) | `{ referencedNodes: [{id,label,type}] }` → chips |
| **3 — actions** | `POST /api/copilot/actions` | `tools` + `tool_choice:"auto"` | `{ action: { name:"add_node", args:{type,title?} } \| null }` |

**Grounding — one shared builder.** `buildCopilotContext(canvasId, mentionedIds)` (in
`src/lib/copilot/context.ts`) renders the canvas for all three calls: every node as
`- HANDLE (type): label [id …]`, the edge count, and — when the human `@`-referenced nodes — a
"focus on these" section spotlighting them. The bracketed `[id …]` is internal (never shown to the
user); the handle is the human-facing name.

**Data flow of an @-reference:** panel writes `@PRM-A3F9` (from `nodeHandle`) → on send,
`resolveMentions` → `mentionedIds` → sent with calls 1 & 3 → `buildCopilotContext` spotlights those
nodes. Encode and decode use the *same* pure `nodeHandle`, so they cannot disagree.

**Boundaries:**
- **Client owns all graph mutation.** The server only ever returns proposals/references. This is the
  security boundary: a confused model can propose, never mutate.
- **Stateless per turn.** No conversation history is sent to the model; the only grounding is the
  live canvas (rebuilt each turn). Conversation memory is Deferred.
- **No SSE / no realtime for v1.**

### File map

| File | Role |
|---|---|
| `src/components/canvas/copilot-panel.tsx` | The panel: chat, streaming, chips, @-mention picker, proposal card. |
| `src/app/api/copilot/route.ts` | Call 1 — streaming prose. |
| `src/app/api/copilot/references/route.ts` | Call 2 — structured node references. |
| `src/app/api/copilot/actions/route.ts` | Call 3 — `add_node` function-calling proposal. |
| `src/lib/copilot/context.ts` | `buildCopilotContext` — shared grounding for all three calls. |
| `src/lib/nodes/describe-node.ts` | `describeNode`, `nodeHandle`, `nodeLabel`, `resolveMentions`. |
| `src/components/nodes/node-handle.tsx` | The on-card handle tag. |
| `src/lib/nodes/describe-node.test.ts` | Unit tests for handles + mention resolution (10). |

> **Update (2026-07-12):** `copilot-panel.tsx` has since been **split** (shell / hook / composer /
> message) and the actions route grew from `add_node`-only into a **tool router** (`create_script_node`,
> `parse_script`, `open_node`, `add_node`). See **§9** for the current file map + tool set.

---

## 5. Deferred (named, not built)

- **Execute-on-approve (HITL gate).** The `add_node` proposal is shown but not applied. A gate
  (approve / edit / reject → `store.addNode`) is the next step. (Approve/reject scaffolding exists in
  `copilot-panel.tsx` but is currently unused.)
- **The agent loop (agency) + conversation memory.** The model pursuing a goal across multiple tool
  calls, remembering the exchange.
- **Write tools beyond add:** `connect_nodes` (respecting `VALID_CONNECTIONS`), and generation tools
  wrapping the existing run routes with `operator: 'agent'` provenance.
- **Multi-agent (expert team):** orchestrator + specialists (Art Director, Brand Guardian, Critic).
- **@-mention polish:** render inserted tokens as pills; highlight referenced nodes on the canvas.

## 6. Known limitations

- **Chips are LLM-chosen → non-deterministic** (call 2 asks the model to enumerate; enumeration is
  unreliable). Candidate fix: pick chips in code from resolved `@`-mentions.
- **Handle display collisions are possible but harmless** — the visible short form uses 4 hex chars;
  actual references always use the full uuid.
- **No memory** — each turn is independent; "make it blue" after "add a prompt" has no antecedent.

---

## 7. Draft decisions for the ADR log (assign D-numbers on merge)

- **Copilot architecture — server thinks, client acts, human gates.** The model returns proposals and
  references only; all graph mutation is client-side via the store. *Why:* keeps the security/undo
  boundary in the client and avoids server-side canvas writes. *Rejected:* server-applied mutations;
  a single mega-call returning prose+refs+actions (would force partial-JSON streaming).
- **Three stateless calls, not one.** Prose (stream), references (json_schema), actions (tools) are
  separate. *Why:* zero partial-JSON parsing; each call has one job. *Rejected:* AI-SDK unified
  streaming with tool-calls interleaved.
- **Node ref handle (uuid-derived).** Every node gets a stable, visible `TYPE-XXXX` handle derived
  from its uuid. *Why:* referenceable identity with zero storage, permanently stable. *Rejected:*
  positional numbering (rots on add/delete); persisted issue-number counter (storage + concurrency).
- **@-mention = human-directed grounding.** The human references nodes with `@handle`; the copilot
  does not present candidate pickers. *Why:* removes LLM guessing/enumeration; human owns relevance.
  *Rejected:* model-asks-clarifying-questions candidate-picker flow.

---

## 8. Design direction — from copilot to an agentic run *(brainstormed 2026-07-11; forward-looking, not built)*

> Capture of a brainstorming session on making CreativeOS **agentic** rather than merely automating
> the manual click-path. Everything here is **direction**, not as-built. **Current build scope: one
> single-shot lane first — parallelism is deferred (§8.5).** Draft decisions (§8.7) are staged for the
> ADR log; assign D-numbers on merge.

### 8.1 Workflow vs. agent — the distinction that governs everything

Grounding: Anthropic's *Building Effective Agents*.
- A **workflow** orchestrates LLM calls through **predefined code paths** — *you* decide the sequence.
- An **agent** **directs its own process in a loop, using feedback from the environment** to decide the
  next step.

The test: **can you draw the flowchart before you run it?** Yes → workflow (build it as deterministic
code). Branches depend on *observing results at runtime* → agent. Everything today — the three
stateless calls, the `add_node` proposal, fan-out (D21), guided next-node (D36) — is a **workflow**,
and that is correct. Agentic complexity is justified *only* where the step sequence is genuinely
unpredictable.

A three-rung ladder for "control the canvas with language":
- **Rung 0 — deterministic workflow.** D36 "Create next": the steps are hardcoded.
- **Rung 1 — language → tool calls, one planned burst.** "Add a File node and wire it to `PRM-A3F9`."
  The model picks tools + args (real judgment) but resolves the request up front without reacting to a
  result. Anthropic's *augmented LLM* — the building block of an agent shown in a single turn. Faster,
  more natural; **not yet a loop.**
- **Rung 2 — agent loop.** "Get this shot to a good image." The model acts, **observes the result**,
  and re-decides until a goal/gate.

Key: **deciding is intelligence; deciding *again because of what happened* is agency.** Rungs 1 and 2
share every primitive — rung 2 is rung 1 wrapped in a loop with observation.

### 8.2 The primitives to build first

1. **Verbs — a few consolidated tools** (per *Writing Tools for Agents*), not one-per-store-action.
   Candidates from the PRD: `read_node`, `update_prompt`, `generate`, `edit_image` (D27 already built
   the execution path), `connect` (validated by `VALID_CONNECTIONS`). The `TYPE-XXXX` handle (§3) is
   already the "semantic id, not UUID" the article recommends — **done.**
2. **Eyes — observation of consequences.** The biggest missing primitive. After the client executes a
   tool, the *result* (generated image vision-read, error, approval state) must return to the model's
   context. Today's proposal ends the turn; an agent's action *continues* it. "Server thinks, client
   acts, human gates" (§7) survives intact — the client still executes and reports back, so the model
   never mutates directly.
3. **The loop** — architecture, not a tool: `model → tool call → client executes → observation back →
   repeat`.
4. **The gate — stop conditions.** A budget (max N attempts — real money per iteration), a
   self-judgment rubric (from the shot's visual description + KB compliance, already assembled by
   `buildCopilotContext`), and the human approval flag (D29) as terminal state. "Mark, don't block" is
   the philosophy.

Cross-cutting (per *Effective Context Engineering*): feed the model the **compact canvas index**
(handles + one-liners) and let it pull detail via `read_node` **just-in-time**, rather than pre-loading
the whole canvas each call.

### 8.3 The shape — a workflow with one agentic cell

The end-to-end run a designer wants — *script → shots → per-shot options → pick → refs → image prompt →
controls → image* — is a **workflow**. Building it as an autonomous agent would be **overkill and
slower** (agents trade latency/cost for unpredictability this flow doesn't have). Its speed comes from
**parallelism** (many shots at once — orchestrator-workers), a **language entry point** (one sentence
replaces the click-path), and **model-filled control defaults** (§11.5/§12: defaults from shot type +
Brand KB, operator-overridable) — all *workflow* techniques, not agency.

Genuine agency is reserved for the **one step that resists the flowchart**: *"is this generated image
good enough, and if not, repair it?"* — the number of attempts, and whether the fix is an edit (D27)
vs. a re-prompt, depends on *looking at the image*. That is the agent loop (evaluator-optimizer); it
lives **inside a single shot's worker**, budget-capped, added **after** the workflow exists and only if
one-shot images miss often enough to justify it. All attempts stay captured (D22) and stamped
`operator: 'agent'`.

Mature architecture = **deterministic scaffold + one agentic cell**, built and measured separately.

### 8.4 Build sequencing — **one lane first (current scope)**

Build a **single shot's lane** end-to-end before any parallelism:

```
script → one shot → its options (D28) → pick one → attach a reference (manual File-node wire; auto later)
       → image prompt (with control defaults, §12) → image
```

Prove this one lane as a **rung-1, language-driven workflow** (the copilot as the *command bar / driver*
that fires the existing nodes, not a container you type work into). Only then fan out to N shots.
**Why this order:** the parallel version is this exact lane repeated per row, so nothing built now is
thrown away.

### 8.5 Parallel-run interaction model — *agreed direction, DEFERRED*

When we do parallelize (later, not now), the decided layout is **the canvas is the parallel view
(option C)**: fan-out (D21) already lays N **rows** of nodes — **rows = shots, columns = stages**
(Shot · Options · Prompt · Image). All shots visible at once; the run moves a **spotlight** across
columns; a completed stage **collapses to its compact launcher** (the existing compact-launcher ↔
focus-view pattern the Script node uses). The copilot is the **driver + narrator**, not a container.
Two human gates map onto two columns where the run pauses (**pick options** → **review images**).

*Rejected:* per-shot **tabs** (parallel in name only; hides other shots) and a floating **run-board
panel** (rebuilds the canvas inside a panel that must be kept in sync) — both are panels that duplicate
the canvas.

### 8.6 Open questions
- **Gate cadence (decide when parallelizing):** advance **column-by-column** (a barrier — all shots
  clear a gate before any advances; simpler to look at) or **per-shot pipeline** (each shot flows at its
  own pace; faster but mixes decision types on screen)? Leaning column-sync (matches the two-gate model).
- Whether **reference attachment** is its own gate (manual File-node wiring first; auto-ref later) or
  folds into the options gate.
- The rung-2 image loop's **budget + rubric source** — deferred until the workflow ships.

### 8.7 Draft decisions (stage into the ADR log on acceptance)

- **CreativeOS is a workflow with one agentic cell, not an autonomous agent.** The script→shots→image
  run is a deterministic (later parallel) workflow; agency — an observe-decide loop — is reserved for the
  per-shot "image good-enough" iteration. *Why:* the flow's steps are knowable, so an agent adds
  latency/cost without benefit; a loop earns its cost only where outcomes are unpredictable. *Rejected:*
  an autonomous agent that plans the whole run.
- **Build one single-shot lane first; parallelize after it works.** *Why:* the parallel run is the same
  lane repeated per row — proving one lane de-risks the whole thing and wastes nothing. *Rejected:*
  building the multi-shot orchestrator up front.
- **The copilot's role is the run's command bar + driver + narrator, not a work container.** Language
  drives the existing nodes; the canvas holds the work. *Refines:* §2's docked-panel model toward a
  driver of graph actions (rung 1).
- **Speed comes from parallelism + a language entry point + model-filled control defaults — workflow
  techniques — not from agency.** *Why:* names the real levers, so agency isn't mistaken for a speed tool.
- *(Deferred — §8.5)* **Parallel runs are visualized on the canvas matrix (rows = shots, columns =
  stages), not in tabs or a panel.** *Rejected:* per-shot tabs; a floating run-board panel.

---

## 9. As-built delta — the single-lane build *(2026-07-12)*

> What has shipped toward the §8.4 lane. Where this conflicts with §1–4 (e.g. "only `add_node`", the
> single `copilot-panel.tsx` file), **this section is current.**

### 9.1 The copilot action router

`POST /api/copilot/actions` is now a **tool router**, not a single-tool call. The `CopilotAction`
union + its client recipes (in `use-copilot-chat.ts`):

| Tool | Execution | Recipe |
|---|---|---|
| `create_script_node` | **instant** | client recipe: `addNode` + seed source + pan/focus |
| `parse_script` | **instant** | parse route → store `parsed` → **auto fan-out shots** (D21) + wire edges (§9.2) |
| `open_node` | **instant** | resolve handle → **pan to it** (the tray's glide) → `setFocusedNodeId(id)` opens the node's surface (Shot → Composer; others → focus view) |
| `add_node` | **proposal only** | read-only "Proposed action" card — the kept HITL seam |

**Blast-radius rule (from §8):** cheap / reversible / structural ops run **instantly** via client
recipes; only real-cost, irreversible ops (generation) get the HITL gate. `open_node` is the copilot's
first **drive-the-UI** verb — general across *every* node type because it reuses the store's existing
`setFocusedNodeId` focus-signal (the Generation Tray + guided-flow already drove it).

### 9.2 `parse_script` auto-fans-out

Parsing now **drops the shots onto the canvas** as Shot nodes wired from the script (`fanOutShots`),
not just storing `parsed` on the script node. The recipe writes `parsed`, then calls the same store
method the manual "Fan out" button uses — Zustand's `set` is synchronous, so the reader sees the fresh
write in the same tick. This is the first built step of the §8.4 lane.

### 9.3 Ref handle on every node, standardized

The handle (§3) now shows on **all 10 node types**, in the **header next to the type label** (via
`NodeHandle`, readable weight/tone) — so any node is referenceable at a glance and what you *see* is
byte-identical to what you *type* (`@SHOT-1A2B`). The shot node also joined the shared `focusedNodeId`
pattern, so the tray/guided-flow/copilot can all open it.

### 9.4 `copilot-panel.tsx` split (supersedes the §4 file map)

| File | Role |
|---|---|
| `copilot-panel.tsx` | Shell — open/close, layout, scroll-to-bottom. |
| `use-copilot-chat.ts` | The **brain** — messages/thinking state, `send()`, and the write recipes. |
| `copilot-composer.tsx` | Composer — textarea, @-mention picker, attach, send. |
| `copilot-message.tsx` | One message — bubble, node chips, proposal card. |

Native `<button>`s → shadcn `<Button>`; behavior preserved (tsc + 447 tests green).

### 9.5 Draft decisions (stage into the ADR log)

- **Gate copilot writes by blast radius.** Structural/cheap ops (`create_script_node`, `parse_script`,
  `open_node`) execute **instantly** via client recipes; only generation gets the HITL gate. *Why:*
  friction only where it earns its keep. *Rejected:* gating every mutation.
- **`open_node` is one general verb, not per-type openers.** It drives the shared `setFocusedNodeId`
  signal; each node owns which surface opens. *Why:* keeps the `create → open → act` grammar general.
  *Rejected:* `open_shot_composer` + one opener per node type.
- **`parse_script` auto-fans-out.** Parsing produces the Shot nodes directly. *Why:* the fan-out is the
  next lane step and the engine (`fanOutShots`) already existed. *Rejected:* leaving fan-out a separate
  manual click.
- **The ref handle shows on every node, in the header.** *Why:* uniform, discoverable, and identical to
  the reference the copilot/@-mention resolve. *Rejected:* handle on only the title-bearing nodes;
  above-the-title placement (inconsistent across types).
