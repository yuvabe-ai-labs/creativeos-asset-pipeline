# CreativeOS Copilot — Conversation Memory (design spec)

> **Status:** approved design, implementation pending. Branch `worktree-minimal-agent`.
> Builds on the copilot as-built (`2026-07-09-creativeos-copilot-design.md`) and the create-script
> recipe (increment 1a: the `create_script_node` tool + `createScriptNode` recipe in the panel).

---

## 1. Problem

The copilot is **stateless per turn** — no conversation history is sent to the model; the only
grounding is the live canvas, rebuilt each turn. So a follow-up like **"yes"** (after the copilot
asked *"want me to parse it?"*) reaches the model with **no antecedent** and gets a generic reply
(*"How can I assist you today?"*). The chat cannot hold a conversation.

## 2. Approach (chosen)

**Send the whole chat window with each turn, and let the model drive.** Concretely, Approach **A**:
feed the full message history into the calls we already have.

- **Rejected — a client-side "pending action + detect *yes*" state machine.** Hand-coding intent
  inference (an affirmation matcher + a remembered pending step) is exactly the planning
  scaffolding to avoid. The **model** interprets the conversation, not client code.
- **Deferred — Approach B (collapse to one conversational call).** Cleaner mental model, but it
  drops the streaming reply and the node chips and is a bigger rewrite. Revisit later.

## 3. Design

### 3.1 History payload
The panel already holds `messages` (the window). On send, a pure `buildHistory(messages, text)`
produces a plain `[{ role, content }]` array (the window **plus** the new user message), stripping
UI-only fields (`nodes`, `proposal`) and dropping empty-content messages.

### 3.2 The existing calls, now with memory
- **Prose** `POST /api/copilot` — accepts the `messages` history; its completion becomes
  `system + canvas-grounding + …history`. The streamed reply is now **contextual**. (The chips
  call, `/api/copilot/references`, is unchanged.)
- **Actions** `POST /api/copilot/actions` — accepts the `messages` history, so the model
  understands *"yes"* in context and can call the right tool.

### 3.3 New tool — `parse_script`
Add `parse_script({ handle? })` to the actions route so *"yes"* / *"parse it"* has something to
call. The model names the target Script node by its **handle** (canvas grounding already exposes
handles), or leaves it empty. The route re-validates defensively, like `add_node` /
`create_script_node`.

### 3.4 The parse recipe (client)
On a `parse_script` action the panel runs a code-owned recipe:
1. **Resolve the target** — `handle → node`; else the lone (or most-recent) Script node on the canvas.
2. **Parse** — `POST /api/nodes/:id/parse { source }`, with **retry-on-404** (the just-created node
   may still be saving; this mirrors the Script focus view's own `runParse`).
3. **Inject** — `updateNodeData(id, { parsed: output })` so the node displays its shots.
4. **Report** — a chat message with the shot count.

No focus-view auto-open this round (it would cover the chat; opening it is a later concern tied to
"chat always on top").

### 3.5 Data flow of "yes"
```
"yes"
  → panel builds history (incl. "…want me to parse it?")
  → /api/copilot/actions (history) → model returns parse_script
  → panel runs the parse recipe → shots appear, chat confirms
  → streamed prose (also history-aware) provides the conversational voice
```

## 4. Scope / non-goals (YAGNI)
- **Whole window** sent each turn; add a cap only if tokens balloon.
- **In-session memory only** — not persisted across reload.
- **No** client-side pending-action / affirmation pattern.
- **Only `parse_script`** added this round (`fan_out`, generation, etc. are later increments).
- **Streaming + node chips preserved.**

## 5. Testing
- **Pure / TDD:** `buildHistory(messages, text)` (role mapping, drops empties + UI fields) and
  `resolveScriptTarget(nodes, handle?)` (handle match → node; else lone/most-recent Script node).
- **Integration (run to verify):** the parse recipe and the end-to-end
  *create → "yes" → parsed shots*.

## 6. Draft decision for the ADR log (assign a D-number on merge)
- **Copilot conversation memory — send the whole window; the model drives.** *Why:* a real
  conversational feel with zero client-side planning scaffolding; the model interprets follow-ups
  ("yes") from the history + canvas grounding. *Rejected:* a client-coded pending-action /
  affirmation state machine; collapsing to a single conversational call (deferred — would drop
  streaming + chips).
