# Stage 2a — Prompt node + functional edges Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire Script/Text/(ambient KB) into a Prompt node that shows the final compiled prompt and generates an image-generation prompt — the first multi-node pipeline.

**Architecture:** Reuse the Stage-1 spine unchanged (`insertVersion`/`setActiveVersion`, the parse route as the `runAction` template, the persisted `edges` table). Add: a pure cycle check on connect, a pure `getNodeOutput` selector (Text → `node.data`, model nodes → active version output, per D19), a shared `resolvePromptInputs`, a pure `compilePrompt`, two routes (compile-preview + generate), Text/Prompt node components + focus view, and a node palette.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript (strict), `@xyflow/react`, Zustand (vanilla store), OpenAI SDK, Supabase, Base UI (sheet/popover), Vitest.

**Spec:** `docs/superpowers/specs/2026-06-09-stage-2-prompt-node-design.md`

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `src/lib/canvas-nodes.ts` | Add `TextNodeData`/`PromptNodeData` + union | 1 (modify) |
| `src/lib/canvas-store.ts` | `defaultData` cases, widen `updateNodeData`, cycle check in `onConnect` | 1, 3 (modify) |
| `src/lib/canvas/graph.ts` | `wouldCreateCycle` pure helper | 2 (create) |
| `src/lib/canvas/graph.test.ts` | Cycle-check tests | 2 (create) |
| `src/lib/nodes/node-output.ts` | `getNodeOutput` + `renderScriptAsText` (pure) | 4 (create) |
| `src/lib/nodes/node-output.test.ts` | Output-selector tests | 4 (create) |
| `src/prompts/prompt-generate.ts` | Versioned prompt-generate record | 5 (create) |
| `src/lib/nodes/prompt.ts` | `compilePrompt` (pure) | 5 (create) |
| `src/lib/nodes/prompt.test.ts` | Compile tests | 5 (create) |
| `src/lib/db/nodes.ts` | `getUpstreamOutputs` | 6 (modify) |
| `src/lib/nodes/resolve-inputs.ts` | `resolvePromptInputs` (server) | 7 (create) |
| `src/app/api/nodes/[id]/compile-preview/route.ts` | Live compiled-prompt preview | 8 (create) |
| `src/app/api/nodes/[id]/generate/route.ts` | Prompt `runAction` | 9 (create) |
| `src/lib/actions/nodes.ts` | `savePromptOutputAction` | 9 (modify) |
| `src/components/nodes/text-node.tsx` | Text node | 10 (create) |
| `src/components/nodes/prompt-focus-view.tsx` | Prompt focus view (bottom sheet) | 11 (create) |
| `src/components/nodes/prompt-node.tsx` | Prompt node card | 12 (create) |
| `src/components/canvas/canvas.tsx` | Register `text`/`prompt`; node palette | 10, 12, 13 (modify) |

Verification commands: `npx vitest run <file>` (unit), `npx tsc --noEmit` (types), `npm run lint` (lint).

---

## Task 1: Node data types + store plumbing

**Files:**
- Modify: `src/lib/canvas-nodes.ts`
- Modify: `src/lib/canvas-store.ts`

- [ ] **Step 1: Add the new data types + union**

In `src/lib/canvas-nodes.ts`, after the `KBNodeData` type, add:

```ts
export type TextNodeData = {
  text?: string; // free-text context; this node's "output" (no version log, D19)
};

export type PromptNodeData = {
  title?: string;
  instruction?: string; // operator instruction
  parsed?: unknown; // active output (generated prompt text) — DISPLAY ONLY, hydrated from the active version (D19)
  kbSlices?: KBSliceKey[]; // ambient KB slices injected into the compiled prompt
};
```

Then replace the `AppNode` union with:

```ts
export type AppNode =
  | Node<ScriptNodeData, "script">
  | Node<KBNodeData, "kb">
  | Node<TextNodeData, "text">
  | Node<PromptNodeData, "prompt">;
```

- [ ] **Step 2: Widen `updateNodeData` + add `defaultData` cases**

In `src/lib/canvas-store.ts`, change the `updateNodeData` signature in the `CanvasState` type from:

```ts
  updateNodeData: (id: string, data: Partial<ScriptNodeData>) => void;
```

to:

```ts
  updateNodeData: (id: string, data: Record<string, unknown>) => void;
```

Remove the now-unused `ScriptNodeData` import if it is no longer referenced (it is imported on line 12: `import type { AppNode, ScriptNodeData } from "./canvas-nodes";` → change to `import type { AppNode } from "./canvas-nodes";`).

Replace `defaultData` with:

```ts
function defaultData(type: string): AppNode["data"] {
  switch (type) {
    case "text":
      return {};
    case "prompt":
      return { title: "" };
    case "script":
    default:
      return { title: "" };
  }
}
```

- [ ] **Step 3: Verify types + existing tests**

Run: `npx tsc --noEmit`
Expected: clean.

Run: `npx vitest run src/lib/canvas-nodes.test.ts`
Expected: PASS (the existing mapper tests still pass — the union widened, mappers unchanged).

- [ ] **Step 4: Commit**

```bash
git add src/lib/canvas-nodes.ts src/lib/canvas-store.ts
git commit -m "feat(stage2): add Text/Prompt node data types + store plumbing"
```

---

## Task 2: `wouldCreateCycle` (TDD)

**Files:**
- Create: `src/lib/canvas/graph.ts`
- Test: `src/lib/canvas/graph.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/canvas/graph.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import type { Edge } from "@xyflow/react";
import { wouldCreateCycle } from "./graph";

const e = (source: string, target: string): Edge => ({ id: `${source}-${target}`, source, target });

describe("wouldCreateCycle", () => {
  it("is false for a fresh connection on an empty graph", () => {
    expect(wouldCreateCycle([], "A", "B")).toBe(false);
  });

  it("rejects a self-loop", () => {
    expect(wouldCreateCycle([], "A", "A")).toBe(true);
  });

  it("rejects the closing edge of a 2-cycle", () => {
    // A -> B exists; adding B -> A closes a loop
    expect(wouldCreateCycle([e("A", "B")], "B", "A")).toBe(true);
  });

  it("rejects the closing edge of a longer chain", () => {
    // A -> B -> C exists; adding C -> A closes a loop
    expect(wouldCreateCycle([e("A", "B"), e("B", "C")], "C", "A")).toBe(true);
  });

  it("allows a diamond (no cycle)", () => {
    // A -> B, A -> C, B -> D, C -> D ; adding nothing problematic
    const edges = [e("A", "B"), e("A", "C"), e("B", "D"), e("C", "D")];
    expect(wouldCreateCycle(edges, "A", "D")).toBe(false); // A already reaches D, but A->D adds no loop
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/canvas/graph.test.ts`
Expected: FAIL — cannot resolve `./graph`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/canvas/graph.ts`:

```ts
import type { Edge } from "@xyflow/react";

// True when adding `source -> target` would close a cycle — i.e. `target` is
// already an ancestor of `source` (a path target -> … -> source exists). This is
// the only graph algorithm we need: the human triggers each node, so no
// topological sort (ADR D11). The existing graph is always acyclic, so we only
// check the one new edge against it.
export function wouldCreateCycle(edges: Edge[], source: string, target: string): boolean {
  if (source === target) return true;

  // adjacency: node -> its direct upstream parents
  const parents = new Map<string, string[]>();
  for (const e of edges) {
    const arr = parents.get(e.target) ?? [];
    arr.push(e.source);
    parents.set(e.target, arr);
  }

  // walk upstream from `source`; reaching `target` means a cycle would form
  const stack: string[] = [source];
  const seen = new Set<string>();
  while (stack.length > 0) {
    const cur = stack.pop() as string;
    if (cur === target) return true;
    if (seen.has(cur)) continue;
    seen.add(cur);
    for (const p of parents.get(cur) ?? []) stack.push(p);
  }
  return false;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/canvas/graph.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/canvas/graph.ts src/lib/canvas/graph.test.ts
git commit -m "feat(stage2): add wouldCreateCycle graph guard"
```

---

## Task 3: Cycle check in `onConnect`

**Files:**
- Modify: `src/lib/canvas-store.ts`

- [ ] **Step 1: Add imports**

At the top of `src/lib/canvas-store.ts`, add:

```ts
import { toast } from "sonner";
import { wouldCreateCycle } from "@/lib/canvas/graph";
```

- [ ] **Step 2: Guard `onConnect`**

Replace the `onConnect` line:

```ts
    onConnect: (connection) => set({ edges: addEdge(connection, get().edges) }),
```

with:

```ts
    onConnect: (connection) => {
      const { source, target } = connection;
      if (source && target && wouldCreateCycle(get().edges, source, target)) {
        toast.error("That connection would create a loop.");
        return;
      }
      set({ edges: addEdge(connection, get().edges) });
    },
```

- [ ] **Step 3: Verify types + lint**

Run: `npx tsc --noEmit`
Expected: clean.

Run: `npm run lint`
Expected: no new errors in `canvas-store.ts`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/canvas-store.ts
git commit -m "feat(stage2): reject loop-creating edges on connect"
```

---

## Task 4: `getNodeOutput` + `renderScriptAsText` (TDD)

**Files:**
- Create: `src/lib/nodes/node-output.ts`
- Test: `src/lib/nodes/node-output.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/nodes/node-output.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { getNodeOutput } from "./node-output";

describe("getNodeOutput", () => {
  it("returns a text node's data.text", () => {
    expect(getNodeOutput({ type: "text", data: { text: "  hello  " }, activeOutput: null })).toBe("hello");
  });

  it("returns a prompt node's active output string", () => {
    expect(getNodeOutput({ type: "prompt", data: {}, activeOutput: "a cinematic shot" })).toBe("a cinematic shot");
  });

  it("renders a script node's parsed output as labeled text", () => {
    const out = getNodeOutput({
      type: "script",
      data: {},
      activeOutput: { title: "Reel A", strategic_objective: "Sell calm", visual_script: { shots: [{ description: "Turmeric root", duration: "3s" }] } },
    });
    expect(out).toContain("Title: Reel A");
    expect(out).toContain("Objective: Sell calm");
    expect(out).toContain("1. Turmeric root (3s)");
  });

  it("returns empty string for null output", () => {
    expect(getNodeOutput({ type: "script", data: {}, activeOutput: null })).toBe("");
    expect(getNodeOutput({ type: "text", data: {}, activeOutput: null })).toBe("");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/nodes/node-output.test.ts`
Expected: FAIL — cannot resolve `./node-output`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/nodes/node-output.ts`:

```ts
import type { ReelScript } from "@/lib/nodes/reel-script";

export type NodeOutputInput = {
  type: string;
  data: Record<string, unknown>;
  activeOutput: unknown | null;
};

// Normalize any node's current output to plain text for downstream context.
// Content nodes (Text) read node.data; model nodes (Script/Prompt) read the
// active version's output (D19). Pure + unit-tested.
export function getNodeOutput(node: NodeOutputInput): string {
  switch (node.type) {
    case "text":
      return String(node.data.text ?? "").trim();
    case "prompt":
      return typeof node.activeOutput === "string" ? node.activeOutput.trim() : "";
    case "script":
      return renderScriptAsText(node.activeOutput as ReelScript | null);
    default:
      if (node.activeOutput == null) return "";
      return typeof node.activeOutput === "string"
        ? node.activeOutput.trim()
        : JSON.stringify(node.activeOutput);
  }
}

// Flatten a parsed reel script into readable labeled text for prompt context.
export function renderScriptAsText(script: ReelScript | null): string {
  if (!script) return "";
  const lines: string[] = [];
  const push = (label: string, v?: string) => {
    if (v && v.trim()) lines.push(`${label}: ${v.trim()}`);
  };

  push("Title", script.title);
  push("Type", script.type);
  push("Duration", script.duration);
  push("Objective", script.strategic_objective);
  push("Production", script.ai_production_type);

  const shots = script.visual_script?.shots ?? [];
  if (shots.length > 0) {
    lines.push("Visual script:");
    shots.forEach((s, i) => {
      if (s.description && s.description.trim()) {
        lines.push(`  ${i + 1}. ${s.description.trim()}${s.duration ? ` (${s.duration})` : ""}`);
      }
    });
  }

  const ost = script.on_screen_text;
  if (ost) {
    push("On-screen intro", ost.intro);
    (ost.body ?? []).forEach((b) => {
      if (b && b.trim()) lines.push(`On-screen: ${b.trim()}`);
    });
    push("On-screen outro", ost.outro);
  }

  push("Voiceover", script.voiceover);
  push("Music & sound", script.music_sound);
  push("Caption", script.caption);
  push("CTA", script.cta);
  push("Thumbnail hook", script.thumbnail_hook);

  return lines.join("\n");
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/nodes/node-output.test.ts`
Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/nodes/node-output.ts src/lib/nodes/node-output.test.ts
git commit -m "feat(stage2): add getNodeOutput selector (text/script/prompt -> text)"
```

---

## Task 5: `compilePrompt` + prompt record (TDD)

**Files:**
- Create: `src/prompts/prompt-generate.ts`
- Create: `src/lib/nodes/prompt.ts`
- Test: `src/lib/nodes/prompt.test.ts`

- [ ] **Step 1: Write the prompt record**

Create `src/prompts/prompt-generate.ts`:

```ts
// Prompt-generate prompt — a single, evaluable, *versioned* record (mirrors
// src/prompts/script-parse.ts). Maps 1:1 to a future `prompts` DB row.
export const promptGeneratePrompt = {
  id: "prompt-generate",
  version: 1,
  model: "gpt-5.4-mini",
  system: `You are an expert creative director who writes vivid, production-ready image-generation prompts for social-media reel assets.
Given brand context, upstream creative material, and an operator instruction, write a single detailed image-generation prompt.
Return ONLY the prompt text — no preamble, no explanation, no markdown.`,
} as const;
```

- [ ] **Step 2: Write the failing test**

Create `src/lib/nodes/prompt.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { compilePrompt } from "./prompt";

describe("compilePrompt", () => {
  it("assembles labeled blocks for context + upstream + instruction", () => {
    const { user } = compilePrompt({
      clientContext: "Tone: warm",
      upstream: [{ label: "Script", text: "Title: Reel A" }],
      instruction: "cinematic hero shot",
    });
    expect(user).toContain("Brand context:\nTone: warm");
    expect(user).toContain("Script:\nTitle: Reel A");
    expect(user).toContain("Instruction:\ncinematic hero shot");
  });

  it("omits empty blocks and defaults a missing instruction", () => {
    const { user } = compilePrompt({ clientContext: "", upstream: [], instruction: "  " });
    expect(user).not.toContain("Brand context:");
    expect(user).not.toContain("Script:");
    expect(user).toContain("Instruction:");
  });

  it("uses the versioned system prompt", () => {
    const { system } = compilePrompt({ clientContext: "", upstream: [], instruction: "x" });
    expect(system).toContain("image-generation prompt");
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run src/lib/nodes/prompt.test.ts`
Expected: FAIL — cannot resolve `./prompt`.

- [ ] **Step 4: Write the implementation**

Create `src/lib/nodes/prompt.ts`:

```ts
// The Prompt node's `compile` step — pure: (client context + upstream outputs +
// instruction) → the model payload. The `user` string is the visible "final
// compiled prompt" the PRD requires be shown before generation (ADR D3).
import { promptGeneratePrompt } from "@/prompts/prompt-generate";

export type CompilePromptInput = {
  clientContext: string;
  upstream: { label: string; text: string }[];
  instruction: string;
};

export function compilePrompt(input: CompilePromptInput): { system: string; user: string } {
  const blocks: string[] = [];

  if (input.clientContext.trim()) {
    blocks.push(`Brand context:\n${input.clientContext.trim()}`);
  }
  for (const u of input.upstream) {
    if (u.text.trim()) blocks.push(`${u.label}:\n${u.text.trim()}`);
  }
  const instruction =
    input.instruction.trim() || "Write an image-generation prompt from the material above.";
  blocks.push(`Instruction:\n${instruction}`);

  return { system: promptGeneratePrompt.system, user: blocks.join("\n\n") };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/lib/nodes/prompt.test.ts`
Expected: PASS — 3 tests.

- [ ] **Step 6: Commit**

```bash
git add src/prompts/prompt-generate.ts src/lib/nodes/prompt.ts src/lib/nodes/prompt.test.ts
git commit -m "feat(stage2): add compilePrompt + versioned prompt-generate record"
```

---

## Task 6: `getUpstreamOutputs` DB helper

**Files:**
- Modify: `src/lib/db/nodes.ts`

- [ ] **Step 1: Add the helper**

Append to `src/lib/db/nodes.ts`:

```ts
export type UpstreamOutput = {
  nodeId: string;
  type: string;
  data: Record<string, unknown>;
  activeOutput: unknown | null;
  versionId: string | null; // the source's active_version_id (recorded for D9)
};

// Load the active outputs of every node with an edge INTO `nodeId`. Follows each
// source node's active_version_id via the same FK embed as listNodes.
export async function getUpstreamOutputs(nodeId: string): Promise<UpstreamOutput[]> {
  const supabase = createServerSupabase();

  const { data: edges, error: edgeErr } = await supabase
    .from("edges")
    .select("source_node_id")
    .eq("target_node_id", nodeId);
  if (edgeErr) throw edgeErr;

  const sourceIds = (edges ?? []).map(
    (e) => (e as { source_node_id: string }).source_node_id,
  );
  if (sourceIds.length === 0) return [];

  const { data: nodes, error: nodeErr } = await supabase
    .from("nodes")
    .select("id, type, data, active_version_id, active:node_versions!nodes_active_version_fk(output)")
    .in("id", sourceIds);
  if (nodeErr) throw nodeErr;

  return (nodes ?? []).map((n) => {
    const row = n as {
      id: string;
      type: string;
      data: Record<string, unknown> | null;
      active_version_id: string | null;
      active: { output: unknown } | null;
    };
    return {
      nodeId: row.id,
      type: row.type,
      data: row.data ?? {},
      activeOutput: row.active?.output ?? null,
      versionId: row.active_version_id,
    };
  });
}
```

- [ ] **Step 2: Verify types + lint**

Run: `npx tsc --noEmit`
Expected: clean.

Run: `npm run lint`
Expected: no new errors in `nodes.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/db/nodes.ts
git commit -m "feat(stage2): add getUpstreamOutputs (edges -> source active outputs)"
```

---

## Task 7: `resolvePromptInputs` (shared server resolver)

**Files:**
- Create: `src/lib/nodes/resolve-inputs.ts`

- [ ] **Step 1: Write the resolver**

Create `src/lib/nodes/resolve-inputs.ts`:

```ts
import "server-only";
import { getNodeActiveKB, getUpstreamOutputs } from "@/lib/db/nodes";
import { buildParseContext, normalizeSlices, type KBSliceKey } from "@/lib/kb/parse-context";
import { getNodeOutput } from "@/lib/nodes/node-output";

const TYPE_LABEL: Record<string, string> = {
  script: "Script",
  text: "Note",
  prompt: "Prompt",
};

export type ResolvedPromptInputs = {
  clientContext: string;
  kbVersionId: string | null;
  slices: KBSliceKey[];
  upstream: { nodeId: string; versionId: string | null; label: string; text: string }[];
};

// resolveInputs for the Prompt node: ambient client KB (walk node->canvas->client,
// reuse the Script pipeline) + upstream edge outputs (each normalized to text).
// Returns null when the node is missing (lets routes 404 during the autosave race).
export async function resolvePromptInputs(
  nodeId: string,
  slicesInput: unknown,
): Promise<ResolvedPromptInputs | null> {
  const kbCtx = await getNodeActiveKB(nodeId);
  if (!kbCtx) return null;

  const slices = normalizeSlices(slicesInput);
  const clientContext = kbCtx.kb ? buildParseContext(kbCtx.kb, slices) : "";

  const ups = await getUpstreamOutputs(nodeId);
  const upstream = ups
    .map((u) => ({
      nodeId: u.nodeId,
      versionId: u.versionId,
      label: TYPE_LABEL[u.type] ?? u.type,
      text: getNodeOutput({ type: u.type, data: u.data, activeOutput: u.activeOutput }),
    }))
    .filter((u) => u.text.trim().length > 0);

  return { clientContext, kbVersionId: kbCtx.kbVersionId, slices, upstream };
}
```

- [ ] **Step 2: Verify types + lint**

Run: `npx tsc --noEmit`
Expected: clean.

Run: `npm run lint`
Expected: no new errors in `resolve-inputs.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/nodes/resolve-inputs.ts
git commit -m "feat(stage2): add resolvePromptInputs (ambient KB + upstream outputs)"
```

---

## Task 8: compile-preview route

**Files:**
- Create: `src/app/api/nodes/[id]/compile-preview/route.ts`

- [ ] **Step 1: Write the route**

Create `src/app/api/nodes/[id]/compile-preview/route.ts`:

```ts
import { resolvePromptInputs } from "@/lib/nodes/resolve-inputs";
import { compilePrompt } from "@/lib/nodes/prompt";
import { apiError, apiOk } from "@/lib/api/route-helpers";

// POST /api/nodes/:id/compile-preview — resolve inputs + compile WITHOUT calling
// the model. Powers the live "final compiled prompt" panel (visible before generate).
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: nodeId } = await params;
  const body = (await req.json().catch(() => null)) as
    | { instruction?: unknown; slices?: unknown }
    | null;
  const instruction = typeof body?.instruction === "string" ? body.instruction : "";

  const resolved = await resolvePromptInputs(nodeId, body?.slices);
  if (!resolved) return apiError("Node not found.", 404);

  const { user } = compilePrompt({
    clientContext: resolved.clientContext,
    upstream: resolved.upstream,
    instruction,
  });

  return apiOk({
    compiled: user,
    upstream: resolved.upstream.map((u) => ({ nodeId: u.nodeId, label: u.label })),
  });
}
```

- [ ] **Step 2: Verify types + lint**

Run: `npx tsc --noEmit`
Expected: clean.

Run: `npm run lint`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add "src/app/api/nodes/[id]/compile-preview/route.ts"
git commit -m "feat(stage2): add compile-preview route (visible compiled prompt)"
```

---

## Task 9: generate route + save action

**Files:**
- Create: `src/app/api/nodes/[id]/generate/route.ts`
- Modify: `src/lib/actions/nodes.ts`

- [ ] **Step 1: Write the generate route**

Create `src/app/api/nodes/[id]/generate/route.ts`:

```ts
import { createOpenAI } from "@/lib/openai/server";
import { resolvePromptInputs } from "@/lib/nodes/resolve-inputs";
import { compilePrompt } from "@/lib/nodes/prompt";
import { promptGeneratePrompt } from "@/prompts/prompt-generate";
import { insertVersion, setActiveVersion } from "@/lib/db/versions";
import { apiError, apiOk } from "@/lib/api/route-helpers";

// POST /api/nodes/:id/generate — the Prompt node's runAction: resolve inputs,
// compile, call the model, append a version, move the active pointer. Mirrors the
// Script parse route.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: nodeId } = await params;
  const body = (await req.json().catch(() => null)) as
    | { instruction?: unknown; slices?: unknown }
    | null;
  const instruction = typeof body?.instruction === "string" ? body.instruction : "";

  const resolved = await resolvePromptInputs(nodeId, body?.slices);
  if (!resolved) return apiError("Node not found.", 404);

  const { system, user } = compilePrompt({
    clientContext: resolved.clientContext,
    upstream: resolved.upstream,
    instruction,
  });

  try {
    const openai = createOpenAI();
    const completion = await openai.chat.completions.create({
      model: promptGeneratePrompt.model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });
    const output = completion.choices[0]?.message?.content?.trim() ?? "";

    const version = await insertVersion({
      nodeId,
      inputsUsed: {
        upstream: resolved.upstream.map((u) => ({ nodeId: u.nodeId, versionId: u.versionId })),
        kbVersionId: resolved.kbVersionId,
        kbSlices: resolved.slices,
      },
      paramsUsed: {
        instruction,
        promptId: promptGeneratePrompt.id,
        promptVersion: promptGeneratePrompt.version,
      },
      modelUsed: `openai:${promptGeneratePrompt.model}`,
      output,
    });
    await setActiveVersion(nodeId, version.id);

    return apiOk({ output, versionId: version.id, compiled: user });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Generation failed";
    // a failed attempt is still a version — the log learns from failures too
    await insertVersion({
      nodeId,
      paramsUsed: {
        instruction,
        promptId: promptGeneratePrompt.id,
        promptVersion: promptGeneratePrompt.version,
      },
      modelUsed: `openai:${promptGeneratePrompt.model}`,
      error: message,
    });
    return apiError(message, 500);
  }
}
```

- [ ] **Step 2: Add the save action**

Append to `src/lib/actions/nodes.ts`:

```ts
// Save manual edits to the Prompt node's generated output (D19): updates the
// active version's output in place — does NOT create a new version.
export async function savePromptOutputAction(nodeId: string, output: unknown) {
  await updateActiveVersionOutput(nodeId, output);
}
```

(`updateActiveVersionOutput` is already imported in that file.)

- [ ] **Step 3: Verify types + lint**

Run: `npx tsc --noEmit`
Expected: clean.

Run: `npm run lint`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add "src/app/api/nodes/[id]/generate/route.ts" src/lib/actions/nodes.ts
git commit -m "feat(stage2): add Prompt generate route + savePromptOutputAction"
```

---

## Task 10: Text node

**Files:**
- Create: `src/components/nodes/text-node.tsx`
- Modify: `src/components/canvas/canvas.tsx`

- [ ] **Step 1: Write the Text node**

Create `src/components/nodes/text-node.tsx`:

```tsx
"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { StickyNote } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCanvasStore } from "@/components/canvas/canvas-store-provider";

// Text (Note) node — free-text context that feeds downstream Prompt nodes. No AI,
// no version log: its content IS its output, read straight from node.data (D19).
export function TextNode({ id, data, selected }: NodeProps) {
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const d = data as { text?: string };

  return (
    <div
      className={cn(
        "w-56 rounded-lg border border-border bg-card shadow-card",
        selected && "ring-2 ring-primary ring-offset-1 ring-offset-background",
      )}
    >
      <div className="flex items-center gap-1.5 border-b border-border px-3 py-2">
        <StickyNote className="size-3.5 text-primary" />
        <span className="text-eyebrow !text-[0.65rem]">Note</span>
      </div>
      <div className="p-2">
        <textarea
          value={d.text ?? ""}
          onChange={(e) => updateNodeData(id, { text: e.target.value })}
          placeholder="Type notes or context…"
          rows={4}
          className="nodrag w-full resize-none rounded-md bg-transparent px-1.5 py-1 text-sm focus:outline-none"
        />
      </div>
      <Handle
        type="source"
        position={Position.Right}
        className="!size-2 !border-2 !border-card !bg-primary"
      />
    </div>
  );
}
```

- [ ] **Step 2: Register it**

In `src/components/canvas/canvas.tsx`, add the import:

```ts
import { TextNode } from "@/components/nodes/text-node";
```

and extend the registry (currently `const nodeTypes: NodeTypes = { script: ScriptNode, kb: KBNode };`) to:

```ts
const nodeTypes: NodeTypes = { script: ScriptNode, kb: KBNode, text: TextNode };
```

- [ ] **Step 3: Verify types + lint**

Run: `npx tsc --noEmit`
Expected: clean.

Run: `npm run lint`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/nodes/text-node.tsx src/components/canvas/canvas.tsx
git commit -m "feat(stage2): add Text (Note) node"
```

---

## Task 11: Prompt focus view

**Files:**
- Create: `src/components/nodes/prompt-focus-view.tsx`

- [ ] **Step 1: Write the focus view**

Create `src/components/nodes/prompt-focus-view.tsx`:

```tsx
"use client";

import { useState, useEffect } from "react";
import { ArrowLeft, Sparkles, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { SliceToggles } from "./slice-toggles";
import type { KBSliceKey } from "@/lib/kb/parse-context";

type Upstream = { id: string; label: string };

type PromptFocusViewProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nodeId: string;
  title: string;
  instruction: string;
  output: string | null;
  slices: KBSliceKey[];
  upstream: Upstream[];
  onPatch: (patch: Record<string, unknown>) => void;
  onSaveOutput: (output: string) => Promise<void>;
};

// The Prompt node's surface — a full-width bottom sheet. Left: inputs (KB slices,
// connected nodes, instruction) + Generate. Right: the live compiled prompt and
// the generated, editable output (Save folds into the active version, D19).
export function PromptFocusView({
  open,
  onOpenChange,
  nodeId,
  title,
  instruction,
  output,
  slices,
  upstream,
  onPatch,
  onSaveOutput,
}: PromptFocusViewProps) {
  const [draft, setDraft] = useState(output ?? "");
  const [generating, setGenerating] = useState(false);
  const [compiled, setCompiled] = useState("");
  const [seed, setSeed] = useState<{ open: boolean; output: string | null }>({ open, output });

  // Reseed the editable draft when the view opens or a fresh generation lands
  // (state-during-render, React's documented alternative to a reset effect).
  if (seed.open !== open || seed.output !== output) {
    setSeed({ open, output });
    setDraft(output ?? "");
  }

  const dirty = (output ?? "") !== draft && draft.trim() !== "";
  const mode: "skeleton" | "result" | "empty" = generating
    ? "skeleton"
    : output
      ? "result"
      : "empty";

  // Live compiled-prompt preview — debounced; best-effort.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/nodes/${nodeId}/compile-preview`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ instruction, slices }),
        });
        const json = await res.json();
        if (!cancelled && res.ok) setCompiled(json.compiled ?? "");
      } catch {
        /* preview is best-effort */
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [open, nodeId, instruction, slices]);

  async function runGenerate() {
    setGenerating(true);
    try {
      const res = await fetch(`/api/nodes/${nodeId}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruction, slices }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Generation failed");
      onPatch({ parsed: json.output });
      if (json.compiled) setCompiled(json.compiled);
      toast.success("Prompt generated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setGenerating(false);
    }
  }

  async function handleSave() {
    try {
      await onSaveOutput(draft);
      onPatch({ parsed: draft });
      toast.success("Saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    }
  }

  function toggleSlice(key: KBSliceKey) {
    const next = slices.includes(key) ? slices.filter((k) => k !== key) : [...slices, key];
    onPatch({ kbSlices: next });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="gap-0 overflow-hidden rounded-t-2xl bg-background data-[side=bottom]:h-[92vh]"
      >
        <div className="flex shrink-0 justify-center pt-3">
          <div className="h-1.5 w-12 rounded-full bg-border" />
        </div>

        <div className="shrink-0 border-b">
          <div className="mx-auto w-full max-w-5xl px-6 pb-5 pt-3">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="size-4" /> Back to canvas
            </button>

            <header className="mt-4 flex items-start justify-between gap-4">
              <div>
                <SheetTitle className="font-display text-3xl font-semibold tracking-tight">
                  {title || "Image prompt"}
                </SheetTitle>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  Compose context into a generated image prompt.
                </p>
              </div>

              {mode === "result" && (
                <div className="flex shrink-0 items-center gap-2">
                  <Button variant="outline" size="lg" onClick={runGenerate}>
                    <RefreshCw className="size-4 text-primary" /> Re-generate
                  </Button>
                  {dirty && (
                    <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-[0.65rem] font-semibold text-red-700 dark:bg-red-900/30 dark:text-red-400">
                      Unsaved changes
                    </span>
                  )}
                  <Button size="lg" onClick={handleSave} disabled={!dirty}>
                    Save
                  </Button>
                </div>
              )}
            </header>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto grid w-full max-w-5xl gap-8 px-6 py-8 lg:grid-cols-[300px_1fr]">
            {/* Inputs */}
            <aside className="space-y-5">
              <div>
                <span className="text-eyebrow">Brand context</span>
                <SliceToggles className="mt-2" selected={slices} onToggle={toggleSlice} />
              </div>
              <div>
                <span className="text-eyebrow">Connected inputs</span>
                {upstream.length === 0 ? (
                  <p className="mt-2 text-sm text-muted-foreground">
                    Connect a Script or Note node to feed this prompt.
                  </p>
                ) : (
                  <ul className="mt-2 space-y-1">
                    {upstream.map((u) => (
                      <li key={u.id} className="rounded-md border border-border px-2.5 py-1.5 text-sm">
                        {u.label}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <span className="text-eyebrow">Instruction</span>
                <textarea
                  value={instruction}
                  onChange={(e) => onPatch({ instruction: e.target.value })}
                  rows={4}
                  placeholder="e.g. cinematic product hero shot, warm Ayurvedic palette…"
                  className="mt-2 w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
              <Button className="w-full" onClick={runGenerate} disabled={generating}>
                <Sparkles className="size-4" />
                {generating ? "Generating…" : output ? "Re-generate" : "Generate prompt"}
              </Button>
            </aside>

            {/* Output */}
            <main className="space-y-6">
              <div>
                <span className="text-eyebrow">Final compiled prompt</span>
                <pre className="mt-2 max-h-64 overflow-y-auto whitespace-pre-wrap rounded-xl border bg-muted/20 p-4 text-sm leading-relaxed text-foreground/80">
                  {compiled || "Adjust inputs to preview the compiled prompt."}
                </pre>
              </div>
              <div>
                <span className="text-eyebrow">Generated prompt</span>
                {mode === "skeleton" ? (
                  <div className="mt-2 space-y-2">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <div key={i} className="h-4 w-full animate-pulse rounded bg-muted" />
                    ))}
                  </div>
                ) : mode === "empty" ? (
                  <p className="mt-2 rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                    Not generated yet. Set an instruction and click Generate.
                  </p>
                ) : (
                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    rows={10}
                    className="mt-2 w-full resize-none rounded-xl border border-border bg-background p-4 text-sm leading-relaxed focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                )}
              </div>
            </main>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 2: Verify types + lint**

Run: `npx tsc --noEmit`
Expected: clean.

Run: `npm run lint`
Expected: no new errors in `prompt-focus-view.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/components/nodes/prompt-focus-view.tsx
git commit -m "feat(stage2): add Prompt focus view (inputs + compiled prompt + generate)"
```

---

## Task 12: Prompt node

**Files:**
- Create: `src/components/nodes/prompt-node.tsx`
- Modify: `src/components/canvas/canvas.tsx`

- [ ] **Step 1: Write the Prompt node**

Create `src/components/nodes/prompt-node.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Sparkles } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { cn } from "@/lib/utils";
import { useCanvasStore } from "@/components/canvas/canvas-store-provider";
import { savePromptOutputAction } from "@/lib/actions/nodes";
import { PromptFocusView } from "./prompt-focus-view";
import { DEFAULT_PARSE_SLICES, type KBSliceKey } from "@/lib/kb/parse-context";

const TYPE_LABEL: Record<string, string> = { script: "Script", text: "Note", prompt: "Prompt", kb: "Brand KB" };

// Prompt node. A compact launcher; double-click / Open hands off to the Prompt
// focus view. The Inputs panel's connected-node list is derived from the store graph.
export function PromptNode({ id, data, selected }: NodeProps) {
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const upstream = useCanvasStore(
    useShallow((s) => {
      const sourceIds = s.edges.filter((e) => e.target === id).map((e) => e.source);
      return s.nodes
        .filter((n) => sourceIds.includes(n.id))
        .map((n) => ({ id: n.id, label: TYPE_LABEL[n.type ?? ""] ?? String(n.type) }));
    }),
  );

  const d = data as { title?: string; instruction?: string; parsed?: unknown; kbSlices?: KBSliceKey[] };
  const title = d.title ?? "";
  const instruction = d.instruction ?? "";
  const output = (d.parsed ?? null) as string | null;
  const slices = d.kbSlices ?? DEFAULT_PARSE_SLICES;
  const [focusOpen, setFocusOpen] = useState(false);

  return (
    <div
      onDoubleClick={(e) => {
        e.stopPropagation();
        setFocusOpen(true);
      }}
      className={cn(
        "w-44 rounded-lg border border-border bg-card shadow-card",
        "transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:scale-[1.006]",
        selected && "ring-2 ring-primary ring-offset-1 ring-offset-background",
      )}
    >
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex items-center gap-1.5">
          <Sparkles className="size-3.5 text-primary" />
          <span className="text-eyebrow !text-[0.65rem]">Prompt</span>
        </div>
        <span
          className={cn("size-1.5 rounded-full", output ? "bg-primary" : "bg-muted-foreground/40")}
          title={output ? "Generated" : "Not generated"}
        />
      </div>

      <div className="px-3 py-3">
        <p className="truncate font-display text-sm font-medium">
          {title || <span className="text-muted-foreground">Image prompt</span>}
        </p>
        <button
          onClick={() => setFocusOpen(true)}
          className="nodrag -mx-1.5 mt-3 inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
        >
          Open ↗
        </button>
      </div>

      <PromptFocusView
        open={focusOpen}
        onOpenChange={setFocusOpen}
        nodeId={id}
        title={title}
        instruction={instruction}
        output={output}
        slices={slices}
        upstream={upstream}
        onPatch={(patch) => updateNodeData(id, patch)}
        onSaveOutput={(o) => savePromptOutputAction(id, o)}
      />

      <Handle
        type="target"
        position={Position.Left}
        className="!size-2 !border-2 !border-card !bg-muted-foreground"
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!size-2 !border-2 !border-card !bg-primary"
      />
    </div>
  );
}
```

- [ ] **Step 2: Register it**

In `src/components/canvas/canvas.tsx`, add the import:

```ts
import { PromptNode } from "@/components/nodes/prompt-node";
```

and extend the registry to:

```ts
const nodeTypes: NodeTypes = { script: ScriptNode, kb: KBNode, text: TextNode, prompt: PromptNode };
```

- [ ] **Step 3: Verify types + lint**

Run: `npx tsc --noEmit`
Expected: clean.

Run: `npm run lint`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/nodes/prompt-node.tsx src/components/canvas/canvas.tsx
git commit -m "feat(stage2): add Prompt node card"
```

---

## Task 13: Node palette

**Files:**
- Modify: `src/components/canvas/canvas.tsx`

- [ ] **Step 1: Replace the single button with a palette**

In `src/components/canvas/canvas.tsx`, add imports:

```ts
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
```

Replace the toolbar block (the `<div className="absolute left-4 top-4 z-10">…</div>` containing the "Add script node" `<Button>`) with:

```tsx
      <div className="absolute left-4 top-4 z-10">
        <Popover>
          <PopoverTrigger
            render={
              <Button size="sm">
                <Plus className="size-4" /> Add node
              </Button>
            }
          />
          <PopoverContent align="start" className="w-44 gap-1 p-1">
            {([
              { type: "script", label: "Script" },
              { type: "text", label: "Note" },
              { type: "prompt", label: "Prompt" },
            ] as const).map((opt) => (
              <button
                key={opt.type}
                type="button"
                onClick={() => {
                  const position = {
                    x: 120 + Math.random() * 220,
                    y: 80 + Math.random() * 140,
                  };
                  const newNodeId = crypto.randomUUID();
                  addNode(opt.type, position, newNodeId);
                  // Script nodes auto-wire to the KB node if one exists (Stage 1 behavior).
                  if (opt.type === "script") {
                    const kbNode = nodes.find((n) => n.type === "kb");
                    if (kbNode) connectNodes(kbNode.id, newNodeId);
                  }
                }}
                className="w-full rounded-md px-2.5 py-1.5 text-left text-sm font-medium transition-colors hover:bg-muted"
              >
                {opt.label}
              </button>
            ))}
          </PopoverContent>
        </Popover>
      </div>
```

(The `nodes`, `addNode`, and `connectNodes` slices are already pulled from the store at the top of `Canvas`.)

- [ ] **Step 2: Verify types + lint**

Run: `npx tsc --noEmit`
Expected: clean.

Run: `npm run lint`
Expected: no new errors in `canvas.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/components/canvas/canvas.tsx
git commit -m "feat(stage2): node palette (Script / Note / Prompt)"
```

---

## Task 14: Full-suite check + manual end-to-end

- [ ] **Step 1: Run the whole unit suite + types + lint**

Run: `npm test`
Expected: PASS — Task 2, 4, 5 suites plus the pre-existing Stage-1 suites are green.

Run: `npx tsc --noEmit` then `npm run lint`
Expected: both clean.

- [ ] **Step 2: Manual end-to-end**

Run: `npm run dev`. Open a canvas for a client whose KB is `ready`.
1. **Add node → Note**; type some context (e.g. "Hero product: turmeric latte").
2. **Add node → Prompt**. Drag an edge from the Note's right handle to the Prompt's left handle.
3. Try dragging an edge **Prompt → Note** → it's rejected with the toast "That connection would create a loop."
4. Connect an existing **Script** node (with a parsed output) into the Prompt too.
5. Double-click the Prompt → focus view opens. The **Connected inputs** list shows "Note" and "Script". Toggle KB slices. The **Final compiled prompt** panel updates live and shows the brand-context + Note + Script blocks + instruction.
6. Type an instruction → click **Generate prompt** → skeleton → the generated image prompt appears in the editable area.
7. Edit the generated text → "Unsaved changes" badge + Save enable → **Save** → reopen shows the edit persisted (folded into the active version).
8. **Re-generate** → a fresh generation replaces it.
9. Reload the page → the Prompt node still shows its generated output (hydrated from the active version on canvas load).

- [ ] **Step 3: Final commit (if any manual fixes were needed)**

```bash
git add -A
git commit -m "test(stage2): manual e2e verification of the Prompt pipeline"
```

---

## Self-Review

**Spec coverage:**
- Functional edges — cycle check (Task 2 pure + Task 3 wiring), handles (Tasks 10, 12; Script already has both). ✅
- `getNodeOutput` selector (Approach A) — Task 4 (TDD). ✅
- `resolveInputs` (ambient KB + upstream via edges) — Tasks 6 (`getUpstreamOutputs`) + 7 (`resolvePromptInputs`). ✅
- Text node — Task 10. ✅
- Prompt node: `compilePrompt` (Task 5 TDD) + generate route (Task 9) + focus view (Task 11) + node card (Task 12); visible compiled prompt via compile-preview (Task 8). ✅
- Node palette — Task 13. ✅
- Records consumed upstream version ids in `inputs_used` (D9 foundation) — Task 9 route. ✅
- Deferred (File node, inline files, stale badge, history UI) — not in any task, by design. ✅

**Placeholder scan:** none — every code step is complete; every command has expected output.

**Type consistency:** `wouldCreateCycle(edges, source, target): boolean` (Task 2) matches its call in Task 3. `getNodeOutput({type,data,activeOutput})` (Task 4) matches calls in Task 7. `UpstreamOutput` (Task 6) feeds `resolvePromptInputs` (Task 7). `compilePrompt({clientContext, upstream, instruction})` (Task 5) matches Tasks 8 + 9. `resolvePromptInputs(nodeId, slices)` returning `{clientContext, kbVersionId, slices, upstream}` (Task 7) matches Tasks 8 + 9. `PromptFocusView` props (Task 11) match the render in Task 12. `savePromptOutputAction(nodeId, output)` (Task 9) matches Task 12. The generate/compile-preview request body `{ instruction, slices }` is consistent across Tasks 8, 9, 11.

**Note on `updateNodeData` widening:** Task 1 widens it to `Record<string, unknown>`; all existing callers (Script node passes `ScriptNodeData` partials) remain assignable, and the new Text/Prompt callers pass `{ text }` / `{ instruction, kbSlices, parsed }` — all valid.
