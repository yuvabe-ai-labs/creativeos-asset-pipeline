# D19 Single-Source Output Refactor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the active version's `output` the single source of truth for a Script node's parsed result — drop the `nodes.data.parsed` display cache, hydrate output via a join on canvas load, and persist manual edits by updating the active version's `output` (D18/D19).

**Architecture:** A node's *own content* (title, source, kbSlices) stays in `nodes.data`; its *output* (parsed script) lives only in `node_versions.output` and is read through `nodes.active_version_id`. Canvas load joins each node to its active version's output and hydrates it into the in-memory store as `data.parsed` (display-only, never persisted). Manual Save updates the active version's `output` in place. A one-time backfill folds existing `data.parsed` edits into the active version so nothing is lost at cutover.

**Tech Stack:** Next.js (App Router) · Supabase (PostgREST) · Zustand canvas store · React Flow · Vitest.

**No schema change.** `node_versions.output` and `nodes.active_version_id` already exist; dropping `data.parsed` is just not-writing a jsonb key. The only data step is a backfill script.

---

## File structure

| File | Change | Responsibility |
|---|---|---|
| `src/lib/canvas-nodes.ts` | modify | `nodeRowToFlow` hydrates `data.parsed` from the joined active output; `flowToPersisted` strips `parsed`. Pure functions. |
| `src/lib/canvas-nodes.test.ts` | create | Unit tests for the two mappers above. |
| `src/lib/db/nodes.ts` | modify | `listNodes` joins each node's active version `output`; new `NodeWithActive` type. |
| `src/lib/db/versions.ts` | modify | New `updateActiveVersionOutput(nodeId, output)`. |
| `src/lib/actions/nodes.ts` | modify | New `saveScriptOutputAction(nodeId, output)` server action. |
| `src/components/nodes/script-node.tsx` | modify | Pass `onSaveOutput` (calls the action) to the focus view. |
| `src/components/nodes/script-focus-view.tsx` | modify | Save writes the active version output (via `onSaveOutput`) then mirrors into the store for display. |
| `scripts/backfill-active-output.mjs` | create | One-time: fold existing `data.parsed` → active version `output`. |

---

## Task 1: Pure mappers — hydrate from / strip the output cache

**Files:**
- Modify: `src/lib/canvas-nodes.ts`
- Test: `src/lib/canvas-nodes.test.ts` (create)

- [ ] **Step 1: Write the failing tests**

Create `src/lib/canvas-nodes.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { nodeRowToFlow, flowToPersisted, type NodeWithActive } from "./canvas-nodes";

function row(overrides: Partial<NodeWithActive> = {}): NodeWithActive {
  return {
    id: "n1",
    canvas_id: "c1",
    type: "script",
    position: { x: 0, y: 0 },
    data: { title: "Reel" },
    active_version_id: null,
    created_at: "",
    updated_at: "",
    active: null,
    ...overrides,
  };
}

describe("nodeRowToFlow", () => {
  it("hydrates data.parsed from the active version output", () => {
    const node = nodeRowToFlow(
      row({ active: { output: { title: "Parsed reel" } } }),
    );
    expect((node.data as { parsed?: unknown }).parsed).toEqual({ title: "Parsed reel" });
    expect((node.data as { title?: string }).title).toBe("Reel"); // own content kept
  });

  it("drops any stale persisted data.parsed when there is no active output", () => {
    const node = nodeRowToFlow(
      row({ data: { title: "Reel", parsed: { title: "STALE" } }, active: null }),
    );
    expect((node.data as { parsed?: unknown }).parsed).toBeUndefined();
    expect((node.data as { title?: string }).title).toBe("Reel");
  });

  it("migrates legacy 'brief' type to 'script'", () => {
    const node = nodeRowToFlow(row({ type: "brief" }));
    expect(node.type).toBe("script");
  });
});

describe("flowToPersisted", () => {
  it("never persists the derived parsed field", () => {
    const persisted = flowToPersisted({
      id: "n1",
      type: "script",
      position: { x: 1, y: 2 },
      data: { title: "Reel", source: "raw", parsed: { title: "x" } },
    } as never);
    expect(persisted.data).toEqual({ title: "Reel", source: "raw" });
    expect("parsed" in persisted.data).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- canvas-nodes`
Expected: FAIL — `NodeWithActive` is not exported / `active` not handled (type or assertion errors).

- [ ] **Step 3: Implement the mapper changes**

In `src/lib/canvas-nodes.ts`, add the `NodeWithActive` type and rewrite the two mappers. Replace the existing `nodeRowToFlow` and `flowToPersisted` with:

```ts
// A node row joined with its active version's output (canvas-load shape).
// `active` is the to-one embed of node_versions via nodes.active_version_id.
export type NodeWithActive = NodeRow & {
  active: { output: unknown } | null;
};

// DB row → React Flow node (used on canvas load, server-side).
// `data.parsed` is DERIVED from the active version's output (D19): it is hydrated
// here for display only and is never read from / written to the persisted row.
export function nodeRowToFlow(row: NodeWithActive): AppNode {
  // "brief" was renamed to "script" — migrate old rows on read so they render correctly.
  const type = row.type === "brief" ? "script" : row.type;
  // Strip any stale persisted `parsed`; output is the single source of truth now.
  const { parsed: _stale, ...own } = (row.data ?? {}) as Record<string, unknown>;
  const output = row.active?.output;
  const data = output != null ? { ...own, parsed: output } : own;
  return {
    id: row.id,
    type: type as AppNode["type"],
    position: row.position,
    data: data as AppNode["data"],
  } as AppNode;
}

// React Flow node → the columns we persist (used on autosave, client-side).
// `parsed` is intentionally omitted — it is derived from the active version (D19).
export function flowToPersisted(n: AppNode) {
  const { parsed: _omit, ...data } = n.data as Record<string, unknown>;
  return {
    id: n.id,
    type: n.type as string,
    position: n.position,
    data,
  };
}
```

Also update the `ScriptNodeData.parsed` doc comment at the top of the file to:

```ts
  parsed?: unknown; // active parsed output — DISPLAY ONLY, hydrated from the active version (D19); never persisted
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- canvas-nodes`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/canvas-nodes.ts src/lib/canvas-nodes.test.ts
git commit -m "refactor(nodes): derive data.parsed from active version, never persist it (D19)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Join active version output on canvas load

**Files:**
- Modify: `src/lib/db/nodes.ts:52-60` (the `listNodes` function)

- [ ] **Step 1: Update `listNodes` to embed the active version's output**

Replace the existing `listNodes` in `src/lib/db/nodes.ts` with:

```ts
import type { NodeWithActive } from "@/lib/canvas-nodes";

export async function listNodes(canvasId: string): Promise<NodeWithActive[]> {
  const supabase = createServerSupabase();
  // Embed the active version's output via the nodes.active_version_id FK
  // (constraint name disambiguates it from node_versions.node_id).
  const { data, error } = await supabase
    .from("nodes")
    .select("*, active:node_versions!nodes_active_version_fk(output)")
    .eq("canvas_id", canvasId);
  if (error) throw error;
  return (data ?? []) as unknown as NodeWithActive[];
}
```

Note: the existing `import type { NodeRow }` line stays (other functions use it). Add the `NodeWithActive` import shown above. `listNodes`'s return type changes from `NodeRow[]` to `NodeWithActive[]`.

- [ ] **Step 2: Verify the page still type-checks against the new shape**

`src/app/clients/[id]/canvases/[cid]/page.tsx:48` already does `listNodes(canvas.id).then((rows) => rows.map(nodeRowToFlow))`. Since `nodeRowToFlow` now accepts `NodeWithActive`, no change is needed there.

Run: `npx tsc --noEmit`
Expected: PASS (no errors).

- [ ] **Step 3: Run lint**

Run: `npx eslint src/lib/db/nodes.ts`
Expected: no output (clean).

- [ ] **Step 4: Commit**

```bash
git add src/lib/db/nodes.ts
git commit -m "feat(nodes): join active version output on canvas load (D19)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Persist manual edits into the active version's output

**Files:**
- Modify: `src/lib/db/versions.ts` (add function)
- Modify: `src/lib/actions/nodes.ts` (add server action)

- [ ] **Step 1: Add `updateActiveVersionOutput` to the versions module**

Append to `src/lib/db/versions.ts`:

```ts
// D18/D19: a manual edit folds into the ACTIVE version's output (no new row).
// Throws if the node has no active version (nothing to edit yet).
export async function updateActiveVersionOutput(
  nodeId: string,
  output: unknown,
): Promise<void> {
  const supabase = createServerSupabase();
  const { data: node, error: nodeErr } = await supabase
    .from("nodes")
    .select("active_version_id")
    .eq("id", nodeId)
    .maybeSingle();
  if (nodeErr) throw nodeErr;
  const activeId = (node as { active_version_id: string | null } | null)
    ?.active_version_id;
  if (!activeId) throw new Error("Node has no active version to update.");
  const { error } = await supabase
    .from("node_versions")
    .update({ output })
    .eq("id", activeId);
  if (error) throw error;
}
```

- [ ] **Step 2: Add the server action**

In `src/lib/actions/nodes.ts`, add the import and the action:

```ts
import { updateActiveVersionOutput } from "@/lib/db/versions";
```

```ts
// Save manual edits to the Script node's parsed output (D19): updates the
// active version's output in place — does NOT create a new version.
export async function saveScriptOutputAction(nodeId: string, output: unknown) {
  await updateActiveVersionOutput(nodeId, output);
}
```

- [ ] **Step 3: Type-check and lint**

Run: `npx tsc --noEmit`
Expected: PASS.

Run: `npx eslint src/lib/db/versions.ts src/lib/actions/nodes.ts`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/lib/db/versions.ts src/lib/actions/nodes.ts
git commit -m "feat(versions): update active version output for manual edits (D18/D19)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Wire the focus view's Save to the active version

**Files:**
- Modify: `src/components/nodes/script-node.tsx`
- Modify: `src/components/nodes/script-focus-view.tsx`

- [ ] **Step 1: Pass `onSaveOutput` from the node**

In `src/components/nodes/script-node.tsx`, add the import:

```ts
import { saveScriptOutputAction } from "@/lib/actions/nodes";
```

Then add the `onSaveOutput` prop to the rendered `<ScriptFocusView …>` (alongside the existing `onPatch`):

```tsx
        onPatch={(patch) => updateNodeData(id, patch)}
        onSaveOutput={(output) => saveScriptOutputAction(id, output)}
```

- [ ] **Step 2: Accept the prop and use it on Save**

In `src/components/nodes/script-focus-view.tsx`, add to `ScriptFocusViewProps`:

```ts
  onSaveOutput: (output: ReelScript) => Promise<void>;
```

Destructure it in the component signature (add `onSaveOutput,` to the params list next to `onPatch,`).

Add a save handler near the other handlers (e.g. after `runParse`):

```tsx
  async function handleSave() {
    try {
      await onSaveOutput(draft);   // truth: update the active version's output
      onPatch({ parsed: draft });  // mirror into the store for display + clear dirty
      toast.success("Saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    }
  }
```

Replace the Save button's handler (currently `onClick={() => onPatch({ parsed: draft })}`) with:

```tsx
                  <Button size="lg" onClick={handleSave} disabled={!dirty}>
                    Save
                  </Button>
```

- [ ] **Step 3: Type-check, lint, build**

Run: `npx tsc --noEmit`
Expected: PASS.

Run: `npx eslint src/components/nodes/script-node.tsx src/components/nodes/script-focus-view.tsx`
Expected: clean.

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/components/nodes/script-node.tsx src/components/nodes/script-focus-view.tsx
git commit -m "feat(script): Save writes the active version output, not a node cache (D19)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Backfill existing edits into active version output

**Files:**
- Create: `scripts/backfill-active-output.mjs`

This must run once against any environment so pre-existing `data.parsed` edits (which only lived in the node cache) are folded into the active version before the new read path goes live.

- [ ] **Step 1: Write the backfill script**

Create `scripts/backfill-active-output.mjs`:

```js
// One-time backfill (D19): fold each node's data.parsed into its ACTIVE version's
// output, so dropping the data.parsed cache loses no manual edits.
//   node scripts/backfill-active-output.mjs
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const text = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const env = {};
for (const line of text.split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}

const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const { data: nodes, error } = await supabase
  .from("nodes")
  .select("id, data, active_version_id");
if (error) {
  console.error("read nodes failed:", error.message);
  process.exit(1);
}

let updated = 0;
let skippedNoActive = 0;
let skippedNoParsed = 0;
for (const n of nodes ?? []) {
  const parsed = n.data?.parsed;
  if (parsed === undefined || parsed === null) {
    skippedNoParsed++;
    continue;
  }
  if (!n.active_version_id) {
    skippedNoActive++;
    console.warn(`node ${n.id}: has data.parsed but no active version — skipped`);
    continue;
  }
  const { error: upErr } = await supabase
    .from("node_versions")
    .update({ output: parsed })
    .eq("id", n.active_version_id);
  if (upErr) {
    console.error(`node ${n.id}: update failed:`, upErr.message);
    process.exit(1);
  }
  updated++;
}

console.log("backfill complete");
console.log("  updated            :", updated);
console.log("  skipped (no parsed):", skippedNoParsed);
console.log("  skipped (no active):", skippedNoActive);
```

- [ ] **Step 2: Run the backfill**

Run: `node scripts/backfill-active-output.mjs`
Expected: prints `backfill complete` with an `updated` count ≥ 0 and no errors. Re-running is safe (idempotent — it just rewrites the same output).

- [ ] **Step 3: Commit**

```bash
git add scripts/backfill-active-output.mjs
git commit -m "chore(scripts): backfill data.parsed into active version output (D19)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Full verification + manual acceptance

**Files:** none (verification only)

- [ ] **Step 1: Run the full test + check suite**

Run: `npm test`
Expected: all tests pass (including the new `canvas-nodes` tests).

Run: `npx tsc --noEmit`
Expected: PASS.

Run: `npm run lint`
Expected: clean.

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 2: Manual acceptance (run the app)**

Run: `npm run dev`, then in the browser:

1. Open a canvas that already has a parsed Script node → the node shows its title and a filled (primary) status dot. **Expected:** parsed content renders in the focus view (now sourced from the active version via the join).
2. Open the focus view → edit a field → **Save** → toast "Saved".
3. **Reload the page** → reopen the node → **Expected:** your edit persists (proves it was written to the active version's output, not a cache).
4. Inspect the DB to confirm no cache leak:
   Run: `node scripts/db-inspect.mjs` (sanity: counts unchanged) and optionally query a node row — **Expected:** after an autosave, the edited node's `data` no longer contains a `parsed` key, while its active `node_versions.output` holds the edited script.
5. **Re-extract** still works (creates a new version, output updates).

- [ ] **Step 3: Final commit (if any verification fixups were needed)**

```bash
git add -A
git commit -m "test(nodes): verify D19 single-source output end to end

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Notes / decisions captured

- **No schema migration.** `node_versions.output` and `nodes.active_version_id` already exist; `data.parsed` is a jsonb key we simply stop persisting (`flowToPersisted` strips it; old rows are ignored on read and cleaned on next autosave).
- **`data.parsed` survives in-memory** as a display field hydrated from the join, so `script-node.tsx` (status dot) and `script-document.tsx` (renderer) need no changes — they keep reading `data.parsed`, which is now derived.
- **Restore / history UI** remain out of scope (D18/D19 note that `listVersions` is still unused). This plan only establishes the single-source read/write path that Stage 2 edges depend on.
- **Re-extract / parse** are unchanged — the route already appends a version, sets active, and returns output; the client mirrors it into the store (not persisted).
- **Embed shape caution (Task 2):** PostgREST returns the `active` embed as a to-one **object or `null`** (the FK `active_version_id` → PK `node_versions.id`). The Task-1 manual acceptance ("parsed content renders") is what confirms this at runtime. If a future PostgREST/supabase-js version returns it as a one-element array instead, adjust `nodeRowToFlow` to read `Array.isArray(row.active) ? row.active[0]?.output : row.active?.output`.
- **KB nodes** are unaffected: they have `active_version_id = null` (KB versions live in a separate table), so the embed is `null` and `nodeRowToFlow` returns their data without a `parsed` key.
