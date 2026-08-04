# Post Editor UX v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the shipped Post node's editing UX to Canva-parity per direct user testing feedback:
debounced save, multi-select + grouping, a layer right-click menu, left-panel rename/drag-reorder,
more icons/shape styling, and image proportion handling.

**Architecture:** Same conventions as the original Post node plan
(`docs/superpowers/plans/2026-08-03-post-node.md`): pure/testable logic in `src/lib/post/*`, thin
React/Konva components verified by `tsc` only (no jsdom in this repo). This plan MODIFIES many
already-shipped files from that plan — every task below was written against the CURRENT (post-fix-round)
content of those files, confirmed by direct research, not assumption.

**Tech Stack:** Same as the original plan (React 19 / Next.js 16 / react-konva / Zustand / Tailwind v4
+ shadcn). No new dependencies.

**Reference docs:** `docs/superpowers/specs/2026-08-04-post-editor-ux-v2-design.md` (this plan's
source spec).

## Global Constraints

- Every interactive control is a shadcn primitive from `src/components/ui/*` — never a raw native
  element (see the original plan's Task 15/19 findings — this rule is enforced by review every time).
- No `.tsx` component files are unit-tested in this repo (no jsdom) — verified by `tsc --noEmit` only.
  Only `src/lib/post/**/*.ts` pure functions get `describe/it` tests.
- **No debounce utility exists in this codebase.** Every existing debounced thing (`canvas-autosave.tsx`,
  `use-drive-browser.ts`) hand-rolls its own `useRef<Timeout>` + `setTimeout`/`clearTimeout` pattern.
  This plan follows the same convention rather than introducing a new dependency.
- Konva's `Transformer` (v10.3.0, confirmed installed) has NATIVE shift-key proportional-resize
  support via its `keepRatio`/`shiftBehavior` props — no custom `boundBoxFunc` needed. The library
  DEFAULTS are `keepRatio=true, shiftBehavior='default'`, meaning `post-stage.tsx`'s current
  `<Transformer>` (which sets neither) has EVERY resize aspect-locked today. This plan's fix is to
  explicitly set `keepRatio={false}` so resize is free by default and Shift re-locks it
  (`keepProportion = keepRatio || event.shiftKey`).
- shadcn's `ContextMenu` (`src/components/ui/context-menu.tsx`, Base UI-based) already exports
  `ContextMenuSub`/`ContextMenuSubTrigger`/`ContextMenuSubContent` for the Align flyout — use these,
  don't hand-roll a submenu.
- `PostLayer` is currently `TextLayer | ShapeLayer | ImageLayer | IconLayer` — this plan adds a
  fifth variant, `GroupLayer`. Every existing exhaustive `switch`/`if-chain` over `layer.kind` in
  the codebase (`post-layer-render.tsx`, the inspector dispatcher, `layer-konva-props.ts`) must
  handle the new case — `tsc` will catch any missed one only where the codebase already uses
  exhaustiveness-checking patterns; grep for `layer.kind ===` and `switch` over `.kind` to find
  every site by hand as well, don't rely on the compiler alone.

## File Structure

```
src/lib/
  debounce.ts                 pure debounce factory (Task 1)
  debounce.test.ts
  post/
    types.ts                  + GroupLayer, + ShapeLayer.stroke (Task 2, modify)
    layers.ts                 + groupLayers/ungroupLayers/copyLayers/pasteLayers (Task 3, modify)
    layers.test.ts            (modify — add new describe blocks)
    align.ts                  alignment math (Task 4)
    align.test.ts
    image-fit.ts               + computeNaturalRatioReset (Task 5, modify)
    image-fit.test.ts          (modify)

src/hooks/
  use-post-editor.ts           selectedIds, group/ungroup/copy/paste/align, debounced onChange (Task 6, modify)
  use-debounced-callback.ts    thin React wrapper over debounce.ts (Task 6, new, untested)

src/components/nodes/
  post-group-layer.tsx         renders a GroupLayer as a Konva Group (Task 7, new)
  post-layer-render.tsx        + "group" dispatch case (Task 7, modify)
  post-stage.tsx               multi-select Transformer, rubber-band, keepRatio=false (Task 8, modify)
  post-layer-context-menu.tsx  right-click menu on stage layers (Task 9, new)
  post-layer-list.tsx          inline rename, drag-reorder, multi-select sync (Task 10, modify)
  post-inspector-text.tsx      blur-commit instead of per-keystroke (Task 11, modify)
  post-inspector-shape.tsx     blur-commit + stroke controls (Task 11, modify)
  post-inspector-image.tsx     + "Reset to natural ratio" button (Task 12, modify)
  post-add-menu.tsx            expanded icon presets (Task 13, modify)
  post-template-picker.tsx     remove copy-brief button (Task 14, modify)
  post-focus-view.tsx          toolbar undo/redo, fixed-width panel, debounce wiring,
                                group/ungroup/copy/paste/align shortcuts (Task 15, modify)

src/lib/post/templates/
  lower-third.ts inset-card.ts side-column.ts split-half.ts   CTA pill -> group (Task 16, modify)
```

---

## Task 1: Pure debounce factory

**Files:**
- Create: `src/lib/debounce.ts`
- Test: `src/lib/debounce.test.ts`

**Interfaces:**
- Produces: `createDebounced<A extends unknown[]>(fn: (...args: A) => void, delayMs: number):
  { call: (...args: A) => void; flush: () => void; cancel: () => void }`. `call` resets the timer on
  every invocation (trailing-edge debounce — matches `canvas-autosave.tsx`'s existing hand-rolled
  pattern); `flush` immediately invokes any pending call with its last args and clears the timer;
  `cancel` clears the timer without invoking. Consumed by Task 6's `use-debounced-callback.ts`.

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/debounce.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createDebounced } from "./debounce";

describe("createDebounced", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("delays the call until the delay elapses with no further calls", () => {
    const fn = vi.fn();
    const d = createDebounced(fn, 200);
    d.call("a");
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(199);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledWith("a");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("resets the timer on every call — only the LAST call's args fire (trailing edge)", () => {
    const fn = vi.fn();
    const d = createDebounced(fn, 200);
    d.call("a");
    vi.advanceTimersByTime(100);
    d.call("b");
    vi.advanceTimersByTime(100);
    expect(fn).not.toHaveBeenCalled(); // only 100ms since "b", not yet 200
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith("b");
  });

  it("flush() invokes immediately with the last pending args and clears the timer", () => {
    const fn = vi.fn();
    const d = createDebounced(fn, 200);
    d.call("a");
    d.flush();
    expect(fn).toHaveBeenCalledWith("a");
    expect(fn).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(200);
    expect(fn).toHaveBeenCalledTimes(1); // no double-fire after flush
  });

  it("flush() with nothing pending is a no-op", () => {
    const fn = vi.fn();
    const d = createDebounced(fn, 200);
    d.flush();
    expect(fn).not.toHaveBeenCalled();
  });

  it("cancel() clears a pending call without invoking it", () => {
    const fn = vi.fn();
    const d = createDebounced(fn, 200);
    d.call("a");
    d.cancel();
    vi.advanceTimersByTime(200);
    expect(fn).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/debounce.test.ts`
Expected: FAIL — `Cannot find module './debounce'`

- [ ] **Step 3: Write `debounce.ts`**

```typescript
// src/lib/debounce.ts

// Trailing-edge debounce — matches the hand-rolled pattern every other debounced thing in this
// codebase already uses (canvas-autosave.tsx, use-drive-browser.ts), extracted as a pure,
// testable factory since no shared debounce utility exists anywhere in this repo.
export function createDebounced<A extends unknown[]>(
  fn: (...args: A) => void,
  delayMs: number,
): { call: (...args: A) => void; flush: () => void; cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pendingArgs: A | null = null;

  function call(...args: A) {
    pendingArgs = args;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      const toRun = pendingArgs;
      pendingArgs = null;
      if (toRun) fn(...toRun);
    }, delayMs);
  }

  function flush() {
    if (timer) clearTimeout(timer);
    timer = null;
    const toRun = pendingArgs;
    pendingArgs = null;
    if (toRun) fn(...toRun);
  }

  function cancel() {
    if (timer) clearTimeout(timer);
    timer = null;
    pendingArgs = null;
  }

  return { call, flush, cancel };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/debounce.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/debounce.ts src/lib/debounce.test.ts
git commit -m "feat(post): add pure trailing-edge debounce factory"
```

---

## Task 2: Layer types — GroupLayer + shape stroke

**Files:**
- Modify: `src/lib/post/types.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `GroupLayer` (`LayerBase & { kind: "group"; childIds: string[] }`), `PostLayer` widened to
  include it, `ShapeLayer.stroke?: { color: string; width: number }`. Every existing consumer of
  `PostLayer` (layer-konva-props.ts, post-layer-render.tsx, the inspector) must be updated in later
  tasks to handle `"group"` — this task only changes the type, callers are fixed as each task touches
  them (Task 7 for the renderer, Task 3 for layers.ts's factories/ops).

- [ ] **Step 1: Modify `types.ts`**

Add `GroupLayer` after `IconLayer`'s definition, widen `PostLayer`, and add `stroke` to `ShapeLayer`:

```typescript
export type ShapeLayer = LayerBase & {
  kind: "shape";
  fill: Fill;
  radius: number;
  stroke?: { color: string; width: number };
};
```

```typescript
export type IconLayer = LayerBase & { kind: "icon"; src: IconSource; color?: string };

// A group's own x/y/w/h is the bounding box of its children at creation time; children keep
// their own x/y/w/h as absolute (not group-relative) normalized coordinates — post-group-layer.tsx
// (Task 7) renders them via a Konva Group whose own x/y/rotation transform is applied on top, so
// child coordinates stay in the SAME normalized-canvas space children already use everywhere else
// in this codebase (no new relative-coordinate system to reason about).
export type GroupLayer = LayerBase & { kind: "group"; childIds: string[] };

export type PostLayer = TextLayer | ShapeLayer | ImageLayer | IconLayer | GroupLayer;
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: several NEW errors — every non-exhaustive `if (layer.kind === "text") ... else if
(layer.kind === "shape") ... else` chain that ends in an `else` branch assuming the last remaining
kind (e.g. `post-layer-render.tsx`'s final `else` currently assumes `"icon"`) will now be reachable
with `"group"` too and produce wrong behavior at runtime even though `tsc` may not flag every one
(if-chains with a bare `else` don't get exhaustiveness checking the way a `switch` with
`: never` assertion would). **Do not fix these here** — this task only lands the type; Tasks 3 and 7
fix every call site deliberately, in order, as part of their own work. Confirm via `git diff` that
you changed ONLY `types.ts` in this task before committing.

- [ ] **Step 3: Commit**

```bash
git add src/lib/post/types.ts
git commit -m "feat(post): add GroupLayer type and ShapeLayer.stroke"
```

---

## Task 3: Layer ops — group/ungroup/copy/paste

**Files:**
- Modify: `src/lib/post/layers.ts`
- Modify: `src/lib/post/layers.test.ts`

**Interfaces:**
- Consumes: `PostLayer`, `GroupLayer` from `./types` (Task 2).
- Produces: `groupLayers(layers: PostLayer[], ids: string[]): PostLayer[]` (removes the layers whose
  id is in `ids` from their current positions, computes their combined bounding box, creates a new
  `GroupLayer` with that box and `childIds: ids`, inserts the group at the position of the
  FRONTMOST (highest array index) of the original layers — so the group doesn't jump behind
  everything). `ungroupLayers(layers: PostLayer[], groupId: string): PostLayer[]` (removes the
  group, reinserts its children at the group's former position, in their ORIGINAL relative order —
  i.e. the order they appear in `layers` today, not `childIds`' order, since layers may have been
  reordered independently while grouped... actually simplify: reinsert in `childIds` order, which is
  fixed at group-creation time and this plan doesn't add reordering-within-a-group, so `childIds`
  order IS the stable source of truth). `copyLayers(layers: PostLayer[], ids: string[]): PostLayer[]`
  (returns a **deep copy** — new `id`s — of the matching layers, for stashing in an in-memory
  clipboard; does NOT modify `layers`). `pasteLayers(layers: PostLayer[], clipboard: PostLayer[]):
  PostLayer[]` (appends fresh-id copies of `clipboard`'s layers, each nudged +0.02/+0.02 like
  `duplicateLayer` already does, onto the end of `layers`). Consumed by Task 6's `use-post-editor.ts`.

- [ ] **Step 1: Write the failing test**

Add to `src/lib/post/layers.test.ts` (new `describe` blocks; existing tests are untouched):

```typescript
// Add these imports alongside the existing ones at the top of layers.test.ts:
import { groupLayers, ungroupLayers, copyLayers, pasteLayers } from "./layers";
import type { GroupLayer } from "./types";
```

```typescript
describe("groupLayers", () => {
  it("removes the grouped layers and inserts a GroupLayer at the frontmost original position", () => {
    const a = createTextLayer({ name: "a", x: 0.1, y: 0.1, w: 0.2, h: 0.1 });
    const b = createShapeLayer({ name: "b", x: 0.3, y: 0.2, w: 0.1, h: 0.3 });
    const c = createTextLayer({ name: "c", x: 0.5, y: 0.5, w: 0.1, h: 0.1 }); // not grouped
    const result = groupLayers([a, b, c], [a.id, b.id]);
    expect(result).toHaveLength(2); // group + c
    const group = result.find((l) => l.kind === "group") as GroupLayer;
    expect(group).toBeDefined();
    expect(group.childIds).toEqual([a.id, b.id]);
    // group's own box is the bounding box of a and b: x in [0.1, 0.4], y in [0.1, 0.5]
    expect(group.x).toBeCloseTo(0.1, 5);
    expect(group.y).toBeCloseTo(0.1, 5);
    expect(group.w).toBeCloseTo(0.3, 5); // 0.4 - 0.1
    expect(group.h).toBeCloseTo(0.4, 5); // 0.5 - 0.1
    // inserted at b's original index (the frontmost of the two grouped layers, index 1)
    expect(result[1].kind).toBe("group");
  });

  it("is a no-op if fewer than 2 ids are given", () => {
    const a = createTextLayer();
    expect(groupLayers([a], [a.id])).toEqual([a]);
    expect(groupLayers([a], [])).toEqual([a]);
  });

  it("ignores ids that don't match any layer", () => {
    const a = createTextLayer();
    const b = createShapeLayer();
    const result = groupLayers([a, b], [a.id, b.id, "missing-id"]);
    const group = result.find((l) => l.kind === "group") as GroupLayer;
    expect(group.childIds).toEqual([a.id, b.id]);
  });
});

describe("ungroupLayers", () => {
  it("removes the group and reinserts its children in childIds order at the group's position", () => {
    const a = createTextLayer({ name: "a" });
    const b = createShapeLayer({ name: "b" });
    const c = createTextLayer({ name: "c" });
    const grouped = groupLayers([a, b, c], [a.id, b.id]);
    const result = ungroupLayers(grouped, (grouped.find((l) => l.kind === "group") as GroupLayer).id);
    expect(result.map((l) => l.name)).toEqual(["a", "b", "c"]);
  });

  it("is a no-op for an unknown group id", () => {
    const a = createTextLayer();
    expect(ungroupLayers([a], "missing")).toEqual([a]);
  });

  it("is a no-op if the id refers to a non-group layer", () => {
    const a = createTextLayer();
    expect(ungroupLayers([a], a.id)).toEqual([a]);
  });
});

describe("copyLayers / pasteLayers", () => {
  it("copyLayers returns deep copies with fresh ids, does not mutate the input", () => {
    const a = createTextLayer({ text: "hello" });
    const copies = copyLayers([a], [a.id]);
    expect(copies).toHaveLength(1);
    expect(copies[0].id).not.toBe(a.id);
    expect((copies[0] as typeof a).text).toBe("hello");
  });

  it("pasteLayers appends nudged fresh-id copies from the clipboard onto the layer array", () => {
    const a = createTextLayer({ x: 0.1, y: 0.1 });
    const clipboard = copyLayers([a], [a.id]);
    const result = pasteLayers([a], clipboard);
    expect(result).toHaveLength(2);
    expect(result[1].id).not.toBe(a.id);
    expect(result[1].id).not.toBe(clipboard[0].id); // paste re-freshens ids again, not reusing clipboard's
    expect(result[1].x).toBeCloseTo(0.12, 5);
    expect(result[1].y).toBeCloseTo(0.12, 5);
  });

  it("pasting twice in a row does not collide ids", () => {
    const a = createTextLayer();
    const clipboard = copyLayers([a], [a.id]);
    const once = pasteLayers([a], clipboard);
    const twice = pasteLayers(once, clipboard);
    const ids = twice.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/post/layers.test.ts`
Expected: FAIL — `groupLayers`/`ungroupLayers`/`copyLayers`/`pasteLayers` are not exported

- [ ] **Step 3: Write the implementation**

Add to `src/lib/post/layers.ts` (keep every existing export unchanged; these are pure additions):

```typescript
import type { GroupLayer } from "./types"; // add to the existing type-only import from "./types"

function boundingBoxOf(layers: PostLayer[]): { x: number; y: number; w: number; h: number } {
  const xs = layers.map((l) => l.x);
  const ys = layers.map((l) => l.y);
  const rights = layers.map((l) => l.x + l.w);
  const bottoms = layers.map((l) => l.y + l.h);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...rights) - x, h: Math.max(...bottoms) - y };
}

export function groupLayers(layers: PostLayer[], ids: string[]): PostLayer[] {
  const targets = layers.filter((l) => ids.includes(l.id));
  if (targets.length < 2) return layers;
  const box = boundingBoxOf(targets);
  const group: GroupLayer = {
    id: crypto.randomUUID(),
    kind: "group",
    childIds: targets.map((l) => l.id),
    ...box,
    rotation: 0,
    opacity: 1,
    locked: false,
    hidden: false,
  };
  // Insert at the frontmost (highest-index) grouped layer's original position, then drop the
  // grouped layers from their old positions — front-most-position insertion keeps the group from
  // visually jumping behind layers that weren't part of it.
  const targetIdSet = new Set(targets.map((l) => l.id));
  const frontmostIdx = Math.max(...layers.map((l, i) => (targetIdSet.has(l.id) ? i : -1)));
  const withoutTargets = layers.filter((l) => !targetIdSet.has(l.id));
  // Recompute the insertion index against the filtered array: count how many removed layers were
  // at or before frontmostIdx in the original array to shift the index correctly.
  const removedBeforeOrAt = layers.slice(0, frontmostIdx + 1).filter((l) => targetIdSet.has(l.id)).length;
  const insertAt = frontmostIdx + 1 - removedBeforeOrAt;
  return [...withoutTargets.slice(0, insertAt), group, ...withoutTargets.slice(insertAt)];
}

export function ungroupLayers(layers: PostLayer[], groupId: string): PostLayer[] {
  const idx = layers.findIndex((l) => l.id === groupId);
  if (idx === -1) return layers;
  const group = layers[idx];
  if (group.kind !== "group") return layers;
  const children = group.childIds
    .map((id) => layers.find((l) => l.id === id))
    .filter((l): l is PostLayer => l !== undefined);
  return [...layers.slice(0, idx), ...children, ...layers.slice(idx + 1)];
}

export function copyLayers(layers: PostLayer[], ids: string[]): PostLayer[] {
  return layers
    .filter((l) => ids.includes(l.id))
    .map((l) => ({ ...l, id: crypto.randomUUID() }) as PostLayer);
}

export function pasteLayers(layers: PostLayer[], clipboard: PostLayer[]): PostLayer[] {
  const pasted = clipboard.map(
    (l) => ({ ...l, id: crypto.randomUUID(), x: l.x + 0.02, y: l.y + 0.02 }) as PostLayer,
  );
  return [...layers, ...pasted];
}
```

> **Note:** `ungroupLayers`'s children come from looking them up BY ID in the current `layers` array
> (not from a stored copy inside the group), since `updateLayer`/`updateLayerLive` may have changed a
> child's own properties (position, style) while it was grouped — group membership only tracks
> which children belong, not a frozen snapshot of their state.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/post/layers.test.ts`
Expected: PASS (existing tests + 10 new tests, ~28 total)

- [ ] **Step 5: Commit**

```bash
git add src/lib/post/layers.ts src/lib/post/layers.test.ts
git commit -m "feat(post): add group/ungroup/copy/paste layer operations"
```

---

## Task 4: Alignment math

**Files:**
- Create: `src/lib/post/align.ts`
- Test: `src/lib/post/align.test.ts`

**Interfaces:**
- Consumes: `PostLayer`, `LayerBase` from `./types` (Task 2).
- Produces: `AlignMode = "left" | "center-h" | "right" | "top" | "center-v" | "bottom"`,
  `boundingBoxOf(layers: PostLayer[]): {x,y,w,h}` (re-exported here too — see note below on avoiding
  duplication with Task 3's private copy), `alignLayers(layers: PostLayer[], selectedIds: string[],
  mode: AlignMode): PostLayer[]` — computes the alignment TARGET box (the combined bounding box of
  the selected layers if 2+, else the canvas `{x:0,y:0,w:1,h:1}` if exactly 1), then repositions
  each selected layer's `x`/`y` per `mode` within that target box, returning the full updated
  `layers` array. Consumed by Task 6 (`use-post-editor.ts`) and Task 9 (context menu).

**DRY note:** Task 3 added a private `boundingBoxOf` inside `layers.ts`. Rather than duplicating it,
this task exports a public version from `align.ts` and Task 3's `layers.ts` should import it from
here instead of keeping its own copy — **when implementing this task, go back and delete
`layers.ts`'s private `boundingBoxOf`, replace its one call site with an import from `./align`, and
confirm `layers.test.ts` still passes unchanged** (this is a same-task cleanup, not a separate task,
since `align.ts` didn't exist yet when Task 3 was written).

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/post/align.test.ts
import { describe, it, expect } from "vitest";
import { boundingBoxOf, alignLayers, type AlignMode } from "./align";
import { createTextLayer } from "./layers";

describe("boundingBoxOf", () => {
  it("computes the combined bounding box of several layers", () => {
    const a = createTextLayer({ x: 0.1, y: 0.2, w: 0.2, h: 0.1 });
    const b = createTextLayer({ x: 0.5, y: 0.1, w: 0.1, h: 0.3 });
    expect(boundingBoxOf([a, b])).toEqual({ x: 0.1, y: 0.1, w: 0.5, h: 0.3 });
  });
});

describe("alignLayers", () => {
  const canvas = { x: 0, y: 0, w: 1, h: 1 };

  it("with a single selected layer, aligns to the CANVAS", () => {
    const a = createTextLayer({ x: 0.3, y: 0.3, w: 0.2, h: 0.1 });
    const result = alignLayers([a], [a.id], "left");
    expect(result[0].x).toBeCloseTo(canvas.x, 5);
    expect(result[0].y).toBe(a.y); // unaffected axis unchanged
  });

  it("'center-h' centers horizontally within the target box", () => {
    const a = createTextLayer({ x: 0.3, y: 0.3, w: 0.2, h: 0.1 });
    const result = alignLayers([a], [a.id], "center-h");
    expect(result[0].x).toBeCloseTo(0.4, 5); // (1 - 0.2) / 2
  });

  it("'right' aligns the layer's right edge to the target box's right edge", () => {
    const a = createTextLayer({ x: 0.3, y: 0.3, w: 0.2, h: 0.1 });
    const result = alignLayers([a], [a.id], "right");
    expect(result[0].x).toBeCloseTo(0.8, 5); // 1 - 0.2
  });

  it("'top' / 'center-v' / 'bottom' behave the same on the y axis", () => {
    const a = createTextLayer({ x: 0.3, y: 0.3, w: 0.2, h: 0.4 });
    expect(alignLayers([a], [a.id], "top")[0].y).toBeCloseTo(0, 5);
    expect(alignLayers([a], [a.id], "center-v")[0].y).toBeCloseTo(0.3, 5); // (1-0.4)/2
    expect(alignLayers([a], [a.id], "bottom")[0].y).toBeCloseTo(0.6, 5); // 1-0.4
  });

  it("with 2+ selected layers, aligns to their COMBINED bounding box, not the canvas", () => {
    const a = createTextLayer({ x: 0.1, y: 0.1, w: 0.1, h: 0.1 }); // box: x in [0.1,0.6]
    const b = createTextLayer({ x: 0.5, y: 0.1, w: 0.1, h: 0.1 });
    const c = createTextLayer({ x: 0.6, y: 0.4, w: 0.1, h: 0.1 }); // extends box to x=0.7
    const result = alignLayers([a, b, c], [a.id, b.id, c.id], "left");
    // combined box x = 0.1 (min of a.x, b.x, c.x)
    const resA = result.find((l) => l.id === a.id)!;
    expect(resA.x).toBeCloseTo(0.1, 5);
  });

  it("only repositions the selected layers, leaves others untouched", () => {
    const a = createTextLayer({ x: 0.3, y: 0.3 });
    const b = createTextLayer({ x: 0.5, y: 0.5 });
    const result = alignLayers([a, b], [a.id], "left");
    const resB = result.find((l) => l.id === b.id)!;
    expect(resB.x).toBe(b.x);
    expect(resB.y).toBe(b.y);
  });

  it("is a no-op for an empty selection", () => {
    const a = createTextLayer();
    expect(alignLayers([a], [], "left")).toEqual([a]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/post/align.test.ts`
Expected: FAIL — `Cannot find module './align'`

- [ ] **Step 3: Write `align.ts`**

```typescript
// src/lib/post/align.ts
import type { PostLayer } from "./types";
import { updateLayer } from "./layers";

export type AlignMode = "left" | "center-h" | "right" | "top" | "center-v" | "bottom";

export function boundingBoxOf(layers: PostLayer[]): { x: number; y: number; w: number; h: number } {
  const xs = layers.map((l) => l.x);
  const ys = layers.map((l) => l.y);
  const rights = layers.map((l) => l.x + l.w);
  const bottoms = layers.map((l) => l.y + l.h);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...rights) - x, h: Math.max(...bottoms) - y };
}

const CANVAS_BOX = { x: 0, y: 0, w: 1, h: 1 };

// Aligns every selected layer within a target box: the selection's own combined bounding box when
// 2+ layers are selected, or the canvas when exactly 1 is selected (post-editor-ux-v2-design.md §6).
export function alignLayers(layers: PostLayer[], selectedIds: string[], mode: AlignMode): PostLayer[] {
  if (selectedIds.length === 0) return layers;
  const selected = layers.filter((l) => selectedIds.includes(l.id));
  const target = selected.length >= 2 ? boundingBoxOf(selected) : CANVAS_BOX;

  return selected.reduce((acc, layer) => {
    let patch: Partial<PostLayer>;
    switch (mode) {
      case "left":
        patch = { x: target.x };
        break;
      case "center-h":
        patch = { x: target.x + (target.w - layer.w) / 2 };
        break;
      case "right":
        patch = { x: target.x + target.w - layer.w };
        break;
      case "top":
        patch = { y: target.y };
        break;
      case "center-v":
        patch = { y: target.y + (target.h - layer.h) / 2 };
        break;
      case "bottom":
        patch = { y: target.y + target.h - layer.h };
        break;
    }
    return updateLayer(acc, layer.id, patch);
  }, layers);
}
```

- [ ] **Step 4: Go back to `layers.ts` and remove the duplicated `boundingBoxOf`**

Per the DRY note above: delete the private `boundingBoxOf` function added in Task 3 from
`src/lib/post/layers.ts`, add `import { boundingBoxOf } from "./align";` to that file, and confirm
`groupLayers` still uses it correctly (same call site, just imported instead of local).

- [ ] **Step 5: Run both test files to verify everything still passes**

Run: `npx vitest run src/lib/post/align.test.ts src/lib/post/layers.test.ts`
Expected: PASS (align: 8 tests; layers: unchanged from Task 3)

- [ ] **Step 6: Commit**

```bash
git add src/lib/post/align.ts src/lib/post/align.test.ts src/lib/post/layers.ts
git commit -m "feat(post): add alignment math, dedupe boundingBoxOf into align.ts"
```

---

## Task 5: Natural-ratio-reset math

**Files:**
- Modify: `src/lib/post/image-fit.ts`
- Modify: `src/lib/post/image-fit.test.ts`

**Interfaces:**
- Consumes: nothing new (this file is already self-contained per the prior fix batch).
- Produces: `computeNaturalRatioReset(box: {x,y,w,h}, naturalW: number, naturalH: number): {x,y,w,h}`
  — recomputes a box back to the image's natural aspect ratio, keeping the box's CENTER point fixed
  and keeping the LARGER of the box's current `w`/`h` unchanged (so resetting a squashed-wide image
  doesn't also shrink it down to a tiny thumbnail — it un-stretches around whichever dimension was
  less distorted). Consumed by Task 12 (`post-inspector-image.tsx`'s reset button).

- [ ] **Step 1: Write the failing test**

Add to `src/lib/post/image-fit.test.ts` (new `describe` block; existing tests untouched):

```typescript
import { computeNaturalRatioReset } from "./image-fit"; // add to existing imports

describe("computeNaturalRatioReset", () => {
  it("recomputes height from width when width is the larger/dominant dimension", () => {
    // natural image is 2:1 (e.g. 1000x500); box is currently squashed to 0.4 wide, 0.4 tall (1:1)
    const box = { x: 0.1, y: 0.1, w: 0.4, h: 0.4 };
    const result = computeNaturalRatioReset(box, 1000, 500);
    expect(result.w).toBeCloseTo(0.4, 5); // width (the larger current dimension) stays
    expect(result.h).toBeCloseTo(0.2, 5); // height recomputed: 0.4 * (500/1000)
  });

  it("recomputes width from height when height is the larger/dominant dimension", () => {
    // natural image is 1:2 (portrait, e.g. 500x1000); box is currently 0.4 x 0.4
    const box = { x: 0.1, y: 0.1, w: 0.4, h: 0.4 };
    const result = computeNaturalRatioReset(box, 500, 1000);
    expect(result.h).toBeCloseTo(0.4, 5);
    expect(result.w).toBeCloseTo(0.2, 5);
  });

  it("keeps the box's CENTER point fixed, not its top-left corner", () => {
    const box = { x: 0.1, y: 0.1, w: 0.4, h: 0.4 };
    const centerX = box.x + box.w / 2;
    const centerY = box.y + box.h / 2;
    const result = computeNaturalRatioReset(box, 1000, 500); // -> w:0.4, h:0.2
    expect(result.x + result.w / 2).toBeCloseTo(centerX, 5);
    expect(result.y + result.h / 2).toBeCloseTo(centerY, 5);
  });

  it("is a no-op (returns the same box) when the box already matches the natural ratio", () => {
    const box = { x: 0.2, y: 0.2, w: 0.4, h: 0.2 }; // already 2:1
    const result = computeNaturalRatioReset(box, 1000, 500);
    expect(result.w).toBeCloseTo(0.4, 5);
    expect(result.h).toBeCloseTo(0.2, 5);
    expect(result.x).toBeCloseTo(0.2, 5);
    expect(result.y).toBeCloseTo(0.2, 5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/post/image-fit.test.ts`
Expected: FAIL — `computeNaturalRatioReset` is not exported

- [ ] **Step 3: Write the implementation**

Add to `src/lib/post/image-fit.ts`:

```typescript
export function computeNaturalRatioReset(
  box: { x: number; y: number; w: number; h: number },
  naturalW: number,
  naturalH: number,
): { x: number; y: number; w: number; h: number } {
  const naturalRatio = naturalW / naturalH; // width/height
  const centerX = box.x + box.w / 2;
  const centerY = box.y + box.h / 2;

  let w: number;
  let h: number;
  if (box.w >= box.h) {
    w = box.w;
    h = w / naturalRatio;
  } else {
    h = box.h;
    w = h * naturalRatio;
  }

  return { x: centerX - w / 2, y: centerY - h / 2, w, h };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/post/image-fit.test.ts`
Expected: PASS (existing tests + 4 new tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/post/image-fit.ts src/lib/post/image-fit.test.ts
git commit -m "feat(post): add natural-aspect-ratio-reset math for image layers"
```

---

## Task 6: `use-post-editor` — multi-select, group/ungroup/copy/paste/align, debounced save

**Not unit-tested** (React hook, same convention as the original Task 11).

**Files:**
- Modify: `src/hooks/use-post-editor.ts`
- Create: `src/hooks/use-debounced-callback.ts`

**Interfaces:**
- Consumes: `groupLayers`/`ungroupLayers`/`copyLayers`/`pasteLayers` from `@/lib/post/layers`
  (Task 3); `alignLayers`, `AlignMode` from `@/lib/post/align` (Task 4); `createDebounced` from
  `@/lib/debounce` (Task 1).
- Produces: `usePostEditor` now takes an OPTIONAL third param, `onChangeDelayMs = 2000`, and its
  returned object CHANGES shape:
  - `selectedId: string | null` → **removed**, replaced by `selectedIds: string[]`.
  - `selectLayer(id: string | null)` → now replaces the whole selection with `[id]` (or `[]` if
    `null`).
  - NEW: `toggleLayerSelection(id: string)` — adds/removes `id` from `selectedIds` (shift-click).
  - NEW: `selectMany(ids: string[])` — replaces the whole selection (rubber-band select finishing).
  - NEW: `group()` — calls `groupLayers(layers, selectedIds)`, commits, selects the new group (no-op
    if `selectedIds.length < 2`).
  - NEW: `ungroup()` — if exactly one selected layer is a `GroupLayer`, calls `ungroupLayers`,
    commits, selects the former `childIds`.
  - NEW: `copySelection()` — stores `copyLayers(layers, selectedIds)` into a `clipboardRef` (module-
    or hook-local ref, no OS clipboard).
  - NEW: `pasteClipboard()` — calls `pasteLayers(layers, clipboardRef.current)`, commits, selects the
    newly pasted layers' ids.
  - NEW: `align(mode: AlignMode)` — calls `alignLayers(layers, selectedIds, mode)`, commits.
  - `deleteLayer`/`toggleLock`/`toggleHidden` now operate over the WHOLE `selectedIds` array (not a
    single id) where it makes sense for multi-select — see Step 3 below for exact per-action
    behavior.

- [ ] **Step 1: Write `use-debounced-callback.ts`**

```typescript
// src/hooks/use-debounced-callback.ts
"use client";

import { useEffect, useRef } from "react";
import { createDebounced } from "@/lib/debounce";

// Thin React wrapper over the pure createDebounced factory (Task 1) — always calls the LATEST
// callback (via a ref updated every render, same always-current pattern use-post-editor.ts's
// onChangeRef already established), and flushes any pending call on unmount so an in-flight edit
// isn't lost if the focus view closes right after a keystroke.
export function useDebouncedCallback<A extends unknown[]>(
  fn: (...args: A) => void,
  delayMs: number,
): (...args: A) => void {
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const debouncedRef = useRef<ReturnType<typeof createDebounced<A>> | null>(null);
  if (!debouncedRef.current) {
    debouncedRef.current = createDebounced<A>((...args) => fnRef.current(...args), delayMs);
  }

  useEffect(() => {
    const debounced = debouncedRef.current;
    return () => debounced?.flush();
  }, []);

  return (...args: A) => debouncedRef.current?.call(...args);
}
```

- [ ] **Step 2: Read the CURRENT `use-post-editor.ts` in full before editing**

This file has been modified by fix rounds since it was first written — read it fresh from disk, do
not assume any prior version's exact line numbers.

- [ ] **Step 3: Rewrite `use-post-editor.ts`**

Replace the whole file with:

```typescript
// src/hooks/use-post-editor.ts
"use client";

import { useCallback, useRef, useState } from "react";
import type { PostLayer, ImageSource, IconSource } from "@/lib/post/types";
import {
  createTextLayer, createShapeLayer, createImageLayer, createIconLayer,
  addLayer, removeLayer, updateLayer, duplicateLayer as duplicateLayerPure,
  reorderLayer, toggleLock as toggleLockPure, toggleHidden as toggleHiddenPure,
  groupLayers, ungroupLayers, copyLayers, pasteLayers,
  type ReorderDirection,
} from "@/lib/post/layers";
import { alignLayers, type AlignMode } from "@/lib/post/align";
import {
  createHistory, commit as commitHistory, undo as undoHistory, redo as redoHistory,
  canUndo as canUndoHistory, canRedo as canRedoHistory, type History,
} from "@/lib/post/history";
import { useDebouncedCallback } from "./use-debounced-callback";

export function usePostEditor(
  initialLayers: PostLayer[],
  onChange: (layers: PostLayer[]) => void,
  onChangeDelayMs = 2000,
) {
  const [history, setHistory] = useState<History<PostLayer[]>>(() => createHistory(initialLayers));
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const liveLayersRef = useRef<PostLayer[] | null>(null);
  const clipboardRef = useRef<PostLayer[]>([]);
  const [, forceRender] = useState(0);

  const layers = liveLayersRef.current ?? history.present;

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  // The outer persistence write (-> onPatch -> updateNodeData -> canvas store -> autosave) is the
  // expensive part, not local editing (the stage renders off `layers` above, not off a round-trip
  // through the parent) — debounce ONLY this outer notification, so rapid edits (typing, dragging a
  // color picker) collapse into one write instead of one per keystroke.
  const debouncedOnChange = useDebouncedCallback((next: PostLayer[]) => onChangeRef.current(next), onChangeDelayMs);

  function applyCommitted(next: PostLayer[]) {
    setHistory((h) => commitHistory(h, next));
    debouncedOnChange(next);
  }

  const selectLayer = useCallback((id: string | null) => setSelectedIds(id ? [id] : []), []);

  const toggleLayerSelection = useCallback((id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }, []);

  const selectMany = useCallback((ids: string[]) => setSelectedIds(ids), []);

  const addText = useCallback(() => {
    const layer = createTextLayer();
    applyCommitted(addLayer(history.present, layer));
    setSelectedIds([layer.id]);
  }, [history.present]);

  const addShape = useCallback(() => {
    const layer = createShapeLayer();
    applyCommitted(addLayer(history.present, layer));
    setSelectedIds([layer.id]);
  }, [history.present]);

  const addImage = useCallback((src: ImageSource, overrides?: Partial<PostLayer>) => {
    const layer = createImageLayer(src, overrides);
    applyCommitted(addLayer(history.present, layer));
    setSelectedIds([layer.id]);
  }, [history.present]);

  const addIcon = useCallback((src: IconSource) => {
    const layer = createIconLayer(src);
    applyCommitted(addLayer(history.present, layer));
    setSelectedIds([layer.id]);
  }, [history.present]);

  const updateLayerLive = useCallback((id: string, patch: Partial<PostLayer>) => {
    const base = liveLayersRef.current ?? history.present;
    liveLayersRef.current = updateLayer(base, id, patch);
    forceRender((n) => n + 1);
  }, [history.present]);

  const commitLayerChange = useCallback(() => {
    if (!liveLayersRef.current) return;
    const next = liveLayersRef.current;
    liveLayersRef.current = null;
    applyCommitted(next);
  }, [history.present]);

  // Deleting the whole current selection (one action = one undo step, matching every other
  // discrete action in this hook) — replaces the old single-id deleteLayer.
  const deleteSelection = useCallback(() => {
    const next = selectedIds.reduce((acc, id) => removeLayer(acc, id), history.present);
    applyCommitted(next);
    setSelectedIds([]);
  }, [history.present, selectedIds]);

  const duplicateSelection = useCallback(() => {
    let next = history.present;
    const newIds: string[] = [];
    for (const id of selectedIds) {
      const before = new Set(next.map((l) => l.id));
      next = duplicateLayerPure(next, id);
      const added = next.find((l) => !before.has(l.id));
      if (added) newIds.push(added.id);
    }
    applyCommitted(next);
    if (newIds.length) setSelectedIds(newIds);
  }, [history.present, selectedIds]);

  const reorder = useCallback((id: string, direction: ReorderDirection) => {
    applyCommitted(reorderLayer(history.present, id, direction));
  }, [history.present]);

  const toggleLock = useCallback((id: string) => {
    applyCommitted(toggleLockPure(history.present, id));
  }, [history.present]);

  const toggleHidden = useCallback((id: string) => {
    applyCommitted(toggleHiddenPure(history.present, id));
  }, [history.present]);

  const group = useCallback(() => {
    if (selectedIds.length < 2) return;
    const before = new Set(history.present.map((l) => l.id));
    const next = groupLayers(history.present, selectedIds);
    const created = next.find((l) => !before.has(l.id));
    applyCommitted(next);
    if (created) setSelectedIds([created.id]);
  }, [history.present, selectedIds]);

  const ungroup = useCallback(() => {
    if (selectedIds.length !== 1) return;
    const target = history.present.find((l) => l.id === selectedIds[0]);
    if (!target || target.kind !== "group") return;
    const childIds = target.childIds;
    applyCommitted(ungroupLayers(history.present, target.id));
    setSelectedIds(childIds);
  }, [history.present, selectedIds]);

  const copySelection = useCallback(() => {
    clipboardRef.current = copyLayers(history.present, selectedIds);
  }, [history.present, selectedIds]);

  const pasteClipboard = useCallback(() => {
    if (clipboardRef.current.length === 0) return;
    const before = new Set(history.present.map((l) => l.id));
    const next = pasteLayers(history.present, clipboardRef.current);
    const pastedIds = next.filter((l) => !before.has(l.id)).map((l) => l.id);
    applyCommitted(next);
    setSelectedIds(pastedIds);
  }, [history.present]);

  const align = useCallback((mode: AlignMode) => {
    applyCommitted(alignLayers(history.present, selectedIds, mode));
  }, [history.present, selectedIds]);

  const undo = useCallback(() => {
    setHistory((h) => {
      const next = undoHistory(h);
      debouncedOnChange(next.present);
      return next;
    });
  }, [debouncedOnChange]);

  const redo = useCallback(() => {
    setHistory((h) => {
      const next = redoHistory(h);
      debouncedOnChange(next.present);
      return next;
    });
  }, [debouncedOnChange]);

  // Template seeding / any other full-array replacement (Task 15's handlePickTemplate) routes
  // through here so it lands in history + onChange like every other action, rather than being
  // written around the hook entirely.
  const replaceAllLayers = useCallback((next: PostLayer[]) => {
    applyCommitted(next);
    setSelectedIds([]);
  }, [history.present]);

  return {
    layers,
    selectedIds,
    selectLayer,
    toggleLayerSelection,
    selectMany,
    addText,
    addShape,
    addImage,
    addIcon,
    updateLayerLive,
    commitLayerChange,
    replaceAllLayers,
    deleteSelection,
    duplicateSelection,
    reorder,
    toggleLock,
    toggleHidden,
    group,
    ungroup,
    copySelection,
    pasteClipboard,
    align,
    undo,
    redo,
    canUndo: canUndoHistory(history),
    canRedo: canRedoHistory(history),
  };
}
```

> **Note on `undo`/`redo`'s `nextPresent` pattern:** the prior fix batch's version of this hook used
> an outer `let nextPresent` variable assigned inside the `setHistory` updater to read the result
> synchronously afterward (to keep the updater itself pure, per an earlier review finding). Preserve
> that exact pattern here — the code above shows the simplified shape for readability; when actually
> writing the file, keep the "pure updater + separate `onChangeRef`/`debouncedOnChange` call outside
> `setHistory`" structure the current file already has, just swap the direct `onChangeRef.current`
> call for `debouncedOnChange`.

- [ ] **Step 4: Update every consumer of the renamed/removed exports**

`selectedId`/`deleteLayer`/`duplicateLayer` (as returned by the hook) no longer exist —
`selectedIds`/`deleteSelection`/`duplicateSelection` replace them. **Do not fix call sites in this
task** — Tasks 8 and 15 (which touch `post-stage.tsx` and `post-focus-view.tsx`, the hook's only
consumers) update their call sites as part of their own work. Run `npx tsc --noEmit` now anyway to
get a full list of what those tasks need to fix, and note it in your report, but leave those files
unchanged in this task — confirm via `git diff` you only touched `use-post-editor.ts` and the new
`use-debounced-callback.ts` before committing.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/use-post-editor.ts src/hooks/use-debounced-callback.ts
git commit -m "feat(post): multi-select, group/ungroup/copy/paste/align, debounced save in use-post-editor"
```

---

## Task 7: Render `GroupLayer`

**Files:**
- Create: `src/components/nodes/post-group-layer.tsx`
- Modify: `src/components/nodes/post-layer-render.tsx`

**Interfaces:**
- Consumes: `GroupLayer` from `@/lib/post/types` (Task 2); `layerToKonvaProps` from
  `@/lib/post/layer-konva-props` (unchanged from the original plan).
- Produces: `PostGroupLayer({ layer, containerW, containerH, allLayers, isSelected,
  resolveNodeImageUrl, nodeRef, onSelect, onDragEnd, onDblClickText }): JSX.Element` — renders a
  Konva `Group` positioned/sized via the SAME `layerToKonvaProps` every other layer kind uses, with
  each of the group's `childIds` rendered inside it via `PostLayerRender` recursively (children are
  NOT independently selectable/draggable while inside a closed group in this pass — clicking a child
  selects the group; a future pass could add double-click-to-enter-group, out of scope here).
  `post-layer-render.tsx`'s dispatcher gets a `"group"` case.

- [ ] **Step 1: Write `post-group-layer.tsx`**

```typescript
// src/components/nodes/post-group-layer.tsx
"use client";

import { Group } from "react-konva";
import type Konva from "konva";
import type { GroupLayer, PostLayer } from "@/lib/post/types";
import { layerToKonvaProps } from "@/lib/post/layer-konva-props";
import { PostLayerRender } from "./post-layer-render";

type Props = {
  layer: GroupLayer;
  containerW: number;
  containerH: number;
  allLayers: PostLayer[]; // to resolve childIds -> actual layer objects
  isSelected: boolean;
  resolveNodeImageUrl: (nodeId: string) => string | undefined;
  nodeRef: (node: Konva.Node | null) => void;
  nodeProps: Konva.NodeConfig;
};

// Children keep their OWN absolute (canvas-space) x/y/w/h — same normalized space every layer
// already uses — so they render correctly whether or not they're inside a group. The Group's own
// x/y/rotation transform (from layerToKonvaProps) then moves/rotates the whole cluster together;
// Konva's own nested-transform math handles the rest, no relative-coordinate system needed here.
export function PostGroupLayer({
  layer, containerW, containerH, allLayers, resolveNodeImageUrl, nodeRef, nodeProps,
}: Props) {
  const geo = layerToKonvaProps(layer, containerW, containerH);
  const children = layer.childIds
    .map((id) => allLayers.find((l) => l.id === id))
    .filter((l): l is PostLayer => l !== undefined);

  return (
    <Group ref={nodeRef} {...geo} {...nodeProps}>
      {children.map((child) => (
        <PostLayerRender
          key={child.id}
          layer={child}
          containerW={containerW}
          containerH={containerH}
          isSelected={false}
          resolveNodeImageUrl={resolveNodeImageUrl}
          nodeRef={() => {}} // children inside a closed group aren't individually tracked/selectable
          onSelect={() => {}}
          onDragEnd={() => {}}
          onDblClickText={() => {}}
        />
      ))}
    </Group>
  );
}
```

> **Geometry note:** because the Group itself already has `x`/`y` from `layerToKonvaProps` (the
> group's own absolute position) AND each child ALSO renders at its own absolute `x`/`y` via its own
> `layerToKonvaProps` call inside `PostLayerRender`, a naive nesting would double-apply the
> position (group offset + child's already-absolute position). **When implementing, verify this
> against Konva's actual nested-Group behavior** (a child's `x`/`y` inside a `<Group x={...} y={...}>`
> is interpreted as relative to the GROUP's origin, not the stage's) — if children render offset
> incorrectly (double-shifted), the fix is to render the Group itself at `{x: 0, y: 0}` (no position
> of its own beyond rotation/opacity) and let children's own absolute coordinates place them
> correctly, applying the GROUP's rotation/opacity but not its x/y translation — OR, alternatively,
> subtract the group's own x/y from each child's rendered position so the double-application cancels
> out. Resolve this with a concrete, verified-correct choice (check Konva's docs/source on nested
> Group coordinate spaces — `node_modules/konva`) rather than guessing; note which approach you used
> and why in your report, since this is the one piece of genuinely new geometry in this task.

- [ ] **Step 2: Add the `"group"` case to `post-layer-render.tsx`**

Read the current file first, then add a branch (order relative to the other kind-checks doesn't
matter, but keep it consistent with the existing if-chain style) that renders `PostGroupLayer` when
`layer.kind === "group"`, passing `allLayers` (this task ADDS a new required prop, `allLayers:
PostLayer[]`, to `PostLayerRender`'s own `Props` — thread it through from `post-stage.tsx` in
Task 8, which is the only caller).

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: errors in `post-stage.tsx` (doesn't yet pass the new `allLayers` prop) — expected and fixed
in Task 8; confirm no OTHER unexpected errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/nodes/post-group-layer.tsx src/components/nodes/post-layer-render.tsx
git commit -m "feat(post): render GroupLayer as a nested Konva Group"
```

---

## Task 8: Multi-select stage — rubber-band select, multi-node Transformer, free resize by default

**Files:**
- Modify: `src/components/nodes/post-stage.tsx`

**Interfaces:**
- Consumes: `usePostEditor`'s new shape (Task 6): `selectedIds`, `toggleLayerSelection`,
  `selectMany`. `PostLayerRender`'s new `allLayers` prop (Task 7).
- Produces: `PostStage`'s `Props` change: `selectedId: string | null` → `selectedIds: string[]`,
  `onSelect: (id) => void` → keep for a plain click but ADD `onToggleSelect: (id: string) => void`
  (shift-click) and `onSelectMany: (ids: string[]) => void` (rubber-band finish). Consumed by
  Task 15 (`post-focus-view.tsx`).

- [ ] **Step 1: Read the current `post-stage.tsx` in full before editing**

This file was modified in the original plan's Task 13B and again in the final-review fix batch
(useLayoutEffect for the Transformer sync) — read it fresh.

- [ ] **Step 2: Update the Transformer for multi-select and free-resize-by-default**

The `<Transformer>` element's sync `useLayoutEffect` currently resolves ONE node from `selectedId`.
Change it to resolve an ARRAY of nodes from `selectedIds`:

```typescript
useLayoutEffect(() => {
  const transformer = transformerRef.current;
  if (!transformer) return;
  const nodes = selectedIds
    .map((id) => nodeRefs.current.get(id))
    .filter((n): n is Konva.Node => n !== undefined);
  transformer.nodes(nodes);
  transformer.getLayer()?.batchDraw();
}, [selectedIds, layers]);
```

Add `keepRatio={false}` to the `<Transformer>` JSX (per this plan's Global Constraints — the library
default is `true`, which currently locks EVERY resize; explicitly overriding to `false` makes resize
free by default). Do not set `shiftBehavior` — its default (`'default'`) already produces
`keepProportion = keepRatio || event.shiftKey`, i.e. free resize normally, Shift locks it, which is
exactly the target behavior.

`commitNodeGeometry` needs to become multi-node aware — when the Transformer has multiple nodes
attached, `onTransformEnd` fires once per transformed node (Konva's own behavior — each node in a
multi-select Transformer gets its own `transformend` event), so the EXISTING single-node
`commitNodeGeometry(id, node)` logic is still correct per-call; only the code that RESOLVES `id` from
`node` needs to keep working for whichever node in the map matches — no change needed there since it
already does a reverse-lookup through `nodeRefs.current.entries()`.

- [ ] **Step 3: Add rubber-band (drag-select) support**

Add local state `const [selectionRect, setSelectionRect] = useState<{x:number;y:number;w:number;h:number} | null>(null)` and pointer handlers on the `<Stage>`:

```typescript
const dragStartRef = useRef<{ x: number; y: number } | null>(null);

function handleStageMouseDown(e: Konva.KonvaEventObject<MouseEvent>) {
  if (e.target !== e.target.getStage()) return; // clicked a layer, not empty space
  const stage = e.target.getStage();
  const pos = stage?.getPointerPosition();
  if (!pos) return;
  dragStartRef.current = pos;
  setSelectionRect({ x: pos.x, y: pos.y, w: 0, h: 0 });
  onSelect(null);
}

function handleStageMouseMove(e: Konva.KonvaEventObject<MouseEvent>) {
  if (!dragStartRef.current) return;
  const stage = e.target.getStage();
  const pos = stage?.getPointerPosition();
  if (!pos) return;
  const start = dragStartRef.current;
  setSelectionRect({
    x: Math.min(start.x, pos.x), y: Math.min(start.y, pos.y),
    w: Math.abs(pos.x - start.x), h: Math.abs(pos.y - start.y),
  });
}

function handleStageMouseUp() {
  if (!dragStartRef.current || !selectionRect) {
    dragStartRef.current = null;
    setSelectionRect(null);
    return;
  }
  if (selectionRect.w > 4 || selectionRect.h > 4) { // ignore accidental tiny drags (= a click)
    const hitIds = layers
      .filter((l) => !l.hidden && !l.locked)
      .filter((l) => {
        const lx = l.x * containerW, ly = l.y * containerH, lw = l.w * containerW, lh = l.h * containerH;
        return (
          lx < selectionRect.x + selectionRect.w && lx + lw > selectionRect.x &&
          ly < selectionRect.y + selectionRect.h && ly + lh > selectionRect.y
        );
      })
      .map((l) => l.id);
    if (hitIds.length) onSelectMany(hitIds);
  }
  dragStartRef.current = null;
  setSelectionRect(null);
}
```

Wire these onto `<Stage onMouseDown={handleStageMouseDown} onMouseMove={handleStageMouseMove}
onMouseUp={handleStageMouseUp} ...>` (replacing the existing bare `onClick={(e) => {...}}` — fold its
"clicked empty stage -> deselect" behavior into `handleStageMouseDown` above, which already does
`onSelect(null)` on empty-space mousedown; a plain click with no drag is just a mousedown+mouseup
with `w`/`h` staying near 0, which correctly does nothing extra since the `> 4` guard skips
`onSelectMany` for that case). Render the rubber-band rect INSIDE the `<Layer>`, after the layers
map, before the `<Transformer>`:

```tsx
{selectionRect && (
  <Rect
    x={selectionRect.x} y={selectionRect.y} width={selectionRect.w} height={selectionRect.h}
    fill="rgba(88,41,199,0.08)" stroke="#5829c7" strokeWidth={1} dash={[4, 4]} listening={false}
  />
)}
```

(Import `Rect` from `react-konva` alongside the existing `Stage`, `Layer`, `Transformer` imports.)

- [ ] **Step 4: Wire shift-click and per-layer selection**

Each layer's `onSelect` callback (passed into `PostLayerRender`) needs to become shift-aware.
`PostLayerRender`'s `nodeProps.onClick`/`onTap` currently just calls the passed `onSelect` directly
— change `post-stage.tsx`'s per-layer `onSelect={() => !layer.locked && onSelect(layer.id)}` call
site to inspect the Konva event's underlying native event for the shift key:

```typescript
onSelect={(evt?: Konva.KonvaEventObject<MouseEvent>) => {
  if (layer.locked) return;
  if (evt?.evt.shiftKey) onToggleSelect(layer.id);
  else onSelect(layer.id);
}}
```

(This requires `PostLayerRender`'s `onSelect` prop type to accept the event — check its current
signature; if it's currently a bare `() => void`, widen it to `(evt?: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => void`
and pass the event through from each leaf layer component's own `onClick={onSelect}`/`onTap={onSelect}`
wiring, since Konva's `onClick`/`onTap` handlers already receive the event as their first argument —
this is a small, mechanical prop-type widening, not new logic.)

- [ ] **Step 5: Update `Props` and pass `allLayers` to every `PostLayerRender`/`PostGroupLayer` call**

```typescript
type Props = {
  layers: PostLayer[]; containerW: number; containerH: number;
  selectedIds: string[];
  onSelect: (id: string | null) => void;
  onToggleSelect: (id: string) => void;
  onSelectMany: (ids: string[]) => void;
  resolveNodeImageUrl: (nodeId: string) => string | undefined;
  updateLayerLive: (id: string, patch: Partial<PostLayer>) => void;
  commitLayerChange: () => void;
  stageRef: React.RefObject<Konva.Stage | null>;
  onCommitText: (id: string, text: string) => void;
};
```

Every `isSelected={selectedId === layer.id}` becomes `isSelected={selectedIds.includes(layer.id)}`.
Every `PostLayerRender`/new `PostGroupLayer` call passes `allLayers={layers}` (needed by
`PostGroupLayer` per Task 7; harmless to pass to the other kinds even if they ignore it — or, cleaner,
only add `allLayers` to `PostGroupLayer`'s own render branch inside `post-layer-render.tsx`'s
dispatcher, not to every leaf component's props — your call on which is tidier, but keep it
consistent with how `post-layer-render.tsx`'s dispatcher already threads props through in Task 7).

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: errors remaining only in `post-focus-view.tsx` (not yet updated to match — fixed in
Task 15). Confirm no errors in `post-stage.tsx`, `post-layer-render.tsx`, or `post-group-layer.tsx`.

- [ ] **Step 7: Commit**

```bash
git add src/components/nodes/post-stage.tsx
git commit -m "feat(post): multi-select (shift-click + rubber-band) and free-resize-by-default"
```

---

## Task 9: Layer right-click context menu

**Not unit-tested.**

**Files:**
- Create: `src/components/nodes/post-layer-context-menu.tsx`

**Interfaces:**
- Consumes: `ContextMenu`/`ContextMenuTrigger`/`ContextMenuContent`/`ContextMenuItem`/
  `ContextMenuSeparator`/`ContextMenuSub`/`ContextMenuSubTrigger`/`ContextMenuSubContent` from
  `@/components/ui/context-menu` (confirmed to exist with this exact export set). `AlignMode` from
  `@/lib/post/align`.
- Produces: `PostLayerContextMenu({ children, hasSelection, canGroup, canUngroup, onCut, onCopy,
  onPaste, canPaste, onDuplicate, onDelete, onToggleLock, isLocked, onReorder, onGroup, onUngroup,
  onAlign }): JSX.Element` — wraps `children` (the Konva stage's container, or per-layer — see
  integration note below) the same way `NodeContextMenu` wraps a node card, following that file's
  exact structural pattern (`ContextMenu` → `ContextMenuTrigger` → `ContextMenuContent`).

**Integration note (resolve when implementing, not fully prescribed here):** Konva shapes render to
a single `<canvas>` element, not individual DOM nodes — a native `contextmenu`/right-click on a
SPECIFIC layer needs to be captured via Konva's own `onContextMenu` event on each shape (react-konva
supports this — it's part of `KonvaNodeEvents`, already imported in `post-layer-render.tsx`'s
`nodeProps` type), which then needs to trigger a shadcn `ContextMenu` that isn't naturally
"wrapping" a Konva node (since Konva nodes aren't DOM elements a React context-menu trigger can
wrap). The practical approach: capture the Konva `onContextMenu` event's screen coordinates
(`evt.evt.clientX/clientY`), `evt.evt.preventDefault()` to suppress the browser's native menu, and
render this component's `ContextMenu`/`ContextMenuContent` in a CONTROLLED, imperatively-positioned
mode (Base UI's `ContextMenu` — check `context-menu.tsx`'s actual props for a controlled
`open`/`onOpenChange` plus a way to position at arbitrary coordinates rather than at a trigger
element's location; if Base UI's context menu doesn't support fully-controlled arbitrary
positioning, a `DropdownMenu` positioned via a 0-size trigger placed at the click coordinates, opened
programmatically, is an acceptable fallback — check `src/components/ui/dropdown-menu.tsx` if it
exists). Resolve this concretely against the actual installed component APIs rather than guessing;
document the approach taken in your report.

- [ ] **Step 1: Write `post-layer-context-menu.tsx`**

```typescript
// src/components/nodes/post-layer-context-menu.tsx
"use client";

import {
  ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem, ContextMenuSeparator,
  ContextMenuSub, ContextMenuSubTrigger, ContextMenuSubContent,
} from "@/components/ui/context-menu";
import {
  Scissors, Copy, Clipboard, CopyPlus, Trash2, Lock, Unlock,
  BringToFront, SendToBack, ChevronUp, ChevronDown, Group as GroupIcon, Ungroup,
  AlignStartVertical, AlignCenterVertical, AlignEndVertical,
  AlignStartHorizontal, AlignCenterHorizontal, AlignEndHorizontal,
} from "lucide-react";
import type { AlignMode } from "@/lib/post/align";

type Props = {
  children: React.ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  position: { x: number; y: number } | null;
  hasSelection: boolean;
  canGroup: boolean;
  canUngroup: boolean;
  canPaste: boolean;
  isLocked: boolean;
  onCut: () => void;
  onCopy: () => void;
  onPaste: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onToggleLock: () => void;
  onReorder: (direction: "front" | "forward" | "backward" | "back") => void;
  onGroup: () => void;
  onUngroup: () => void;
  onAlign: (mode: AlignMode) => void;
};

// Follows node-context-menu.tsx's exact structural pattern (ContextMenu -> ContextMenuTrigger ->
// ContextMenuContent), adapted for a Konva stage's canvas-level right-click (see the plan's
// integration note on positioning, since Konva shapes aren't individual DOM nodes a trigger can
// wrap the way NodeContextMenu wraps a real node card).
export function PostLayerContextMenu({
  children, open, onOpenChange, hasSelection, canGroup, canUngroup, canPaste, isLocked,
  onCut, onCopy, onPaste, onDuplicate, onDelete, onToggleLock, onReorder, onGroup, onUngroup, onAlign,
}: Props) {
  return (
    <ContextMenu open={open} onOpenChange={onOpenChange}>
      <ContextMenuTrigger>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-52">
        <ContextMenuItem disabled={!hasSelection} onClick={onCut}>
          <Scissors className="mr-2 size-3.5" strokeWidth={1.5} /> Cut
        </ContextMenuItem>
        <ContextMenuItem disabled={!hasSelection} onClick={onCopy}>
          <Copy className="mr-2 size-3.5" strokeWidth={1.5} /> Copy
        </ContextMenuItem>
        <ContextMenuItem disabled={!canPaste} onClick={onPaste}>
          <Clipboard className="mr-2 size-3.5" strokeWidth={1.5} /> Paste
        </ContextMenuItem>
        <ContextMenuItem disabled={!hasSelection} onClick={onDuplicate}>
          <CopyPlus className="mr-2 size-3.5" strokeWidth={1.5} /> Duplicate
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem disabled={!hasSelection} onClick={onToggleLock}>
          {isLocked
            ? <Unlock className="mr-2 size-3.5" strokeWidth={1.5} />
            : <Lock className="mr-2 size-3.5" strokeWidth={1.5} />}
          {isLocked ? "Unlock" : "Lock"}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem disabled={!hasSelection} onClick={() => onReorder("front")}>
          <BringToFront className="mr-2 size-3.5" strokeWidth={1.5} /> Bring to front
        </ContextMenuItem>
        <ContextMenuItem disabled={!hasSelection} onClick={() => onReorder("forward")}>
          <ChevronUp className="mr-2 size-3.5" strokeWidth={1.5} /> Bring forward
        </ContextMenuItem>
        <ContextMenuItem disabled={!hasSelection} onClick={() => onReorder("backward")}>
          <ChevronDown className="mr-2 size-3.5" strokeWidth={1.5} /> Send backward
        </ContextMenuItem>
        <ContextMenuItem disabled={!hasSelection} onClick={() => onReorder("back")}>
          <SendToBack className="mr-2 size-3.5" strokeWidth={1.5} /> Send to back
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem disabled={!canGroup} onClick={onGroup}>
          <GroupIcon className="mr-2 size-3.5" strokeWidth={1.5} /> Group
        </ContextMenuItem>
        <ContextMenuItem disabled={!canUngroup} onClick={onUngroup}>
          <Ungroup className="mr-2 size-3.5" strokeWidth={1.5} /> Ungroup
        </ContextMenuItem>
        <ContextMenuSub>
          <ContextMenuSubTrigger className={!hasSelection ? "pointer-events-none opacity-50" : undefined}>
            Align
          </ContextMenuSubTrigger>
          <ContextMenuSubContent>
            <ContextMenuItem onClick={() => onAlign("left")}>
              <AlignStartVertical className="mr-2 size-3.5" strokeWidth={1.5} /> Left
            </ContextMenuItem>
            <ContextMenuItem onClick={() => onAlign("center-h")}>
              <AlignCenterVertical className="mr-2 size-3.5" strokeWidth={1.5} /> Center horizontal
            </ContextMenuItem>
            <ContextMenuItem onClick={() => onAlign("right")}>
              <AlignEndVertical className="mr-2 size-3.5" strokeWidth={1.5} /> Right
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem onClick={() => onAlign("top")}>
              <AlignStartHorizontal className="mr-2 size-3.5" strokeWidth={1.5} /> Top
            </ContextMenuItem>
            <ContextMenuItem onClick={() => onAlign("center-v")}>
              <AlignCenterHorizontal className="mr-2 size-3.5" strokeWidth={1.5} /> Center vertical
            </ContextMenuItem>
            <ContextMenuItem onClick={() => onAlign("bottom")}>
              <AlignEndHorizontal className="mr-2 size-3.5" strokeWidth={1.5} /> Bottom
            </ContextMenuItem>
          </ContextMenuSubContent>
        </ContextMenuSub>
        <ContextMenuSeparator />
        <ContextMenuItem variant="destructive" disabled={!hasSelection} onClick={onDelete}>
          <Trash2 className="mr-2 size-3.5" strokeWidth={1.5} /> Delete
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
```

> Verify every imported lucide icon name (`BringToFront`, `SendToBack`, `Group`, `Ungroup`,
> `AlignStartVertical`, etc.) actually exists in the installed `lucide-react` version before
> committing — this codebase's icon library has had exports removed before (brand icons in an
> earlier task); check `node_modules/lucide-react`'s exports and swap any missing name for a
> reasonable equivalent, noting the substitution in your report the same way Task 16 of the original
> plan documented its `Instagram` → `Share2` substitution.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no NEW errors from this file (it has no consumer yet until Task 15 wires it into
`post-focus-view.tsx`).

- [ ] **Step 3: Commit**

```bash
git add src/components/nodes/post-layer-context-menu.tsx
git commit -m "feat(post): add the layer right-click context menu"
```

---

## Task 10: Left panel — inline rename, drag-reorder, multi-select sync

**Not unit-tested.**

**Files:**
- Modify: `src/components/nodes/post-layer-list.tsx`

**Interfaces:**
- Consumes: `EditableField` from `./editable-field` (confirmed unchanged signature).
- Produces: `PostLayerList`'s `Props` change: `selectedId: string | null` → `selectedIds: string[]`,
  add `onToggleSelect: (id: string) => void` (ctrl/shift-click), add `onRename: (id: string, name:
  string) => void`, add `onReorderToIndex: (id: string, targetIndex: number) => void` (drag-and-drop
  — a new pure helper, `reorderLayerToIndex`, should be added to `src/lib/post/layers.ts` alongside
  the existing `reorderLayer` if a simple index-based move isn't already expressible via the existing
  `front`/`forward`/`backward`/`back` directions — check first whether composing multiple
  `reorderLayer` calls can express "move to arbitrary index" cleanly, or whether a dedicated function
  is clearer; if you add one, give it its own test in `layers.test.ts` mirroring the existing
  `reorderLayer` tests' style).

- [ ] **Step 1: Read the current `post-layer-list.tsx` in full before editing**

- [ ] **Step 2: Add inline rename**

Each row's label (currently plain text via `layerLabel(layer)`) becomes an `EditableField` on
double-click — following the same click-to-edit pattern already used for node titles elsewhere in
this app:

```tsx
<EditableField
  value={layer.name ?? layerLabel(layer)}
  onCommit={(name) => onRename(layer.id, name)}
  singleLine
  className="flex-1 truncate text-xs"
/>
```

(Replace the current plain `<span className="flex-1 truncate">{layerLabel(layer)}</span>` with
this — `EditableField` already renders as read-only text until clicked/double-clicked to edit, per
its existing implementation, so confirm whether its default trigger is single-click or needs a
double-click wrapper added here to avoid conflicting with the row's own click-to-select behavior;
resolve this by reading `editable-field.tsx`'s actual click handling and deciding whether row-select
and rename-trigger can coexist cleanly, or whether rename needs its own explicit "start editing"
affordance instead of relying on `EditableField`'s built-in click-to-edit.)

- [ ] **Step 3: Add drag-and-drop reorder**

Use native HTML5 drag-and-drop (`draggable`, `onDragStart`, `onDragOver`, `onDrop`) on each row —
this codebase doesn't have an existing drag-and-drop list pattern to mirror (confirm via a search for
`onDragStart`/`draggable=` across `src/components/` before writing a new one, to reuse an existing
convention if one exists; if none exists, implement a minimal one scoped to this list only, not a
new shared abstraction — YAGNI per this codebase's own stated rules).

- [ ] **Step 4: Multi-select sync**

Each row's click handler checks for shift/ctrl and calls `onToggleSelect` instead of `onSelect` when
held, mirroring Task 8's stage-side shift-click handling. `selectedId === layer.id` styling becomes
`selectedIds.includes(layer.id)`.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`

- [ ] **Step 6: Commit**

```bash
git add src/components/nodes/post-layer-list.tsx src/lib/post/layers.ts src/lib/post/layers.test.ts
git commit -m "feat(post): inline rename, drag-reorder, and multi-select sync in the layer list"
```

---

## Task 11: Inspector — blur-commit + shape stroke controls

**Not unit-tested.**

**Files:**
- Modify: `src/components/nodes/post-inspector-text.tsx`
- Modify: `src/components/nodes/post-inspector-shape.tsx`

**Interfaces:**
- Consumes: nothing new for the blur-commit change. `ShapeLayer.stroke` (Task 2) for the new stroke
  controls.
- Produces: no prop-signature change — both components already receive `onChange: (patch) => void`
  from their caller (`post-focus-view.tsx`, which currently calls `updateLayerLive` +
  `commitLayerChange()` synchronously inside that `onChange`). This task changes HOW OFTEN each
  field calls `onChange`, not the prop itself.

- [ ] **Step 1: Read both files fresh, then change text/number/color inputs to commit on blur**

For every `Input`/`Select` in `post-inspector-text.tsx` and the text-based fields in
`post-inspector-shape.tsx` (the gradient From/To text inputs, the corner-radius number input): keep
a LOCAL `useState` draft value that updates on every `onChange` (so the field feels responsive while
typing), and only call the `onChange` prop (which the parent wires to `updateLayerLive` +
`commitLayerChange`) `onBlur`. `Select`/color-swatch/toggle-button fields (discrete choices, not
continuous typing) keep committing immediately on selection — only free-text/number typing needs the
blur-commit treatment, per the design spec's Workstream 1.

Example shape for the font-size field (apply the same pattern to every other free-text/number field
in both files):

```tsx
const [sizeDraft, setSizeDraft] = useState(String(displayFontSize(layer.fontSize)));
useEffect(() => setSizeDraft(String(displayFontSize(layer.fontSize))), [layer.fontSize]);
// ...
<Input
  type="number" min={8} max={400}
  value={sizeDraft}
  onChange={(e) => setSizeDraft(e.target.value)}
  onBlur={() => onChange({ fontSize: fontSizeFromDisplay(Number(sizeDraft)) })}
  className="text-xs"
/>
```

(The `useEffect` re-syncing the draft from the prop handles the case where the layer's font size
changes from elsewhere — e.g. switching selection, or an undo — while this field isn't focused.)

- [ ] **Step 2: Add stroke controls to `post-inspector-shape.tsx`**

Add a stroke on/off toggle (a `Button` pair or a single toggle `Button`, matching the existing
solid/gradient toggle's visual pattern) plus, when enabled, a color `Input` and a width `Input
type="number"` (blur-commit, per Step 1), writing to `layer.stroke`:

```tsx
<div>
  <label className="text-eyebrow mb-1 block !text-[0.6rem]">Border</label>
  <div className="flex gap-1">
    <Button
      variant="outline" size="sm"
      className={cn(!layer.stroke && "ring-2 ring-primary ring-offset-1")}
      onClick={() => onChange({ stroke: undefined })}
    >
      None
    </Button>
    <Button
      variant="outline" size="sm"
      className={cn(layer.stroke && "ring-2 ring-primary ring-offset-1")}
      onClick={() => onChange({ stroke: layer.stroke ?? { color: "#1e1e1e", width: 2 } })}
    >
      Solid
    </Button>
  </div>
</div>
{layer.stroke && (
  <div className="flex gap-2">
    <div className="flex-1">
      <label className="text-eyebrow mb-1 block !text-[0.6rem]">Colour</label>
      <Input
        type="color" value={layer.stroke.color}
        onChange={(e) => onChange({ stroke: { ...layer.stroke!, color: e.target.value } })}
        className="h-8 w-full p-1"
      />
    </div>
    <div className="flex-1">
      <label className="text-eyebrow mb-1 block !text-[0.6rem]">Width</label>
      <Input
        type="number" min={0} max={40} defaultValue={layer.stroke.width}
        onBlur={(e) => onChange({ stroke: { ...layer.stroke!, width: Number(e.target.value) } })}
        className="text-xs"
      />
    </div>
  </div>
)}
```

- [ ] **Step 3: Wire `stroke` into the Konva renderer**

`shapeLayerFillProps` (`@/lib/post/layer-konva-props`, from the original plan) currently returns only
fill-related props. Add `stroke`/`strokeWidth` passthrough — check whether this belongs as an
addition to `shapeLayerFillProps` itself (renaming/reframing it as covering "fill AND stroke") or as
a small new sibling function; either is acceptable, but whichever you choose, its output must
ultimately reach `post-shape-layer.tsx`'s `<Rect {...geo} {...fillProps} {...nodeProps} />` spread so
`stroke`/`strokeWidth` actually render. If you touch `layer-konva-props.ts`, add/update its test file
accordingly (this function IS pure and tested per the original plan's Task 5B).

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`

- [ ] **Step 5: Commit**

```bash
git add src/components/nodes/post-inspector-text.tsx src/components/nodes/post-inspector-shape.tsx \
  src/components/nodes/post-shape-layer.tsx src/lib/post/layer-konva-props.ts \
  src/lib/post/layer-konva-props.test.ts
git commit -m "feat(post): blur-commit inspector text fields, add shape stroke controls"
```

---

## Task 12: Image inspector — "Reset to natural ratio"

**Not unit-tested.**

**Files:**
- Modify: `src/components/nodes/post-inspector-image.tsx`

**Interfaces:**
- Consumes: `computeNaturalRatioReset` from `@/lib/post/image-fit` (Task 5).
- Produces: a new button in the image inspector, enabled only when the image's natural dimensions
  are knowable.

- [ ] **Step 1: Read the current file, then add the reset action**

The image's natural width/height come from the SAME `useImage` hook `post-image-layer.tsx` already
calls to load the bitmap for rendering — but the inspector is a SEPARATE component that doesn't
currently have access to the loaded `HTMLImageElement`. Resolve this by having `post-focus-view.tsx`
(Task 15, the parent of both the stage and the inspector) hold a small `Record<string,
{width,height}>` map of "known natural dimensions per image layer id," populated by
`post-image-layer.tsx` calling a new `onImageLoaded: (layerId: string, naturalW: number, naturalH:
number) => void` prop once its `useImage` result resolves, threaded down through
`post-stage.tsx`/`post-layer-render.tsx` the same way `onCommitText` already threads down to the
text layer. Pass the resolved dimensions for the CURRENTLY SELECTED image layer into
`PostInspectorImage` as a new optional prop, `naturalSize?: { width: number; height: number }`.

```tsx
{naturalSize && (
  <Button
    variant="outline" size="sm"
    onClick={() => onChange(computeNaturalRatioReset(
      { x: layer.x, y: layer.y, w: layer.w, h: layer.h }, naturalSize.width, naturalSize.height,
    ))}
  >
    Reset to original proportions
  </Button>
)}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/components/nodes/post-inspector-image.tsx src/components/nodes/post-image-layer.tsx \
  src/components/nodes/post-layer-render.tsx src/components/nodes/post-stage.tsx
git commit -m "feat(post): add 'reset to natural proportions' action for image layers"
```

---

## Task 13: Expand icon presets

**Not unit-tested.**

**Files:**
- Modify: `src/components/nodes/post-add-menu.tsx`

**Interfaces:**
- Produces: `LUCIDE_PRESET` expanded from ~6 to ~30-40 entries, categorized (communication,
  commerce, arrows/UI, misc); `SIMPLE_PRESET` expanded to add X/Twitter, YouTube, TikTok.

- [ ] **Step 1: Verify every new icon name against the installed packages before adding it**

For Lucide: check `node_modules/lucide-react`'s actual exports (or its type definitions) for each
candidate name before adding — this codebase has hit missing-export surprises with this exact
package twice already this session (`Instagram` was removed; verify anything you add,
e.g. `ShoppingCart`, `CreditCard`, `Tag`, `Truck`, `Gift`, `Heart`, `ThumbsUp`, `Share2`, `MessageCircle`,
`Bell`, `Calendar`, `Clock`, `Globe`, `Wifi`, `Zap`, `Award`, `Target`, `TrendingUp`, `Percent`,
`ShoppingBag`, `Package`, `Users`, `User`, `Home`, `MapPin` [already present], `Navigation`,
`ArrowUpRight`, `ArrowDown`, `ArrowLeft`, `Play`, `Pause`, `Volume2`, `Camera`, `Image` [name-collides
with an existing import in this file — use `ImageIcon` alias, matching the convention already used
elsewhere in this codebase for the same collision], `Video`, `Music`, actually exist. For Simple
Icons: verify `x` (formerly twitter), `youtube`, `tiktok` resolve via `resolveSimpleIcon` against the
installed `simple-icons@16.28.0` package the same way Task 10 of the original plan verified
instagram/whatsapp/facebook — check the package's actual export names (Simple Icons renamed
`siTwitter` to `siX` at some version; confirm which name the installed version uses).

- [ ] **Step 2: Update `LUCIDE_PRESET` and `SIMPLE_PRESET`**

Organize `LUCIDE_PRESET` into labeled groups for the picker UI (the existing 4-column grid can
either grow taller with section headers, or gain a lightweight category-tab control — your call on
which reads cleaner; keep it simple, this is a picker grid, not a new navigation pattern).

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add src/components/nodes/post-add-menu.tsx
git commit -m "feat(post): expand the Lucide and Simple Icons presets"
```

---

## Task 14: Remove the copy-image-brief button

**Not unit-tested.**

**Files:**
- Modify: `src/components/nodes/post-template-picker.tsx`

- [ ] **Step 1: Remove the "Copy image brief" `Button` and its `copyZoneHint`/clipboard-write logic**

Read the current file, remove the hover-revealed copy button and the `navigator.clipboard.writeText`
call + `toast.success("Image brief copied")` it triggers. Leave `copyZoneHint`/`copyZone` itself
alone in `@/lib/post/copy-zone-hint` and `@/lib/post/templates` (the underlying data/pure function
isn't being deleted, just this one UI entry point to it — a template's `copyZone` may still be used
elsewhere, e.g. a future V2 layout-aware regeneration per the original design spec's D103). If the
`copyZoneHint` import becomes unused in this file after removing the button, remove the import too.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/components/nodes/post-template-picker.tsx
git commit -m "feat(post): remove the copy-image-brief button from the template picker"
```

---

## Task 15: Focus view — toolbar undo/redo, fixed-width inspector, wire everything together

**Not unit-tested.** This is the integration task for this whole plan, analogous to the original
plan's Task 20 — every prior task in THIS plan converges here.

**Files:**
- Modify: `src/components/nodes/post-focus-view.tsx`

**Interfaces:**
- Consumes: everything from Tasks 1-14. `PostLayerContextMenu` (Task 9), the updated `PostStage`
  props (Task 8), the updated `usePostEditor` return shape (Task 6).

- [ ] **Step 1: Read the current `post-focus-view.tsx` in full before editing** (309 lines per the
  research above — confirm exact current content, do not assume).

- [ ] **Step 2: Add Undo/Redo buttons to the header toolbar**

```tsx
<Button variant="outline" size="icon" disabled={!canUndo} onClick={undo} aria-label="Undo">
  <Undo2 className="size-4" />
</Button>
<Button variant="outline" size="icon" disabled={!canRedo} onClick={redo} aria-label="Redo">
  <Redo2 className="size-4" />
</Button>
```
(placed before the existing Preview/Publish/Download buttons; import `Undo2`/`Redo2` from
`lucide-react`).

- [ ] **Step 3: Give the inspector panel a fixed width/header across all selection states**

Ensure the right panel's outer wrapper (`w-56 shrink-0 ...`) and a consistent header row ("select a
layer" / "N layers selected" / the layer-kind label) render REGARDLESS of `selectedIds.length`, so
only the panel's CONTENT changes, not its presence/width/position — check the current conditional
rendering (if the panel currently only renders when something is selected, change it to always
render the shell, with `PostInspector` itself handling the empty/single/multi states internally).

- [ ] **Step 4: Wire `usePostEditor`'s new API through this file**

Every `selectedId` → `selectedIds`; every `deleteLayer(id)` → `deleteSelection()`;
`duplicateLayer(id)` → `duplicateSelection()`; thread `toggleLayerSelection`, `selectMany`, `group`,
`ungroup`, `copySelection`, `pasteClipboard`, `align` down into `PostStage` and
`PostLayerContextMenu`. `PostInspector` (from the original plan) currently takes a single
`layer: PostLayer | null` — decide (and implement) how it should behave for a MULTI-select: showing
"N layers selected" with only the operations that make sense across a heterogeneous selection
(alignment, lock, delete — not per-kind styling fields), versus the full single-layer property panel
when exactly one layer is selected. Keep this simple — a multi-select doesn't need every single-layer
field to somehow apply to N layers at once; the align/group/lock/delete actions (available via the
toolbar/context-menu) cover the multi-select case, so the inspector panel itself can just show a
"N layers selected" placeholder rather than trying to merge N different property sets into one form.

- [ ] **Step 5: Wire keyboard shortcuts for the new actions**

Extend the existing keyboard-shortcut `useEffect` (Delete/Cmd+D/Cmd+Z/`]`/`[`/arrows, all guarded by
`isEditableTarget`) with: `Cmd/Ctrl+G` → `group()`, `Cmd/Ctrl+Shift+G` → `ungroup()`,
`Cmd/Ctrl+C` → `copySelection()`, `Cmd/Ctrl+V` → `pasteClipboard()`, `Cmd/Ctrl+X` → `copySelection()`
then `deleteSelection()` (cut = copy + delete, no separate primitive needed).

- [ ] **Step 6: Wire the context menu around the stage**

Wrap the `<PostStage ...>` element in `<PostLayerContextMenu>` (Task 9), passing every required prop
from the hook's current state (`selectedIds.length > 0` for `hasSelection`, `selectedIds.length >=
2` for `canGroup`, etc.) and the actions themselves.

- [ ] **Step 7: Typecheck project-wide**

Run: `npx tsc --noEmit`
Expected: clean. This is the task that resolves every deferred error noted in Tasks 6-12's own
typecheck steps — if anything is still red here, it means a prior task's deferred fix wasn't
actually completed; go back and fix it in THIS task if small, or flag it clearly in your report if
it reveals a design gap this plan didn't anticipate.

- [ ] **Step 8: Run the full post-related test suite**

Run: `npx vitest run src/lib/post src/services/post-node.service.test.ts src/lib/canvas-nodes.test.ts src/lib/canvas-node-options.test.ts src/lib/nodes/node-output.test.ts`
Expected: all passing (the original 137 plus every new test file from Tasks 1, 3, 4, 5 of this plan).

- [ ] **Step 9: Commit**

```bash
git add src/components/nodes/post-focus-view.tsx
git commit -m "feat(post): wire multi-select, grouping, context menu, and undo/redo UI into the editor shell"
```

---

## Task 16: Templates — CTA pill becomes a group with real text

**Files:**
- Modify: `src/lib/post/templates/lower-third.ts`, `inset-card.ts`, `side-column.ts`, `split-half.ts`
- Modify: `src/lib/post/templates/templates.test.ts`

**Interfaces:**
- Consumes: `groupLayers` from `../layers` (Task 3), `GroupLayer` from `../types` (Task 2).
- Produces: each template's `seedLayers()` now returns its CTA pill as a 2-layer group (shape + text)
  instead of a bare shape.

- [ ] **Step 1: Update the failing/changed test expectations first**

`templates.test.ts`'s existing "every template produces in-bounds layers" test iterates `t.seedLayers(format)`
and checks `x/y/w/h` bounds on EVERY returned layer — a `GroupLayer` has its own `x/y/w/h` (the
combined bounding box) so this test should still pass unchanged as long as `groupLayers`' bounding-
box math (Task 3, already tested) is correct; but add one NEW assertion confirming each template's
seed output contains exactly one `"group"`-kind layer (the CTA button) with `childIds.length === 2`.

- [ ] **Step 2: Update each template file**

In each of the four template files, change the CTA pill's `createShapeLayer(...)` call to ALSO
create a paired `createTextLayer(...)` (with matching position/size, appropriate contrasting text
color per that template's existing color scheme — check each template's existing text-color choices
for its headline/body to pick a consistent CTA label color), then group them via `groupLayers([...])`
before returning from `seedLayers()`. Example shape (adapt position/colors per each template's own
existing values — read the current file first, don't guess at its exact numbers):

```typescript
export function seedLayers(): PostLayer[] {
  const ctaPill = createShapeLayer({
    name: "CTA pill", x: 0.08, y: 0.88, w: 0.34, h: 0.055,
    fill: { kind: "solid", color: "#ffffff" }, radius: 999,
  });
  const ctaText = createTextLayer({
    name: "CTA label", x: ctaPill.x, y: ctaPill.y, w: ctaPill.w, h: ctaPill.h,
    text: "Shop Now", fontSize: 0.018, fontWeight: 700, color: "#151515", align: "center",
  });
  const otherLayers = [ /* ...this template's existing scrim/headline/body layers, unchanged... */ ];
  return groupLayers([...otherLayers, ctaPill, ctaText], [ctaPill.id, ctaText.id]);
}
```

(Text vertical centering within the pill's box is a rendering detail — `Konva.Text` doesn't
vertically center by default the way the box's `h` might suggest; check whether the existing
`textLayerFontProps`/Konva `Text` rendering already handles this via `verticalAlign` or similar, and
if not, either accept the text sitting at the box's top edge as a known minor cosmetic gap for this
task, or add `verticalAlign: "middle"` support if it's a trivial addition — don't over-invest in this
detail, it's cosmetic.)

- [ ] **Step 3: Run the templates test**

Run: `npx vitest run src/lib/post/templates/templates.test.ts`
Expected: PASS (existing 7 tests + 4 new "has a CTA group" assertions, one per template)

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`

- [ ] **Step 5: Commit**

```bash
git add src/lib/post/templates/
git commit -m "feat(post): seed the CTA pill as a shape+text group in every template"
```

---

## Self-Review Notes (for whoever executes this plan)

Several tasks above (7's group coordinate-space resolution, 9's context-menu positioning, 10's
rename-trigger-vs-select-click interaction, 12's natural-size threading, 16's text vertical
centering) deliberately describe the PROBLEM and the acceptance criteria rather than prescribing
exact code, because they depend on verifying an actual library API (Konva nested-Group behavior,
Base UI's ContextMenu positioning API, EditableField's click semantics) that's more reliable to
check against the real installed package at implementation time than to guess at now. This mirrors
how the original Post node plan handled the `gradientPoints` arithmetic and the Konva `toBlob`
signature — treat these as "verify against source, then implement," not as gaps to skip.
