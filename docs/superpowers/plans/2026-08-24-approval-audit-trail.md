# Approval Audit Trail & Designer-Side Approval Signal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make "who approved this, and when" visible in the product (it is already captured correctly in the DB since PR #64), and give a maker a dismiss-on-view signal in their navbar inbox when their own work is approved — the inbox today only ever surfaces rejections.

**Architecture:** Three independent slices that share one new DB column. (1) Fix the versions API route to resolve real user references instead of a dead legacy text column, and surface that data in two UI locations (version history, live node). (2) Add `node_versions.approved_seen_at`, a new server action that stamps it, and one more OR-clause in the existing pure inbox selector/filter pair. (3) Wire the new action into both focus views' mount effect. No new tables, no new pages — every surface here already exists and is being extended.

**Tech Stack:** Next.js App Router, Supabase (Postgres + PostgREST), TypeScript, Vitest, Tailwind, shadcn/Base UI.

## Global Constraints

- Controls in JSX must be shadcn primitives from `src/components/ui/*` — never raw `<button>`/`<input>`/etc. (project-wide rule; this plan adds no new interactive controls, only text, so this mostly doesn't bite — flagged for the one place it could: none of the new UI is a control).
- Reuse canonical utilities — never redeclare. This plan explicitly reuses `resolveDisplayNames` (`src/lib/db/profiles.ts`) and `formatRelativeTime` (`src/lib/format/relative-time.ts`) rather than writing new equivalents.
- Server actions resolve identity via `resolveCallerContext()` — never trust a client-supplied user id (D166's pattern, reused for the new action).
- Every new/changed pure-logic module gets a Vitest unit test before the implementation (TDD), matching this codebase's existing `queue.test.ts` / `approval.test.ts` style.
- Decisions D168–D172 (already recorded in `docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md` §7) are the source of truth for *why*; this plan is the *how*.

---

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/0032_approval_seen.sql` | New | `approved_seen_at` column, backfill, `review_queue_items` view gains two columns |
| `src/lib/db/types.ts` | Modify | `NodeVersionRow` gains the columns migrations 0030/0032 actually added |
| `src/lib/review/queue.ts` | Modify | `InboxItem` gains 2 fields; `selectInboxFor`/`inboxFilterFor` gain the unseen-approval clause |
| `src/lib/review/queue.test.ts` | Modify | Tests for the new clause, in both representations |
| `src/lib/db/review.ts` | Modify | `QUEUE_COLUMNS`/`QueueRow`/`toInboxItems` carry the 2 new fields through |
| `src/lib/actions/approval.ts` | Modify | New `markVersionApprovalSeenAction` |
| `src/lib/actions/approval.test.ts` | Modify | Tests for the new action |
| `src/app/api/nodes/[id]/versions/route.ts` | Modify | Resolve `makerName`/`approvedByName` via `resolveDisplayNames`; drop dead `approvedBy` |
| `src/components/nodes/image-gen-version-history.tsx` | Modify | `ImageGenVersionSummary` gains 2 fields; render the audit line |
| `src/components/nodes/video-gen-version-history.tsx` | Modify | `VideoGenVersionSummary` gains 2 fields; render the audit line |
| `src/lib/video-gen/api.ts` | Modify | `videoGenApi.fetchVersions` carries the 2 new fields through |
| `src/components/nodes/inline-approval-bar.tsx` | Modify | `ApprovalReadout` gains an "Approved by X · time" line |
| `src/components/nodes/image-gen-focus-view.tsx` | Modify | Thread the 2 new fields into state + `InlineApprovalBar`; fire the mark-seen effect |
| `src/components/nodes/video-gen-focus-view.tsx` | Modify | Same as above |
| `src/components/identity/review-inbox.tsx` | Modify | Second popover tag for `approvalStatus === "approved"` |

---

### Task 1: Migration — `approved_seen_at` column, backfill, view update

**Files:**
- Create: `supabase/migrations/0032_approval_seen.sql`

**Interfaces:**
- Produces: `node_versions.approved_seen_at timestamptz` (nullable). `review_queue_items` view now also selects `v.approved_by_user_id` and `v.approved_seen_at` (previously the view selected neither — confirmed by reading `supabase/migrations/0031_review_queue.sql`, whose `select` list stops at `v.operator, v.created_at, v.approved_at`).

- [ ] **Step 1: Write the migration**

```sql
-- D170/D172: a maker's approval notification is a dismiss-on-view read receipt, not a
-- queue table or a timer. approved_seen_at is set once, when the maker's own focus view
-- renders their approved, unseen active version (markVersionApprovalSeenAction).
--
-- D172: rows already approved when this ships are backfilled as already-seen, so the
-- deploy does not retroactively flood every maker's inbox with historical approvals —
-- the mechanism only governs approvals that happen from here forward.

alter table node_versions add column approved_seen_at timestamptz;

update node_versions
   set approved_seen_at = approved_at
 where approval_status = 'approved'
   and approved_seen_at is null;

-- Recreated with two more columns so inboxFilterFor (src/lib/review/queue.ts) can filter
-- on them via PostgREST .or() — a column must exist in the queried view even when it is
-- not in the caller's .select() list. Every other column and join is unchanged from 0031.
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
  n.data ->> 'title' as node_title,
  v.id    as version_id,
  v.output,
  v.approval_status,
  v.note,
  v.operator_user_id,
  v.operator,
  v.approved_by_user_id,
  v.approved_seen_at,
  v.created_at,
  v.approved_at
from nodes n
join node_versions v on v.id = n.active_version_id
join canvases      cv on cv.id = n.canvas_id
join clients       cl on cl.id = cv.client_id
where n.type in ('image-gen', 'video-gen');
```

- [ ] **Step 2: Apply the migration locally and verify the backfill**

Run: `npx supabase db reset` (or your project's normal local-migration-apply command — check `package.json` scripts for the exact one this repo uses, e.g. `npm run db:migrate`, before assuming `supabase db reset`).

Then verify in the SQL editor / psql:
```sql
select approval_status, approved_at, approved_seen_at
  from node_versions
 where approval_status = 'approved'
 limit 5;
```
Expected: every row's `approved_seen_at` equals its `approved_at` (not null).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0032_approval_seen.sql
git commit -m "feat(approval): add approved_seen_at, backfill existing approvals as seen (D170/D172)"
```

---

### Task 2: Extend `NodeVersionRow` to match the actual table

**Files:**
- Modify: `src/lib/db/types.ts:76-95`

**Interfaces:**
- Consumes: nothing new.
- Produces: `NodeVersionRow` now has `org_id: string | null`, `operator_user_id: string | null`, `approved_by_user_id: string | null`, `approved_seen_at: string | null` — columns that have existed on the table since migration 0030 (org_id, operator_user_id, approved_by_user_id) and 0032 (approved_seen_at) but were never added to this type. Task 3 and Task 5 both read these fields off rows typed as `NodeVersionRow`.

- [ ] **Step 1: Update the type**

In `src/lib/db/types.ts`, replace the existing `NodeVersionRow` (lines 76-95):

```typescript
export type NodeVersionRow = {
  id: string;
  node_id: string;
  org_id: string | null;
  inputs_used: Record<string, unknown>;
  params_used: Record<string, unknown>;
  model_used: string | null;
  output: unknown;
  // Frozen at generation, never mutated by edits (D22). The immutable record of the
  // model's raw attempt; `output` is the editable working copy that may diverge from it.
  generated_output: unknown;
  error: string | null;
  decision: string | null;
  note: string | null;
  operator: string | null;
  // R11.1: the maker as a real user reference. `operator` above is the legacy free-text
  // column, kept only so pre-migration rows still read (R11.4).
  operator_user_id: string | null;
  // D29 maker-checker approval flag (distinct from `decision`, the D22 quality signal).
  approval_status: "pending" | "approved" | "changes_requested";
  approved_by: string | null;
  // R11.2: the reviewer as a real user reference. `approved_by` above is never written
  // again (D167).
  approved_by_user_id: string | null;
  approved_at: string | null;
  // D170: set once, when the maker's own focus view has shown them an approved active
  // version. Null until then; backfilled to approved_at for pre-existing rows (D172).
  approved_seen_at: string | null;
  created_at: string;
};
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors (this is a type widening — every existing consumer that destructures a subset of fields still compiles).

- [ ] **Step 3: Commit**

```bash
git add src/lib/db/types.ts
git commit -m "fix(types): NodeVersionRow matches the columns node_versions actually has"
```

---

### Task 3: `queue.ts` — the unseen-approval clause (TDD)

**Files:**
- Modify: `src/lib/review/queue.ts:31-79`
- Modify: `src/lib/review/queue.test.ts`
- Modify: `src/lib/db/review.ts` (the DB layer that constructs `InboxItem` — must be updated in the same task, or the type change fails to compile)

**Interfaces:**
- Consumes: nothing new from other tasks.
- Produces: `InboxItem` gains `approvedByUserId: string | null` and `approvedSeenAt: string | null`. `selectInboxFor(role, userId, items)` and `inboxFilterFor(role, userId)` both now also match "approved, mine, not self-approved, not yet seen" rows for every role. `listOrgReviewInbox`/`listCanvasPendingItems` (`src/lib/db/review.ts`) now select and map both new columns. Task 9 relies on `approvalStatus` already flowing through (unchanged); Task 10 relies on it too.

- [ ] **Step 1: Write the failing tests**

Add to `src/lib/review/queue.test.ts`, inside the existing `item()` fixture helper — extend its default shape (find the `function item(over: Partial<InboxItem>): InboxItem {` block, currently ending `createdAt: "2026-08-21T00:00:00Z", ...over, };`) to include the two new fields with harmless defaults:

```typescript
function item(over: Partial<InboxItem>): InboxItem {
  return {
    versionId: "v",
    nodeId: "n",
    nodeType: "image-gen",
    nodeTitle: "Shot 03",
    clientName: "Aurora",
    clientSlug: "aurora",
    canvasName: "Spring Reel",
    canvasSlug: "spring",
    output: null,
    approvalStatus: "pending",
    note: null,
    operatorUserId: "ruby",
    makerName: "Ruby",
    approvedByUserId: null,
    approvedSeenAt: null,
    createdAt: "2026-08-21T00:00:00Z",
    ...over,
  };
}
```

Then add a new `describe` block after the existing `describe("selectInboxFor", ...)` block:

```typescript
describe("selectInboxFor — unseen approvals (D170/D171)", () => {
  const myApprovedUnseen = item({
    versionId: "au1",
    approvalStatus: "approved",
    operatorUserId: "me",
    approvedByUserId: "senior-1",
    approvedSeenAt: null,
  });
  const mySelfApproved = item({
    versionId: "au2",
    approvalStatus: "approved",
    operatorUserId: "me",
    approvedByUserId: "me",
    approvedSeenAt: null,
  });
  const myApprovedSeen = item({
    versionId: "au3",
    approvalStatus: "approved",
    operatorUserId: "me",
    approvedByUserId: "senior-1",
    approvedSeenAt: "2026-08-24T00:00:00Z",
  });
  const othersApprovedUnseen = item({
    versionId: "au4",
    approvalStatus: "approved",
    operatorUserId: "someone-else",
    approvedByUserId: "senior-1",
    approvedSeenAt: null,
  });
  const all = [myApprovedUnseen, mySelfApproved, myApprovedSeen, othersApprovedUnseen];

  it("designer sees their own unseen approval — D170", () => {
    expect(selectInboxFor("designer", "me", all).map((i) => i.versionId)).toEqual(["au1"]);
  });

  it("senior/owner sees their own unseen approval too — D170 applies to every role", () => {
    for (const role of ["senior", "owner"] as const) {
      expect(selectInboxFor(role, "me", all).map((i) => i.versionId)).toContain("au1");
    }
  });

  it("self-approval never notifies — D171", () => {
    expect(selectInboxFor("designer", "me", all).map((i) => i.versionId)).not.toContain("au2");
  });

  it("an already-seen approval does not reappear", () => {
    expect(selectInboxFor("designer", "me", all).map((i) => i.versionId)).not.toContain("au3");
  });

  it("someone else's approval never appears in my inbox", () => {
    expect(selectInboxFor("designer", "me", all).map((i) => i.versionId)).not.toContain("au4");
  });
});
```

Finally, extend the `inboxFilterFor agrees with selectInboxFor` block's `evaluate()` helper and `fixtures` so the equivalence test covers the new clause. Replace the whole `describe("inboxFilterFor agrees with selectInboxFor", ...)` block with:

```typescript
describe("inboxFilterFor agrees with selectInboxFor", () => {
  // A deliberately small PostgREST `or`-filter evaluator — enough for the shapes this
  // function emits (`field.eq.X`, `field.neq.X`, `field.is.null`, and `and(...)`). If the
  // filter ever grows a shape this cannot parse, it throws rather than silently passing.
  function evaluate(filter: string, item: InboxItem): boolean {
    const clauses: string[] = [];
    let depth = 0;
    let current = "";
    for (const ch of filter) {
      if (ch === "(") depth++;
      if (ch === ")") depth--;
      if (ch === "," && depth === 0) {
        clauses.push(current);
        current = "";
        continue;
      }
      current += ch;
    }
    if (current) clauses.push(current);

    const field = (name: string): string | null => {
      switch (name) {
        case "approval_status":
          return item.approvalStatus;
        case "operator_user_id":
          return item.operatorUserId;
        case "approved_by_user_id":
          return item.approvedByUserId;
        case "approved_seen_at":
          return item.approvedSeenAt;
        default:
          throw new Error(`Unknown field: ${name}`);
      }
    };

    const evalOne = (clause: string): boolean => {
      const and = clause.match(/^and\((.*)\)$/);
      if (and) return and[1].split(",").every(evalOne);
      const isNull = clause.match(/^([a-z_]+)\.is\.null$/);
      if (isNull) return field(isNull[1]) === null;
      const neq = clause.match(/^([a-z_]+)\.neq\.(.*)$/);
      if (neq) return field(neq[1]) !== neq[2];
      const eq = clause.match(/^([a-z_]+)\.eq\.(.*)$/);
      if (eq) return field(eq[1]) === eq[2];
      throw new Error(`Unparsed filter clause: ${clause}`);
    };

    return clauses.some(evalOne);
  }

  const fixtures = [
    item({ versionId: "p1", approvalStatus: "pending", operatorUserId: "someone" }),
    item({ versionId: "p2", approvalStatus: "pending", operatorUserId: "me" }),
    item({ versionId: "r1", approvalStatus: "changes_requested", operatorUserId: "me" }),
    item({ versionId: "r2", approvalStatus: "changes_requested", operatorUserId: "someone" }),
    item({
      versionId: "au1",
      approvalStatus: "approved",
      operatorUserId: "me",
      approvedByUserId: "senior-1",
      approvedSeenAt: null,
    }),
    item({
      versionId: "au2",
      approvalStatus: "approved",
      operatorUserId: "me",
      approvedByUserId: "me",
      approvedSeenAt: null,
    }),
    item({
      versionId: "au3",
      approvalStatus: "approved",
      operatorUserId: "me",
      approvedByUserId: "senior-1",
      approvedSeenAt: "2026-08-24T00:00:00Z",
    }),
    item({
      versionId: "au4",
      approvalStatus: "approved",
      operatorUserId: "someone",
      approvedByUserId: "senior-1",
      approvedSeenAt: null,
    }),
  ];

  for (const role of ["designer", "senior", "owner"] as const) {
    it(`selects the same items for ${role}`, () => {
      const viaSql = fixtures
        .filter((i) => evaluate(inboxFilterFor(role, "me"), i))
        .map((i) => i.versionId);
      const viaJs = selectInboxFor(role, "me", fixtures).map((i) => i.versionId);
      expect(viaSql.sort()).toEqual(viaJs.sort());
    });
  }
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/review/queue.test.ts`
Expected: FAIL — `InboxItem` has no `approvedByUserId`/`approvedSeenAt` (TS error) and/or the new `versionId`s are missing from `selectInboxFor`'s output.

- [ ] **Step 3: Implement**

In `src/lib/review/queue.ts`, replace the `InboxItem` type (lines 31-46):

```typescript
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
  makerName: string | null; // resolved display name, else the legacy string (R11.4)
  // D170: who approved, and whether the maker has seen it yet. Not rendered anywhere —
  // read only by selectInboxFor/inboxFilterFor to decide inbox membership.
  approvedByUserId: string | null;
  approvedSeenAt: string | null;
  createdAt: string;
};
```

Replace `selectInboxFor` and `inboxFilterFor` (lines 48-79):

```typescript
// R9.5 — ONE control, one meaning: "things waiting on you."
//
//   designer        -> their own rejected work, PLUS their own unseen approvals (D170)
//   senior | owner  -> everything pending review, PLUS their own rejected work,
//                      PLUS their own unseen approvals
//
// The senior case is a union rather than a branch on purpose: a senior whose own asset was
// rejected — or approved by someone else — still needs to see it. And a senior does NOT
// see other people's rejections or approvals; those are waiting on the maker, not on them,
// which is the one place this workflow is person-specific (R4.3).
export function selectInboxFor(
  role: OrgRole,
  userId: string,
  items: InboxItem[],
): InboxItem[] {
  const mineRejected = (i: InboxItem) =>
    i.approvalStatus === "changes_requested" && i.operatorUserId === userId;

  // D170: a maker's approval notification, dismissed the moment they've seen it.
  // D171: self-approval never notifies — a senior approving their own work already knows.
  const mineApprovedUnseen = (i: InboxItem) =>
    i.approvalStatus === "approved" &&
    i.operatorUserId === userId &&
    i.approvedByUserId !== null &&
    i.approvedByUserId !== userId &&
    i.approvedSeenAt === null;

  if (role === "designer") return items.filter((i) => mineRejected(i) || mineApprovedUnseen(i));
  return items.filter(
    (i) => i.approvalStatus === "pending" || mineRejected(i) || mineApprovedUnseen(i),
  );
}

// The SAME rule as selectInboxFor, expressed as a PostgREST `or` filter so the database
// can page it. Filtering in JS after fetching would make every page the wrong size — ask
// for 25 and get 9 back once the role filter runs.
//
// Two expressions of one rule is a real risk, so queue.test.ts asserts they agree over a
// fixture set. If you change one, the test fails until you change the other.
export function inboxFilterFor(role: OrgRole, userId: string): string {
  const mineRejected = `and(approval_status.eq.changes_requested,operator_user_id.eq.${userId})`;
  const mineApprovedUnseen =
    `and(approval_status.eq.approved,operator_user_id.eq.${userId},` +
    `approved_by_user_id.neq.${userId},approved_seen_at.is.null)`;
  if (role === "designer") return `${mineRejected},${mineApprovedUnseen}`;
  return `approval_status.eq.pending,${mineRejected},${mineApprovedUnseen}`;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/review/queue.test.ts`
Expected: PASS, all tests including the new `describe` blocks.

- [ ] **Step 5: Update the DB layer that actually constructs `InboxItem` — `src/lib/db/review.ts`**

`InboxItem` now requires `approvedByUserId`/`approvedSeenAt` on every object built from it; `toInboxItems` builds one per row and will fail to typecheck until it's updated. In `src/lib/db/review.ts`:

Replace `QUEUE_COLUMNS`:
```typescript
const QUEUE_COLUMNS =
  "org_id, client_id, client_name, client_slug, canvas_id, canvas_name, canvas_slug, " +
  "node_id, node_type, node_title, version_id, output, approval_status, note, " +
  "operator_user_id, operator, approved_by_user_id, approved_seen_at, created_at";
```

Replace the `QueueRow` type:
```typescript
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
  approved_by_user_id: string | null;
  approved_seen_at: string | null;
  created_at: string;
};
```

Replace the return statement inside `toInboxItems`:
```typescript
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
    // D170: not rendered — read only by selectInboxFor to decide inbox membership.
    approvedByUserId: r.approved_by_user_id,
    approvedSeenAt: r.approved_seen_at,
    createdAt: r.created_at,
  }));
```

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors in `src/lib/db/review.ts` or `src/lib/review/queue.ts`.

- [ ] **Step 7: Commit**

```bash
git add src/lib/review/queue.ts src/lib/review/queue.test.ts src/lib/db/review.ts
git commit -m "feat(review): unseen-approval clause in the inbox selector/filter (D170/D171)"
```

---

### Task 4: `markVersionApprovalSeenAction` (TDD)

**Files:**
- Modify: `src/lib/actions/approval.ts`
- Modify: `src/lib/actions/approval.test.ts`

**Interfaces:**
- Consumes: `resolveCallerContext()` from `@/lib/dal` (already imported in this file), `createServerSupabase()` from `@/lib/supabase/server` (already imported), `withAction` from `@/lib/actions/with-action` (already imported).
- Produces: `markVersionApprovalSeenAction(versionId: string): Promise<void>`. Task 9's focus-view effects call this directly.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/actions/approval.test.ts` (after the existing `setVersionApprovalAction` `describe` block, before the final closing — i.e. add a new top-level `describe` at the end of the file):

```typescript
import { markVersionApprovalSeenAction } from "./approval";

// Stubs the version-row lookup with a given operator/status/seen state, and captures
// whatever update payload the action attempts to write (or records that none was).
function stubSeenDb(row: {
  operatorUserId: string | null;
  approvalStatus: string;
  approvedSeenAt: string | null;
} | null) {
  const captured: { update?: Record<string, unknown>; updated: boolean } = { updated: false };
  mockFrom.mockImplementation(() => ({
    select: () => ({
      eq: () => ({
        maybeSingle: async () =>
          row === null
            ? { data: null, error: null }
            : {
                data: {
                  id: "v1",
                  operator_user_id: row.operatorUserId,
                  approval_status: row.approvalStatus,
                  approved_seen_at: row.approvedSeenAt,
                },
                error: null,
              },
      }),
    }),
    update: (payload: Record<string, unknown>) => {
      captured.update = payload;
      captured.updated = true;
      return { eq: async () => ({ error: null }) };
    },
  }));
  return captured;
}

describe("markVersionApprovalSeenAction", () => {
  it("stamps approved_seen_at when the caller is the maker of an approved, unseen version", async () => {
    mockCaller.mockResolvedValue(caller("designer", "ruby-1"));
    const captured = stubSeenDb({
      operatorUserId: "ruby-1",
      approvalStatus: "approved",
      approvedSeenAt: null,
    });
    await markVersionApprovalSeenAction("v1");
    expect(captured.updated).toBe(true);
    expect(captured.update).toHaveProperty("approved_seen_at");
    expect(typeof captured.update?.approved_seen_at).toBe("string");
  });

  it("is a no-op for a version belonging to someone else", async () => {
    mockCaller.mockResolvedValue(caller("designer", "ruby-1"));
    const captured = stubSeenDb({
      operatorUserId: "someone-else",
      approvalStatus: "approved",
      approvedSeenAt: null,
    });
    await markVersionApprovalSeenAction("v1");
    expect(captured.updated).toBe(false);
  });

  it("is a no-op when the version is not approved", async () => {
    mockCaller.mockResolvedValue(caller("senior", "senior-1"));
    const captured = stubSeenDb({
      operatorUserId: "senior-1",
      approvalStatus: "pending",
      approvedSeenAt: null,
    });
    await markVersionApprovalSeenAction("v1");
    expect(captured.updated).toBe(false);
  });

  it("is a no-op when already seen", async () => {
    mockCaller.mockResolvedValue(caller("designer", "ruby-1"));
    const captured = stubSeenDb({
      operatorUserId: "ruby-1",
      approvalStatus: "approved",
      approvedSeenAt: "2026-08-24T00:00:00Z",
    });
    await markVersionApprovalSeenAction("v1");
    expect(captured.updated).toBe(false);
  });

  it("is a no-op for a version that does not exist — never throws (fire-and-forget caller)", async () => {
    mockCaller.mockResolvedValue(caller("designer", "ruby-1"));
    const captured = stubSeenDb(null);
    await expect(markVersionApprovalSeenAction("v1")).resolves.toBeUndefined();
    expect(captured.updated).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/actions/approval.test.ts`
Expected: FAIL — `markVersionApprovalSeenAction` is not exported from `./approval`.

- [ ] **Step 3: Implement**

Append to `src/lib/actions/approval.ts` (after the existing `setVersionApprovalAction` function):

```typescript
// D170: a maker's approval notification is a dismiss-on-view read receipt. Called
// fire-and-forget from the node's own focus view when its active version is approved
// (Task 9) — the maker's mirror of ?review=1 landing a reviewer on the node (R9.3).
//
// Deliberately silent rather than throwing on "not applicable" conditions: wrong caller,
// wrong status, or already seen are not errors, they are simply "nothing to do here" —
// this is a read receipt, not a security boundary that should surface failures to a
// fire-and-forget caller.
export async function markVersionApprovalSeenAction(versionId: string): Promise<void> {
  return withAction("markVersionApprovalSeenAction", async () => {
    const caller = await resolveCallerContext();
    const supabase = createServerSupabase();

    const { data: version, error: readErr } = await supabase
      .from("node_versions")
      .select("id, operator_user_id, approval_status, approved_seen_at")
      .eq("id", versionId)
      .maybeSingle();
    if (readErr) throw readErr;
    if (!version) return;

    const row = version as {
      operator_user_id: string | null;
      approval_status: string;
      approved_seen_at: string | null;
    };
    if (row.operator_user_id !== caller.userId) return;
    if (row.approval_status !== "approved") return;
    if (row.approved_seen_at !== null) return;

    const { error } = await supabase
      .from("node_versions")
      .update({ approved_seen_at: new Date().toISOString() })
      .eq("id", versionId);
    if (error) throw error;
  });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/actions/approval.test.ts`
Expected: PASS, all tests including the new `describe("markVersionApprovalSeenAction", ...)` block.

- [ ] **Step 5: Commit**

```bash
git add src/lib/actions/approval.ts src/lib/actions/approval.test.ts
git commit -m "feat(approval): markVersionApprovalSeenAction — dismiss-on-view read receipt (D170)"
```

---

### Task 5: Fix the versions route — resolve real attribution (D168)

**Files:**
- Modify: `src/app/api/nodes/[id]/versions/route.ts`

**Interfaces:**
- Consumes: `resolveDisplayNames(orgId, userIds): Promise<Map<string, string>>` from `@/lib/db/profiles` (existing, unchanged). `effectiveOrgId`, the 5th parameter `withNode`'s handler already receives (currently unused in this route — confirmed by reading `src/lib/api/route-helpers.ts:150-190`).
- Produces: the route's JSON response gains `makerName: string | null` and `approvedByName: string | null` per version, replacing the `approvedBy` field entirely. Task 6 updates both client-side types/mappers that read this response.

- [ ] **Step 1: Implement**

Replace the full contents of `src/app/api/nodes/[id]/versions/route.ts`:

```typescript
import { listVersions } from "@/lib/db/versions";
import { getCreditsChargedByVersionIds } from "@/lib/db/generations";
import { resolveDisplayNames } from "@/lib/db/profiles";
import type { ModelRequestRecord } from "@/lib/nodes/model-request";
import { apiOk, withNode } from "@/lib/api/route-helpers";

// GET /api/nodes/:id/versions — return all generate versions + active pointer.
// Powers the Prompt focus view's version history panel.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withNode(req, params, async (nodeId, node, _caller, _clientId, effectiveOrgId) => {
    const rows = await listVersions(nodeId);
    const creditsByVersion = await getCreditsChargedByVersionIds(rows.map((v) => v.id));

    // D168: resolve maker and reviewer to CURRENT display names in one round trip,
    // reusing the same helper review/queue.ts already uses for the navbar inbox — never
    // a second, drifting implementation of the same lookup.
    const userIds = rows.flatMap((v) => [v.operator_user_id, v.approved_by_user_id]);
    const names = await resolveDisplayNames(
      effectiveOrgId,
      userIds.filter((id): id is string => !!id),
    );

    return apiOk({
      activeVersionId: node.active_version_id,
      versions: rows.map((v) => ({
        id: v.id,
        output: typeof v.output === "string" ? v.output : null,
        // D22: the model's frozen raw output. Lets Step 3's viewer render the
        // generated -> shipped diff (generatedOutput vs output).
        generatedOutput: typeof v.generated_output === "string" ? v.generated_output : null,
        error: v.error,
        modelUsed: v.model_used ?? null,
        paramsUsed: (v.params_used ?? {}) as {
          instruction?: string;
          tokensUsed?: Record<string, number> | null;
        },
        createdAt: v.created_at,
        decision: (v.decision as "pass" | "fail" | null) ?? null,
        note: typeof v.note === "string" ? v.note : null,
        // D29 approval flag (distinct from decision).
        approvalStatus: v.approval_status as "pending" | "approved" | "changes_requested",
        // R11.3/R11.4: current display name, else the legacy free-text fallback, else
        // null. Never the dead `approved_by`/`operator` columns directly (D168) —
        // those degrade only when there is no user reference to resolve.
        makerName: (v.operator_user_id && names.get(v.operator_user_id)) || v.operator || null,
        approvedByName:
          (v.approved_by_user_id && names.get(v.approved_by_user_id)) || null,
        approvedAt: typeof v.approved_at === "string" ? v.approved_at : null,
        inputsUsed: (v.inputs_used ?? {}) as {
          baseVersionId?: string | null;
          instruction?: string;
          intent?: string;
          request?: ModelRequestRecord;
        },
        // Real settled credits (src/lib/db/credit-transactions.ts's ledger) — null for
        // versions that predate the credit system, not backfilled.
        creditsCharged: creditsByVersion.get(v.id) ?? null,
      })),
    });
  });
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: errors in `image-gen-version-history.tsx`, `video-gen-version-history.tsx`, `image-gen-focus-view.tsx`, `video-gen/api.ts` where the old `approvedBy` field is referenced — these are fixed in Tasks 6-9. If this task is executed standalone, note the errors and proceed; they are expected until those tasks land.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/nodes/[id]/versions/route.ts
git commit -m "fix(approval): versions route resolves real maker/reviewer names, drops dead approvedBy field (D168)"
```

---

### Task 6: Thread `makerName`/`approvedByName` through the version-summary types

**Files:**
- Modify: `src/components/nodes/image-gen-version-history.tsx:10-36`
- Modify: `src/components/nodes/video-gen-version-history.tsx:10-23`
- Modify: `src/lib/video-gen/api.ts:43-73`
- Modify: `src/components/nodes/image-gen-focus-view.tsx` (the inline fetch at lines 273-303, and `fetchVersions` at line 594)

**Interfaces:**
- Consumes: the `makerName`/`approvedByName` fields Task 5's route now returns.
- Produces: `ImageGenVersionSummary` and `VideoGenVersionSummary` both gain `makerName: string | null` and `approvedByName: string | null`. Task 7 renders them; Task 9 reads `approvedByName` off the active version into focus-view state.

- [ ] **Step 1: `ImageGenVersionSummary`**

In `src/components/nodes/image-gen-version-history.tsx`, in the `ImageGenVersionSummary` type, replace:

```typescript
  // D29 approval flag (distinct from decision).
  approvalStatus?: "pending" | "approved" | "changes_requested";
  approvedBy?: string | null;
  approvedAt?: string | null;
```

with:

```typescript
  // D29 approval flag (distinct from decision).
  approvalStatus?: "pending" | "approved" | "changes_requested";
  // R11.3/R11.4: resolved display names, else the legacy fallback, else null (D168).
  makerName?: string | null;
  approvedByName?: string | null;
  approvedAt?: string | null;
```

- [ ] **Step 2: `VideoGenVersionSummary`**

In `src/components/nodes/video-gen-version-history.tsx`, replace:

```typescript
  // D29 approval flag. The versions API has always returned these; video was the one
  // node type with no control able to act on them (R10.1).
  approvalStatus?: ApprovalStatus;
  note?: string | null;
```

with:

```typescript
  // D29 approval flag. The versions API has always returned these; video was the one
  // node type with no control able to act on them (R10.1).
  approvalStatus?: ApprovalStatus;
  note?: string | null;
  // R11.3/R11.4: resolved display names, else null (D168).
  makerName?: string | null;
  approvedByName?: string | null;
  approvedAt?: string | null;
```

- [ ] **Step 3: `videoGenApi.fetchVersions`**

In `src/lib/video-gen/api.ts`, the `fetchVersions` method's inner `json.versions` type and mapping (lines 51-71), replace:

```typescript
      versions: Array<{
        id: string;
        output: string | null;
        error: string | null;
        modelUsed: string | null;
        paramsUsed: Record<string, unknown>;
        createdAt: string;
        creditsCharged?: number | null;
      }>;
    };
    return {
      activeVersionId: json.activeVersionId ?? null,
      versions: (json.versions ?? []).map((v) => ({
        id: v.id,
        output: v.output ?? null,
        error: v.error ?? null,
        modelUsed: v.modelUsed ?? null,
        paramsUsed: v.paramsUsed ?? {},
        createdAt: v.createdAt,
        creditsCharged: v.creditsCharged ?? null,
      })),
    };
```

with:

```typescript
      versions: Array<{
        id: string;
        output: string | null;
        error: string | null;
        modelUsed: string | null;
        paramsUsed: Record<string, unknown>;
        createdAt: string;
        creditsCharged?: number | null;
        approvalStatus?: "pending" | "approved" | "changes_requested";
        note?: string | null;
        makerName?: string | null;
        approvedByName?: string | null;
        approvedAt?: string | null;
      }>;
    };
    return {
      activeVersionId: json.activeVersionId ?? null,
      versions: (json.versions ?? []).map((v) => ({
        id: v.id,
        output: v.output ?? null,
        error: v.error ?? null,
        modelUsed: v.modelUsed ?? null,
        paramsUsed: v.paramsUsed ?? {},
        createdAt: v.createdAt,
        creditsCharged: v.creditsCharged ?? null,
        approvalStatus: v.approvalStatus,
        note: v.note ?? null,
        makerName: v.makerName ?? null,
        approvedByName: v.approvedByName ?? null,
        approvedAt: v.approvedAt ?? null,
      })),
    };
```

- [ ] **Step 4: `image-gen-focus-view.tsx`'s two inline fetches need no change**

This component fetches `/api/nodes/${nodeId}/versions` directly (not through a client wrapper) at two confirmed locations: the mount effect's `.json()` call, typed inline as `{ activeVersionId: string | null; versions: ImageGenVersionSummary[] }` (line 280-283), and the `fetchVersions` function's identical inline type (line 599). Both already reuse the imported `ImageGenVersionSummary` type rather than redeclaring the shape — so once Step 1 above widens that type and Task 5 makes the route return the new fields, both fetches carry `makerName`/`approvedByName` through automatically. No edit needed in this file for either fetch. (A third inline versions-fetch exists at line 315, for the connected *prompt* node's own versions — unrelated to this node's approval state, typed differently, and correctly left untouched.)

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors from these four files. Errors may remain in `image-gen-focus-view.tsx`/`video-gen-focus-view.tsx`'s `InlineApprovalBar` usage and `inline-approval-bar.tsx` itself — expected until Tasks 8-9.

- [ ] **Step 6: Commit**

```bash
git add src/components/nodes/image-gen-version-history.tsx src/components/nodes/video-gen-version-history.tsx src/lib/video-gen/api.ts src/components/nodes/image-gen-focus-view.tsx
git commit -m "feat(approval): thread maker/reviewer names through version-summary types (D168)"
```

---

### Task 7: Render the audit line in version history (D169)

**Files:**
- Modify: `src/components/nodes/image-gen-version-history.tsx`
- Modify: `src/components/nodes/video-gen-version-history.tsx`

**Interfaces:**
- Consumes: `makerName`, `approvedByName`, `approvedAt`, `approvalStatus`, `note` — all already on `ImageGenVersionSummary`/`VideoGenVersionSummary` as of Task 6. `formatRelativeTime` from `@/lib/format/relative-time` (existing canonical utility, already used by `review-inbox.tsx`) — replaces both files' local duplicate `relativeTime` helper per the reusability rule in `AGENTS.md`.
- Produces: each version row shows a second line below the model/params lines: the maker, and (if decided) the reviewer's name + relative time, or the reviewer's name + rejection note.

- [ ] **Step 1: `ImageGenVersionHistory`**

In `src/components/nodes/image-gen-version-history.tsx`:

Replace the import block's local time helper. Remove:
```typescript
function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}
```
Add to the top import list:
```typescript
import { formatRelativeTime } from "@/lib/format/relative-time";
```
Every existing call site `relativeTime(v.createdAt)` becomes `formatRelativeTime(v.createdAt)` — there is exactly one, at the `{relativeTime(v.createdAt)}` span in the header row.

Then, immediately after the existing block:
```typescript
                  {v.inputsUsed?.instruction && (
                    <p className="ml-3.5 mt-0.5 line-clamp-1 text-[0.7rem] leading-snug text-muted-foreground">
                      "{v.inputsUsed.instruction}"
                    </p>
                  )}
```
add the audit line:
```typescript
                  {v.makerName && (
                    <p className="ml-3.5 mt-0.5 text-[0.65rem] leading-snug text-muted-foreground/80">
                      Made by {v.makerName}
                      {v.approvalStatus === "approved" && v.approvedByName && (
                        <> · Approved by {v.approvedByName} · {formatRelativeTime(v.approvedAt ?? null)}</>
                      )}
                    </p>
                  )}
                  {v.approvalStatus === "changes_requested" && v.approvedByName && v.note && (
                    <p className="ml-3.5 mt-0.5 line-clamp-2 text-[0.65rem] leading-snug text-destructive/80">
                      {v.approvedByName} requested changes: {v.note}
                    </p>
                  )}
```

- [ ] **Step 2: `VideoGenVersionHistory`**

In `src/components/nodes/video-gen-version-history.tsx`, apply the same two changes: swap the local `relativeTime` for `formatRelativeTime` from `@/lib/format/relative-time` (one call site, in the header row), and after the existing:
```typescript
                  {paramSummary && (
                    <p className="ml-3.5 mt-0.5 line-clamp-2 text-[0.65rem] leading-snug text-muted-foreground/80">
                      {paramSummary}
                    </p>
                  )}
```
add:
```typescript
                  {v.makerName && (
                    <p className="ml-3.5 mt-0.5 text-[0.65rem] leading-snug text-muted-foreground/80">
                      Made by {v.makerName}
                      {v.approvalStatus === "approved" && v.approvedByName && (
                        <> · Approved by {v.approvedByName} · {formatRelativeTime(v.approvedAt ?? null)}</>
                      )}
                    </p>
                  )}
                  {v.approvalStatus === "changes_requested" && v.approvedByName && v.note && (
                    <p className="ml-3.5 mt-0.5 line-clamp-2 text-[0.65rem] leading-snug text-destructive/80">
                      {v.approvedByName} requested changes: {v.note}
                    </p>
                  )}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors in either file.

- [ ] **Step 4: Manual verification**

Run the dev server (`npm run dev`), open a canvas with an image-gen node that has at least 2 versions, one approved and one rejected. Open the node's focus view → History tab. Confirm: each row shows "Made by {name}"; the approved row also shows "· Approved by {name} · {time}"; the rejected row shows a second, destructive-toned line "{name} requested changes: {note}".

- [ ] **Step 5: Commit**

```bash
git add src/components/nodes/image-gen-version-history.tsx src/components/nodes/video-gen-version-history.tsx
git commit -m "feat(approval): version history renders the maker/reviewer audit trail (D169)"
```

---

### Task 8: `ApprovalReadout` shows who approved and when

**Files:**
- Modify: `src/components/nodes/inline-approval-bar.tsx`

**Interfaces:**
- Consumes: `formatRelativeTime` from `@/lib/format/relative-time`.
- Produces: `InlineApprovalBar` gains two new optional props, `approvedByName?: string | null` and `approvedAt?: string | null`, both forwarded to the internal `ApprovalReadout`. Task 9 passes both from focus-view state.

- [ ] **Step 1: Implement**

In `src/components/nodes/inline-approval-bar.tsx`, add the import:
```typescript
import { formatRelativeTime } from "@/lib/format/relative-time";
```

Update the `InlineApprovalBar` props type and the `ApprovalReadout` call inside it. Replace:
```typescript
export function InlineApprovalBar({
  status,
  note,
  saving,
  canApprove,
  onSet,
}: {
  status: ApprovalStatus;
  note: string;
  saving: boolean;
  // R2.3: hides the control from a designer as a COURTESY. The real gate is the role
  // check inside setVersionApprovalAction, which resolves the caller server-side (D166) —
  // this prop is not, and must never become, the mechanism.
  canApprove: boolean;
  onSet: (status: ApprovalStatus, note: string | null) => void;
}) {
```
with:
```typescript
export function InlineApprovalBar({
  status,
  note,
  saving,
  canApprove,
  onSet,
  approvedByName = null,
  approvedAt = null,
}: {
  status: ApprovalStatus;
  note: string;
  saving: boolean;
  // R2.3: hides the control from a designer as a COURTESY. The real gate is the role
  // check inside setVersionApprovalAction, which resolves the caller server-side (D166) —
  // this prop is not, and must never become, the mechanism.
  canApprove: boolean;
  onSet: (status: ApprovalStatus, note: string | null) => void;
  // Who approved this version, and when — rendered only in the read-only view (D169).
  approvedByName?: string | null;
  approvedAt?: string | null;
}) {
```

Replace the early-return line:
```typescript
  if (!canApprove) {
    return <ApprovalReadout status={status} note={note} />;
  }
```
with:
```typescript
  if (!canApprove) {
    return (
      <ApprovalReadout
        status={status}
        note={note}
        approvedByName={approvedByName}
        approvedAt={approvedAt}
      />
    );
  }
```

Replace the `ApprovalReadout` function at the bottom of the file:
```typescript
function ApprovalReadout({ status, note }: { status: ApprovalStatus; note: string }) {
  const meta = STATUS_META[status];
  return (
    <div className="min-w-0">
      <div className="flex items-center justify-between gap-2">
        <span className="text-eyebrow">Approval</span>
        <span className={cn("flex items-center gap-1.5 text-xs font-medium", meta.text)}>
          <span className={cn("size-1.5 shrink-0 rounded-full", meta.dot)} />
          {meta.label}
        </span>
      </div>
      {/* R9.3: the note is read ON THE NODE, beside the controls that act on it — the
          place the fix actually happens. */}
      {status === "changes_requested" && note.trim() && (
        <p className="mt-2 rounded-r-md border-l-2 border-destructive/40 bg-destructive/5 px-2.5 py-1.5 text-xs leading-relaxed text-destructive">
          {note}
        </p>
      )}
    </div>
  );
}
```
with:
```typescript
function ApprovalReadout({
  status,
  note,
  approvedByName,
  approvedAt,
}: {
  status: ApprovalStatus;
  note: string;
  approvedByName: string | null;
  approvedAt: string | null;
}) {
  const meta = STATUS_META[status];
  return (
    <div className="min-w-0">
      <div className="flex items-center justify-between gap-2">
        <span className="text-eyebrow">Approval</span>
        <span className={cn("flex items-center gap-1.5 text-xs font-medium", meta.text)}>
          <span className={cn("size-1.5 shrink-0 rounded-full", meta.dot)} />
          {meta.label}
        </span>
      </div>
      {/* R9.3: the note is read ON THE NODE, beside the controls that act on it — the
          place the fix actually happens. */}
      {status === "changes_requested" && note.trim() && (
        <p className="mt-2 rounded-r-md border-l-2 border-destructive/40 bg-destructive/5 px-2.5 py-1.5 text-xs leading-relaxed text-destructive">
          {note}
        </p>
      )}
      {/* D169: who approved, and when — captured since D167, invisible until now. */}
      {status === "approved" && approvedByName && (
        <p className="mt-1.5 text-xs text-muted-foreground">
          Approved by {approvedByName} · {formatRelativeTime(approvedAt)}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: new errors at every call site of `<InlineApprovalBar .../>` that doesn't yet pass `approvedByName`/`approvedAt` — expected, both props default to `null` so this is not a runtime error, only a reminder for Task 9. If TypeScript doesn't flag missing optional props (it won't — they're optional), skip this expectation and proceed; Task 9 wires them regardless.

- [ ] **Step 3: Commit**

```bash
git add src/components/nodes/inline-approval-bar.tsx
git commit -m "feat(approval): ApprovalReadout shows who approved and when (D169)"
```

---

### Task 9: Wire both focus views — display + mark-seen effect

**Files:**
- Modify: `src/components/nodes/image-gen-focus-view.tsx`
- Modify: `src/components/nodes/video-gen-focus-view.tsx`

**Interfaces:**
- Consumes: `markVersionApprovalSeenAction` from `@/lib/actions/approval` (Task 4). `approvedByName`/`approvedAt` fields off the fetched version summaries (Task 6).
- Produces: both focus views pass `approvedByName`/`approvedAt` into their `<InlineApprovalBar>`, and both fire `markVersionApprovalSeenAction` once per node-open when the active version is approved.

- [ ] **Step 1: `image-gen-focus-view.tsx` — add state**

Near the existing `const [approvalNote, setApprovalNote] = useState("");` (line 194), add two more state variables:
```typescript
  const [approvalNote, setApprovalNote] = useState("");
  const [approvedByName, setApprovedByName] = useState<string | null>(null);
  const [approvedAt, setApprovedAt] = useState<string | null>(null);
```

- [ ] **Step 2: populate it from both fetch sites**

This file sets `approvalStatus` from a freshly-fetched `active` version object at exactly two locations — confirmed by reading the file: the mount effect's `setApprovalStatus(active?.approvalStatus ?? "pending");` at line 291, and the reusable `fetchVersions()` function's identical call at line 609 (the latter is also what `handleRestoreVersion` and every approve/reject/reset handler call to refresh state afterward, so one edit there covers all of them). Add the same two lines immediately after **both**:

At line 291-292 (inside the mount effect), immediately after:
```typescript
          setApprovalStatus(active?.approvalStatus ?? "pending");
          setApprovalNote(active?.note ?? "");
```
add:
```typescript
          setApprovedByName(active?.approvedByName ?? null);
          setApprovedAt(active?.approvedAt ?? null);
```

At line 609 (inside `fetchVersions()`), immediately after the equivalent `setApprovalStatus(active?.approvalStatus ?? "pending");` line, add the same two lines.

- [ ] **Step 3: `image-gen-focus-view.tsx` — the mark-seen effect**

Add the import:
```typescript
import { markVersionApprovalSeenAction } from "@/lib/actions/approval";
```

Add a new effect near the existing version-fetch effect (after the one ending at line 303):
```typescript
  // D170: the maker's mirror of ?review=1 landing a reviewer on the node. Fire-and-forget
  // — the server no-ops for anyone who isn't the version's own maker, or when there's
  // nothing to mark, so this is safe to call unconditionally whenever this focus view is
  // showing an approved active version.
  useEffect(() => {
    if (!open || !activeVersionId || approvalStatus !== "approved") return;
    void markVersionApprovalSeenAction(activeVersionId).catch(() => {
      /* best-effort */
    });
  }, [open, activeVersionId, approvalStatus]);
```

- [ ] **Step 4: `image-gen-focus-view.tsx` — pass the props through**

At the `<InlineApprovalBar>` call (around line 1232), add the two new props:
```typescript
                        <InlineApprovalBar
                          status={approvalStatus}
                          note={approvalNote}
                          approvedByName={approvedByName}
                          approvedAt={approvedAt}
```
(keep every existing prop on the lines that follow unchanged).

- [ ] **Step 5: repeat Steps 1-4 for `video-gen-focus-view.tsx`**

This file's shape is the same but with a named `fetchVersions` callback (line 434) instead of inline effects, plus one more call site around line 520-526. Add:
```typescript
  const [approvedByName, setApprovedByName] = useState<string | null>(null);
  const [approvedAt, setApprovedAt] = useState<string | null>(null);
```
next to the existing `const [approvalStatus, setApprovalStatus] = useState<ApprovalStatus>("pending");` (line 366).

In `fetchVersions` (line 434-441) and the second call site (520-526), after each `setApprovalStatus(active?.approvalStatus ?? "pending");`, add:
```typescript
      setApprovedByName(active?.approvedByName ?? null);
      setApprovedAt(active?.approvedAt ?? null);
```

Add the same import and effect as Step 3 (identical code, same file-level placement logic — near the other version-related effects, using this file's own `open`/`activeVersionId`/`approvalStatus` state which already exist under those exact names per the earlier grep).

At the `<InlineApprovalBar>` call (around line 1211), add:
```typescript
                      <InlineApprovalBar
                        status={approvalStatus}
                        approvedByName={approvedByName}
                        approvedAt={approvedAt}
```
(keep every existing prop unchanged).

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Manual verification**

As a senior/owner test account: approve an image-gen node's active version. Log in (or switch identity, per this repo's dev-identity-switch mechanism if one exists — check `src/hooks/use-identity.ts` for how identity is set in dev) as the designer who made it. Open that node's focus view. Confirm: the Details tab's approval control now shows "Approved by {senior's name} · just now" (or similar), and the History tab shows the same on that version's row. Reload — confirm the navbar `ReviewInbox` badge that showed "1" before opening the node no longer includes this item (its `approved_seen_at` is now set).

- [ ] **Step 8: Commit**

```bash
git add src/components/nodes/image-gen-focus-view.tsx src/components/nodes/video-gen-focus-view.tsx
git commit -m "feat(approval): focus views show approver identity and mark approvals seen (D169/D170)"
```

---

### Task 10: Navbar inbox — "Approved" tag

**Files:**
- Modify: `src/components/identity/review-inbox.tsx`

**Interfaces:**
- Consumes: `item.approvalStatus` (already on `InboxItem`, already returned by `/api/review/inbox` since it's part of `QUEUE_COLUMNS`/`toInboxItems` — no server change needed here, since `approvalStatus` was already selected before this plan; only the *filter* determining which rows arrive changed, in Task 3).
- Produces: a second visual tag alongside the existing "Sent back" chip, for rows where `approvalStatus === "approved"`.

- [ ] **Step 1: Implement**

In `src/components/identity/review-inbox.tsx`, locate the existing tag block:
```typescript
                          {/* The one thing a pointer must distinguish: work sent BACK to
                              you reads differently from work waiting ON you. */}
                          {item.approvalStatus === "changes_requested" && (
                            <span className="shrink-0 rounded-full bg-destructive/10 px-1.5 text-[0.6rem] font-semibold text-destructive">
                              Sent back
                            </span>
                          )}
```
Add immediately after it:
```typescript
                          {/* D170: the maker's approval notification — same row shape,
                              opposite news. Emerald matches STATUS_META.approved in
                              InlineApprovalBar, never the destructive token rejection uses. */}
                          {item.approvalStatus === "approved" && (
                            <span className="shrink-0 rounded-full bg-emerald-500/10 px-1.5 text-[0.6rem] font-semibold text-emerald-700 dark:text-emerald-400">
                              Approved
                            </span>
                          )}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual verification**

With the same test setup as Task 9 Step 7 (a designer with a fresh, unseen approval), open the navbar inbox popover before opening the node. Confirm the row shows the "Approved" tag, styled in emerald, distinct from the existing red "Sent back" tag. Click it, confirm it navigates to `?review=1&node=...` same as a rejection row.

- [ ] **Step 4: Commit**

```bash
git add src/components/identity/review-inbox.tsx
git commit -m "feat(approval): navbar inbox shows an Approved tag alongside Sent back (D170)"
```

---

### Task 11: Full test suite + typecheck

**Files:** none (verification only)

- [ ] **Step 1: Run the full relevant test suite**

Run: `npx vitest run src/lib/review src/lib/actions/approval.test.ts src/lib/approval.test.ts`
Expected: all PASS.

- [ ] **Step 2: Full typecheck**

Run: `npx tsc --noEmit`
Expected: no errors anywhere in the repo.

- [ ] **Step 3: Lint**

Run: `npx eslint src/lib/review src/lib/actions/approval.ts src/app/api/nodes/\[id\]/versions/route.ts src/components/nodes/image-gen-version-history.tsx src/components/nodes/video-gen-version-history.tsx src/components/nodes/inline-approval-bar.tsx src/components/nodes/image-gen-focus-view.tsx src/components/nodes/video-gen-focus-view.tsx src/components/identity/review-inbox.tsx src/lib/video-gen/api.ts src/lib/db/types.ts`
Expected: no errors. Fix any that appear (e.g. unused imports left over from the `relativeTime` → `formatRelativeTime` swap) before proceeding.

- [ ] **Step 4: Note the per-directory flake risk**

If running the FULL suite (`npx vitest run`) rather than the scoped command above, be aware this repo has known intermittent timeout flakes in unrelated API route tests under full runs — verify failures against the scoped command in Step 1 before treating them as regressions.

---

## Summary of what this plan does NOT touch

Per the design spec's §5 (Out of scope): `PendingCountPill`, the canvas review drawer, `setVersionApprovalAction`'s rejection path, and any consolidation of the two version-history components are all unchanged. This plan is additive only — every existing test in `queue.test.ts` and `approval.test.ts` continues to pass unmodified (Task 3/4 only add new `describe` blocks and extend the shared `item()`/`caller()` fixtures, never change their defaults in a way that alters existing assertions — the two new `InboxItem` fields default to `null` in the fixture, which does not affect any pre-existing rejected/pending fixture in the file).
