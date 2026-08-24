# Internal Approval — M2 (Derivation, Counts, Live Updates) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One derived view feeds pending-review counts at the client and canvas levels, and those counts update live in both directions without a reload.

**Architecture:** A single `review_queue_items` SQL view joins each node to its *active* version; every count in the product is a filter over it, so R5.5's "three levels agree" is structural rather than a convention. One RPC returns all of an org's counts in a single call (§8's free-tier constraint). A shared Realtime channel on `node_versions` — now filterable because M1 added `org_id` — drives live updates through one debounced refetch.

**Tech Stack:** Postgres view + `stable` SQL function, Supabase Realtime `postgres_changes`, Next.js 16 App Router (server components seed, client components subscribe), React 19, Vitest.

## Global Constraints

Same as M1, restated because each plan is read on its own:

- **Controls are shadcn primitives only** (`src/components/ui/*`). Base UI composes via `render`, not `asChild`. No raw `<button>`/`<input>`/`<select>`.
- **API helpers:** `apiError` / `apiOk` from `src/lib/api/route-helpers.ts` — never `NextResponse.json(...)`.
- **Reuse before redeclaring.** Import from `src/lib/<feature>/constants.ts` / `utils.ts`. Two call sites = extract; one = leave inline.
- **Migrations are batched to the end of the whole feature** (operator decision, 2026-08-21). Write the file, commit it, append it to `docs/superpowers/plans/MIGRATIONS-PENDING.md`, and continue as if applied. **Never block a task on one.**
- **Test command:** `npx vitest run <path>`; full suite `npx vitest run`. **Bar at M2 start: 159 files, 1268 tests, 0 failures.**
- **Typecheck:** `npx tsc --noEmit -p tsconfig.json` must be clean. This is the real gate for UI work — vitest does not compile the pages.
- **Lint:** the base has ~28 pre-existing errors. The bar is **no new errors in files this feature touches**:
  `npm run lint 2>&1 | awk '/^C:/{f=$0} /error/{print f}' | sort -u`
- **Design system:** amber = pending, `destructive` = changes_requested. **Red is not available to any count surface** (R5.9). Neutral pill + single amber dot (R5.8). Zero renders nothing (R5.1).
- **ADR numbers:** this feature owns **D159–D167**; M2 records **D159** (already written in M1) and adds none. Do not invent new numbers.
- **Commit style:** end every message with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

## Reference

- Design spec §1 (the view), §4 (this milestone): `docs/superpowers/specs/2026-08-21-internal-approval-workflow-design.md`
- PRD §6.3–6.5, §6.8: `docs/superpowers/specs/2026-08-19-internal-approval-workflow-prd.md`
- The Realtime pattern to copy: `src/lib/realtime/org-generation-updates.ts`

## What M1 already delivered (do not rebuild)

- `node_versions.org_id`, its BEFORE INSERT trigger, and the `(org_id, approval_status)` index.
- The `org isolation` SELECT policy on `node_versions` **and** its `supabase_realtime` membership — this is what makes §6.8 possible at all.
- `operator_user_id` on every insert path, and `resolveDisplayNames(orgId, userIds)` in `src/lib/db/profiles.ts`.

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `supabase/migrations/0031_review_queue.sql` | **Create.** `review_queue_items` view + `org_review_counts` RPC | 1 |
| `src/lib/review/queue.ts` | **Create.** Pure: `summarizeCounts`, `selectInboxFor`, types | 2 |
| `src/lib/review/queue.test.ts` | **Create.** Including the R5.5 invariant as a named test | 2 |
| `src/lib/db/review.ts` | **Create.** `getOrgReviewCounts`, `listCanvasPendingItems`, `listOrgReviewInbox` | 3 |
| `src/app/api/review/counts/route.ts` | **Create.** The refetch endpoint the live hook calls | 4 |
| `src/lib/realtime/org-version-updates.ts` | **Create.** Shared org channel on `node_versions` | 5 |
| `src/hooks/use-review-counts.ts` | **Create.** Seeds from server, refetches on realtime, holds last-known on failure | 5 |
| `src/components/shared/pending-count-pill.tsx` | **Create.** Neutral pill, one amber dot, null at zero | 6 |
| `src/components/clients/clients-table.tsx` | **Modify.** Per-client count | 7 |
| `src/components/clients/clients-home-tabs.tsx` | **Modify.** Thread counts through | 7 |
| `src/app/page.tsx` | **Modify.** Seed counts server-side | 7 |
| `src/components/canvases/canvases-table.tsx` | **Modify.** Per-canvas count | 7 |
| `src/app/clients/[id]/page.tsx` | **Modify.** Seed counts server-side | 7 |

---

## Task 1: Migration — the view and the counts RPC

**Files:**
- Create: `supabase/migrations/0031_review_queue.sql`
- Modify: `docs/superpowers/plans/MIGRATIONS-PENDING.md`
- Modify: `docs/auth-production-migration.md`

**Interfaces:**
- Consumes: `node_versions.org_id`, `operator_user_id` (migration 0030).
- Produces: view `review_queue_items`; function `org_review_counts(p_org_id uuid)` returning `(client_id uuid, canvas_id uuid, pending int)`.

- [ ] **Step 1: Write the migration**

```sql
-- D159: every review surface is a filter over ONE derivation.
--
-- Client counts, canvas counts, the review drawer and both roles' navbar lists all read
-- this view. Three independently written queries can drift apart; one cannot — which is
-- what makes R5.5 ("the three levels show the same underlying number") structural rather
-- than a convention someone has to remember.
--
-- Read what the joins buy, because it is most of the feature:
--   join on active_version_id  -> R3.3 (twenty regenerations expose ONE row) and
--                                 R3.5 (a node that never generated exposes none)
--   where type in (image,video)-> R3.2 (assets only; prompt nodes are not reviewable)
-- and because a regenerate moves the active pointer to a fresh `pending` row, R3.6/R9.4
-- (the loop closes with no resubmit step) fall out with no extra machinery.

create or replace view review_queue_items as
select
  v.org_id,
  cl.id   as client_id,
  cl.name as client_name,
  cl.slug as client_slug,
  cv.id   as canvas_id,
  cv.name as canvas_name,
  cv.slug as canvas_slug,
  n.id    as node_id,
  n.type  as node_type,
  -- Carried by the view, not resolved by the caller: the navbar popover is ORG-WIDE
  -- (R9.6), so it renders rows for canvases that are not loaded in the browser and has
  -- no client-side node to read a title or thumbnail from.
  n.data ->> 'title' as node_title,
  v.id    as version_id,
  v.output,
  v.approval_status,
  v.note,
  v.operator_user_id,
  v.operator,                      -- legacy free-text fallback (R11.4)
  v.created_at,
  v.approved_at
from nodes n
join node_versions v on v.id = n.active_version_id
join canvases      cv on cv.id = n.canvas_id
join clients       cl on cl.id = cv.client_id
where n.type in ('image-gen', 'video-gen');

-- One call per list page, not one query per row. PRD §8's free-tier constraint is not
-- theoretical here: the client list renders for every org member on every visit.
--
-- Returns BOTH groupings from one scan so the two levels cannot disagree at runtime
-- either — the client list sums these rows, the canvas list reads them directly.
create or replace function org_review_counts(p_org_id uuid)
returns table (client_id uuid, canvas_id uuid, pending int)
language sql
stable
as $$
  select client_id, canvas_id, count(*)::int
    from review_queue_items
   where org_id = p_org_id
     and approval_status = 'pending'
   group by client_id, canvas_id;
$$;
```

> **On `security_invoker`:** deliberately omitted. Every read goes through
> `createServerSupabase()` (service-role, bypasses RLS) with an explicit
> `.eq("org_id", orgId)` — the same shape as every other repo function here. The view is
> never read directly from the browser, so an invoker-rights view would add a
> failure mode without adding a guarantee.

- [ ] **Step 2: Append to the pending list**

In `docs/superpowers/plans/MIGRATIONS-PENDING.md`, replace the parenthetical note about
0031 with a real entry under **Pending**:

```markdown
- [ ] **`0031_review_queue.sql`** — M2
      `review_queue_items` view + `org_review_counts(p_org_id)` RPC.
      **Depends on 0030** (reads `node_versions.org_id` / `operator_user_id`) — apply in
      order. **Blocks:** every pending count, the drawer, the navbar inbox.
```

- [ ] **Step 3: Append to the migration ledger**

In `docs/auth-production-migration.md`, after the "Migration 0030" section:

```markdown
## Migration 0031 — review queue derivation (2026-08-21)

`supabase/migrations/0031_review_queue.sql`. Paste into the Supabase SQL editor → Run.
**Apply after 0030** — the view selects `node_versions.org_id` and `operator_user_id`,
both of which 0030 creates.

Adds the `review_queue_items` view (nodes joined to their ACTIVE version, assets only) and
`org_review_counts(p_org_id)`, which returns per-client and per-canvas pending counts in
one call.

Both statements are `create or replace`, so this is safe to re-run.

**Verify after running:**

```sql
-- expect a row per pending asset in the org; zero rows is correct on a quiet org
select count(*) from review_queue_items where approval_status = 'pending';

-- expect the two groupings to reconcile — this is R5.5 as a query
select (select coalesce(sum(pending),0) from org_review_counts('<org-uuid>')) as total;
```
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0031_review_queue.sql docs/superpowers/plans/MIGRATIONS-PENDING.md docs/auth-production-migration.md
git commit -m "feat(review): migration 0031 — review_queue_items view and counts RPC (D159)

Every review surface reads one derivation, so R5.5's three-levels-agree is
structural rather than a convention three queries have to honour. Joining on
active_version_id delivers R3.3 and R3.5 for free.

The RPC returns both groupings from one scan: one call per list page, not one
query per row (PRD §8).

Not yet applied — batched, see MIGRATIONS-PENDING.md.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 2: Pure queue logic

**Files:**
- Create: `src/lib/review/queue.ts`
- Create: `src/lib/review/queue.test.ts`

**Interfaces:**
- Consumes: `OrgRole` from `@/lib/dal-logic`; `ApprovalStatus` from `@/lib/approval`.
- Produces:
  - `type ReviewCountRow = { clientId: string; canvasId: string; pending: number }`
  - `type ReviewCounts = { byClient: Record<string, number>; byCanvas: Record<string, number>; total: number }`
  - `summarizeCounts(rows: ReviewCountRow[]): ReviewCounts`
  - `type InboxItem = { versionId: string; nodeId: string; nodeType: string; nodeTitle: string | null; clientSlug: string; canvasSlug: string; canvasName: string; clientName: string; output: string | null; approvalStatus: ApprovalStatus; note: string | null; operatorUserId: string | null; makerName: string | null; createdAt: string }`
  - `selectInboxFor(role: OrgRole, userId: string, items: InboxItem[]): InboxItem[]`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from "vitest";
import { summarizeCounts, selectInboxFor, type InboxItem } from "./queue";

describe("summarizeCounts", () => {
  it("groups by canvas and sums to a client", () => {
    const out = summarizeCounts([
      { clientId: "c1", canvasId: "v1", pending: 5 },
      { clientId: "c1", canvasId: "v2", pending: 2 },
      { clientId: "c2", canvasId: "v3", pending: 1 },
    ]);
    expect(out.byCanvas).toEqual({ v1: 5, v2: 2, v3: 1 });
    expect(out.byClient).toEqual({ c1: 7, c2: 1 });
    expect(out.total).toBe(8);
  });

  it("is empty for no rows", () => {
    expect(summarizeCounts([])).toEqual({ byClient: {}, byCanvas: {}, total: 0 });
  });

  // R5.5 as an executable invariant, not an assumption. If this can ever fail, the
  // client and canvas pages disagree and users stop trusting every badge in the product.
  it("INVARIANT R5.5: a client's count equals the sum of its canvases'", () => {
    const rows = [
      { clientId: "c1", canvasId: "v1", pending: 3 },
      { clientId: "c1", canvasId: "v2", pending: 9 },
      { clientId: "c1", canvasId: "v3", pending: 0 },
      { clientId: "c2", canvasId: "v4", pending: 4 },
    ];
    const out = summarizeCounts(rows);
    for (const clientId of new Set(rows.map((r) => r.clientId))) {
      const sum = rows
        .filter((r) => r.clientId === clientId)
        .reduce((a, r) => a + r.pending, 0);
      expect(out.byClient[clientId]).toBe(sum);
    }
  });
});

function item(over: Partial<InboxItem>): InboxItem {
  return {
    versionId: "v", nodeId: "n", nodeType: "image-gen", nodeTitle: "Shot 03",
    clientSlug: "aurora", canvasSlug: "spring", canvasName: "Spring Reel",
    clientName: "Aurora", output: null, approvalStatus: "pending", note: null,
    operatorUserId: "ruby", makerName: "Ruby", createdAt: "2026-08-21T00:00:00Z",
    ...over,
  };
}

describe("selectInboxFor", () => {
  const pendingOther = item({ versionId: "p1", approvalStatus: "pending", operatorUserId: "someone" });
  const rejectedMine = item({ versionId: "r1", approvalStatus: "changes_requested", operatorUserId: "me" });
  const rejectedOther = item({ versionId: "r2", approvalStatus: "changes_requested", operatorUserId: "someone" });
  const approved = item({ versionId: "a1", approvalStatus: "approved" });
  const all = [pendingOther, rejectedMine, rejectedOther, approved];

  it("designer sees only their OWN rejected work — R9.5", () => {
    const out = selectInboxFor("designer", "me", all);
    expect(out.map((i) => i.versionId)).toEqual(["r1"]);
  });

  it("senior sees everything pending, plus their own rejected work", () => {
    const out = selectInboxFor("senior", "me", all);
    expect(out.map((i) => i.versionId).sort()).toEqual(["p1", "r1"]);
  });

  it("owner is treated exactly as senior", () => {
    expect(selectInboxFor("owner", "me", all)).toEqual(selectInboxFor("senior", "me", all));
  });

  it("never includes approved work for anyone", () => {
    for (const role of ["designer", "senior", "owner"] as const) {
      expect(selectInboxFor(role, "me", all).some((i) => i.approvalStatus === "approved")).toBe(false);
    }
  });

  it("a senior does not see OTHER people's rejected work — that is the maker's to fix", () => {
    expect(selectInboxFor("senior", "me", all).map((i) => i.versionId)).not.toContain("r2");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/review/queue.test.ts`
Expected: FAIL — cannot resolve `./queue`.

- [ ] **Step 3: Implement**

```ts
import type { OrgRole } from "@/lib/dal-logic";
import type { ApprovalStatus } from "@/lib/approval";

// One row of org_review_counts (migration 0031), already grouped by the database.
export type ReviewCountRow = { clientId: string; canvasId: string; pending: number };

export type ReviewCounts = {
  byClient: Record<string, number>;
  byCanvas: Record<string, number>;
  total: number;
};

// R5.5: the client figure is DERIVED from the canvas figures rather than queried
// separately, so the two cannot disagree. This is the whole reason both groupings come
// back from one RPC scan.
export function summarizeCounts(rows: ReviewCountRow[]): ReviewCounts {
  const byClient: Record<string, number> = {};
  const byCanvas: Record<string, number> = {};
  let total = 0;
  for (const row of rows) {
    byCanvas[row.canvasId] = (byCanvas[row.canvasId] ?? 0) + row.pending;
    byClient[row.clientId] = (byClient[row.clientId] ?? 0) + row.pending;
    total += row.pending;
  }
  return { byClient, byCanvas, total };
}

// One row of the navbar popover / review drawer.
export type InboxItem = {
  versionId: string;
  nodeId: string;
  nodeType: string;
  nodeTitle: string | null;
  clientName: string;
  clientSlug: string;
  canvasName: string;
  canvasSlug: string;
  output: string | null;
  approvalStatus: ApprovalStatus;
  note: string | null;
  operatorUserId: string | null;
  makerName: string | null; // resolved display name, or the legacy string (R11.4)
  createdAt: string;
};

// R9.5 — ONE control, one meaning: "things waiting on you."
//
//   designer        -> their own rejected work (what they must fix)
//   senior | owner  -> everything pending review, PLUS their own rejected work
//
// A senior whose own asset was rejected sees it too, which is why the two clauses are a
// union rather than a branch. A senior does NOT see other people's rejections: those are
// waiting on the maker, not on them.
export function selectInboxFor(
  role: OrgRole,
  userId: string,
  items: InboxItem[],
): InboxItem[] {
  const mineRejected = (i: InboxItem) =>
    i.approvalStatus === "changes_requested" && i.operatorUserId === userId;

  if (role === "designer") return items.filter(mineRejected);
  return items.filter((i) => i.approvalStatus === "pending" || mineRejected(i));
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/review/queue.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/review/
git commit -m "feat(review): pure count summing and role-scoped inbox selection

R5.5 is asserted as a named invariant test rather than assumed: a client's count
must equal the sum of its canvases'. If that can drift, users stop trusting every
badge in the product.

selectInboxFor is a union rather than a branch so a senior whose own work was
rejected still sees it (R9.5), while other people's rejections stay with the maker.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 3: Repository layer

**Files:**
- Create: `src/lib/db/review.ts`

**Interfaces:**
- Consumes: `summarizeCounts`, `InboxItem` (Task 2); `resolveDisplayNames` (M1, `src/lib/db/profiles.ts`); `createServerSupabase`.
- Produces:
  - `getOrgReviewCounts(orgId: string): Promise<ReviewCounts>`
  - `listCanvasPendingItems(orgId: string, canvasId: string): Promise<InboxItem[]>`
  - `listOrgReviewInbox(orgId: string, userId: string, role: OrgRole): Promise<InboxItem[]>`

- [ ] **Step 1: Implement**

```ts
import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import { resolveDisplayNames } from "./profiles";
import {
  summarizeCounts,
  selectInboxFor,
  type ReviewCounts,
  type InboxItem,
} from "@/lib/review/queue";
import type { OrgRole } from "@/lib/dal-logic";
import type { ApprovalStatus } from "@/lib/approval";

// Shape the view returns. Kept local: it is a projection, not a domain type.
type QueueRow = {
  org_id: string;
  client_id: string;
  client_name: string;
  client_slug: string;
  canvas_id: string;
  canvas_name: string;
  canvas_slug: string;
  node_id: string;
  node_type: string;
  node_title: string | null;
  version_id: string;
  output: unknown;
  approval_status: ApprovalStatus;
  note: string | null;
  operator_user_id: string | null;
  operator: string | null;
  created_at: string;
};

const QUEUE_COLUMNS =
  "org_id, client_id, client_name, client_slug, canvas_id, canvas_name, canvas_slug, " +
  "node_id, node_type, node_title, version_id, output, approval_status, note, " +
  "operator_user_id, operator, created_at";

// R5.1/R5.2/R5.3 — one RPC call, never one query per row (PRD §8).
export async function getOrgReviewCounts(orgId: string): Promise<ReviewCounts> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase.rpc("org_review_counts", { p_org_id: orgId });
  if (error) throw error;
  return summarizeCounts(
    ((data ?? []) as { client_id: string; canvas_id: string; pending: number }[]).map((r) => ({
      clientId: r.client_id,
      canvasId: r.canvas_id,
      pending: r.pending,
    })),
  );
}

// Resolves maker names in ONE round trip for the whole page of rows, then maps. Doing it
// per row would be the N+1 that PRD §8 warns about, in a different costume.
async function toInboxItems(orgId: string, rows: QueueRow[]): Promise<InboxItem[]> {
  const names = await resolveDisplayNames(
    orgId,
    rows.map((r) => r.operator_user_id).filter((id): id is string => !!id),
  );
  return rows.map((r) => ({
    versionId: r.version_id,
    nodeId: r.node_id,
    nodeType: r.node_type,
    nodeTitle: r.node_title,
    clientName: r.client_name,
    clientSlug: r.client_slug,
    canvasName: r.canvas_name,
    canvasSlug: r.canvas_slug,
    output: typeof r.output === "string" ? r.output : null,
    approvalStatus: r.approval_status,
    note: r.note,
    operatorUserId: r.operator_user_id,
    // R11.3 -> R11.4: the current display name, else the legacy free-text operator, else
    // nothing. Degrades visibly; never blocks the row from rendering.
    makerName: (r.operator_user_id && names.get(r.operator_user_id)) || r.operator || null,
    createdAt: r.created_at,
  }));
}

// R6.1/R6.2 — the canvas review drawer. Pending only: the drawer holds what is still
// outstanding (R6.6), so an item leaves it the moment it is decided.
export async function listCanvasPendingItems(
  orgId: string,
  canvasId: string,
): Promise<InboxItem[]> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("review_queue_items")
    .select(QUEUE_COLUMNS)
    .eq("org_id", orgId)
    .eq("canvas_id", canvasId)
    .eq("approval_status", "pending")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return toInboxItems(orgId, (data ?? []) as QueueRow[]);
}

// R9.1/R9.5 — the org-wide navbar popover. Fetches both actionable states and lets the
// pure selector decide, so the role rule lives in exactly one tested place.
export async function listOrgReviewInbox(
  orgId: string,
  userId: string,
  role: OrgRole,
): Promise<InboxItem[]> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("review_queue_items")
    .select(QUEUE_COLUMNS)
    .eq("org_id", orgId)
    .in("approval_status", ["pending", "changes_requested"])
    .order("created_at", { ascending: false });
  if (error) throw error;
  const items = await toInboxItems(orgId, (data ?? []) as QueueRow[]);
  return selectInboxFor(role, userId, items);
}
```

- [ ] **Step 2: Verify nothing regressed**

Run: `npx vitest run`
Expected: 0 failures.

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/lib/db/review.ts
git commit -m "feat(review): repository layer over the review_queue_items view

Every function is a filter over the one view — counts, the canvas drawer, and the
org-wide inbox — so the surfaces cannot drift apart.

Maker names resolve in one round trip per page of rows rather than per row, which
is the N+1 PRD §8 warns about wearing a different costume. Attribution falls back
from resolved name to legacy operator string to nothing (R11.4).

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 4: The counts endpoint

**Files:**
- Create: `src/app/api/review/counts/route.ts`

**Interfaces:**
- Consumes: `getOrgReviewCounts` (Task 3); `resolveOrgId`; `apiOk`.
- Produces: `GET /api/review/counts` → `{ byClient, byCanvas, total }`.

- [ ] **Step 1: Implement**

```ts
import { getOrgReviewCounts } from "@/lib/db/review";
import { resolveOrgId } from "@/lib/dal";
import { apiOk, withTryCatch } from "@/lib/api/route-helpers";

// The refetch target for useReviewCounts (R8.1). List pages seed their counts server-side;
// this exists so a Realtime ping can refresh them without a full navigation.
//
// No org id parameter by design — it is resolved from the session (honouring an active
// impersonation via resolveOrgId), so a caller cannot ask for another org's counts.
export async function GET() {
  return withTryCatch("Failed to load review counts", async () => {
    const orgId = await resolveOrgId();
    return apiOk(await getOrgReviewCounts(orgId));
  });
}
```

- [ ] **Step 2: Typecheck and commit**

Run: `npx tsc --noEmit -p tsconfig.json` → clean.

```bash
git add src/app/api/review/counts/route.ts
git commit -m "feat(review): GET /api/review/counts

Takes no org parameter — the org comes from the session via resolveOrgId, so a
caller cannot request another org's counts by changing a query string.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 5: Realtime channel and the counts hook

**Files:**
- Create: `src/lib/realtime/org-version-updates.ts`
- Create: `src/hooks/use-review-counts.ts`

**Interfaces:**
- Consumes: `createBrowserSupabase`; `useIdentity` (for `orgId`); `ReviewCounts` (Task 2).
- Produces:
  - `subscribeToOrgVersionUpdates(orgId: string, onChange: () => void): () => void`
  - `useReviewCounts(initial: ReviewCounts): ReviewCounts`

- [ ] **Step 1: Implement the channel**

This is a near-copy of `org-generation-updates.ts`. Read that file first — its comments
record two bugs that cost real time, and both apply here verbatim.

```ts
"use client";

import { createBrowserSupabase } from "@/lib/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

// One shared Realtime channel per org for `node_versions` changes — the sibling of
// org-generation-updates.ts, and it inherits both of that file's hard-won lessons:
//
//   1. Filter on org_id explicitly. RLS alone silently DROPS postgres_changes rows; only
//      an explicit column filter reliably delivers them. node_versions could not be
//      filtered this way at all until migration 0030 added the column.
//   2. Await the session BEFORE subscribing. Subscribing first opens the websocket with
//      no JWT, so RLS evaluates auth.uid() as null and every row is dropped.
//
// event: "*" because both directions are requirements — INSERT drives R8.2 (a senior
// watching sees the count rise as a junior generates), UPDATE drives R8.3 (a junior
// watching sees their badge change when a senior decides).
//
// Subscribers get a bare "something changed" ping rather than the row: every consumer
// re-derives from the server anyway (the counts are a grouped aggregate, not something
// a single row can be patched into), so passing the payload would invite someone to
// try to patch state locally and drift from the derivation.
const channels = new Map<string, RealtimeChannel>();
const listeners = new Map<string, Set<() => void>>();
const pendingOrgIds = new Set<string>();

export function subscribeToOrgVersionUpdates(
  orgId: string,
  onChange: () => void,
): () => void {
  if (!listeners.has(orgId)) listeners.set(orgId, new Set());
  listeners.get(orgId)!.add(onChange);

  if (!channels.has(orgId) && !pendingOrgIds.has(orgId)) {
    pendingOrgIds.add(orgId);
    const supabase = createBrowserSupabase();
    void supabase.auth.getSession().then(() => {
      pendingOrgIds.delete(orgId);
      if (!listeners.has(orgId)) return; // everyone unsubscribed before this resolved
      const channel = supabase
        .channel(`org-version-updates:${orgId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "node_versions",
            filter: `org_id=eq.${orgId}`,
          },
          () => {
            listeners.get(orgId)?.forEach((cb) => cb());
          },
        )
        .subscribe();
      channels.set(orgId, channel);
    });
  }

  return () => {
    const set = listeners.get(orgId);
    if (!set) return;
    set.delete(onChange);
    if (set.size === 0) {
      listeners.delete(orgId);
      const ch = channels.get(orgId);
      if (ch) {
        void createBrowserSupabase().removeChannel(ch);
        channels.delete(orgId);
      }
    }
  };
}
```

- [ ] **Step 2: Implement the hook**

```ts
"use client";

import { useEffect, useRef, useState } from "react";
import { useIdentity } from "./use-identity";
import { subscribeToOrgVersionUpdates } from "@/lib/realtime/org-version-updates";
import { authFetch } from "@/lib/supabase/session-ready";
import type { ReviewCounts } from "@/lib/review/queue";

// Coalesces a burst of version writes (a batch duplicate, several generations landing at
// once) into one refetch instead of one per row.
const REFETCH_DEBOUNCE_MS = 400;

// R8.1: counts update live without a reload. Seeded from the server-rendered value so
// the first paint is already correct and there is no flash of zero.
//
// R8.5 is the load-bearing part: on a failed refetch or a dropped connection the hook
// KEEPS THE LAST KNOWN COUNTS. It never falls back to zero. A confidently wrong "nothing
// to review" is worse than a stale number, because it is indistinguishable from being
// finished — the user stops looking.
export function useReviewCounts(initial: ReviewCounts): ReviewCounts {
  const [counts, setCounts] = useState<ReviewCounts>(initial);
  const { orgId } = useIdentity();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Re-seed when the server sends a newer value (a navigation or router.refresh()).
  useEffect(() => setCounts(initial), [initial]);

  useEffect(() => {
    if (!orgId) return;

    const refetch = async () => {
      try {
        const res = await authFetch("/api/review/counts", { cache: "no-store" });
        if (!res.ok) return; // R8.5 — keep what we have
        setCounts((await res.json()) as ReviewCounts);
      } catch {
        // R8.5 — offline or mid-refresh; the next event will try again.
      }
    };

    const unsubscribe = subscribeToOrgVersionUpdates(orgId, () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => void refetch(), REFETCH_DEBOUNCE_MS);
    });

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      unsubscribe();
    };
  }, [orgId]);

  return counts;
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: clean. If `authFetch` is not exported from `@/lib/supabase/session-ready`,
check `src/hooks/use-identity.ts`'s import — it uses the same helper.

- [ ] **Step 4: Commit**

```bash
git add src/lib/realtime/org-version-updates.ts src/hooks/use-review-counts.ts
git commit -m "feat(review): live pending counts over a shared node_versions channel

Near-copy of org-generation-updates.ts, inheriting both of its recorded bugs: filter
on org_id explicitly (RLS alone silently drops postgres_changes rows) and await the
session before subscribing (or the socket opens with no JWT and every row is
dropped). node_versions could not be filtered this way until 0030 added the column.

event \"*\" because both directions are requirements: INSERT drives R8.2, UPDATE
drives R8.3.

On a failed refetch the hook keeps its last known counts and never falls back to
zero (R8.5) — a confident \"nothing to review\" is worse than a stale number,
because it is indistinguishable from being finished.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 6: The count pill

**Files:**
- Create: `src/components/shared/pending-count-pill.tsx`

**Interfaces:**
- Produces: `<PendingCountPill count={number} scope="client" | "canvas" | "org" />`

- [ ] **Step 1: Implement**

```tsx
import { cn } from "@/lib/utils";

// D154/R5.8: a NEUTRAL pill carrying a single amber dot.
//
// Red is deliberately not reachable from this component (R5.9). `changes_requested` owns
// the destructive token on ApprovalBadge; a red dot meaning "needs review" at the client
// level, resolving to a red badge meaning "was rejected" at the node level, would give one
// colour two meanings inside the single journey R5.7 describes.
//
// R5.10: the treatment stays quiet on purpose. A page where every row carries a count must
// still read as a list, not an alarm — which is why the pill is neutral and only the 6px
// dot is coloured.
const SCOPE_LABEL: Record<string, string> = {
  client: "awaiting review across this client's canvases",
  canvas: "awaiting review on this canvas",
  org: "awaiting review across your organization",
};

export function PendingCountPill({
  count,
  scope,
  className,
}: {
  count: number;
  scope: "client" | "canvas" | "org";
  className?: string;
}) {
  // R5.1: zero renders NOTHING — no empty badge, no muted "0". A resolved row should look
  // resolved.
  if (count <= 0) return null;

  return (
    <span
      // R9.8: each surface states its own scope, so a navbar reading of 12 beside a canvas
      // reading of 5 is obviously two questions answered rather than a bug.
      title={`${count} ${SCOPE_LABEL[scope]}`}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2 py-0.5",
        "text-xs font-semibold tabular-nums text-muted-foreground",
        className,
      )}
    >
      <span className="size-1.5 shrink-0 rounded-full bg-amber-500" />
      {count}
    </span>
  );
}
```

- [ ] **Step 2: Typecheck and commit**

Run: `npx tsc --noEmit -p tsconfig.json` → clean.

```bash
git add src/components/shared/pending-count-pill.tsx
git commit -m "feat(review): neutral pending-count pill with a single amber dot (D154)

Red is not reachable from this component by construction (R5.9): changes_requested
owns the destructive token, and one colour meaning \"needs review\" at the client
level and \"was rejected\" at the node level would break the single journey R5.7
describes.

Zero renders nothing (R5.1) and the treatment stays quiet (R5.10) — a page where
every row is flagged must still read as a list, not an alarm.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 7: Wire counts into the two list pages

**Files:**
- Modify: `src/app/page.tsx`
- Modify: `src/components/clients/clients-home-tabs.tsx`
- Modify: `src/components/clients/clients-table.tsx`
- Modify: `src/app/clients/[id]/page.tsx`
- Modify: `src/components/canvases/canvases-table.tsx`

**Interfaces:**
- Consumes: `getOrgReviewCounts` (Task 3), `useReviewCounts` (Task 5), `PendingCountPill` (Task 6).

- [ ] **Step 1: Seed the client list server-side**

In `src/app/page.tsx`, add `getOrgReviewCounts` to the existing `Promise.all` (it is
already parallel — do not add a serial await) and pass it down:

```tsx
import { getOrgReviewCounts } from "@/lib/db/review";
// …
  const [clients, archivedClients, recentCanvases, reviewCounts] = await Promise.all([
    listClients(effectiveOrgId),
    listArchivedClients(effectiveOrgId),
    listRecentCanvases(effectiveOrgId),
    getOrgReviewCounts(effectiveOrgId),
  ]);

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-14">
      <ClientsHomeTabs
        clients={clients}
        archivedClients={archivedClients}
        recentCanvases={recentCanvases}
        reviewCounts={reviewCounts}
      />
    </main>
  );
```

- [ ] **Step 2: Thread it through the tabs**

In `src/components/clients/clients-home-tabs.tsx`, add the prop and subscribe once at this
level — one hook instance, not one per row:

```tsx
import { useReviewCounts } from "@/hooks/use-review-counts";
import type { ReviewCounts } from "@/lib/review/queue";
// …
export function ClientsHomeTabs({
  clients,
  archivedClients,
  recentCanvases,
  reviewCounts,
}: {
  clients: ClientWithCount[];
  archivedClients: ClientWithCount[];
  recentCanvases: RecentCanvas[];
  reviewCounts: ReviewCounts;
}) {
  const [tab, setTab] = useState("clients");
  // R8.1/R8.2: one subscription for the whole page. Seeded from the server value so the
  // first paint is already correct.
  const liveCounts = useReviewCounts(reviewCounts);
```

Pass `counts={liveCounts.byClient}` to the **non-archived** `<ClientsTable>` only.
Archived clients are a recovery view; flagging review work there would point at canvases
nobody is meant to be working on.

- [ ] **Step 3: Render the pill on a client row**

In `src/components/clients/clients-table.tsx`, accept the prop and render it beside the
KB badge:

```tsx
import { PendingCountPill } from "@/components/shared/pending-count-pill";
// …
export function ClientsTable({
  clients,
  archived = false,
  counts = {},
}: {
  clients: ClientWithCount[];
  archived?: boolean;
  counts?: Record<string, number>;
}) {
```

and in the row's right-hand cell:

```tsx
                  <span className="flex flex-1 items-center justify-end gap-2">
                    <PendingCountPill count={counts[client.id] ?? 0} scope="client" />
                    <KBStatusBadge status={client.kb_status} />
                  </span>
```

> `counts` defaults to `{}` so the archived table keeps working unchanged — and, because
> the pill renders null at zero, an unwired call site degrades to showing nothing rather
> than to showing a wrong number.

- [ ] **Step 4: Seed and render the canvas list**

In `src/app/clients/[id]/page.tsx`, fetch counts alongside the canvases:

```tsx
import { getOrgReviewCounts } from "@/lib/db/review";
// …
  const [canvases, reviewCounts] = await Promise.all([
    listCanvases(client.id),
    getOrgReviewCounts(effectiveOrgId),
  ]);
```

and pass `reviewCounts={reviewCounts}` to `<CanvasesTable>`.

In `src/components/canvases/canvases-table.tsx`:

```tsx
import { useReviewCounts } from "@/hooks/use-review-counts";
import { PendingCountPill } from "@/components/shared/pending-count-pill";
import type { ReviewCounts } from "@/lib/review/queue";
// …
export function CanvasesTable({
  canvases,
  clientSlug,
  reviewCounts,
}: {
  canvases: CanvasRow[];
  clientSlug: string;
  reviewCounts: ReviewCounts;
}) {
  const liveCounts = useReviewCounts(reviewCounts);
```

Render the pill in the row, immediately after the canvas name. **It must sit inside the
`pointer-events-none` overlay div** (the row uses a stretched `<Link>` for navigation), so
do not give it its own link or pointer events:

```tsx
                    <span className="flex-3 flex items-center gap-2 font-medium">
                      {canvas.name}
                      <PendingCountPill count={liveCounts.byCanvas[canvas.id] ?? 0} scope="canvas" />
                    </span>
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: clean. This is the real gate — vitest does not compile these pages.

- [ ] **Step 6: Full suite and targeted lint**

Run: `npx vitest run` → 0 failures.
Run: `npm run lint 2>&1 | awk '/^C:/{f=$0} /error/{print f}' | sort -u` → confirm no file
touched by this task appears.

- [ ] **Step 7: Commit**

```bash
git add src/app/page.tsx "src/app/clients/[id]/page.tsx" src/components/clients/ src/components/canvases/
git commit -m "feat(review): pending counts on the client and canvas lists (R5.1-R5.3)

Counts are seeded server-side (so the first paint is correct, with no flash of
zero) and kept live by one subscription per page rather than one per row.

Both levels read the same RPC result, so R5.5 holds at runtime and not only in the
schema. Archived clients deliberately get no counts — it is a recovery view, and
flagging review work there would point at canvases nobody should be working on.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## M2 Acceptance

Requires migrations 0030 **and** 0031 to be applied, so this runs with the end-of-feature
batch rather than at the end of M2.

- [ ] A client row shows a pill whose number equals the sum of that client's canvas pills (R5.5, and the invariant test's real-world counterpart).
- [ ] A client with nothing pending shows **no pill at all** — not a zero (R5.1).
- [ ] Generating an asset as a junior makes a senior's open client list count rise, with no reload (R8.2).
- [ ] Approving as a senior makes the count fall on the junior's open page (R8.3).
- [ ] Killing the network leaves the last count on screen rather than zeroing it (R8.5).
- [ ] A page where many rows carry counts still reads as a list (R5.10) — a judgement call, made by looking.
- [ ] `npx vitest run` — 0 failures. `npx tsc --noEmit` — clean.

**M2 does not deliver** the canvas review drawer, the navbar inbox, or lock decoupling.
Those are M3.

## Self-Review Notes

**Spec coverage.** Design §4.1→T1/T3, §4.2→T6, §4.3→T5. PRD R3.x is satisfied by T1's view
joins rather than by procedural code — that is the point of D159. R4.1/R4.2 need no code:
there is no assignee column, which is the requirement.

**Deferred deliberately:** R5.3 (the canvas-level control) lands in M3 with the drawer it
opens — a control that opens nothing would be a worse intermediate state than no control.

**One judgement made here:** archived clients get no counts. The PRD does not mention
archived clients; flagging them seemed clearly wrong, and the alternative (counting them)
would inflate a client total that R5.5 says must equal the sum of visible canvases.
