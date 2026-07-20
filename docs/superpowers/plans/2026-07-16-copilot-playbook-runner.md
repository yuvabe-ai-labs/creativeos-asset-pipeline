# Copilot Playbook Runner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the copilot execute complex commands ("generate an image reference for shot 2") as routed, slot-filled, interruptible playbook runs — per the approved spec [`../specs/2026-07-13-copilot-playbook-runner-design.md`](../specs/2026-07-13-copilot-playbook-runner-design.md).

**Architecture:** One new tool (`run_playbook`) on the existing actions route routes a sentence to a hardcoded playbook; client code checks the slot frame and elicits missing slots with authored questions (client-first resolution, model fallback); a client-side runner executes copilot steps via existing recipes and pauses on human steps, resuming when a pure predicate over the Zustand store goes true (level-triggered, Kubernetes-style). A run card in the chat panel renders the live checklist from store state.

**Tech Stack:** Next.js (App Router), React 19, Zustand (vanilla store via provider), `@xyflow/react`, OpenAI chat completions (tools), vitest, shadcn/Base UI components, Lucide icons.

**Working directory:** the git worktree `.claude/worktrees/minimal-agent` (branch `worktree-minimal-agent`). Every path below is relative to that worktree root. Run all commands from that directory.

## Global Constraints

- Every interactive control MUST be a shadcn primitive from `src/components/ui/*` (Base UI registry, `render` prop not `asChild`) — never a raw `<button>`, `<input>`, `<textarea>`, `<select>`.
- Icons: Lucide only, 1.5 stroke, no fills.
- Never hardcode colors — use the shadcn CSS variables / Tailwind tokens (`text-primary`, `border-border`, `bg-card`, `shadow-card`, `text-muted-foreground`).
- Import, don't redefine: `resolveMentions`/`nodeHandle` from `src/lib/nodes/describe-node.ts`; `resolveNodeTarget`/`planConnections`/`buildHistory` from `src/lib/copilot/actions.ts`; `canConnect` from `src/lib/canvas-nodes.ts`; `apiError`/`apiOk` from `src/lib/api/route-helpers.ts`.
- API routes use `apiError`/`apiOk`, never `NextResponse.json(...)`.
- Elicitation questions and human-step instructions are **authored strings in the playbook** — never model-generated (spec §8).
- The model never orders steps, never observes mid-run; code owns all sequencing (spec §3).
- One run at a time; cancelled runs keep created nodes (spec §2.3).
- Generation steps are ALWAYS human steps — the run never auto-fires a generation (spec §2.5).
- Tests: vitest, colocated `*.test.ts` next to the source file. Run one file: `npx vitest run <path>`. Run all: `npm test`.
- Type-check gate: `npx tsc --noEmit` must stay at 0 errors.
- Commit after every task (small, conventional-commit messages).

**Two intentional refinements over the spec (record in the task's commit message, not silently):**
1. Spec §2.1 typed `SlotSpec.kind` as `"node-handle" | "node-handles" | "none-ok"`. "none-ok" is not a value *shape* — it is orthogonal to it — so this plan models it as `kind: "node-handle" | "node-handles"` plus a `noneOk?: boolean` flag.
2. Spec §7 said runner wiring lives in `use-copilot-chat.ts`. That file is already ~350 lines; the runner engine goes in a sibling hook `src/components/canvas/use-playbook-runner.ts` (component-structure rule: split at ~200 lines, one responsibility per file), and `use-copilot-chat.ts` only *dispatches* to it.

---

### Task 1: Prep — wire Script + KB nodes to the shared `focusedNodeId` signal

The copilot's `open_node` (and the runner's `open` recipe) drive `setFocusedNodeId(id)`. File/Draw/Shot/Prompt/Image/Video nodes already subscribe; Script and KB never did (spec prep task, PRD §10.3). Copy the exact File-node pattern (`src/components/nodes/file-node.tsx:22-39`).

**Files:**
- Modify: `src/components/nodes/script-node.tsx`
- Modify: `src/components/nodes/kb-node.tsx`

**Interfaces:**
- Consumes: `useCanvasStore((s) => s.focusedNodeId)` / `s.setFocusedNodeId` from `src/components/canvas/canvas-store-provider`.
- Produces: `open_node`/runner `open(id)` now works for ALL 10 node types. No API change.

- [ ] **Step 1: Wire ScriptNode**

In `src/components/nodes/script-node.tsx`, add the two store reads next to the existing ones (after the `fanOutShots` line, ~line 24):

```tsx
  const focusedNodeId = useCanvasStore((s) => s.focusedNodeId);
  const setFocusedNodeId = useCanvasStore((s) => s.setFocusedNodeId);
```

Below the existing `const [focusOpen, setFocusOpen] = useState(false);` add:

```tsx
  // Open locally (double-click / "Open ↗") OR when the shared signal points here —
  // the Generation Tray, guided flow, or the copilot's open_node (setFocusedNodeId).
  const focusViewOpen = focusOpen || focusedNodeId === id;
  const handleFocusOpenChange = (next: boolean) => {
    setFocusOpen(next);
    if (!next && focusedNodeId === id) setFocusedNodeId(null); // consume the signal
  };
```

Change the `<ScriptFocusView>` props from `open={focusOpen} onOpenChange={setFocusOpen}` to:

```tsx
        open={focusViewOpen}
        onOpenChange={handleFocusOpenChange}
```

And in the `onFanOut` callback change `setFocusOpen(false);` to `handleFocusOpenChange(false);` (so fan-out also consumes the signal).

- [ ] **Step 2: Wire KBNode**

In `src/components/nodes/kb-node.tsx`, the KB surface is a `<Sheet open={open} onOpenChange={setOpen}>` inside `KBNode` (~line 300). Add to the imports: `useEffect` from react, and `useCanvasStore` from `@/components/canvas/canvas-store-provider`. Inside `KBNode` after `const [open, setOpen] = useState(false);`:

```tsx
  const focusedNodeId = useCanvasStore((s) => s.focusedNodeId);
  const setFocusedNodeId = useCanvasStore((s) => s.setFocusedNodeId);
  // Open locally OR when the shared focus signal points here (copilot open_node).
  const sheetOpen = open || focusedNodeId === id;
  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next && focusedNodeId === id) setFocusedNodeId(null); // consume the signal
  };
```

The sheet content fetch is normally primed by hover/double-click; a signal-open must prime it too:

```tsx
  // A signal-driven open skips hover/double-click, so prime the fetch here.
  useEffect(() => {
    if (sheetOpen) prefetch();
  }, [sheetOpen]);
```

(`prefetch` is already idempotent via `fetchedRef` — see kb-node.tsx:242.) Move the `function prefetch()` declaration ABOVE the `useEffect` if TS complains about use-before-declaration (it's a function declaration, so hoisting makes this optional).

Change `<Sheet open={open} onOpenChange={setOpen}>` to `<Sheet open={sheetOpen} onOpenChange={handleOpenChange}>` and change the `{open && (` guard around `KBSheetContent` to `{sheetOpen && (`.

- [ ] **Step 3: Type-check and run the suite**

Run: `npx tsc --noEmit` — Expected: 0 errors.
Run: `npm test` — Expected: all tests pass (470+, none touch these components).

- [ ] **Step 4: Manual browser check**

`npm run dev` → open a canvas that has a Script and a KB node → copilot → "open @SCR-XXXX" (use the real handle shown on the card) → the Script focus view opens and the canvas pans to it. Close it; repeat for the KB node (its sheet opens with content, not a skeleton stuck loading). Re-open each node manually by double-click afterwards to confirm local open still works.

- [ ] **Step 5: Commit**

```powershell
git add src/components/nodes/script-node.tsx src/components/nodes/kb-node.tsx
git commit -m "feat(copilot): wire script + kb nodes to the shared focusedNodeId signal"
```

---

### Task 2: Prep — add `file` + `draw` to `ADDABLE_NODE_TYPES`

Second spec prep task (PRD §10.3). `defaultData()` in `src/lib/canvas-store.ts:66-86` already seeds both types (`file` → `{ title: "" }`, `draw` → `{ title: "" }`), and both have upload/draw affordances inside their focus views — a bare `add_node` is now meaningful.

**Files:**
- Modify: `src/app/api/copilot/actions/route.ts:13-23`

**Interfaces:**
- Produces: `add_node` accepts `type: "file" | "draw"` in addition to the existing six. No signature change.

- [ ] **Step 1: Update the constant + its comment**

In `src/app/api/copilot/actions/route.ts` replace lines 13–23 with:

```ts
// Node types the copilot may add. A curated, additive subset — the types whose
// creation is a plain addNode(type). file/draw open their editors on create, so the
// user lands in the upload/draw surface. kb/shot stay excluded (they need context —
// a client KB, a parsed script — a bare "add" can't supply).
const ADDABLE_NODE_TYPES = [
  "text",
  "script",
  "prompt",
  "image-gen",
  "video-prompt",
  "video-gen",
  "file",
  "draw",
] as const;
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit` — Expected: 0 errors.

- [ ] **Step 3: Manual browser check**

Copilot → "add a file node" → a File node appears at viewport center and its focus view (upload surface) opens. Same for "add a draw node".

- [ ] **Step 4: Commit**

```powershell
git add src/app/api/copilot/actions/route.ts
git commit -m "feat(copilot): allow add_node to create file and draw nodes"
```

---

### Task 3: `playbooks.ts` — types, the `image-for-shot` playbook, registry

The playbook is DATA in client code — the flowchart drawn in advance (spec §2.1). This file must stay server-importable (the actions route reads the registry for its tool enum): no React, no store imports; `AppNode` and `Edge` are type-only, `nodeHandle`/`resolveNodeTarget` are pure.

**Files:**
- Create: `src/lib/copilot/playbooks.ts`
- Test: `src/lib/copilot/playbooks.test.ts`

**Interfaces:**
- Consumes: `nodeHandle` from `@/lib/nodes/describe-node`; `type AppNode` from `@/lib/canvas-nodes`; `type Edge` from `@xyflow/react`.
- Produces (used by Tasks 4–9):
  - `type CanvasSnapshot = { nodes: AppNode[]; edges: Edge[] }`
  - `type SlotValue = string | string[]`
  - `type SlotSpec = { key: string; required: boolean; kind: "node-handle" | "node-handles"; noneOk?: boolean; ask: string; infer?: (snap: CanvasSnapshot) => SlotValue | null; unanswerable?: (snap: CanvasSnapshot) => string | null }`
  - `type RunRecipes = { createNode(type: string, position: {x:number;y:number}, title?: string): string; connect(fromHandles: string[], toHandle: string): { wired: string[]; rejected: string[]; unknown: string[] }; open(id: string): void }`
  - `type RunSnapshot = { slots: Record<string, SlotValue>; created: Record<string, string> }`
  - `type RunContext = RunSnapshot & { remember(key: string, id: string): void; resolve(handle: string): AppNode | null; node(id: string): AppNode | null; recipes: RunRecipes }`
  - `type PlaybookStep` (copilot variant: `{ actor: "copilot"; label: string; run(ctx: RunContext): string }` — the returned string is the past-tense "✓" line; human variant: `{ actor: "human"; label: string; instruction: string; done(snap: CanvasSnapshot, run: RunSnapshot): boolean; watchId(run: RunSnapshot): string | undefined }`)
  - `type Playbook = { name: string; description: string; title(slots: Record<string, SlotValue>): string; slots: SlotSpec[]; steps: PlaybookStep[] }`
  - `const imageForShot: Playbook`, `const PLAYBOOKS: Record<string, Playbook>`, `const PLAYBOOK_NAMES: string[]`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/copilot/playbooks.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { imageForShot, PLAYBOOKS, PLAYBOOK_NAMES, type RunContext } from "./playbooks";
import { resolveNodeTarget } from "./actions";
import { nodeHandle } from "@/lib/nodes/describe-node";
import type { AppNode } from "@/lib/canvas-nodes";
import type { CanvasSnapshot, SlotValue } from "./playbooks";

const n = (id: string, type: string, data: Record<string, unknown> = {}, x = 0, y = 0): AppNode =>
  ({ id, type, position: { x, y }, data }) as AppNode;
const snap = (nodes: AppNode[]): CanvasSnapshot => ({ nodes, edges: [] });

// A recording RunContext: recipes append to `calls`, remember writes `created`.
function fakeCtx(
  nodes: AppNode[],
  slots: Record<string, SlotValue>,
  created: Record<string, string> = {},
) {
  const calls = {
    created: [] as { type: string; position: { x: number; y: number } }[],
    connects: [] as { from: string[]; to: string }[],
    opened: [] as string[],
  };
  let seq = 0;
  const ctx: RunContext = {
    slots,
    created,
    remember: (k, id) => {
      created[k] = id;
    },
    resolve: (h) => resolveNodeTarget(nodes, h),
    node: (id) => nodes.find((x) => x.id === id) ?? null,
    recipes: {
      createNode: (type, position) => {
        calls.created.push({ type, position });
        return `made${seq++}xxx`; // handle-able: nodeHandle slices id chars
      },
      connect: (from, to) => {
        calls.connects.push({ from, to });
        return { wired: from, rejected: [], unknown: [] };
      },
      open: (id) => {
        calls.opened.push(id);
      },
    },
  };
  return { ctx, calls, created };
}

describe("registry", () => {
  it("exposes image-for-shot", () => {
    expect(PLAYBOOK_NAMES).toContain("image-for-shot");
    expect(PLAYBOOKS["image-for-shot"]).toBe(imageForShot);
  });
});

describe("image-for-shot slots", () => {
  const shotSlot = imageForShot.slots.find((s) => s.key === "shot")!;
  const refsSlot = imageForShot.slots.find((s) => s.key === "refs")!;

  it("shot is required and single; refs is multi and none-ok", () => {
    expect(shotSlot.required).toBe(true);
    expect(shotSlot.kind).toBe("node-handle");
    expect(refsSlot.kind).toBe("node-handles");
    expect(refsSlot.noneOk).toBe(true);
  });

  it("asks name the expected input format (copy discipline, spec §8)", () => {
    expect(shotSlot.ask).toContain("@");
    expect(refsSlot.ask.toLowerCase()).toContain("none");
  });

  it("infers the shot when exactly one shot exists (Ask-when-Needed)", () => {
    const one = n("aaaa1111-0000-0000-0000-000000000000", "shot");
    expect(shotSlot.infer!(snap([one, n("f1", "file")]))).toBe(nodeHandle(one));
    expect(shotSlot.infer!(snap([one, n("bbbb2222-0000-0000-0000-000000000000", "shot")]))).toBeNull();
  });

  it("shot is unanswerable on a shotless canvas, with a helpful message", () => {
    expect(shotSlot.unanswerable!(snap([n("f1", "file")]))).toMatch(/no shots/i);
    expect(shotSlot.unanswerable!(snap([n("s1", "shot")]))).toBeNull();
  });

  it("titles the run with the shot handle", () => {
    expect(imageForShot.title({ shot: "SHOT-1A2B" })).toBe("Image for SHOT-1A2B");
  });
});

describe("image-for-shot steps", () => {
  const shot = n("aaaa1111-0000-0000-0000-000000000000", "shot", {}, 100, 200);
  const shotH = nodeHandle(shot); // SHOT-AAAA
  const file = n("cccc3333-0000-0000-0000-000000000000", "file");
  const fileH = nodeHandle(file); // FILE-CCCC

  it("has the human generation gates at steps 4 and 6 (1-based)", () => {
    expect(imageForShot.steps.map((s) => s.actor)).toEqual([
      "copilot", "copilot", "copilot", "human", "copilot", "human",
    ]);
  });

  it("step 1 creates a prompt node right of the shot and remembers its id", () => {
    const { ctx, calls, created } = fakeCtx([shot, file], { shot: shotH, refs: [fileH] });
    const line = (imageForShot.steps[0] as { run: (c: RunContext) => string }).run(ctx);
    expect(calls.created).toEqual([{ type: "prompt", position: { x: 480, y: 200 } }]);
    expect(created.promptNodeId).toBe("made0xxx");
    expect(line).toContain("PRM-");
  });

  it("step 1 throws when the shot has vanished (run-time abort, spec §4)", () => {
    const { ctx } = fakeCtx([file], { shot: shotH, refs: [] });
    expect(() => (imageForShot.steps[0] as { run: (c: RunContext) => string }).run(ctx)).toThrow(/SHOT-AAAA/);
  });

  it("step 2 connects shot + refs into the created prompt node", () => {
    const { ctx, calls } = fakeCtx([shot, file], { shot: shotH, refs: [fileH] }, { promptNodeId: "dddd4444-0000-0000-0000-000000000000" });
    const line = (imageForShot.steps[1] as { run: (c: RunContext) => string }).run(ctx);
    expect(calls.connects).toEqual([{ from: [shotH, fileH], to: "PRM-DDDD" }]);
    expect(line).toContain("PRM-DDDD");
  });

  it("step 3 opens the prompt editor", () => {
    const { ctx, calls } = fakeCtx([shot], { shot: shotH, refs: [] }, { promptNodeId: "p1" });
    (imageForShot.steps[2] as { run: (c: RunContext) => string }).run(ctx);
    expect(calls.opened).toEqual(["p1"]);
  });

  it("step 4 done() is a level-triggered read of the prompt node's parsed", () => {
    const step = imageForShot.steps[3] as Extract<(typeof imageForShot.steps)[number], { actor: "human" }>;
    const run = { slots: {}, created: { promptNodeId: "p1" } };
    expect(step.done(snap([n("p1", "prompt", {})]), run)).toBe(false);
    expect(step.done(snap([n("p1", "prompt", { parsed: "  " })]), run)).toBe(false);
    expect(step.done(snap([n("p1", "prompt", { parsed: "a cinematic close-up" })]), run)).toBe(true);
    expect(step.watchId(run)).toBe("p1");
  });

  it("step 5 creates + wires + opens the image node in one step", () => {
    const prompt = n("dddd4444-0000-0000-0000-000000000000", "prompt", {}, 480, 200);
    const { ctx, calls, created } = fakeCtx([shot, file, prompt], { shot: shotH, refs: [fileH] }, { promptNodeId: prompt.id });
    const line = (imageForShot.steps[4] as { run: (c: RunContext) => string }).run(ctx);
    expect(calls.created).toEqual([{ type: "image-gen", position: { x: 860, y: 200 } }]);
    expect(created.imageNodeId).toBe("made0xxx");
    expect(calls.connects[0].from).toEqual(["PRM-DDDD", fileH]);
    expect(calls.opened).toEqual(["made0xxx"]);
    expect(line).toContain("IMG-");
  });

  it("step 6 done() reads the image node's parsed; watches it", () => {
    const step = imageForShot.steps[5] as Extract<(typeof imageForShot.steps)[number], { actor: "human" }>;
    const run = { slots: {}, created: { imageNodeId: "i1" } };
    expect(step.done(snap([n("i1", "image-gen", {})]), run)).toBe(false);
    expect(step.done(snap([n("i1", "image-gen", { parsed: "https://x/y.png" })]), run)).toBe(true);
    expect(step.watchId(run)).toBe("i1");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/copilot/playbooks.test.ts`
Expected: FAIL — `Cannot find module './playbooks'`.

- [ ] **Step 3: Implement `src/lib/copilot/playbooks.ts`**

```ts
import type { Edge } from "@xyflow/react";
import type { AppNode } from "@/lib/canvas-nodes";
import { nodeHandle } from "@/lib/nodes/describe-node";

// A playbook is a HARDCODED step list — the flowchart drawn in advance (runner spec
// §2.1). The model routes a sentence to one and extracts slot values; code owns
// everything after that. This file is pure data + pure functions, importable from
// BOTH the client runner and the server actions route (tool enum + descriptions).

export type CanvasSnapshot = { nodes: AppNode[]; edges: Edge[] };
export type SlotValue = string | string[];

export type SlotSpec = {
  key: string; // "shot", "refs"
  required: boolean;
  kind: "node-handle" | "node-handles";
  noneOk?: boolean; // "none"/"skip" is a valid answer → fills [] (refs-style slots)
  // The authored elicitation question (Dialogflow-style) — always names the expected
  // input format (@SHOT-…, @selected, "none"). Never model-generated (spec §8).
  ask: string;
  // Ask-when-Needed: auto-fill when the canvas makes the answer unambiguous
  // (one shot on canvas → it's the shot). Return null to keep asking.
  infer?: (snap: CanvasSnapshot) => SlotValue | null;
  // A required slot no answer can satisfy (no shots exist at all) → cancel the
  // elicitation up front with this message instead of asking a dead question.
  unanswerable?: (snap: CanvasSnapshot) => string | null;
};

export type RunRecipes = {
  // Create a node, return its id. Does NOT open it — opening is its own verb.
  createNode: (type: string, position: { x: number; y: number }, title?: string) => string;
  // Wire each source handle → the target handle (canConnect-validated by the recipe).
  connect: (
    fromHandles: string[],
    toHandle: string,
  ) => { wired: string[]; rejected: string[]; unknown: string[] };
  // Pan to the node and open its surface via the shared focusedNodeId signal.
  open: (id: string) => void;
};

// What a predicate may read: the run's filled slots + the ids earlier steps created.
export type RunSnapshot = {
  slots: Record<string, SlotValue>;
  created: Record<string, string>;
};

// What a copilot step's run() receives: the run snapshot plus injected effects.
// Steps never import the store — the runner hands them these capabilities.
export type RunContext = RunSnapshot & {
  remember: (key: string, id: string) => void; // write into created (read by later steps)
  resolve: (handle: string) => AppNode | null; // handle → live node
  node: (id: string) => AppNode | null; // id → live node
  recipes: RunRecipes;
};

export type PlaybookStep =
  | {
      actor: "copilot";
      label: string;
      // Executes the step via ctx.recipes and returns the past-tense "✓" line for the
      // run card (with real handles). Throwing aborts the run with the error message.
      run: (ctx: RunContext) => string;
    }
  | {
      actor: "human";
      label: string;
      instruction: string; // the "YOUR TURN — …" copy posted to chat + shown on the card
      // The "eyes" (P6): a PURE, CHEAP predicate over current store state — never
      // history. Runs on every store change while this step waits, so keep it O(nodes).
      done: (snap: CanvasSnapshot, run: RunSnapshot) => boolean;
      // The node id the predicate depends on; if it disappears mid-wait the runner
      // cancels the run (spec §4 "node deleted mid-run").
      watchId: (run: RunSnapshot) => string | undefined;
    };

export type Playbook = {
  name: string;
  description: string; // shown to the router model in the tool description
  title: (slots: Record<string, SlotValue>) => string; // run-card header
  slots: SlotSpec[];
  steps: PlaybookStep[];
};

// Slot-value accessors — slots arrive as string | string[] from the model.
const first = (v: SlotValue | undefined): string => (Array.isArray(v) ? (v[0] ?? "") : (v ?? ""));
const many = (v: SlotValue | undefined): string[] => (Array.isArray(v) ? v : v ? [v] : []);

// "Has this node produced output?" — data.parsed is the active version's output
// (D19), so a non-empty parsed IS "the human generated" in store terms.
function hasOutput(node: AppNode | undefined): boolean {
  const parsed = (node?.data as { parsed?: unknown } | undefined)?.parsed;
  if (parsed == null) return false;
  return typeof parsed === "string" ? parsed.trim().length > 0 : true;
}

// Column offset between pipeline stages — matches fanOutShots' x + 360 rhythm,
// slightly wider so the new node never overlaps its source's card.
const STAGE_X = 380;

// v1's ONE playbook — the §8.4 lane slice: shot → prompt → (human generates prompt)
// → image node → (human generates image). Generation steps are HUMAN steps — the
// L6 HITL gate lands as a pause, never an auto-fire (spec §2.5).
export const imageForShot: Playbook = {
  name: "image-for-shot",
  description:
    "Produce an image reference for one shot: adds a prompt node wired from the shot " +
    "(plus any reference images), waits for the human to write + generate the prompt, " +
    "then adds an image node wired from the prompt and waits for the human to generate.",
  title: (slots) => `Image for ${first(slots.shot) || "a shot"}`,
  slots: [
    {
      key: "shot",
      required: true,
      kind: "node-handle",
      ask: "Which shot? Mention it like @SHOT-1A2B — or select it on the canvas and say @selected.",
      infer: (snap) => {
        const shots = snap.nodes.filter((n) => n.type === "shot");
        return shots.length === 1 ? nodeHandle(shots[0]) : null;
      },
      unanswerable: (snap) =>
        snap.nodes.some((n) => n.type === "shot")
          ? null
          : "There are no shots on this canvas yet — parse a script first, then ask me again.",
    },
    {
      key: "refs",
      required: true,
      kind: "node-handles",
      noneOk: true,
      ask:
        "Any reference images to attach? Mention File or Draw nodes like @FILE-08F1, " +
        'select them and say @selected — or say "none".',
    },
  ],
  steps: [
    {
      actor: "copilot",
      label: "Add the prompt node",
      run: (ctx) => {
        const shotHandle = first(ctx.slots.shot);
        const shot = ctx.resolve(shotHandle);
        if (!shot) throw new Error(`I can't find ${shotHandle} anymore.`);
        const id = ctx.recipes.createNode("prompt", {
          x: shot.position.x + STAGE_X,
          y: shot.position.y,
        });
        ctx.remember("promptNodeId", id);
        return `Added prompt node ${nodeHandle({ id, type: "prompt" })}`;
      },
    },
    {
      actor: "copilot",
      label: "Connect the shot and references",
      run: (ctx) => {
        const promptHandle = nodeHandle({ id: ctx.created.promptNodeId, type: "prompt" });
        const sources = [first(ctx.slots.shot), ...many(ctx.slots.refs)];
        const plan = ctx.recipes.connect(sources, promptHandle);
        if (plan.wired.length === 0)
          throw new Error(`I couldn't connect anything to ${promptHandle}.`);
        return `Connected ${plan.wired.join(", ")} → ${promptHandle}`;
      },
    },
    {
      actor: "copilot",
      label: "Open the prompt editor",
      run: (ctx) => {
        ctx.recipes.open(ctx.created.promptNodeId);
        return "Opened the prompt editor";
      },
    },
    {
      actor: "human",
      label: "Prompt generated",
      instruction:
        "YOUR TURN — write the instruction in the prompt editor and hit Generate. " +
        "I'll continue when the prompt is ready.",
      done: (snap, run) => hasOutput(snap.nodes.find((n) => n.id === run.created.promptNodeId)),
      watchId: (run) => run.created.promptNodeId,
    },
    {
      actor: "copilot",
      label: "Create the image node",
      run: (ctx) => {
        const prompt = ctx.node(ctx.created.promptNodeId);
        if (!prompt) throw new Error("The prompt node disappeared mid-run.");
        const id = ctx.recipes.createNode("image-gen", {
          x: prompt.position.x + STAGE_X,
          y: prompt.position.y,
        });
        ctx.remember("imageNodeId", id);
        const imgHandle = nodeHandle({ id, type: "image-gen" });
        const promptHandle = nodeHandle({ id: prompt.id, type: "prompt" });
        const plan = ctx.recipes.connect([promptHandle, ...many(ctx.slots.refs)], imgHandle);
        ctx.recipes.open(id);
        return `Created image node ${imgHandle} and wired ${plan.wired.join(", ")}`;
      },
    },
    {
      actor: "human",
      label: "Image generated",
      instruction:
        "YOUR TURN — review the prompt and hit Generate when you're ready. " +
        "Generation costs money, so this step is yours.",
      done: (snap, run) => hasOutput(snap.nodes.find((n) => n.id === run.created.imageNodeId)),
      watchId: (run) => run.created.imageNodeId,
    },
  ],
};

// The registry the router + runner share. More playbooks are DATA additions here —
// no router/frame/runner changes (spec §2.1).
export const PLAYBOOKS: Record<string, Playbook> = {
  [imageForShot.name]: imageForShot,
};

export const PLAYBOOK_NAMES = Object.keys(PLAYBOOKS);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/copilot/playbooks.test.ts`
Expected: PASS (14 tests). Also run `npx tsc --noEmit` — 0 errors.

- [ ] **Step 5: Commit**

```powershell
git add src/lib/copilot/playbooks.ts src/lib/copilot/playbooks.test.ts
git commit -m "feat(copilot): playbook types, registry, and the image-for-shot playbook"
```

---

### Task 4: `runner.ts` — frame completeness, inference, reply resolution, advance

All pure functions (spec §5): given values in, values out — no store, no fetch, no React.

**Files:**
- Create: `src/lib/copilot/runner.ts`
- Test: `src/lib/copilot/runner.test.ts`

**Interfaces:**
- Consumes: `resolveMentions`, `nodeHandle` from `@/lib/nodes/describe-node`; types from `./playbooks`.
- Produces (used by Tasks 5–8):
  - `type PlaybookRun = { playbook: string; title: string; slots: Record<string, SlotValue>; created: Record<string, string>; stepIndex: number; status: "eliciting" | "running" | "waiting-human" | "done" | "cancelled"; askingSlot?: string; reasked?: boolean; log: string[] }`
  - `missingSlots(playbook: Playbook, slots: Record<string, SlotValue>): SlotSpec[]`
  - `applyInference(playbook: Playbook, slots: Record<string, SlotValue>, snap: CanvasSnapshot): Record<string, SlotValue>`
  - `resolveSlotReply(text: string, slot: SlotSpec, nodes: AppNode[]): { kind: "filled"; value: SlotValue } | { kind: "model" }`
  - `nextAction(playbook: Playbook, run: PlaybookRun): { kind: "run-step"; step: … } | { kind: "wait-human"; step: … } | { kind: "done" }`
  - `normalizeSlots(raw: unknown): Record<string, SlotValue>`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/copilot/runner.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  missingSlots,
  applyInference,
  resolveSlotReply,
  nextAction,
  normalizeSlots,
  type PlaybookRun,
} from "./runner";
import { imageForShot } from "./playbooks";
import { nodeHandle } from "@/lib/nodes/describe-node";
import type { AppNode } from "@/lib/canvas-nodes";

const n = (id: string, type: string): AppNode =>
  ({ id, type, position: { x: 0, y: 0 }, data: {} }) as AppNode;

const baseRun = (over: Partial<PlaybookRun>): PlaybookRun => ({
  playbook: "image-for-shot",
  title: "Image for SHOT-AAAA",
  slots: {},
  created: {},
  stepIndex: 0,
  status: "running",
  log: [],
  ...over,
});

describe("missingSlots", () => {
  it("lists required slots with no value, in playbook order", () => {
    expect(missingSlots(imageForShot, {}).map((s) => s.key)).toEqual(["shot", "refs"]);
    expect(missingSlots(imageForShot, { shot: "SHOT-1A2B" }).map((s) => s.key)).toEqual(["refs"]);
  });
  it("an empty array IS a value ('none' was the answer)", () => {
    expect(missingSlots(imageForShot, { shot: "SHOT-1A2B", refs: [] })).toEqual([]);
  });
});

describe("applyInference", () => {
  const shot = n("aaaa1111-0000-0000-0000-000000000000", "shot");
  it("fills an inferable slot (one shot on canvas → it's the shot)", () => {
    const out = applyInference(imageForShot, {}, { nodes: [shot], edges: [] });
    expect(out.shot).toBe(nodeHandle(shot));
  });
  it("does not override a provided value and does not infer when ambiguous", () => {
    const two = [shot, n("bbbb2222-0000-0000-0000-000000000000", "shot")];
    expect(applyInference(imageForShot, { shot: "SHOT-BBBB" }, { nodes: two, edges: [] }).shot).toBe("SHOT-BBBB");
    expect(applyInference(imageForShot, {}, { nodes: two, edges: [] }).shot).toBeUndefined();
  });
});

describe("resolveSlotReply", () => {
  const shotSlot = imageForShot.slots[0];
  const refsSlot = imageForShot.slots[1];
  const shot = n("aaaa1111-0000-0000-0000-000000000000", "shot");
  const file = n("cccc3333-0000-0000-0000-000000000000", "file");
  const draw = n("dddd4444-0000-0000-0000-000000000000", "draw");

  it("resolves an @-mention client-side — zero model calls", () => {
    const h = nodeHandle(shot);
    expect(resolveSlotReply(`use @${h}`, shotSlot, [shot])).toEqual({ kind: "filled", value: h });
  });
  it("collects multiple mentions for a multi slot", () => {
    const reply = `@${nodeHandle(file)} and @${nodeHandle(draw)}`;
    expect(resolveSlotReply(reply, refsSlot, [file, draw])).toEqual({
      kind: "filled",
      value: [nodeHandle(file), nodeHandle(draw)],
    });
  });
  it('"none"/"skip"/"nothing" fills a none-ok slot with []', () => {
    for (const word of ["none", "None.", " skip ", "nothing"]) {
      expect(resolveSlotReply(word, refsSlot, [])).toEqual({ kind: "filled", value: [] });
    }
  });
  it('"none" on a NOT-none-ok slot falls through to the model', () => {
    expect(resolveSlotReply("none", shotSlot, [])).toEqual({ kind: "model" });
  });
  it("free text falls through to the model", () => {
    expect(resolveSlotReply("the one with the coffee cup", refsSlot, [file])).toEqual({ kind: "model" });
  });
});

describe("nextAction", () => {
  it("copilot step → run-step; human step → wait-human; past the end → done", () => {
    expect(nextAction(imageForShot, baseRun({ stepIndex: 0 })).kind).toBe("run-step");
    expect(nextAction(imageForShot, baseRun({ stepIndex: 3 })).kind).toBe("wait-human");
    expect(nextAction(imageForShot, baseRun({ stepIndex: 6 })).kind).toBe("done");
  });
});

describe("normalizeSlots", () => {
  it("keeps trimmed strings and string arrays, drops junk", () => {
    expect(
      normalizeSlots({ shot: " SHOT-1A2B ", refs: [" FILE-08F1", 3, ""], n: 42, o: {}, e: "  " }),
    ).toEqual({ shot: "SHOT-1A2B", refs: ["FILE-08F1"] });
  });
  it("returns {} for non-objects", () => {
    expect(normalizeSlots(null)).toEqual({});
    expect(normalizeSlots("x")).toEqual({});
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/copilot/runner.test.ts`
Expected: FAIL — `Cannot find module './runner'`.

- [ ] **Step 3: Implement `src/lib/copilot/runner.ts`**

```ts
import type { AppNode } from "@/lib/canvas-nodes";
import { nodeHandle, resolveMentions } from "@/lib/nodes/describe-node";
import type { CanvasSnapshot, Playbook, PlaybookStep, SlotSpec, SlotValue } from "./playbooks";

// The pure half of the playbook runner (spec §2.3, §5): frame completeness,
// slot inference, elicitation-reply resolution, and the advance decision — all
// functions of their inputs, unit-tested, no store/fetch/React anywhere.

// The checkpoint (P5): a small object in the canvas store. "Pause" is the cursor
// (stepIndex) not advancing; "resume" is a subscription firing.
export type PlaybookRun = {
  playbook: string;
  title: string; // card header, e.g. "Image for SHOT-557C"
  slots: Record<string, SlotValue>;
  created: Record<string, string>; // ids the run created ("promptNodeId", …)
  stepIndex: number;
  status: "eliciting" | "running" | "waiting-human" | "done" | "cancelled";
  askingSlot?: string; // slot key currently being elicited
  reasked?: boolean; // the one re-ask-with-format-hint already happened (spec §4)
  log: string[]; // past-tense "✓" lines for completed steps (with handles)
};

// Frame completeness is checked by CODE, not the model (spec §2.2). An empty
// array counts as filled — "none" was a real answer, not a missing one.
export function missingSlots(
  playbook: Playbook,
  slots: Record<string, SlotValue>,
): SlotSpec[] {
  return playbook.slots.filter((s) => s.required && slots[s.key] === undefined);
}

// Ask-when-Needed: fill what the canvas makes unambiguous; never override a
// value the user/model already provided.
export function applyInference(
  playbook: Playbook,
  slots: Record<string, SlotValue>,
  snap: CanvasSnapshot,
): Record<string, SlotValue> {
  const out = { ...slots };
  for (const spec of playbook.slots) {
    if (out[spec.key] === undefined && spec.infer) {
      const v = spec.infer(snap);
      if (v !== null) out[spec.key] = v;
    }
  }
  return out;
}

const NONE_RE = /^\s*(none|skip|nothing)\s*[.!]?\s*$/i;

// Client-first elicitation resolution (spec §2.2): @-mentions and "none" fill the
// slot with ZERO model calls; anything else defers to the actions-route fallback.
export function resolveSlotReply(
  text: string,
  slot: SlotSpec,
  nodes: AppNode[],
): { kind: "filled"; value: SlotValue } | { kind: "model" } {
  if (slot.noneOk && NONE_RE.test(text)) {
    return { kind: "filled", value: slot.kind === "node-handles" ? [] : "" };
  }
  const ids = resolveMentions(text, nodes);
  if (ids.length > 0) {
    const handles = ids.map((id) => nodeHandle(nodes.find((x) => x.id === id)!));
    return { kind: "filled", value: slot.kind === "node-handles" ? handles : handles[0] };
  }
  return { kind: "model" };
}

export type RunnerAction =
  | { kind: "run-step"; step: Extract<PlaybookStep, { actor: "copilot" }> }
  | { kind: "wait-human"; step: Extract<PlaybookStep, { actor: "human" }> }
  | { kind: "done" };

// The advance decision — what the cursor position means. The loop that ACTS on
// this (recipes, store writes) lives in use-playbook-runner.ts; this stays pure.
export function nextAction(playbook: Playbook, run: PlaybookRun): RunnerAction {
  const step = playbook.steps[run.stepIndex];
  if (!step) return { kind: "done" };
  return step.actor === "copilot"
    ? { kind: "run-step", step }
    : { kind: "wait-human", step };
}

// Defensive parse of model-written slot args (mirrors the route's arg guarding):
// keep non-empty trimmed strings and string arrays, drop everything else.
export function normalizeSlots(raw: unknown): Record<string, SlotValue> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, SlotValue> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === "string") {
      if (v.trim()) out[k] = v.trim();
    } else if (Array.isArray(v)) {
      const arr = v
        .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
        .map((x) => x.trim());
      if (arr.length) out[k] = arr;
    }
  }
  return out;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/copilot/runner.test.ts`
Expected: PASS (12 tests). `npx tsc --noEmit` — 0 errors.

- [ ] **Step 5: Commit**

```powershell
git add src/lib/copilot/runner.ts src/lib/copilot/runner.test.ts
git commit -m "feat(copilot): pure runner core — frame check, inference, reply resolution, advance"
```

---

### Task 5: Canvas-store slice — `playbookRun`

State lives in the canvas store (spec §2.3) so the panel, canvas, and future surfaces all see it, and the run survives the panel closing.

**Files:**
- Modify: `src/lib/canvas-store.ts`
- Test: `src/lib/canvas-store.test.ts` (append)

**Interfaces:**
- Consumes: `type PlaybookRun` from `@/lib/copilot/runner`.
- Produces (on `CanvasState`): `playbookRun: PlaybookRun | null`; `setPlaybookRun(run: PlaybookRun | null): void`; `patchPlaybookRun(patch: Partial<PlaybookRun>): void` (no-op when no run).

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/canvas-store.test.ts`:

```ts
import type { PlaybookRun } from "./copilot/runner";

describe("playbookRun slice", () => {
  const run: PlaybookRun = {
    playbook: "image-for-shot",
    title: "Image for SHOT-1A2B",
    slots: { shot: "SHOT-1A2B", refs: [] },
    created: {},
    stepIndex: 0,
    status: "running",
    log: [],
  };

  it("starts null; set/patch/clear round-trips", () => {
    const store = createCanvasStore([], []);
    expect(store.getState().playbookRun).toBeNull();
    store.getState().setPlaybookRun(run);
    store.getState().patchPlaybookRun({ status: "waiting-human", stepIndex: 3 });
    expect(store.getState().playbookRun).toMatchObject({ status: "waiting-human", stepIndex: 3 });
    store.getState().setPlaybookRun(null);
    expect(store.getState().playbookRun).toBeNull();
  });

  it("patch is a no-op when there is no run", () => {
    const store = createCanvasStore([], []);
    store.getState().patchPlaybookRun({ status: "cancelled" });
    expect(store.getState().playbookRun).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/canvas-store.test.ts`
Expected: FAIL — `setPlaybookRun` does not exist (TS error / runtime `not a function`).

- [ ] **Step 3: Implement the slice**

In `src/lib/canvas-store.ts`: add the import near the other type imports:

```ts
import type { PlaybookRun } from "@/lib/copilot/runner";
```

Add to the `CanvasState` type, after the `focusedNodeId` pair (~line 55):

```ts
  // Copilot playbook run (runner spec §2.3) — ONE run at a time, session-scoped.
  // Lives here (not in the chat hook) so the run card, canvas, and future surfaces
  // all read the same checkpoint and the run survives the panel closing.
  playbookRun: PlaybookRun | null;
  setPlaybookRun: (run: PlaybookRun | null) => void;
  patchPlaybookRun: (patch: Partial<PlaybookRun>) => void;
```

Add to the store implementation, after the `setFocusedNodeId` line (~line 343):

```ts
    playbookRun: null,
    setPlaybookRun: (run) => set({ playbookRun: run }),
    patchPlaybookRun: (patch) =>
      set((s) => (s.playbookRun ? { playbookRun: { ...s.playbookRun, ...patch } } : {})),
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/canvas-store.test.ts`
Expected: PASS (existing + 2 new). `npx tsc --noEmit` — 0 errors.

- [ ] **Step 5: Commit**

```powershell
git add src/lib/canvas-store.ts src/lib/canvas-store.test.ts
git commit -m "feat(copilot): playbookRun slice in the canvas store"
```

---

### Task 6: Actions route — the `run_playbook` tool + elicitation fallback

The route gains one tool whose enum + descriptions come from the registry, and an optional `elicit` request field for the model-fallback elicitation turn (spec §2.2). It guards and passes through, exactly like the existing five tools.

**Files:**
- Modify: `src/app/api/copilot/actions/route.ts`
- Modify: `src/lib/copilot/actions.ts` (the `CopilotAction` union)

**Interfaces:**
- Consumes: `PLAYBOOKS`, `PLAYBOOK_NAMES` from `@/lib/copilot/playbooks`; `normalizeSlots` from `@/lib/copilot/runner`.
- Produces:
  - `CopilotAction` gains `{ name: "run_playbook"; args: { name: string; slots: Record<string, string | string[]> } }`.
  - Request body gains optional `elicit?: { playbook: string; slotKey: string; question: string }`.

- [ ] **Step 1: Extend the `CopilotAction` union**

In `src/lib/copilot/actions.ts`, extend the union (lines 14–19) and its doc comment:

```ts
// - run_playbook       → "route this sentence to a multi-step playbook, slots as extracted"
export type CopilotAction =
  | { name: "add_node"; args: { type: string; title?: string } }
  | { name: "create_script_node"; args: { title?: string } }
  | { name: "parse_script"; args: { handle?: string } }
  | { name: "open_node"; args: { handle: string } }
  | { name: "connect_nodes"; args: { from: string[]; to: string } }
  | { name: "run_playbook"; args: { name: string; slots: Record<string, string | string[]> } };
```

(Add the `run_playbook` comment line to the existing comment block above the type; keep the other five lines.)

- [ ] **Step 2: Add the tool to the route**

In `src/app/api/copilot/actions/route.ts`, add imports:

```ts
import { PLAYBOOKS, PLAYBOOK_NAMES } from "@/lib/copilot/playbooks";
import { normalizeSlots } from "@/lib/copilot/runner";
```

Above the `const tools = [` array, build the slot schema from the registry (data-driven — new playbooks extend the tool without route edits):

```ts
// The run_playbook tool's slot schema is built FROM the registry: every registered
// playbook contributes its slot keys, typed by kind. The model fills only what the
// sentence provides; the client's frame check asks for the rest.
const playbookSlotProperties = Object.fromEntries(
  Object.values(PLAYBOOKS).flatMap((p) =>
    p.slots.map((s) => [
      s.key,
      s.kind === "node-handles"
        ? {
            type: "array" as const,
            items: { type: "string" as const },
            description: `Node handles for "${s.key}" (e.g. FILE-08F1), if the user named any.`,
          }
        : {
            type: "string" as const,
            description: `Node handle for "${s.key}" (e.g. SHOT-1A2B), if identifiable from the message + canvas.`,
          },
    ]),
  ),
);
```

Append to the `tools` array (after `connect_nodes`):

```ts
  {
    type: "function" as const,
    function: {
      name: "run_playbook",
      description:
        "Run a multi-step playbook for a COMPLEX request that needs several actions in " +
        "sequence. Available playbooks:\n" +
        Object.values(PLAYBOOKS)
          .map((p) => `- ${p.name}: ${p.description}`)
          .join("\n") +
        "\nExtract only the slot values the user's message actually provides (resolve " +
        "references like 'shot 2' to the handle using the canvas above) — leave missing " +
        "slots out; the client asks for them. Prefer the single-action tools for simple " +
        "one-step commands.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", enum: PLAYBOOK_NAMES },
          slots: {
            type: "object",
            properties: playbookSlotProperties,
            additionalProperties: false,
          },
        },
        required: ["name"],
        additionalProperties: false,
      },
    },
  },
```

- [ ] **Step 3: Accept the `elicit` field and add its system hint**

Widen the body type (line ~144-146):

```ts
  const body = (await req.json().catch(() => null)) as
    | {
        messages?: { role: "user" | "assistant"; content: string }[];
        canvasId?: string;
        mentionedIds?: string[];
        elicit?: { playbook?: string; slotKey?: string; question?: string };
      }
    | null;
```

After the `canvasContext` line, capture it:

```ts
  const elicit =
    body?.elicit?.playbook && body?.elicit?.slotKey && body?.elicit?.question
      ? { playbook: body.elicit.playbook, slotKey: body.elicit.slotKey, question: body.elicit.question }
      : null;
```

In the `messages` array of the completion call, append after the `canvasContext` system message:

```ts
        ...(elicit
          ? [
              {
                role: "system" as const,
                content:
                  `The user's latest message answers your question: "${elicit.question}". ` +
                  `Work out which node(s) on the canvas above it refers to and call run_playbook ` +
                  `with name "${elicit.playbook}" and ONLY the slot "${elicit.slotKey}" filled ` +
                  `with the handle(s). If the message doesn't identify any node, call no tool.`,
              },
            ]
          : []),
```

- [ ] **Step 4: Handle the tool call**

Widen the parsed-args type (line ~188):

```ts
    let args: {
      type?: string;
      title?: string;
      handle?: string;
      from?: string[];
      to?: string;
      name?: string;
      slots?: unknown;
    };
```

(and mirror the same fields in the `JSON.parse` cast below it). Add the handler before the final `return apiOk({ action: null });`:

```ts
    // run_playbook: guard the enum, defensively normalize the model-written slots,
    // and pass through — frame completeness is the CLIENT's job (spec §2.2).
    if (call.function.name === "run_playbook") {
      const name = args.name?.trim();
      if (!name || !PLAYBOOK_NAMES.includes(name)) return apiOk({ action: null });
      return apiOk({
        action: { name: "run_playbook" as const, args: { name, slots: normalizeSlots(args.slots) } },
      });
    }
```

- [ ] **Step 5: Type-check + full suite**

Run: `npx tsc --noEmit` — Expected: 0 errors.
Run: `npm test` — Expected: all pass (route has no unit tests; its pure guards live in runner.ts, already tested).

- [ ] **Step 6: Commit**

```powershell
git add src/app/api/copilot/actions/route.ts src/lib/copilot/actions.ts
git commit -m "feat(copilot): run_playbook router tool with registry-driven slots + elicit fallback"
```

---

### Task 7: `use-playbook-runner.ts` — the runner engine hook

The impure shell around Task 4's pure core: recipes (reusing the store's existing verbs), the advance loop (`tick`), the level-triggered subscription (the "eyes", P6), start/answer/cancel/dismiss. ~150 lines. It receives `say` (post an assistant chat message) from the chat hook — the runner never touches message state directly.

**Files:**
- Create: `src/components/canvas/use-playbook-runner.ts`

**Interfaces:**
- Consumes: `useCanvasStoreApi`, `useCanvasStore` from `./canvas-store-provider`; `useReactFlow` from `@xyflow/react`; `PLAYBOOKS` + types from `@/lib/copilot/playbooks`; `missingSlots`, `applyInference`, `resolveSlotReply`, `nextAction`, `type PlaybookRun` from `@/lib/copilot/runner`; `planConnections`, `resolveNodeTarget` from `@/lib/copilot/actions`; `nodeHandle` from `@/lib/nodes/describe-node`.
- Produces: `usePlaybookRunner(say: (text: string) => void)` returning:
  - `startPlaybook(name: string, slots: Record<string, SlotValue>): void`
  - `answerWithText(text: string): { kind: "filled" } | { kind: "model"; slot: SlotSpec } | { kind: "no-run" }`
  - `fillSlot(key: string, value: SlotValue): void`
  - `reaskOrWait(): void`
  - `cancelRun(): void`
  - `dismissRun(): void`

- [ ] **Step 1: Implement the hook**

Create `src/components/canvas/use-playbook-runner.ts`:

```ts
import { useEffect } from "react";
import { useReactFlow } from "@xyflow/react";
import { useCanvasStore, useCanvasStoreApi } from "./canvas-store-provider";
import { PLAYBOOKS, type RunContext, type SlotSpec, type SlotValue } from "@/lib/copilot/playbooks";
import {
  applyInference,
  missingSlots,
  nextAction,
  resolveSlotReply,
  type PlaybookRun,
} from "@/lib/copilot/runner";
import { planConnections, resolveNodeTarget } from "@/lib/copilot/actions";

const LIVE = new Set(["eliciting", "running", "waiting-human"]);

// The playbook runner's impure shell (runner spec §2.3): recipes over the store's
// existing verbs, the advance loop, and the level-triggered "eyes" (P6). The chat
// hook injects `say` so run narration lands in the transcript; the checkpoint
// itself lives in the canvas store (survives the panel closing).
export function usePlaybookRunner(say: (text: string) => void) {
  const storeApi = useCanvasStoreApi();
  const { setCenter } = useReactFlow();
  // Reactive read of ONLY the status — re-arms the subscription effect on pause/resume.
  const runStatus = useCanvasStore((s) => s.playbookRun?.status);

  // The step context: run snapshot + injected effects. `created`/`log` are the
  // tick loop's mutable locals; steps write created via remember().
  function makeCtx(
    slots: Record<string, SlotValue>,
    created: Record<string, string>,
  ): RunContext {
    const state = () => storeApi.getState();
    return {
      slots,
      created,
      remember: (k, id) => {
        created[k] = id;
      },
      resolve: (handle) => resolveNodeTarget(state().nodes, handle),
      node: (id) => state().nodes.find((x) => x.id === id) ?? null,
      recipes: {
        createNode: (type, position, title) => {
          const id = crypto.randomUUID();
          state().addNode(type, position, id);
          if (title) state().updateNodeData(id, { title });
          return id;
        },
        connect: (fromHandles, toHandle) => {
          const s = state();
          const plan = planConnections(fromHandles, toHandle, s.nodes);
          if (!plan.target) return { wired: [], rejected: [], unknown: fromHandles };
          plan.wired.forEach((w) => s.connectNodes(w.sourceId, plan.target!.id));
          return {
            wired: plan.wired.map((w) => w.handle),
            rejected: plan.rejected.map((r) => r.handle),
            unknown: plan.unknown,
          };
        },
        open: (id) => {
          const node = state().nodes.find((x) => x.id === id);
          if (node) setCenter(node.position.x + 120, node.position.y + 60, { zoom: 1, duration: 500 });
          state().setFocusedNodeId(id);
        },
      },
    };
  }

  // The advance loop (spec §2.3): run copilot steps until a human step or the end.
  // Deliberately synchronous — every recipe is a synchronous store write.
  function tick(start: PlaybookRun) {
    const playbook = PLAYBOOKS[start.playbook];
    if (!playbook) return;
    let stepIndex = start.stepIndex;
    const created = { ...start.created };
    const log = [...start.log];
    const publish = (status: PlaybookRun["status"]) =>
      storeApi.getState().setPlaybookRun({ ...start, stepIndex, created, log, status, askingSlot: undefined });

    for (;;) {
      const act = nextAction(playbook, { ...start, stepIndex, created, log });
      if (act.kind === "done") {
        publish("done");
        say(`✓ ${start.title} — done.`);
        return;
      }
      if (act.kind === "wait-human") {
        publish("waiting-human");
        say(act.step.instruction);
        return;
      }
      try {
        log.push(act.step.run(makeCtx(start.slots, created)));
        stepIndex += 1;
      } catch (e) {
        publish("cancelled");
        say(
          `I had to stop at "${act.step.label}": ` +
            `${e instanceof Error ? e.message : "something went wrong"} ` +
            `Anything I already created stays on the canvas.`,
        );
        return;
      }
    }
  }

  // The eyes (P6): active ONLY while waiting-human. The subscription is the wake-up
  // (edge); the predicate over CURRENT state is the decision (level). Missed or
  // duplicate wake-ups are harmless: advance re-checks status first (idempotent),
  // and the immediate check() catches the pre-completed step.
  useEffect(() => {
    if (runStatus !== "waiting-human") return;
    const check = () => {
      const state = storeApi.getState();
      const run = state.playbookRun;
      if (!run || run.status !== "waiting-human") return;
      const playbook = PLAYBOOKS[run.playbook];
      const step = playbook?.steps[run.stepIndex];
      if (!step || step.actor !== "human") return;
      const watched = step.watchId(run);
      if (watched && !state.nodes.some((n) => n.id === watched)) {
        state.patchPlaybookRun({ status: "cancelled" });
        say(`The node I was waiting on was deleted — cancelled "${run.title}".`);
        return;
      }
      if (step.done({ nodes: state.nodes, edges: state.edges }, run)) {
        say(`✓ ${step.label} — moving on.`);
        tick({ ...run, status: "running", stepIndex: run.stepIndex + 1, log: [...run.log, step.label] });
      }
    };
    check(); // level-triggered: the predicate may ALREADY be true on arrival
    return storeApi.subscribe(check);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runStatus]);

  // Route resolution → a run. Checks one-at-a-time, unanswerable slots, inference,
  // then either starts running or starts eliciting (spec §2.2).
  function startPlaybook(name: string, rawSlots: Record<string, SlotValue>) {
    const playbook = PLAYBOOKS[name];
    if (!playbook) return;
    const state = storeApi.getState();
    if (state.playbookRun && LIVE.has(state.playbookRun.status)) {
      say(
        `I'm mid-run on "${state.playbookRun.title}". Finish it, or say "cancel" ` +
          `(or hit ✕ on the card) to stop it first.`,
      );
      return;
    }
    const snap = { nodes: state.nodes, edges: state.edges };
    const slots = applyInference(playbook, rawSlots, snap);
    for (const spec of missingSlots(playbook, slots)) {
      const why = spec.unanswerable?.(snap);
      if (why) {
        say(why);
        return;
      }
    }
    const missing = missingSlots(playbook, slots);
    const base: PlaybookRun = {
      playbook: name,
      title: playbook.title(slots),
      slots,
      created: {},
      stepIndex: 0,
      status: "running",
      log: [],
    };
    if (missing.length > 0) {
      state.setPlaybookRun({ ...base, status: "eliciting", askingSlot: missing[0].key });
      say(missing[0].ask);
      return;
    }
    state.setPlaybookRun(base);
    tick(base);
  }

  // Client-first elicitation (spec §2.2): @-mentions / "none" fill with zero model
  // calls; { kind: "model" } tells the chat hook to run the actions-route fallback.
  function answerWithText(
    text: string,
  ): { kind: "filled" } | { kind: "model"; slot: SlotSpec } | { kind: "no-run" } {
    const state = storeApi.getState();
    const run = state.playbookRun;
    if (!run || run.status !== "eliciting" || !run.askingSlot) return { kind: "no-run" };
    const spec = PLAYBOOKS[run.playbook]?.slots.find((s) => s.key === run.askingSlot);
    if (!spec) return { kind: "no-run" };
    const res = resolveSlotReply(text, spec, state.nodes);
    if (res.kind === "model") return { kind: "model", slot: spec };
    fillSlot(spec.key, res.value);
    return { kind: "filled" };
  }

  // Fill one slot, then continue framing: ask the next missing slot, or start.
  function fillSlot(key: string, value: SlotValue) {
    const state = storeApi.getState();
    const run = state.playbookRun;
    if (!run || run.status !== "eliciting") return;
    const playbook = PLAYBOOKS[run.playbook];
    if (!playbook) return;
    const slots = { ...run.slots, [key]: value };
    const missing = missingSlots(playbook, slots);
    if (missing.length > 0) {
      state.setPlaybookRun({
        ...run,
        slots,
        title: playbook.title(slots),
        askingSlot: missing[0].key,
        reasked: false,
      });
      say(missing[0].ask);
      return;
    }
    const started: PlaybookRun = {
      ...run,
      slots,
      title: playbook.title(slots),
      status: "running",
      askingSlot: undefined,
    };
    state.setPlaybookRun(started);
    tick(started);
  }

  // Unresolvable reply: re-ask ONCE with the format hint, then keep waiting (spec §4).
  function reaskOrWait() {
    const state = storeApi.getState();
    const run = state.playbookRun;
    if (!run || run.status !== "eliciting" || !run.askingSlot) return;
    const spec = PLAYBOOKS[run.playbook]?.slots.find((s) => s.key === run.askingSlot);
    if (!spec) return;
    if (!run.reasked) {
      state.patchPlaybookRun({ reasked: true });
      say(`I couldn't spot a node in that. ${spec.ask}`);
    } else {
      say(`Still waiting on this one — ${spec.ask} (or say "cancel").`);
    }
  }

  // Cancel keeps created nodes — they're real work; delete is one click (spec §2.3).
  function cancelRun() {
    const state = storeApi.getState();
    const run = state.playbookRun;
    if (!run || !LIVE.has(run.status)) return;
    state.patchPlaybookRun({ status: "cancelled" });
    say(`Cancelled "${run.title}". Anything I already created stays on the canvas.`);
  }

  // Clear a finished/cancelled card from the panel.
  function dismissRun() {
    const run = storeApi.getState().playbookRun;
    if (run && !LIVE.has(run.status)) storeApi.getState().setPlaybookRun(null);
  }

  return { startPlaybook, answerWithText, fillSlot, reaskOrWait, cancelRun, dismissRun };
}
```

Note: `useCanvasStore` must be exported from `./canvas-store-provider` — it already is (every node component imports it). If the provider file exports it under a different name, adapt the import, not the provider.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit` — Expected: 0 errors. (Behavior is exercised in Task 8's browser check and Task 10's verification; the logic inside is already unit-tested at the pure layer.)

- [ ] **Step 3: Commit**

```powershell
git add src/components/canvas/use-playbook-runner.ts
git commit -m "feat(copilot): playbook runner engine — recipes, advance loop, level-triggered eyes"
```

---

### Task 8: Wire the runner into `use-copilot-chat.ts`

Three insertions into `send()`: (1) "cancel" while a run is live, (2) elicitation answers while `eliciting` (client-first, model fallback via the route's `elicit` field), (3) dispatch of a `run_playbook` action. Normal chat still works while a run waits on a human step.

**Files:**
- Modify: `src/components/canvas/use-copilot-chat.ts`

**Interfaces:**
- Consumes: `usePlaybookRunner` (Task 7), `normalizeSlots` from `@/lib/copilot/runner`, the widened `CopilotAction` (Task 6).
- Produces: `useCopilotChat` return gains `cancelRun: () => void` and `dismissRun: () => void` (for the panel/card in Task 9).

- [ ] **Step 1: Instantiate the runner in the hook**

In `src/components/canvas/use-copilot-chat.ts` add imports:

```ts
import { usePlaybookRunner } from "./use-playbook-runner";
import { normalizeSlots } from "@/lib/copilot/runner";
```

Inside `useCopilotChat`, after the `const { setCenter, screenToFlowPosition } = useReactFlow();` line:

```ts
  // Run narration (instructions, ✓ lines, cancellations) lands in the transcript
  // like any other assistant message.
  const say = (text: string) =>
    setMessages((m) => [...m, { role: "assistant" as const, content: text }]);
  const runner = usePlaybookRunner(say);
```

- [ ] **Step 2: Handle run-directed turns at the top of `send()`**

In `send()`, right AFTER the attachment short-circuit block (`if (attachment) { … return; }`), insert:

```ts
    // A live run owns some turns: "cancel" stops it; while ELICITING, the message is
    // the answer to the asked slot (client-first, model fallback — spec §2.2). While
    // waiting-human, ordinary chat/commands still work — the run just keeps watching.
    const liveRun = storeApi.getState().playbookRun;
    const runLive = !!liveRun && ["eliciting", "running", "waiting-human"].includes(liveRun.status);
    if (runLive && /^\s*(cancel|stop|abort)\s*[.!]?\s*$/i.test(text)) {
      setMessages((m) => [...m, { role: "user", content: text }]);
      runner.cancelRun();
      return;
    }
    if (liveRun?.status === "eliciting") {
      setMessages((m) => [...m, { role: "user", content: text }]);
      const answered = runner.answerWithText(text);
      if (answered.kind !== "model") return; // filled (or run vanished) — runner spoke
      // Model fallback: the actions route extracts the handle from a free-text reply.
      setThinking(true);
      try {
        const res = await fetch("/api/copilot/actions", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            messages: buildHistory(messages, text),
            canvasId,
            mentionedIds: [],
            elicit: {
              playbook: liveRun.playbook,
              slotKey: answered.slot.key,
              question: answered.slot.ask,
            },
          }),
        });
        const action = res.ok
          ? (((await res.json()) as { action?: CopilotAction | null }).action ?? null)
          : null;
        const value =
          action?.name === "run_playbook"
            ? normalizeSlots(action.args.slots)[answered.slot.key]
            : undefined;
        if (value !== undefined) runner.fillSlot(answered.slot.key, value);
        else runner.reaskOrWait();
      } catch {
        runner.reaskOrWait();
      } finally {
        setThinking(false);
      }
      return;
    }
```

- [ ] **Step 3: Dispatch `run_playbook` actions**

In the action-dispatch section of `send()` (with the other `if (action?.name === …)` blocks, before the prose fetch), add:

```ts
      // A COMPLEX command → route to a playbook run. startPlaybook handles the
      // one-run-at-a-time guard, unanswerable slots, inference, and elicitation.
      if (action?.name === "run_playbook") {
        runner.startPlaybook(action.args.name, action.args.slots);
        setThinking(false);
        return;
      }
```

- [ ] **Step 4: Return the run controls**

Change the hook's return to:

```ts
  return { messages, thinking, highlightNode, send, cancelRun: runner.cancelRun, dismissRun: runner.dismissRun };
```

- [ ] **Step 5: Type-check + suite**

Run: `npx tsc --noEmit` — 0 errors. `npm test` — all pass.

- [ ] **Step 6: Commit**

```powershell
git add src/components/canvas/use-copilot-chat.ts
git commit -m "feat(copilot): route complex commands to playbook runs; elicitation + cancel turns"
```

---

### Task 9: The run card + panel wiring

One new message-kind surface: the checklist card (spec §2.4). It renders from the store's `PlaybookRun` — NOT from message history — so it updates in place and survives panel close/reopen. Done lines come from `run.log` (real handles); the active human step shows its instruction; pending steps are dim labels.

**Files:**
- Create: `src/components/canvas/copilot-run-card.tsx`
- Modify: `src/components/canvas/copilot-panel.tsx`

**Interfaces:**
- Consumes: `useCanvasStore((s) => s.playbookRun)`; `PLAYBOOKS` from `@/lib/copilot/playbooks`; `Button` from `@/components/ui/button`; `Check`, `X` from `lucide-react`; `cancelRun`/`dismissRun` from `useCopilotChat` (Task 8).
- Produces: `CopilotRunCard({ onCancel, onDismiss }: { onCancel: () => void; onDismiss: () => void })` — returns `null` when no run or still `eliciting` (elicitation is plain chat).

- [ ] **Step 1: Implement the card**

Create `src/components/canvas/copilot-run-card.tsx`:

```tsx
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCanvasStore } from "./canvas-store-provider";
import { PLAYBOOKS } from "@/lib/copilot/playbooks";

// The run card (runner spec §2.4): a live checklist rendered FROM store state — not
// message history — so it updates in place and survives the panel closing. Done
// copilot steps show what they DID (run.log, with handles); the active human step
// is highlighted with its instruction; pending steps are dim.
export function CopilotRunCard({
  onCancel,
  onDismiss,
}: {
  onCancel: () => void;
  onDismiss: () => void;
}) {
  const run = useCanvasStore((s) => s.playbookRun);
  // Elicitation happens as plain chat turns — the card appears once steps exist.
  if (!run || run.status === "eliciting") return null;
  const playbook = PLAYBOOKS[run.playbook];
  const current = playbook?.steps[run.stepIndex];
  const live = run.status === "running" || run.status === "waiting-human";
  const waiting = run.status === "waiting-human" && current?.actor === "human";
  const pending = playbook ? playbook.steps.slice(run.stepIndex + (waiting ? 1 : 0)) : [];

  return (
    <div className="rounded-xl border border-border bg-card p-3 text-sm shadow-card">
      <div className="flex items-center justify-between gap-2">
        <span className="font-display text-[13px] font-medium">{run.title}</span>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={live ? onCancel : onDismiss}
          aria-label={live ? "Cancel run" : "Dismiss"}
          title={live ? "Cancel this run (created nodes stay)" : "Dismiss"}
          className="-mr-1 text-muted-foreground"
        >
          <X className="size-3.5" />
        </Button>
      </div>
      <ul className="mt-2 space-y-1.5">
        {run.log.map((line, i) => (
          <li key={i} className="flex items-start gap-1.5 text-muted-foreground">
            <Check className="mt-0.5 size-3.5 shrink-0 text-primary" />
            <span>{line}</span>
          </li>
        ))}
        {waiting && (
          <li className="flex items-start gap-1.5 font-medium">
            <span aria-hidden className="mt-0.5 shrink-0 text-primary">→</span>
            <span>{current.instruction}</span>
          </li>
        )}
        {live &&
          pending.map((s) => (
            <li key={s.label} className="flex items-start gap-1.5 text-muted-foreground/60">
              <span aria-hidden className="mt-0.5 shrink-0">○</span>
              <span>{s.label}</span>
            </li>
          ))}
        {run.status === "done" && (
          <li className="font-medium text-primary">Done</li>
        )}
        {run.status === "cancelled" && (
          <li className="text-muted-foreground">Cancelled — created nodes kept.</li>
        )}
      </ul>
    </div>
  );
}
```

- [ ] **Step 2: Render it in the panel**

In `src/components/canvas/copilot-panel.tsx`:

```tsx
import { CopilotRunCard } from "./copilot-run-card";
```

Destructure the new controls: `const { messages, thinking, highlightNode, send, cancelRun, dismissRun } = useCopilotChat(canvasId);`

In the transcript `<div ref={scrollRef} …>`, after the `messages.map` block and before the `thinking` indicator:

```tsx
        <CopilotRunCard onCancel={cancelRun} onDismiss={dismissRun} />
```

- [ ] **Step 3: Type-check + suite**

Run: `npx tsc --noEmit` — 0 errors. `npm test` — all pass.

- [ ] **Step 4: Manual browser check (the full lane)**

`npm run dev` → a canvas with a parsed script, ≥2 shots, ≥1 file node:

1. "generate an image reference for shot 2" → run starts or asks *which shot* (if it asked, reply `@SHOT-…`). Then it asks about refs → reply `@FILE-…`.
2. Card appears: 3 ✓ lines (prompt node added, connected, editor opened), the prompt focus view is open, "YOUR TURN" instruction in chat + card.
3. Write an instruction, hit Generate → on completion: "✓ Prompt generated — moving on.", image node appears wired, its focus view opens, second YOUR TURN.
4. Hit Generate on the image → "✓ Image for … — done." Card shows Done; ✕ dismisses it.

- [ ] **Step 5: Commit**

```powershell
git add src/components/canvas/copilot-run-card.tsx src/components/canvas/copilot-panel.tsx
git commit -m "feat(copilot): live run card rendered from the playbookRun store state"
```

---

### Task 10: Whole-feature gate + edge-behavior verification + docs

**Files:**
- Modify: `docs/superpowers/specs/2026-07-14-creativeos-copilot-design.md` (RESUME HERE block only)

- [ ] **Step 1: Full gate**

Run: `npx tsc --noEmit` — 0 errors.
Run: `npm test` — all tests pass (expect ~495+: 470 baseline + ~25 new).
Run: `npm run lint` — no NEW errors (pre-existing failures are recorded as known; compare against `main`'s worktree baseline before judging).

- [ ] **Step 2: Edge-behavior browser checks (the behaviors the design pays for)**

1. **Pre-completed step (level-trigger):** reach the prompt YOUR-TURN pause, then complete the step entirely on the canvas (write + Generate in the focus view) without touching the chat — the run must advance the moment `parsed` lands. Then verify the arrival-check variant: while the image YOUR-TURN pause is being set up (during the ✓/advance messages), hit Generate on the image node as fast as possible — even if the predicate is already true when the pause arrives, the run advances instantly instead of wedging.
2. **Inference:** on a canvas with exactly ONE shot: "make an image for the shot" → it must NOT ask which shot (only refs).
3. **"none":** answer the refs question with `none` → run starts, nothing but the shot wired into the prompt.
4. **Unanswerable:** empty canvas → "generate an image reference for shot 2" → helpful "no shots yet — parse a script first" message, no run.
5. **One run at a time:** during a YOUR-TURN pause, ask for another image run → "I'm mid-run… finish or cancel" message; the first run is unaffected.
6. **Cancel:** say `cancel` (and separately, hit the card's ✕) → status cancelled, created nodes still on canvas.
7. **Node deleted mid-wait:** during the prompt YOUR-TURN pause, delete the created prompt node → run cancels with the deletion message.
8. **Panel close/reopen mid-run:** close the copilot during a pause, generate, reopen → the run advanced; the card shows current state.

- [ ] **Step 3: Update the RESUME HERE block**

In `docs/superpowers/specs/2026-07-14-creativeos-copilot-design.md`, update the pointer block: move the playbook runner from "📐 Designed, NOT built" to "✅ Built + committed" (one line summarizing: router tool, elicitation, runner with store-predicate eyes, run card, `image-for-shot`; prep tasks done — `open_node` universal, file/draw addable). Set the next step to whatever the user directs (candidates: merge to main + assign D-numbers from spec §10 into the ADR log; or more playbooks). Do not touch §1–§10 history sections.

- [ ] **Step 4: Commit**

```powershell
git add docs/superpowers/specs/2026-07-14-creativeos-copilot-design.md
git commit -m "docs(copilot): mark playbook runner built in the resume pointer"
```

---

## Self-review (performed while writing)

- **Spec coverage:** §2.1 playbook data → Task 3; §2.2 router+elicitation → Tasks 6+7+8 (client-first in `resolveSlotReply`, authored asks in slots, inference, unanswerable); §2.3 runner mechanics → Tasks 4+5+7 (advance loop, ONE subscription active only while waiting-human, one-run-at-a-time, cancel-keeps-nodes, delete-aborts, no timeouts); §2.4 run card → Task 9 (renders from store, interaction split respected — answers in chat, actions on canvas); §2.5 generation steps are human steps → Task 3 (steps 4+6); §3 model-never-sequences → structure itself; §4 error table → unanswerable (T7), re-ask-once (T7 `reaskOrWait`), delete-mid-run (T7 eyes), mid-run command (T7 guard), panel close (store state, verified T10); §5 testing → pure functions tested in T3/T4/T5; §7 file map → all six files present (runner wiring split into its own hook, noted as refinement 2); §8 copy discipline → authored strings, tested in T3; prep tasks → T1/T2.
- **Placeholder scan:** no TBDs; every code step shows the code; every command has expected output.
- **Type consistency:** `RunContext`/`RunSnapshot`/`PlaybookRun`/`SlotValue` names and shapes match across Tasks 3→9; `answerWithText` return `{ kind: "no-run" }` is handled in Task 8 (`answered.kind !== "model"` → return); store slice names (`setPlaybookRun`/`patchPlaybookRun`) consistent in T5/T7/T9.
