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
- **image-gen** — the gap. Mirror the **exact script pattern** (a callback from
  node to focus view), so no global store state is added:
  - `ImageGenNode`: hold `const [isProcessing, setIsProcessing] = useState(false)`,
    pass `onProcessingChange={setIsProcessing}` to `ImageGenFocusView`, and render
    `<ProcessingPill processing={isProcessing} />` in the header in place of the
    static dot.
  - `ImageGenFocusView`: add an optional prop
    `onProcessingChange?: (v: boolean) => void`, and a single effect that mirrors
    the existing local state up:
    `useEffect(() => onProcessingChange?.(generating || editing), [generating, editing, onProcessingChange])`.
    Keep the existing local `generating`/`editing` state for in-sheet UI (skeleton
    mode etc.); the callback is the cross-component mirror, covering **both** fresh
    generate and edit with no per-handler edits.

This works across a focus-view close because the focus-view **component** (which
owns the in-flight promise and the `generating`/`editing` state) is rendered
unconditionally by the node and stays mounted — only the `<Sheet>` *popup subtree*
unmounts on close. So the effect keeps firing and the node's `isProcessing` stays
correct.

### Why the callback pattern, not a store slice

An earlier draft proposed a `processing` slice on the canvas store. Planning showed
the script node already solves the identical problem with a node→focus-view callback
(`onParsingChange`), and the focus-view component stays mounted across close — so the
callback is sufficient, adds no global state, needs no orphan-cleanup on delete, and
makes all three node types consistent (script and image-gen both lift via callback;
video lifts via its existing store-backed realtime hook). The shared `ProcessingPill`
hides the per-node state source.

## Edge cases

- **Error path** — image-gen's existing `finally` clears the flag, so the pill
  hides on failure; existing error/empty UI is untouched.
- **Edit vs. fresh generate** — the `generating || editing` effect covers both.
- **Idle** — pill renders `null`; the normal status dot returns.
- **Node deleted mid-flight** — the node (and its local state + pill) disappear
  with the card. No global state to orphan.

## Testing — manual verification

The repo's vitest runs in a `node` environment with no DOM / React Testing Library;
every existing test is pure logic in `src/lib/**`. This feature is purely
presentational (a boolean wired to a pill), so we add no component-test infra and
verify manually by running the app:

1. **image-gen** — connect a Prompt node, open the focus view, click Generate,
   close the focus view immediately → the node header shows `◌ Processing`; it
   clears to the normal dot when generation finishes. Repeat with an **edit**.
2. **video-gen** — start a generation, close the focus view → header shows the pill,
   clears on completion.
3. **script** — paste/upload a brief and parse, close the focus view → header shows
   the pill, clears when parsing finishes.
4. **idle** — a node not generating shows the normal status dot, no pill.

## Out of scope

- No changes to the generation/edit request flow, the `generations` table, or
  realtime subscriptions.
- No change to video-gen's realtime status pipeline (only its header indicator).
- No in-focus-view skeleton changes beyond what's needed to avoid a visual clash.
