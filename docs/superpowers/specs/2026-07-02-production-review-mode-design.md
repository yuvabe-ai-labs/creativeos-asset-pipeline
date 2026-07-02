# Production Review Mode — canvas-level read-only review surface

**Date:** 2026-07-02
**Status:** Approved design. Implementation pending (test-first).
**Type:** Design spec (adds **D34**; promotes the *review-surface* half of backlog **F4**, PRD §21).
**Decision record:** ADR **D34** (`2026-05-30-creativeos-staging-roadmap.md` §7 — appended).
**Builds on:** **D29** (approval flag on the version envelope — the state this surface reads/writes),
**D33** (single-writer canvas lock — this surface deliberately sits *outside* it), **D18/D5** (a
version is an attempt; the active pointer), **D4** (uniform envelope), **D8** (edges point to
nodes). **Preserves D11** (the human is still the scheduler — no auto-advance/gating here).
**Origin:** the "Production Review Mode" concept note — a senior designer needs to review many
reels' worth of prompts/images/videos quickly, without opening every canvas and hunting nodes.
Brainstormed down from the full concept (submit lifecycle + gating + auto-generation + notifications
+ a campaign entity) to its smallest useful primitive: **a read-only review queue, per canvas.**

---

## 1. Problem

CreativeOS is a canvas for *making*. Once work moves into production, a senior designer needs to
*move* — review many junior-produced prompts, images, and videos and sign off (or send back)
quickly. Doing that on the canvas is slow: you open each canvas (taking the D33 edit lock),
hunt the relevant nodes spatially on the graph, open each focus view, and approve one at a time.

The approval **state** already exists — **D29** put `approval_status`
(`pending | approved | changes_requested`) on every `node_versions` row, with `approved_by` /
`approved_at` / `note`, settable from each node's focus view. What is missing is a **fast surface
to work that state** without navigating the graph node-by-node.

## 2. Goal

A **read-only review queue, scoped to one canvas** (one reel): a list→detail surface that shows
the nodes whose active version needs review, lets a reviewer **Approve / Request changes** inline
(reusing the D29 action), and moves to the next item — *without* entering the canvas editor or
taking its lock. "Canvas is for making; Review is for moving."

**Read-only** means read-only toward *canvas content* — no node/edge/position edits, no generation,
no inline prompt editing. Setting the D29 approval flag is not a canvas edit (it writes
`node_versions`, not canvas structure), so it is permitted here.

## 3. Non-goals (deferred; each is a clean later increment on this surface)

- **Cross-canvas / client-level inbox.** The MVP is per-canvas. Because scope = "which canvases feed
  the list," a client-wide inbox is a *later data-source swap* on the same component
  (write `listReviewQueue(clientId)`, feed its groups to the same list). Nothing here is thrown away.
- **Submit-for-review lifecycle.** No new `submitted_for_review` state. The queue is *derived* from
  the existing D29 states. (F4's "submitted → …" workflow is later.)
- **Gating / auto-advance generation.** Approving does **not** trigger the next generation step or
  block downstream wiring. That contradicts **D11** (human is the scheduler) and D29 §3; deferred.
- **Notifications, batch approve, a campaign entity, count badges, shot-based grouping.** All later.
  Shot grouping specifically needs shot lineage that downstream nodes don't currently store (§4.3).

## 4. Design

### 4.1 Scope & entry point

- New route: **`/clients/[id]/canvases/[cid]/review`** — a server component (`force-dynamic`),
  *not* the canvas editor, so it is never under the D33 lock.
- Reached from a **"Review" action on each canvas row** in `CanvasesTable` (client page). Deliberately
  *not* via the editor header — reaching review must not route the reviewer through the
  lock-acquiring editor. No count badge in the MVP (a per-row "(N)" would need the deferred
  cross-canvas aggregate).

### 4.2 What populates the queue

One row **per node** (not per attempt — approval attaches to the *active* version, D18/D5), where:

- `node.type ∈ { prompt, video-prompt, image-gen, video-gen }` — the "prompts + generated outputs"
  stages. (Script/Shot are earlier, cheaper, edited on canvas — excluded.) Note the image-prompt and
  the shot-composer prompt share `type: "prompt"`; we label by node type, not inferred intent.
- the node **has an active version** (never-generated nodes have nothing to review → excluded), and
- default filter: `active.approval_status ∈ { pending, changes_requested }`. An **Approved** filter
  chip flips the set to `approved` (showing approver + when).

Grouped by **stage** in pipeline order (Image Prompt · Video Prompt · Image Gen · Video Gen), then by
`created_at`. Header: "N awaiting review." Empty state: a dashed "Nothing awaiting review in this
reel" card (house style).

### 4.3 Data layer — reuse `listNodes`, no new aggregate query

Because the MVP is canvas-scoped, it reuses the **existing** `listNodes(canvasId)`
(`src/lib/db/nodes.ts`), which already embeds `active:node_versions!nodes_active_version_fk(output,
approval_status)`. **No new DB query.** A new pure, unit-testable function does the shaping (mirroring
`planReconcile` / `buildApprovalUpdate` / `filterAndSort`):

```ts
// src/lib/review.ts
export type ReviewFilter = "needs-action" | "approved";
export type ReviewItem  = { nodeId; stage; title; status; output; approvedBy; approvedAt; note; versionId };
export type ReviewGroup = { stage; items: ReviewItem[] };
export function buildReviewQueue(nodes: NodeWithActive[], filter: ReviewFilter): ReviewGroup[];
```

`versionId` = the node's `active_version_id` — the row the approval action writes to (§4.5).
`listNodes`'s embed must be widened to also select `operator, created_at, approved_by, approved_at,
note` (currently only `output, approval_status`) — `operator`/`created_at` feed the Tier-0 maker +
timestamp (§4.5) and the within-stage ordering (§4.2). Widen the shared embed (one source) rather than
adding a parallel variant.

### 4.4 Layout — master-detail, reuse the eval-review viewer shell

A **list + detail** surface: a compact list of items on the left (grouped by stage), a detail pane on
the right. Selecting an item shows it; **Approve auto-advances** selection to the next item. Keyboard:
`A` approve, `R` request changes, `→` next. This reuses the existing **eval-review viewer** shell
(`2026-06-14-eval-review-viewer-design.md`) rather than inventing a layout, per the house rule to
reuse focus-view/review primitives.

### 4.5 Detail pane — rich context via progressive disclosure

Three tiers; only Tier 0 is eager.

- **Tier 0 (always, from `listNodes`):** the active version **output** (image/video preview or prompt
  text), **maker + when** (`operator`, `created_at`) + model, **status** pill, and the **actions**.
- **Tier 1 (lazy — on clicking "Context"):** the **prompt that produced it**, **reference images /
  start frame**, and the **shot** — the immediate upstream. Fetched **only for the expanded item** via
  the existing **`getUpstreamOutputs(nodeId)`** (`src/lib/db/nodes.ts`), which returns the active
  outputs of every node with an edge into this one (one hop covers most context per stage). Exposed to
  the client component via a **`GET /api/nodes/[id]/context`** route using the route-helpers
  (`apiOk`/`apiError`, per `docs/api-routes.md`). Per-type mapping buckets upstream nodes into
  prompt / refs / shot.
- **Tier 2:** **"Open in canvas ↗"** — the full graph, deeper lineage, and editing (takes the D33
  lock; may land read-only if someone else holds it — expected, the lock banner explains).

### 4.6 Approval interaction — reuse D29, decoupled from the D33 lock

- Approve / Request changes / Reset call the **existing** `setVersionApprovalAction(versionId,
  { status, approvedBy, note })` (`src/lib/actions/approval.ts`) — `approvedBy = useIdentity()` name.
  No new action, no new state, no new columns.
- **Decoupled from the D33 lock** (the crux): the review route is not the canvas editor, and the
  action has **no lock guard** (it writes `node_versions`, not the `canvases` row). So a reviewer
  approves without holding or taking the edit lock — this is what makes "review N items without
  opening N canvases" possible. (D33's "viewers can't approve" is a *canvas-UI* gate, not a server
  guard; it does not apply off-canvas.)
- Writes to the **version id shown in the pane** (captured at load) — you approve *exactly the attempt
  you reviewed*. If the node was regenerated meanwhile, the approval lands on the now-superseded
  version (harmless — no longer active); `revalidatePath` refreshes and the new `pending` attempt
  reappears. Consistent with D29 ("regenerate resets to pending").
- After a write, `revalidatePath` the review route: an approved item leaves the needs-action list;
  a changes-requested item updates its pill. Request-changes opens a note field (writes `note`).
- **Role hint (cosmetic, per D29):** action controls show for `role === 'senior'`; `designer` sees
  status read-only. Spoofable, not enforced.
- **"Edit and approve" is out** (read-only): to change a prompt, Open in canvas → edit → approve there.

### 4.7 Edge cases

- **No active version** (never generated) → excluded.
- **Async video mid-generation** → lives in `generations`, not yet graduated to `node_versions`
  (D25) → not in the queue. Nothing half-baked appears; it shows once it graduates.
- **Node deleted / regenerated after load** → the approve write may target a stale/missing version id:
  if the row is gone the action throws → toast "Couldn't update — it may have changed" + revalidate.
- **KB not ready** → the client page already redirects to `/kb`; the review route is only reachable
  for `kb_status === 'ready'` clients.

## 5. Testing

- **`buildReviewQueue`** (pure): type filter, status filter (needs-action vs approved), exclude
  null-active, group-by-stage ordering — unit-tested like `planReconcile` / `filterAndSort`.
- **Approval reuse:** `setVersionApprovalAction` is already covered (`approval.test.ts`); add a test
  that the pane calls it with the **displayed** `versionId`, and that reset/request-changes shape the
  write (via `buildApprovalUpdate`).
- **Lazy context:** the per-type mapping of `getUpstreamOutputs` results into prompt / refs / shot
  buckets; the `/api/nodes/[id]/context` route returns `apiOk` shape and 404s a missing node.
- **Component:** master-detail smoke render; "Approve advances selection"; the Approved filter flips
  the set.

## 6. Out of scope

Cross-canvas/client-level inbox, submit-for-review lifecycle, gating/auto-advance generation,
notifications, batch approve, count badges, shot-based grouping, a campaign entity — see §3. Each
builds on this surface without redesign; the client-level inbox in particular is only a data-source
swap (`listReviewQueue(clientId)` → the same list component).

## 7. Upgrade path (for the future "Production Review Mode — full" project)

1. **Client-level inbox:** add `listReviewQueue(clientId)` (the nested `canvases→nodes→active` join),
   add a **Review tab** to the client page, feed its groups to the *same* list/detail component.
2. **Submit-for-review:** add a `submitted_for_review` state + a junior "Submit" action so the queue
   shows only pushed items (not every `pending`).
3. **Gating / auto-advance:** only after revisiting **D11** — approving a prompt could enqueue the
   next generation. Deliberately last; it changes the "human is the scheduler" contract.
