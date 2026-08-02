# Auth Stage 2A — Node Isolation Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close a real, currently-open org-isolation gap. All 13 `/api/nodes/[id]/*` route files (16 exported handlers) never pass through `withClient()` — it only guards `/api/clients/[id]/*` — so right now any authenticated user can trigger generation, mutate, or read any org's nodes by id. Same architectural class of bug as the canvas-rooted routes fixed post-1D (commit `7b6a0c5`), same fix shape: a new `withNode()` helper, wired through every route.

**Architecture:** `withNode()` resolves `node → canvas → client.org_id` in a **single PostgREST query** (embedded `!inner` joins: `nodes.select("*, canvases!inner(client_id, clients!inner(org_id))")`), not three sequential round trips — raised as a real performance concern before writing any code, so the chain is collapsed up front rather than optimized later. `withCanvas()` (already shipped, commit `7b6a0c5`) gets the same treatment retrofitted in this task for consistency — it currently does two sequential queries where one now suffices. `withClient()` is unaffected — it was already a single query. Every node route gets the identical mechanical transform: wrap the existing handler body in `withNode(params, async (nodeId, node) => { ...unchanged... })`. No route's actual behavior changes for a same-org caller — only the org check is added, and it costs one query, not three.

**Tech Stack:** TypeScript, Next.js 16 Route Handlers, existing `route-helpers.ts` patterns (`withClient`, `withCanvas`, `withTryCatch`).

**Parent:** `docs/superpowers/plans/2026-07-21-auth-stage-2-index.md` · **Precedent:** the identical fix already shipped for canvas routes, commit `7b6a0c5` — same helper shape, same verification approach.

## Global Constraints

- **Mechanical, behavior-preserving transform.** Every route's existing logic moves inside the `withNode()` callback unchanged — don't refactor, rename variables beyond what's needed to receive `nodeId`/`node` from the callback, or "improve" anything else while in these files. This task is about closing the isolation gap, nothing else.
- **404, never 403** — matches `withClient`/`withCanvas`'s existing convention (never confirm a foreign resource exists).
- **Where a route already wraps its body in `withTryCatch(...)`, `withNode()` goes outside it** (`return withNode(params, async (nodeId, node) => withTryCatch(...))`) so the org check runs before any work starts, not nested inside error handling.
- **Reuse, don't reinvent:** `withNode()` belongs in `src/lib/api/route-helpers.ts` next to `withClient`/`withCanvas`, following their exact structure.

## File Structure

**New/modified**
| File | Change |
|---|---|
| `src/lib/api/route-helpers.ts` | Add `withNode()` (single-query) + `unwrapEmbed()`; retrofit `withCanvas()` to single-query |
| 13 route files under `src/app/api/nodes/[id]/*/route.ts` | Wrap each exported handler in `withNode()` |

---

## Task 1: `withNode()` helper (single-query) + retrofit `withCanvas()` to match

**Files:**
- Modify: `src/lib/api/route-helpers.ts`

**Interfaces:**
- Produces: `withNode(params: Promise<{id: string}>, handler: (nodeId: string, node: NodeRow) => Promise<AnyResponse>): Promise<AnyResponse>` — one query via embedded joins, not three sequential lookups.
- Changes: `withCanvas()`'s internals (same public signature, callers unaffected) — one query instead of two.

- [ ] **Step 1: Add a small embed-unwrap helper**

PostgREST returns an embedded to-one relation as either an object or a single-element array
depending on schema-cache heuristics (the same ambiguity already handled in
`recent-canvas.ts` and `organizations.ts::listOrgMembers`). Both `withCanvas` and `withNode`
need to unwrap this twice now (once for `withNode`'s two nested levels), so factor it out
once instead of repeating the `Array.isArray` check inline:

```ts
function unwrapEmbed<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}
```

- [ ] **Step 2: Rewrite `withCanvas()` as a single query**

Replace the existing `withCanvas()` (currently `getCanvasById` + `getClientById`, two
sequential queries) with:

```ts
type CanvasWithOrg = CanvasRow & {
  clients: { org_id: string } | { org_id: string }[] | null;
};

export async function withCanvas(
  params: Promise<{ id: string }>,
  handler: (canvasId: string, canvas: CanvasRow) => Promise<AnyResponse>,
): Promise<AnyResponse> {
  const { id: canvasId } = await params;
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("canvases")
    .select("*, clients!inner(org_id)")
    .eq("id", canvasId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return apiError("Canvas not found.", 404);

  const row = data as unknown as CanvasWithOrg;
  const client = unwrapEmbed(row.clients);
  const caller = await resolveCallerContext();
  if (!client || client.org_id !== caller.orgId) {
    return apiError("Canvas not found.", 404);
  }
  const { clients: _clients, ...canvas } = row;
  return handler(canvasId, canvas as CanvasRow);
}
```

Note: `clients!inner(...)` (inner join) means a canvas whose client somehow doesn't exist
(shouldn't happen, FK-enforced) is excluded by the query itself rather than needing a
separate null check — `maybeSingle()` just returns `null` for that case, same 404 path.

- [ ] **Step 3: Add `withNode()` as a single query (double-embedded)**

Add the import at the top: `import { createServerSupabase } from "@/lib/supabase/server";`
(needed by both the rewritten `withCanvas` and the new `withNode`). Then:

```ts
type NodeWithOrgChain = NodeRow & {
  canvases:
    | { client_id: string; clients: { org_id: string } | { org_id: string }[] | null }
    | { client_id: string; clients: { org_id: string } | { org_id: string }[] | null }[]
    | null;
};

// Same org-isolation shape as withClient()/withCanvas(), for the 13 route files under
// /api/nodes/[id]/* — none of them went through withClient() (it only guards
// /api/clients/[id]/*), so they had no org check at all. Node -> canvas -> client -> org,
// resolved in ONE query via embedded joins (not three sequential round trips) — this
// runs on every generation request, so the chain is collapsed up front, not after the fact.
export async function withNode(
  params: Promise<{ id: string }>,
  handler: (nodeId: string, node: NodeRow) => Promise<AnyResponse>,
): Promise<AnyResponse> {
  const { id: nodeId } = await params;
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("nodes")
    .select("*, canvases!inner(client_id, clients!inner(org_id))")
    .eq("id", nodeId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return apiError("Node not found.", 404);

  const row = data as unknown as NodeWithOrgChain;
  const canvas = unwrapEmbed(row.canvases);
  const client = canvas ? unwrapEmbed(canvas.clients) : null;
  const caller = await resolveCallerContext();
  if (!client || client.org_id !== caller.orgId) {
    return apiError("Node not found.", 404);
  }
  const { canvases: _canvases, ...node } = row;
  return handler(nodeId, node as NodeRow);
}
```

- [ ] **Step 4: Remove now-unused imports**

`withCanvas`'s rewrite no longer calls `getCanvasById`/`getClientById` internally — but
`getClientById` is still used by `withClient()`, so only drop `getCanvasById` from the
imports if nothing else in this file uses it (check first: `grep -n "getCanvasById"
src/lib/api/route-helpers.ts`). Do **not** delete `getCanvasById` from
`src/lib/db/canvases.ts` itself — it may be used elsewhere (check before removing anything
there; this task only touches `route-helpers.ts`).

- [ ] **Step 5: Verify the build compiles**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 6: Manual verification — `withCanvas` still works after the retrofit**

The 3 canvas routes fixed earlier (`/api/canvas/[id]/cost`, `/api/canvas/[id]/generations`,
`/api/canvases/[cid]/lock/release`) didn't change their own code, only what `withCanvas`
does internally. Signed in as Yuvabe, confirm a canvas's cost badge / generation history
still loads normally (same-org access unaffected by the rewrite).

- [ ] **Step 7: Commit**

```bash
git add src/lib/api/route-helpers.ts
git commit -m "feat(auth): withNode helper (single query) + collapse withCanvas to one query"
```

---

## Task 2: Wire the two worked examples (`cost`, `duplicate`)

**Files:**
- Modify: `src/app/api/nodes/[id]/cost/route.ts`
- Modify: `src/app/api/nodes/[id]/duplicate/route.ts`

These two establish the pattern for Task 3's remaining 11 files: a plain handler, and one already wrapped in `withTryCatch`.

- [ ] **Step 1: Wire `cost/route.ts` (plain handler)**

Replace its contents:

```ts
import { createServerSupabase } from "@/lib/supabase/server";
import { apiError, apiOk, withNode } from "@/lib/api/route-helpers";
import { USD_TO_INR } from "@/lib/pricing";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withNode(params, async (nodeId) => {
    // ?also=id1,id2,... lets callers include upstream pipeline node IDs so the
    // badge reflects the full cost of reaching this generation, not just this node.
    const { searchParams } = new URL(req.url);
    const alsoRaw = searchParams.get("also") ?? "";
    const extraIds = alsoRaw ? alsoRaw.split(",").filter(Boolean) : [];
    const allNodeIds = [nodeId, ...extraIds];

    const supabase = createServerSupabase();
    const { data, error } = await supabase
      .from("generations")
      .select("credits_consumed")
      .in("node_id", allNodeIds)
      .eq("status", "succeeded");

    if (error) return apiError(error.message, 500);

    const totalUsd = (data ?? []).reduce(
      (sum, row) => sum + (row.credits_consumed ?? 0),
      0,
    );

    return apiOk({ totalUsd, totalInr: totalUsd * USD_TO_INR });
  });
}
```

Note: the `?also=` extra ids are **not** individually org-checked — they ride on the trust that the primary `nodeId` is already verified and the extras are its own upstream pipeline (client-supplied, same canvas in practice). This matches the route's pre-existing behavior; not a new gap introduced here, just not solved by this task either. Flagged in Self-Review, not silently ignored.

- [ ] **Step 2: Wire `duplicate/route.ts` (already wrapped in `withTryCatch`)**

Replace its contents — `withNode` goes outside `withTryCatch`:

```ts
import { createServerSupabase } from "@/lib/supabase/server";
import { apiError, apiOk, withTryCatch, withNode } from "@/lib/api/route-helpers";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withNode(params, async (sourceNodeId, sourceNode) => {
    return withTryCatch("Duplicate node failed", async () => {
      const supabase = createServerSupabase();

      // KB nodes cannot be duplicated
      if (sourceNode.type === "kb") {
        return apiError("KB nodes cannot be duplicated.", 400);
      }

      // Create new node
      const newNodeId = crypto.randomUUID();
      const position = sourceNode.position as { x: number; y: number };
      // Place the duplicate ABOVE the original (YUV-195): mirror the 32px cascade upward.
      const newPosition = { x: position.x + 32, y: position.y - 32 };

      const { data: newNode, error: insertErr } = await supabase
        .from("nodes")
        .insert({
          id: newNodeId,
          canvas_id: sourceNode.canvas_id,
          type: sourceNode.type,
          position: newPosition,
          data: sourceNode.data ?? {},
          active_version_id: null,
        })
        .select()
        .single();

      if (insertErr || !newNode) {
        return apiError("Failed to create duplicate node.", 500);
      }

      // Copy active version if one exists
      if (sourceNode.active_version_id) {
        const { data: activeVersion, error: versionErr } = await supabase
          .from("node_versions")
          .select("*")
          .eq("id", sourceNode.active_version_id)
          .single();

        if (!versionErr && activeVersion) {
          const { data: newVersion, error: newVersionErr } = await supabase
            .from("node_versions")
            .insert({
              node_id: newNodeId,
              inputs_used: activeVersion.inputs_used ?? {},
              params_used: activeVersion.params_used ?? {},
              model_used: activeVersion.model_used ?? null,
              output: activeVersion.output ?? null,
              generated_output: activeVersion.generated_output ?? null,
              operator: "duplicate",
            })
            .select()
            .single();

          if (!newVersionErr && newVersion) {
            const { error: updateErr } = await supabase
              .from("nodes")
              .update({ active_version_id: newVersion.id })
              .eq("id", newNodeId);

            if (!updateErr) {
              newNode.active_version_id = newVersion.id;
            }
          }
        }
      }

      return apiOk({ node: newNode }, 201);
    });
  });
}
```

Note: `withNode()` already fetched `sourceNode` via `getNodeById` for the org check — the
route's own redundant `supabase.from("nodes").select("*").eq("id", sourceNodeId).single()`
fetch is now removed (the callback receives `sourceNode` directly), since re-fetching the
same row twice would be pure waste. The `nodeErr` 404 branch is gone for the same reason —
`withNode()` already returns "Node not found." if the node doesn't exist, before the
callback even runs.

- [ ] **Step 3: Verify the build compiles**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 4: Manual verification — the pattern works**

With a Yuvabe node id (get one: sign in as Yuvabe, open any canvas, note a node's cost badge
loads normally — that confirms `cost` still works for same-org). Then, signed in as Agency A,
try `http://localhost:3000/api/nodes/<a-yuvabe-node-id>/cost`.
Expected: `{"error":"Node not found."}`, not real cost data.

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/nodes/[id]/cost/route.ts" "src/app/api/nodes/[id]/duplicate/route.ts"
git commit -m "feat(auth): wire withNode into cost + duplicate routes"
```

---

## Task 3: Wire the remaining 11 files (14 handlers)

**Files:** all under `src/app/api/nodes/[id]/`:
`compile-preview`, `compose` (2 handlers: GET, POST), `file` (2 handlers: POST, DELETE),
`generate`, `image-generate`, `parse`, `restore-version`, `upstream-images`, `versions`,
`video-generate`, `video-prompt`.

**The mechanical recipe, identical for every file:**
1. Read the file.
2. Add `withNode` to the existing `@/lib/api/route-helpers` import (don't add a second import line).
3. Wrap the handler body: `export async function POST(req, { params }) { return withNode(params, async (nodeId, node) => { ...unchanged body... }); }` — rename the body's references from whatever it currently calls the destructured id (`nodeId`, `id`, etc.) to match the callback's `nodeId` parameter, or just keep the callback's local name matching what the body already expects to minimize the diff.
4. If the file already does its own `supabase.from("nodes").select(...).eq("id", nodeId).single()` fetch purely to load the node (as `duplicate` did), remove that redundant fetch and use the callback's `node` parameter instead — same reasoning as Task 2 Step 2. If the file fetches the node for a *different* reason (e.g. needs a joined shape `withNode` doesn't provide), keep its own fetch and just use `nodeId` from the callback, ignoring `node`.
5. If the body is already wrapped in `withTryCatch`, `withNode` goes outside it (Task 2 Step 2's shape).

- [ ] **Step 1: `compile-preview` (1 handler)** — read, apply the recipe, verify no other structural surprises (multiple return paths, early returns, etc. all still work once nested one level deeper inside the callback).

- [ ] **Step 2: `compose` (2 handlers: GET, POST)** — apply the recipe to both exports in the same file.

- [ ] **Step 3: `file` (2 handlers: POST, DELETE)** — this one does file upload/deletion; check whether it already resolves node ownership some other way (`resolveOwnership` is used in `src/lib/storage/index.ts` for storage *paths*, not for auth — confirm it isn't already doing an isolation check under a different name before assuming it has none).

- [ ] **Step 4: `generate` (1 handler)** — the prompt-generation endpoint. Highest-value fix in this batch alongside image/video-generate.

- [ ] **Step 5: `image-generate` (1 handler)**

- [ ] **Step 6: `parse` (1 handler)**

- [ ] **Step 7: `restore-version` (1 handler)** — a write (restores an old version as active); double-check the org check runs before the restore executes, not after.

- [ ] **Step 8: `upstream-images` (1 handler)**

- [ ] **Step 9: `versions` (1 handler)**

- [ ] **Step 10: `video-generate` (1 handler)**

- [ ] **Step 11: `video-prompt` (1 handler)**

- [ ] **Step 12: Verify the build compiles after all 11 files**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 13: Completeness check — every node route actually wired**

Run: `git grep -L "withNode" -- "src/app/api/nodes/[id]/**/route.ts"`
Expected: **no output** (every file references `withNode`). Any file listed here was missed —
go back and fix it before proceeding.

- [ ] **Step 14: Run the full test suite**

Run: `npx vitest run`
Expected: all pass. If any existing test for these routes breaks, it's likely testing the
old "no auth context" shape — check whether the test needs a mocked caller context, don't
just delete the assertion.

- [ ] **Step 15: Manual verification — spot-check the highest-value routes**

Signed in as Agency A, attempt each against a Yuvabe node id:
- `POST /api/nodes/<yuvabe-node-id>/generate` → expect 404, not a real generation triggered
- `POST /api/nodes/<yuvabe-node-id>/image-generate` → expect 404
- `POST /api/nodes/<yuvabe-node-id>/video-generate` → expect 404

Then, signed in as Yuvabe (own nodes), confirm the app still works normally end-to-end:
open a canvas, generate something on one of your own nodes, confirm it still runs.

- [ ] **Step 16: Commit**

```bash
git add "src/app/api/nodes/[id]"
git commit -m "feat(auth): wire withNode into the remaining 11 node routes (14 handlers)"
```

---

## Final verification (2A shippable checklist)

- [ ] `npm run build` — clean
- [ ] `npx vitest run` — all pass
- [ ] `git grep -L "withNode" -- "src/app/api/nodes/[id]/**/route.ts"` — empty (all 13 files wired)
- [ ] Cross-org attempt on `generate`/`image-generate`/`video-generate` all return 404
- [ ] Same-org (Yuvabe) generation still works end-to-end — no regression
- [ ] Three commits made (helper, two worked examples, remaining 11 files)

**On completion:** update `2026-07-21-auth-stage-2-index.md` — 2A → ✅. Next: write **2B (RLS
backstop)**.

---

## Self-Review notes (traceability)

- **The actual finding this fixes** → all 13 files enumerated by name in Global Constraints/
  File Structure, not "the node routes" vaguely; Task 3's completeness check (`git grep -L`)
  is the proof, not an assumption that 13 edits were made correctly.
- **Behavior-preserving, not a refactor** → Global Constraints says explicitly not to improve
  anything else while in these files; Task 2's notes about removing *redundant* node fetches
  are the one deliberate exception, justified (avoiding a duplicate DB round trip that
  `withNode()` already made unnecessary), not scope creep.
- **`?also=` ids in `cost` not individually checked** → named explicitly in Task 2 Step 1,
  not silently left as an unexamined gap.
- **`withTryCatch` ordering** → Global Constraints states the rule once; Task 2 Step 2 and
  Task 3's recipe both apply it consistently.
- **`file` route's possible pre-existing `resolveOwnership` usage** → Task 3 Step 3 says to
  check rather than assume it has no isolation logic at all, since it's the one route already
  touching an ownership-resolution helper (for storage paths) — verify what it actually does
  before concluding it needs the exact same treatment as the other 12.
- **Performance concern raised before writing code, not after** → `withNode()` was designed
  as a single embedded-join query from the start (Task 1), not shipped as 3 sequential
  queries and optimized later; `withCanvas()` (already shipped) is retrofitted in the same
  task for consistency rather than left inconsistent with the new pattern.
