# Node "Processing" pill — design

**Date:** 2026-06-30
**Status:** Approved (brainstorm) → ready for implementation plan

## Problem

When a node is generating or editing content from inside its focus view and the
user **closes the focus view**, the canvas card gives no clear signal that work is
still in progress.

- **video-gen** already keeps its generating state across a close (it lives in the
  Zustand store, fed by a Supabase Realtime subscription on `generations`), but the
  only on-card signal is a 1.5px `animate-pulse` dot with a tooltip — easy to miss,
  and it never says "Processing".
- **image-gen** is worse: its `generating`/`editing` booleans are **private to the
  focus-view component**, with no channel the sibling node card can read. So the
  card shows nothing at all while generating/editing.
- **script** parse state (`isParsing`) is already lifted to the node, but its
  indicator is an inline skeleton/pulse-dot, not a consistent "Processing" signal.

## Goal

While a node is generating/editing, its canvas card **header** shows a clear
`◌ Processing` pill in place of the status dot. Visible **whenever the node is
working, regardless of focus-view state** — so it survives the focus view being
closed. When idle, the normal status dot returns.

Scope: all three generating node types — **script**, **video-gen**, **image-gen**.

## Key architectural finding

The node card and its focus view are **siblings**, both rendered by the node
component. The `<Sheet>` (Base UI `Dialog`) unmounts only its *popup subtree* on
close — the `ImageGenFocusView` / `ScriptFocusView` component that owns the
in-flight fetch promise and the generating state **stays mounted**. So state and
the request are not actually lost on close.

The real gap is **visibility, not persistence**: image-gen's boolean is trapped
inside the focus view with no shared channel the node card can subscribe to.
Script solved this by lifting `isParsing` to the node via an `onParsingChange`
callback; video solved it via the Zustand store. Only image-gen was left stranded.

Therefore the fix is "share one boolean + show one pill", **not** new realtime
infrastructure.

## Design

### 1. Shared visual — `ProcessingPill`

New component: `src/components/nodes/processing-pill.tsx`.

- Props: `{ processing: boolean }`. Renders `null` when `false`.
- Renders a small header chip: Lucide `Loader2` (1.5 stroke, `animate-spin`) +
  the word "Processing" using the `.text-eyebrow` utility (tracked small-caps),
  on a faint `bg-primary/5` rounded pill.
- Design-system compliant: purple used sparingly (spinner/accent only), no new
  colors, Lucide-only icon, motion via the existing `animate-spin` (the spinner is
  a steady rotation, not a spring/bounce).
- This is the **only** thing the three node types share. State sources stay
  per-node-type.

### 2. State per node type (smallest change each)

- **script** — `ScriptNode` already holds `isParsing` (lifted via
  `onParsingChange`). Render `<ProcessingPill processing={isParsing} />` in the
  header in place of the current pulse dot. (The in-body parsing skeleton, if any,
  is out of scope and left as-is unless it visually conflicts.)
- **video-gen** — `VideoGenNode` already reads `isGenerating` from
  `useVideoGenStatus(id)`. Replace the header dot with
  `<ProcessingPill processing={isGenerating} />`.
- **image-gen** — the gap. Add the smallest shared channel:
  - Canvas store (`src/lib/canvas-store.ts`): new slice
    `processing: Record<string, boolean>` and action
    `setProcessing(nodeId: string, value: boolean)`.
  - `ImageGenFocusView`: call `setProcessing(nodeId, true)` at the **start** of
    **both** the generate and edit handlers, and `setProcessing(nodeId, false)` in
    their `finally` blocks. Keep the existing local `generating`/`editing` state
    for in-sheet UI (skeleton mode etc.); the store flag is the cross-component
    mirror.
  - `ImageGenNode`: read `processing[id]` from the store and render
    `<ProcessingPill processing={isProcessing} />` in the header in place of the
    static dot.

This works across a focus-view close because the focus-view component (which owns
the promise) stays mounted, and the `finally` store write is mount-independent.

### Why image-gen gets a store slice but script/video do not

Script and video already expose their generating boolean through an existing
shared channel (callback-to-node and store, respectively). Image-gen's was private
to the focus view. We add the **smallest** channel that fixes image-gen rather than
rewriting all three onto one mechanism — that would be churn against working code
for no behavioral gain, and the per-node state sources are an internal detail the
shared `ProcessingPill` hides.

## Edge cases

- **Error path** — image-gen's existing `finally` clears the flag, so the pill
  hides on failure; existing error/empty UI is untouched.
- **Edit vs. fresh generate** — both image-gen handlers set/clear the flag.
- **Idle** — pill renders `null`; the normal status dot returns.
- **Node deleted mid-flight** — the node (and its pill) disappear with the card;
  the orphaned `processing[id]` entry is harmless. (Optional future cleanup: clear
  on node unmount — not required for this feature.)

## Testing (TDD — tests first)

1. `ProcessingPill` unit test: renders the pill (icon + "Processing") when
   `processing` is `true`; renders nothing when `false`.
2. Canvas store test: `setProcessing(id, true)` / `setProcessing(id, false)`
   toggles `processing[id]`.
3. `ImageGenNode` component test: shows the pill when `processing[id]` is `true`
   in the store, and the normal dot when `false`.

## Out of scope

- No changes to the generation/edit request flow, the `generations` table, or
  realtime subscriptions.
- No change to video-gen's realtime status pipeline (only its header indicator).
- No in-focus-view skeleton changes beyond what's needed to avoid a visual clash.
