# Script focus view Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A full-screen, single-column, click-to-edit document for the parsed reel script, launched from the Script node, with buffered edits committed by an explicit Save and the original script available on demand.

**Architecture:** Two new pure helpers (TDD'd) handle the shared reel-script type/guard and immutable path-based edits. Three new client components compose a reusable click-to-edit primitive into a document renderer and a full-screen Dialog shell that holds a local draft of `data.parsed`, tracks dirtiness, and commits via `updateNodeData` on Save. The Script node gains an Expand trigger and reuses the document renderer (read-only) for its inline preview, retiring `ReelOutput`.

**Tech Stack:** Next.js 16, React 19, TypeScript (strict), `@xyflow/react`, Base UI dialog (`@base-ui/react/dialog`, via `src/components/ui/dialog.tsx`), Vitest (already installed on `main`).

**Spec:** `docs/superpowers/specs/2026-06-07-script-focus-view-design.md`

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `src/lib/nodes/reel-script.ts` | Shared `ReelScript` type + `looksLikeReelScript` guard | 1 (create) |
| `src/lib/nodes/reel-script.test.ts` | Guard unit tests | 1 (create) |
| `src/lib/nodes/script-edit.ts` | Pure immutable edit helpers: `setScriptValue`, `addItem`, `removeItem` | 2 (create) |
| `src/lib/nodes/script-edit.test.ts` | Helper unit tests | 2 (create) |
| `src/components/nodes/editable-field.tsx` | Click-to-edit primitive (text/textarea) | 3 (create) |
| `src/components/nodes/script-document.tsx` | Renders the parsed script as editable/read-only sections | 4 (create) |
| `src/components/nodes/script-focus-view.tsx` | Full-screen Dialog shell: draft, dirty, Save/Discard, source toggle | 5 (create) |
| `src/components/nodes/script-node.tsx` | Add Expand trigger; swap inline preview to `script-document` | 6 (modify) |
| `src/components/nodes/reel-output.tsx` | Retired | 6 (delete) |

Verification commands used throughout: `npx vitest run <file>` (unit), `npx tsc --noEmit` (types), `npm run lint` (lint).

---

## Task 1: Shared reel-script type + guard (TDD)

**Files:**
- Create: `src/lib/nodes/reel-script.ts`
- Test: `src/lib/nodes/reel-script.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/nodes/reel-script.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { looksLikeReelScript } from "./reel-script";

describe("looksLikeReelScript", () => {
  it("is true when a reel-script section key is present", () => {
    expect(looksLikeReelScript({ strategic_objective: "x" })).toBe(true);
    expect(looksLikeReelScript({ visual_script: {} })).toBe(true);
    expect(looksLikeReelScript({ on_screen_text: {} })).toBe(true);
  });

  it("is false for an unrelated object", () => {
    expect(looksLikeReelScript({ foo: "bar" })).toBe(false);
    expect(looksLikeReelScript({})).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/nodes/reel-script.test.ts`
Expected: FAIL — cannot resolve `./reel-script`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/nodes/reel-script.ts`:

```ts
// Shared shape of a parsed reel SCRIPT (the output of the Script node's parse).
// Mirrors the reelSchema in src/prompts/script-parse.ts. All fields optional
// because a parse may legitimately leave a field empty.

export type ReelShot = { description?: string; duration?: string };

export type ReelScript = {
  title?: string;
  type?: string;
  duration?: string;
  schedule?: {
    date?: string;
    post_time?: string;
    category?: string;
    theme?: string;
  };
  strategic_objective?: string;
  ai_production_type?: string;
  visual_script?: { shots?: ReelShot[]; execution_refinement?: string };
  on_screen_text?: { intro?: string; body?: string[]; outro?: string };
  voiceover?: string;
  music_sound?: string;
  caption?: string;
  cta?: string;
  thumbnail_hook?: string;
  qc_notes?: string[];
  product_links?: string[];
};

// True when the object looks like a parsed reel script (vs an older/odd parse).
// Used to decide between the structured renderer and a raw-JSON fallback.
export function looksLikeReelScript(data: Record<string, unknown>): boolean {
  const r = data as ReelScript;
  return (
    r.strategic_objective !== undefined ||
    r.visual_script !== undefined ||
    r.on_screen_text !== undefined
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/nodes/reel-script.test.ts`
Expected: PASS — 2 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/nodes/reel-script.ts src/lib/nodes/reel-script.test.ts
git commit -m "feat: add shared ReelScript type and guard"
```

---

## Task 2: Pure immutable edit helpers (TDD)

**Files:**
- Create: `src/lib/nodes/script-edit.ts`
- Test: `src/lib/nodes/script-edit.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/nodes/script-edit.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { setScriptValue, addItem, removeItem } from "./script-edit";

describe("setScriptValue", () => {
  it("sets a nested scalar and returns a new object (no mutation)", () => {
    const before = { a: { b: "old" } };
    const after = setScriptValue(before, ["a", "b"], "new");
    expect(after).toEqual({ a: { b: "new" } });
    expect(before.a.b).toBe("old"); // original untouched
    expect(after).not.toBe(before);
  });

  it("sets an array element by numeric index", () => {
    const before = { visual_script: { shots: [{ description: "one" }, { description: "two" }] } };
    const after = setScriptValue(before, ["visual_script", "shots", 1, "description"], "TWO");
    expect(after.visual_script.shots[1].description).toBe("TWO");
    expect(after.visual_script.shots[0].description).toBe("one");
    expect(Array.isArray(after.visual_script.shots)).toBe(true);
    expect(before.visual_script.shots[1].description).toBe("two"); // untouched
  });

  it("creates missing intermediate objects", () => {
    const after = setScriptValue({}, ["schedule", "date"], "Mon");
    expect(after).toEqual({ schedule: { date: "Mon" } });
  });
});

describe("addItem", () => {
  it("appends to an existing array", () => {
    const after = addItem({ qc_notes: ["a"] }, ["qc_notes"], "b");
    expect(after.qc_notes).toEqual(["a", "b"]);
  });
  it("creates the array when missing", () => {
    const after = addItem({}, ["qc_notes"], "first");
    expect(after).toEqual({ qc_notes: ["first"] });
  });
});

describe("removeItem", () => {
  it("removes the element at the given index", () => {
    const after = removeItem({ qc_notes: ["a", "b", "c"] }, ["qc_notes"], 1);
    expect(after.qc_notes).toEqual(["a", "c"]);
  });
  it("is a no-op for an out-of-range index", () => {
    const after = removeItem({ qc_notes: ["a"] }, ["qc_notes"], 5);
    expect(after.qc_notes).toEqual(["a"]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/nodes/script-edit.test.ts`
Expected: FAIL — cannot resolve `./script-edit`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/nodes/script-edit.ts`:

```ts
// Immutable, path-based edit helpers for a parsed script. Generic over plain
// nested objects/arrays so they stay pure and trivially testable. A path segment
// that is a number addresses an array index; a string addresses an object key.

type Path = (string | number)[];

function getAtPath(obj: unknown, path: Path): unknown {
  let cur: unknown = obj;
  for (const key of path) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string | number, unknown>)[key as never];
  }
  return cur;
}

// Returns a copy of `obj` with the value at `path` replaced. Does not mutate.
export function setScriptValue<T>(obj: T, path: Path, value: unknown): T {
  if (path.length === 0) return value as T;
  const [head, ...rest] = path;

  if (typeof head === "number") {
    const arr = Array.isArray(obj) ? [...(obj as unknown[])] : [];
    arr[head] = rest.length === 0 ? value : setScriptValue(arr[head], rest, value);
    return arr as unknown as T;
  }

  const base =
    obj && typeof obj === "object" && !Array.isArray(obj)
      ? (obj as Record<string, unknown>)
      : {};
  return {
    ...base,
    [head]: rest.length === 0 ? value : setScriptValue(base[head], rest, value),
  } as T;
}

// Returns a copy of `obj` with `item` appended to the array at `path`.
export function addItem<T>(obj: T, path: Path, item: unknown): T {
  const current = getAtPath(obj, path);
  const arr = Array.isArray(current) ? current : [];
  return setScriptValue(obj, path, [...arr, item]);
}

// Returns a copy of `obj` with the element at `path`[index] removed.
export function removeItem<T>(obj: T, path: Path, index: number): T {
  const current = getAtPath(obj, path);
  const arr = Array.isArray(current) ? current : [];
  return setScriptValue(obj, path, arr.filter((_, i) => i !== index));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/nodes/script-edit.test.ts`
Expected: PASS — 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/nodes/script-edit.ts src/lib/nodes/script-edit.test.ts
git commit -m "feat: add immutable path-based script edit helpers"
```

---

## Task 3: `editable-field` click-to-edit primitive

**Files:**
- Create: `src/components/nodes/editable-field.tsx`

- [ ] **Step 1: Write the component**

Create `src/components/nodes/editable-field.tsx`:

```tsx
"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type EditableFieldProps = {
  value: string;
  onCommit: (next: string) => void;
  multiline?: boolean;
  placeholder?: string;
  readOnly?: boolean;
  className?: string;
};

// Click-to-edit text. Renders as read-only text until clicked, then becomes an
// Input (or Textarea). Enter (or Cmd/Ctrl+Enter for multiline) and blur commit;
// Esc cancels. Commits only when the value actually changed.
export function EditableField({
  value,
  onCommit,
  multiline = false,
  placeholder = "Add…",
  readOnly = false,
  className,
}: EditableFieldProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  const isEmpty = value.trim() === "";

  if (readOnly) {
    return (
      <span
        className={cn("whitespace-pre-wrap", isEmpty && "text-muted-foreground", className)}
      >
        {isEmpty ? placeholder : value}
      </span>
    );
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setDraft(value);
          setEditing(true);
        }}
        className={cn(
          "nodrag w-full whitespace-pre-wrap rounded-md px-1 py-0.5 text-left hover:bg-muted/60",
          isEmpty && "text-muted-foreground",
          className,
        )}
      >
        {isEmpty ? placeholder : value}
      </button>
    );
  }

  function commit() {
    setEditing(false);
    if (draft !== value) onCommit(draft);
  }
  function cancel() {
    setEditing(false);
    setDraft(value);
  }

  if (multiline) {
    return (
      <Textarea
        autoFocus
        rows={3}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            cancel();
          }
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            commit();
          }
        }}
        className={cn("nodrag", className)}
      />
    );
  }

  return (
    <Input
      autoFocus
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          cancel();
        }
        if (e.key === "Enter") {
          e.preventDefault();
          commit();
        }
      }}
      className={cn("nodrag", className)}
    />
  );
}
```

- [ ] **Step 2: Verify type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Verify lint**

Run: `npm run lint`
Expected: no new errors in `editable-field.tsx`.

- [ ] **Step 4: Commit**

```bash
git add src/components/nodes/editable-field.tsx
git commit -m "feat: add click-to-edit EditableField primitive"
```

---

## Task 4: `script-document` renderer

**Files:**
- Create: `src/components/nodes/script-document.tsx`

- [ ] **Step 1: Write the component**

Create `src/components/nodes/script-document.tsx`:

```tsx
"use client";

import type { ReactNode } from "react";
import { Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { looksLikeReelScript, type ReelScript } from "@/lib/nodes/reel-script";
import { EditableField } from "./editable-field";

type Path = (string | number)[];

type ScriptDocumentProps = {
  script: ReelScript;
  readOnly?: boolean;
  onChange?: (path: Path, value: unknown) => void;
  onAddItem?: (path: Path, item: unknown) => void;
  onRemoveItem?: (path: Path, index: number) => void;
};

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="grid gap-1.5">
      <span className="text-eyebrow">{label}</span>
      <div className="leading-relaxed">{children}</div>
    </section>
  );
}

// Renders a parsed reel script as a sequence of editable sections. In readOnly
// mode every field is plain text. If the data doesn't look like a reel script,
// falls back to read-only raw JSON.
export function ScriptDocument({
  script,
  readOnly = false,
  onChange,
  onAddItem,
  onRemoveItem,
}: ScriptDocumentProps) {
  if (!looksLikeReelScript(script as Record<string, unknown>)) {
    return (
      <pre className="overflow-x-auto rounded-lg border bg-muted/40 p-3 text-xs">
        {JSON.stringify(script, null, 2)}
      </pre>
    );
  }

  const set = (path: Path) => (v: string) => onChange?.(path, v);
  const shots = script.visual_script?.shots ?? [];
  const body = script.on_screen_text?.body ?? [];
  const qc = script.qc_notes ?? [];
  const links = script.product_links ?? [];

  return (
    <div className="grid gap-6 text-sm">
      <EditableField
        value={script.title ?? ""}
        onCommit={set(["title"])}
        readOnly={readOnly}
        placeholder="Untitled script"
        className="font-display text-2xl font-medium"
      />

      <p className="text-eyebrow">
        {[script.type, script.duration].filter(Boolean).join(" · ") || "—"}
      </p>

      <Section label="Schedule">
        <div className="grid grid-cols-2 gap-2">
          {(["date", "post_time", "category", "theme"] as const).map((k) => (
            <EditableField
              key={k}
              value={script.schedule?.[k] ?? ""}
              onCommit={set(["schedule", k])}
              readOnly={readOnly}
              placeholder={k}
            />
          ))}
        </div>
      </Section>

      <Section label="Objective">
        <EditableField
          value={script.strategic_objective ?? ""}
          onCommit={set(["strategic_objective"])}
          readOnly={readOnly}
          multiline
          placeholder="Add objective…"
        />
      </Section>

      <Section label="Production type">
        <EditableField
          value={script.ai_production_type ?? ""}
          onCommit={set(["ai_production_type"])}
          readOnly={readOnly}
          placeholder="Add production type…"
        />
      </Section>

      <Section label="Visual script">
        <ol className="grid gap-2">
          {shots.map((shot, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="pt-1 text-muted-foreground">{i + 1}.</span>
              <div className="flex-1">
                <EditableField
                  value={shot.description ?? ""}
                  onCommit={set(["visual_script", "shots", i, "description"])}
                  readOnly={readOnly}
                  multiline
                  placeholder="Shot description…"
                />
                <EditableField
                  value={shot.duration ?? ""}
                  onCommit={set(["visual_script", "shots", i, "duration"])}
                  readOnly={readOnly}
                  placeholder="duration"
                  className="text-xs text-muted-foreground"
                />
              </div>
              {!readOnly && (
                <button
                  type="button"
                  aria-label="Remove shot"
                  onClick={() => onRemoveItem?.(["visual_script", "shots"], i)}
                  className="nodrag rounded-md p-1 text-muted-foreground hover:bg-muted"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </li>
          ))}
        </ol>
        {!readOnly && (
          <button
            type="button"
            onClick={() => onAddItem?.(["visual_script", "shots"], { description: "", duration: "" })}
            className="nodrag mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            <Plus className="size-3.5" /> Add shot
          </button>
        )}
        <div className="mt-3">
          <span className="text-xs text-muted-foreground">Execution</span>
          <EditableField
            value={script.visual_script?.execution_refinement ?? ""}
            onCommit={set(["visual_script", "execution_refinement"])}
            readOnly={readOnly}
            multiline
            placeholder="Add execution notes…"
          />
        </div>
      </Section>

      <Section label="On-screen text">
        <div className="grid gap-1">
          <EditableField
            value={script.on_screen_text?.intro ?? ""}
            onCommit={set(["on_screen_text", "intro"])}
            readOnly={readOnly}
            placeholder="Intro…"
          />
          {body.map((_, i) => (
            <div key={i} className="flex items-center gap-2">
              <EditableField
                value={body[i] ?? ""}
                onCommit={set(["on_screen_text", "body", i])}
                readOnly={readOnly}
                placeholder="Line…"
                className="flex-1"
              />
              {!readOnly && (
                <button
                  type="button"
                  aria-label="Remove line"
                  onClick={() => onRemoveItem?.(["on_screen_text", "body"], i)}
                  className="nodrag rounded-md p-1 text-muted-foreground hover:bg-muted"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>
          ))}
          {!readOnly && (
            <button
              type="button"
              onClick={() => onAddItem?.(["on_screen_text", "body"], "")}
              className="nodrag inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              <Plus className="size-3.5" /> Add line
            </button>
          )}
          <EditableField
            value={script.on_screen_text?.outro ?? ""}
            onCommit={set(["on_screen_text", "outro"])}
            readOnly={readOnly}
            placeholder="Outro…"
          />
        </div>
      </Section>

      <Section label="Voiceover">
        <EditableField
          value={script.voiceover ?? ""}
          onCommit={set(["voiceover"])}
          readOnly={readOnly}
          multiline
          placeholder="Add voiceover…"
        />
      </Section>

      <Section label="Music & sound">
        <EditableField
          value={script.music_sound ?? ""}
          onCommit={set(["music_sound"])}
          readOnly={readOnly}
          multiline
          placeholder="Add music & sound…"
        />
      </Section>

      <Section label="Caption">
        <EditableField
          value={script.caption ?? ""}
          onCommit={set(["caption"])}
          readOnly={readOnly}
          multiline
          placeholder="Add caption…"
        />
      </Section>

      <Section label="CTA">
        <EditableField
          value={script.cta ?? ""}
          onCommit={set(["cta"])}
          readOnly={readOnly}
          placeholder="Add CTA…"
        />
        <EditableField
          value={script.thumbnail_hook ?? ""}
          onCommit={set(["thumbnail_hook"])}
          readOnly={readOnly}
          placeholder="Thumbnail hook…"
          className="text-muted-foreground"
        />
      </Section>

      <Section label="QC notes">
        <ul className="grid gap-1">
          {qc.map((_, i) => (
            <li key={i} className="flex items-center gap-2">
              <EditableField
                value={qc[i] ?? ""}
                onCommit={set(["qc_notes", i])}
                readOnly={readOnly}
                placeholder="Note…"
                className="flex-1"
              />
              {!readOnly && (
                <button
                  type="button"
                  aria-label="Remove note"
                  onClick={() => onRemoveItem?.(["qc_notes"], i)}
                  className="nodrag rounded-md p-1 text-muted-foreground hover:bg-muted"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
        {!readOnly && (
          <button
            type="button"
            onClick={() => onAddItem?.(["qc_notes"], "")}
            className="nodrag inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            <Plus className="size-3.5" /> Add note
          </button>
        )}
      </Section>

      <Section label="Product links">
        <ul className="grid gap-1">
          {links.map((_, i) => (
            <li key={i} className="flex items-center gap-2">
              <EditableField
                value={links[i] ?? ""}
                onCommit={set(["product_links", i])}
                readOnly={readOnly}
                placeholder="https://…"
                className="flex-1"
              />
              {!readOnly && (
                <button
                  type="button"
                  aria-label="Remove link"
                  onClick={() => onRemoveItem?.(["product_links"], i)}
                  className="nodrag rounded-md p-1 text-muted-foreground hover:bg-muted"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
        {!readOnly && (
          <button
            type="button"
            onClick={() => onAddItem?.(["product_links"], "")}
            className="nodrag inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            <Plus className="size-3.5" /> Add link
          </button>
        )}
      </Section>
    </div>
  );
}
```

- [ ] **Step 2: Verify type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Verify lint**

Run: `npm run lint`
Expected: no new errors in `script-document.tsx`.

- [ ] **Step 4: Commit**

```bash
git add src/components/nodes/script-document.tsx
git commit -m "feat: add ScriptDocument editable/read-only renderer"
```

---

## Task 5: `script-focus-view` full-screen shell

**Files:**
- Create: `src/components/nodes/script-focus-view.tsx`

- [ ] **Step 1: Write the component**

Create `src/components/nodes/script-focus-view.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { ArrowLeft, PanelLeftOpen, PanelLeftClose } from "lucide-react";
import { Dialog, DialogPortal, DialogOverlay, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { ReelScript } from "@/lib/nodes/reel-script";
import { setScriptValue, addItem, removeItem } from "@/lib/nodes/script-edit";
import { ScriptDocument } from "./script-document";

type Path = (string | number)[];

type ScriptFocusViewProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  source: string;
  parsed: ReelScript;
  onSave: (next: ReelScript) => void;
};

// Full-screen, buffered editor for a parsed reel script. Edits live in a local
// draft until the user clicks Save (which calls onSave). Closing with unsaved
// edits asks for confirmation. The original script is collapsed by default.
export function ScriptFocusView({
  open,
  onOpenChange,
  title,
  source,
  parsed,
  onSave,
}: ScriptFocusViewProps) {
  const [draft, setDraft] = useState<ReelScript>(parsed);
  const [showOriginal, setShowOriginal] = useState(false);

  // Reseed the draft from the saved script each time the view opens.
  useEffect(() => {
    if (open) setDraft(parsed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(parsed);

  function requestClose() {
    if (dirty && !window.confirm("Discard unsaved changes?")) return;
    onOpenChange(false);
  }

  function handleSave() {
    onSave(draft);
    onOpenChange(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) onOpenChange(true);
        else requestClose();
      }}
    >
      <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Popup className="fixed inset-0 z-50 flex flex-col bg-background outline-none data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0">
          <header className="flex items-center justify-between border-b px-5 py-3">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="sm" onClick={requestClose}>
                <ArrowLeft className="size-4" /> Back
              </Button>
              <DialogTitle className="font-display text-lg">
                {title || "Reel script"}
              </DialogTitle>
              {dirty && (
                <span className="text-xs text-muted-foreground">Unsaved changes</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowOriginal((v) => !v)}
              >
                {showOriginal ? (
                  <>
                    <PanelLeftClose className="size-4" /> Hide original
                  </>
                ) : (
                  <>
                    <PanelLeftOpen className="size-4" /> Show original
                  </>
                )}
              </Button>
              <Button size="sm" onClick={handleSave} disabled={!dirty}>
                Save
              </Button>
            </div>
          </header>

          <div className="flex min-h-0 flex-1">
            {showOriginal && (
              <aside className="w-80 shrink-0 overflow-y-auto border-r bg-muted/20 p-5">
                <span className="text-eyebrow">Original script</span>
                <pre className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
                  {source || "No original script."}
                </pre>
              </aside>
            )}
            <main className="flex-1 overflow-y-auto">
              <div className="mx-auto max-w-2xl px-6 py-10">
                <ScriptDocument
                  script={draft}
                  onChange={(path: Path, value) =>
                    setDraft((d) => setScriptValue(d, path, value))
                  }
                  onAddItem={(path: Path, item) =>
                    setDraft((d) => addItem(d, path, item))
                  }
                  onRemoveItem={(path: Path, index) =>
                    setDraft((d) => removeItem(d, path, index))
                  }
                />
              </div>
            </main>
          </div>
        </DialogPrimitive.Popup>
      </DialogPortal>
    </Dialog>
  );
}
```

- [ ] **Step 2: Verify type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Verify lint**

Run: `npm run lint`
Expected: no new errors in `script-focus-view.tsx`.

- [ ] **Step 4: Commit**

```bash
git add src/components/nodes/script-focus-view.tsx
git commit -m "feat: add full-screen ScriptFocusView buffered editor"
```

---

## Task 6: Wire into the Script node; retire ReelOutput

**Files:**
- Modify: `src/components/nodes/script-node.tsx`
- Delete: `src/components/nodes/reel-output.tsx`

- [ ] **Step 1: Update imports**

In `src/components/nodes/script-node.tsx`, replace:

```ts
import { ReelOutput } from "./reel-output";
```

with:

```ts
import { Maximize2 } from "lucide-react";
import { ScriptDocument } from "./script-document";
import { ScriptFocusView } from "./script-focus-view";
import type { ReelScript } from "@/lib/nodes/reel-script";
```

- [ ] **Step 2: Add focus-view open state**

In the component body, after the existing `const [parsing, setParsing] = useState(false);` line, add:

```ts
  const [focusOpen, setFocusOpen] = useState(false);
```

- [ ] **Step 3: Swap the inline preview to read-only ScriptDocument + add Expand**

Find the "Extracted reel" block (the `<div className="grid gap-2">` containing `<Label>Extracted reel</Label>` and the `{parsed ? <ReelOutput ... /> : <p>…Not extracted yet.</p>}`). Replace that whole block with:

```tsx
              <div className="grid gap-2">
                <div className="flex items-center justify-between">
                  <Label>Extracted reel</Label>
                  {parsed ? (
                    <button
                      type="button"
                      onClick={() => setFocusOpen(true)}
                      className="nodrag inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                    >
                      <Maximize2 className="size-3.5" /> Expand
                    </button>
                  ) : null}
                </div>
                {parsed ? (
                  <div className="rounded-lg border bg-muted/30 p-3">
                    <ScriptDocument script={parsed as ReelScript} readOnly />
                  </div>
                ) : (
                  <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                    Not extracted yet.
                  </p>
                )}
              </div>
```

- [ ] **Step 4: Render the focus view**

Immediately before the final closing `</div>` of the node's outer wrapper (after the `</Sheet>` and before the `<Handle ...>` elements is fine; place it right after the `</Sheet>` closing tag), add:

```tsx
      {parsed ? (
        <ScriptFocusView
          open={focusOpen}
          onOpenChange={setFocusOpen}
          title={title}
          source={source}
          parsed={parsed as ReelScript}
          onSave={(next) => updateNodeData(id, { parsed: next })}
        />
      ) : null}
```

- [ ] **Step 5: Delete the retired component**

```bash
git rm src/components/nodes/reel-output.tsx
```

- [ ] **Step 6: Verify no remaining references**

Run: `npx tsc --noEmit`
Expected: clean — no references to `ReelOutput` remain (the only importer was `script-node.tsx`).

- [ ] **Step 7: Verify lint + full test suite**

Run: `npm run lint`
Expected: no new errors in `script-node.tsx`.

Run: `npm test`
Expected: PASS — the Task 1 + Task 2 suites plus the pre-existing parse-context suite are all green.

- [ ] **Step 8: Manual verification**

Run: `npm run dev`. Open a canvas with a Script node that has a parsed script. In the Sheet, the "Extracted reel" preview now renders via `ScriptDocument` (read-only) with an **Expand** button. Click Expand → full-screen view opens. Edit the objective and a shot; the header shows "Unsaved changes" and Save enables. Click **Save** → view closes, reopening shows the edit persisted. Reopen, make an edit, click **Back** → confirm-discard prompt; discard reverts. Toggle **Show original** → the original script appears in the left reference panel.

- [ ] **Step 9: Commit**

```bash
git add src/components/nodes/script-node.tsx
git commit -m "feat: launch Script focus view from node; retire ReelOutput"
```

---

## Self-Review

**Spec coverage:**
- A (surface & launch: full-screen Dialog, Expand from Sheet, single column, Show-original toggle) → Tasks 5 + 6. ✅
- B (components: `script-focus-view`, `script-document`, `editable-field`, `script-edit` helpers; `script-document` replaces `ReelOutput` everywhere; `ReelOutput` retired) → Tasks 2–6. ✅
- C (buffered editor: local draft, immutable edits via `setScriptValue`, dirty tracking, explicit Save → `updateNodeData`, Discard/confirm-on-close, list add/remove, no reorder, click-to-edit, empty placeholders) → Tasks 2, 3, 4, 5. ✅
- D (odd-parse raw-JSON fallback, Expand only when parsed, confirm-discard) → Tasks 1 (guard), 4 (fallback), 5 (confirm), 6 (Expand gate). ✅
- Testing (TDD pure helpers; components via tsc/lint/manual) → Tasks 1, 2 (TDD); 3–6 (tsc/lint/manual). ✅
- `ReelScript` shared type replacing ReelOutput's inline `Reel` type → Task 1. ✅

**Placeholder scan:** none — every code step is complete; every command has expected output.

**Type consistency:** `ReelScript`/`ReelShot`/`looksLikeReelScript` (Task 1) are used identically in Tasks 4, 5, 6. `setScriptValue`/`addItem`/`removeItem` signatures `(obj, path, value|item|index)` (Task 2) match their calls in Task 5. `EditableField` props (`value`, `onCommit`, `multiline`, `placeholder`, `readOnly`, `className`) (Task 3) match every usage in Task 4. `ScriptDocument` props (`script`, `readOnly`, `onChange`, `onAddItem`, `onRemoveItem`) (Task 4) match the read-only call in Task 6 and the editable call in Task 5. `ScriptFocusView` props (`open`, `onOpenChange`, `title`, `source`, `parsed`, `onSave`) (Task 5) match the render in Task 6.

**Note on confirm-discard:** uses `window.confirm` for MVP (smallest scope). It is functional and accessible but not design-system-styled; an `AlertDialog` upgrade is a deliberate follow-up, not part of this plan.
