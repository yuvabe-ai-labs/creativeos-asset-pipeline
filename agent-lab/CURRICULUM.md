# CreativeOS Copilot — Build-to-Learn Curriculum

> ## 📍 RESUME HERE (session pointer)
>
> ## 🟢 SESSION UPDATE — 2026-07-12 (READ THIS FIRST; supersedes the 07-11 note below)
>
> **State reconciled against git + `docs/superpowers/specs/2026-07-14-creativeos-copilot-design.md`
> §9 "As-built delta" — which is now the true current state.** Worktree `worktree-minimal-agent` is
> **clean** at `fe70994` (only an untracked `one script.md` test artifact).
>
> **The 07-11 "OPEN/OWED" list is DONE** — four commits landed after that note was written:
> - ✅ `141dbdc` — the untracked foundation (`src/lib/copilot/context.ts`, `node-handle.tsx`,
>   `describe-node`) is **committed**; a clean checkout no longer breaks. (was OWED #1)
> - ✅ `1333c7b` — `copilot-panel.tsx` **split** (shell / `use-copilot-chat.ts` / composer / message)
>   and the actions route became a **4-tool router**: `create_script_node`, `parse_script`,
>   `open_node`, `add_node` (verified in `src/app/api/copilot/actions/route.ts`).
> - ✅ `141dbdc` — the ref **handle shows on all 10 node types**, in the header next to the type label.
> - ✅ `8922852` / `fe70994` — design spec §9 + package-lock sync.
>
> **The lane so far (§8.4 single-shot lane):**
> `script node → parse_script (auto-fans-out Shot nodes, D21 + wires edges) → open_node opens a Shot's
> Composer`. Blast-radius gating holds: cheap/reversible ops run instantly; the HITL gate is **owed at
> generation** (still the kept seam — `add_node`'s dead proposal card).
>
> **⚠️ STILL OPEN / OWED (unchanged from 07-11, re-verified):**
> 1. **Runtime verification pending.** The 07-12 commits (router, panel split, `parse_script`
>    auto-fan-out, `open_node`) are static-clean (447 tests, tsc, lint per §9.4) but **not yet driven
>    in the browser.**
> 2. **Router-prompt cleanup (NOT applied).** Actions system prompt is still script-heavy; make it a
>    GENERIC tool-router, move script specifics into the tool DESCRIPTIONS.
> 3. **The real L6 — HITL approve/edit/reject gate — is owed at the GENERATION step**, not on cheap ops.
>
> **Next lane increment (undecided — user to pick when we build):** the **"options" step — D28
> "Compose variations"** (Shot seed → 4 role-aware divergent ideas). The Shot **Composer surface
> already exists** (`open_node` opens it), so the copilot-side work is a tool that *drives* compose,
> not a from-scratch feature. **Build mode chosen for next build: "I write it, you focus on the
> interaction."** Per locked rules, run brainstorm→design→plan (superpowers) BEFORE any feature code.
>
> ---
>
> ## 🔵 SESSION UPDATE — 2026-07-11 (superseded by the 07-12 note above; kept for history)
>
> **Direction chosen (option A): product-first around the script → shot pipeline**, not
> primitive-first. We build the real copilot feature by feature; each primitive is learned as it's
> needed. The lesson shape (teach → implement → UX) still holds, but the driver is the product.
>
> **HITL decision — gate by BLAST RADIUS:** cheap, reversible, structural ops (create a node,
> parse, add, wire) **execute INSTANTLY — no approve gate.** The HITL **approve / edit / reject**
> gate (curriculum L6) is **DEFERRED to the GENERATION step** (real cost + irreversibility), where
> it earns its keep. So L6 is intentionally NOT built on cheap ops — **it is owed at generation**
> (that's the real L6 to build later). The dead `approveProposal`/`rejectProposal` in
> `copilot-panel.tsx` is the KEPT seam for that gate.
>
> **Shipped this session (committed on `worktree-minimal-agent`, newest first):**
> - `415b0d0` fix — create confirmation carries the node **handle** so `parse_script` targets the
>   RIGHT node; actions prompt steers short/misspelled "yes" ("reyes") → parse, not create.
> - `682db97` **upload a `.md`/`.txt` script** into the composer (📎) → `createScriptNode`.
> - `9a3bb0e` **conversation memory** — the whole chat window is sent to the prose AND actions
>   calls, so the model interprets "yes" itself (NO client pending-action/affirmation pattern); +
>   the client `parseScript` recipe.
> - `ef34e8c` actions route accepts history + the `parse_script` tool.
> - `1e31cac` prose route accepts history.
> - `19272b7` `parse_script` type + pure helpers (`buildHistory`, `resolveScriptTarget`).
> - `ca77b82` + `3299251` — the conversation-memory **design spec + implementation plan** under
>   `docs/superpowers/{specs,plans}/2026-07-11-*`.
> - The **`create_script_node` "atom"** (instant client recipe: `addNode` + set `source` + focus)
>   is folded into the commits above.
>
> **New architecture (the copilot's spine now):**
> - `src/lib/copilot/actions.ts` — `CopilotAction` union (`add_node | create_script_node |
>   parse_script`) + PURE, unit-tested helpers `placeNewNode`, `buildHistory`, `resolveScriptTarget`,
>   `fileNameToTitle`, `scriptCreatedMessage` (`actions.test.ts`, **10 green**).
> - `src/app/api/copilot/actions/route.ts` — message HISTORY + 3 tools (a router).
> - `src/app/api/copilot/route.ts` — prose route takes the message HISTORY (memory).
> - `src/components/canvas/copilot-panel.tsx` — `createScriptNode` + `parseScript` recipes, the 📎
>   upload, sends history to both calls.
>
> **⚠️ OPEN / OWED — pick up here next session:**
> 1. **UNCOMMITTED foundation the committed work DEPENDS ON.** `src/lib/copilot/context.ts`
>    (`buildCopilotContext`, imported by all 3 copilot routes), `src/components/nodes/node-handle.tsx`,
>    `src/lib/nodes/describe-node.ts(.test)`, `src/lib/copilot/context.ts`, and the on-card handle
>    changes across node components are **still untracked/modified in the working tree.** COMMIT
>    THESE FIRST — the committed routes import `context.ts`, so a clean checkout breaks without it.
> 2. **Router-prompt cleanup (NOT applied).** The actions system prompt is script-heavy; make it a
>    GENERIC tool-router and move script specifics into the tool DESCRIPTIONS. (Reviewed, proposed,
>    not committed.)
> 3. **Runtime verification pending.** "attach → yes → parsed shots" and the handle/typo fixes are
>    static-clean (10 tests, tsc, lint) but were **not yet run in the browser.**
> 4. **The real L6 — the HITL approve/edit/reject gate — is owed at the GENERATION step** (above).
>
> **Next product steps (shot journey):** fan out shots → compose ideas (D28) → image prompt →
> Image Gen — with the **HITL gate landing at the generate step.**
>
> ---
>
> **Approach (locked):** build the copilot **in the real app**, incrementally. Every lesson runs
> in this order → **① teach the engineering concept → ② implement it (I write the code and
> explain it — user's preference) → ③ then a UX pass** (Shape of AI patterns —
> https://www.shapeof.ai). The console lessons in `agent-lab/` are optional reference; the real
> work is in `src/`.
>
> **Where the work lives:** git worktree `.claude/worktrees/minimal-agent`, branch
> `worktree-minimal-agent`. `.env.local` (OPENAI_API_KEY + Supabase) is copied in. Run the app:
> `npm install` (if `node_modules` missing) then `npm run dev` → Next 16 on
> http://localhost:3000 → open a client → a canvas → click **✨ Copilot** (top-right).
>
> **The copilot files (the MVP so far):**
> - `src/app/api/copilot/route.ts` — CALL 1: streams the prose reply (plain text).
> - `src/app/api/copilot/references/route.ts` — CALL 2: structured JSON → the node chips.
> - `src/app/api/copilot/actions/route.ts` — CALL 3 (L5): function calling. Offers the
>   `add_node` tool (`tool_choice:"auto"`); returns the model's *requested* action or null.
> - `src/lib/nodes/describe-node.ts` — per-node-type label helper (grounding's "representation layer").
> - `src/components/canvas/copilot-panel.tsx` — the chat panel, docked in the canvas (shadcn).
> - Mounted in `src/components/canvas/canvas.tsx` (next to `<GenerationTray>`, inside the store provider).
>
> **Progress (all committed):**
> - ✅ **L1 — plain call.** Panel chats via `/api/copilot`. Concept: one `chat.completions.create`
>   + the `system` role. UX: prompt entry, thinking state, "Copilot · AI" notice.
> - ✅ **L2 — grounding.** Reads the real canvas (`listNodes`/`listEdges`), describes it via
>   `describeNode` (per-type "representation layer" so untitled nodes still get labels), injects it
>   into `messages`. Ids kept internal (system prompt), not shown to the user.
> - ✅ **L3 — streaming.** Route returns a `ReadableStream` of token deltas (`stream: true`); the
>   panel reads `res.body` and appends live (the typing effect).
> - ✅ **L4 — structured output → node chips (two-call approach; no AI SDK, raw `openai`).**
>   CALL 1 streams the prose (plain text). CALL 2 (`/api/copilot/references`, strict
>   `response_format: json_schema`) returns `{ referencedNodes: [{id,label,type}] }` → rendered as
>   clickable chips that highlight the node on the canvas (`storeApi.getState().onNodesChange`
>   select). Chose two-call because it needs ZERO partial-JSON parsing.
>   ⚠️ KNOWN LIMITATION (open, discussed): the chips are **LLM-chosen → non-deterministic** (some
>   nodes missing / vary per run; LLMs are bad at exhaustive enumeration). **Next improvement:
>   make chips deterministic in code** — the principle "LLM writes the prose (judgment), code picks
>   the chips (fact)". Also: `describeNode` gives identical labels to untitled same-type nodes.
> - ✅ **L5 — tools / function calling (the model *requests* an action).** CALL 3
>   (`/api/copilot/actions`) offers ONE tool `add_node({type,title?})` with `tool_choice:"auto"`.
>   The model returns `tool_calls` (NOT content) only when the user asks to add a node; we parse the
>   JSON-string args, re-validate the `type` enum server-side, and return `{action}` or `{action:null}`.
>   The panel renders it as a **read-only "Proposed action" card** (dashed primary chip). Nothing
>   executes — the request→execute gap is intentional, it's where HITL lives. Concept nailed: a tool
>   is CALL 2's structured-output machinery with the initiative flipped (model chooses the shape).
>
> **Arc after L5:** **⚑ L6 — HITL** (approve / edit / reject — the user's priority): add the gate +
> buttons to the L5 proposal card, and on approve, EXECUTE via the store (`addNode(type, position)`,
> then `updateNodeData` for the title) so the node appears live. Then → the loop → expert team.
>
> - ✅ **Refs (node identity layer).** `nodeHandle(node)` / `nodeLabel(node)` in `describe-node.ts`
>   give every node a stable, uuid-derived, human-visible handle (`PRM-A3F9`) — a THIRD identity
>   beside uuid + optional title, so untitled twins are distinguishable and you can "speak to the
>   canvas in terms of which node." Shown on card faces via `NodeTitle` (new `node-handle.tsx`,
>   5 title-bearing nodes) and on copilot chips, so chat + canvas share one vocabulary. TDD:
>   `describe-node.test.ts` (7 green). Load-bearing for the questions-based HITL loop (candidate picking).
>   PARKED as feature-drift (do NOT build unless a lesson needs it): @-mention typeahead, chip
>   scaling, per-node prerequisite registries. See memory `feedback-concepts-not-features`.
>
> - ✅ **@-mention = human-directed grounding (the chosen paradigm).** The HUMAN references nodes;
>   the copilot never volunteers candidate pickers (user: "options are never presented — I always
>   select the references"). Two increments, both shipped:
>   - *Increment 1 (input UX):* typing `@` in the composer opens a picker of canvas nodes
>     (handle + title/type, filterable, ↑/↓/Enter/click) that inserts an `@PRM-A3F9` token.
>     Built on the refs layer — the list is just `nodeLabel` per node. In `copilot-panel.tsx`.
>   - *Increment 2 (the grounding payoff):* on send, `resolveMentions(text, nodes)` parses the
>     `@HANDLE` tokens → node ids → sent as `mentionedIds`. New shared `src/lib/copilot/context.ts`
>     (`buildCopilotContext`) now grounds ALL three calls (prose/references/actions), includes each
>     node's handle, and spotlights the @-referenced nodes ("focus on them"). Prose system prompt
>     updated to speak handles. TDD: `resolveMentions` covered (10 green total).
>   Title used when present (search + label), handle always (agent-made nodes won't be named).
>
> **Superseded:** the model-asks-questions candidate-picker HITL loop is DROPPED — @-mention is the
> paradigm (human drives). Approve/reject scaffolding in `copilot-panel.tsx` is now dead code.
>
> **Candidate next concepts (undecided — ask the user):**
> - *@-mention polish:* render inserted `@HANDLE` tokens as pills; highlight referenced nodes on
>   the canvas when hovering the message. (Feature-y — only if the user wants it.)
> - *The loop / agency (L7):* the model works a goal across multiple tool calls (add_node +
>   connect_nodes), needing conversation MEMORY. This is the real remaining PRIMITIVE.
> - *Write tools + execute:* wire `add_node` / `connect_nodes` so the copilot actually builds the
>   graph (the L5 proposal → real mutation), now grounded by @-references.
>
> **Open polish (deferred, not blocking):** make the L4 chips deterministic in code.
>
> **Store methods for L5 (applying approved actions, client-side):** `useCanvasStore` /
> `useCanvasStoreApi` from `src/components/canvas/canvas-store-provider.tsx`;
> `addNode(type, position, id?)`, `connectNodes(sourceId, targetId)`, plus `nodes` / `edges`.
> Node types + rules: `src/lib/canvas-nodes.ts` (`AppNode`, `VALID_CONNECTIONS`).
>
> **MVP architecture (still holds):** client owns graph mutations; the server just thinks — the
> LLM returns graph ops as **proposals**, the user approves (HITL), the client applies them via the
> store methods above. No SSE for v1.

**The destination:** a chat copilot beside your canvas where you describe intent and a team of
expert agents **build, wire, and generate nodes live** — while you stay in control. You learn
every AI primitive by *building that copilot one capability at a time*, always through two
lenses: the **interaction** it creates and the **engineering** that drives it.

**How each lesson works:** Concept → the interaction it unlocks → you build a small piece →
run & see it. Per lesson you pick the mode:
- **Type it** (from blanks/hints),
- **I walk it** line-by-line (you fill + run), or
- **I write it, you focus on the interaction** (totally legit for a design engineer).

**Where we work:** Module 0 in this isolated sandbox (fast, no app overhead). Modules 1+
graduate into the real CreativeOS app, still on an isolated branch.

**The reframe that makes this easy:** rungs 1–2 you already shipped (the **Prompt node** and
**Script node**). The whole "copilot" is just rungs 3–5. You're extending, not rewriting.

---

## Module 0 — The material (sandbox) · learn the primitives bare

> **⚑ Human-in-the-loop (HITL) is pulled early — Lesson 3** — the moment there's an action to
> gate. It's the key driver of the AI experience, so you meet it first and it recurs/deepens in
> every later module (see the ⚑ marks).

| # | Lesson | Primitive | Maps to the interaction | You build |
|---|---|---|---|---|
| 1 | Plain call | text → text | a "✨ Generate" button | `00-plain-call.ts` — one call, print reply |
| 2 | One tool | function calling | AI can *request* an action | declare `add`; see the model *request* it (don't run it) |
| 3 ⚑ | **Human-in-the-loop** | **the gate in the request→execute gap** | **approve / edit / reject before it acts** | pause on the request → approve runs it, edit changes the args, reject skips |
| 4 | The loop | agency | goal in, steps out | `while` loop + 2 tools, with the gate living inside it |
| 5 | Structured output | text → typed data | AI fills a form / fields | parse a sentence into a typed object |
| 6 | Streaming | show-work | "the AI is thinking… / about to do X" | stream tokens + the proposed action |

*Done when:* you can explain how a goal becomes a sequence of tool calls — and point to the
exact line where the human approves, edits, or rejects each one.

### The HITL levers (you tune these all the way through)
1. **Trigger** — which actions pause (reversibility × cost × blast radius).
2. **The proposal** — what the human sees before it acts → CreativeOS already has this: `compile_preview`.
3. **The decision** — approve / reject / **edit** / always-allow.
4. **Granularity** — per-action vs per-plan vs checkpoints.
5. **Trust over time** — friction fades as autonomy is earned.

### Where the human touches the loop
**Before** — approve/edit/reject (a gate) · **During** — interrupt/steer · **After** — undo/restore
(`restore_version` gives you this free). Later modules build all three: ⚑ L3 (before, bare) →
⚑ L11 (before, in-app propose→approve) → ⚑ L15 (Brand Guardian gate) → ⚑ L16 (during + after).

## Module 1 — The copilot skeleton (app) · it can see and talk

| # | Lesson | Concept | Interaction | You build |
|---|---|---|---|---|
| 6 | The chat panel | UI surface | *where does the copilot live?* | a shadcn side panel (your turf) |
| 7 | Wire to a streaming route | rung 1, in-app | type intent → streamed reply | an SSE route + the panel consuming it |
| 8 | Read tools | rung 3, read-only (safe) | "ask the copilot about my canvas" | `read_canvas` / `read_kb` — it *sees* your graph |

*Done when:* you ask "what's on this canvas?" and it answers from real data. No mutations yet — zero risk.

## Module 2 — The copilot acts (app) · it builds the graph

| # | Lesson | Concept | Interaction | You build |
|---|---|---|---|---|
| 9 | `add_node` | first *write* tool + live update | watch a node appear as it "speaks" | server tool + SSE graph-op → your Zustand store |
| 10 | `connect_nodes` | validation + graph rules | the graph wires itself | shared validation, applied live |
| 11 | Propose → approve | **HITL — the core agentic UX** | it shows a plan; *you* approve before it acts | the approval gate over the stream |

*Done when:* "add a prompt node wired to shot 2" builds it in front of you — after you click approve.

## Module 3 — The copilot does real work (app) · generation

| # | Lesson | Concept | Interaction | You build |
|---|---|---|---|---|
| 12 | `generate_prompt` / `generate_image` | wrap existing routes + `operator` | copilot does creative work; history shows "by AI" | tools around your runAction routes; thread `operator:'agent'` |
| 13 | Goal → done | rung 4, end-to-end | "make an image for shot 2" → plans → builds → generates | the full loop across real tools |

*Done when:* one sentence produces an approved image, every step in your version log.

## Module 4 — The expert team (app) · multi-agent

| # | Lesson | Concept | Interaction | You build |
|---|---|---|---|---|
| 14 | Specialists | orchestrator + subagents | a *panel of experts* (Art Director, Cinematographer…) | route to your existing prompt templates as "experts" |
| 15 | Guardian + Critic | compliance gate + eval loop | quality & brand safety built into the flow | Brand Guardian gate before spend; Critic labels attempts |

*Done when:* the copilot delegates to the right specialist and refuses off-brand output — visibly.

## Module 5 — The interaction finish (app) · make it feel right

| # | Lesson | Concept | Interaction | You build |
|---|---|---|---|---|
| 16 | Show-work, undo, states | streaming tool-calls + `restore_version` | see it think; undo anything; graceful states | the polish that makes an agent trustworthy |

*Done when:* it feels like a product, not a demo — and a wrong move is one click to undo.

---

### The through-line
Each lesson adds **one primitive** *and* **one real copilot capability**, so you never learn a
concept in the abstract — you learn it because your copilot just needed it. By Module 5 you've
built the whole thing *and* understand every piece.

**Next:** Lesson 1 (`00-plain-call.ts`) is staged.
