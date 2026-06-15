# Navigation Skeletons — Standardized Page Transition Loading

**Date:** 2026-06-15
**Status:** Approved (design)

## Problem

Navigating between routes — Clients (`/`) → Canvases list (`/clients/[id]`) →
Canvas editor (`/clients/[id]/canvases/[cid]`) — shows **no feedback**. The link
appears dead: the old page sits frozen until the server responds, then the new
page snaps in.

### Root cause

Every page exports `export const dynamic = "force-dynamic"`. Per the Next.js
**16.2.6** docs (`node_modules/next/dist/docs/01-app/01-getting-started/04-linking-and-navigating.md`):

> **Dynamic Route**: prefetching is skipped, or the route is partially prefetched
> if `loading.tsx` is present.

Because none of these routes has a `loading.tsx`, prefetching is skipped entirely.
A `<Link>` click must wait for the full server round-trip (DB query → RSC render)
before anything changes on screen. There is no loading UI and no instant
navigation.

The native fix is the same file that provides the indicator: adding `loading.tsx`
flips the route to **partial prefetch** (instant client-side navigation) *and*
renders a skeleton fallback while the page streams in. Root cause and indicator
are solved together.

## Decisions (locked)

- **Indicator style:** route-level **skeleton screens** — greyed, page-shaped
  shimmer placeholders. Not a top progress bar, not a spinner overlay.
- **Scope:** **all five dynamic routes** get a `loading.tsx`:
  1. `/` — Clients grid
  2. `/clients/[id]` — Canvases list
  3. `/clients/[id]/canvases/[cid]` — Canvas editor
  4. `/clients/[id]/kb` — Brand KB
  5. `/eval/[canvasId]` — Eval review
- **Verification:** run the dev server, throttle the network (Slow 3G), and walk
  each transition confirming the skeleton appears and swaps with no layout shift.
  No automated render tests this pass.

## Architecture

Three isolated layers, smallest to largest:

### 1. `Skeleton` primitive — `src/components/ui/skeleton.tsx`

The single reusable atom and the standardization point. A server-safe (no
`"use client"`) component:

- A `neutral-100`-toned rounded block (`bg-muted` / `rounded-md` per the design
  tokens) with a **sweeping highlight** driven by the **existing**
  `animate-shimmer` keyframe (globals.css:244) so motion stays on-system (brand
  easing, no bounce, no new keyframe).
- The sweep is a light gradient bar clipped to the block via `overflow-hidden` +
  an inner `absolute inset-0` element carrying `animate-shimmer`.
- Props: `className` only (merged via the project's `cn` helper). No variants.
- Respects `prefers-reduced-motion`: under reduced motion the shimmer is
  suppressed (the existing `animate-shimmer` rule plus a guard), leaving a static
  block — mirroring how `animate-rise` already degrades (globals.css:237).

This is the only place shimmer-skeleton styling lives; every composition is built
from it.

### 2. Page-shaped skeleton compositions

One composition per route shape, each built **only** from the `Skeleton`
primitive plus the same layout containers as the real page (identical
`max-w-*`, `px-6`, `py-*`, grid columns) so the swap produces **no layout shift**.

Location: colocate next to each route's other UI. New compositions live in
`src/components/<area>/skeletons/` or alongside the page; final placement follows
the existing folder ownership in `docs/component-structure.md`. Proposed:

| Route | Composition | Mirrors |
|---|---|---|
| `/` | `ClientsGridSkeleton` | eyebrow + 5xl title + `NewClientDialog` button; 2-col card grid: logo tile (h-28 border-b), title line, subtitle line |
| `/clients/[id]` | `CanvasesListSkeleton` | breadcrumb row; avatar (size-14) + 4xl title; action chips; 2-col canvas cards (single title line) |
| `/clients/[id]/canvases/[cid]` | `CanvasEditorSkeleton` | editor header bar (breadcrumb) + `.canvas-surface` fill with 2–3 ghost node cards |
| `/clients/[id]/kb` | `KBPageSkeleton` | breadcrumb + section header + a column of document/image placeholder rows (approximate chrome — KB has upload vs review modes, so it mirrors the shared frame, not a specific mode) |
| `/eval/[canvasId]` | `EvalReviewSkeleton` | the `ReviewScreen` frame: header + viewport-height panel placeholder (approximate chrome) |

KB and Eval skeletons are intentionally **approximate** (shared chrome only),
because their content branches by state; the goal is "something page-shaped
appears instantly," not pixel parity.

### 3. `loading.tsx` per segment

Five thin files, each a default export that renders its composition and nothing
else:

```
src/app/loading.tsx                              -> <ClientsGridSkeleton />
src/app/clients/[id]/loading.tsx                 -> <CanvasesListSkeleton />
src/app/clients/[id]/canvases/[cid]/loading.tsx  -> <CanvasEditorSkeleton />
src/app/clients/[id]/kb/loading.tsx              -> <KBPageSkeleton />
src/app/eval/[canvasId]/loading.tsx              -> <EvalReviewSkeleton />
```

Next.js automatically wraps each `page.tsx` in a `<Suspense>` boundary with this
fallback.

## Data flow

No data. Skeletons are static RSC fallbacks streamed before the page's data is
ready. They take no params and run no queries — which is exactly why they can be
prefetched and shown instantly.

## Design-system compliance

- Reuses the existing `animate-shimmer` keyframe; introduces **no** new animation.
- Neutral-only fills (`bg-muted` / `neutral-100/200`); **no** purple — brand color
  stays reserved for CTAs/brand mark per `AGENTS.md`.
- Skeleton blocks use the system radius/spacing tokens and the same containers as
  the real pages → zero layout shift, honoring "barely-perceptible motion."
- Lucide-free, font-free: pure shaped blocks.

## Error handling

Not applicable — skeletons cannot fail or branch. Existing `not-found` / empty
states in the pages are untouched (they render after data resolves, replacing the
skeleton).

## Testing / verification

Manual, under network throttling (Slow 3G in dev tools):

1. `/` → click a client → **CanvasesListSkeleton** flashes → real list.
2. `/clients/[id]` → click a canvas → **CanvasEditorSkeleton** (editor chrome +
   ghost nodes) → real React Flow editor.
3. Navigate to `/clients/[id]/kb` and `/eval/[canvasId]` → respective skeletons.
4. Hard refresh on each route → skeleton shows during initial dynamic render.
5. Confirm **no layout jump** when each skeleton swaps to real content.
6. Toggle OS "reduce motion" → shimmer stops, static blocks remain.

## Out of scope

- Top progress bar / `useLinkStatus` inline hints (could layer on later for slow
  networks; not needed once `loading.tsx` enables partial prefetch).
- `unstable_instant` route export (newer Next 16 instant-navigation API) — not
  required for this fix.
- Converting any route away from `force-dynamic`.
