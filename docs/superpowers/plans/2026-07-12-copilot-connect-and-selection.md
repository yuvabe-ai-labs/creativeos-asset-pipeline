# Copilot connect primitive, `@selected`, and viewport placement — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the copilot a validated `connect_nodes` tool and a `@selected` composer token, add a focus-view `+` that reuses the same connect logic, and place agent-created nodes at the viewport center.

**Architecture:** One pure `canConnect(src,tgt)` helper backs all connection checks (four call sites). Pure resolve/validate/partition helpers (`planConnections`, `expandSelected`) live in `src/lib/copilot/actions.ts` and are unit-tested; the React recipes and components stay thin around them. Server thinks / client acts / structural ops run instantly (no gate) — unchanged.

**Tech Stack:** Next.js 16, React, Zustand (`useCanvasStore`), `@xyflow/react` (React Flow), shadcn (Base UI) `Button`/`Popover`/`Command`, Vitest.

## Global Constraints

- **Controls are shadcn primitives only** (`src/components/ui/*`) — never native `<button>`/`<input>`/`<select>`. Base UI composes via the `render` prop, not `asChild`.
- **Import, don't redefine.** `canConnect` is the single connection-rule helper after Task 1; never re-inline `VALID_CONNECTIONS[...].includes(...)`.
- **Icons:** Lucide, 1.5 stroke, no fills.
- **Node handle vocabulary:** `nodeHandle(node)` → `TYPE-XXXX`; `nodeLabel(node)` → `{ name, handle }`. Chat, chips, and pickers all show the same handle.
- **Blast-radius rule:** connect is cheap/reversible/structural → executes instantly, no proposal gate.
- Run tests from the worktree root: `.claude/worktrees/minimal-agent`.

---

### Task 1: `canConnect` helper — one connection rule, refactor existing call sites

**Files:**
- Modify: `src/lib/canvas-nodes.ts` (add helper after `VALID_CONNECTIONS`, ~line 133)
- Modify: `src/components/nodes/use-node-connection-state.ts:22`
- Modify: `src/components/canvas/canvas.tsx:258-263`
- Test: `src/lib/canvas-nodes.test.ts` (append)

**Interfaces:**
- Produces: `canConnect(sourceType: string, targetType: string): boolean`

- [ ] **Step 1: Write the failing test** — append to `src/lib/canvas-nodes.test.ts`:

```ts
import { canConnect } from "./canvas-nodes";

describe("canConnect", () => {
  it("allows a documented pair (draw → prompt)", () => {
    expect(canConnect("draw", "prompt")).toBe(true);
  });
  it("rejects an undocumented pair (draw → script)", () => {
    expect(canConnect("draw", "script")).toBe(false);
  });
  it("rejects an unknown source type", () => {
    expect(canConnect("nonsense", "prompt")).toBe(false);
  });
  it("is directional (video-prompt → video-gen only, not reverse)", () => {
    expect(canConnect("video-prompt", "video-gen")).toBe(true);
    expect(canConnect("video-gen", "video-prompt")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/canvas-nodes.test.ts`
Expected: FAIL — `canConnect is not a function` / import error.

- [ ] **Step 3: Add the helper** — in `src/lib/canvas-nodes.ts`, immediately after the `VALID_CONNECTIONS` object (after its closing `} as const;`, ~line 133):

```ts
// The single ordered connection check: may a `sourceType` node feed a `targetType` node?
// One helper, several call sites (manual drag, drag affordance, copilot connect, focus-view +).
// Ordered on purpose — connection direction is meaningful; there is no symmetric variant.
export function canConnect(sourceType: string, targetType: string): boolean {
  return (VALID_CONNECTIONS[sourceType] ?? []).includes(targetType);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/canvas-nodes.test.ts`
Expected: PASS (all existing tests + the 4 new).

- [ ] **Step 5: Refactor `use-node-connection-state.ts`** — replace lines 22-23:

```ts
  return canConnect(connection.fromNode?.type ?? "", nodeType) ? "valid" : "invalid";
```

Update the import on line 4:

```ts
import { canConnect } from "@/lib/canvas-nodes";
```

(Remove the now-unused `VALID_CONNECTIONS` import.)

- [ ] **Step 6: Refactor `canvas.tsx` `isValidConnection`** — replace the `VALID_CONNECTIONS[...].includes(...)` clause (lines 258-263) with:

```ts
      if (!canConnect(source.type ?? "", target.type ?? "")) return false;
```

Keep the extra rule that follows (script → prompt single-wire). Add `canConnect` to the existing `@/lib/canvas-nodes` import; leave `VALID_CONNECTIONS` imported only if still used elsewhere in the file (grep — if not, remove it).

- [ ] **Step 7: Verify nothing else broke**

Run: `npx tsc --noEmit && npx vitest run src/lib/canvas-nodes.test.ts`
Expected: tsc exit 0; tests PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/canvas-nodes.ts src/lib/canvas-nodes.test.ts src/components/nodes/use-node-connection-state.ts src/components/canvas/canvas.tsx
git commit -m "refactor(canvas): extract canConnect helper for connection rules

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Viewport-center placement for agent-created nodes

**Files:**
- Modify: `src/components/canvas/use-copilot-chat.ts` (`addNodeAndOpen`, `createScriptNode`, and the `useReactFlow` destructure at line 35)

**Interfaces:**
- Consumes: `screenToFlowPosition` from `useReactFlow()`.
- Produces: a local `viewportCenterPosition(): { x: number; y: number }` in the hook.

This is a UI/runtime change (React Flow viewport) — verified in the browser, no unit test.

- [ ] **Step 1: Add `screenToFlowPosition` to the hook** — change line 35:

```ts
  const { setCenter, screenToFlowPosition } = useReactFlow();
```

- [ ] **Step 2: Add the helper** — near the other recipes in the hook (e.g. just above `createScriptNode`):

```ts
  // Where an agent-created node lands: the CENTER of the visible canvas, so it appears where
  // the human is looking (not off-screen to the right like placeNewNode). Offsets by a half
  // node so the node's center — not its top-left — sits at the viewport center.
  function viewportCenterPosition() {
    const c = screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
    return { x: c.x - 120, y: c.y - 60 };
  }
```

- [ ] **Step 3: Use it in `addNodeAndOpen`** — replace `const position = placeNewNode(nodes);` with:

```ts
    const position = viewportCenterPosition();
```

(Keep the following `addNode(args.type, position, id)` and the `setCenter(position.x + 120, position.y + 60, …)` line — with center placement it simply reaffirms the frame.)

- [ ] **Step 4: Use it in `createScriptNode`** — replace `const position = placeNewNode(nodes);` (line ~55) with:

```ts
    const position = viewportCenterPosition();
```

Remove `nodes` from that function's `storeApi.getState()` destructure if it becomes unused (tsc will flag it).

- [ ] **Step 5: Verify types**

Run: `npx tsc --noEmit`
Expected: exit 0. (If `placeNewNode` import is now unused in the hook, remove it.)

- [ ] **Step 6: Browser check**

Run the app, open the copilot on a populated canvas, ask "add a prompt node". Expected: the node appears in the middle of the current view (not off-screen right), and its detail view opens.

- [ ] **Step 7: Commit**

```bash
git add src/components/canvas/use-copilot-chat.ts
git commit -m "feat(copilot): place agent-created nodes at the viewport center

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: `@selected` — expand the current selection to ref handles

**Files:**
- Modify: `src/lib/copilot/actions.ts` (add `expandSelected`)
- Test: `src/lib/copilot/actions.test.ts` (append)
- Modify: `src/components/canvas/copilot-composer.tsx` (synthetic picker entry)

**Interfaces:**
- Consumes: `nodeLabel(node)` from `@/lib/nodes/describe-node`.
- Produces: `expandSelected(nodes: AppNode[]): string` — space-joined `@HANDLE name` tokens for selected nodes, trailing space, `""` if none selected.

- [ ] **Step 1: Write the failing test** — append to `src/lib/copilot/actions.test.ts`:

```ts
import { expandSelected } from "./actions";

const node = (id: string, type: string, selected: boolean, title?: string) =>
  ({ id, type, position: { x: 0, y: 0 }, data: title ? { title } : {}, selected }) as never;

describe("expandSelected", () => {
  it("returns empty string when nothing is selected", () => {
    expect(expandSelected([node("a1b2c3d4", "file", false)])).toBe("");
  });
  it("expands one selected node to its @HANDLE name token with trailing space", () => {
    expect(expandSelected([node("a1b2c3d4", "file", true, "Hero")])).toBe("@FILE-A1B2 Hero ");
  });
  it("space-joins multiple selected nodes", () => {
    const out = expandSelected([
      node("a1b2c3d4", "file", true, "Hero"),
      node("e5f6a7b8", "prompt", true),
      node("c9d0e1f2", "shot", false),
    ]);
    expect(out).toBe("@FILE-A1B2 Hero @PRM-E5F6 untitled prompt ");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/copilot/actions.test.ts`
Expected: FAIL — `expandSelected is not a function`.

- [ ] **Step 3: Implement `expandSelected`** — in `src/lib/copilot/actions.ts` (add the import if missing: `import { nodeHandle, nodeLabel } from "@/lib/nodes/describe-node";` — check the existing import line first):

```ts
// "@selected" sugar: translate the current canvas selection into the same visible
// "@HANDLE name" tokens the @-mention picker inserts, so resolveMentions handles them
// unchanged. Trailing space so the caret continues cleanly; "" when nothing is selected.
export function expandSelected(nodes: AppNode[]): string {
  const tokens = nodes
    .filter((n) => n.selected)
    .map((n) => {
      const { name, handle } = nodeLabel(n);
      return `@${handle} ${name}`;
    });
  return tokens.length ? `${tokens.join(" ")} ` : "";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/copilot/actions.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the synthetic picker entry in the composer** — in `copilot-composer.tsx`, the picker currently maps `mentionOptions` (nodes). Add a `@selected` row at the TOP of the list, shown when ≥1 node is selected and the query is a prefix of "selected". Compute alongside `mentionOptions`:

```ts
  // "@selected" sugar row — offered when there is a selection and the query matches.
  const selectedCount = nodes.filter((n) => n.selected).length;
  const showSelectedRow =
    mention !== null &&
    selectedCount > 0 &&
    "selected".startsWith(mention.query.toLowerCase());
```

- [ ] **Step 6: Render the row + handle its selection** — in the picker `<ul>`, before the `mentionOptions.map(...)`, add a first `<li>` when `showSelectedRow` is true, using the same `Button` shape as the node rows. On click, expand the selection and close the picker. Add an insert helper next to `insertMention`:

```ts
  // Replace the "@query" with the expanded selection tokens (insert-time expansion).
  function insertSelected() {
    if (mention === null) return;
    const tokens = expandSelected(nodes);
    if (!tokens) return;
    const el = inputRef.current;
    const caret = el?.selectionStart ?? input.length;
    const before = input.slice(0, mention.start);
    const after = input.slice(caret);
    setInput(before + tokens + after);
    setMention(null);
    const pos = (before + tokens).length;
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(pos, pos);
    });
  }
```

The row markup (place as the first child of the picker `<ul>`):

```tsx
{showSelectedRow && (
  <li>
    <Button
      variant="ghost"
      size="xs"
      type="button"
      onClick={insertSelected}
      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm font-normal hover:bg-muted"
    >
      <span className="text-eyebrow text-[9px] text-primary">SELECTED</span>
      <span className="truncate text-muted-foreground">{selectedCount} node{selectedCount === 1 ? "" : "s"} on canvas</span>
    </Button>
  </li>
)}
```

Import `expandSelected` from `@/lib/copilot/actions` at the top of the file.

- [ ] **Step 7: Guard the empty-picker branch** — the picker container currently renders when `mention !== null && mentionOptions.length > 0`. Update that condition so the picker also shows when only the selected row applies:

```ts
{mention !== null && (mentionOptions.length > 0 || showSelectedRow) && (
```

(Also allow `Enter` to accept the selected row when it is the only/highlighted entry — keep this minimal: if `showSelectedRow` and `mentionOptions.length === 0`, `Enter` calls `insertSelected()`. Add that branch inside the existing keydown mention block, before the `mentionOptions[mentionIndex]` Enter handler.)

- [ ] **Step 8: Verify**

Run: `npx tsc --noEmit && npx vitest run src/lib/copilot/actions.test.ts`
Expected: tsc 0; tests PASS.
Browser: select 2 nodes, type `@sel` in the composer → a "SELECTED · 2 nodes" row appears; clicking it inserts both nodes' `@HANDLE name` tokens.

- [ ] **Step 9: Commit**

```bash
git add src/lib/copilot/actions.ts src/lib/copilot/actions.test.ts src/components/canvas/copilot-composer.tsx
git commit -m "feat(copilot): @selected expands the canvas selection to ref handles

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: `connect_nodes` copilot tool — wire `@from…` → `@to`

**Files:**
- Modify: `src/lib/copilot/actions.ts` (add `connect_nodes` to `CopilotAction`, add `planConnections`)
- Test: `src/lib/copilot/actions.test.ts` (append)
- Modify: `src/app/api/copilot/actions/route.ts` (tool definition + dispatch)
- Modify: `src/components/canvas/use-copilot-chat.ts` (recipe + dispatch)

**Interfaces:**
- Consumes: `canConnect` (Task 1), `resolveNodeTarget`, `store.connectNodes(sourceId, targetId)`.
- Produces:
  - `CopilotAction` gains `{ name: "connect_nodes"; args: { from: string[]; to: string } }`.
  - `planConnections(fromHandles: string[], toHandle: string, nodes: AppNode[]): ConnectPlan` where
    ```ts
    type ConnectPlan = {
      target: AppNode | null;
      wired: { handle: string; sourceId: string }[];
      rejected: { handle: string }[]; // resolvable but the pair violates canConnect
      unknown: string[];              // handle did not resolve to a node
    };
    ```

- [ ] **Step 1: Write the failing test for `planConnections`** — append to `src/lib/copilot/actions.test.ts`:

```ts
import { planConnections } from "./actions";

const n = (id: string, type: string) => ({ id, type, position: { x: 0, y: 0 }, data: {} }) as never;

describe("planConnections", () => {
  const file = n("aaaa1111", "file");   // FILE-AAAA
  const draw = n("bbbb2222", "draw");   // DRAW-BBBB
  const prompt = n("cccc3333", "prompt"); // PRM-CCCC
  const nodes = [file, draw, prompt];

  it("returns target:null when the target handle is unknown", () => {
    const plan = planConnections(["FILE-AAAA"], "PRM-ZZZZ", nodes);
    expect(plan.target).toBeNull();
  });
  it("wires valid sources, rejects invalid pairs, flags unknown handles", () => {
    const plan = planConnections(["FILE-AAAA", "DRAW-BBBB", "SHOT-ZZZZ"], "PRM-CCCC", nodes);
    expect(plan.target?.id).toBe("cccc3333");
    expect(plan.wired.map((w) => w.handle)).toEqual(["FILE-AAAA", "DRAW-BBBB"]);
    expect(plan.rejected).toEqual([]);
    expect(plan.unknown).toEqual(["SHOT-ZZZZ"]);
  });
  it("rejects a source that cannot connect to the target type", () => {
    // prompt → file is not in VALID_CONNECTIONS
    const plan = planConnections(["PRM-CCCC"], "FILE-AAAA", nodes);
    expect(plan.wired).toEqual([]);
    expect(plan.rejected.map((r) => r.handle)).toEqual(["PRM-CCCC"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/copilot/actions.test.ts`
Expected: FAIL — `planConnections is not a function`.

- [ ] **Step 3: Extend `CopilotAction`** — in `src/lib/copilot/actions.ts`, add the variant:

```ts
export type CopilotAction =
  | { name: "add_node"; args: { type: string; title?: string } }
  | { name: "create_script_node"; args: { title?: string } }
  | { name: "parse_script"; args: { handle?: string } }
  | { name: "open_node"; args: { handle: string } }
  | { name: "connect_nodes"; args: { from: string[]; to: string } };
```

- [ ] **Step 4: Implement `planConnections`** — add to `src/lib/copilot/actions.ts` (imports `canConnect` from `@/lib/canvas-nodes`, `resolveNodeTarget` is already in this file):

```ts
export type ConnectPlan = {
  target: AppNode | null;
  wired: { handle: string; sourceId: string }[];
  rejected: { handle: string }[];
  unknown: string[];
};

// Pure planner for connect_nodes: resolve the target + each source handle, then partition the
// sources into wired (valid pair), rejected (resolvable but the direction violates canConnect),
// and unknown (handle resolved to nothing). The recipe maps `wired` through store.connectNodes.
export function planConnections(
  fromHandles: string[],
  toHandle: string,
  nodes: AppNode[],
): ConnectPlan {
  const target = resolveNodeTarget(nodes, toHandle);
  const plan: ConnectPlan = { target, wired: [], rejected: [], unknown: [] };
  if (!target) return plan;
  for (const handle of fromHandles) {
    const source = resolveNodeTarget(nodes, handle);
    if (!source) plan.unknown.push(handle);
    else if (!canConnect(source.type ?? "", target.type ?? "")) plan.rejected.push({ handle });
    else plan.wired.push({ handle, sourceId: source.id });
  }
  return plan;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/lib/copilot/actions.test.ts`
Expected: PASS.

- [ ] **Step 6: Add the route tool** — in `src/app/api/copilot/actions/route.ts`, add to the `tools` array (after `open_node`'s entry):

```ts
  {
    type: "function" as const,
    function: {
      name: "connect_nodes",
      description:
        "Wire nodes together. Call this when the user asks to connect/link/wire nodes. Each " +
        "handle in `from` becomes the SOURCE of an edge into the single `to` target " +
        "(direction: from → to). Handles look like FILE-469A / PRM-3C4D.",
      parameters: {
        type: "object",
        properties: {
          from: {
            type: "array",
            items: { type: "string" },
            description: "One or more source node handles.",
          },
          to: { type: "string", description: "The single target node handle." },
        },
        required: ["from", "to"],
        additionalProperties: false,
      },
    },
  },
```

- [ ] **Step 7: Add the route dispatch** — widen the `args` type and add the handler. Change line 165's type and add the branch before the final `return apiOk({ action: null })`:

```ts
    let args: { type?: string; title?: string; handle?: string; from?: string[]; to?: string };
```

```ts
    if (call.function.name === "connect_nodes") {
      const from = (args.from ?? []).map((h) => h.trim()).filter(Boolean);
      const to = args.to?.trim();
      if (!from.length || !to) return apiOk({ action: null });
      return apiOk({ action: { name: "connect_nodes" as const, args: { from, to } } });
    }
```

- [ ] **Step 8: Add the client recipe** — in `use-copilot-chat.ts`, import `planConnections` from `@/lib/copilot/actions`, then add near `openNode`:

```ts
  // RECIPE — wire @from… → @to. Cheap/reversible/structural → runs instantly (no gate).
  // Validation lives here because store.connectNodes is a dumb addEdge (no rule check).
  function connectHandles(fromHandles: string[], toHandle: string) {
    const { nodes, connectNodes } = storeApi.getState();
    const plan = planConnections(fromHandles, toHandle, nodes);
    if (!plan.target) {
      setMessages((m) => [...m, { role: "assistant", content: `I couldn't find a node called ${toHandle}.` }]);
      return;
    }
    plan.wired.forEach((w) => connectNodes(w.sourceId, plan.target!.id));
    const toH = nodeHandle({ id: plan.target.id, type: plan.target.type });
    const parts: string[] = [];
    if (plan.wired.length) parts.push(`Wired ${plan.wired.map((w) => w.handle).join(", ")} → ${toH}.`);
    if (plan.rejected.length) parts.push(`Can't connect ${plan.rejected.map((r) => r.handle).join(", ")} to ${toH} (not an allowed connection).`);
    if (plan.unknown.length) parts.push(`Couldn't find ${plan.unknown.join(", ")}.`);
    setMessages((m) => [...m, { role: "assistant", content: parts.join(" ") || "Nothing to connect." }]);
  }
```

- [ ] **Step 9: Dispatch it** — in the action-handling block (next to the `add_node` branch), add:

```ts
      if (action?.name === "connect_nodes") {
        connectHandles(action.args.from, action.args.to);
      }
```

- [ ] **Step 10: Verify**

Run: `npx tsc --noEmit && npx vitest run src/lib/copilot/actions.test.ts`
Expected: tsc 0; tests PASS.
Browser: "connect @FILE-469A and @DRAW-1B2C to @PRM-3C4D" → both edges appear; an invalid pair is reported, not wired.

- [ ] **Step 11: Commit**

```bash
git add src/lib/copilot/actions.ts src/lib/copilot/actions.test.ts src/app/api/copilot/actions/route.ts src/components/canvas/use-copilot-chat.ts
git commit -m "feat(copilot): connect_nodes tool — validated @from…→@to wiring

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Focus-view `+` — manual add-connection (prompt focus view)

**Files:**
- Create: `src/components/nodes/add-connection.tsx`
- Modify: `src/components/nodes/prompt-focus-view.tsx` (Connected header, ~line 515)

**Interfaces:**
- Consumes: `canConnect` (Task 1), `useCanvasStore` (`nodes`, `connectNodes`), `nodeLabel`, shadcn `Button`/`Popover`/`Command`.
- Produces: `<AddConnection targetId={string} targetType={string} connectedIds={string[]} />`

This is a UI component — verified in the browser. Its candidate-filter logic is small and inline; no separate unit test (the underlying `canConnect` is already tested in Task 1).

- [ ] **Step 1: Create the component** — `src/components/nodes/add-connection.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useCanvasStore } from "@/components/canvas/canvas-store-provider";
import { canConnect } from "@/lib/canvas-nodes";
import { nodeLabel } from "@/lib/nodes/describe-node";

// The "+" on a focus view's Connected header: pick a canvas node that MAY feed this node
// (canConnect(candidate → this)) and isn't already wired, then create the incoming edge.
// Reuses the same connection rule as the copilot and the manual drag path.
export function AddConnection({
  targetId,
  targetType,
  connectedIds,
}: {
  targetId: string;
  targetType: string;
  connectedIds: string[];
}) {
  const [open, setOpen] = useState(false);
  const nodes = useCanvasStore((s) => s.nodes);
  const connectNodes = useCanvasStore((s) => s.connectNodes);

  const candidates = nodes.filter(
    (n) =>
      n.id !== targetId &&
      !connectedIds.includes(n.id) &&
      canConnect(n.type ?? "", targetType),
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="xs"
            type="button"
            title="Add a connection"
            className="size-5 rounded p-0 text-muted-foreground hover:text-primary"
          >
            <Plus className="size-3.5" />
          </Button>
        }
      />
      <PopoverContent align="start" className="w-56 p-0">
        <Command>
          <CommandInput placeholder="Connect a node…" />
          <CommandList>
            <CommandEmpty>No nodes available to connect.</CommandEmpty>
            <CommandGroup>
              {candidates.map((n) => {
                const { name, handle } = nodeLabel(n);
                return (
                  <CommandItem
                    key={n.id}
                    value={`${handle} ${name}`}
                    onSelect={() => {
                      connectNodes(n.id, targetId);
                      setOpen(false);
                    }}
                    className="flex items-center gap-2"
                  >
                    <span className="text-eyebrow text-[9px] text-primary">{handle}</span>
                    <span className="truncate">{name}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
```

- [ ] **Step 2: Verify the shadcn primitives exist / export names match** — before wiring, confirm the `popover` and `command` exports used above:

Run: `grep -n "export" src/components/ui/popover.tsx src/components/ui/command.tsx`
Expected: `Popover`, `PopoverTrigger`, `PopoverContent`, `Command`, `CommandInput`, `CommandList`, `CommandEmpty`, `CommandGroup`, `CommandItem` are exported. If a name differs (Base UI variants), adjust imports to match. If `PopoverTrigger` uses a different composition than `render`, follow the pattern already used elsewhere in `src/components/nodes` (grep for an existing `Popover` usage, e.g. `usage-popover-shell.tsx`).

- [ ] **Step 3: Wire into the prompt focus view** — in `prompt-focus-view.tsx`, replace the Connected header (lines 515-517) so the label and the `+` share a row:

```tsx
            <div className="flex items-center justify-between px-2.5 pb-1 pt-3">
              <span className="text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground/70">
                Connected · {upstream.length}
              </span>
              <AddConnection
                targetId={id}
                targetType="prompt"
                connectedIds={upstream.map((u) => u.id)}
              />
            </div>
```

Add the import at the top of the file:

```ts
import { AddConnection } from "./add-connection";
```

Confirm `id` (the prompt node's id) is in scope in this component; the focus view receives it as a prop — grep `nodeId` / `id` near the top of `prompt-focus-view.tsx` and use whatever the node id is bound to.

- [ ] **Step 4: Verify types**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 5: Browser check**

Open a Prompt node's focus view. The Connected header shows a `+`. Click it → a searchable list of connectable, not-yet-connected canvas nodes. Pick one → it appears under Connected and an edge is drawn on the canvas. A node type that can't feed a prompt never appears in the list.

- [ ] **Step 6: Commit**

```bash
git add src/components/nodes/add-connection.tsx src/components/nodes/prompt-focus-view.tsx
git commit -m "feat(nodes): + add-connection combobox on the prompt focus view

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Final verification

- [ ] Run the full check from the worktree root:

Run: `npx tsc --noEmit && npx vitest run && npx eslint src/lib/copilot src/components/canvas/copilot-composer.tsx src/components/canvas/use-copilot-chat.ts src/components/nodes/add-connection.tsx src/components/nodes/prompt-focus-view.tsx`
Expected: tsc 0; all tests green; eslint 0.

- [ ] Browser smoke of all four features: viewport-center add, `@selected` expansion, `connect @a @b → @c`, focus-view `+`.
