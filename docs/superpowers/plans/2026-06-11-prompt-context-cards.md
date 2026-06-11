# Prompt context cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Prompt focus view's single compiled-prompt blob with three labeled, individually-viewable context cards (Ambient / Connected / Inline), each owning its control + content.

**Architecture:** Reshape the compile-preview route to return the already-resolved parts separately (`{ ambient, connected }`) instead of one concatenated string; restructure `prompt-focus-view.tsx` into three cards; extract the empty-instruction fallback to a shared `DEFAULT_INSTRUCTION` constant so the Inline card and `compilePrompt` never drift. No new pipeline logic, no new DB queries.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript (strict), `@xyflow/react`, Base UI (sheet), Vitest.

**Spec:** `docs/superpowers/specs/2026-06-11-prompt-context-cards-design.md`

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `src/lib/nodes/prompt.ts` | Export `DEFAULT_INSTRUCTION`; use it in `compilePrompt` | 1 (modify) |
| `src/lib/nodes/prompt.test.ts` | Assert the default against the exported constant | 1 (modify) |
| `src/app/api/nodes/[id]/compile-preview/route.ts` | Return `{ ambient, connected }` (structured parts) | 2 (modify) |
| `src/components/nodes/prompt-focus-view.tsx` | Three context cards + inline fallback | 3 (rewrite) |

Verification commands: `npx vitest run <file>` (unit), `npx tsc --noEmit` (types), `npm run lint` (lint).

---

## Task 1: Extract `DEFAULT_INSTRUCTION`

**Files:**
- Modify: `src/lib/nodes/prompt.ts`
- Modify: `src/lib/nodes/prompt.test.ts`

- [ ] **Step 1: Add the failing assertion**

In `src/lib/nodes/prompt.test.ts`, change the import line:

```ts
import { compilePrompt } from "./prompt";
```

to:

```ts
import { compilePrompt, DEFAULT_INSTRUCTION } from "./prompt";
```

and in the test `"omits empty blocks and defaults a missing instruction"`, add one assertion right after the existing `expect(user).toContain("Instruction:");` line:

```ts
    expect(user).toContain(DEFAULT_INSTRUCTION);
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/nodes/prompt.test.ts`
Expected: FAIL — `DEFAULT_INSTRUCTION` is not exported (import resolves to `undefined`, or a type error under tsc).

- [ ] **Step 3: Extract the constant**

In `src/lib/nodes/prompt.ts`, add the export just below the `import` line (after line 4):

```ts
// The instruction sent when the operator leaves the Inline box blank. Exported so
// the Prompt focus view can show the exact sentence the model will receive.
export const DEFAULT_INSTRUCTION =
  "Write an image-generation prompt from the material above.";
```

Then change the fallback line inside `compilePrompt` from:

```ts
  const instruction =
    input.instruction.trim() || "Write an image-generation prompt from the material above.";
```

to:

```ts
  const instruction = input.instruction.trim() || DEFAULT_INSTRUCTION;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/nodes/prompt.test.ts`
Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/nodes/prompt.ts src/lib/nodes/prompt.test.ts
git commit -m "refactor(stage2): extract DEFAULT_INSTRUCTION constant"
```

---

## Task 2: Reshape compile-preview response

**Files:**
- Modify: `src/app/api/nodes/[id]/compile-preview/route.ts`

- [ ] **Step 1: Replace the route body**

Replace the entire contents of `src/app/api/nodes/[id]/compile-preview/route.ts` with:

```ts
import { resolvePromptInputs } from "@/lib/nodes/resolve-inputs";
import { apiError, apiOk } from "@/lib/api/route-helpers";

// POST /api/nodes/:id/compile-preview — resolve the node's inputs WITHOUT calling
// the model, and return them as structured parts. Powers the Prompt focus view's
// Ambient + Connected context cards (the Inline instruction is client-side state,
// so it is not echoed back here).
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: nodeId } = await params;
  const body = (await req.json().catch(() => null)) as { slices?: unknown } | null;

  const resolved = await resolvePromptInputs(nodeId, body?.slices);
  if (!resolved) return apiError("Node not found.", 404);

  return apiOk({
    ambient: resolved.clientContext,
    connected: resolved.upstream.map((u) => ({
      nodeId: u.nodeId,
      label: u.label,
      text: u.text,
    })),
  });
}
```

(This drops the `compilePrompt` import and the `instruction` handling — the route no
longer assembles the full string; `compilePrompt` is still used by `/generate`.)

- [ ] **Step 2: Verify types + lint**

Run: `npx tsc --noEmit`
Expected: clean.

Run: `npm run lint`
Expected: no new errors in `compile-preview/route.ts`.

- [ ] **Step 3: Commit**

```bash
git add "src/app/api/nodes/[id]/compile-preview/route.ts"
git commit -m "feat(stage2): compile-preview returns structured context parts"
```

---

## Task 3: Three context cards in the focus view

**Files:**
- Rewrite: `src/components/nodes/prompt-focus-view.tsx`

- [ ] **Step 1: Replace the whole file**

Replace the entire contents of `src/components/nodes/prompt-focus-view.tsx` with:

```tsx
"use client";

import { useState, useEffect, type ReactNode } from "react";
import {
  ArrowLeft,
  Sparkles,
  RefreshCw,
  Palette,
  Link2,
  PencilLine,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { SliceToggles } from "./slice-toggles";
import { DEFAULT_INSTRUCTION } from "@/lib/nodes/prompt";
import type { KBSliceKey } from "@/lib/kb/parse-context";

type Upstream = { id: string; label: string };
type ConnectedPreview = { nodeId: string; label: string; text: string };

type PromptFocusViewProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nodeId: string;
  title: string;
  instruction: string;
  output: string | null;
  slices: KBSliceKey[];
  upstream: Upstream[];
  onPatch: (patch: Record<string, unknown>) => void;
  onSaveOutput: (output: string) => Promise<void>;
};

// A labeled context section: icon + eyebrow label + optional source badge + body.
function ContextCard({
  icon: Icon,
  label,
  badge,
  children,
}: {
  icon: LucideIcon;
  label: string;
  badge?: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-card">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Icon className="size-3.5 text-primary" />
          <span className="text-eyebrow">{label}</span>
        </div>
        {badge && <span className="text-xs text-muted-foreground">{badge}</span>}
      </div>
      <div className="mt-3">{children}</div>
    </div>
  );
}

// The Prompt node's surface — a full-width bottom sheet. The body is a single
// column of three context cards (Ambient brand KB, Connected upstream nodes, Inline
// instruction), then Generate, then the generated, editable output (Save folds into
// the active version, D19).
export function PromptFocusView({
  open,
  onOpenChange,
  nodeId,
  title,
  instruction,
  output,
  slices,
  upstream,
  onPatch,
  onSaveOutput,
}: PromptFocusViewProps) {
  const [draft, setDraft] = useState(output ?? "");
  const [generating, setGenerating] = useState(false);
  const [preview, setPreview] = useState<{ ambient: string; connected: ConnectedPreview[] }>({
    ambient: "",
    connected: [],
  });
  const [seed, setSeed] = useState<{ open: boolean; output: string | null }>({ open, output });

  // Reseed the editable draft when the view opens or a fresh generation lands
  // (state-during-render, React's documented alternative to a reset effect).
  if (seed.open !== open || seed.output !== output) {
    setSeed({ open, output });
    setDraft(output ?? "");
  }

  const dirty = (output ?? "") !== draft && draft.trim() !== "";
  const mode: "skeleton" | "result" | "empty" = generating
    ? "skeleton"
    : output
      ? "result"
      : "empty";

  // Live context preview — debounced; best-effort. Ambient + connected depend only
  // on the node's edges and KB slices (not the instruction), so we key on slices.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/nodes/${nodeId}/compile-preview`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slices }),
        });
        const json = await res.json();
        if (!cancelled && res.ok) {
          setPreview({ ambient: json.ambient ?? "", connected: json.connected ?? [] });
        }
      } catch {
        /* preview is best-effort */
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [open, nodeId, slices]);

  async function runGenerate() {
    setGenerating(true);
    try {
      const res = await fetch(`/api/nodes/${nodeId}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruction, slices }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Generation failed");
      onPatch({ parsed: json.output });
      toast.success("Prompt generated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setGenerating(false);
    }
  }

  async function handleSave() {
    try {
      await onSaveOutput(draft);
      onPatch({ parsed: draft });
      toast.success("Saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    }
  }

  function toggleSlice(key: KBSliceKey) {
    const next = slices.includes(key) ? slices.filter((k) => k !== key) : [...slices, key];
    onPatch({ kbSlices: next });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="gap-0 overflow-hidden rounded-t-2xl bg-background data-[side=bottom]:h-[92vh]"
      >
        <div className="flex shrink-0 justify-center pt-3">
          <div className="h-1.5 w-12 rounded-full bg-border" />
        </div>

        <div className="shrink-0 border-b">
          <div className="mx-auto w-full max-w-3xl px-6 pb-5 pt-3">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="size-4" /> Back to canvas
            </button>

            <header className="mt-4 flex items-start justify-between gap-4">
              <div>
                <SheetTitle className="font-display text-3xl font-semibold tracking-tight">
                  {title || "Image prompt"}
                </SheetTitle>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  Compose context into a generated image prompt.
                </p>
              </div>

              {mode === "result" && (
                <div className="flex shrink-0 items-center gap-2">
                  <Button variant="outline" size="lg" onClick={runGenerate}>
                    <RefreshCw className="size-4 text-primary" /> Re-generate
                  </Button>
                  {dirty && (
                    <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-[0.65rem] font-semibold text-red-700 dark:bg-red-900/30 dark:text-red-400">
                      Unsaved changes
                    </span>
                  )}
                  <Button size="lg" onClick={handleSave} disabled={!dirty}>
                    Save
                  </Button>
                </div>
              )}
            </header>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-3xl space-y-5 px-6 py-8">
            {/* Ambient — brand KB */}
            <ContextCard icon={Palette} label="Ambient · Brand KB" badge="Brand KB">
              <SliceToggles selected={slices} onToggle={toggleSlice} />
              {preview.ambient.trim() ? (
                <pre className="mt-3 max-h-48 overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-foreground/80">
                  {preview.ambient}
                </pre>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">No brand context selected.</p>
              )}
            </ContextCard>

            {/* Connected — upstream nodes */}
            <ContextCard
              icon={Link2}
              label="Connected · Inputs"
              badge={`${upstream.length} input${upstream.length === 1 ? "" : "s"}`}
            >
              {upstream.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Connect a Script or Note node to feed this prompt.
                </p>
              ) : (
                <ul className="space-y-2">
                  {upstream.map((u) => {
                    const text = preview.connected.find((c) => c.nodeId === u.id)?.text ?? "";
                    return (
                      <li key={u.id} className="rounded-md border border-border px-3 py-2">
                        <span className="text-xs font-semibold text-foreground">{u.label}</span>
                        {text.trim() && (
                          <pre className="mt-1 max-h-32 overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-foreground/70">
                            {text}
                          </pre>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </ContextCard>

            {/* Inline — instruction */}
            <ContextCard icon={PencilLine} label="Inline · Instruction" badge="Instruction">
              <textarea
                value={instruction}
                onChange={(e) => onPatch({ instruction: e.target.value })}
                rows={4}
                placeholder="e.g. cinematic product hero shot, warm Ayurvedic palette…"
                className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
              {!instruction.trim() && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Will send: <span className="italic">{DEFAULT_INSTRUCTION}</span>
                </p>
              )}
            </ContextCard>

            <Button className="w-full" size="lg" onClick={runGenerate} disabled={generating}>
              <Sparkles className="size-4" />
              {generating ? "Generating…" : output ? "Re-generate" : "Generate prompt"}
            </Button>

            {/* Generated output */}
            <div>
              <span className="text-eyebrow">Generated prompt</span>
              {mode === "skeleton" ? (
                <div className="mt-2 space-y-2">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="h-4 w-full animate-pulse rounded bg-muted" />
                  ))}
                </div>
              ) : mode === "empty" ? (
                <p className="mt-2 rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                  Not generated yet. Set an instruction and click Generate.
                </p>
              ) : (
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  rows={10}
                  className="mt-2 w-full resize-none rounded-xl border border-border bg-background p-4 text-sm leading-relaxed focus:outline-none focus:ring-1 focus:ring-ring"
                />
              )}
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 2: Verify types + lint**

Run: `npx tsc --noEmit`
Expected: clean.

Run: `npm run lint`
Expected: no new errors in `prompt-focus-view.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/components/nodes/prompt-focus-view.tsx
git commit -m "feat(stage2): categorized context cards in Prompt focus view"
```

---

## Task 4: Full-suite check + manual end-to-end

- [ ] **Step 1: Unit suite + types + lint**

Run: `npm test`
Expected: PASS — all suites green (including the updated `prompt.test.ts`).

Run: `npx tsc --noEmit` then `npm run lint`
Expected: both clean (no NEW errors beyond the pre-existing `ref/Yuvabe`,
`canvas-store-provider.tsx`, `kb-node.tsx`, `kb/images/route.ts` baseline).

- [ ] **Step 2: Manual end-to-end**

Run: `npm run dev`. Open a Prompt node's focus view for a client whose KB is `ready`.
1. The **Ambient** card shows the brand-KB text and the slice toggles; toggling a
   slice (e.g. Brand profile) updates the text after the debounce.
2. With no edges, the **Connected** card shows "Connect a Script or Note node…" and
   the badge reads "0 inputs".
3. Connect a Note + a Script into the Prompt → the **Connected** card lists both
   (badge "2 inputs"), each with its output text.
4. Leave the **Inline** instruction blank → muted "Will send: Write an
   image-generation prompt from the material above." appears; type an instruction →
   it disappears.
5. **Generate prompt** → skeleton → the generated prompt fills the editable area.
6. Edit it → "Unsaved changes" + Save enable → **Save** → reopen shows it persisted.

- [ ] **Step 3: Final commit (if any manual fixes were needed)**

```bash
git add -A
git commit -m "test(stage2): manual e2e of categorized context cards"
```

---

## Self-Review

**Spec coverage:**
- Three categorized cards (Ambient/Connected/Inline) — Task 3. ✅
- Each card owns control + content (toggles in Ambient, list in Connected, textarea in Inline) — Task 3. ✅
- Sidebar removed, single column — Task 3 (`max-w-3xl` body, no `<aside>`/`<main>` grid). ✅
- Full-prompt disclosure dropped — Task 3 (not rendered). ✅
- Inline empty-instruction fallback shown — Task 3 + `DEFAULT_INSTRUCTION` from Task 1. ✅
- compile-preview returns `{ ambient, connected }` — Task 2. ✅
- `compilePrompt` unchanged behavior, `DEFAULT_INSTRUCTION` single source — Task 1. ✅
- Empty states (Ambient / Connected) — Task 3. ✅
- Out of scope (collapse, editing connected text, reorder, raw view) — not built. ✅

**Placeholder scan:** none — every code step shows full content; every command has expected output.

**Type consistency:** `DEFAULT_INSTRUCTION` (Task 1) is imported in both Task 3 and `prompt.test.ts` (Task 1). The compile-preview response `{ ambient: string, connected: {nodeId,label,text}[] }` (Task 2) matches the `preview` state shape and the `ConnectedPreview` type in Task 3. `resolved.upstream` items expose `nodeId`, `label`, `text` (from `ResolvedPromptInputs` in `resolve-inputs.ts`) — consumed by Task 2's `.map`. The `PromptFocusViewProps` are unchanged from the existing caller in `prompt-node.tsx`, so no change is needed there. The Connected list keys on the store `upstream` prop (`u.id`) and looks up text by `nodeId` from the preview — both fields exist.
