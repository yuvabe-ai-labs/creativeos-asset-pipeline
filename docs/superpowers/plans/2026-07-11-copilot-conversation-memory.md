# Copilot Conversation Memory — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the copilot conversation memory by sending the whole chat window to the model each turn, so follow-ups like "yes" are understood and act (e.g. parse the script node just created).

**Architecture:** Approach A from the spec — feed the full message history into the existing prose (`/api/copilot`) and tool (`/api/copilot/actions`) calls; add one tool, `parse_script`, and a client recipe that runs it. No client-side "pending action / detect-yes" pattern — the model interprets the conversation.

**Tech Stack:** Next.js (App Router) route handlers, `openai` SDK (`gpt-4o-mini`), Zustand canvas store, React Flow, Vitest.

## Global Constraints
- API routes use `apiError` / `apiOk` from `@/lib/api/route-helpers` — never `NextResponse.json(...)`.
- Model id stays `gpt-4o-mini` (match existing calls).
- Reuse `nodeHandle` from `@/lib/nodes/describe-node`; do not redefine handle logic.
- Pure logic lives in `src/lib/copilot/actions.ts` and is unit-tested with Vitest (`npx vitest run`).
- Spec: `docs/superpowers/specs/2026-07-11-creativeos-copilot-conversation-memory-design.md`.

## File Structure
- `src/lib/copilot/actions.ts` (modify) — add `parse_script` to `CopilotAction`; add pure `buildHistory` + `resolveScriptTarget`.
- `src/lib/copilot/actions.test.ts` (modify) — tests for `buildHistory` + `resolveScriptTarget`.
- `src/app/api/copilot/route.ts` (modify) — prose call accepts `messages` history.
- `src/app/api/copilot/actions/route.ts` (modify) — tool call accepts `messages` history; add `parse_script` tool + handling.
- `src/components/canvas/copilot-panel.tsx` (modify) — build history, send it to both calls, run the parse recipe on `parse_script`.

> **Refines spec §3.5:** `parse_script` short-circuits like `create_script_node` — the parse recipe posts the reply ("Parsed into N shots"); streamed prose-with-history serves *question* follow-ups, not command follow-ups.

---

### Task 1: Pure helpers — `parse_script` type, `buildHistory`, `resolveScriptTarget`

**Files:**
- Modify: `src/lib/copilot/actions.ts`
- Test: `src/lib/copilot/actions.test.ts`

**Interfaces:**
- Produces: `type CopilotAction` (now includes `{ name: "parse_script"; args: { handle?: string } }`); `type ChatTurn = { role: "user" | "assistant"; content: string }`; `buildHistory(prior: ReadonlyArray<{role:"user"|"assistant";content:string}>, text: string): ChatTurn[]`; `resolveScriptTarget(nodes: AppNode[], handle?: string): AppNode | null`.

- [ ] **Step 1: Write the failing tests**

Replace the import line at the top of `src/lib/copilot/actions.test.ts`:
```ts
import { placeNewNode, buildHistory, resolveScriptTarget } from "./actions";
import { nodeHandle } from "@/lib/nodes/describe-node";
import type { AppNode } from "@/lib/canvas-nodes";
```

Append at the end of `src/lib/copilot/actions.test.ts`:
```ts
describe("buildHistory", () => {
  it("appends the new user message and drops empty / placeholder turns", () => {
    const prior = [
      { role: "user" as const, content: "hi" },
      { role: "assistant" as const, content: "" }, // streaming placeholder → dropped
      { role: "assistant" as const, content: "Created a Script node. Parse it?" },
    ];
    expect(buildHistory(prior, "yes")).toEqual([
      { role: "user", content: "hi" },
      { role: "assistant", content: "Created a Script node. Parse it?" },
      { role: "user", content: "yes" },
    ]);
  });
});

describe("resolveScriptTarget", () => {
  const scriptNode = (id: string): AppNode =>
    ({ id, type: "script", position: { x: 0, y: 0 }, data: {} }) as AppNode;
  const textNode = (id: string): AppNode =>
    ({ id, type: "text", position: { x: 0, y: 0 }, data: {} }) as AppNode;

  it("returns null when there is no Script node", () => {
    expect(resolveScriptTarget([textNode("t1")])).toBeNull();
  });

  it("returns the most-recently-added Script node when no handle is given", () => {
    const nodes = [scriptNode("s1"), textNode("t1"), scriptNode("s2")];
    expect(resolveScriptTarget(nodes)?.id).toBe("s2");
  });

  it("returns the Script node whose handle the model named", () => {
    const nodes = [
      scriptNode("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"),
      scriptNode("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"),
    ];
    const h = nodeHandle({ id: nodes[0].id, type: "script" });
    expect(resolveScriptTarget(nodes, h)?.id).toBe(nodes[0].id);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd .claude/worktrees/minimal-agent && npx vitest run src/lib/copilot/actions.test.ts`
Expected: FAIL — `buildHistory`/`resolveScriptTarget` are not exported.

- [ ] **Step 3: Implement the helpers**

In `src/lib/copilot/actions.ts`, add to the imports at the top:
```ts
import { nodeHandle } from "@/lib/nodes/describe-node";
```

Extend the `CopilotAction` union (add the third variant):
```ts
export type CopilotAction =
  | { name: "add_node"; args: { type: string; title?: string } }
  | { name: "create_script_node"; args: { title?: string } }
  | { name: "parse_script"; args: { handle?: string } };
```

Append at the end of the file:
```ts
export type ChatTurn = { role: "user" | "assistant"; content: string };

// The conversation window sent to the model: prior turns + the new user message, as plain
// {role, content} pairs. Drops empty-content turns (e.g. the streaming placeholder) and any
// UI-only fields a panel message carries. The MODEL — not client code — interprets "yes".
export function buildHistory(
  prior: ReadonlyArray<{ role: "user" | "assistant"; content: string }>,
  text: string,
): ChatTurn[] {
  const turns = prior
    .filter((m) => m.content.trim().length > 0)
    .map((m) => ({ role: m.role, content: m.content }));
  return [...turns, { role: "user", content: text }];
}

// Pick the Script node a parse_script action targets: the one whose handle the model named,
// else the most-recently-added Script node on the canvas, else null.
export function resolveScriptTarget(nodes: AppNode[], handle?: string): AppNode | null {
  const scripts = nodes.filter((n) => n.type === "script");
  if (handle) {
    const want = handle.trim().toUpperCase();
    const byHandle = scripts.find(
      (n) => nodeHandle({ id: n.id, type: n.type }).toUpperCase() === want,
    );
    if (byHandle) return byHandle;
  }
  return scripts.length > 0 ? scripts[scripts.length - 1] : null;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd .claude/worktrees/minimal-agent && npx vitest run src/lib/copilot/actions.test.ts`
Expected: PASS (all `placeNewNode`, `buildHistory`, `resolveScriptTarget` tests green).

- [ ] **Step 5: Commit**

```bash
git -C .claude/worktrees/minimal-agent add src/lib/copilot/actions.ts src/lib/copilot/actions.test.ts
git -C .claude/worktrees/minimal-agent commit -m "feat(copilot): parse_script type + buildHistory + resolveScriptTarget"
```

---

### Task 2: Prose route accepts the conversation history

**Files:**
- Modify: `src/app/api/copilot/route.ts`

**Interfaces:**
- Consumes: request body `{ messages: {role,content}[], canvasId, mentionedIds? }` (was `{ message, ... }`).
- Produces: unchanged — a streamed `text/plain` response.

- [ ] **Step 1: Swap `message` for `messages` history**

In `src/app/api/copilot/route.ts`, replace the body parse + validation (the block from `const body =` through the `if (!canvasId)` line) with:
```ts
  const body = (await req.json().catch(() => null)) as
    | { messages?: { role: "user" | "assistant"; content: string }[]; canvasId?: string; mentionedIds?: string[] }
    | null;
  const history = Array.isArray(body?.messages) ? body.messages : [];
  const canvasId = body?.canvasId;
  if (history.length === 0) return apiError("A 'messages' history is required.", 400);
  if (!canvasId) return apiError("A 'canvasId' is required.", 400);
```

- [ ] **Step 2: Send the history to the model**

In the same file, in the `openai.chat.completions.create({...})` call, replace the single trailing user message with the spread history — the `messages` array becomes:
```ts
      messages: [
        {
          role: "system",
          content:
            "You are the copilot inside CreativeOS. You CAN see the canvas — it is described " +
            "in the next message. Be brief and concrete. Refer to nodes by their HANDLE (e.g. " +
            "PRM-A3F9) and type; the user sees the same handles on the canvas. When the user " +
            "writes an @HANDLE, that is a specific node they are pointing at — use it. Each node " +
            "also lists a bracketed internal [id …] for your reference only — never show it.",
        },
        { role: "system", content: canvasContext },
        ...history,
      ],
```

- [ ] **Step 3: Typecheck**

Run: `cd .claude/worktrees/minimal-agent && npx tsc --noEmit -p tsconfig.json; echo "exit $?"`
Expected: `exit 0` (no type errors). NOTE: the panel still sends `{message}` at this point, so do not run the app between Task 2 and Task 4 — the panel is updated in Task 4.

- [ ] **Step 4: Commit**

```bash
git -C .claude/worktrees/minimal-agent add src/app/api/copilot/route.ts
git -C .claude/worktrees/minimal-agent commit -m "feat(copilot): prose route accepts conversation history"
```

---

### Task 3: Actions route accepts history + `parse_script` tool

**Files:**
- Modify: `src/app/api/copilot/actions/route.ts`

**Interfaces:**
- Consumes: request body `{ messages: {role,content}[], canvasId, mentionedIds? }`; `CopilotAction` (Task 1).
- Produces: `{ action: CopilotAction | null }` — now also `{ name: "parse_script", args: { handle? } }`.

- [ ] **Step 1: Add the `parse_script` tool**

In `src/app/api/copilot/actions/route.ts`, add a third entry to the `tools` array (after the `create_script_node` tool object, before the closing `];`):
```ts
  {
    type: "function" as const,
    function: {
      name: "parse_script",
      description:
        "Parse/extract a Script node the user has ALREADY created into structured shots. " +
        "Call this when the user asks to parse/extract the script, or confirms an offer to " +
        "parse it (e.g. replies 'yes'). Identify the node by its handle (e.g. SCR-1A2B) if " +
        "clear from the canvas; otherwise leave handle empty to parse the most recent script.",
      parameters: {
        type: "object",
        properties: {
          handle: {
            type: "string",
            description: "Handle of the Script node to parse, e.g. SCR-1A2B, if identifiable.",
          },
        },
        required: [],
        additionalProperties: false,
      },
    },
  },
```

- [ ] **Step 2: Accept the history + steer the model**

Replace the body parse + validation block (`const body =` through `if (!canvasId) ...`) with:
```ts
  const body = (await req.json().catch(() => null)) as
    | { messages?: { role: "user" | "assistant"; content: string }[]; canvasId?: string; mentionedIds?: string[] }
    | null;
  const history = Array.isArray(body?.messages) ? body.messages : [];
  const canvasId = body?.canvasId;
  if (history.length === 0) return apiError("A 'messages' history is required.", 400);
  if (!canvasId) return apiError("A 'canvasId' is required.", 400);
```

Replace the `messages: [ ... ]` array in the `openai.chat.completions.create` call with:
```ts
      messages: [
        {
          role: "system",
          content:
            "You are the copilot inside CreativeOS. Read the whole conversation. " +
            "If the user pasted/attached a reel script and wants it turned into a script node, " +
            "call create_script_node. If the user asks to parse/extract a script node they " +
            "already made (or confirms an offer to parse it, e.g. 'yes'), call parse_script. " +
            "Otherwise, if they ask to add/create a node, call add_node with the best-fitting " +
            "type. If it is just a question about the canvas, do not call any tool.",
        },
        { role: "system", content: canvasContext },
        ...history,
      ],
```

- [ ] **Step 3: Handle the `parse_script` tool call**

In the handler, add a branch BEFORE the `create_script_node` branch (right after the `JSON.parse(call.function.arguments)` block that produces `args`). Extend `args` typing to include `handle`:
```ts
    let args: { type?: string; title?: string; handle?: string };
    try {
      args = JSON.parse(call.function.arguments) as { type?: string; title?: string; handle?: string };
    } catch {
      return apiOk({ action: null });
    }

    if (call.function.name === "parse_script") {
      return apiOk({
        action: {
          name: "parse_script" as const,
          args: { handle: args.handle?.trim() || undefined },
        },
      });
    }
```
(Leave the existing `create_script_node` and `add_node` branches unchanged below this.)

- [ ] **Step 4: Typecheck**

Run: `cd .claude/worktrees/minimal-agent && npx tsc --noEmit -p tsconfig.json; echo "exit $?"`
Expected: `exit 0`.

- [ ] **Step 5: Commit**

```bash
git -C .claude/worktrees/minimal-agent add src/app/api/copilot/actions/route.ts
git -C .claude/worktrees/minimal-agent commit -m "feat(copilot): actions route accepts history + parse_script tool"
```

---

### Task 4: Panel — send history to both calls, run the parse recipe

**Files:**
- Modify: `src/components/canvas/copilot-panel.tsx`

**Interfaces:**
- Consumes: `buildHistory`, `resolveScriptTarget`, `CopilotAction` from `@/lib/copilot/actions`; `ReelScript` from `@/lib/nodes/reel-script`; the parse route `POST /api/nodes/:id/parse`.

- [ ] **Step 1: Import the helpers + ReelScript**

Replace the copilot-actions import line with:
```ts
import { placeNewNode, buildHistory, resolveScriptTarget, type CopilotAction } from "@/lib/copilot/actions";
```
Add near the other type imports:
```ts
import type { ReelScript } from "@/lib/nodes/reel-script";
```

- [ ] **Step 2: Build history + send it to the actions call**

In `send()`, immediately after the `const mentionedIds = resolveMentions(...)` line, add:
```ts
    // The whole chat window travels with the turn — this is the copilot's memory.
    const history = buildHistory(messages, text);
```
Change the actions-call fetch body from `{ message: text, canvasId, mentionedIds }` to:
```ts
          body: JSON.stringify({ messages: history, canvasId, mentionedIds }),
```

- [ ] **Step 3: Route a `parse_script` decision into the recipe**

In `send()`, directly after the `if (action?.name === "create_script_node") { ... return; }` block, add:
```ts
      if (action?.name === "parse_script") {
        await parseScript(action.args.handle);
        return;
      }
```

- [ ] **Step 4: Send history to the prose call**

Change the prose-call fetch body (`fetch("/api/copilot", ...)`) from `{ message: text, canvasId, mentionedIds }` to:
```ts
        body: JSON.stringify({ messages: history, canvasId, mentionedIds }),
```

- [ ] **Step 5: Add the parse recipe**

Add this function alongside `createScriptNode` (e.g. directly below it):
```ts
  // RECIPE — parse a Script node the user already created. Resolve the target, POST to the
  // parse route (retrying if the node is still autosaving — the app's own runParse pattern),
  // inject the parsed output for display, and report the shot count in chat.
  async function parseScript(handle?: string) {
    const target = resolveScriptTarget(storeApi.getState().nodes, handle);
    if (!target) {
      setMessages((m) => [...m, { role: "assistant", content: "I don't see a script node to parse." }]);
      setThinking(false);
      return;
    }
    const source = ((target.data as { source?: string }).source ?? "").trim();
    if (!source) {
      setMessages((m) => [...m, { role: "assistant", content: "That script node has no text to parse yet." }]);
      setThinking(false);
      return;
    }
    try {
      let output: ReelScript | null = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        const res = await fetch(`/api/nodes/${target.id}/parse`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ source }),
        });
        if (res.ok) {
          output = ((await res.json()) as { output: ReelScript }).output;
          break;
        }
        if (res.status === 404 && attempt < 2) {
          await new Promise((r) => setTimeout(r, 900)); // node still autosaving — wait past the debounce
          continue;
        }
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        setMessages((m) => [...m, { role: "assistant", content: err.error ?? "Parsing failed." }]);
        return;
      }
      if (!output) {
        setMessages((m) => [
          ...m,
          { role: "assistant", content: "The node is still saving — ask me to parse it again in a moment." },
        ]);
        return;
      }
      storeApi.getState().updateNodeData(target.id, { parsed: output });
      highlightNode(target.id);
      const count = output.visual_script?.shots?.length ?? 0;
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content: count > 0
            ? `Parsed into ${count} shot${count === 1 ? "" : "s"}. Open the node to review them.`
            : "Parsed the script, but I didn't find any shots in it.",
        },
      ]);
    } finally {
      setThinking(false);
    }
  }
```

- [ ] **Step 6: Typecheck + lint**

Run: `cd .claude/worktrees/minimal-agent && npx tsc --noEmit -p tsconfig.json && npx eslint src/components/canvas/copilot-panel.tsx src/lib/copilot/actions.ts "src/app/api/copilot/route.ts" "src/app/api/copilot/actions/route.ts"; echo "exit $?"`
Expected: `exit 0` type errors; eslint shows only the pre-existing `Check`/`approveProposal`/`rejectProposal` unused warnings.

- [ ] **Step 7: Run the app and verify the conversation end-to-end**

Run: `cd .claude/worktrees/minimal-agent && npm run dev`, open a client → a canvas → ✨ Copilot.
1. Paste a reel script + "create a script node from this" → a Script node appears; chat: "Created a Script node — '…'. Want me to parse it into shots?"
2. Type **"yes"** → the node's status flips to extracted; chat: "Parsed into N shots. Open the node to review them." (No "How can I assist you today?".)
3. Open the node → the parsed shots are shown.
4. Ask a follow-up question ("what did you just do?") → the streamed reply references the conversation (memory works on the prose path too).

- [ ] **Step 8: Commit**

```bash
git -C .claude/worktrees/minimal-agent add src/components/canvas/copilot-panel.tsx
git -C .claude/worktrees/minimal-agent commit -m "feat(copilot): send chat history to both calls + parse recipe on parse_script"
```

---

## Self-Review

**Spec coverage:**
- §3.1 history payload → Task 1 `buildHistory` + Task 4 Step 2.
- §3.2 memory on both calls → Task 2 (prose) + Task 3 (actions) + Task 4 Steps 2 & 4.
- §3.3 `parse_script` tool → Task 1 (type) + Task 3 (tool + handler).
- §3.4 parse recipe (resolve → parse w/ retry → inject → report) → Task 4 Step 5.
- §3.5 data flow of "yes" → Task 4 Step 3 routes the decision; recipe reports (refinement noted above).
- §4 scope → only `parse_script` added; streaming + chips untouched; whole window sent; no client pattern.
- §5 testing → Task 1 unit tests (`buildHistory`, `resolveScriptTarget`); recipe verified by Task 4 Step 7.

**Placeholder scan:** none — every step has concrete code/commands.

**Type consistency:** `CopilotAction` gains `parse_script` in Task 1 and is consumed by Task 3 (route) + Task 4 (`action.args.handle`). `buildHistory`/`resolveScriptTarget` signatures match their Task 4 call sites. `ReelScript.visual_script.shots` used for the count matches `src/lib/nodes/reel-script.ts`.
