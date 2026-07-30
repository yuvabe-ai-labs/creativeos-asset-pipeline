  # KB Status Awareness — Design Spec

**Date:** 2026-07-02  
**Status:** Approved

---

## Problem

1. New canvases are only seeded with a KB node when `kb_status === 'ready'`. If KB is building or in review, the canvas is empty — no KB node, no Script node.
2. The KB node has no visual states for `building` or `in_review` — it either shows full data or an empty state.
3. The client home page gives no indication of KB status when canvases don't exist yet, leaving users confused about why their canvas will have no brand context.

---

## Goal

- Every canvas always gets a KB node + Script node + edge seeded, regardless of KB status
- The KB node visually reflects the current KB status in real time (4 states)
- The client home page always shows a KB status banner when KB isn't ready

---

## Design

### 1. Canvas Store `kbStatus` — Add `'in_review'`

Expand `kbStatus` in `src/lib/canvas-store.ts` from:
```
'none' | 'building' | 'ready'
```
to:
```
'none' | 'building' | 'in_review' | 'ready'
```

**Derivation logic** in `CanvasKBStatus` (`src/components/canvas/canvas-kb-status.tsx`):

| Condition | `kbStatus` |
|---|---|
| Job in NON_TERMINAL set | `'building'` |
| `hasActiveKB && clientKbStatus === 'ready'` | `'ready'` |
| `hasActiveKB && clientKbStatus === 'in_review'` | `'in_review'` |
| Everything else | `'none'` |

**New prop on `CanvasKBStatus`:** `clientKbStatus: 'pending' | 'in_review' | 'ready'`  
**Passed from:** `src/app/clients/[id]/canvases/[cid]/page.tsx` → `<Canvas>` → `<CanvasKBStatus>`  
**Source:** `client.kb_status` (already on the `ClientRow` fetched by the canvas page)

The `'in_review'` → `'ready'` transition fires when `markKBReady` is called on the KB page — the canvas page will reflect this on next load. Real-time transition from `'building'` → `'in_review'` fires via the existing Realtime subscription when `job.status === 'succeeded'` (the webhook sets `client.kb_status = 'in_review'`).

---

### 2. Canvas Creation — Always Seed KB + Script + Edge

In `src/lib/actions/canvases.ts` (`createCanvasAction`), change seeding logic:

**Before:**
```
IF active KB exists → seed KB node + Script node + edge
ELSE → empty canvas
```

**After:**
```
ALWAYS seed KB node + Script node + edge

KB node data when KB not ready:
  { clientId, clientSlug, kbVersionId: null, brandName: null, fillRate: null, extractedAt: null }

KB node data when KB ready (same as today):
  { clientId, clientSlug, kbVersionId, brandName, fillRate, extractedAt }
```

Script node and edge are always created. The KB node's visual state (not the graph structure) communicates status. Downstream nodes connect to KB even when it's not ready — they already run without KB context and show the existing warning banner.

---

### 3. KB Node Visual States

The KB node (`src/components/nodes/kb-node.tsx`) reads `kbStatus` from the Zustand store via `useCanvasStore((s) => s.kbStatus)` instead of inferring state from its own `data.kbVersionId`.

**4 visual states:**

#### `'none'` — No KB set up
- Border: dashed `border-dashed border-border`
- Icon: `BookOpenIcon` muted
- Label: "Set up Brand KB"
- Subtitle: "No brand context"
- No fill rate badge
- Source handle: active (edges work normally)
- Sheet on open: read-only panel — "No KB set up yet. Upload documents and images to extract your brand knowledge base." + button "Set up KB" → `/clients/[slug]/kb`

#### `'building'` — Job in progress
- Border: solid, normal
- Icon: spinner (`animate-spin`)
- Label: "Building KB…"
- Subtitle: phase message from store (or "Analyzing documents…" if null)
- No fill rate badge
- Source handle: active
- Sheet on open: read-only panel — "Your Brand KB is building in the background." + phase message + "You can keep working — nodes will use KB context once it's ready." + link to KB page

#### `'in_review'` — Extracted, needs approval
- Border: solid, amber tint `border-amber-200`
- Icon: `BookOpenIcon` with amber dot badge overlay
- Label: "Needs review"
- Subtitle: "Approve fields to activate"
- No fill rate badge (fill rate is shown inside the sheet once user reviews)
- Source handle: active
- Sheet on open: read-only panel — "KB extracted but not yet approved. Review and approve all fields to activate brand context." + "Review KB" button → `/clients/[slug]/kb`

#### `'ready'` — Current behavior (unchanged)
- Brand name, fill rate badge, extracted date
- Sheet: full document list, images, version info (unchanged)

**Transition animation:** existing `kbJustReady` pulse ring fires when transitioning to `'ready'` (unchanged).

---

### 4. Client Home Page KB Banner

In `src/app/clients/[id]/page.tsx`, add a `KBStatusBanner` component rendered between the page header and the canvases section. The component is server-rendered (receives `kb_status` as a prop).

**Banner states:**

| `kb_status` | Variant | Message | CTA |
|---|---|---|---|
| `'pending'` | Amber warning | "Your Brand KB isn't set up yet. Set it up for best results when generating content." | "Set up KB" → `/clients/[slug]/kb` |
| `'in_review'` | Blue info | "Your Brand KB needs review — approve all fields to activate brand context." | "Review KB" → `/clients/[slug]/kb` |
| `'ready'` | Hidden | — | — |

Note: `'building'` maps to `kb_status === 'pending'` in the DB (the job running doesn't change `kb_status` until it succeeds). So during a build, the banner shows "not set up yet" — which is accurate since KB isn't usable yet. The KB page itself shows the live progress indicator.

**Banner placement:** between `<header>` and the canvases table/empty state. Always rendered when `kb_status !== 'ready'`.

**Component:** `src/components/clients/kb-status-banner.tsx` (new file, ~40 lines)

---

## Files Affected

| Action | File | Change |
|---|---|---|
| Modify | `src/lib/canvas-store.ts` | Add `'in_review'` to `kbStatus` union |
| Modify | `src/components/canvas/canvas-kb-status.tsx` | Accept `clientKbStatus` prop, update derivation logic |
| Modify | `src/components/canvas/canvas.tsx` | Pass `clientKbStatus` to `CanvasKBStatus` |
| Modify | `src/app/clients/[id]/canvases/[cid]/page.tsx` | Fetch `client.kb_status`, pass to `Canvas` |
| Modify | `src/lib/actions/canvases.ts` | Always seed KB + Script + edge on canvas creation |
| Modify | `src/components/nodes/kb-node.tsx` | Read `kbStatus` from store, render 4 visual states |
| Create | `src/components/clients/kb-status-banner.tsx` | KB status banner component |
| Modify | `src/app/clients/[id]/page.tsx` | Render `KBStatusBanner` between header and canvases |

---

## Out of Scope

- Social media scraping KB source (future)
- Automatic re-seeding of KB node on existing canvases (existing canvases won't get the KB node retroactively — only new ones)
- KB node becoming connectable/disconnectable based on status (handles always active)
