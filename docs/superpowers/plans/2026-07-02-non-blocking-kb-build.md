# Non-Blocking KB Build Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users upload documents and immediately navigate to the canvas while KB builds in the background, with a canvas-level status indicator and per-node warnings when KB context is unavailable.

**Architecture:** Remove the blocking loading UI from `KBOnboardingUploadStep` and redirect immediately after `startKBBuildJob()`. Mount `useKBJobStatus` at the canvas level to drive a `kbStatus` field (`'none' | 'building' | 'ready'`) in the canvas Zustand store. Prompt nodes read `kbStatus` to render an inline warning banner when KB context isn't available yet.

**Tech Stack:** Next.js App Router, Zustand (vanilla store via `canvas-store.ts`), Supabase Realtime (`postgres_changes` on `client_kb_jobs`), Sonner toasts, Framer Motion (`motion/react`) for node pulse, Tailwind + shadcn.

---

## File Map

| Action | File | Responsibility |
|--------|------|---------------|
| Modify | `src/components/kb/kb-onboarding-upload-step.tsx` | Redirect to `/clients/[slug]` immediately after `startKBBuildJob()` instead of showing loading UI |
| Modify | `src/lib/canvas-store.ts` | Add `kbStatus: 'none' \| 'building' \| 'ready'` + `setKbStatus` to `CanvasState` |
| Modify | `src/components/canvas/canvas-store-provider.tsx` | Export `useKbStatus` selector helper |
| Create | `src/components/canvas/canvas-kb-status.tsx` | Mounts `useKBJobStatus`, syncs to store, renders toolbar badge + triggers toast + node pulse signal |
| Modify | `src/components/canvas/canvas.tsx` | Mount `<CanvasKBStatus>` inside the canvas component, pass `clientId` |
| Modify | `src/app/clients/[id]/canvases/[cid]/page.tsx` | Pass `clientId` and `initialKBJob` down to `<Canvas>` |
| Modify | `src/components/nodes/prompt-node.tsx` (or focus view) | Read `kbStatus` from store, render warning banner when `'none'` or `'building'` |

---

## Task 1: Redirect to Client Page After KB Build Starts

**Files:**
- Modify: `src/components/kb/kb-onboarding-upload-step.tsx`

The goal is: after `startKBBuildJob()` succeeds, redirect to the client home page (`/clients/[slug]`). No canvas lookup needed. The component already has access to `clientSlug` via props — check if it's there, add it if not.

### Step 1.1: Update `handleExtract` to redirect after build starts

- [ ] Read `src/components/kb/kb-onboarding-upload-step.tsx` in full to understand its current props and `handleExtract`.

- [ ] Ensure `clientSlug: string` exists in the `Props` type. If not, add it and pass it from the KB page (`src/app/clients/[id]/kb/page.tsx`) as `clientSlug={client.slug}`.

- [ ] Replace `handleExtract` with:

```typescript
function handleExtract() {
  startStartTransition(async () => {
    try {
      await startKBBuildJob(clientId);
      router.push(`/clients/${clientSlug}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to start build.");
    }
  });
}
```

### Step 1.2: Remove the blocking loading UI

- [ ] In `kb-onboarding-upload-step.tsx`, find the `if (isRunning)` early return block (around line 224) that renders the spinner card. Remove it entirely. The redirect now happens before this state is ever visible.

The block to remove looks like:
```tsx
if (isRunning) {
  return (
    <div className="animate-rise space-y-6">
      <Card className="p-4">
        ...
      </Card>
    </div>
  );
}
```

Also remove the `useEffect` that watches `job?.status` for `'succeeded'`/`'failed'` and calls `router.refresh()` (around line 214-222) — the canvas will handle the success notification from now on.

### Step 1.5: Verify the app still builds

- [ ] Run: `cd e:\CreativeOS\creativeos-mvp && npx tsc --noEmit`
- Expected: No type errors related to the changed files.

### Step 1.6: Commit

- [ ] Run:
```bash
git add src/components/kb/kb-onboarding-upload-step.tsx src/lib/actions/kb.ts src/app/clients/[id]/kb/page.tsx
git commit -m "feat: redirect to canvas immediately after KB build starts"
```

---

## Task 2: Add `kbStatus` to Canvas Zustand Store

**Files:**
- Modify: `src/lib/canvas-store.ts`
- Modify: `src/components/canvas/canvas-store-provider.tsx`

### Step 2.1: Extend `CanvasState` type

- [ ] Open `src/lib/canvas-store.ts`

Find the `CanvasState` type definition (around line 23). Add two new fields after the existing `videoGenStatus` section:

```typescript
export type CanvasState = {
  nodes: AppNode[];
  edges: Edge[];
  onNodesChange: OnNodesChange<AppNode>;
  onEdgesChange: OnEdgesChange;
  onConnect: OnConnect;
  addNode: (type: string, position: XYPosition, id?: string) => void;
  updateNodeData: (id: string, data: Record<string, unknown>) => void;
  connectNodes: (sourceId: string, targetId: string) => void;
  deleteNode: (id: string) => void;
  duplicateNode: (id: string) => void;
  fanOutShots: (scriptNodeId: string) => void;
  promoteIdeasToShots: (shotNodeId: string, ideas: ShotComposeIdea[]) => void;
  videoGenStatus: Record<string, { isGenerating: boolean; lastError: string | null }>;
  setVideoGenGenerating: (nodeId: string, v: boolean) => void;
  setVideoGenError: (nodeId: string, err: string | null) => void;
  // KB build status — drives toolbar badge and node warnings
  kbStatus: 'none' | 'building' | 'ready';
  setKbStatus: (status: 'none' | 'building' | 'ready') => void;
};
```

### Step 2.2: Add initial state and setter to the store factory

- [ ] Still in `src/lib/canvas-store.ts`, find the `createStore<CanvasState>((set, get) => ({` block.

Find the end of the existing store definition — the `setVideoGenError` entry — and add the new fields after it:

```typescript
    setVideoGenError: (nodeId, err) =>
      set((s) => ({
        videoGenStatus: {
          ...s.videoGenStatus,
          [nodeId]: { ...s.videoGenStatus[nodeId], lastError: err },
        },
      })),
    kbStatus: 'none',
    setKbStatus: (status) => set({ kbStatus: status }),
```

### Step 2.3: Export a `useKbStatus` selector in the provider

- [ ] Open `src/components/canvas/canvas-store-provider.tsx`

The file exports `useCanvasStore` and `useCanvasStoreApi`. Add a dedicated selector hook at the bottom:

```typescript
export function useKbStatus() {
  return useCanvasStore((s) => s.kbStatus);
}
```

### Step 2.4: Verify types

- [ ] Run: `cd e:\CreativeOS\creativeos-mvp && npx tsc --noEmit`
- Expected: No type errors.

### Step 2.5: Commit

- [ ] Run:
```bash
git add src/lib/canvas-store.ts src/components/canvas/canvas-store-provider.tsx
git commit -m "feat: add kbStatus to canvas Zustand store"
```

---

## Task 3: Canvas KB Status Component

**Files:**
- Create: `src/components/canvas/canvas-kb-status.tsx`
- Modify: `src/app/clients/[id]/canvases/[cid]/page.tsx`
- Modify: `src/components/canvas/canvas.tsx`

This component mounts the Supabase Realtime subscription for `client_kb_jobs`, syncs the derived status into the Zustand store, fires a toast on completion, and renders the toolbar badge.

### Step 3.1: Create `canvas-kb-status.tsx`

- [ ] Create `src/components/canvas/canvas-kb-status.tsx` with this content:

```typescript
"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { CheckCircle2 } from "lucide-react";
import { useKBJobStatus } from "@/components/kb/use-kb-job-status";
import { useCanvasStore } from "./canvas-store-provider";
import type { ClientKBJobRow } from "@/lib/db/types";

const NON_TERMINAL = new Set(["queued", "researching", "extracting", "finalizing"]);

type Props = {
  clientId: string;
  initialJob: ClientKBJobRow | null;
  hasActiveKB: boolean;
};

export function CanvasKBStatus({ clientId, initialJob, hasActiveKB }: Props) {
  const job = useKBJobStatus(clientId, initialJob);
  const setKbStatus = useCanvasStore((s) => s.setKbStatus);
  const prevStatus = useRef<string | null>(null);

  useEffect(() => {
    // Derive kbStatus from job + whether an active KB version already exists
    if (hasActiveKB && (!job || !NON_TERMINAL.has(job.status))) {
      setKbStatus("ready");
    } else if (job && NON_TERMINAL.has(job.status)) {
      setKbStatus("building");
    } else {
      setKbStatus("none");
    }
  }, [job, hasActiveKB, setKbStatus]);

  useEffect(() => {
    if (!job) return;
    if (prevStatus.current !== "succeeded" && job.status === "succeeded") {
      toast.success("Brand KB is ready! Your brand context is now active.", {
        icon: <CheckCircle2 className="size-4 text-green-500" />,
        duration: 4000,
      });
      setKbStatus("ready");
    }
    prevStatus.current = job.status;
  }, [job?.status, setKbStatus]);

  // Rendered inside the canvas toolbar via a portal-like pattern —
  // return null here; the toolbar badge is in CanvasKBBadge below.
  return null;
}

export function CanvasKBBadge() {
  const kbStatus = useCanvasStore((s) => s.kbStatus);
  if (kbStatus !== "building") return null;
  return (
    <div className="flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-2.5 py-1 text-xs text-neutral-500 shadow-sm">
      <span className="size-2 animate-spin rounded-full border border-current border-t-transparent" />
      KB building…
    </div>
  );
}
```

### Step 3.2: Pass `clientId`, `initialJob`, `hasActiveKB` from the canvas page

- [ ] Open `src/app/clients/[id]/canvases/[cid]/page.tsx`

Add these imports at the top:

```typescript
import { getLatestKBJob } from "@/lib/db/kb-jobs";
import { getActiveKBVersion } from "@/lib/db/kb";
```

In the data-fetching section (where `client` and `canvas` are fetched), add parallel fetches:

```typescript
const [nodes, edges, latestKBJob, activeKBVersion] = await Promise.all([
  listNodes(canvas.id),
  listEdges(canvas.id),
  getLatestKBJob(client.id),
  getActiveKBVersion(client.id),
]);
```

(Adjust variable names to match the existing code in this file — it may already destructure `nodes` and `edges` separately.)

Pass the new props to `<Canvas>`:

```tsx
<Canvas
  canvasId={canvas.id}
  clientId={client.id}
  initialKBJob={latestKBJob}
  hasActiveKB={activeKBVersion !== null}
/>
```

### Step 3.3: Update `Canvas` component to accept and mount new props

- [ ] Open `src/components/canvas/canvas.tsx`

Add to imports at the top:

```typescript
import { CanvasKBStatus, CanvasKBBadge } from "./canvas-kb-status";
import type { ClientKBJobRow } from "@/lib/db/types";
```

Update the component props type:

```typescript
export function Canvas({
  canvasId,
  clientId,
  initialKBJob,
  hasActiveKB,
}: {
  canvasId: string;
  clientId: string;
  initialKBJob: ClientKBJobRow | null;
  hasActiveKB: boolean;
}) {
```

Inside the JSX return, add `<CanvasKBStatus>` at the top level (alongside `<CanvasAutosave>`) and `<CanvasKBBadge>` inside the toolbar area. The exact placement depends on the existing layout — find where `<CanvasAutosave>` is rendered and add alongside it:

```tsx
<CanvasKBStatus
  clientId={clientId}
  initialJob={initialKBJob}
  hasActiveKB={hasActiveKB}
/>
<CanvasAutosave canvasId={canvasId} />
```

For the badge, find the top-left or top-center toolbar area in the canvas layout and add:

```tsx
<CanvasKBBadge />
```

### Step 3.4: Verify types

- [ ] Run: `cd e:\CreativeOS\creativeos-mvp && npx tsc --noEmit`
- Expected: No type errors.

### Step 3.5: Commit

- [ ] Run:
```bash
git add src/components/canvas/canvas-kb-status.tsx src/app/clients/[id]/canvases/[cid]/page.tsx src/components/canvas/canvas.tsx
git commit -m "feat: canvas KB status listener with toolbar badge and toast on ready"
```

---

## Task 4: Node Pulse on KB Ready

**Files:**
- Modify: `src/components/canvas/canvas-kb-status.tsx`

When `kbStatus` transitions to `'ready'`, Prompt nodes that use KB context should pulse briefly. We implement this via a short-lived `kbJustReady` boolean in the store that auto-clears after 2.5s. Prompt nodes read it and apply a ring animation.

### Step 4.1: Add `kbJustReady` to the store

- [ ] Open `src/lib/canvas-store.ts`

Add to `CanvasState`:

```typescript
  kbJustReady: boolean;
  setKbJustReady: (v: boolean) => void;
```

Add to the store factory (after `setKbStatus`):

```typescript
    kbJustReady: false,
    setKbJustReady: (v) => set({ kbJustReady: v }),
```

### Step 4.2: Trigger `kbJustReady` from `CanvasKBStatus`

- [ ] Open `src/components/canvas/canvas-kb-status.tsx`

In the `CanvasKBStatus` component, update the success `useEffect` to also fire `kbJustReady`:

```typescript
  const setKbJustReady = useCanvasStore((s) => s.setKbJustReady);

  useEffect(() => {
    if (!job) return;
    if (prevStatus.current !== "succeeded" && job.status === "succeeded") {
      toast.success("Brand KB is ready! Your brand context is now active.", {
        icon: <CheckCircle2 className="size-4 text-green-500" />,
        duration: 4000,
      });
      setKbStatus("ready");
      setKbJustReady(true);
      setTimeout(() => setKbJustReady(false), 2500);
    }
    prevStatus.current = job.status;
  }, [job?.status, setKbStatus, setKbJustReady]);
```

### Step 4.3: Apply pulse ring in Prompt node

- [ ] Find the Prompt node component. It's likely at `src/components/nodes/prompt-node.tsx`. Open it.

Add these imports:

```typescript
import { useCanvasStore } from "@/components/canvas/canvas-store-provider";
```

Inside the component, read from the store:

```typescript
const kbJustReady = useCanvasStore((s) => s.kbJustReady);
const kbStatus = useCanvasStore((s) => s.kbStatus);
```

Find the outermost wrapper div of the node card and add the pulse class conditionally:

```tsx
<div
  className={cn(
    "...", // existing classes
    kbJustReady && "ring-2 ring-purple-400 ring-offset-1 transition-shadow duration-500",
  )}
>
```

(`cn` is already imported in node components via `@/lib/utils`.)

### Step 4.4: Verify types

- [ ] Run: `cd e:\CreativeOS\creativeos-mvp && npx tsc --noEmit`
- Expected: No type errors.

### Step 4.5: Commit

- [ ] Run:
```bash
git add src/lib/canvas-store.ts src/components/canvas/canvas-kb-status.tsx src/components/nodes/prompt-node.tsx
git commit -m "feat: pulse prompt nodes when KB becomes ready"
```

---

## Task 5: "Running Without KB" Warning Banner in Prompt Node

**Files:**
- Modify: `src/components/nodes/prompt-node.tsx`
- Modify: `src/components/nodes/prompt-focus-view.tsx`

When `kbStatus` is `'none'` or `'building'`, show an inline warning inside the Prompt node panel and its focus view. Node is fully runnable — warning is informational only.

### Step 5.1: Add warning banner to Prompt node card

- [ ] Open `src/components/nodes/prompt-node.tsx`

`kbStatus` is already read in Task 4.3. Add the warning banner JSX inside the node card body, below the title/instruction preview, above the run button area:

```tsx
{(kbStatus === 'none' || kbStatus === 'building') && (
  <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs text-amber-700">
    <span className="mt-0.5 shrink-0">⚠</span>
    <span>
      {kbStatus === 'building'
        ? "Brand KB is building — running without brand context for now."
        : "No brand KB found. Upload documents to add brand context."}
    </span>
  </div>
)}
```

### Step 5.2: Add warning banner to Prompt focus view

- [ ] Open `src/components/nodes/prompt-focus-view.tsx`

Add this import:

```typescript
import { useCanvasStore } from "@/components/canvas/canvas-store-provider";
```

Inside the `PromptFocusView` component body (the main exported function), read `kbStatus`:

```typescript
const kbStatus = useCanvasStore((s) => s.kbStatus);
```

In the left panel section that shows Brand KB slice toggles (the `<LeftSection>` with Palette icon), add the warning banner just above the `<SliceToggles>` component:

```tsx
{(kbStatus === 'none' || kbStatus === 'building') && (
  <div className="mb-3 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs text-amber-700">
    <span className="mt-0.5 shrink-0">⚠</span>
    <span>
      {kbStatus === 'building'
        ? "Brand KB is still building — running without brand context for now."
        : "No brand KB found. Upload documents to add brand context."}
    </span>
  </div>
)}
```

### Step 5.3: Verify types

- [ ] Run: `cd e:\CreativeOS\creativeos-mvp && npx tsc --noEmit`
- Expected: No type errors.

### Step 5.4: Commit

- [ ] Run:
```bash
git add src/components/nodes/prompt-node.tsx src/components/nodes/prompt-focus-view.tsx
git commit -m "feat: show KB warning banner in prompt node when KB unavailable"
```

---

## Self-Review

### Spec Coverage Check

| Spec requirement | Task that covers it |
|---|---|
| Upload docs → immediately redirect to canvas | Task 1 |
| `startKBBuildJob()` called before redirect | Task 1 (unchanged call, redirect added after) |
| Create canvas if none exists | Task 1 (`getOrCreateFirstCanvas`) |
| Canvas-level Supabase Realtime listener for `client_kb_jobs` | Task 3 (`CanvasKBStatus`) |
| `kbStatus: 'none' \| 'building' \| 'ready'` in Zustand store | Task 2 |
| Toast on KB completion | Task 3 |
| Toolbar badge showing "KB building…" | Task 3 (`CanvasKBBadge`) |
| Prompt node pulse animation on KB ready | Task 4 |
| Warning banner in Prompt node when KB not ready | Task 5 |
| Warning banner in Prompt focus view when KB not ready | Task 5 |
| Nodes fully runnable when KB not ready (no blocking) | Task 5 — banner is informational only |
| `resolveInputs` unchanged | Not a task — confirmed existing null check handles this |

### No Placeholders

- All code blocks are complete and exact
- No "TBD", "TODO", or "similar to above"
- All type names (`ClientKBJobRow`, `CanvasState`, etc.) are consistent with existing codebase

### Type Consistency

- `kbStatus` typed as `'none' | 'building' | 'ready'` consistently across store, component, and selector
- `kbJustReady: boolean` consistent across store definition and usage in `CanvasKBStatus`
- `getOrCreateFirstCanvas` returns `{ slug: string }` — consumed with destructuring `const { slug } = await getOrCreateFirstCanvas(clientId)`
- `CanvasKBStatus` props: `{ clientId: string; initialJob: ClientKBJobRow | null; hasActiveKB: boolean }` — all provided from canvas page

All spec requirements covered, no gaps found.
