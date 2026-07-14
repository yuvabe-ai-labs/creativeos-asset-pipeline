# Copilot Selection Context + Zoom-Legible Ref Badges Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auto-attach the canvas selection as copilot grounding via a live, dismissible chip row (replacing the manual `@selected` picker row), and flip node ref badges larger below a zoom threshold so they stay readable at overview zoom.

**Architecture:** Selection ids ride the existing `mentionedIds` side-channel (merged with typed @-mentions at send) — zero server changes. The composer owns chip UI + per-turn dismissal keyed to a selection signature; `useCopilotChat.send()` merges ids and stamps a `context` label list onto the user `Msg` for history. The badge flip is a boolean `useStore` selector inside `NodeHandle` (all consumers are canvas card faces).

**Tech Stack:** Next.js / React 19, Zustand canvas store, `@xyflow/react` (React Flow), vitest, shadcn (Base UI registry).

**Spec:** `docs/superpowers/specs/2026-07-14-copilot-selection-context-design.md`

## Global Constraints

- Every interactive control is a shadcn primitive from `src/components/ui/*` — never a native `<button>`/`<input>`. Base UI composes via the `render` prop, not `asChild`.
- Icons: Lucide only, 1.5 stroke.
- Chip styling vocabulary: `border-primary/30 bg-primary/5`, eyebrow handle (`text-eyebrow`), `text-xs`.
- Import, don't redefine — helpers live in `src/lib/copilot/actions.ts` beside their siblings.
- Zoom threshold: `0.65`. Zoomed-out badge size: `text-[15px] text-foreground`. Default: `text-[10px] text-foreground/70`.
- Chip cap: 3 chips + `+N` overflow. History context line cap: 3 handles + ` +N`.
- Known pre-existing failure (do not fix, do not be blocked by): eslint `react-hooks/set-state-in-effect` error in `src/components/nodes/image-gen-focus-view.tsx:257`.

---

### Task 1: Pure helpers — `mergeMentionedIds` + `selectionSignature`

**Files:**
- Modify: `src/lib/copilot/actions.ts` (add two functions near `expandSelected`, ~line 103)
- Test: `src/lib/copilot/actions.test.ts`

**Interfaces:**
- Consumes: `AppNode` from `@/lib/canvas-nodes` (already imported in both files).
- Produces: `mergeMentionedIds(typed: string[], context: string[]): string[]` — typed first, deduped. `selectionSignature(nodes: AppNode[]): string` — sorted selected ids joined with `","`, `""` when none selected. Tasks 2 and 3 import these by exactly these names.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/copilot/actions.test.ts` (the `node(id, type, selected, title?)` helper already exists at line ~106 — reuse it, do not redeclare):

```ts
import { mergeMentionedIds, selectionSignature } from "./actions";

describe("mergeMentionedIds", () => {
  it("keeps typed mentions first, then context ids", () => {
    expect(mergeMentionedIds(["a", "b"], ["c"])).toEqual(["a", "b", "c"]);
  });
  it("dedupes a node that was both typed and selected", () => {
    expect(mergeMentionedIds(["a"], ["a", "b"])).toEqual(["a", "b"]);
  });
  it("handles empty sides", () => {
    expect(mergeMentionedIds([], [])).toEqual([]);
    expect(mergeMentionedIds([], ["x"])).toEqual(["x"]);
  });
});

describe("selectionSignature", () => {
  it("returns empty string when nothing is selected", () => {
    expect(selectionSignature([node("a1b2c3d4", "file", false)])).toBe("");
  });
  it("is order-stable regardless of node order", () => {
    const a = node("bbbb2222", "file", true);
    const b = node("aaaa1111", "prompt", true);
    expect(selectionSignature([a, b])).toBe(selectionSignature([b, a]));
    expect(selectionSignature([a, b])).toBe("aaaa1111,bbbb2222");
  });
  it("ignores unselected nodes", () => {
    expect(
      selectionSignature([node("aaaa1111", "file", true), node("bbbb2222", "shot", false)]),
    ).toBe("aaaa1111");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/copilot/actions.test.ts`
Expected: FAIL — `mergeMentionedIds` / `selectionSignature` are not exported.

- [ ] **Step 3: Write the implementations**

Add to `src/lib/copilot/actions.ts`, directly below `expandSelected` (~line 113):

```ts
// Union of the @HANDLE mentions the human typed and the ids attached implicitly by
// the selection chip — typed mentions first, deduped. This is the turn's grounding set.
export function mergeMentionedIds(typed: string[], context: string[]): string[] {
  return [...new Set([...typed, ...context])];
}

// Stable fingerprint of the current selection (sorted ids). The composer keys its
// per-turn chip dismissal to this: dismissal holds while the signature is unchanged
// and resets the moment the selection differs. "" when nothing is selected.
export function selectionSignature(nodes: AppNode[]): string {
  return nodes
    .filter((n) => n.selected)
    .map((n) => n.id)
    .sort()
    .join(",");
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/copilot/actions.test.ts`
Expected: PASS (all suites in the file).

- [ ] **Step 5: Commit**

```bash
git add src/lib/copilot/actions.ts src/lib/copilot/actions.test.ts
git commit -m "feat(copilot): mergeMentionedIds + selectionSignature helpers"
```

---

### Task 2: `send()` accepts contextIds; user `Msg` carries `context`

**Files:**
- Modify: `src/components/canvas/use-copilot-chat.ts`

**Interfaces:**
- Consumes: `mergeMentionedIds` from `@/lib/copilot/actions` (Task 1), `nodeLabel` from `@/lib/nodes/describe-node`.
- Produces: `send(text: string, attachment: Attachment | null, contextIds?: string[])` (third param defaults to `[]`, so `copilot-panel.tsx`'s `onSend={send}` keeps compiling). `Msg` gains `context?: { handle: string; name: string }[]` — Task 4 renders it.

- [ ] **Step 1: Extend the `Msg` type**

In `use-copilot-chat.ts` (~line 20):

```ts
export type Msg = {
  role: "user" | "assistant";
  content: string;
  nodes?: NodeRef[];
  // Implicit grounding (the canvas selection) this turn was sent with — labels are
  // captured AT SEND TIME so history survives later node deletion/renaming.
  context?: { handle: string; name: string }[];
};
```

- [ ] **Step 2: Update imports**

Line 4 currently reads:

```ts
import { nodeHandle, resolveMentions } from "@/lib/nodes/describe-node";
```

Change to:

```ts
import { nodeHandle, nodeLabel, resolveMentions } from "@/lib/nodes/describe-node";
```

Add `mergeMentionedIds` to the existing `@/lib/copilot/actions` import block (lines 5–13).

- [ ] **Step 3: Thread contextIds through `send`**

Current code (~lines 204–219):

```ts
async function send(text: string, attachment: Attachment | null) {
    ...
    const mentionedIds = resolveMentions(text, storeApi.getState().nodes);
    const history = buildHistory(messages, text);
    setMessages((m) => [...m, { role: "user", content: text }]);
```

Change the signature and those three statements to:

```ts
async function send(text: string, attachment: Attachment | null, contextIds: string[] = []) {
    ...
    const nodesNow = storeApi.getState().nodes;
    // Grounding set = typed @HANDLE mentions ∪ the selection chip's ids.
    const mentionedIds = mergeMentionedIds(resolveMentions(text, nodesNow), contextIds);
    // Labels for history — resolved now, tolerating ids whose node vanished mid-send.
    const context = contextIds.flatMap((id) => {
      const n = nodesNow.find((node) => node.id === id);
      return n ? [nodeLabel(n)] : [];
    });
    const history = buildHistory(messages, text);
    setMessages((m) => [
      ...m,
      { role: "user", content: text, ...(context.length ? { context } : {}) },
    ]);
```

Everything else in `send` (the attachment short-circuit at the top, the actions fetch, the answer fall-through) is untouched — the attachment path returns before `contextIds` is read, which is the spec's "attachment ignores contextIds" behavior.

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: exit 0.
Run: `npx vitest run`
Expected: PASS (no behavior change reachable by existing tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/canvas/use-copilot-chat.ts
git commit -m "feat(copilot): send() merges selection contextIds into mentionedIds"
```

---

### Task 3: Composer chip row + dismissal; remove `@selected` sugar and `expandSelected`

**Files:**
- Modify: `src/components/canvas/copilot-composer.tsx`
- Modify: `src/lib/copilot/actions.ts` (delete `expandSelected`)
- Modify: `src/lib/copilot/actions.test.ts` (delete its `describe("expandSelected", ...)` block; KEEP the shared `node(...)` helper — Task 1's tests use it)

**Interfaces:**
- Consumes: `selectionSignature` from `@/lib/copilot/actions` (Task 1); `onSend` third param from Task 2.
- Produces: `CopilotComposer` prop type `onSend: (text: string, attachment: Attachment | null, contextIds: string[]) => void`.

- [ ] **Step 1: Update the composer's prop type and imports**

In `copilot-composer.tsx`: change the `onSend` prop type to the three-arg form above. In the imports, replace `expandSelected` with `selectionSignature` in the `@/lib/copilot/actions` import. (`X`, `nodeLabel`, `Button` are already imported.)

- [ ] **Step 2: Add selection/dismissal state and derived values**

Replace the `@selected`-sugar block (lines 55–64: `selectedCount`, `showSelectedRow`, `rowOffset`, `totalRows`) with:

```tsx
// Auto-attached selection context: the current canvas selection rides along as
// grounding unless dismissed for this turn. Dismissal is keyed to the selection
// SIGNATURE — it holds while the selection is unchanged and resets when it differs.
const [dismissedSig, setDismissedSig] = useState<string | null>(null);
const signature = selectionSignature(nodes);
const contextNodes =
  signature && dismissedSig !== signature ? nodes.filter((n) => n.selected) : [];
```

- [ ] **Step 3: Remove the sugar row's machinery**

- Delete the `insertSelected()` function (lines 106–112).
- In the picker JSX: change the render condition to `mention !== null && mentionOptions.length > 0`, delete the whole `{showSelectedRow && (...)}` `<li>` block, and simplify the node rows: `onMouseEnter={() => setMentionIndex(i)}` and highlight check `i === mentionIndex`.
- In `onKeyDown`: change the guard to `if (mention !== null && mentionOptions.length > 0)`, use `mentionOptions.length` as the modulo base for ArrowDown/ArrowUp, and reduce the Enter branch to:

```tsx
if (e.key === "Enter") {
  e.preventDefault();
  const option = mentionOptions[mentionIndex];
  if (option) insertMention(option);
  return;
}
```

- [ ] **Step 4: Render the chip row and pass contextIds on submit**

In `submit()`, change the `onSend` call and reset dismissal:

```tsx
onSend(text, attachment, contextNodes.map((n) => n.id));
setInput("");
setAttachment(null);
setMention(null);
setDismissedSig(null);
```

Directly AFTER the existing attachment-chip block (`{attachment && (...)}`, ends line ~152), add:

```tsx
{contextNodes.length > 0 && (
  <div className="mb-2 flex flex-wrap items-center gap-1.5">
    {contextNodes.slice(0, 3).map((n) => {
      const { name, handle } = nodeLabel(n);
      return (
        <span
          key={n.id}
          className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/5 px-2.5 py-1 text-xs text-primary"
        >
          <span className="text-eyebrow text-[9px] opacity-60">{handle}</span>
          <span className="max-w-[120px] truncate">{name}</span>
        </span>
      );
    })}
    {contextNodes.length > 3 && (
      <span className="rounded-full border border-primary/30 bg-primary/5 px-2 py-1 text-xs text-primary">
        +{contextNodes.length - 3}
      </span>
    )}
    <Button
      variant="ghost"
      size="icon-xs"
      type="button"
      onClick={() => setDismissedSig(signature)}
      aria-label="Don't include selection this message"
      className="size-4 text-primary/60 hover:bg-transparent hover:text-primary"
    >
      <X className="size-3" />
    </Button>
  </div>
)}
```

- [ ] **Step 5: Delete `expandSelected` and its tests**

- `src/lib/copilot/actions.ts`: delete the `expandSelected` function and its comment block (lines ~102–113).
- `src/lib/copilot/actions.test.ts`: delete `import { expandSelected } from "./actions";` (line 3) and the `describe("expandSelected", ...)` block (lines ~109–124). Keep the `node(...)` helper.

- [ ] **Step 6: Verify**

Run: `npx vitest run src/lib/copilot`
Expected: PASS, no `expandSelected` suite.
Run: `npx tsc --noEmit -p tsconfig.json`
Expected: exit 0 (proves no dangling `expandSelected` / `showSelectedRow` references).

- [ ] **Step 7: Commit**

```bash
git add src/components/canvas/copilot-composer.tsx src/lib/copilot/actions.ts src/lib/copilot/actions.test.ts
git commit -m "feat(copilot): live selection-context chip row replaces @selected sugar"
```

---

### Task 4: History — render the context line under user messages

**Files:**
- Modify: `src/components/canvas/copilot-message.tsx`

**Interfaces:**
- Consumes: `Msg.context` from Task 2.

- [ ] **Step 1: Render the context tag**

In `CopilotMessage`, after the message-bubble `<div>` (closes line ~21) and before the assistant chips block, add:

```tsx
{msg.role === "user" && msg.context && msg.context.length > 0 && (
  <div className="mt-1 text-[10px] text-muted-foreground" title="Sent with this selection as context">
    ⌞ {msg.context.slice(0, 3).map((c) => c.handle).join(", ")}
    {msg.context.length > 3 ? ` +${msg.context.length - 3}` : ""}
  </div>
)}
```

(Non-interactive `div`/`span` — fine per the controls rule. The parent already right-aligns user rows via `text-right`.)

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/components/canvas/copilot-message.tsx
git commit -m "feat(copilot): show selection context under sent messages"
```

---

### Task 5: Zoom-legible `NodeHandle` + spec amendment

**Files:**
- Modify: `src/components/nodes/node-handle.tsx`
- Modify: `docs/superpowers/specs/2026-07-14-copilot-selection-context-design.md` (§3)

**Interfaces:**
- Consumes: `useStore` from `@xyflow/react`. All 11 `NodeHandle` consumers are canvas node card components (verified) — no call-site changes.

- [ ] **Step 1: Rewrite `node-handle.tsx`**

Full new content:

```tsx
"use client";

import { useStore } from "@xyflow/react";
import { cn } from "@/lib/utils";
import { nodeHandle } from "@/lib/nodes/describe-node";

// The node's stable ref tag ("PRM-A3F9"), shown on its card face so a human can refer
// to a specific node by handle. Rendered in the design system's tracked small-caps
// eyebrow style so it reads as an intentional identifier, not a debug string.
//
// Canvas-only (every consumer is a node card inside the ReactFlow provider): below
// the zoom threshold the tag flips larger so handles stay readable at overview zoom.
// The selector returns a BOOLEAN, so nodes re-render only when the zoom crosses the
// threshold — not on every zoom tick (React Flow contextual-zoom pattern).
export function NodeHandle({
  nodeId,
  nodeType,
  className,
}: {
  nodeId: string;
  nodeType?: string;
  className?: string;
}) {
  const zoomedOut = useStore((s) => s.transform[2] < 0.65);
  return (
    <span
      className={cn(
        "text-eyebrow font-medium",
        zoomedOut ? "text-[15px] text-foreground" : "text-[10px] text-foreground/70",
        className,
      )}
      title="Node reference"
    >
      {nodeHandle({ id: nodeId, type: nodeType })}
    </span>
  );
}
```

- [ ] **Step 2: Amend spec §3**

In `docs/superpowers/specs/2026-07-14-copilot-selection-context-design.md` §3, replace the `ZoomAwareNodeHandle` wrapper description with a note: implementation-time audit found **all 12 `NodeHandle` references are canvas card components** (none in focus views), so the flip lives directly in `NodeHandle` — no wrapper, no `NodeTitle` swap, zero call-site changes. The boolean-selector mechanics and 0.65 threshold are unchanged.

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/components/nodes/node-handle.tsx docs/superpowers/specs/2026-07-14-copilot-selection-context-design.md
git commit -m "feat(canvas): ref badges flip larger below zoom 0.65 (contextual zoom)"
```

---

### Task 6: Full verification + manual pass

**Files:** none (verification only).

- [ ] **Step 1: Full automated suite**

Run: `npx vitest run`
Expected: PASS (pre-existing unrelated failures, if any, noted — none known in `src/lib`).
Run: `npx tsc --noEmit -p tsconfig.json`
Expected: exit 0.
Run: `npx eslint src/components/canvas/copilot-composer.tsx src/components/canvas/copilot-message.tsx src/components/canvas/use-copilot-chat.ts src/components/nodes/node-handle.tsx src/lib/copilot/actions.ts`
Expected: exit 0 (the known `image-gen-focus-view.tsx:257` error is outside this set).

- [ ] **Step 2: Manual checklist (dev server from THIS worktree)**

1. Select 1 node → chip appears with `HANDLE · name`; select 5 → 3 chips + `+2`.
2. × dismisses; changing selection brings the row back; sending resets dismissal.
3. Send "what is this?" with a shot selected → answer is grounded on that shot; history shows `⌞ SHOT-…` under the message.
4. Type `@` → picker shows node rows only (no SELECTED row); Enter inserts; explicit mention + same node selected → grounded once.
5. Attach a script + selection → script node created, selection ignored (as spec'd).
6. Zoom the canvas below ~65% → ref badges flip larger; zoom in → back to 10px; no flicker while panning.

- [ ] **Step 3: Report**

Report results (including any failures verbatim) before claiming done — per superpowers:verification-before-completion.
