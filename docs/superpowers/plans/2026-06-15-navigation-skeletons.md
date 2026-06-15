# Navigation Skeletons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add route-level skeleton fallbacks (`loading.tsx`) to all five dynamic routes so navigation gives instant, page-shaped loading feedback instead of a dead click.

**Architecture:** A single `Skeleton` primitive (reusing the existing `animate-shimmer` keyframe, neutral-only) → five page-shaped compositions in `src/components/skeletons/` that mirror each page's exact containers (no layout shift) → five thin `loading.tsx` files that render them. Adding `loading.tsx` also flips each `force-dynamic` route to partial-prefetch, enabling instant client-side navigation.

**Tech Stack:** Next.js 16.2.6 App Router (`loading.tsx` file convention), React Server Components, Tailwind v4, `cn` helper (`@/lib/utils`).

**Verification note:** These are static visual RSC fallbacks — there is no logic to unit-test. Per the approved spec, verification is **manual under network throttling**, not automated TDD. Each task ends with a compile check (dev server) + visual confirmation + commit.

---

## File Structure

**Create:**
- `src/components/ui/skeleton.tsx` — the reusable `Skeleton` primitive (only place shimmer-skeleton styling lives).
- `src/components/skeletons/clients-grid-skeleton.tsx` — `ClientsGridSkeleton`
- `src/components/skeletons/canvases-list-skeleton.tsx` — `CanvasesListSkeleton`
- `src/components/skeletons/canvas-editor-skeleton.tsx` — `CanvasEditorSkeleton`
- `src/components/skeletons/kb-page-skeleton.tsx` — `KBPageSkeleton`
- `src/components/skeletons/eval-review-skeleton.tsx` — `EvalReviewSkeleton`
- `src/app/loading.tsx`
- `src/app/clients/[id]/loading.tsx`
- `src/app/clients/[id]/canvases/[cid]/loading.tsx`
- `src/app/clients/[id]/kb/loading.tsx`
- `src/app/eval/[canvasId]/loading.tsx`

**Modify:**
- `src/app/globals.css` — add a `prefers-reduced-motion` guard for `.animate-shimmer` (it currently lacks one; only `.animate-rise` is guarded, globals.css:237).

All compositions are server components (no `"use client"`). They import only `Skeleton` and standard layout markup.

---

### Task 1: `Skeleton` primitive + reduced-motion guard

**Files:**
- Create: `src/components/ui/skeleton.tsx`
- Modify: `src/app/globals.css` (after the `.animate-shimmer` rule, ~line 250)

- [ ] **Step 1: Create the primitive**

The primitive is a neutral block that clips an absolutely-positioned highlight bar; the bar sweeps via the existing `animate-shimmer` keyframe (translateX -100%→300%). No new keyframe.

`src/components/ui/skeleton.tsx`:

```tsx
import { cn } from "@/lib/utils";

/**
 * Skeleton — the single shimmer placeholder primitive. A neutral rounded block
 * with a sweeping highlight driven by the existing `animate-shimmer` keyframe
 * (globals.css). Neutral-only by design: no brand purple. Server-safe.
 */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        "relative overflow-hidden rounded-md bg-muted",
        className,
      )}
      {...props}
    >
      <div
        aria-hidden
        className="animate-shimmer absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-transparent via-white/55 to-transparent"
      />
    </div>
  );
}

export { Skeleton };
```

- [ ] **Step 2: Add the reduced-motion guard**

`.animate-shimmer` has no reduced-motion handling yet. Add one so the sweep stops under reduced motion (leaving a static block), mirroring `.animate-rise`. In `src/app/globals.css`, immediately after the `.animate-shimmer { … }` block (ends ~line 250):

```css
@media (prefers-reduced-motion: reduce) {
  .animate-shimmer {
    animation: none;
  }
}
```

- [ ] **Step 3: Verify it compiles**

Run: `npm run dev` (leave running for the whole plan).
Expected: dev server boots, no TypeScript error reported for `skeleton.tsx` in the terminal.

- [ ] **Step 4: Commit**

```bash
git add src/components/ui/skeleton.tsx src/app/globals.css
git commit -m "feat(ui): add Skeleton primitive + reduced-motion shimmer guard"
```

---

### Task 2: Clients grid skeleton (`/`)

**Files:**
- Create: `src/components/skeletons/clients-grid-skeleton.tsx`
- Create: `src/app/loading.tsx`

Mirrors `src/app/page.tsx`: `main` at `max-w-4xl px-6 py-14`, header (eyebrow + 5xl title + button), 2-col card grid where each card has an `h-28` logo tile (border-b) then a header block.

- [ ] **Step 1: Create the composition**

`src/components/skeletons/clients-grid-skeleton.tsx`:

```tsx
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";

export function ClientsGridSkeleton() {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-14">
      <header className="mb-10 flex items-end justify-between">
        <div>
          <Skeleton className="h-3 w-40" />
          <Skeleton className="mt-3 h-12 w-48" />
        </div>
        <Skeleton className="h-9 w-32 rounded-md" />
      </header>

      <ul className="grid gap-4 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <li key={i}>
            <Card className="gap-0 overflow-hidden p-0">
              <div className="flex h-28 items-center justify-center border-b bg-muted/40 p-5">
                <Skeleton className="h-10 w-28" />
              </div>
              <div className="space-y-2 px-4 py-4">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-3 w-20" />
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </main>
  );
}
```

- [ ] **Step 2: Create the loading file**

`src/app/loading.tsx`:

```tsx
import { ClientsGridSkeleton } from "@/components/skeletons/clients-grid-skeleton";

export default function Loading() {
  return <ClientsGridSkeleton />;
}
```

- [ ] **Step 3: Verify**

With the dev server running, hard-refresh `http://localhost:3000/`. With DevTools Network throttled to Slow 3G, the clients grid skeleton appears before the real grid. Confirm no TypeScript errors in the dev terminal and no layout jump when content swaps.

- [ ] **Step 4: Commit**

```bash
git add src/components/skeletons/clients-grid-skeleton.tsx src/app/loading.tsx
git commit -m "feat(loading): skeleton for clients grid route"
```

---

### Task 3: Canvases list skeleton (`/clients/[id]`)

**Files:**
- Create: `src/components/skeletons/canvases-list-skeleton.tsx`
- Create: `src/app/clients/[id]/loading.tsx`

Mirrors `src/app/clients/[id]/page.tsx`: `main` at `max-w-4xl px-6 py-12`, breadcrumb row, header with `size-14` avatar + 4xl title + action chips, 2-col canvas cards (single title line, `p-6`).

- [ ] **Step 1: Create the composition**

`src/components/skeletons/canvases-list-skeleton.tsx`:

```tsx
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";

export function CanvasesListSkeleton() {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-12">
      <Skeleton className="h-4 w-44" />

      <header className="mb-10 mt-4 flex items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <Skeleton className="size-14 shrink-0 rounded-lg" />
          <Skeleton className="mt-1 h-9 w-56" />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Skeleton className="h-8 w-24 rounded-md" />
          <Skeleton className="h-8 w-24 rounded-md" />
          <Skeleton className="h-8 w-28 rounded-md" />
        </div>
      </header>

      <ul className="grid gap-3 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <li key={i}>
            <Card className="p-6">
              <Skeleton className="h-6 w-40" />
            </Card>
          </li>
        ))}
      </ul>
    </main>
  );
}
```

- [ ] **Step 2: Create the loading file**

`src/app/clients/[id]/loading.tsx`:

```tsx
import { CanvasesListSkeleton } from "@/components/skeletons/canvases-list-skeleton";

export default function Loading() {
  return <CanvasesListSkeleton />;
}
```

- [ ] **Step 3: Verify**

From `/`, click a client (Slow 3G). The canvases-list skeleton flashes before the real list. Confirm no dead-click, no TS errors, no layout jump.

- [ ] **Step 4: Commit**

```bash
git add src/components/skeletons/canvases-list-skeleton.tsx "src/app/clients/[id]/loading.tsx"
git commit -m "feat(loading): skeleton for canvases list route"
```

---

### Task 4: Canvas editor skeleton (`/clients/[id]/canvases/[cid]`)

**Files:**
- Create: `src/components/skeletons/canvas-editor-skeleton.tsx`
- Create: `src/app/clients/[id]/canvases/[cid]/loading.tsx`

Mirrors `src/app/clients/[id]/canvases/[cid]/page.tsx`: `main flex flex-1 flex-col`, a header bar (`border-b px-6 py-3`) with breadcrumb, then a flex-1 `.canvas-surface` region. Skeleton shows the header chrome + a few ghost node cards floating on the surface.

- [ ] **Step 1: Create the composition**

`src/components/skeletons/canvas-editor-skeleton.tsx`:

```tsx
import { Skeleton } from "@/components/ui/skeleton";

export function CanvasEditorSkeleton() {
  return (
    <main className="flex flex-1 flex-col">
      <header className="flex items-center border-b border-border/70 bg-background/60 px-6 py-3 backdrop-blur">
        <Skeleton className="h-4 w-72" />
      </header>

      <div className="canvas-surface relative flex-1 overflow-hidden">
        <div className="absolute left-[12%] top-[22%]">
          <Skeleton className="h-40 w-64 rounded-xl" />
        </div>
        <div className="absolute left-[46%] top-[40%]">
          <Skeleton className="h-48 w-72 rounded-xl" />
        </div>
        <div className="absolute left-[20%] top-[64%]">
          <Skeleton className="h-32 w-56 rounded-xl" />
        </div>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Create the loading file**

`src/app/clients/[id]/canvases/[cid]/loading.tsx`:

```tsx
import { CanvasEditorSkeleton } from "@/components/skeletons/canvas-editor-skeleton";

export default function Loading() {
  return <CanvasEditorSkeleton />;
}
```

- [ ] **Step 3: Verify**

From a canvases list, click a canvas (Slow 3G). The editor skeleton (header bar + ghost nodes on the signal-grid surface) appears before React Flow mounts. Confirm the header chrome lines up with the real editor header (no jump), no TS errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/skeletons/canvas-editor-skeleton.tsx "src/app/clients/[id]/canvases/[cid]/loading.tsx"
git commit -m "feat(loading): skeleton for canvas editor route"
```

---

### Task 5: KB page skeleton (`/clients/[id]/kb`)

**Files:**
- Create: `src/components/skeletons/kb-page-skeleton.tsx`
- Create: `src/app/clients/[id]/kb/loading.tsx`

Approximate chrome only — the KB page branches between upload onboarding and review/edit modes, so the skeleton mirrors the shared frame (centered column, breadcrumb, section header, a stack of document/image rows), not a specific mode.

- [ ] **Step 1: Create the composition**

`src/components/skeletons/kb-page-skeleton.tsx`:

```tsx
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";

export function KBPageSkeleton() {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-12">
      <Skeleton className="h-4 w-52" />

      <header className="mb-8 mt-4 space-y-3">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </header>

      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="flex flex-row items-center gap-4 p-4">
            <Skeleton className="size-10 shrink-0 rounded-md" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-3 w-1/4" />
            </div>
          </Card>
        ))}
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Create the loading file**

`src/app/clients/[id]/kb/loading.tsx`:

```tsx
import { KBPageSkeleton } from "@/components/skeletons/kb-page-skeleton";

export default function Loading() {
  return <KBPageSkeleton />;
}
```

- [ ] **Step 3: Verify**

Navigate to a client's `Brand KB` (Slow 3G). The KB skeleton frame appears before content. Confirm no TS errors. (Approximate chrome — minor swap shift is acceptable here per spec.)

- [ ] **Step 4: Commit**

```bash
git add src/components/skeletons/kb-page-skeleton.tsx "src/app/clients/[id]/kb/loading.tsx"
git commit -m "feat(loading): skeleton for brand KB route"
```

---

### Task 6: Eval review skeleton (`/eval/[canvasId]`)

**Files:**
- Create: `src/components/skeletons/eval-review-skeleton.tsx`
- Create: `src/app/eval/[canvasId]/loading.tsx`

Approximate chrome for the `ReviewScreen` frame: a header row + a tall panel placeholder filling the viewport.

- [ ] **Step 1: Create the composition**

`src/components/skeletons/eval-review-skeleton.tsx`:

```tsx
import { Skeleton } from "@/components/ui/skeleton";

export function EvalReviewSkeleton() {
  return (
    <main className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-border/70 bg-background/60 px-6 py-3 backdrop-blur">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-8 w-28 rounded-md" />
      </header>

      <div className="flex flex-1 gap-4 p-6">
        <Skeleton className="hidden h-[70vh] w-64 shrink-0 rounded-xl sm:block" />
        <Skeleton className="h-[70vh] flex-1 rounded-xl" />
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Create the loading file**

`src/app/eval/[canvasId]/loading.tsx`:

```tsx
import { EvalReviewSkeleton } from "@/components/skeletons/eval-review-skeleton";

export default function Loading() {
  return <EvalReviewSkeleton />;
}
```

- [ ] **Step 3: Verify**

From a client page, click `Eval review` (Slow 3G). The eval skeleton frame appears before `ReviewScreen`. Confirm no TS errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/skeletons/eval-review-skeleton.tsx "src/app/eval/[canvasId]/loading.tsx"
git commit -m "feat(loading): skeleton for eval review route"
```

---

### Task 7: Full walkthrough + reduced-motion check

**Files:** none (verification only).

- [ ] **Step 1: Throttled walkthrough**

With dev server running and Network throttled to Slow 3G, walk the full chain and confirm a skeleton shows on each transition with no dead-click and no layout jump on swap:
1. `/` → click client → canvases-list skeleton → list
2. click canvas → editor skeleton → React Flow editor
3. client page → `Brand KB` → KB skeleton → KB
4. client page → `Eval review` → eval skeleton → review screen
5. hard-refresh each route → skeleton during initial dynamic render

- [ ] **Step 2: Reduced-motion check**

Enable OS "reduce motion" (or DevTools Rendering → "prefers-reduced-motion: reduce"). Reload a route; confirm the shimmer sweep stops and a static neutral block remains.

- [ ] **Step 3: Production build sanity**

Run: `npm run build`
Expected: build succeeds; the five new routes report a `loading` boundary with no type errors.

- [ ] **Step 4: Final commit (if any cleanup was needed)**

```bash
git add -A
git commit -m "chore(loading): verify navigation skeletons across all dynamic routes" || echo "nothing to commit"
```
