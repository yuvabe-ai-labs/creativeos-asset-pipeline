# Shot fan-out Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `Shot` node type and a human-triggered "Fan out shots" action that materializes each shot of a parsed Script into its own independent Shot node (seed-and-fork, D21).

**Architecture:** Reuse the Stage-2 spine. A `Shot` is a content node (content = output, no AI/version, like the Text node). `fanOutShots` is a client-only canvas-store action that reads the script's hydrated parsed output and appends N Shot nodes (no edges); they persist via the existing autosave. The existing Prompt node consumes a Shot via the same upstream resolution, after a one-line label addition.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript (strict), `@xyflow/react`, Zustand (vanilla store), Vitest.

**Spec:** `docs/superpowers/specs/2026-06-11-shot-fan-out-design.md` · **ADR:** D21

> **Amended 2026-06-12 (post-execution):** after the manual e2e, the Shot was changed to carry
> the **full parent script narrowed to one shot** (not just the description) so downstream prompts
> keep the creative context, and fan-out now draws a **dashed Script→Shot lineage edge**. The
> task code blocks below show the original shape; see the spec + D21 for the current behavior.

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `src/lib/canvas-nodes.ts` | `ShotNodeData` + union member | 1 (modify) |
| `src/lib/canvas-store.ts` | `defaultData` `case "shot"`; `fanOutShots` action | 1, 3 (modify) |
| `src/lib/nodes/node-output.ts` | `getNodeOutput` `case "shot"` | 2 (modify) |
| `src/lib/nodes/node-output.test.ts` | shot-output test | 2 (modify) |
| `src/lib/canvas-store.test.ts` | `fanOutShots` tests | 3 (modify) |
| `src/lib/nodes/resolve-inputs.ts` | `TYPE_LABEL.shot` | 4 (modify) |
| `src/components/nodes/prompt-node.tsx` | `TYPE_LABEL.shot` | 4 (modify) |
| `src/components/nodes/shot-node.tsx` | Shot node card | 5 (create) |
| `src/components/canvas/canvas.tsx` | register `shot: ShotNode` | 5 (modify) |
| `src/components/nodes/script-focus-view.tsx` | "Fan out N shots" button + `onFanOut` prop | 6 (modify) |
| `src/components/nodes/script-node.tsx` | wire `onFanOut` → `fanOutShots` | 6 (modify) |

Verification commands: `npx vitest run <file>` (unit), `npx tsc --noEmit` (types), `npm run lint` (lint).

---

## Task 1: `ShotNodeData` + union + defaultData

**Files:**
- Modify: `src/lib/canvas-nodes.ts`
- Modify: `src/lib/canvas-store.ts`

- [ ] **Step 1: Add the data type + union member**

In `src/lib/canvas-nodes.ts`, after the `PromptNodeData` type (just before `export type AppNode =`), add:

```ts
export type ShotNodeData = {
  description?: string; // the shot's visual description — editable; this node's output (D19/D20)
  duration?: string; // e.g. "3s" — carried from the parsed shot (informational; Stage 4/5)
  order?: number; // 1-based position in the script (Stage 5 assembly)
  seededFrom?: {
    scriptNodeId: string;
    shotIndex: number; // 0-based index in visual_script.shots at fork time
    scriptTitle?: string; // for the provenance label without a lookup
  };
};
```

Then replace the `AppNode` union with:

```ts
export type AppNode =
  | Node<ScriptNodeData, "script">
  | Node<KBNodeData, "kb">
  | Node<TextNodeData, "text">
  | Node<PromptNodeData, "prompt">
  | Node<ShotNodeData, "shot">;
```

- [ ] **Step 2: Add the `defaultData` case**

In `src/lib/canvas-store.ts`, replace `defaultData` with:

```ts
function defaultData(type: string): AppNode["data"] {
  switch (type) {
    case "text":
      return {};
    case "shot":
      return {};
    case "prompt":
      return { title: "" };
    case "script":
    default:
      return { title: "" };
  }
}
```

- [ ] **Step 3: Verify types + existing tests**

Run: `npx tsc --noEmit`
Expected: clean.

Run: `npx vitest run src/lib/canvas-nodes.test.ts`
Expected: PASS (union widened, mappers unchanged).

- [ ] **Step 4: Commit**

```bash
git add src/lib/canvas-nodes.ts src/lib/canvas-store.ts
git commit -m "feat(stage2): add ShotNodeData type + store plumbing"
```

---

## Task 2: `getNodeOutput` shot case (TDD)

**Files:**
- Modify: `src/lib/nodes/node-output.test.ts`
- Modify: `src/lib/nodes/node-output.ts`

- [ ] **Step 1: Write the failing test**

In `src/lib/nodes/node-output.test.ts`, add this test inside the `describe("getNodeOutput", …)` block (after the existing text test):

```ts
  it("returns a shot node's description", () => {
    expect(getNodeOutput({ type: "shot", data: { description: "  Turmeric root  " }, activeOutput: null })).toBe("Turmeric root");
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/nodes/node-output.test.ts`
Expected: FAIL — the `shot` case falls through to `default`, which returns `""` for null output, so the assertion `toBe("Turmeric root")` fails.

- [ ] **Step 3: Add the implementation case**

In `src/lib/nodes/node-output.ts`, add a `case "shot"` to the `switch` in `getNodeOutput`, right after the `case "text":` block:

```ts
    case "shot":
      return String(node.data.description ?? "").trim();
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/nodes/node-output.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/nodes/node-output.ts src/lib/nodes/node-output.test.ts
git commit -m "feat(stage2): getNodeOutput resolves shot nodes to their description"
```

---

## Task 3: `fanOutShots` store action (TDD)

**Files:**
- Modify: `src/lib/canvas-store.test.ts`
- Modify: `src/lib/canvas-store.ts`

- [ ] **Step 1: Write the failing tests**

In `src/lib/canvas-store.test.ts`, append these tests (the file already imports `createCanvasStore` and `AppNode`):

```ts
describe("fanOutShots", () => {
  const scriptNode: AppNode = {
    id: "script-1",
    type: "script",
    position: { x: 100, y: 50 },
    data: {
      title: "Reel A",
      parsed: {
        visual_script: {
          shots: [
            { description: "Turmeric root", duration: "3s" },
            { description: "Rose petal", duration: "4s" },
          ],
        },
      },
    },
  } as AppNode;

  it("creates one Shot node per shot, seeded with provenance, and no edges", () => {
    const store = createCanvasStore([scriptNode], []);
    store.getState().fanOutShots("script-1");

    const { nodes, edges } = store.getState();
    const shots = nodes.filter((n) => n.type === "shot");
    expect(shots).toHaveLength(2);
    expect(edges).toHaveLength(0); // seed, not a live link (D21)

    const first = shots[0].data as {
      description?: string;
      duration?: string;
      order?: number;
      seededFrom?: { scriptNodeId: string; shotIndex: number; scriptTitle?: string };
    };
    expect(first.description).toBe("Turmeric root");
    expect(first.duration).toBe("3s");
    expect(first.order).toBe(1);
    expect(first.seededFrom?.scriptNodeId).toBe("script-1");
    expect(first.seededFrom?.shotIndex).toBe(0);
    expect(first.seededFrom?.scriptTitle).toBe("Reel A");
  });

  it("does nothing for a script with no parsed shots", () => {
    const bare = { id: "s2", type: "script", position: { x: 0, y: 0 }, data: { title: "" } } as AppNode;
    const store = createCanvasStore([bare], []);
    store.getState().fanOutShots("s2");
    expect(store.getState().nodes.filter((n) => n.type === "shot")).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/canvas-store.test.ts`
Expected: FAIL — `fanOutShots` is not a function / not in the store type.

- [ ] **Step 3: Add the action to the store type**

In `src/lib/canvas-store.ts`, add to the `CanvasState` type (after `connectNodes`):

```ts
  fanOutShots: (scriptNodeId: string) => void;
```

- [ ] **Step 4: Implement the action**

In `src/lib/canvas-store.ts`, inside the `createStore<CanvasState>((set, get) => ({ … }))` object, add this action after `connectNodes`:

```ts
    // Materialize each shot of a parsed Script into its own independent Shot node
    // (seed-and-fork, D21). A one-time copy — no edge to the Script. Reads the
    // script's hydrated parsed output (data.parsed = the active version, D19).
    fanOutShots: (scriptNodeId) => {
      const script = get().nodes.find((n) => n.id === scriptNodeId);
      if (!script) return;
      const data = script.data as {
        title?: string;
        parsed?: { visual_script?: { shots?: { description?: string; duration?: string }[] } };
      };
      const shots = data.parsed?.visual_script?.shots ?? [];
      if (shots.length === 0) return;

      const base = script.position;
      const scriptTitle = data.title ?? "";
      const created = shots.map((s, i) => ({
        id: crypto.randomUUID(),
        type: "shot",
        position: { x: base.x + 320, y: base.y + i * 150 },
        data: {
          description: s.description ?? "",
          duration: s.duration,
          order: i + 1,
          seededFrom: { scriptNodeId, shotIndex: i, scriptTitle },
        },
      })) as AppNode[];

      set({ nodes: [...get().nodes, ...created] });
    },
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/lib/canvas-store.test.ts`
Expected: PASS — all tests (existing `onConnect` tests + the 2 new `fanOutShots` tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/canvas-store.ts src/lib/canvas-store.test.ts
git commit -m "feat(stage2): add fanOutShots store action (script shots -> Shot nodes)"
```

---

## Task 4: Type labels for the Shot node

**Files:**
- Modify: `src/lib/nodes/resolve-inputs.ts`
- Modify: `src/components/nodes/prompt-node.tsx`

- [ ] **Step 1: Label in the server resolver**

In `src/lib/nodes/resolve-inputs.ts`, change the `TYPE_LABEL` map from:

```ts
const TYPE_LABEL: Record<string, string> = {
  script: "Script",
  text: "Note",
  prompt: "Prompt",
};
```

to:

```ts
const TYPE_LABEL: Record<string, string> = {
  script: "Script",
  text: "Note",
  prompt: "Prompt",
  shot: "Shot",
};
```

- [ ] **Step 2: Label in the Prompt node**

In `src/components/nodes/prompt-node.tsx`, change the `TYPE_LABEL` constant from:

```ts
const TYPE_LABEL: Record<string, string> = { script: "Script", text: "Note", prompt: "Prompt", kb: "Brand KB" };
```

to:

```ts
const TYPE_LABEL: Record<string, string> = { script: "Script", text: "Note", prompt: "Prompt", kb: "Brand KB", shot: "Shot" };
```

- [ ] **Step 3: Verify types + lint**

Run: `npx tsc --noEmit`
Expected: clean.

Run: `npm run lint`
Expected: no new errors in `resolve-inputs.ts` / `prompt-node.tsx`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/nodes/resolve-inputs.ts src/components/nodes/prompt-node.tsx
git commit -m "feat(stage2): label shot nodes in upstream resolution"
```

---

## Task 5: Shot node component + registration

**Files:**
- Create: `src/components/nodes/shot-node.tsx`
- Modify: `src/components/canvas/canvas.tsx`

- [ ] **Step 1: Write the Shot node**

Create `src/components/nodes/shot-node.tsx`:

```tsx
"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Clapperboard } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCanvasStore } from "@/components/canvas/canvas-store-provider";

// Shot node — one shot of a reel, forked from a parsed Script (D21). Its description
// IS its output (edit-at-source, D19/D20): no AI, no version log. Feeds a Prompt.
export function ShotNode({ id, data, selected }: NodeProps) {
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const d = data as {
    description?: string;
    duration?: string;
    order?: number;
    seededFrom?: { scriptTitle?: string };
  };

  return (
    <div
      className={cn(
        "w-56 rounded-lg border border-border bg-card shadow-card",
        selected && "ring-2 ring-primary ring-offset-1 ring-offset-background",
      )}
    >
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex items-center gap-1.5">
          <Clapperboard className="size-3.5 text-primary" />
          <span className="text-eyebrow !text-[0.65rem]">Shot{d.order ? ` ${d.order}` : ""}</span>
        </div>
        {d.duration && (
          <span className="text-[0.6rem] text-muted-foreground">{d.duration}</span>
        )}
      </div>
      <div className="p-2">
        <textarea
          value={d.description ?? ""}
          onChange={(e) => updateNodeData(id, { description: e.target.value })}
          placeholder="Shot description…"
          rows={4}
          className="nodrag w-full resize-none rounded-md bg-transparent px-1.5 py-1 text-sm focus:outline-none"
        />
        {d.seededFrom?.scriptTitle && (
          <p className="px-1.5 pt-1 text-[0.6rem] text-muted-foreground">
            from “{d.seededFrom.scriptTitle}”
          </p>
        )}
      </div>
      <Handle
        type="source"
        position={Position.Right}
        className="!size-2 !border-2 !border-card !bg-primary"
      />
    </div>
  );
}
```

- [ ] **Step 2: Register it**

In `src/components/canvas/canvas.tsx`, add the import (after the `PromptNode` import):

```ts
import { ShotNode } from "@/components/nodes/shot-node";
```

and extend the registry from:

```ts
const nodeTypes: NodeTypes = { script: ScriptNode, kb: KBNode, text: TextNode, prompt: PromptNode };
```

to:

```ts
const nodeTypes: NodeTypes = { script: ScriptNode, kb: KBNode, text: TextNode, prompt: PromptNode, shot: ShotNode };
```

(The "Add node" palette is intentionally NOT extended — Shot nodes are created by fan-out.)

- [ ] **Step 3: Verify types + lint**

Run: `npx tsc --noEmit`
Expected: clean.

Run: `npm run lint`
Expected: no new errors in `shot-node.tsx` / `canvas.tsx`.

- [ ] **Step 4: Commit**

```bash
git add src/components/nodes/shot-node.tsx src/components/canvas/canvas.tsx
git commit -m "feat(stage2): add Shot node card + register it"
```

---

## Task 6: "Fan out shots" action in the UI

**Files:**
- Modify: `src/components/nodes/script-focus-view.tsx`
- Modify: `src/components/nodes/script-node.tsx`

- [ ] **Step 1: Add the icon import + `onFanOut` prop**

In `src/components/nodes/script-focus-view.tsx`, change the lucide import line from:

```ts
import { ArrowLeft, Eye, EyeOff, RefreshCw, FileUp } from "lucide-react";
```

to:

```ts
import { ArrowLeft, Eye, EyeOff, RefreshCw, FileUp, Clapperboard } from "lucide-react";
```

Then add `onFanOut` to the `ScriptFocusViewProps` type (after `onSaveOutput`):

```ts
  onSaveOutput: (output: ReelScript) => Promise<void>;
  onFanOut: () => void;
```

and add it to the destructured params (after `onSaveOutput`):

```ts
  onSaveOutput,
  onFanOut,
}: ScriptFocusViewProps) {
```

- [ ] **Step 2: Compute the shot count + render the button**

In `src/components/nodes/script-focus-view.tsx`, just after the `const dirty = …` line (around line 93), add:

```ts
  const shotCount = parsed?.visual_script?.shots?.length ?? 0;
```

Then, in the `mode === "parsed"` header action group, add the button immediately after the "Replace script" `<Button>` (after the line `</Button>` that closes the `FileUp` button, before the `<div className="mx-1 h-6 w-px bg-border" …>` divider):

```tsx
                  {shotCount > 0 && (
                    <Button variant="outline" size="lg" onClick={onFanOut}>
                      <Clapperboard className="size-4 text-primary" /> Fan out {shotCount} shot
                      {shotCount === 1 ? "" : "s"}
                    </Button>
                  )}
```

- [ ] **Step 3: Wire it from the Script node**

In `src/components/nodes/script-node.tsx`, add the `toast` import (after the lucide import line):

```ts
import { toast } from "sonner";
```

Pull `fanOutShots` from the store — change:

```ts
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
```

to:

```ts
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const fanOutShots = useCanvasStore((s) => s.fanOutShots);
```

Then pass `onFanOut` to `ScriptFocusView` — change:

```tsx
        onPatch={(patch) => updateNodeData(id, patch)}
        onSaveOutput={(output) => saveScriptOutputAction(id, output)}
      />
```

to:

```tsx
        onPatch={(patch) => updateNodeData(id, patch)}
        onSaveOutput={(output) => saveScriptOutputAction(id, output)}
        onFanOut={() => {
          const n = parsed?.visual_script?.shots?.length ?? 0;
          fanOutShots(id);
          setFocusOpen(false);
          toast.success(`Fanned out ${n} shot${n === 1 ? "" : "s"}`);
        }}
      />
```

- [ ] **Step 4: Verify types + lint**

Run: `npx tsc --noEmit`
Expected: clean.

Run: `npm run lint`
Expected: no new errors in `script-focus-view.tsx` / `script-node.tsx`.

- [ ] **Step 5: Commit**

```bash
git add src/components/nodes/script-focus-view.tsx src/components/nodes/script-node.tsx
git commit -m "feat(stage2): add 'Fan out shots' action to the Script focus view"
```

---

## Task 7: Full-suite check + manual end-to-end

- [ ] **Step 1: Unit suite + types + lint**

Run: `npm test`
Expected: PASS — all suites green (Task 2 shot-output, Task 3 fanOutShots, plus the pre-existing suites).

Run: `npx tsc --noEmit` then `npm run lint`
Expected: both clean (no NEW errors beyond the pre-existing `ref/Yuvabe`, `canvas-store-provider.tsx`, `kb-node.tsx`, `kb/images/route.ts` baseline).

- [ ] **Step 2: Manual end-to-end**

Run: `npm run dev`. Open a canvas for a client whose KB is `ready`.
1. Add/parse a reel **Script** (e.g. Reel #1 — 5 shots). Open it → the parsed-mode header now shows **"Fan out 5 shots"**.
2. Click it → the sheet closes and **5 Shot nodes** appear in a column to the right of the Script, each showing `Shot N`, its duration, the description, and `from "<title>"`.
3. **Edit** a Shot's description → reload the page → the edit persisted (autosave; D19/D20).
4. Drag an edge from a **Shot's** right handle into a **Prompt** node's left handle. Open the Prompt → the **Connected** card lists **"Shot"** with that shot's description; the compiled prompt includes it.
5. **Re-extract** the Script → the existing Shot nodes are **unchanged** (seed-and-fork; D21).
6. Verify no `xy-edge__` / loop errors and no `getSnapshot` warning when wiring.

- [ ] **Step 3: Final commit (if any manual fixes were needed)**

```bash
git add -A
git commit -m "test(stage2): manual e2e of shot fan-out"
```

---

## Self-Review

**Spec coverage:**
- New `Shot` node type (`ShotNodeData` + union) — Task 1. ✅
- Content = output, edit-at-source (editable description) — Task 5 (card) + Task 2 (`getNodeOutput`). ✅
- `fanOutShots` client-only action, N nodes, seeded `{description,duration,order,seededFrom}`, **no edges** — Task 3 (TDD). ✅
- Provenance label (`from "<title>"`), no staleness badge — Task 5. ✅
- "Fan out N shots" button in the Script focus view, human-triggered, closes sheet — Task 6. ✅
- `Shot → Prompt` works via label maps; no Prompt-node logic change — Task 4. ✅
- Registered in `canvas.tsx`; NOT in the palette — Task 5. ✅
- Re-extract stays enabled (untouched) — verified in Task 7 e2e. ✅
- Deferred (staleness badge, auto-Prompt/edges, Shot focus view, palette entry, re-fork reconciliation) — not built, by design. ✅

**Placeholder scan:** none — every code step is complete; every command has expected output.

**Type consistency:** `ShotNodeData` (Task 1) `{ description, duration, order, seededFrom }` is the shape produced by `fanOutShots` (Task 3), read by `getNodeOutput` `case "shot"` (Task 2, `data.description`), and rendered by `ShotNode` (Task 5, `description`/`duration`/`order`/`seededFrom.scriptTitle`). `fanOutShots(scriptNodeId: string): void` (Task 3 type) matches its call in Task 6 (`fanOutShots(id)`). `onFanOut: () => void` (Task 6 prop) matches the `onFanOut={() => {…}}` passed from `script-node.tsx`. The `TYPE_LABEL` additions (Task 4) key on the `"shot"` type string used everywhere. `parsed?.visual_script?.shots` (Tasks 3 + 6) matches the `ReelScript` shape (`visual_script.shots[]`).
