# Non-Blocking KB Build — Design Spec

**Date:** 2026-07-02  
**Status:** Approved

---

## Problem

When a client uploads multiple documents, the KB build takes significant time. Currently the user is blocked on the KB review screen until the Trigger.dev job completes — even though the job is already async. Users cannot access the canvas or generate anything during this wait.

---

## Goal

Let users upload documents and immediately jump to the canvas. KB builds in the background. When it finishes, the canvas notifies the user non-intrusively. Nodes that use KB context are runnable at any time — with a warning if KB isn't ready yet.

---

## Approach

Option A: Redirect-Immediately + Realtime KB Status. Reuses the existing `client_kb_jobs` Supabase Realtime infrastructure. Minimal new surface area — this is a UI flow change + a canvas-level listener + a node warning state.

---

## Design

### 1. Upload & Redirect Flow

**Change:** Remove the blocking wait screen after document upload. The "Build KB" button is no longer a gate.

**New flow:**
1. User uploads documents → GCS upload + `client_kb_documents` insert (synchronous, fast — same as today)
2. `startKBBuildJob()` is called immediately after upload completes (same Trigger.dev trigger)
3. UI **immediately redirects to the canvas** — if no canvas exists yet, create one and redirect
4. KB build continues in background via Trigger.dev; user never sees a wait screen

**Files affected:**
- `src/app/clients/[id]/kb/` — KB upload page: remove blocking loader, add redirect after `startKBBuildJob()`
- `src/lib/actions/kb.ts` — `startKBBuildJob()` unchanged; just called earlier in the flow

---

### 2. Canvas-Level KB Status Listener

**Change:** Mount `use-kb-job-status.ts` at the canvas workspace level (currently only mounted on the KB review screen).

**New Zustand state** in the canvas store:
```typescript
kbStatus: 'none' | 'building' | 'ready'
```
- `'none'` — no KB job exists and no active KB version
- `'building'` — a `client_kb_jobs` row exists with status not yet `'succeeded'`
- `'ready'` — `clients.active_kb_version_id` is non-null

This state is derived from the existing `client_kb_jobs` Realtime subscription (already published via `supabase_realtime`). No new DB tables or migrations needed.

**Three UI effects driven by `kbStatus` transitioning to `'ready'`:**

1. **Toast** — "Brand KB is ready! Your brand context is now active." (checkmark icon, 4s auto-dismiss)
2. **Canvas toolbar badge** — small persistent indicator near the client name showing `"KB building..."` → disappears (or shows subtle green dot) when ready
3. **Node pulse** — any Prompt nodes on canvas with `client_context` enabled get a brief highlight animation (`ring-2 ring-purple-400 animate-pulse` for ~2s) to signal KB just became available

**Files affected:**
- `src/hooks/use-kb-job-status.ts` — already exists; mount at canvas level
- `src/components/canvas/canvas-workspace.tsx` (or equivalent) — subscribe to hook, derive `kbStatus`, push to Zustand
- `src/components/canvas/canvas-toolbar.tsx` — render KB status badge
- Canvas Zustand store — add `kbStatus` field

---

### 3. "Running Without KB" Warning on Nodes

**Change:** Prompt nodes (and any future node types that consume KB context) surface the null KB case visually instead of silently skipping it.

**Three warning states** shown inside the node panel (informational only — node is fully runnable):

| `kbStatus` | Warning shown |
|---|---|
| `'none'` | "No brand KB found. Upload documents to add brand context." |
| `'building'` | "Brand KB is still building — running without brand context for now." |
| `'ready'` | No warning shown |

**Implementation:** `resolveInputs()` in [resolve-inputs.ts](../../src/lib/nodes/resolve-inputs.ts) already skips KB context when `active_kb_version_id` is null. No change to that logic. The warning is purely a UI read of `kbStatus` from the canvas Zustand store — one conditional render in the node panel.

**Files affected:**
- `src/components/nodes/prompt-node/` — add warning banner conditional on `kbStatus`
- Any other node panels that consume `client_context` ambient inputs

---

## What Does NOT Change

- `startKBBuildJob()` logic — unchanged
- Trigger.dev KB build task — unchanged
- Webhook handler (`/api/webhooks/kb-build`) — unchanged
- `client_kb_jobs` schema — unchanged
- `resolveInputs()` KB context resolution logic — unchanged
- KB review/edit screen — still accessible; users can still review and approve KB fields after it builds

---

## State Diagram

```
User uploads docs
      │
      ▼
startKBBuildJob() → client_kb_jobs { status: 'queued' }
      │
      ▼
Redirect to canvas immediately
      │
      ├── kbStatus = 'building' → toolbar badge shows "KB building..."
      │                         → node panels show warning banner
      │
      ▼ (Trigger.dev completes)
      │
webhook → client_kb_jobs { status: 'succeeded' }
        → clients.active_kb_version_id set
      │
      ▼
Realtime fires on canvas
      │
      ├── kbStatus = 'ready'
      ├── Toast: "Brand KB is ready!"
      ├── Toolbar badge: disappears / green dot
      └── Prompt nodes: pulse animation → warning banner disappears
```

---

## Out of Scope

- Social media / asset scraping (future async input source — same pattern applies when built)
- KB as a canvas node type (valid future evolution of Option B)
- Partial/streaming KB extraction (Option C — too complex for now)
