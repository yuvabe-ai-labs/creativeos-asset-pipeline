# Script Paste Option + Skeleton Wiring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users paste a reel brief into the Script node's empty state (alongside file upload), and replace the focus view's generic loading spinner with the existing content-shaped `ScriptSkeleton`.

**Architecture:** Both ingestion paths already converge on `onUpload(source: string)`, so paste is a pure UI addition to `ScriptEmptyState` with no backend or prop-signature changes. The skeleton change wires an already-built-but-unused component into the focus view's `skeleton` mode.

**Tech Stack:** Next.js (App Router), React, TypeScript, Tailwind v4, shadcn/Base-UI components (`Textarea`, `Button`, `Label`), Lucide icons.

## Global Constraints

- Use shadcn/ui components from `src/components/ui/*` — never native `<textarea>`/`<select>`/`<input>`. (`Textarea` is at `src/components/ui/textarea.tsx`; `Button` at `src/components/ui/button.tsx`.)
- Drive color through shadcn CSS variables / Tailwind tokens — no hardcoded hex. Purple/`primary` used sparingly (the CTA).
- Lucide icons only, 1.5 stroke, no fills.
- "Add"/primary affordances must be discoverable, not faint text links.
- No new dependencies. Repo has **no component-test harness** (`vitest.config.ts` is `environment: "node"`, globs `src/**/*.test.ts` only) — verification is **manual in the running app**, not automated.
- No changes to props/types: `ScriptEmptyStateProps` and `ScriptFocusViewProps` stay byte-for-byte the same.

---

### Task 1: Paste textarea + Extract button in the empty state

**Files:**
- Modify: `src/components/nodes/script-empty-state.tsx`

**Interfaces:**
- Consumes: existing prop `onUpload: (source: string) => void` (already in `ScriptEmptyStateProps`) — sets `source` + fires extraction in the parent.
- Produces: nothing new. No prop/type changes; the paste path calls the existing `onUpload`.

- [ ] **Step 1: Add imports**

At the top of `src/components/nodes/script-empty-state.tsx`, extend the existing imports. Add `Button` and `Textarea`; the `useState` import already exists.

```tsx
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
```

- [ ] **Step 2: Add a local buffer state**

Inside `ScriptEmptyState`, next to the existing `const [dragOver, setDragOver] = useState(false);`, add:

```tsx
const [pasted, setPasted] = useState("");
```

- [ ] **Step 3: Add a submit helper**

Below the existing `handleDrop` function (still inside the component), add a helper that guards on non-empty trimmed text and reuses `onUpload`:

```tsx
function submitPaste() {
  const text = pasted.trim();
  if (text) onUpload(text);
}
```

- [ ] **Step 4: Render the divider + textarea + Extract button**

In the returned JSX, insert this block **between** the closing `</label>` of the dropzone and the `<div className="grid gap-2">` that holds the Title field:

```tsx
<div className="grid gap-3">
  <div className="flex items-center gap-3 text-xs text-muted-foreground">
    <span className="h-px flex-1 bg-border" />
    <span className="text-eyebrow">or paste</span>
    <span className="h-px flex-1 bg-border" />
  </div>
  <Textarea
    value={pasted}
    onChange={(e) => setPasted(e.target.value)}
    onKeyDown={(e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        submitPaste();
      }
    }}
    placeholder="Paste your reel brief here…"
    rows={6}
    className="nodrag resize-none"
  />
  <div className="flex justify-end">
    <Button onClick={submitPaste} disabled={!pasted.trim()}>
      Extract
    </Button>
  </div>
</div>
```

- [ ] **Step 5: Manual verification in the running app**

Run the dev server (`npm run dev`, or the project's `/run` flow) and open a Script node's focus view on an empty (un-parsed) node.

Expected:
- A new `— or paste —` divider, textarea, and an `Extract` button appear below the dropzone, above Title.
- `Extract` is **disabled** while the textarea is empty or whitespace-only; typing real text **enables** it.
- Clicking `Extract` (or pressing ⌘/Ctrl+Enter in the textarea) flips the view into the loading state and runs extraction; the pasted text shows under "Show original" once parsed.
- Dropzone upload still works unchanged.

- [ ] **Step 6: Lint the touched file**

Run: `npm run lint`
Expected: no new errors for `script-empty-state.tsx`.

- [ ] **Step 7: Commit**

```bash
git add src/components/nodes/script-empty-state.tsx
git commit -m "feat(script): paste a reel brief in the empty state, not just upload"
```

---

### Task 2: Wire ScriptSkeleton into the focus view's loading state

**Files:**
- Modify: `src/components/nodes/script-focus-view.tsx`

**Interfaces:**
- Consumes: `ScriptSkeleton` from `./script-skeleton` (default export name `ScriptSkeleton`, no props).
- Produces: nothing new.

- [ ] **Step 1: Add the import**

Near the other component imports in `src/components/nodes/script-focus-view.tsx` (e.g. just after the `ScriptEmptyState` import), add:

```tsx
import { ScriptSkeleton } from "./script-skeleton";
```

- [ ] **Step 2: Replace the spinner block with the skeleton**

Find the `mode === "skeleton"` block (the centered `Loader2` spinner) inside the scroll container:

```tsx
{mode === "skeleton" && (
  <div className="flex flex-col items-center justify-center gap-3 py-24 text-muted-foreground">
    <Loader2 className="size-8 animate-spin text-primary" />
    <p className="text-sm">Extraction in progress…</p>
  </div>
)}
```

Replace it entirely with:

```tsx
{mode === "skeleton" && <ScriptSkeleton />}
```

- [ ] **Step 3: Remove the now-unused `Loader2` import**

In the `lucide-react` import line at the top:

```tsx
import { ArrowLeft, Eye, EyeOff, RefreshCw, FileUp, Clapperboard, Loader2 } from "lucide-react";
```

Drop `Loader2` (no other usage remains in this file):

```tsx
import { ArrowLeft, Eye, EyeOff, RefreshCw, FileUp, Clapperboard } from "lucide-react";
```

- [ ] **Step 4: Manual verification in the running app**

With the dev server running, trigger an extraction (upload or paste a brief in a Script node).

Expected:
- During extraction the body shows the content-shaped shimmer (title bar + gutter sections) — **not** the old centered spinner.
- When the parse lands, the shimmer collapses into the real `ScriptDocument` with no visible layout jump.

- [ ] **Step 5: Lint + typecheck the touched file**

Run: `npm run lint`
Expected: no new errors, and specifically no "unused variable `Loader2`" warning.

- [ ] **Step 6: Commit**

```bash
git add src/components/nodes/script-focus-view.tsx
git commit -m "feat(script): use ScriptSkeleton for the focus-view loading state"
```

---

## Self-Review

**Spec coverage:**
- Paste path (spec §Design 1) → Task 1. ✓
- Skeleton wiring (spec §Design 2) → Task 2. ✓
- "No new props/types" constraint → stated in Global Constraints + both Interfaces blocks. ✓
- Testing decision (spec §Testing) → manual-verification steps (no harness). ✓

**Placeholder scan:** No TBD/TODO/"handle edge cases" — every code step shows the full snippet, every verification step states expected behavior. ✓

**Type consistency:** `onUpload: (source: string) => void` used consistently; `submitPaste`/`pasted`/`setPasted` names consistent within Task 1; `ScriptSkeleton` import name matches its export. ✓
