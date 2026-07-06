# Generation Tray — flat, canvas-scoped, navigation-only job shelf

**Date:** 2026-07-05
**Status:** Approved design. Implementation pending (test-first).
**Type:** Design spec (adds **D35**; first UI consumer of the `generations` substrate).
**Decision record:** ADR **D35** (`2026-05-30-creativeos-staging-roadmap.md` §7 — appended).
**Builds on:** **D26** (one generation substrate, sync vs async chosen by *duration not modality* —
this spec finally makes image gen write the job row D26 assumed), **D12/D25** (the `generations`
job table + Supabase Realtime), **D9** (staleness/derivation on read, never stored), **D33** (the
single-writer canvas lock — the tray is navigation, so it is available to read-only viewers too),
**D18/D5** (a version is an attempt; the active pointer carries `approval_status`).
**Preserves D11** (the human is still the scheduler — the tray never auto-advances or triggers a step).
**Origin:** the "Canvas Guided Flow and Flat Generation Tray" concept note. Brainstormed down from the
full concept (guided next-node CTAs **+** tray) to its smaller, independently-shippable half: **the
tray alone.** The guided next-node flow is a separate, later spec that rides on top of this one.

---

## 1. Problem

Image generation (~15s) and video generation (30–90s) are long enough that the operator wants to
click **Generate** and keep working — not sit in the focus view watching a skeleton. Today:

- **Video** generation is already non-blocking (async via trigger.dev, tracked in the `generations`
  table, pushed to the node card by Supabase Realtime — `use-video-gen-status.ts`). But its only
  cross-node visibility is a per-node `ProcessingPill`; there is **no single place** that answers
  "what is generating right now, across this whole reel, and what just finished?"
- **Image** generation blocks its own focus view (synchronous fetch, local `generating` state) and
  writes **no `generations` row at all** — so nothing outside that one drawer knows it ran, and
  nothing survives a refresh.

On a fanned-out reel (`1 script → N shots → N images → N clips`, D21) the operator has many
in-flight and just-finished jobs scattered across the graph with no consolidated view and no fast
way to jump back to the one that just went Ready.

## 2. Goal

A **flat, canvas-scoped shelf** floating over the canvas that lists the reel's long-running
generation jobs — image and video — each showing shot label, asset type, and status
(**Running / Ready / Failed**). **Clicking an item does exactly one thing: fly the canvas to that
generation node and open its focus view.** Nothing else. The tray is a *pointer surface*, not a
review surface.

"The canvas stays the workspace; the tray removes waiting confusion."

## 3. Non-goals (each a clean later increment)

- **Guided next-node CTAs** ("Save and create Image Prompt", auto-place/auto-connect the next node).
  That is the *other half* of the origin note — a separate spec built on this one. This spec is the
  tray only.
- **Tray-level actions** — no approve / request-changes / regenerate / retry / edit / delete on a
  tray item (concept note §8.4). Every action stays in the node's focus view. Click = navigate.
- **Prompt / compose / parse jobs in the tray** — only the two *long-running generation* types
  (image-gen, video-gen) appear (concept note §8.2).
- **Cross-canvas / global tray** — scoped to one canvas (one reel), like the D34 review surface.
- **Promoting image gen to true async.** Image stays the synchronous fast path (D26); we only add
  the job-row bookkeeping. See §7.
- **A stored tray table.** Tray state is *derived on read* (D9); we add no `tray` table and no new
  columns. See §5.

## 4. Behavior model — what a tray item *is*

**One item per generation node** (`type ∈ { image-gen, video-gen }`), not per attempt — because
approval attaches to the *active version* (D18/D5) and the operator thinks per node ("Shot 3's
image"). The item reflects that node's **latest `generations` job row**:

| Latest job row for the node | Tray status | Item leaves the tray when |
| :---- | :---- | :---- |
| `running` | **Running** | the job resolves (→ Ready / Failed) |
| `failed` | **Failed** | a newer generation starts on the node, or the node is deleted |
| `succeeded` | **Ready** | the node's active version is **approved**, a newer generation starts, or the node is deleted |
| *(no job row)* | *(absent)* | — never enters the tray |

- **Retention = "until approved"** (chosen). A Ready item persists until the attempt is signed off
  (`approval_status = approved` on the active version). This guarantees nothing generated slips past
  the operator's eye. Accepted consequence (§9): because video has *always* written job rows, old
  unapproved-but-succeeded videos on **existing** canvases surface as Ready on first load; image
  nodes generated before this feature have no job rows, so the image backlog starts clean from
  first deploy.
- **Sort:** Running first, then Failed, then Ready; within each group by **shot order** (the shot
  ancestor's `data.order`), falling back to job `created_at`.
- **Shot label is derived on read** (D9) by walking edges upstream from the generation node to the
  nearest `shot` ancestor:
  - image-gen: `image-gen ← prompt ← shot`
  - video-gen: `video-gen ← video-prompt ← shot` (or `← prompt ← shot` on the fallback path)
  Fallback when no shot ancestor exists (a bare Image Gen node): the node's own `data.title`. No
  lineage is stored on the job row.
- **Asset type** = the job row's `type` (`image` | `video`), rendered "Image" / "Video".

Status vocabulary note: the DB uses `running / succeeded / failed`; the tray *renders* those as
**Running / Ready / Failed** (the concept note's words). This is a pure display mapping — no schema
rename.

## 5. Data layer — derive on read, one new pure function

No new table, no new column, **no migration.** `0007_generations.sql` already has everything.

**Reconstruction query (canvas load).** The latest job row per generation node on the canvas, plus
the active version's `approval_status` (which canvas load already hydrates for the approval badge).
Implemented as one server read joined against the canvas's node set:

```ts
// src/lib/db/generations.ts  (new; sits beside insertGeneration / listGenerations)
export async function listLatestGenerationsForCanvas(
  nodeIds: string[],
): Promise<GenerationRow[]>;  // latest row per node_id, for the given nodes
```

**Shaping (pure, unit-tested — mirrors `planReconcile` / `buildReviewQueue` / `filterAndSort`):**

```ts
// src/lib/generation-tray.ts
export type TrayStatus = "running" | "ready" | "failed";
export type TrayItem = {
  nodeId: string;
  assetType: "image" | "video";
  status: TrayStatus;
  shotLabel: string;
  order: number;          // for sorting; Infinity when no shot ancestor
  generationId: string;
  versionId: string | null;
};

export function deriveTrayItems(
  nodes: FlowNode[],
  edges: FlowEdge[],
  latestJobs: GenerationRow[],
  approvals: Record<string, ApprovalStatus>,  // nodeId → active version's approval_status
  nowMs: number,                              // injected (Date.now is banned in pure/testable code paths)
): TrayItem[];

export function resolveShotLabel(
  nodeId: string,
  nodes: FlowNode[],
  edges: FlowEdge[],
): string;  // upstream walk to nearest `shot`; fallback to node title
```

`deriveTrayItems` encodes: status mapping, the **approved-drop** (a `succeeded` job whose node's
active version is `approved` → excluded), the **stale-timeout** (§6), the sort order, and the
shot-label walk. Everything the tray shows is a pure function of `(nodes, edges, latestJobs,
approvals, now)` — nothing is persisted, consistent with D9.

## 6. Live updates — one canvas-level Realtime subscription

A **new** hook, `use-generation-tray.ts`, subscribes to **one** Supabase Realtime channel per canvas
(`generation-tray:${canvasId}`) on `generations` INSERT/UPDATE. Because job rows carry `node_id` but
**not** `canvas_id`, the filter is **client-side**: ignore any event whose `node_id` is not in the
canvas's current node set. (We deliberately do **not** denormalize a `canvas_id` onto `generations`
— the node set is already in the store, and adding a column would be a migration for no gain.)

- Events update a small **tray slice on the existing canvas zustand store** (a
  `Record<generationId, GenerationRow>` of the latest rows). The component re-derives `TrayItem[]`
  via `deriveTrayItems` on every store/edge change — cheap, pure, no extra fetch.
- The existing per-node `use-video-gen-status` hook is **untouched** and coexists (it drives the
  node card's `ProcessingPill` + the "Video ready" toast); the tray is an independent, additive
  reader of the same table. Two subscriptions on the same table is fine — Supabase multiplexes them
  over the one websocket.
- **Subscribe-handshake race** is closed the same way `use-video-gen-status` already does it: after
  `SUBSCRIBED`, re-read the latest rows once to catch any completion that landed during the
  handshake.
- **Approval reconciliation.** Approving in *this* session re-derives locally (the item drops the
  moment you approve in the focus view, because `approvals[nodeId]` flips in the store). Approval
  from *another* session (e.g. the D34 review surface) reconciles on the **next canvas load**, not
  live — accepted MVP limitation (approval changes aren't on this Realtime channel).
- **Stale running rows.** Image gen is synchronous (§7): if the server process dies mid-request the
  row is stuck at `running`. `deriveTrayItems` renders a `running` **image** row older than a
  threshold (~60s, `nowMs - created_at`) as **Failed** — derived, never written (D9). Video rows are
  not stale-timed here (their long, variable runtime is owned by the async pipeline's own
  reconciliation).

## 7. The one backend change — image gen joins the substrate (completes D26)

The image-generate route (`src/app/api/nodes/[id]/image-generate/route.ts`) starts writing the job
row it never wrote. **This is the only server change in the whole feature.** It does not change the
route's synchronous response (`{ imageUrl, versionId }`) — the row is bookkeeping.

```
POST /api/nodes/[id]/image-generate
  gen = insertGeneration({ nodeId, type: "image", modelUsed: modelId,
                           paramsSnapshot: validatedParams, inputsSnapshot: inputsUsed })  // status: running
  try:
    result = config.generate(...)               // unchanged
    version = insertVersion(...); setActiveVersion(...)   // unchanged
    succeedGeneration({ generationId: gen.id, versionId: version.id })   // NEW
    return { imageUrl, versionId }               // unchanged
  catch e:
    insertVersion({ ...error })                  // unchanged (existing error-version write)
    failGeneration({ generationId: gen.id, error: message })   // NEW
    return apiError(message, 500)
```

- `insertGeneration`, `succeedGeneration`, `failGeneration` **already exist** in
  `src/lib/db/generations.ts` (written for video) — image reuses them verbatim. No new job-row
  primitives.
- **Image edits (D27)** flow through the same route, so an edit also inserts a `type: "image"` job
  row and appears in the tray as a running image job — correct and free.
- **Persistence semantics** (the synchronicity nuance): writing the row makes the **Running** state
  reconstructable after refresh (`listLatestGenerationsForCanvas` finds it) and, when the handler
  completes, the **Ready** state too. But unlike video, completion is *not guaranteed* if the client
  disconnects mid-flight — the work runs inside the awaited request, not a decoupled worker. On
  Vercel the function generally runs to completion after client disconnect (so the row flips to
  `succeeded` and the tray reconstructs Ready); if the process genuinely dies, the stale-timeout
  (§6) renders it Failed and the operator re-generates. This is the exact bargain D26 struck: image
  is the sync fast path; the row is its memory, not a completion guarantee. **We deliberately do NOT
  promote image to trigger.dev async** (non-goal §3).

## 8. UI — floating right-edge rail (navigation only)

A floating panel pinned to the canvas's **right edge**, rendered as an **absolutely-positioned
sibling overlay** *inside the canvas shell, over the React Flow surface* — it does **not** dock into
the layout or narrow the viewport; panning/zooming the canvas slides underneath it.

```
                                          ┌─────────────────────────┐
                                          │ GENERATION TRAY      ⌄  │  header + collapse chevron
                                          ├─────────────────────────┤
   [Shot 1]──[Prompt]──[Image Gen]        │ ◌ Shot 1 · Image        │  running (Loader2 spin)
   [Shot 2]──[Prompt]──[Image Gen]        │ ● Shot 2 · Image · Ready │  ready (+ output thumbnail)
                                          │ ✕ Shot 4 · Video · Failed│  failed
                                          └─────────────────────────┘
   [rf controls ↙]              collapsed → ┌──────────────┐
                                            │ ◌ 2 · ● 1 ✕1 │  count pill
                                            └──────────────┘
```

- **Hidden when empty** — zero items → the rail is not rendered (no dead chrome on a fresh canvas).
- **Item** — status glyph + `{shotLabel} · {Image|Video}` + status word; Ready items show a small
  output thumbnail chip. House style (AGENTS.md / Yuvabe): white card, 1px `neutral-200` border,
  `shadow-card`, radius 12–16px; **Lucide `Loader2` `animate-spin`** for Running (the single animated
  element, reusing the `ProcessingPill` idiom), a filled dot for Ready, an `X`/alert glyph for
  Failed; purple used *only* on the accent glyph, never as a fill; motion easing
  `cubic-bezier(0.22,1,0.36,1)`.
- **Collapse** — the chevron collapses the rail to a compact **count pill** (`◌ 2 · ● 1 · ✕ 1`);
  collapsed/expanded preference persisted in `localStorage` so it stays where the operator left it.
- **Read-only viewers (D33 lock)** still *see* the tray and can click to navigate — the tray is
  navigation, not a canvas edit. The focus view it opens is itself already read-only for a viewer
  (generation/approval are gated on `useCanvasEditable()`), so no new gating is needed here.
- **No actions on items.** The entire interaction is: click → navigate (§9). Strictly per
  concept note §8.4.

### 8.1 Component placement

- `src/components/canvas/generation-tray.tsx` — the rail; a sibling of `<ReactFlow>` inside the
  canvas shell (`canvas.tsx`), so it lives *inside* the new `<ReactFlowProvider>` (§9) and can call
  the viewport API.
- `src/components/canvas/generation-tray-item.tsx` — one row (split at ~200 lines per
  component-structure.md).
- `src/hooks/use-generation-tray.ts` — the canvas-level Realtime subscription + store wiring (§6).

## 9. Zoom-and-open mechanics (the greenfield plumbing)

Two capabilities don't exist today (confirmed by recon) and are added here — both small, both
reusable beyond the tray:

1. **Wrap the canvas in `<ReactFlowProvider>`.** Today `<ReactFlow>` is mounted bare, so no sibling
   can reach its imperative viewport API. Adding the provider around the canvas shell lets the tray
   call `useReactFlow().setCenter(x, y, { zoom: ~1, duration: 500 })` to fly to the node (500ms per
   the AGENTS.md motion tokens).
2. **Lift focus-view open-state to the store.** Today each node owns a private
   `const [focusOpen] = useState(false)` — unreachable from outside. Add one field to the canvas
   store, `focusedNodeId: string | null`, plus `setFocusedNodeId`. Each generating node opens its
   focus view when `focusedNodeId === id` **or** its local state is set (keep local double-click
   behavior; the store field is an *additional* opener, so existing behavior is untouched). The tray
   sets `focusedNodeId` after the pan.

**Click handler:**

```
onClickItem(item):
  node = getNode(item.nodeId)
  setCenter(node.position.x + w/2, node.position.y + h/2, { zoom, duration: 500 })
  // after the transition settles:
  setFocusedNodeId(item.nodeId)
```

`focusedNodeId` is the higher-leverage change: it converts "open a focus view" from a private
component concern into an addressable canvas operation — reusable by any future "jump to node"
surface (the D34 review queue, deep links), not just the tray.

## 10. Edge cases (mapped to concept note §14)

| Case | Behavior |
| :---- | :---- |
| Node deleted mid-flight | Item derives away (no matching node id in the set). The `generations` row is orphaned harmlessly and `on delete cascade` on `generations.node_id` removes it. |
| Generation fails | **Failed** item; clicking opens the focus view where the existing error UI + Re-generate already live (no tray-level retry). |
| Focus view closed while running | Unaffected — the node card `ProcessingPill` and the tray item both read shared state, not focus-view state. Both persist. |
| Page refresh | Tray reconstructs from `listLatestGenerationsForCanvas` on canvas load: running rows → Running, unapproved succeeded → Ready, failed → Failed. |
| Output completes while user is elsewhere | No interruption — the item just flips to Ready via Realtime (video already toasts "Video ready"; image adds no toast to avoid noise). |
| Approval from another session | Reconciles on next canvas load, not live (§6). |
| Stuck `running` image row | Stale-timeout → Failed, derived (§6). |
| Auto-selected references wrong | Out of scope for the tray — fixed in the focus view; the tray is unchanged. |
| No shot ancestor (bare Image Gen) | Label falls back to the node's `data.title` (§4). |

## 11. Testing

Repo convention: node-env vitest over pure `src/lib/**` logic (no DOM/RTL harness — recon
confirmed). So the load-bearing logic is extracted into pure functions and unit-tested; the panel is
verified manually by running the app.

**Unit (pure):**
- `deriveTrayItems` — status mapping; approved-drop; stale-timeout (running image past/under
  threshold, with injected `nowMs`); newer-generation supersede; sort order (Running→Failed→Ready,
  then shot order); asset-type passthrough.
- `resolveShotLabel` — image path (`← prompt ← shot`), video path (`← video-prompt ← shot`),
  fallback to title, and a diamond/multi-parent graph picking the nearest shot.

**Manual (app):**
1. Image: connect Prompt → Image Gen, Generate, close the focus view → tray shows Running → Ready;
   refresh mid-run → reconstructs Running; approve in focus view → item drops.
2. Video: Generate → tray shows Running (survives close/refresh) → Ready on completion.
3. Failed path (force a provider error) → Failed item; click → focus view error UI.
4. Click any item → canvas flies to the node and its focus view opens.
5. Collapse → count pill; reload → collapsed state remembered.
6. Read-only viewer (second tab under the D33 lock) → sees the tray, can click to navigate, cannot act.

## 12. What this is not (guardrails restated)

- Not a review queue (that's D34) — no approve/reject here; it *reads* approval only to drop Ready
  items.
- Not the guided next-node flow — that's the separate follow-on spec.
- Not a new persistence layer — everything derives from `generations` + the node graph (D9).
- Not a change to how video generates, or a promotion of image to async — only image's *job-row
  bookkeeping* is added (§7).

## 13. Implementation surface (summary)

**New:**
- `src/lib/generation-tray.ts` — `deriveTrayItems`, `resolveShotLabel`, types (pure; tested).
- `src/lib/db/generations.ts` — add `listLatestGenerationsForCanvas(nodeIds)`.
- `src/hooks/use-generation-tray.ts` — canvas-level Realtime + store slice.
- `src/components/canvas/generation-tray.tsx`, `generation-tray-item.tsx` — the rail + row.

**Changed (small):**
- `src/app/api/nodes/[id]/image-generate/route.ts` — insert/succeed/fail the job row (§7).
- `src/lib/canvas-store.ts` — add the tray slice + `focusedNodeId` / `setFocusedNodeId`.
- `src/components/canvas/canvas.tsx` — wrap in `<ReactFlowProvider>`; render `<GenerationTray>`.
- generating node components (`image-gen-node.tsx`, `video-gen-node.tsx`) — also open the focus view
  when `focusedNodeId === id` (additive to the existing local double-click opener).

**Unchanged:** the `generations` schema, the video pipeline, `use-video-gen-status`, `ProcessingPill`,
approval, versions.
