# Guided Next-Node Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a contextual "Create next" CTA on each pipeline node that creates → connects → places → opens the next node down the chain (Shot → image prompt → Image Gen → video prompt → Video Gen), without ever running a model.

**Architecture:** The whole progression is one declarative `GUIDED_CHAIN` config + a pure `planGuidedNext` (mirrors `deriveTrayItems`/`planReconcile`). A store action `guidedCreateNext` applies the plan (or returns an existing node id to navigate to — idempotent). A shared `<GuidedNextButton>` renders as a card chip (Shot) or focus-view button (others) and opens the next node via the `focusedNodeId` seam the Generation Tray (D35) already built. Multi-parent wiring (shot + still → Video Prompt; motion prompt + still → Video Gen) reuses the tray's ancestor walk, promoted to a shared `findAncestorOfType`.

**Tech Stack:** Next.js App Router, `@xyflow/react`, zustand (vanilla store + provider), vitest (node env), Tailwind v4 + shadcn (Base UI), Lucide.

## Global Constraints

- **Never auto-generate (D11).** No CTA calls a model — not even cheap prompt text. It only creates/connects/places/opens; the designer sets controls, verifies inputs, and clicks Generate.
- **Idempotent.** If the next node already exists (wired from the source), the CTA navigates to it — never duplicates.
- **Design system (AGENTS.md / Yuvabe):** purple `#5829c7` sparingly — a primary CTA fill is its one sanctioned use; the chip variant is a **dashed-border primary chip** (`border border-dashed border-primary/40`, `hover:bg-primary/5`) matching the Shot card's "Compose" affordance; Lucide icons 1.5 stroke; motion easing `cubic-bezier(0.22,1,0.36,1)`; drive color through shadcn CSS vars.
- **React Compiler lint rules (hard):** `react-hooks/purity` forbids impure calls (`Date.now()`, etc.) in render/`useMemo` scope; `react-hooks/set-state-in-effect` forbids synchronous `setState` in an effect body. **Use derived-open (`open = focusOpen || focusedNodeId === id`), never a sync-setState effect** — exactly as the tray did for image-gen/video-gen.
- **Testing posture:** node-env vitest, no DOM. Pure `src/lib/**` logic is TDD'd; components/store-wiring are verified by typecheck + lint + manual (same as the tray plan).
- **Read-only lock (D33):** CTAs hidden when `useCanvasEditable()` is false — creating nodes is a canvas edit.
- **Spec:** `docs/superpowers/specs/2026-07-05-guided-next-node-flow-design.md` (ADR **D36**).

---

### Task 1: Shared ancestor walk (`findAncestorOfType`) + refactor `findShotAncestor`

Promote the tray's shot-ancestor walk into a reusable graph util, and make the tray's `findShotAncestor` a one-line delegate. The guided flow needs to walk to a `shot` **and** an `image-gen` ancestor.

**Files:**
- Modify: `src/lib/canvas/graph.ts`
- Modify: `src/lib/generation-tray.ts`
- Test: `src/lib/canvas/graph.test.ts`

**Interfaces:**
- Produces: `findAncestorOfType<T extends { id: string; type?: string }>(nodeId: string, nodes: T[], edges: Edge[], type: string, maxDepth?: number): T | null`
- `findShotAncestor` (in `generation-tray.ts`) keeps its exact signature, now delegating.

- [ ] **Step 1: Write the failing test** (append to `src/lib/canvas/graph.test.ts`)

```ts
import { findAncestorOfType } from "./graph";

const n = (id: string, type: string) => ({ id, type });

describe("findAncestorOfType", () => {
  it("walks upstream to the nearest ancestor of the given type", () => {
    const nodes = [n("s", "shot"), n("p", "prompt"), n("g", "image-gen")];
    const edges = [e("s", "p"), e("p", "g")];
    expect(findAncestorOfType("g", nodes, edges, "shot")?.id).toBe("s");
  });

  it("finds an image-gen ancestor across a video-prompt", () => {
    const nodes = [n("ig", "image-gen"), n("vp", "video-prompt"), n("vg", "video-gen")];
    const edges = [e("ig", "vp"), e("vp", "vg")];
    expect(findAncestorOfType("vg", nodes, edges, "image-gen")?.id).toBe("ig");
  });

  it("returns null when no ancestor of that type exists", () => {
    const nodes = [n("f", "file"), n("g", "image-gen")];
    expect(findAncestorOfType("g", nodes, [e("f", "g")], "shot")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/canvas/graph.test.ts`
Expected: FAIL — "findAncestorOfType is not a function".

- [ ] **Step 3: Add `findAncestorOfType` to `src/lib/canvas/graph.ts`**

```ts
/**
 * Walk edges upstream (BFS, bounded depth) from `nodeId` to the nearest node of `type`.
 * Generic over the node shape so both AppNode consumers and tests can call it.
 */
export function findAncestorOfType<T extends { id: string; type?: string }>(
  nodeId: string,
  nodes: T[],
  edges: Edge[],
  type: string,
  maxDepth = 4,
): T | null {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const parentsOf = (id: string) => edges.filter((e) => e.target === id).map((e) => e.source);
  const seen = new Set<string>([nodeId]);
  let frontier = [nodeId];
  for (let depth = 0; depth < maxDepth; depth++) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const p of parentsOf(id)) {
        if (seen.has(p)) continue;
        seen.add(p);
        const parent = byId.get(p);
        if (parent?.type === type) return parent;
        next.push(p);
      }
    }
    if (next.length === 0) break;
    frontier = next;
  }
  return null;
}
```

- [ ] **Step 4: Refactor `findShotAncestor` to delegate** in `src/lib/generation-tray.ts`

Replace the whole body of `findShotAncestor` (keep its exported signature) with a delegate, and add the import:

```ts
import { findAncestorOfType } from "@/lib/canvas/graph";
```

```ts
/** Walk edges upstream from `nodeId` to the nearest `shot` node. */
export function findShotAncestor(
  nodeId: string,
  nodes: AppNode[],
  edges: Edge[],
  maxDepth = 4,
): AppNode | null {
  return findAncestorOfType(nodeId, nodes, edges, "shot", maxDepth);
}
```

- [ ] **Step 5: Run both test files to verify pass** (the tray's existing `findShotAncestor` tests guard the refactor)

Run: `npx vitest run src/lib/canvas/graph.test.ts src/lib/generation-tray.test.ts`
Expected: PASS (graph's new 3 tests + all existing generation-tray tests still green).

- [ ] **Step 6: Commit**

```bash
git add src/lib/canvas/graph.ts src/lib/canvas/graph.test.ts src/lib/generation-tray.ts
git commit -m "feat(guided): shared findAncestorOfType; findShotAncestor delegates"
```

---

### Task 2: Pure `placeNextTo` + `imageGenGate`

The two small pure helpers `planGuidedNext` composes: where to drop the new node, and whether the Image Gen → video CTA is enabled.

**Files:**
- Create: `src/lib/guided-flow.ts`
- Test: `src/lib/guided-flow.test.ts`

**Interfaces:**
- Consumes: `AppNode` from `@/lib/canvas-nodes`.
- Produces:
  - `type GuidedGate = { enabled: boolean; nudge?: string }`
  - `placeNextTo(source: AppNode, nodes: AppNode[]): { x: number; y: number }`
  - `imageGenGate(source: AppNode): GuidedGate`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/guided-flow.test.ts
import { describe, it, expect } from "vitest";
import type { AppNode } from "@/lib/canvas-nodes";
import { placeNextTo, imageGenGate } from "./guided-flow";

const node = (id: string, type: string, x = 0, y = 0, data: Record<string, unknown> = {}): AppNode =>
  ({ id, type, position: { x, y }, data } as AppNode);

describe("placeNextTo", () => {
  it("drops the next node to the right of the source", () => {
    const src = node("s", "shot", 100, 200);
    expect(placeNextTo(src, [src])).toEqual({ x: 460, y: 200 });
  });

  it("nudges down when the spot is occupied", () => {
    const src = node("s", "shot", 100, 200);
    const blocker = node("b", "prompt", 460, 200); // sits exactly at the default target
    expect(placeNextTo(src, [src, blocker]).y).toBeGreaterThan(200);
  });
});

describe("imageGenGate", () => {
  it("is disabled with a nudge when there is no image yet", () => {
    expect(imageGenGate(node("g", "image-gen"))).toEqual({ enabled: false, nudge: "Generate an image first" });
  });

  it("is enabled with a nudge when the image is not approved", () => {
    const g = node("g", "image-gen", 0, 0, { parsed: "http://img", approvalStatus: "pending" });
    expect(imageGenGate(g)).toEqual({ enabled: true, nudge: "Not approved yet" });
  });

  it("is cleanly enabled once approved", () => {
    const g = node("g", "image-gen", 0, 0, { parsed: "http://img", approvalStatus: "approved" });
    expect(imageGenGate(g)).toEqual({ enabled: true });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/guided-flow.test.ts`
Expected: FAIL — "placeNextTo is not a function".

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/guided-flow.ts
import type { Edge } from "@xyflow/react";
import type { AppNode } from "@/lib/canvas-nodes";
import { findAncestorOfType } from "@/lib/canvas/graph";

const NEXT_DX = 360;   // horizontal gap to the next node (matches fanOutShots)
const ROW_DY = 170;    // vertical nudge when a spot is taken
const BOX_W = 300;     // approximate node footprint for overlap checks
const BOX_H = 150;

export type GuidedGate = { enabled: boolean; nudge?: string };

/** Drop the next node to the right of `source`, nudging down until the spot is clear. */
export function placeNextTo(source: AppNode, nodes: AppNode[]): { x: number; y: number } {
  const x = source.position.x + NEXT_DX;
  let y = source.position.y;
  const occupied = (py: number) =>
    nodes.some(
      (n) => Math.abs(n.position.x - x) < BOX_W && Math.abs(n.position.y - py) < BOX_H,
    );
  while (occupied(y)) y += ROW_DY;
  return { x, y };
}

/** Image Gen → video CTA gate: needs an image; approval guides (nudge), never blocks (D29). */
export function imageGenGate(source: AppNode): GuidedGate {
  const d = source.data as { parsed?: unknown; approvalStatus?: string };
  if (d.parsed == null) return { enabled: false, nudge: "Generate an image first" };
  if (d.approvalStatus !== "approved") return { enabled: true, nudge: "Not approved yet" };
  return { enabled: true };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/guided-flow.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/guided-flow.ts src/lib/guided-flow.test.ts
git commit -m "feat(guided): pure placeNextTo + imageGenGate"
```

---

### Task 3: `GUIDED_CHAIN` config + `planGuidedNext`

The declarative chain and the pure planner that turns a source node into a plan (next type, existing-id-to-navigate, position, parents to wire).

**Files:**
- Modify: `src/lib/guided-flow.ts`
- Test: `src/lib/guided-flow.test.ts`

**Interfaces:**
- Consumes: `placeNextTo`, `imageGenGate` (Task 2); `findAncestorOfType` (Task 1); `AppNode`, `Edge`.
- Produces:
  - `type GuidedStep = { nextType; createLabel; openLabel; alsoWireAncestors?: string[]; gate?: (source: AppNode) => GuidedGate }`
  - `GUIDED_CHAIN: Record<string, GuidedStep>`
  - `type GuidedPlan = { nextType; existingId: string | null; position: {x;y}; parentIds: string[]; gate: GuidedGate }`
  - `planGuidedNext(source: AppNode, nodes: AppNode[], edges: Edge[]): GuidedPlan | null`

- [ ] **Step 1: Write the failing test** (append to `src/lib/guided-flow.test.ts`)

```ts
import { GUIDED_CHAIN, planGuidedNext } from "./guided-flow";
import type { Edge } from "@xyflow/react";

const edge = (source: string, target: string): Edge => ({ id: `${source}-${target}`, source, target });

describe("GUIDED_CHAIN", () => {
  it("maps each pipeline source to its next type; video-gen is terminal", () => {
    expect(GUIDED_CHAIN.shot.nextType).toBe("prompt");
    expect(GUIDED_CHAIN.prompt.nextType).toBe("image-gen");
    expect(GUIDED_CHAIN["image-gen"].nextType).toBe("video-prompt");
    expect(GUIDED_CHAIN["video-prompt"].nextType).toBe("video-gen");
    expect(GUIDED_CHAIN["video-gen"]).toBeUndefined();
  });
});

describe("planGuidedNext", () => {
  it("returns null for a source with no chain entry", () => {
    expect(planGuidedNext(node("f", "file"), [], [])).toBeNull();
  });

  it("plans a fresh prompt from a shot, wiring the shot as the sole parent", () => {
    const shot = node("s", "shot", 0, 0);
    const plan = planGuidedNext(shot, [shot], [])!;
    expect(plan.nextType).toBe("prompt");
    expect(plan.existingId).toBeNull();
    expect(plan.parentIds).toEqual(["s"]);
    expect(plan.position).toEqual({ x: 360, y: 0 });
  });

  it("navigates to an existing next instead of duplicating", () => {
    const shot = node("s", "shot");
    const prompt = node("p", "prompt");
    const plan = planGuidedNext(shot, [shot, prompt], [edge("s", "p")])!;
    expect(plan.existingId).toBe("p");
    expect(plan.parentIds).toEqual([]);
  });

  it("wires BOTH the still and the shot into a new video-prompt", () => {
    const shot = node("s", "shot");
    const prompt = node("p", "prompt");
    const ig = node("ig", "image-gen", 0, 0, { parsed: "http://img", approvalStatus: "approved" });
    const edges = [edge("s", "p"), edge("p", "ig")];
    const plan = planGuidedNext(ig, [shot, prompt, ig], edges)!;
    expect(plan.nextType).toBe("video-prompt");
    expect(plan.parentIds.sort()).toEqual(["ig", "s"]); // still + shot ancestor
  });

  it("wires BOTH the motion prompt and the image-gen still into a new video-gen", () => {
    const ig = node("ig", "image-gen");
    const vp = node("vp", "video-prompt");
    const edges = [edge("ig", "vp")];
    const plan = planGuidedNext(vp, [ig, vp], edges)!;
    expect(plan.nextType).toBe("video-gen");
    expect(plan.parentIds.sort()).toEqual(["ig", "vp"]);
  });

  it("carries the image-gen gate (disabled without an image)", () => {
    const ig = node("ig", "image-gen");
    expect(planGuidedNext(ig, [ig], [])!.gate).toEqual({ enabled: false, nudge: "Generate an image first" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/guided-flow.test.ts`
Expected: FAIL — "planGuidedNext is not a function".

- [ ] **Step 3: Append the implementation** to `src/lib/guided-flow.ts`

```ts
export type GuidedStep = {
  nextType: string;
  createLabel: string;
  openLabel: string;
  alsoWireAncestors?: string[];
  gate?: (source: AppNode) => GuidedGate;
};

// The reel pipeline, as data. Single source of truth for "what comes next".
export const GUIDED_CHAIN: Record<string, GuidedStep> = {
  shot:           { nextType: "prompt",       createLabel: "Create image prompt",     openLabel: "Open image prompt" },
  prompt:         { nextType: "image-gen",    createLabel: "Create image generation", openLabel: "Open image generation" },
  "image-gen":    { nextType: "video-prompt", createLabel: "Create video prompt",     openLabel: "Open video prompt",
                    alsoWireAncestors: ["shot"], gate: imageGenGate },
  "video-prompt": { nextType: "video-gen",    createLabel: "Create video generation", openLabel: "Open video generation",
                    alsoWireAncestors: ["image-gen"] },
  // video-gen is terminal — no entry.
};

export type GuidedPlan = {
  nextType: string;
  existingId: string | null;             // navigate here instead of creating (idempotent)
  position: { x: number; y: number };
  parentIds: string[];                   // nodes to wire INTO the new node (source + ancestors)
  gate: GuidedGate;
};

/** Plan the next node for `source`: type, existing-or-new, placement, parents to wire. */
export function planGuidedNext(source: AppNode, nodes: AppNode[], edges: Edge[]): GuidedPlan | null {
  const step = GUIDED_CHAIN[source.type as string];
  if (!step) return null;
  const gate = step.gate?.(source) ?? { enabled: true };
  const byId = new Map(nodes.map((n) => [n.id, n]));

  // Already wired to a node of nextType? → navigate, never duplicate.
  const existing = edges.find(
    (e) => e.source === source.id && byId.get(e.target)?.type === step.nextType,
  );
  if (existing) {
    return { nextType: step.nextType, existingId: existing.target, position: source.position, parentIds: [], gate };
  }

  // Parents to wire into the new node: the source, plus each resolved ancestor (D24).
  const parentIds = [source.id];
  for (const ancType of step.alsoWireAncestors ?? []) {
    const anc = findAncestorOfType(source.id, nodes, edges, ancType);
    if (anc) parentIds.push(anc.id);
  }

  return {
    nextType: step.nextType,
    existingId: null,
    position: placeNextTo(source, nodes),
    parentIds,
    gate,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/guided-flow.test.ts`
Expected: PASS (Task 2 + Task 3 assertions).

- [ ] **Step 5: Commit**

```bash
git add src/lib/guided-flow.ts src/lib/guided-flow.test.ts
git commit -m "feat(guided): GUIDED_CHAIN config + planGuidedNext"
```

---

### Task 4: Store action `guidedCreateNext`

Apply the plan: navigate to an existing next, or create the node + wire every parent, returning the id to open.

**Files:**
- Modify: `src/lib/canvas-store.ts`
- Test: `src/lib/canvas-store.test.ts`

**Interfaces:**
- Consumes: `planGuidedNext` (Task 3); `wouldCreateCycle` from `@/lib/canvas/graph`; the store's existing `defaultData`.
- Produces (on `CanvasState`): `guidedCreateNext(sourceId: string): string | null`

- [ ] **Step 1: Write the failing test** (append to `src/lib/canvas-store.test.ts`)

```ts
describe("guidedCreateNext", () => {
  it("creates the next node wired from the source and returns its id", () => {
    const shot: AppNode = { id: "s", type: "shot", position: { x: 0, y: 0 }, data: {} } as AppNode;
    const store = createCanvasStore([shot], []);
    const newId = store.getState().guidedCreateNext("s");
    expect(newId).not.toBeNull();
    const created = store.getState().nodes.find((n) => n.id === newId);
    expect(created?.type).toBe("prompt");
    expect(store.getState().edges.some((e) => e.source === "s" && e.target === newId)).toBe(true);
  });

  it("returns the existing next id without creating a duplicate", () => {
    const shot: AppNode = { id: "s", type: "shot", position: { x: 0, y: 0 }, data: {} } as AppNode;
    const prompt: AppNode = { id: "p", type: "prompt", position: { x: 360, y: 0 }, data: {} } as AppNode;
    const store = createCanvasStore([shot, prompt], [{ id: "s-p", source: "s", target: "p" }]);
    const before = store.getState().nodes.length;
    expect(store.getState().guidedCreateNext("s")).toBe("p");
    expect(store.getState().nodes.length).toBe(before); // no new node
  });

  it("returns null for a gated source (image-gen with no image)", () => {
    const ig: AppNode = { id: "g", type: "image-gen", position: { x: 0, y: 0 }, data: {} } as AppNode;
    const store = createCanvasStore([ig], []);
    expect(store.getState().guidedCreateNext("g")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/canvas-store.test.ts`
Expected: FAIL — "guidedCreateNext is not a function".

- [ ] **Step 3: Add imports** to `src/lib/canvas-store.ts`

```ts
import { wouldCreateCycle } from "@/lib/canvas/graph";
import { planGuidedNext } from "@/lib/guided-flow";
```

- [ ] **Step 4: Add to the `CanvasState` type** (after `setFocusedNodeId`):

```ts
  // Guided next-node flow (D36): create/connect/place the next pipeline node, or return
  // an existing next node's id to navigate to. Never runs a model.
  guidedCreateNext: (sourceId: string) => string | null;
```

- [ ] **Step 5: Add the implementation** (inside `createCanvasStore`, after `setFocusedNodeId`):

```ts
    guidedCreateNext: (sourceId) => {
      const state = get();
      const source = state.nodes.find((n) => n.id === sourceId);
      if (!source) return null;
      const plan = planGuidedNext(source, state.nodes, state.edges);
      if (!plan || !plan.gate.enabled) return null;
      if (plan.existingId) return plan.existingId; // navigate, no mutation

      const newId = crypto.randomUUID();
      const newNode = {
        id: newId,
        type: plan.nextType,
        position: plan.position,
        data: defaultData(plan.nextType),
      } as AppNode;
      const newEdges = plan.parentIds
        .filter((pid) => !wouldCreateCycle(state.edges, pid, newId))
        .map((pid) => ({ id: crypto.randomUUID(), source: pid, target: newId }));
      set({ nodes: [...state.nodes, newNode], edges: [...state.edges, ...newEdges] });
      return newId;
    },
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run src/lib/canvas-store.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/canvas-store.ts src/lib/canvas-store.test.ts
git commit -m "feat(guided): guidedCreateNext store action"
```

---

### Task 5: `<GuidedNextButton>` component

The shared CTA. Reads the chain config + plan, renders a chip or a primary button, and on click creates/navigates then opens the next node's focus view.

**Files:**
- Create: `src/components/canvas/guided-next-button.tsx`

**Interfaces:**
- Consumes: `GUIDED_CHAIN`, `planGuidedNext` (Task 3); store `guidedCreateNext` (Task 4), `setFocusedNodeId` (D35); `useCanvasEditable`; shadcn `Button`.
- Produces: `<GuidedNextButton sourceId={string} variant={"chip" | "button"} onNavigate?={() => void} />`

- [ ] **Step 1: Implement the component**

```tsx
// src/components/canvas/guided-next-button.tsx
"use client";

import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useCanvasStore } from "@/components/canvas/canvas-store-provider";
import { useCanvasEditable } from "@/components/canvas/canvas-editable-context";
import { GUIDED_CHAIN, planGuidedNext } from "@/lib/guided-flow";

export function GuidedNextButton({
  sourceId,
  variant,
  onNavigate,
}: {
  sourceId: string;
  variant: "chip" | "button";
  onNavigate?: () => void;
}) {
  const editable = useCanvasEditable();
  const nodes = useCanvasStore((s) => s.nodes);
  const edges = useCanvasStore((s) => s.edges);
  const guidedCreateNext = useCanvasStore((s) => s.guidedCreateNext);
  const setFocusedNodeId = useCanvasStore((s) => s.setFocusedNodeId);

  const source = nodes.find((n) => n.id === sourceId);
  const step = source ? GUIDED_CHAIN[source.type as string] : undefined;
  if (!editable || !source || !step) return null;

  const plan = planGuidedNext(source, nodes, edges); // pure — safe in render
  if (!plan) return null;

  const label = plan.existingId ? step.openLabel : step.createLabel;
  const disabled = !plan.gate.enabled;

  const handleClick = () => {
    const id = guidedCreateNext(sourceId);
    if (!id) return;
    onNavigate?.();          // close the current focus view (if any)
    setFocusedNodeId(id);    // open the next node's focus view (D35 seam)
  };

  if (variant === "chip") {
    return (
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled}
        title={plan.gate.nudge}
        className={cn(
          "nodrag mt-1 flex items-center gap-1 rounded-md border border-dashed border-primary/40 px-2 py-1 text-[0.65rem] text-primary transition-colors hover:bg-primary/5",
          disabled && "cursor-not-allowed opacity-50",
        )}
      >
        <ArrowRight className="size-3" strokeWidth={1.5} /> {label}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Button size="sm" onClick={handleClick} disabled={disabled}>
        {label} <ArrowRight className="size-4" strokeWidth={1.5} />
      </Button>
      {plan.gate.nudge && (
        <span className="text-[0.7rem] text-muted-foreground">{plan.gate.nudge}</span>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `npx tsc --noEmit && npx eslint src/components/canvas/guided-next-button.tsx`
Expected: clean. (`planGuidedNext` is pure — no purity-rule violation calling it in render.)

- [ ] **Step 3: Commit**

```bash
git add src/components/canvas/guided-next-button.tsx
git commit -m "feat(guided): shared GuidedNextButton (chip + button variants)"
```

---

### Task 6: Extend `focusedNodeId` derived-open to prompt + video-prompt nodes

So the chain can open a newly-created Prompt / Video-Prompt focus view. Mirror exactly what the tray did for image-gen/video-gen — derived open, no effect.

**Files:**
- Modify: `src/components/nodes/prompt-node.tsx`
- Modify: `src/components/nodes/video-prompt-node.tsx`

**Interfaces:**
- Consumes: store `focusedNodeId` / `setFocusedNodeId` (D35).

- [ ] **Step 1: prompt-node — read the store fields**

After `const edges = useCanvasStore((s) => s.edges);` add:

```ts
  const focusedNodeId = useCanvasStore((s) => s.focusedNodeId);
  const setFocusedNodeId = useCanvasStore((s) => s.setFocusedNodeId);
```

- [ ] **Step 2: prompt-node — derive the open state** (replace the `const [focusOpen, setFocusOpen] = useState(false);` region)

```ts
  const [focusOpen, setFocusOpen] = useState(false);
  // Open locally (double-click / "Open ↗") OR when the guided flow points here (D35/D36).
  const focusViewOpen = focusOpen || focusedNodeId === id;
  const handleFocusOpenChange = (next: boolean) => {
    setFocusOpen(next);
    if (!next && focusedNodeId === id) setFocusedNodeId(null);
  };
```

- [ ] **Step 3: prompt-node — use the derived open on the focus view**

Change the `<PromptFocusView>` props:

```tsx
      <PromptFocusView
        open={focusViewOpen}
        onOpenChange={handleFocusOpenChange}
        nodeId={id}
```

- [ ] **Step 4: video-prompt-node — apply the identical three changes**

Add the two store reads after `const edges = useCanvasStore((s) => s.edges);`:

```ts
  const focusedNodeId = useCanvasStore((s) => s.focusedNodeId);
  const setFocusedNodeId = useCanvasStore((s) => s.setFocusedNodeId);
```

Add the derived open right after `const [focusOpen, setFocusOpen] = useState(false);`:

```ts
  const focusViewOpen = focusOpen || focusedNodeId === id;
  const handleFocusOpenChange = (next: boolean) => {
    setFocusOpen(next);
    if (!next && focusedNodeId === id) setFocusedNodeId(null);
  };
```

Change the `<VideoPromptFocusView>` open props:

```tsx
        <VideoPromptFocusView
          open={focusViewOpen}
          onOpenChange={handleFocusOpenChange}
          nodeId={id}
```

- [ ] **Step 5: Typecheck + lint**

Run: `npx tsc --noEmit && npx eslint src/components/nodes/prompt-node.tsx src/components/nodes/video-prompt-node.tsx`
Expected: clean (no set-state-in-effect — derived open).

- [ ] **Step 6: Commit**

```bash
git add src/components/nodes/prompt-node.tsx src/components/nodes/video-prompt-node.tsx
git commit -m "feat(guided): prompt + video-prompt nodes open on focusedNodeId"
```

---

### Task 7: Render the CTAs (shot card chip + three focus-view buttons)

Place `<GuidedNextButton>` on each source surface.

**Files:**
- Modify: `src/components/nodes/shot-node.tsx`
- Modify: `src/components/nodes/prompt-focus-view.tsx`
- Modify: `src/components/nodes/image-gen-focus-view.tsx`
- Modify: `src/components/nodes/video-prompt-focus-view.tsx`

**Interfaces:**
- Consumes: `<GuidedNextButton>` (Task 5). Each focus view already receives `nodeId` and `onOpenChange` props.

- [ ] **Step 1: shot-node — add the chip beside "Compose"**

Import the button:

```ts
import { GuidedNextButton } from "@/components/canvas/guided-next-button";
```

Directly after the existing "Compose" `</button>` (the one with `<Sparkles … /> Compose`), add:

```tsx
          <GuidedNextButton sourceId={id} variant="chip" />
```

- [ ] **Step 2: prompt-focus-view — add the primary button in the header action row**

Import it:

```ts
import { GuidedNextButton } from "@/components/canvas/guided-next-button";
```

Find the header row containing the **"Back to canvas"** button (grep `Back to canvas`). That row is the focus view's top action bar. Add, right-aligned in that row (as its last child):

```tsx
          <GuidedNextButton
            sourceId={nodeId}
            variant="button"
            onNavigate={() => onOpenChange(false)}
          />
```

If the "Back to canvas" button is the only child of its flex row, wrap the row so the guided button sits at the right (`justify-between`). Use the component's own `nodeId` and `onOpenChange` props (both already in scope in the focus view).

- [ ] **Step 3: image-gen-focus-view — same insertion**

Import `GuidedNextButton`; grep `Back to canvas`; add `<GuidedNextButton sourceId={nodeId} variant="button" onNavigate={() => onOpenChange(false)} />` to that header action row. (This is the Image Gen → "Create video prompt" CTA; its `imageGenGate` disables it until a still exists and nudges until approved — handled inside the component.)

- [ ] **Step 4: video-prompt-focus-view — same insertion**

Import `GuidedNextButton`; grep `Back to canvas`; add `<GuidedNextButton sourceId={nodeId} variant="button" onNavigate={() => onOpenChange(false)} />` to that header action row.

- [ ] **Step 5: Typecheck + lint the four files**

Run: `npx tsc --noEmit && npx eslint src/components/nodes/shot-node.tsx src/components/nodes/prompt-focus-view.tsx src/components/nodes/image-gen-focus-view.tsx src/components/nodes/video-prompt-focus-view.tsx`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/components/nodes/shot-node.tsx src/components/nodes/prompt-focus-view.tsx src/components/nodes/image-gen-focus-view.tsx src/components/nodes/video-prompt-focus-view.tsx
git commit -m "feat(guided): render Create-next CTAs on shot card + prompt/image-gen/video-prompt focus views"
```

---

### Task 8: Full manual E2E + green baseline

**Files:** none (verification only).

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: PASS — new `guided-flow`, `graph`, `canvas-store` tests plus all prior; no regressions.

- [ ] **Step 2: Typecheck + my-files lint**

Run: `npx tsc --noEmit`
Expected: clean. Then lint the touched files (the project-wide lint has known pre-existing errors — verify no *new* ones in guided-flow files):
Run: `npx eslint src/lib/guided-flow.ts src/lib/canvas/graph.ts src/components/canvas/guided-next-button.tsx src/components/nodes/shot-node.tsx src/components/nodes/prompt-node.tsx src/components/nodes/video-prompt-node.tsx src/components/nodes/prompt-focus-view.tsx src/components/nodes/image-gen-focus-view.tsx src/components/nodes/video-prompt-focus-view.tsx`
Expected: clean.

- [ ] **Step 3: Manual E2E** (`npm run dev`)

1. **Full chain:** open a canvas, fan out a shot. On the Shot card click **"Create image prompt"** → a Prompt node appears wired to the shot, and its focus view opens. In it, click **"Create image generation"** → Image Gen node appears wired to the prompt, focus view opens. Generate an image + approve. Click **"Create video prompt"** → Video Prompt node appears wired to **both** the image-gen (still) **and** the shot; focus view opens. Click **"Create video generation"** → Video Gen node appears wired to **both** the video-prompt (motion) **and** the image-gen (still); focus view opens.
2. **Idempotent:** click any CTA again → label reads **"Open …"** and it navigates to the existing node — no duplicate created.
3. **Image Gen gate:** before generating, the "Create video prompt" button is **disabled** ("Generate an image first"); after generating but before approval it's **enabled** with "Not approved yet"; after approval it's clean.
4. **No auto-generate:** confirm no generation fires on any CTA — you always land on the next node and click Generate yourself.
5. **Read-only:** open the canvas in a second tab (D33 lock → read-only) → no CTAs render.

- [ ] **Step 4: Confirm branch history**

Run: `git log --oneline d1833be..HEAD`
Expected: the docs commits plus Tasks 1–7.

---

## Notes & intentional decisions

- **No autosave flush in `guidedCreateNext`.** The spec floated a belt-and-suspenders `runAutosaveFlush`; the plan drops it to avoid coupling the store to the client autosave. The debounced autosave (600ms) persists the new node/edges well before the designer reviews inputs and clicks Generate (nothing auto-generates), so the generate-before-persist race is not practically reachable.
- **`planGuidedNext` in render** is safe — it is a pure function (no `Date.now()`/impure calls), unlike the tray's `Date.now()` which had to move to a module helper.
- **CTA host asymmetry** (Shot on card, others in focus views) is deliberate: the Shot node has no focus view (it edits inline + has the compose sheet), so its chip lives on the card beside "Compose".
