# Generation Tray Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a flat, canvas-scoped, navigation-only shelf that lists long-running image/video generation jobs (Running/Ready/Failed) and, on click, flies the canvas to the node and opens its focus view.

**Architecture:** Everything is **derived on read** (D9) from the existing `generations` job table + the node graph — no new table, no migration. The only backend change is that the (still synchronous) image-generate route starts writing a `generations` row, so image joins video on the one substrate (completes D26). A single canvas-level Supabase Realtime subscription feeds a small zustand store slice; a pure `deriveTrayItems` shapes the list. Two small reusable plumbing additions — wrap the canvas in `<ReactFlowProvider>` and lift `focusedNodeId` to the store — enable "fly to node + open focus view."

**Tech Stack:** Next.js App Router, `@xyflow/react` (React Flow), Supabase (Postgres + Realtime), zustand (vanilla store + provider), vitest (node env), Tailwind v4 + shadcn (Base UI), Lucide, sonner.

## Global Constraints

- **Design system (AGENTS.md / Yuvabe):** two font families only (`font-display`, `font-sans`); purple `#5829c7` used **sparingly** (accent/spinner/focus only — never a fill); neutrals lead; cards white with 1px `neutral-200` border + `shadow-card`, radius 12–24px; motion easing **`cubic-bezier(0.22,1,0.36,1)`** only, durations 200/320/500ms (no springs/bounce); Lucide icons only, 1.5 stroke; drive all color through the shadcn CSS variables — never hardcode.
- **shadcn, not native controls:** use `src/components/ui/*` (Base UI) — never native `select`/`input`/`textarea`/`range`.
- **React Flow:** ground work in `reactflow.dev/learn`; `<ReactFlowProvider>` is the documented way to reach the viewport API outside `<ReactFlow>`.
- **Component structure:** one component per file, named export, split at ~200 lines, no prop drilling (read the store where you need it).
- **Testing reality:** vitest runs in a **node** environment with no DOM/RTL. Only pure `src/lib/**` logic is unit-tested; components, hooks, and routes are verified by typecheck + manual run (same posture the processing-pill spec used). Every pure function takes injected time (`nowMs`) for deterministic tests — never call `Date.now()` inside a pure function.
- **Status vocabulary:** DB is `running | succeeded | failed`; the tray *renders* **Running / Ready / Failed** (display mapping only — no schema rename).
- **Scope guardrails:** navigation only — **no** approve/retry/edit/delete on tray items; **no** prompt/compose/parse jobs in the tray; **no** stored tray table; **no** promotion of image gen to async.
- **Spec:** `docs/superpowers/specs/2026-07-05-generation-tray-design.md` (ADR **D35**).

---

### Task 1: Pure shot-label resolution (`findShotAncestor` + `resolveShotLabel`)

The tray labels each item by walking edges upstream to the nearest `shot` node. This is the pure, testable core of the label + sort order.

**Files:**
- Create: `src/lib/generation-tray.ts`
- Test: `src/lib/generation-tray.test.ts`

**Interfaces:**
- Consumes: `AppNode` from `@/lib/canvas-nodes`; `Edge` from `@xyflow/react`.
- Produces:
  - `findShotAncestor(nodeId: string, nodes: AppNode[], edges: Edge[], maxDepth?: number): AppNode | null`
  - `resolveShotLabel(nodeId: string, nodes: AppNode[], edges: Edge[]): string`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/generation-tray.test.ts
import { describe, it, expect } from "vitest";
import type { Edge } from "@xyflow/react";
import type { AppNode } from "@/lib/canvas-nodes";
import { findShotAncestor, resolveShotLabel } from "./generation-tray";

// Minimal node/edge factories — only the fields the walk reads.
const node = (id: string, type: string, data: Record<string, unknown> = {}): AppNode =>
  ({ id, type, position: { x: 0, y: 0 }, data } as AppNode);
const edge = (source: string, target: string): Edge =>
  ({ id: `${source}-${target}`, source, target });

describe("findShotAncestor", () => {
  it("walks image-gen ← prompt ← shot", () => {
    const nodes = [node("s", "shot", { order: 3 }), node("p", "prompt"), node("g", "image-gen")];
    const edges = [edge("s", "p"), edge("p", "g")];
    expect(findShotAncestor("g", nodes, edges)?.id).toBe("s");
  });

  it("walks video-gen ← video-prompt ← shot", () => {
    const nodes = [node("s", "shot", { order: 1 }), node("vp", "video-prompt"), node("vg", "video-gen")];
    const edges = [edge("s", "vp"), edge("vp", "vg")];
    expect(findShotAncestor("vg", nodes, edges)?.id).toBe("s");
  });

  it("returns null when no shot ancestor exists", () => {
    const nodes = [node("f", "file"), node("g", "image-gen")];
    const edges = [edge("f", "g")];
    expect(findShotAncestor("g", nodes, edges)).toBeNull();
  });
});

describe("resolveShotLabel", () => {
  it("labels by the shot's 1-based order", () => {
    const nodes = [node("s", "shot", { order: 3 }), node("p", "prompt"), node("g", "image-gen")];
    const edges = [edge("s", "p"), edge("p", "g")];
    expect(resolveShotLabel("g", nodes, edges)).toBe("Shot 3");
  });

  it("falls back to the node's own title when there is no shot", () => {
    const nodes = [node("g", "image-gen", { title: "Hero still" })];
    expect(resolveShotLabel("g", [], [])).toBe("Untitled"); // node not in list → fallback
    expect(resolveShotLabel("g", nodes, [])).toBe("Hero still");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/generation-tray.test.ts`
Expected: FAIL — "findShotAncestor is not a function" / module has no exports.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/generation-tray.ts
import type { Edge } from "@xyflow/react";
import type { AppNode } from "@/lib/canvas-nodes";

/** Walk edges upstream (BFS, bounded depth) from `nodeId` to the nearest `shot` node. */
export function findShotAncestor(
  nodeId: string,
  nodes: AppNode[],
  edges: Edge[],
  maxDepth = 4,
): AppNode | null {
  const byId = new Map(nodes.map((n) => [n.id, n]));
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
        if (parent?.type === "shot") return parent;
        next.push(p);
      }
    }
    if (next.length === 0) break;
    frontier = next;
  }
  return null;
}

/** Human label for a generation node: "Shot N" from its shot ancestor, else the node's title. */
export function resolveShotLabel(nodeId: string, nodes: AppNode[], edges: Edge[]): string {
  const shot = findShotAncestor(nodeId, nodes, edges);
  if (shot) {
    const order = (shot.data as { order?: number }).order;
    return typeof order === "number" ? `Shot ${order}` : "Shot";
  }
  const self = nodes.find((n) => n.id === nodeId);
  const title = (self?.data as { title?: string } | undefined)?.title?.trim();
  return title ? title : "Untitled";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/generation-tray.test.ts`
Expected: PASS (all 5 assertions green).

- [ ] **Step 5: Commit**

```bash
git add src/lib/generation-tray.ts src/lib/generation-tray.test.ts
git commit -m "feat(tray): pure shot-label resolution (findShotAncestor + resolveShotLabel)"
```

---

### Task 2: Pure tray shaping (`latestJobPerNode` + `deriveTrayItems`)

The heart of the tray: reduce all job rows to the latest per node, map DB status → tray status, apply the stale-image-running → Failed rule, drop approved-Ready items, and sort.

**Files:**
- Modify: `src/lib/generation-tray.ts`
- Test: `src/lib/generation-tray.test.ts`

**Interfaces:**
- Consumes: `findShotAncestor` (Task 1); `GenerationRow` from `@/lib/db/types`.
- Produces:
  - `STALE_RUNNING_MS: number` (60_000)
  - `type TrayStatus = "running" | "ready" | "failed"`
  - `type TrayItem = { nodeId; assetType: "image"|"video"; status: TrayStatus; shotLabel: string; order: number; generationId: string; versionId: string | null }`
  - `latestJobPerNode(jobs: GenerationRow[]): GenerationRow[]`
  - `deriveTrayItems(nodes: AppNode[], edges: Edge[], jobs: GenerationRow[], nowMs: number): TrayItem[]`

- [ ] **Step 1: Write the failing test** (append to the existing test file)

```ts
// append to src/lib/generation-tray.test.ts
import { latestJobPerNode, deriveTrayItems, STALE_RUNNING_MS } from "./generation-tray";
import type { GenerationRow } from "@/lib/db/types";

const job = (over: Partial<GenerationRow>): GenerationRow =>
  ({
    id: "j", node_id: "g", type: "image", status: "running",
    provider_job_id: null, model_used: null, params_snapshot: null,
    inputs_snapshot: null, tokens_used: null, credits_consumed: null,
    version_id: null, user_id: null, error: null, meta: null,
    created_at: "2026-07-05T00:00:00.000Z", updated_at: "2026-07-05T00:00:00.000Z",
    ...over,
  });

describe("latestJobPerNode", () => {
  it("keeps only the newest row per node_id", () => {
    const rows = [
      job({ id: "a", node_id: "g", created_at: "2026-07-05T00:00:00.000Z" }),
      job({ id: "b", node_id: "g", created_at: "2026-07-05T00:01:00.000Z" }),
    ];
    const latest = latestJobPerNode(rows);
    expect(latest).toHaveLength(1);
    expect(latest[0].id).toBe("b");
  });
});

describe("deriveTrayItems", () => {
  const genNode = node("g", "image-gen", { title: "still" });
  const now = Date.parse("2026-07-05T00:00:30.000Z"); // 30s after the base timestamp

  it("maps succeeded→ready, running→running, failed→failed", () => {
    const nodes = [node("g1", "image-gen"), node("g2", "image-gen"), node("g3", "video-gen")];
    const jobs = [
      job({ id: "a", node_id: "g1", type: "image", status: "succeeded" }),
      job({ id: "b", node_id: "g2", type: "image", status: "running" }),
      job({ id: "c", node_id: "g3", type: "video", status: "failed" }),
    ];
    const items = deriveTrayItems(nodes, [], jobs, now);
    const byNode = Object.fromEntries(items.map((i) => [i.nodeId, i.status]));
    expect(byNode).toEqual({ g1: "ready", g2: "running", g3: "failed" });
  });

  it("excludes prompt jobs and jobs whose node was deleted", () => {
    const jobs = [
      job({ id: "p", node_id: "pr", type: "prompt", status: "succeeded" }),
      job({ id: "gone", node_id: "missing", type: "image", status: "succeeded" }),
    ];
    expect(deriveTrayItems([node("pr", "prompt")], [], jobs, now)).toEqual([]);
  });

  it("renders a stale running IMAGE job as failed, but not a running video", () => {
    const stale = Date.parse("2026-07-05T00:00:00.000Z") + STALE_RUNNING_MS + 1;
    const jobs = [
      job({ id: "i", node_id: "gi", type: "image", status: "running" }),
      job({ id: "v", node_id: "gv", type: "video", status: "running" }),
    ];
    const items = deriveTrayItems([node("gi", "image-gen"), node("gv", "video-gen")], [], jobs, stale);
    expect(items.find((i) => i.nodeId === "gi")?.status).toBe("failed");
    expect(items.find((i) => i.nodeId === "gv")?.status).toBe("running");
  });

  it("drops a Ready item once its node's active version is approved", () => {
    const nodes = [node("g", "image-gen", { approvalStatus: "approved" })];
    const jobs = [job({ id: "a", node_id: "g", type: "image", status: "succeeded" })];
    expect(deriveTrayItems(nodes, [], jobs, now)).toEqual([]);
  });

  it("sorts Running → Failed → Ready, then by shot order", () => {
    const nodes = [
      node("s1", "shot", { order: 1 }), node("p1", "prompt"), node("g1", "image-gen"),
      node("s2", "shot", { order: 2 }), node("p2", "prompt"), node("g2", "image-gen"),
    ];
    const edges = [edge("s1", "p1"), edge("p1", "g1"), edge("s2", "p2"), edge("p2", "g2")];
    const jobs = [
      job({ id: "ready2", node_id: "g2", status: "succeeded" }),   // shot 2, ready
      job({ id: "run1", node_id: "g1", status: "running" }),       // shot 1, running
    ];
    const order = deriveTrayItems(nodes, edges, jobs, now).map((i) => i.status);
    expect(order).toEqual(["running", "ready"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/generation-tray.test.ts`
Expected: FAIL — "deriveTrayItems is not a function".

- [ ] **Step 3: Write minimal implementation** (append to `src/lib/generation-tray.ts`)

```ts
// append to src/lib/generation-tray.ts
import type { GenerationRow } from "@/lib/db/types";

/** A running IMAGE job older than this (no completion) is derived Failed (D9). */
export const STALE_RUNNING_MS = 60_000;

export type TrayStatus = "running" | "ready" | "failed";

export type TrayItem = {
  nodeId: string;
  assetType: "image" | "video";
  status: TrayStatus;
  shotLabel: string;
  order: number;
  generationId: string;
  versionId: string | null;
};

const STATUS_RANK: Record<TrayStatus, number> = { running: 0, failed: 1, ready: 2 };

/** Reduce all rows to the single newest row per node_id (by created_at). */
export function latestJobPerNode(jobs: GenerationRow[]): GenerationRow[] {
  const latest = new Map<string, GenerationRow>();
  for (const jobRow of jobs) {
    const cur = latest.get(jobRow.node_id);
    if (!cur || Date.parse(jobRow.created_at) > Date.parse(cur.created_at)) {
      latest.set(jobRow.node_id, jobRow);
    }
  }
  return [...latest.values()];
}

/** Shape the flat tray list: navigation-only items for image/video generation nodes. */
export function deriveTrayItems(
  nodes: AppNode[],
  edges: Edge[],
  jobs: GenerationRow[],
  nowMs: number,
): TrayItem[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const items: TrayItem[] = [];

  for (const jobRow of latestJobPerNode(jobs)) {
    if (jobRow.type === "prompt") continue;            // only long-running generation
    const node = byId.get(jobRow.node_id);
    if (!node) continue;                                // node deleted → orphan row
    const assetType = jobRow.type;                      // "image" | "video"

    let status: TrayStatus =
      jobRow.status === "running" ? "running"
      : jobRow.status === "succeeded" ? "ready"
      : "failed";

    // Stale running IMAGE (client disconnected mid-request) → Failed. Video is owned
    // by the async pipeline's own reconciliation, so it is not stale-timed here.
    if (status === "running" && assetType === "image") {
      if (nowMs - Date.parse(jobRow.created_at) > STALE_RUNNING_MS) status = "failed";
    }

    // Ready persists until the active version is approved (retention = "until approved").
    if (status === "ready") {
      const approval = (node.data as { approvalStatus?: string }).approvalStatus;
      if (approval === "approved") continue;
    }

    const shot = findShotAncestor(jobRow.node_id, nodes, edges);
    const order =
      shot && typeof (shot.data as { order?: number }).order === "number"
        ? (shot.data as { order: number }).order
        : Number.POSITIVE_INFINITY;

    items.push({
      nodeId: jobRow.node_id,
      assetType,
      status,
      shotLabel: resolveShotLabel(jobRow.node_id, nodes, edges),
      order,
      generationId: jobRow.id,
      versionId: jobRow.version_id,
    });
  }

  items.sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || a.order - b.order);
  return items;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/generation-tray.test.ts`
Expected: PASS (all Task 1 + Task 2 assertions green).

- [ ] **Step 5: Commit**

```bash
git add src/lib/generation-tray.ts src/lib/generation-tray.test.ts
git commit -m "feat(tray): pure deriveTrayItems + latestJobPerNode (status map, stale, approved-drop, sort)"
```

---

### Task 3: Image-generate route writes `generations` rows (completes D26)

Bring image generation onto the shared substrate: insert a `running` row before the provider call, `succeedGeneration` after the version lands, `failGeneration` in the catch. The route's synchronous response is unchanged.

**Files:**
- Modify: `src/app/api/nodes/[id]/image-generate/route.ts`

**Interfaces:**
- Consumes: `insertGeneration`, `succeedGeneration`, `failGeneration` from `@/lib/db/generations` (already exist — used by video).
- Produces: `generations` rows with `type: "image"` — the data source Tasks 5–6 read.

- [ ] **Step 1: Add the import**

At the top of the route, alongside the existing version imports:

```ts
import { insertGeneration, succeedGeneration, failGeneration } from "@/lib/db/generations";
```

- [ ] **Step 2: Insert the running row just before the `try`**

Replace the line `  try {` (currently at ~line 143) with an insert **above** the try, so both the success and error paths can reference `generation.id`:

```ts
  // Join the shared generations substrate (D26) — image is the synchronous fast path.
  const generation = await insertGeneration({
    nodeId,
    type: "image",
    modelUsed: modelId,
    paramsSnapshot: validatedParams,
    inputsSnapshot: inputsUsed,
  });

  try {
```

- [ ] **Step 3: Mark success after the version is active**

Immediately after `await setActiveVersion(nodeId, version.id);` and before `return apiOk(...)`:

```ts
    await succeedGeneration({ generationId: generation.id, versionId: version.id });

    return apiOk({ imageUrl, versionId: version.id });
```

- [ ] **Step 4: Mark failure in the catch**

In the `catch (e)` block, after the existing best-effort `insertVersion({ ...error })` and before `return apiError(...)`:

```ts
    await failGeneration({ generationId: generation.id, error: message }).catch(() => null);
    return apiError(message, 500);
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors in `image-generate/route.ts`.

- [ ] **Step 6: Manual verification**

Start the app (`npm run dev`), open a canvas with a Prompt → Image Gen chain, click Generate. In Supabase (or `listGenerations`), confirm a `generations` row appears with `type='image'`, `status='running'` then `status='succeeded'` and a non-null `version_id`. Force an error (e.g. disconnect the provider key) and confirm a row ends `status='failed'` with `error` set.

> **No unit test:** routes in this repo are not unit-tested (no HTTP/DB harness in node-env vitest); this task is verified by typecheck + manual, consistent with the codebase.

- [ ] **Step 7: Commit**

```bash
git add "src/app/api/nodes/[id]/image-generate/route.ts"
git commit -m "feat(tray): image-generate writes generations rows (completes D26)"
```

---

### Task 4: Canvas store — tray slice + `focusedNodeId`

Add the store fields the tray reads/writes: a map of live job rows (fed by Realtime) and the programmatic focus-open signal.

**Files:**
- Modify: `src/lib/canvas-store.ts`
- Test: `src/lib/canvas-store.test.ts`

**Interfaces:**
- Consumes: `GenerationRow` from `@/lib/db/types`.
- Produces (on `CanvasState`):
  - `trayJobs: Record<string, GenerationRow>` (keyed by generation id)
  - `setTrayJobs(jobs: GenerationRow[]): void`
  - `upsertTrayJob(job: GenerationRow): void`
  - `focusedNodeId: string | null`
  - `setFocusedNodeId(id: string | null): void`

- [ ] **Step 1: Write the failing test** (append to the existing store test file)

```ts
// append to src/lib/canvas-store.test.ts
import { describe, it, expect } from "vitest";
import { createCanvasStore } from "./canvas-store";
import type { GenerationRow } from "./db/types";

const genRow = (over: Partial<GenerationRow>): GenerationRow =>
  ({
    id: "j", node_id: "g", type: "image", status: "running",
    provider_job_id: null, model_used: null, params_snapshot: null,
    inputs_snapshot: null, tokens_used: null, credits_consumed: null,
    version_id: null, user_id: null, error: null, meta: null,
    created_at: "2026-07-05T00:00:00.000Z", updated_at: "2026-07-05T00:00:00.000Z",
    ...over,
  });

describe("canvas store — tray slice", () => {
  it("starts empty and seeds via setTrayJobs", () => {
    const store = createCanvasStore();
    expect(store.getState().trayJobs).toEqual({});
    store.getState().setTrayJobs([genRow({ id: "a" }), genRow({ id: "b" })]);
    expect(Object.keys(store.getState().trayJobs).sort()).toEqual(["a", "b"]);
  });

  it("upsertTrayJob replaces a row by id", () => {
    const store = createCanvasStore();
    store.getState().upsertTrayJob(genRow({ id: "a", status: "running" }));
    store.getState().upsertTrayJob(genRow({ id: "a", status: "succeeded" }));
    expect(Object.keys(store.getState().trayJobs)).toEqual(["a"]);
    expect(store.getState().trayJobs.a.status).toBe("succeeded");
  });
});

describe("canvas store — focusedNodeId", () => {
  it("starts null and can be set/cleared", () => {
    const store = createCanvasStore();
    expect(store.getState().focusedNodeId).toBeNull();
    store.getState().setFocusedNodeId("node-1");
    expect(store.getState().focusedNodeId).toBe("node-1");
    store.getState().setFocusedNodeId(null);
    expect(store.getState().focusedNodeId).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/canvas-store.test.ts`
Expected: FAIL — `trayJobs` / `setFocusedNodeId` undefined.

- [ ] **Step 3: Add the import** (top of `src/lib/canvas-store.ts`)

```ts
import type { GenerationRow } from "@/lib/db/types";
```

- [ ] **Step 4: Extend the `CanvasState` type** — add these fields after the `videoGenStatus` block:

```ts
  // Generation Tray — live job rows for this canvas (fed by the tray's Realtime hook),
  // keyed by generation id. The tray derives its list from these + the node graph (D9).
  trayJobs: Record<string, GenerationRow>;
  setTrayJobs: (jobs: GenerationRow[]) => void;
  upsertTrayJob: (job: GenerationRow) => void;
  // Programmatic focus-view open signal — set by the tray to open a node's focus view.
  focusedNodeId: string | null;
  setFocusedNodeId: (id: string | null) => void;
```

- [ ] **Step 5: Add the implementation** — inside `createCanvasStore`, after the `setVideoGenError` block and before `kbStatus`:

```ts
    trayJobs: {},
    setTrayJobs: (jobs) =>
      set({ trayJobs: Object.fromEntries(jobs.map((j) => [j.id, j])) }),
    upsertTrayJob: (job) =>
      set((s) => ({ trayJobs: { ...s.trayJobs, [job.id]: job } })),

    focusedNodeId: null,
    setFocusedNodeId: (id) => set({ focusedNodeId: id }),
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run src/lib/canvas-store.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/canvas-store.ts src/lib/canvas-store.test.ts
git commit -m "feat(tray): canvas store tray slice + focusedNodeId"
```

---

### Task 5: Realtime hook `use-generation-tray.ts`

One canvas-level Supabase subscription that hydrates the store on mount and keeps it live, filtering events to this canvas's nodes client-side. Mirrors the hydration + channel pattern of `use-video-gen-status.ts`.

**Files:**
- Create: `src/hooks/use-generation-tray.ts`

**Interfaces:**
- Consumes: `createBrowserSupabase` from `@/lib/supabase/client`; `useCanvasStore` + `useCanvasStoreApi` from the store provider; `setTrayJobs` / `upsertTrayJob` (Task 4); `GenerationRow`.
- Produces: `useGenerationTray(canvasId: string): void` — side-effect hook (no return).

- [ ] **Step 1: Implement the hook**

```ts
// src/hooks/use-generation-tray.ts
"use client";

import { useEffect } from "react";
import { createBrowserSupabase } from "@/lib/supabase/client";
import {
  useCanvasStore,
  useCanvasStoreApi,
} from "@/components/canvas/canvas-store-provider";
import type { GenerationRow } from "@/lib/db/types";

/**
 * Canvas-level Generation Tray data source. One Realtime channel per canvas on the
 * `generations` table; events are filtered to this canvas's node ids client-side
 * (job rows carry node_id, not canvas_id — we deliberately don't denormalize one).
 * Coexists with the per-node use-video-gen-status subscription (separate concern).
 */
export function useGenerationTray(canvasId: string): void {
  const setTrayJobs = useCanvasStore((s) => s.setTrayJobs);
  const upsertTrayJob = useCanvasStore((s) => s.upsertTrayJob);
  const storeApi = useCanvasStoreApi();

  // Hydrate: latest generations for this canvas's nodes (reconstructs after refresh).
  useEffect(() => {
    let cancelled = false;
    const nodeIds = storeApi.getState().nodes.map((n) => n.id);
    if (nodeIds.length === 0) return;
    const supabase = createBrowserSupabase();
    supabase
      .from("generations")
      .select("*")
      .in("node_id", nodeIds)
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (cancelled || error || !data) return;
        setTrayJobs(data as GenerationRow[]);
      });
    return () => { cancelled = true; };
  }, [canvasId, setTrayJobs, storeApi]);

  // Live: one channel for the whole canvas; ignore rows for other canvases' nodes.
  useEffect(() => {
    const supabase = createBrowserSupabase();
    const channel = supabase
      .channel(`generation-tray:${canvasId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "generations" },
        (payload) => {
          const row = payload.new as GenerationRow;
          if (!row?.id) return;
          const ids = new Set(storeApi.getState().nodes.map((n) => n.id));
          if (!ids.has(row.node_id)) return;
          upsertTrayJob(row);
        },
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [canvasId, upsertTrayJob, storeApi]);
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/use-generation-tray.ts
git commit -m "feat(tray): canvas-level Realtime hook (hydrate + subscribe)"
```

> Verified end-to-end in Task 8's manual pass (needs the rendered tray).

---

### Task 6: Tray components (`generation-tray-item.tsx` + `generation-tray.tsx`)

The presentational row and the floating right-edge rail. The rail derives its list with `deriveTrayItems`, subscribes via `useGenerationTray`, and on click flies the canvas to the node and sets `focusedNodeId`.

**Files:**
- Create: `src/components/canvas/generation-tray-item.tsx`
- Create: `src/components/canvas/generation-tray.tsx`

**Interfaces:**
- Consumes: `TrayItem`, `deriveTrayItems` (Task 2); `useGenerationTray` (Task 5); store slices `nodes`/`edges`/`trayJobs`/`setFocusedNodeId` (Task 4); `useReactFlow` (needs Task 7's provider at runtime).
- Produces: `<GenerationTray canvasId={string} />` (rendered in Task 7).

- [ ] **Step 1: Implement the item row**

```tsx
// src/components/canvas/generation-tray-item.tsx
import { Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TrayItem } from "@/lib/generation-tray";

const STATUS_META: Record<
  TrayItem["status"],
  { label: string; icon: typeof Loader2; tone: string; spin?: boolean }
> = {
  running: { label: "Running", icon: Loader2, tone: "text-primary", spin: true },
  ready:   { label: "Ready",   icon: CheckCircle2, tone: "text-primary" },
  failed:  { label: "Failed",  icon: AlertTriangle, tone: "text-muted-foreground" },
};

export function GenerationTrayItem({
  item,
  onOpen,
}: {
  item: TrayItem;
  onOpen: (nodeId: string) => void;
}) {
  const meta = STATUS_META[item.status];
  const Icon = meta.icon;
  const assetLabel = item.assetType === "image" ? "Image" : "Video";
  return (
    <button
      onClick={() => onOpen(item.nodeId)}
      className={cn(
        "flex w-full items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-left",
        "shadow-card transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-px",
      )}
    >
      <Icon className={cn("size-3.5 shrink-0 stroke-[1.5]", meta.tone, meta.spin && "animate-spin")} />
      <span className="flex-1 truncate text-xs font-medium text-foreground">
        {item.shotLabel} · {assetLabel}
      </span>
      <span className="text-eyebrow !text-[0.6rem] text-muted-foreground">{meta.label}</span>
    </button>
  );
}
```

- [ ] **Step 2: Implement the rail**

```tsx
// src/components/canvas/generation-tray.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useReactFlow } from "@xyflow/react";
import { useShallow } from "zustand/react/shallow";
import { ChevronDown, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCanvasStore } from "@/components/canvas/canvas-store-provider";
import { useGenerationTray } from "@/hooks/use-generation-tray";
import { deriveTrayItems, type TrayStatus } from "@/lib/generation-tray";
import { GenerationTrayItem } from "./generation-tray-item";

const COLLAPSE_KEY = "generation-tray-collapsed";

export function GenerationTray({ canvasId }: { canvasId: string }) {
  useGenerationTray(canvasId);

  const { nodes, edges, trayJobs, setFocusedNodeId } = useCanvasStore(
    useShallow((s) => ({
      nodes: s.nodes,
      edges: s.edges,
      trayJobs: s.trayJobs,
      setFocusedNodeId: s.setFocusedNodeId,
    })),
  );
  const { setCenter, getNode } = useReactFlow();

  // Collapse preference persists across sessions (spec §8). Start expanded to avoid
  // a hydration mismatch, then read localStorage on mount.
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1");
  }, []);
  const toggleCollapsed = (next: boolean) => {
    setCollapsed(next);
    localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
  };

  const items = useMemo(
    () => deriveTrayItems(nodes, edges, Object.values(trayJobs), Date.now()),
    [nodes, edges, trayJobs],
  );

  if (items.length === 0) return null;

  const counts = items.reduce<Record<TrayStatus, number>>(
    (acc, i) => { acc[i.status] += 1; return acc; },
    { running: 0, ready: 0, failed: 0 },
  );

  const onOpen = (nodeId: string) => {
    const node = getNode(nodeId);
    if (node) setCenter(node.position.x + 120, node.position.y + 60, { zoom: 1, duration: 500 });
    setFocusedNodeId(nodeId);
  };

  if (collapsed) {
    return (
      <button
        onClick={() => toggleCollapsed(false)}
        className="absolute right-4 top-1/2 z-20 flex -translate-y-1/2 items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 shadow-card"
        aria-label="Expand generation tray"
      >
        <span className="flex items-center gap-1 text-xs text-primary">
          <Loader2 className="size-3 animate-spin stroke-[1.5]" /> {counts.running}
        </span>
        <span className="flex items-center gap-1 text-xs text-primary">
          <CheckCircle2 className="size-3 stroke-[1.5]" /> {counts.ready}
        </span>
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <AlertTriangle className="size-3 stroke-[1.5]" /> {counts.failed}
        </span>
      </button>
    );
  }

  return (
    <div className="absolute right-4 top-1/2 z-20 flex w-64 -translate-y-1/2 flex-col rounded-xl border border-border bg-card/95 shadow-card backdrop-blur">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="text-eyebrow !text-[0.65rem]">Generation Tray</span>
        <button
          onClick={() => toggleCollapsed(true)}
          className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted"
          aria-label="Collapse generation tray"
        >
          <ChevronDown className="size-4 stroke-[1.5]" />
        </button>
      </div>
      <div className={cn("flex flex-col gap-1.5 overflow-y-auto p-2", "max-h-[50vh]")}>
        {items.map((item) => (
          <GenerationTrayItem key={item.nodeId} item={item} onOpen={onOpen} />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/canvas/generation-tray-item.tsx src/components/canvas/generation-tray.tsx
git commit -m "feat(tray): floating right-edge rail + item row"
```

---

### Task 7: Wire into the canvas (`<ReactFlowProvider>` + render the tray)

Add the provider so the tray can reach the viewport API, and render the tray as a sibling overlay of `<ReactFlow>`.

**Files:**
- Modify: `src/components/canvas/canvas.tsx`

**Interfaces:**
- Consumes: `<GenerationTray>` (Task 6); `ReactFlowProvider` from `@xyflow/react`.

- [ ] **Step 1: Add imports**

Add `ReactFlowProvider` to the existing `@xyflow/react` import, and import the tray:

```ts
import {
  Background,
  BackgroundVariant,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  SelectionMode,
  type Connection,
  type Edge,
  type NodeTypes,
  type OnBeforeDelete,
  type XYPosition,
} from "@xyflow/react";
// ...
import { GenerationTray } from "./generation-tray";
```

- [ ] **Step 2: Wrap the return in `<ReactFlowProvider>` and render the tray**

Wrap the existing `<CanvasEditableProvider>…</CanvasEditableProvider>` tree in `<ReactFlowProvider>`, and add `<GenerationTray>` as a sibling of `<ReactFlow>` inside the inner `div` (so it sits within the provider and over the canvas):

```tsx
  return (
    <ReactFlowProvider>
    <CanvasEditableProvider value={canEdit}>
    <div className="absolute inset-0 bg-[var(--neutral-50)]">
      {/* ...existing CanvasAutosave / LockBanner / DeleteConfirmDialog / QuickAddMenu... */}

      <ReactFlow
        {/* ...unchanged props... */}
      >
        <Background variant={BackgroundVariant.Dots} gap={48} size={2} color="rgba(148,163,184,0.45)" />
        <Controls showInteractive={false} />
      </ReactFlow>

      <GenerationTray canvasId={canvasId} />
    </div>
    </CanvasEditableProvider>
    </ReactFlowProvider>
  );
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/canvas/canvas.tsx
git commit -m "feat(tray): wrap canvas in ReactFlowProvider + render GenerationTray"
```

---

### Task 8: Generating nodes open their focus view on `focusedNodeId`

Let the tray open a node's focus view: when `focusedNodeId` matches the node, open its sheet and consume the signal.

**Files:**
- Modify: `src/components/nodes/image-gen-node.tsx`
- Modify: `src/components/nodes/video-gen-node.tsx`

**Interfaces:**
- Consumes: `focusedNodeId` / `setFocusedNodeId` (Task 4); the existing local `setFocusOpen`.

- [ ] **Step 1: image-gen-node — import `useEffect` and read the store fields**

Change the React import to include `useEffect`, and add the store reads near the other `useCanvasStore` calls:

```ts
import { useEffect, useMemo, useState } from "react";
// ...
  const focusedNodeId = useCanvasStore((s) => s.focusedNodeId);
  const setFocusedNodeId = useCanvasStore((s) => s.setFocusedNodeId);
```

- [ ] **Step 2: image-gen-node — add the open-on-focus effect**

After `const [isProcessing, setIsProcessing] = useState(false);`:

```ts
  // Opened programmatically from the Generation Tray: open the focus view, then
  // consume the signal so a later click on the same node re-triggers it.
  useEffect(() => {
    if (focusedNodeId === id) {
      setFocusOpen(true);
      setFocusedNodeId(null);
    }
  }, [focusedNodeId, id, setFocusedNodeId]);
```

- [ ] **Step 3: video-gen-node — mirror the same change**

Change its React import to include `useEffect` (`import { useEffect, useState, useCallback } from "react";`), add the two store reads, and add the identical effect after `const [focusOpen, setFocusOpen] = useState(false);`:

```ts
  const focusedNodeId = useCanvasStore((s) => s.focusedNodeId);
  const setFocusedNodeId = useCanvasStore((s) => s.setFocusedNodeId);

  useEffect(() => {
    if (focusedNodeId === id) {
      setFocusOpen(true);
      setFocusedNodeId(null);
    }
  }, [focusedNodeId, id, setFocusedNodeId]);
```

- [ ] **Step 4: Typecheck + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 5: Full manual verification pass** (this is the feature's acceptance test)

Run `npm run dev`, open a canvas, and confirm:
1. **Image running → ready:** wire Prompt → Image Gen, Generate, close the focus view → an item appears **Running**, flips to **Ready** on completion.
2. **Refresh mid-run:** start an image gen, refresh the page → the tray reconstructs the **Running** item (and → Ready when the server finishes).
3. **Approve drops it:** open the Ready item's node, Approve → the item leaves the tray.
4. **Video path:** Generate a video → **Running** (survives close/refresh) → **Ready**.
5. **Failed path:** force a provider error → **Failed** item; click it → focus view shows the error UI.
6. **Click navigation:** click any item → the canvas flies (~500ms) to the node and its focus view opens.
7. **Collapse:** collapse → count pill (`◌ n · ● n · ✕ n`); expand again works.
8. **Empty:** on a fresh canvas with no generations, the rail is not rendered.
9. **Read-only viewer:** open the same canvas in a second tab (D33 lock → read-only) → the tray is visible and clicking navigates; generation/approval remain gated.

- [ ] **Step 6: Commit**

```bash
git add src/components/nodes/image-gen-node.tsx src/components/nodes/video-gen-node.tsx
git commit -m "feat(tray): generating nodes open focus view on focusedNodeId"
```

---

### Task 9: Final verification + green baseline

Confirm the whole suite, types, and lint are clean before handing off.

**Files:** none (verification only).

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: PASS, including the new `generation-tray` and `canvas-store` tests; no regressions.

- [ ] **Step 2: Typecheck + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean.

- [ ] **Step 3: Confirm the branch history**

Run: `git log --oneline d1833be..HEAD`
Expected: the spec/PRD commits plus Tasks 1–8 commits, in order.

---

## Notes & known limitations (from the spec — intentional, not gaps)

- **Cross-session approval** reconciles on next canvas load, not live (approval isn't on the tray's Realtime channel).
- **Stale-image → Failed** is derived when the list re-derives (a Realtime event or node change). On a fully idle canvas a stuck `running` image flips to Failed on the next store change / reload rather than on a wall-clock timer — acceptable for MVP (the common case is reload, where `Date.now()` is fresh).
- **Image persistence** is reconstructable-running + reconstructable-ready, not video's guaranteed-completion (image stays synchronous per D26). A dead mid-request handler is caught by the stale rule.
- **Data source is client-side** (the hook hydrates via a browser Supabase query, mirroring `use-video-gen-status`) rather than server-seeded through the provider — smaller surface, same behavior; brief first-paint before hydration is acceptable.
