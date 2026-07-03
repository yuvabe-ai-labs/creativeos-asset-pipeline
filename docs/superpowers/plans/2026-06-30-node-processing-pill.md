# Node "Processing" Pill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a clear `◌ Processing` pill in a generating node's card header (replacing the status dot) whenever it is generating/editing — visible even after the focus view is closed.

**Architecture:** One shared presentational `ProcessingPill` component, rendered in the header of the three generating node types. Each node feeds it a boolean from its existing (script: `isParsing` via callback; video: `isGenerating` via `useVideoGenStatus`) or newly-lifted (image-gen: a node→focus-view `onProcessingChange` callback mirroring `generating || editing`) state. No global store changes, no realtime/server changes.

**Tech Stack:** Next.js (App Router), React, `@xyflow/react`, Tailwind v4, shadcn (Base UI), Lucide. Tests: none added — manual verification (repo's vitest is `node`-env, pure-logic only).

## Global Constraints

- **Design system (Yuvabe):** purple `#5829c7` sparingly (accent only, never a fill); Lucide icons only at 1.5 stroke; motion easing `cubic-bezier(0.22,1,0.36,1)` (the spinner is a steady `animate-spin` rotation — allowed; no springs/bounce). Drive color through shadcn CSS variables (`text-primary`, `bg-primary/5`), never hardcode.
- **Eyebrow labels:** use the `.text-eyebrow` utility for tracked small-caps, not mono. Node headers size it with `!text-[0.65rem]`.
- **Components:** one component per file, named export. shadcn/Base UI conventions.
- **No new test infra** (decided): verify manually by running the app.

---

### Task 1: `ProcessingPill` component

**Files:**
- Create: `src/components/nodes/processing-pill.tsx`

**Interfaces:**
- Produces: `ProcessingPill({ processing }: { processing: boolean }): JSX.Element | null` — renders a compact header chip (spinner + "Processing") when `processing` is `true`, otherwise `null`.

- [ ] **Step 1: Create the component**

```tsx
// src/components/nodes/processing-pill.tsx
import { Loader2 } from "lucide-react";

/**
 * Header chip shown on a generating node's card while it is processing.
 * Replaces the static status dot. Renders nothing when not processing, so
 * callers can place it alongside their normal dot:
 *   <ProcessingPill processing={isProcessing} />
 *   {!isProcessing && <span className="size-1.5 rounded-full …" />}
 */
export function ProcessingPill({ processing }: { processing: boolean }) {
  if (!processing) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-primary/5 px-1.5 py-0.5 text-primary">
      <Loader2 className="size-3 animate-spin stroke-[1.5]" />
      <span className="text-eyebrow !text-[0.6rem]">Processing</span>
    </span>
  );
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `npm run lint`
Expected: no errors referencing `processing-pill.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/components/nodes/processing-pill.tsx
git commit -m "feat(nodes): add ProcessingPill header chip"
```

---

### Task 2: Wire image-gen (the gap)

`ImageGenFocusView` owns `generating`/`editing` local state that already survives a focus-view close (the component is rendered unconditionally by the node; only the `<Sheet>` popup unmounts). We add a callback that mirrors that state up to `ImageGenNode`, which renders the pill.

**Files:**
- Modify: `src/components/nodes/image-gen-focus-view.tsx` (props type ~line 65; destructure ~line 165; add effect ~line 178)
- Modify: `src/components/nodes/image-gen-node.tsx` (state ~line 44; header dot lines 62-68; focus-view props lines 87-99)

**Interfaces:**
- Consumes: `ProcessingPill` from Task 1.
- Produces: `ImageGenFocusViewProps.onProcessingChange?: (v: boolean) => void`.

- [ ] **Step 1: Add `onProcessingChange` to the focus-view props type**

In `image-gen-focus-view.tsx`, add the optional prop to `ImageGenFocusViewProps` right after `onPatch` (line 65):

```tsx
  onPatch: (patch: Record<string, unknown>) => void;
  /** Mirrors in-flight generate/edit state up to the node so its card can show
   *  a Processing pill even while the focus view is closed. */
  onProcessingChange?: (v: boolean) => void;
};
```

- [ ] **Step 2: Destructure the new prop**

In the `ImageGenFocusView({ … })` signature (lines 154-166), add `onProcessingChange,` after `onPatch,`:

```tsx
  upstream,
  onPatch,
  onProcessingChange,
}: ImageGenFocusViewProps) {
```

- [ ] **Step 3: Add the mirror effect**

Immediately after the `generating`/`editing` state declarations (after line 178 `const [editing, setEditing] = useState(false);`), add:

```tsx
  // Mirror in-flight state up to the node card (survives focus-view close).
  useEffect(() => {
    onProcessingChange?.(generating || editing);
  }, [generating, editing, onProcessingChange]);
```

(`useEffect` is already imported on line 3.)

- [ ] **Step 4: Hold the boolean in `ImageGenNode` and render the pill**

In `image-gen-node.tsx`:

(a) Add the import near the other node imports (after line 10):

```tsx
import { ProcessingPill } from "./processing-pill";
```

(b) Add state after `const [focusOpen, setFocusOpen] = useState(false);` (line 44):

```tsx
  const [isProcessing, setIsProcessing] = useState(false);
```

(c) Replace the header status dot (lines 62-68) with the pill-or-dot pair:

```tsx
          {isProcessing ? (
            <ProcessingPill processing />
          ) : (
            <span
              className={cn(
                "size-1.5 rounded-full",
                imageUrl ? "bg-primary" : "bg-muted-foreground/40",
              )}
              title={imageUrl ? "Image generated" : "Not generated"}
            />
          )}
```

(d) Pass the callback to the focus view — add `onProcessingChange={setIsProcessing}` inside the `<ImageGenFocusView … />` props (after `onPatch=…`, line 98):

```tsx
          onPatch={(patch) => updateNodeData(id, patch)}
          onProcessingChange={setIsProcessing}
        />
```

- [ ] **Step 5: Typecheck + lint**

Run: `npm run lint`
Expected: no errors in `image-gen-node.tsx` / `image-gen-focus-view.tsx`.

- [ ] **Step 6: Commit**

```bash
git add src/components/nodes/image-gen-node.tsx src/components/nodes/image-gen-focus-view.tsx
git commit -m "feat(nodes): image-gen shows Processing pill, survives focus-view close"
```

---

### Task 3: Swap video-gen header dot for the pill

**Files:**
- Modify: `src/components/nodes/video-gen-node.tsx` (import; header dot lines 46-58)

**Interfaces:**
- Consumes: `ProcessingPill`; existing `isGenerating` from `useVideoGenStatus(id)` (line 23).

- [ ] **Step 1: Import the pill**

After line 11 (`import { useVideoGenStatus } …`):

```tsx
import { ProcessingPill } from "./processing-pill";
```

- [ ] **Step 2: Replace the header status dot (lines 46-58)**

```tsx
          {isGenerating ? (
            <ProcessingPill processing />
          ) : (
            <span
              className={cn(
                "size-1.5 rounded-full",
                videoUrl ? "bg-primary" : "bg-muted-foreground/40",
              )}
              title={videoUrl ? "Video generated" : "Not generated"}
            />
          )}
```

(The in-body skeleton at lines 63-65 stays — it already only shows while generating.)

- [ ] **Step 3: Typecheck + lint**

Run: `npm run lint`
Expected: no errors in `video-gen-node.tsx`.

- [ ] **Step 4: Commit**

```bash
git add src/components/nodes/video-gen-node.tsx
git commit -m "feat(nodes): video-gen header uses Processing pill"
```

---

### Task 4: Swap script header dot for the pill

**Files:**
- Modify: `src/components/nodes/script-node.tsx` (import; header dot lines 57-67)

**Interfaces:**
- Consumes: `ProcessingPill`; existing `isParsing` (line 32), already lifted from the focus view via `onParsingChange`.

- [ ] **Step 1: Import the pill**

After line 11 (`import { NodeContextMenu } …`):

```tsx
import { ProcessingPill } from "./processing-pill";
```

- [ ] **Step 2: Replace the header status dot (lines 57-67)**

```tsx
        {isParsing ? (
          <ProcessingPill processing />
        ) : (
          <span
            className={cn(
              "size-1.5 rounded-full transition-colors",
              parsed ? "bg-primary" : "bg-muted-foreground/40",
            )}
            title={parsed ? "Extracted" : "Not extracted"}
          />
        )}
```

(The in-body parsing skeleton at lines 70-77 stays — it already only shows while parsing.)

- [ ] **Step 3: Typecheck + lint**

Run: `npm run lint`
Expected: no errors in `script-node.tsx`.

- [ ] **Step 4: Commit**

```bash
git add src/components/nodes/script-node.tsx
git commit -m "feat(nodes): script header uses Processing pill"
```

---

### Task 5: Manual verification pass

**Files:** none.

- [ ] **Step 1: Run the app**

Run: `npm run dev` and open a canvas.

- [ ] **Step 2: Verify each node type**

1. **image-gen** — connect a Prompt node, open the focus view, click Generate, **close the focus view immediately**. The node header shows `◌ Processing`; it returns to the normal dot when generation finishes. Repeat using **Edit**.
2. **video-gen** — start a generation, close the focus view → header shows the pill, clears on completion.
3. **script** — paste/upload a brief and parse, close the focus view → header shows the pill, clears when parsing finishes.
4. **idle** — a node that isn't generating shows the normal status dot, no pill.

- [ ] **Step 3: Full lint/build gate**

Run: `npm run lint`
Expected: clean. (Pre-existing unrelated failures — see project memory — are not introduced by this change.)

---

## Self-Review

- **Spec coverage:** ProcessingPill (Task 1); image-gen callback wiring (Task 2); video-gen + script header swaps (Tasks 3-4); manual verification matching the spec's test list (Task 5). All spec sections covered.
- **Placeholders:** none — every code step shows the actual code.
- **Type consistency:** `onProcessingChange?: (v: boolean) => void` defined in Task 2 and consumed via `setIsProcessing` (a `Dispatch<SetStateAction<boolean>>`, compatible). `ProcessingPill` prop name `processing` consistent across Tasks 1-4.
