# Quick-Add Node Palette + Keyboard Shortcuts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a cursor-spawned, type-to-filter "add node" command palette (opened by `/` or right-click) plus single-letter mnemonic shortcuts, replacing the current right-click context menu.

**Architecture:** A pure `lib/` module owns the canonical node-type list (type, label, mnemonic) and the two bug-prone pure helpers (`mnemonicToType`, `isEditableTarget`). A new `QuickAddMenu` React component wraps the shadcn **Base UI** `Command` primitive (cmdk) in a screen-positioned panel. `canvas.tsx` tracks the last pointer position, opens the palette on `/` or right-click, and runs a guarded keydown handler for instant mnemonic creation. The old `canvas-context-menu.tsx` is removed.

**Tech Stack:** Next.js 16, React 19.2, `@xyflow/react` 12, shadcn (Base UI registry, `base-nova` style), `cmdk` (new), lucide-react, Vitest (node env), Zustand.

## Global Constraints

- **Design system (Yuvabe / "light editorial premium"):** white panel, 1px `neutral-200` border, `shadow-card`, radius 12–24px; Lucide icons at `strokeWidth={1.5}`; purple `--primary` used sparingly (paste-image affordance only). Drive colors through CSS variables — never hardcode hex.
- **shadcn components only** (Base UI registry, `@base-ui/react/*` import style) — never native `select`/`input`/`textarea`. The palette MUST use the generated `src/components/ui/command.tsx`.
- **Test infra reality:** Vitest `environment: "node"`, includes `src/**/*.test.ts` only. No jsdom/RTL. Pure logic is unit-tested (`.test.ts`); React components are manually verified. Do NOT add a jsdom/Testing-Library harness in this plan.
- **Mnemonic map (collision-free, 8 addable types):** `S`=script, `F`=file, `N`=text(Note), `P`=prompt, `D`=draw, `I`=image-gen, `V`=video-prompt, `G`=video-gen. `kb` is excluded (not user-addable).
- **Keyboard guard (critical):** `/` and bare mnemonic letters must do nothing when an editable element (`input`/`textarea`/`select`/`contenteditable`) is focused, and mnemonics fire only when the palette is closed and no Ctrl/Meta/Alt modifier is held. Closing is via Esc / click-outside / select (we do NOT make `/` toggle-close, since the focused cmdk input would swallow it).
- **Node creation reuses existing flow:** `addNode(type, position, crypto.randomUUID())`; `script` auto-connects to the `kb` node (preserve `handleAddNode` in [canvas.tsx](src/components/canvas/canvas.tsx)).

---

## File Structure

- **Create** `src/lib/canvas-node-options.ts` — canonical `AddNodeType`, `ADD_NODE_OPTIONS` (`{ type, label, mnemonic }`), pure helpers `mnemonicToType`, `isEditableTarget`. No React/lucide imports.
- **Create** `src/lib/canvas-node-options.test.ts` — unit tests for the above.
- **Create (via shadcn CLI)** `src/components/ui/command.tsx` — Base UI `Command` primitive; adds `cmdk` dependency.
- **Create** `src/components/canvas/quick-add-menu.tsx` — the positioned palette component.
- **Modify** `src/components/canvas/canvas.tsx` — pointer tracking, `/`+mnemonic keydown handler, right-click → `QuickAddMenu`, remove `CanvasContextMenu` usage.
- **Delete** `src/components/canvas/canvas-context-menu.tsx`.

---

### Task 1: Pure node-options module + mnemonic/guard helpers

**Files:**
- Create: `src/lib/canvas-node-options.ts`
- Test: `src/lib/canvas-node-options.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type AddNodeType = "script" | "file" | "text" | "prompt" | "draw" | "image-gen" | "video-prompt" | "video-gen"`
  - `interface AddNodeOption { type: AddNodeType; label: string; mnemonic: string }`
  - `const ADD_NODE_OPTIONS: readonly AddNodeOption[]`
  - `function mnemonicToType(key: string): AddNodeType | null`
  - `function isEditableTarget(el: { tagName?: string; isContentEditable?: boolean } | null | undefined): boolean`

- [ ] **Step 1: Write the failing test**

Create `src/lib/canvas-node-options.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  ADD_NODE_OPTIONS,
  mnemonicToType,
  isEditableTarget,
  type AddNodeType,
} from "./canvas-node-options";

describe("ADD_NODE_OPTIONS", () => {
  it("has the 8 user-addable node types (kb excluded)", () => {
    const types = ADD_NODE_OPTIONS.map((o) => o.type).sort();
    expect(types).toEqual(
      [
        "draw",
        "file",
        "image-gen",
        "prompt",
        "script",
        "text",
        "video-gen",
        "video-prompt",
      ].sort(),
    );
  });

  it("has unique mnemonics", () => {
    const mnemonics = ADD_NODE_OPTIONS.map((o) => o.mnemonic.toLowerCase());
    expect(new Set(mnemonics).size).toBe(mnemonics.length);
  });

  it("has a non-empty label and single-character mnemonic per option", () => {
    for (const o of ADD_NODE_OPTIONS) {
      expect(o.label.length).toBeGreaterThan(0);
      expect(o.mnemonic).toHaveLength(1);
    }
  });
});

describe("mnemonicToType", () => {
  it("maps the documented keys to types", () => {
    const expected: Record<string, AddNodeType> = {
      s: "script",
      f: "file",
      n: "text",
      p: "prompt",
      d: "draw",
      i: "image-gen",
      v: "video-prompt",
      g: "video-gen",
    };
    for (const [key, type] of Object.entries(expected)) {
      expect(mnemonicToType(key)).toBe(type);
    }
  });

  it("is case-insensitive", () => {
    expect(mnemonicToType("S")).toBe("script");
  });

  it("returns null for unmapped keys (incl. kb's 'k')", () => {
    expect(mnemonicToType("k")).toBeNull();
    expect(mnemonicToType("z")).toBeNull();
    expect(mnemonicToType("")).toBeNull();
  });
});

describe("isEditableTarget", () => {
  it("is true for inputs, textareas, selects, and contenteditable", () => {
    expect(isEditableTarget({ tagName: "INPUT" })).toBe(true);
    expect(isEditableTarget({ tagName: "TEXTAREA" })).toBe(true);
    expect(isEditableTarget({ tagName: "SELECT" })).toBe(true);
    expect(isEditableTarget({ tagName: "DIV", isContentEditable: true })).toBe(true);
  });

  it("is false for non-editable elements and nullish", () => {
    expect(isEditableTarget({ tagName: "DIV" })).toBe(false);
    expect(isEditableTarget(null)).toBe(false);
    expect(isEditableTarget(undefined)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- canvas-node-options`
Expected: FAIL — `Cannot find module './canvas-node-options'`.

- [ ] **Step 3: Write the minimal implementation**

Create `src/lib/canvas-node-options.ts`:

```ts
// Canonical list of user-addable node types + the keyboard mnemonics for the
// quick-add palette. PURE (no React/lucide) so it can be unit-tested in the
// node-env Vitest setup and imported anywhere. `kb` is intentionally excluded
// — it is not user-addable. The QuickAddMenu component maps each `type` to a
// Lucide icon via a TypeScript-enforced Record, so icon coverage is checked by
// the compiler while mnemonic/type integrity is checked by tests.

export type AddNodeType =
  | "script"
  | "file"
  | "text"
  | "prompt"
  | "draw"
  | "image-gen"
  | "video-prompt"
  | "video-gen";

export interface AddNodeOption {
  type: AddNodeType;
  label: string;
  mnemonic: string; // single character; shown as a badge and usable as a shortcut
}

export const ADD_NODE_OPTIONS: readonly AddNodeOption[] = [
  { type: "script", label: "Script", mnemonic: "S" },
  { type: "file", label: "File", mnemonic: "F" },
  { type: "text", label: "Note", mnemonic: "N" },
  { type: "prompt", label: "Prompt", mnemonic: "P" },
  { type: "draw", label: "Draw", mnemonic: "D" },
  { type: "image-gen", label: "Image Gen", mnemonic: "I" },
  { type: "video-prompt", label: "Video Prompt", mnemonic: "V" },
  { type: "video-gen", label: "Video Gen", mnemonic: "G" },
];

const BY_MNEMONIC = new Map<string, AddNodeType>(
  ADD_NODE_OPTIONS.map((o) => [o.mnemonic.toLowerCase(), o.type]),
);

/** Resolve a single keyboard character to a node type, or null if unmapped. */
export function mnemonicToType(key: string): AddNodeType | null {
  if (key.length !== 1) return null;
  return BY_MNEMONIC.get(key.toLowerCase()) ?? null;
}

/** True when focus is in a field the user is typing into — shortcuts must defer. */
export function isEditableTarget(
  el: { tagName?: string; isContentEditable?: boolean } | null | undefined,
): boolean {
  if (!el) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName?.toUpperCase();
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- canvas-node-options`
Expected: PASS (all describe blocks green).

- [ ] **Step 5: Commit**

```bash
git add src/lib/canvas-node-options.ts src/lib/canvas-node-options.test.ts
git commit -m "feat(canvas): pure node-options module with mnemonics + keyboard guard"
```

---

### Task 2: Add the shadcn Base UI `Command` component (+ cmdk)

**Files:**
- Create (generated): `src/components/ui/command.tsx`
- Modify (generated): `package.json` / `package-lock.json` (adds `cmdk`)

**Interfaces:**
- Produces: `Command`, `CommandInput`, `CommandList`, `CommandEmpty`, `CommandGroup`, `CommandItem`, `CommandSeparator`, `CommandShortcut` exports from `@/components/ui/command`.

- [ ] **Step 1: Generate the component**

Run: `npx shadcn@latest add command`
(The `base-nova` style in `components.json` selects the Base UI variant. Reference: https://ui.shadcn.com/docs/components/base/command)

- [ ] **Step 2: Verify what was generated**

Confirm `src/components/ui/command.tsx` exists and exports the primitives listed above, and that `cmdk` was added to `package.json` dependencies.
Run: `git status` and `cat package.json` — expect `cmdk` under dependencies and the new file under `src/components/ui/`.
If the CLI created a Radix-flavored file instead, that is acceptable here (the public `Command*` API is identical); the only hard requirement is that it builds.

- [ ] **Step 3: Typecheck / build**

Run: `npm run build`
Expected: build succeeds (no type errors from the new file).
If the build fails because `cmdk` is incompatible with React 19, stop and report — do not pin/downgrade React.

- [ ] **Step 4: Commit**

```bash
git add src/components/ui/command.tsx package.json package-lock.json
git commit -m "chore(ui): add shadcn Base UI Command component (cmdk)"
```

---

### Task 3: Build the `QuickAddMenu` component

**Files:**
- Create: `src/components/canvas/quick-add-menu.tsx`

**Interfaces:**
- Consumes: `ADD_NODE_OPTIONS`, `AddNodeType` from `@/lib/canvas-node-options`; `Command*` from `@/components/ui/command`.
- Produces:
  ```ts
  interface QuickAddMenuProps {
    screenX: number;
    screenY: number;
    onSelect: (type: AddNodeType) => void;
    onClose: () => void;
    canPasteImage?: boolean;
    onPasteImage?: () => void;
  }
  export function QuickAddMenu(props: QuickAddMenuProps): JSX.Element;
  ```

- [ ] **Step 1: Implement the component**

Create `src/components/canvas/quick-add-menu.tsx`:

```tsx
"use client";

import { useEffect, useRef } from "react";
import {
  FileText,
  Paperclip,
  StickyNote,
  Sparkles,
  Pencil,
  ImageIcon,
  Clapperboard,
  ClipboardPaste,
  type LucideIcon,
} from "lucide-react";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import {
  ADD_NODE_OPTIONS,
  type AddNodeType,
} from "@/lib/canvas-node-options";

// Icon per type. Record<AddNodeType, …> forces TS to flag any type missing an
// icon, so this can never silently drift from ADD_NODE_OPTIONS.
const ICONS: Record<AddNodeType, LucideIcon> = {
  script: FileText,
  file: Paperclip,
  text: StickyNote,
  prompt: Sparkles,
  draw: Pencil,
  "image-gen": ImageIcon,
  "video-prompt": Clapperboard,
  "video-gen": Clapperboard,
};

const MENU_W = 240;
const MENU_H = 340;

interface QuickAddMenuProps {
  screenX: number;
  screenY: number;
  onSelect: (type: AddNodeType) => void;
  onClose: () => void;
  canPasteImage?: boolean;
  onPasteImage?: () => void;
}

export function QuickAddMenu({
  screenX,
  screenY,
  onSelect,
  onClose,
  canPasteImage,
  onPasteImage,
}: QuickAddMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  // Flip left/up when the panel would overflow the viewport.
  const x = screenX + MENU_W > window.innerWidth ? screenX - MENU_W : screenX;
  const y = screenY + MENU_H > window.innerHeight ? screenY - MENU_H : screenY;

  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [onClose]);

  return (
    <div
      ref={ref}
      style={{ left: x, top: y }}
      className="fixed z-50 w-60 overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-card"
    >
      <Command
        // cmdk's own keyboard handling drives arrow-nav + Enter; Esc closes.
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            onClose();
          }
        }}
      >
        <CommandInput autoFocus placeholder="Add node…" />
        <CommandList>
          <CommandEmpty>No node type found.</CommandEmpty>
          {canPasteImage && onPasteImage && (
            <CommandGroup>
              <CommandItem
                value="paste image"
                onSelect={() => {
                  onPasteImage();
                  onClose();
                }}
                className="text-primary"
              >
                <ClipboardPaste className="size-4 shrink-0" strokeWidth={1.5} />
                Paste image
              </CommandItem>
            </CommandGroup>
          )}
          <CommandGroup heading="Add node">
            {ADD_NODE_OPTIONS.map(({ type, label, mnemonic }) => {
              const Icon = ICONS[type];
              return (
                <CommandItem
                  key={type}
                  value={label}
                  onSelect={() => {
                    onSelect(type);
                    onClose();
                  }}
                >
                  <Icon
                    className="size-4 shrink-0 text-muted-foreground"
                    strokeWidth={1.5}
                  />
                  <span className="flex-1">{label}</span>
                  <kbd className="ml-auto rounded border border-neutral-200 px-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    {mnemonic}
                  </kbd>
                </CommandItem>
              );
            })}
          </CommandGroup>
        </CommandList>
      </Command>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run build`
Expected: succeeds. (If `CommandInput` doesn't accept `autoFocus`, focus the input via a ref in a `useEffect` instead — adapt to the generated API.)

- [ ] **Step 3: Commit**

```bash
git add src/components/canvas/quick-add-menu.tsx
git commit -m "feat(canvas): QuickAddMenu palette (cmdk + mnemonic badges)"
```

---

### Task 4: Wire `canvas.tsx` — pointer tracking, `/`, mnemonics, right-click

**Files:**
- Modify: `src/components/canvas/canvas.tsx`

**Interfaces:**
- Consumes: `QuickAddMenu` from `./quick-add-menu`; `mnemonicToType`, `isEditableTarget` from `@/lib/canvas-node-options`; existing `handleAddNode`, `handlePasteImage`, `clipboardHasImage`, `rfRef.screenToFlowPosition`.

- [ ] **Step 1: Swap the import and state**

In `src/components/canvas/canvas.tsx`, replace the context-menu import:

```tsx
// remove:
import { CanvasContextMenu } from "./canvas-context-menu";
// add:
import { QuickAddMenu } from "./quick-add-menu";
import { mnemonicToType, isEditableTarget } from "@/lib/canvas-node-options";
```

Rename the state to a neutral name (same shape) and add a pointer ref. Replace:

```tsx
const [contextMenu, setContextMenu] = useState<{
  screenX: number;
  screenY: number;
  flowPos: XYPosition;
} | null>(null);
const [canPaste, setCanPaste] = useState(false);
```

with:

```tsx
const [quickAdd, setQuickAdd] = useState<{
  screenX: number;
  screenY: number;
  flowPos: XYPosition;
} | null>(null);
const [canPaste, setCanPaste] = useState(false);
// Last pointer position over the pane (screen coords) — where keyboard-opened
// palette and instant mnemonics place the new node.
const lastPointer = useRef<{ x: number; y: number } | null>(null);
const quickAddOpenRef = useRef(false);
useEffect(() => {
  quickAddOpenRef.current = quickAdd !== null;
}, [quickAdd]);
```

- [ ] **Step 2: Add a helper to open the palette at a screen point**

Add below `handlePasteImage` (uses the existing `rfRef`):

```tsx
const openQuickAddAt = useCallback((screenX: number, screenY: number) => {
  if (!rfRef.current) return;
  const flowPos = rfRef.current.screenToFlowPosition({ x: screenX, y: screenY });
  setQuickAdd({ screenX, screenY, flowPos });
  setCanPaste(false);
  void clipboardHasImage().then(setCanPaste);
}, []);
```

- [ ] **Step 3: Extend the keydown effect for `/` and mnemonics**

Replace the existing Cmd+D `useEffect` (the `handler` listening for `e.key === "d"`) with one that also handles `/` and bare mnemonics, all guarded:

```tsx
useEffect(() => {
  const handler = (e: KeyboardEvent) => {
    // Duplicate (existing behavior) — modified key, fires regardless of focus.
    if ((e.ctrlKey || e.metaKey) && e.key === "d") {
      e.preventDefault();
      nodesRef.current
        .filter((n) => n.selected && n.type !== "kb")
        .forEach((n) => duplicateNode(n.id));
      return;
    }

    // The following shortcuts must not fire while typing or while the palette
    // is already open (its input owns the keystrokes).
    if (isEditableTarget(document.activeElement)) return;
    if (quickAddOpenRef.current) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    // "/" opens the palette at the last pointer position.
    if (e.key === "/") {
      const p = lastPointer.current;
      if (!p) return;
      e.preventDefault();
      openQuickAddAt(p.x, p.y);
      return;
    }

    // Bare mnemonic letter → instant create at the last pointer position.
    const type = mnemonicToType(e.key);
    if (type) {
      const p = lastPointer.current;
      if (!p || !rfRef.current) return;
      e.preventDefault();
      handleAddNode(type, rfRef.current.screenToFlowPosition({ x: p.x, y: p.y }));
    }
  };
  document.addEventListener("keydown", handler);
  return () => document.removeEventListener("keydown", handler);
}, [duplicateNode, openQuickAddAt, handleAddNode]);
```

- [ ] **Step 4: Track the pointer and re-point right-click at the palette**

On the `<ReactFlow>` element, add pointer tracking and update the context-menu handler to open `QuickAddMenu`. Add:

```tsx
onPointerMove={(e) => {
  lastPointer.current = { x: e.clientX, y: e.clientY };
}}
```

Replace the existing `onPaneContextMenu` body with:

```tsx
onPaneContextMenu={(e) => {
  e.preventDefault();
  openQuickAddAt(e.clientX, e.clientY);
}}
```

And update `onPaneClick`:

```tsx
onPaneClick={() => { setQuickAdd(null); setCanPaste(false); }}
```

- [ ] **Step 5: Render `QuickAddMenu` instead of `CanvasContextMenu`**

Replace the `{contextMenu && (<CanvasContextMenu … />)}` block with:

```tsx
{quickAdd && (
  <QuickAddMenu
    screenX={quickAdd.screenX}
    screenY={quickAdd.screenY}
    onSelect={(type) => handleAddNode(type, quickAdd.flowPos)}
    onClose={() => { setQuickAdd(null); setCanPaste(false); }}
    canPasteImage={canPaste}
    onPasteImage={() => handlePasteImage(quickAdd.flowPos)}
  />
)}
```

- [ ] **Step 6: Typecheck**

Run: `npm run build`
Expected: succeeds with no references to `CanvasContextMenu` or `contextMenu` remaining.

- [ ] **Step 7: Commit**

```bash
git add src/components/canvas/canvas.tsx
git commit -m "feat(canvas): open quick-add palette via / and right-click; mnemonic shortcuts"
```

---

### Task 5: Remove the old context menu + full verification

**Files:**
- Delete: `src/components/canvas/canvas-context-menu.tsx`

- [ ] **Step 1: Confirm nothing else imports it**

Run: `grep -rn "canvas-context-menu\|CanvasContextMenu" src` (expect no results).
If anything still references it, fix that reference first.

- [ ] **Step 2: Delete the file**

```bash
git rm src/components/canvas/canvas-context-menu.tsx
```

- [ ] **Step 3: Run the full check suite**

Run: `npm test` — expect all tests pass (incl. the new `canvas-node-options` tests).
Run: `npm run build` — expect success.
Run: `npm run lint` — expect no new errors in the touched files.

- [ ] **Step 4: Manual verification (record results)**

Start `npm run dev`, open a canvas, and verify:
1. Move the mouse over the canvas, press `/` → palette opens **at the cursor**, input focused.
2. Type `scr` → list filters to Script; press Enter → a Script node appears at the cursor and is wired to the KB node.
3. Press `/`, then Esc → palette closes, no node added.
4. With the canvas focused (not editing), press `n` → a Note node appears at the cursor instantly.
5. Open a Text node and type into its field: typing `s`, `n`, `/` edits text and does **not** create nodes or open the palette.
6. Right-click the pane → the same palette opens at the click point.
7. Copy an image to the clipboard, open the palette → "Paste image" appears at the top; selecting it creates a File node with the image.
8. Near the right/bottom edge, the palette flips to stay on screen.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(canvas): remove legacy context menu; quick-add palette complete"
```

---

## Notes / Optional Follow-ups (out of scope)

- **Component/integration tests:** This repo has no jsdom/RTL setup; the palette and canvas wiring are manually verified per the project's current test boundary. If desired later, add `@vitest/browser` or jsdom + `@testing-library/react`, a `*.test.tsx` include glob, and tests for: filtering, Enter-selects-correct-type, Esc-closes, and the editable-target guard at the React level.
- **App-wide command palette (`Cmd/Ctrl+K`):** explicitly deferred (spec non-goal). The `QuickAddMenu` + `Command` foundation can be reused when that is built.

## Self-Review

- **Spec coverage:** `/` trigger (Task 4 §3) ✓; spawn-at-cursor via `screenToFlowPosition` + `lastPointer` (Task 4 §2,§4) ✓; unified right-click + `/` surface (Task 4 §4,§5; Task 5) ✓; full mnemonics — badges (Task 3) + instant create (Task 4 §3) ✓; shadcn Base UI Command (Task 2) ✓; editable-target guard (Task 1 helper + Task 4 §3) ✓; paste-image preserved (Task 3 + Task 4 §5) ✓; script→kb auto-connect preserved (reuses `handleAddNode`) ✓; off-screen flip (Task 3) ✓.
- **Deliberate spec refinements:** (1) icon lives in the component as a TS-enforced `Record`, not in the pure options module — keeps `lib/` React-free and still drift-proof. (2) `/`-toggle-close dropped in favor of Esc/click-outside (the focused cmdk input would otherwise swallow `/`); documented in Global Constraints. (3) Testing scoped to pure logic per the repo's node-only Vitest setup; component tests listed as optional follow-up rather than introducing new infra.
- **Placeholder scan:** none — every code step has complete code.
- **Type consistency:** `AddNodeType`, `ADD_NODE_OPTIONS`, `mnemonicToType`, `isEditableTarget`, `QuickAddMenu` props, and `quickAdd` state shape are used identically across Tasks 1, 3, and 4.
