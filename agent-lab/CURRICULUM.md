# CreativeOS Copilot — Build-to-Learn Curriculum

> ## 📍 RESUME HERE (session pointer)
>
> **Status:** Lesson 1 ✅ — `agent-lab/00-plain-call.ts` written + ran (real reply printed), and
> matched to the same `openai.chat.completions.create` call in the app at
> `src/app/api/nodes/[id]/parse/route.ts:34`. `agent-lab/02-one-tool.ts` is staged but not filled.
>
> **Scope pivot (1-day constraint):** chose **"copilot in the real app today."** We stopped going
> lesson-by-lesson in the sandbox and switched to **building a real copilot MVP in the app** (this
> worktree), learning primitives inline. Sandbox Lessons 2–6 are now optional reference.
>
> **Where the work lives:** git worktree `.claude/worktrees/minimal-agent`, branch
> `worktree-minimal-agent`. `.env.local` (with `OPENAI_API_KEY`) is copied in. Sandbox scripts run
> with `npx tsx --env-file=.env.local agent-lab/<file>`. To run the app: `npm install` (if
> `node_modules` is missing) then `npm run dev`.
>
> **MVP architecture (agreed) — the client owns mutations; the server just thinks:**
> - Chat panel (client) → POST `{ message, conversation, canvasSnapshot }` to a new route.
> - Route runs an OpenAI tool-calling loop; graph tools (`add_node`, `connect_nodes`) come back as
>   **proposals**, NOT executed server-side.
> - Panel shows the proposal → **user approves (HITL)** → client applies it via the existing store
>   methods → node appears live + autosave persists. No SSE, no new DB plumbing for v1.
>
> **Integration anchors (verified in code):**
> - Canvas page: `src/app/clients/[id]/canvases/[cid]/page.tsx`
> - Store: `useCanvasStore(selector)` / `useCanvasStoreApi()` from
>   `src/components/canvas/canvas-store-provider.tsx`. API in `src/lib/canvas-store.ts`:
>   `addNode(type, position, id?)`, `connectNodes(sourceId, targetId)`, plus `nodes` / `edges`.
> - Node types + connection rules: `src/lib/canvas-nodes.ts` (`AppNode`, `VALID_CONNECTIONS`).
> - Server OpenAI: `createOpenAI()` from `src/lib/openai/server.ts`.
> - Route helpers: `apiOk` / `apiError` from `src/lib/api/route-helpers.ts`; routes live under `src/app/api/…`.
>
> **Next steps (do these next):**
> 1. New route `src/app/api/canvas/agent/route.ts` — OpenAI tool-loop; graph tools return proposals.
> 2. Chat panel component (shadcn) + an approve/reject UI (the HITL gate).
> 3. Mount the panel in the canvas page; wire approve → the store methods above.
> 4. `npm run dev` → open a canvas → test: "what's on this canvas?" then "add a text node" → approve → watch it appear.
> 5. Stretch: `connect_nodes`, `generate_prompt`, token streaming, the expert-agent team.

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
