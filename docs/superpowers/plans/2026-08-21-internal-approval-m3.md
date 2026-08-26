# Internal Approval — M3 (Drawer, Lock, Navbar) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A senior can find work from anywhere, open it, and decide on it — without ever taking the canvas lock from the person still working.

**Architecture:** Approval stops depending on the D33 edit lock in two separate ways: the approval control no longer requires `editable`, and a canvas can be *entered* in a non-acquiring review mode carried in the URL. A non-modal drawer lists this canvas's pending items and routes to a node using the generation tray's existing fly-to behaviour; a navbar popover does the same thing org-wide. Both are filters over the M2 view, differing only in scope.

**Tech Stack:** Next.js 16 App Router (server `searchParams` → props, no `useSearchParams`), React 19, Base UI `Sheet`/`Popover`, `@xyflow/react` `setCenter`, Vitest.

## Global Constraints

- **Controls are shadcn primitives only.** Base UI composes via `render`, not `asChild`.
- **API helpers:** `apiError` / `apiOk` — never `NextResponse.json(...)`.
- **Migrations are batched to the end** (operator decision). M3 adds none.
- **Test command:** `npx vitest run`. **Bar at M3 start: 160 files, 1278 tests, 0 failures.**
- **Typecheck:** `npx tsc --noEmit -p tsconfig.json` clean. This is the real gate for UI work.
- **Lint:** base has ~28 pre-existing errors; the bar is **no new errors in touched files**. Note React 19's `no-setstate-in-effect` rule is enforced here — adjust state during render with a seed comparison instead (see `use-review-counts.ts`).
- **Design system:** amber = pending, `destructive` = changes_requested. Motion easing `cubic-bezier(0.22,1,0.36,1)` only.
- **ADR numbers:** M3 records **D160, D161, D162, D163, D165** — the five reserved in the design spec and deliberately not written during M1.
- **Commit style:** end every message with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

## Reference

- Design spec §5: `docs/superpowers/specs/2026-08-21-internal-approval-workflow-design.md`
- PRD §6.6 (drawer), §6.7 (lock), §6.9 (navbar): `2026-08-19-internal-approval-workflow-prd.md`
- Patterns to copy: `gallery-drawer-context.tsx` + `gallery-drawer.tsx` (non-modal `Sheet`, `modal={false}`), `generation-tray.tsx` (`setCenter` + `setFocusedNodeId`), `header-actions.tsx` (navbar slot).

## What M1/M2 already delivered (do not rebuild)

- `listCanvasPendingItems(orgId, canvasId)` and `listOrgReviewInbox(orgId, userId, role)` in `src/lib/db/review.ts`.
- `InboxItem` and `selectInboxFor` in `src/lib/review/queue.ts`.
- `subscribeToOrgVersionUpdates` and `PendingCountPill`.
- Server-enforced approval; video assets approvable.

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `src/hooks/use-canvas-lock.ts` | **Modify.** Accept `{ acquire }`; skip acquisition in review mode | 1 |
| `src/components/canvas/canvas.tsx` | **Modify.** Take `reviewMode`, pass to lock, mount the drawer | 1, 4 |
| `src/app/clients/[id]/canvases/[cid]/page.tsx` | **Modify.** Read `?review=1` server-side; mount provider + trigger | 1, 4 |
| `src/components/nodes/{image-gen,prompt,video-prompt,video-gen}-focus-view.tsx` | **Modify.** Drop `editable &&` from `canApprove` | 2 |
| `src/components/nodes/inline-approval-bar.tsx` | **Modify.** `ApprovalReadout` renders the rejection note (R9.3) | 3 |
| `src/app/api/canvases/[cid]/review/route.ts` | **Create.** Drawer items for one canvas | 4 |
| `src/components/canvas/review-drawer/review-drawer-context.tsx` | **Create.** Open/close context | 4 |
| `src/components/canvas/review-drawer/review-drawer.tsx` | **Create.** Non-modal panel + rows | 4 |
| `src/components/canvas/review-drawer/review-drawer-trigger.tsx` | **Create.** Canvas control with scoped count (R5.3) | 4 |
| `src/app/api/review/inbox/route.ts` | **Create.** Org-wide inbox | 5 |
| `src/components/identity/review-inbox.tsx` | **Create.** Navbar icon + popover | 5 |
| `src/components/layout/header-actions.tsx` | **Modify.** Mount it | 5 |
| ADR log §7 | **Modify.** Append D160–D163, D165 | 6 |

---

## Task 1: Review mode — entering a canvas without taking the lock

**Files:**
- Modify: `src/hooks/use-canvas-lock.ts`
- Modify: `src/components/canvas/canvas.tsx`
- Modify: `src/app/clients/[id]/canvases/[cid]/page.tsx`

**Interfaces:**
- Produces: `useCanvasLock(canvasId: string, options?: { acquire?: boolean })`; `<Canvas reviewMode={boolean} … />`.

- [ ] **Step 1: Make acquisition opt-out**

In `src/hooks/use-canvas-lock.ts`, change the signature and guard the mount effect:

```ts
// D161: `acquire: false` enters the canvas WITHOUT taking the edit lock — the review
// mode R7.2 requires. A senior opening a canvas to review must never flip the junior
// who is mid-generation into read-only; before this, useCanvasLock acquired on mount
// unconditionally, so merely arriving evicted the editor.
//
// Everything else the lock protects is unchanged (R7.3): canvas edits, generation and
// parse remain single-writer under D33. Only *entering to review* is decoupled, and
// separately only *approval* no longer requires `canEdit` (Task 2).
export function useCanvasLock(canvasId: string, options?: { acquire?: boolean }) {
  const acquire = options?.acquire ?? true;
```

Guard the acquire effect — and make the dependency explicit so toggling review mode
re-evaluates:

```ts
  // Acquire on mount, unless this session entered to review (D161).
  useEffect(() => {
    if (!acquire) return;
    let cancelled = false;
    void trackConnection(() =>
      acquireCanvasLockAction(canvasId, sessionId, nameRef.current),
    ).then((r) => {
      if (cancelled || !r) return;
      dispatch(r.ok ? { type: "acquired" } : { type: "denied", heldByName: r.heldBy.name });
    });
    return () => {
      cancelled = true;
    };
  }, [canvasId, sessionId, acquire]);
```

> **Do not touch the heartbeat, release, or poll effects.** They key off `isEditor` /
> `isViewer`, which a non-acquiring session never becomes — so they are already inert in
> review mode, and changing them would widen the blast radius past what R7.2 asks for.

- [ ] **Step 2: Thread review mode into the canvas**

In `src/components/canvas/canvas.tsx`, add the prop and pass it through:

```tsx
export function Canvas({
  canvasId,
  clientId,
  initialKBJob,
  hasActiveKB,
  initialDriveRootFolder,
  reviewMode = false,
}: {
  // …existing props…
  /** D161: entered via a review link (?review=1) — do not take the edit lock. */
  reviewMode?: boolean;
}) {
```

and at the `useCanvasLock` call (~line 123):

```tsx
  const { canEdit, heldByName, canTakeOver, sessionId, takeOver, reportLockLost } =
    useCanvasLock(canvasId, { acquire: !reviewMode });
```

> `canEdit` stays false in review mode, so the canvas is read-only for edits — which is
> correct and is exactly what makes this safe. Task 2 is what lets approval still work
> under that read-only state.

- [ ] **Step 3: Read the flag server-side**

In `src/app/clients/[id]/canvases/[cid]/page.tsx`, take `searchParams` and pass the flag
down. **Read it on the server, not with `useSearchParams`** — that hook opts its whole
subtree out of static rendering and would need a Suspense boundary around the canvas.

Add to the page's props (Next 16 passes these as promises):

```tsx
export default async function CanvasPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; cid: string }>;
  searchParams: Promise<{ review?: string }>;
}) {
  // …existing param handling…
  const { review } = await searchParams;
  const reviewMode = review === "1";
```

and on the `<Canvas>` element:

```tsx
          <Canvas
            canvasId={canvas.id}
            clientId={client.id}
            initialKBJob={latestKBJob}
            hasActiveKB={!!activeKBVersion}
            initialDriveRootFolder={initialDriveRootFolder}
            reviewMode={reviewMode}
          />
```

> Check the existing signature before editing — if the page already destructures
> `params` with a different shape, match it rather than replacing it.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json` → clean.
Run: `npx vitest run src/lib/canvas/` → the lock-state reducer tests must still pass; this
task changed *when* acquisition is attempted, never the state machine itself.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/use-canvas-lock.ts src/components/canvas/canvas.tsx "src/app/clients/[id]/canvases/[cid]/page.tsx"
git commit -m "feat(review): enter a canvas in non-acquiring review mode (D161, R7.2)

useCanvasLock acquired on mount unconditionally, so a senior merely ARRIVING to
review flipped the junior who was mid-generation into read-only. Reviewing the work
interrupted the work.

?review=1 (read server-side, so no useSearchParams boundary is needed) enters
without acquiring. The heartbeat/release/poll effects are untouched — they key off
isEditor/isViewer, which a non-acquiring session never becomes, so they are already
inert here.

Scoped deliberately: everything the lock protects stays single-writer under D33
(R7.3). Rejected lazy-acquire-on-first-edit as the more elegant fix, because it
rewrites D33 for every user on every canvas and does not belong inside an approval
change.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 2: Approval no longer requires the edit lock

**Files:**
- Modify: `src/components/nodes/image-gen-focus-view.tsx`
- Modify: `src/components/nodes/prompt-focus-view.tsx`
- Modify: `src/components/nodes/video-prompt-focus-view.tsx`
- Modify: `src/components/nodes/video-gen-focus-view.tsx`

- [ ] **Step 1: Drop `editable &&` in all four focus views**

In each file, find:

```tsx
canApprove={editable && identity?.role === "senior"}
```

and change it to:

```tsx
canApprove={identity?.role === "senior"}
```

**All four, in one commit.** Splitting them would leave the product in a state where
approval works on some node types and not others under the same lock — a worse
intermediate than either end state.

> **Why this is safe, in one line for the reviewer:** approval writes only to
> `node_versions`, annotating an existing attempt. It touches no canvas, node, or edge
> row, so it is not in the class of writes the lock serialises (D160). Correctness against
> a concurrent regenerate comes from targeting a specific version id, not from the lock.

- [ ] **Step 2: Check `editable` is still used in each file**

Run: `npm run lint`. If `editable` became unused anywhere, it will surface as an
unused-variable error. It is still needed for generate buttons and edit affordances in all
four, so **expect no such error** — if one appears, that file was gating something else on
`editable` that you have just removed by accident. Investigate rather than deleting the
variable.

- [ ] **Step 3: Typecheck and commit**

Run: `npx tsc --noEmit -p tsconfig.json` → clean.
Run: `npx vitest run` → 0 failures.

```bash
git add src/components/nodes/
git commit -m "feat(review): approval no longer requires the canvas edit lock (D160, R7.1)

All four focus views drop the editable && guard together — splitting them would
leave approval working on some node types and not others under the same lock, a
worse intermediate state than either end.

Approval writes only to node_versions, annotating an existing attempt; it touches
no canvas, node or edge row, so it is not in the class of writes the lock
serialises. Correctness against a concurrent regenerate comes from targeting a
specific version id, not from holding the lock — a stale approval lands on the old
version and the new one stays pending.

D34 already asserted this (\"D33's 'viewers can't approve' is a canvas-UI gate, not
a server guard\"); the UI simply never matched the decision.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 3: The rejection note reaches the person it is addressed to

**Files:**
- Modify: `src/components/nodes/inline-approval-bar.tsx`

- [ ] **Step 1: Render the note in `ApprovalReadout`**

Today a designer gets `ApprovalReadout`, which renders **the status label only** — so the
rejection note, the entire payload of the return path, is invisible to the one person who
needs it. Replace the component:

```tsx
function ApprovalReadout({ status, note }: { status: ApprovalStatus; note: string }) {
  const label = {
    pending: "Awaiting approval",
    approved: "Approved",
    changes_requested: "Changes requested",
  }[status];

  return (
    <div className="min-w-0">
      <div className="flex items-center justify-between">
        <span className="text-eyebrow">Approval</span>
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      {/* R9.3: the reviewer's note is read ON THE NODE, beside the controls that act on
          it — this is the whole return path, and rendering only the status label left the
          maker knowing they were rejected but not why. */}
      {status === "changes_requested" && note.trim() && (
        <p className="mt-2 rounded-r-md border-l-2 border-destructive/40 bg-destructive/5 px-2.5 py-1.5 text-xs leading-relaxed text-destructive">
          {note}
        </p>
      )}
    </div>
  );
}
```

and pass the note at the call site inside `InlineApprovalBar`:

```tsx
  if (!canApprove) {
    return <ApprovalReadout status={status} note={note} />;
  }
```

- [ ] **Step 2: Typecheck and commit**

Run: `npx tsc --noEmit -p tsconfig.json` → clean.

```bash
git add src/components/nodes/inline-approval-bar.tsx
git commit -m "feat(review): show the rejection note to the maker (R9.3)

ApprovalReadout — what a designer sees — rendered the status label and nothing
else, so the note was invisible to the one person it is written for. They knew they
had been rejected but not why, which makes the whole return path decorative.

Rendered on the node, beside the controls that act on it, in the destructive tone
that already means changes_requested.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 4: The canvas review drawer

**Files:**
- Create: `src/app/api/canvases/[cid]/review/route.ts`
- Create: `src/components/canvas/review-drawer/review-drawer-context.tsx`
- Create: `src/components/canvas/review-drawer/review-drawer.tsx`
- Create: `src/components/canvas/review-drawer/review-drawer-trigger.tsx`
- Modify: `src/components/canvas/canvas.tsx`
- Modify: `src/app/clients/[id]/canvases/[cid]/page.tsx`

**Interfaces:**
- Consumes: `listCanvasPendingItems` (M2); `InboxItem`; `useReviewCounts`; `PendingCountPill`; `useCanvasStore`'s `setFocusedNodeId`; `useReactFlow().setCenter`.
- Produces: `GET /api/canvases/[cid]/review` → `{ items: InboxItem[] }`; `<ReviewDrawerProvider>`, `<ReviewDrawer canvasId>`, `<ReviewDrawerTrigger canvasId>`.

- [ ] **Step 1: The endpoint**

Check `withCanvas`'s handler signature in `route-helpers.ts` first — it is
`(canvasId, canvas)` and does **not** pass a caller, so resolve the org separately:

```ts
import { listCanvasPendingItems } from "@/lib/db/review";
import { resolveOrgId } from "@/lib/dal";
import { apiOk, withCanvas, withTryCatch } from "@/lib/api/route-helpers";

// R6.1: what is still awaiting review on THIS canvas. withCanvas enforces org isolation
// (404, never 403, on a foreign canvas id) before anything is read.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ cid: string }> },
) {
  const { cid } = await params;
  return withCanvas(req, Promise.resolve({ id: cid }), async (canvasId) =>
    withTryCatch("Failed to load review items", async () => {
      const orgId = await resolveOrgId();
      return apiOk({ items: await listCanvasPendingItems(orgId, canvasId) });
    }),
  );
}
```

- [ ] **Step 2: The context**

A near-copy of `gallery-drawer-context.tsx` — same shape, so the two drawers behave
identically:

```tsx
"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

type Ctx = {
  open: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
  toggleDrawer: () => void;
};

const ReviewDrawerContext = createContext<Ctx | null>(null);

export function ReviewDrawerProvider({
  children,
  initialOpen = false,
}: {
  children: ReactNode;
  // D161: a ?review=1 arrival opens the drawer immediately — the senior followed a count
  // to get here, so the list they were following should already be on screen.
  initialOpen?: boolean;
}) {
  const [open, setOpen] = useState(initialOpen);
  const openDrawer = useCallback(() => setOpen(true), []);
  const closeDrawer = useCallback(() => setOpen(false), []);
  const toggleDrawer = useCallback(() => setOpen((p) => !p), []);
  return (
    <ReviewDrawerContext.Provider value={{ open, openDrawer, closeDrawer, toggleDrawer }}>
      {children}
    </ReviewDrawerContext.Provider>
  );
}

export function useReviewDrawer(): Ctx {
  const ctx = useContext(ReviewDrawerContext);
  if (!ctx) throw new Error("useReviewDrawer must be used inside ReviewDrawerProvider");
  return ctx;
}
```

- [ ] **Step 3: The panel**

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { useReactFlow } from "@xyflow/react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useCanvasStore } from "@/components/canvas/canvas-store-provider";
import { useIdentity } from "@/hooks/use-identity";
import { subscribeToOrgVersionUpdates } from "@/lib/realtime/org-version-updates";
import { authFetch } from "@/lib/supabase/session-ready";
import { formatRelativeTime } from "@/lib/format/relative-time";
import { useReviewDrawer } from "./review-drawer-context";
import type { InboxItem } from "@/lib/review/queue";

// R6.10: NON-MODAL and no backdrop, matching the gallery drawer. It stays mounted while a
// focus view is on screen, which is what makes R6.11 work — the focus sheet opens at 92%
// viewport height, so the two cannot share the screen, but the list is waiting underneath
// when the sheet closes. Reviewing several items costs one open of the drawer, not one per
// item, WITHOUT auto-advancing past work the senior has not looked at (R6.9).
export function ReviewDrawer({ canvasId }: { canvasId: string }) {
  const { open, closeDrawer } = useReviewDrawer();
  const { orgId } = useIdentity();
  const [items, setItems] = useState<InboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const { setCenter, getNode } = useReactFlow();
  const setFocusedNodeId = useCanvasStore((s) => s.setFocusedNodeId);

  const load = useCallback(async () => {
    try {
      const res = await authFetch(`/api/canvases/${canvasId}/review`, { cache: "no-store" });
      if (!res.ok) return; // R8.5 — keep the last known list rather than blanking it
      const data = (await res.json()) as { items: InboxItem[] };
      setItems(data.items);
    } catch {
      // R8.5 — keep what is on screen
    } finally {
      setLoading(false);
    }
  }, [canvasId]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  // R6.6: an item leaves the drawer as soon as it is decided — because the list is derived
  // from live state, not because anything removes it.
  useEffect(() => {
    if (!orgId || !open) return;
    return subscribeToOrgVersionUpdates(orgId, () => void load());
  }, [orgId, open, load]);

  // R6.3: reuse the generation tray's fly-to-node behaviour (D35) rather than inventing a
  // second way to navigate the canvas.
  function openItem(item: InboxItem) {
    const node = getNode(item.nodeId);
    if (node) setCenter(node.position.x + 120, node.position.y + 60, { zoom: 1, duration: 500 });
    setFocusedNodeId(item.nodeId);
    // Deliberately NOT closing the drawer (R6.11).
  }

  return (
    <Sheet open={open} onOpenChange={(next) => !next && closeDrawer()} modal={false}>
      <SheetContent side="right" className="w-80 p-0">
        <div className="flex items-baseline justify-between border-b border-border px-4 py-3">
          <SheetTitle className="text-eyebrow !text-[0.65rem]">Awaiting review</SheetTitle>
          {/* R9.8: state the scope, so this number and the navbar's may legitimately differ */}
          <span className="text-xs tabular-nums text-muted-foreground">
            {items.length} on this canvas
          </span>
        </div>

        <div className="flex max-h-[calc(100vh-4rem)] flex-col gap-1.5 overflow-y-auto p-2">
          {loading && items.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">Loading…</p>
          ) : items.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">
              Nothing awaiting review on this canvas.
            </p>
          ) : (
            items.map((item) => (
              <button
                key={item.versionId}
                type="button"
                onClick={() => openItem(item)}
                className="flex items-center gap-2.5 rounded-lg border border-border bg-card px-2 py-2 text-left transition-colors hover:border-primary/40 hover:bg-primary/5"
              >
                {/* R6.2: preview, which node, who made it, and when — enough to triage
                    without opening it. */}
                {item.output ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.output}
                    alt=""
                    className="size-9 shrink-0 rounded-md border border-border object-cover"
                  />
                ) : (
                  <span className="size-9 shrink-0 rounded-md border border-border bg-muted" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium text-foreground">
                    {item.nodeTitle || (item.nodeType === "video-gen" ? "Video" : "Image")}
                  </span>
                  <span className="block truncate text-[0.7rem] text-muted-foreground">
                    {item.makerName ?? "Unknown"} · {formatRelativeTime(item.createdAt)}
                  </span>
                </span>
              </button>
            ))
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
```

> **The `<button>` here is a real exception to the shadcn-only rule and must be justified
> or replaced.** Check whether `Button` with `variant="ghost"` and a custom `className`
> can carry this layout; if it can, use it. If the row genuinely needs to be a bare
> element, keep it and leave this comment explaining why — do not silently ship a raw
> `<button>` without deciding.

- [ ] **Step 4: The trigger**

```tsx
"use client";

import { ClipboardCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PendingCountPill } from "@/components/shared/pending-count-pill";
import { useReviewCounts } from "@/hooks/use-review-counts";
import { useReviewDrawer } from "./review-drawer-context";
import type { ReviewCounts } from "@/lib/review/queue";

// R5.3: the canvas-level control — how many of THIS canvas's assets await review, and the
// way into the drawer. R6.7: available to every role; for a designer the drawer is simply
// a read-only view of what is outstanding.
export function ReviewDrawerTrigger({
  canvasId,
  initialCounts,
}: {
  canvasId: string;
  initialCounts: ReviewCounts;
}) {
  const { toggleDrawer } = useReviewDrawer();
  const counts = useReviewCounts(initialCounts);
  const count = counts.byCanvas[canvasId] ?? 0;

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={toggleDrawer}
      className="h-8 gap-1.5 rounded-full px-3 text-xs shadow-sm"
    >
      <ClipboardCheck className="size-3.5" strokeWidth={1.5} />
      Review
      <PendingCountPill count={count} scope="canvas" className="ml-0.5" />
    </Button>
  );
}
```

- [ ] **Step 5: Mount it**

In `src/app/clients/[id]/canvases/[cid]/page.tsx`:
- fetch `getOrgReviewCounts(effectiveOrgId)` alongside the existing data,
- wrap the same subtree the `GalleryDrawerProvider` wraps with
  `<ReviewDrawerProvider initialOpen={reviewMode}>`,
- add `<ReviewDrawerTrigger canvasId={canvas.id} initialCounts={reviewCounts} />` beside
  `<GalleryDrawerTrigger />` in the header.

In `src/components/canvas/canvas.tsx`, mount the panel beside the gallery integration:

```tsx
      <ReviewDrawer canvasId={canvasId} />
```

- [ ] **Step 6: Typecheck, test, lint**

Run: `npx tsc --noEmit -p tsconfig.json` → clean.
Run: `npx vitest run` → 0 failures.
Run the targeted lint check → no new errors in touched files.

- [ ] **Step 7: Commit**

```bash
git add src/components/canvas/review-drawer/ "src/app/api/canvases/[cid]/review/" src/components/canvas/canvas.tsx "src/app/clients/[id]/canvases/[cid]/page.tsx"
git commit -m "feat(review): canvas review drawer (D163, R6.1-R6.12)

Non-modal and backdrop-free, matching the gallery drawer, and deliberately left
mounted under the focus view: the focus sheet opens at 92% viewport height so the
two cannot share the screen, but the list is waiting when the sheet closes. That
gets the benefit of a run — one open of the drawer, not one per item — without
auto-advancing past work the senior has not looked at.

The drawer routes; it is not a second approval surface (R6.4), and there is no
next control anywhere (R6.9/R6.12). Rows leave as they are decided because the
list is derived, not because anything removes them (R6.6).

Row clicks reuse the generation tray's fly-to-node behaviour (D35) rather than
inventing a second way to navigate a canvas.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 5: The navbar inbox

**Files:**
- Create: `src/app/api/review/inbox/route.ts`
- Create: `src/components/identity/review-inbox.tsx`
- Modify: `src/components/layout/header-actions.tsx`

- [ ] **Step 1: The endpoint**

```ts
import { listOrgReviewInbox } from "@/lib/db/review";
import { resolveCallerContext, resolveOrgId } from "@/lib/dal";
import { apiOk, withTryCatch } from "@/lib/api/route-helpers";

// R9.1/R9.5 — "things waiting on you", org-wide. Role and user both come from the
// session, so the list cannot be widened by a caller.
export async function GET() {
  return withTryCatch("Failed to load review inbox", async () => {
    const caller = await resolveCallerContext();
    const orgId = await resolveOrgId();
    return apiOk({
      items: await listOrgReviewInbox(orgId, caller.userId, caller.orgRole),
    });
  });
}
```

- [ ] **Step 2: The navbar control**

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useIdentity } from "@/hooks/use-identity";
import { subscribeToOrgVersionUpdates } from "@/lib/realtime/org-version-updates";
import { authFetch } from "@/lib/supabase/session-ready";
import { formatRelativeTime } from "@/lib/format/relative-time";
import type { InboxItem } from "@/lib/review/queue";

// R9.1/R9.6: lives in the app CHROME, because the work it points at spans canvases and
// clients — no single canvas could host it.
//
// R9.5: one control, one meaning — "things waiting on you." For a designer that is their
// own rejected work; for a senior/owner it is what is pending review (plus their own
// rejected work). The role split lives server-side in selectInboxFor, so this component
// never branches on role at all.
export function ReviewInbox() {
  const { orgId, hydrated } = useIdentity();
  const [items, setItems] = useState<InboxItem[]>([]);

  const load = useCallback(async () => {
    try {
      const res = await authFetch("/api/review/inbox", { cache: "no-store" });
      if (!res.ok) return; // R8.5
      const data = (await res.json()) as { items: InboxItem[] };
      setItems(data.items);
    } catch {
      // R8.5 — keep the last known list
    }
  }, []);

  useEffect(() => {
    if (!hydrated || !orgId) return;
    void load();
    return subscribeToOrgVersionUpdates(orgId, () => void load());
  }, [hydrated, orgId, load]);

  // Nothing waiting: render nothing at all, matching PendingCountPill's zero rule (R5.1).
  if (items.length === 0) return null;

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button variant="ghost" size="icon-sm" className="relative" aria-label="Waiting on you">
            <Inbox className="size-4 stroke-[1.5]" />
            <span className="absolute -right-0.5 -top-0.5 inline-flex min-w-[1rem] items-center justify-center rounded-full border border-amber-300 bg-amber-50 px-1 text-[0.6rem] font-semibold tabular-nums leading-4 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
              {items.length}
            </span>
          </Button>
        }
      />
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-baseline justify-between border-b border-border px-3 py-2">
          <span className="text-eyebrow !text-[0.65rem]">Waiting on you</span>
          {/* R9.8: this popover is ORG-WIDE; the canvas drawer is scoped to one canvas, so
              the two numbers legitimately disagree and each must say what it counts. */}
          <span className="text-[0.7rem] text-muted-foreground">everywhere</span>
        </div>
        <div className="flex max-h-96 flex-col gap-1 overflow-y-auto p-1.5">
          {items.map((item) => (
            <Link
              key={item.versionId}
              // R9.3: land on the node itself — the note is read there, beside the
              // controls that act on it. ?review=1 so arriving never takes the lock.
              href={`/clients/${item.clientSlug}/canvases/${item.canvasSlug}?review=1&node=${item.nodeId}`}
              className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted"
            >
              {item.output ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.output} alt="" className="size-8 shrink-0 rounded-md border border-border object-cover" />
              ) : (
                <span className="size-8 shrink-0 rounded-md border border-border bg-muted" />
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-medium">
                  {item.nodeTitle || (item.nodeType === "video-gen" ? "Video" : "Image")}
                </span>
                {/* R9.2: a pointer — where it lives and when. That is all it owes the
                    reader; the note is read on the node. */}
                <span className="block truncate text-[0.7rem] text-muted-foreground">
                  {item.clientName} · {item.canvasName} · {formatRelativeTime(item.createdAt)}
                </span>
              </span>
            </Link>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
```

> Verify `size="icon-sm"` exists on this project's `Button` before using it — check
> `src/components/ui/button.tsx`'s variants and substitute the nearest real one if not.

- [ ] **Step 3: Mount it**

In `src/components/layout/header-actions.tsx`, add `<ReviewInbox />` before
`<AdminNavLink />`. It already returns `null` on `/login`, so no extra guard is needed.

- [ ] **Step 4: Typecheck, test, lint, commit**

```bash
git add src/app/api/review/inbox/ src/components/identity/review-inbox.tsx src/components/layout/header-actions.tsx
git commit -m "feat(review): navbar inbox — one control, both roles (D165, R9.1-R9.8)

Lives in the app chrome because the work it points at spans canvases and clients;
no single canvas could host it. The role split lives server-side in selectInboxFor,
so the component never branches on role — a designer sees their own rejected work,
a senior sees what is pending plus their own rejections.

Rows are pointers, not summaries (R9.2): the note is read on the node, beside the
controls that act on it. Links carry ?review=1 so following one never takes the
lock from whoever is editing.

Both counts state their scope, so a navbar 12 beside a canvas 5 reads as two
questions answered rather than a bug (R9.8).

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 6: Record the remaining decisions

**Files:**
- Modify: `docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md`
- Modify: `docs/superpowers/plans/MIGRATIONS-PENDING.md` (final reminder block)

- [ ] **Step 1: Append D160, D161, D162, D163, D165** to §7 in the file's house style
(`### D<n> — <title> *(recorded 2026-08-21; originated → …)*`, then Decision / Why /
Rejected). Content is given in the design spec §8; expand each into the log's fuller prose
form, matching the D159/D164/D166/D167 entries M1 already wrote.

- [ ] **Step 2: Full verification and commit**

Run: `npx vitest run`, `npx tsc --noEmit -p tsconfig.json`, targeted lint.

```bash
git add docs/
git commit -m "docs(review): record D160-D163 and D165

Completes the feature's ADR block (D159-D167). These five describe the lock
decoupling, review mode, derived-not-assigned review, the item-by-item drawer and
the one-control navbar — all of which now exist, which is why they are recorded
now rather than during M1.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## M3 Acceptance (post-migration, with the batch)

Maps to PRD §7:

- [ ] A senior opens a canvas via a count link while a junior holds the lock; **the junior is not interrupted** and keeps editing (§7.4).
- [ ] The senior approves from the node while still not holding the lock (§7.4).
- [ ] The senior rejects a **video** with a note; it leaves their drawer and appears in the junior's navbar inbox with the note readable on the node (§7.5).
- [ ] The junior regenerates; the asset returns to the senior's queue with no resubmit step (§7.6).
- [ ] The drawer stays open behind a focus view, and the decided item is gone when the sheet closes (R6.11).
- [ ] A designer sees the drawer read-only, with no approve/reject controls (R6.7).
- [ ] Rejecting with no note is refused (R6.5).
- [ ] Navbar count and canvas count differ where scope differs, and each says what it counts (R9.8).

## Self-Review Notes

**Spec coverage.** Design §5.1→T1/T2, §5.2→T4, §5.3→T5, §5.4→T3, §8→T6.

**Two things to check rather than assume during implementation**, both flagged inline:
the `<button>` row in the drawer against the shadcn-only rule, and `size="icon-sm"` on
`Button`. Neither is load-bearing; both are the kind of detail that is faster to verify
than to guess.

**Not built, deliberately:** no approve/reject inside the drawer (R6.4), no queue
position or approve-and-next in the focus view (R6.12), no auto-advance anywhere (R6.9).
The absence is the requirement.
