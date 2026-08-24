# Decision History Log & Version-History Panel Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep a full, append-only history of every approve/reject decision on a version (today only the latest survives), and redesign the version-history panel from a permanently-stacked wall of text into a collapse/expand row with an icon-coded decision thread.

**Architecture:** A new table (`node_version_decisions`) logs every real decision, written alongside — never instead of — `node_versions`' existing current-state columns, so nothing the prior feature built (review queue, counts, navbar inbox) changes at all. The versions API route fetches this log batched (one extra query, reusing the existing name-resolution call) and returns it per version. Two new small shared components render a colored status icon and a decision thread; both version-history panels are restructured to collapse by default and expose the thread (plus existing generation metadata) on expand.

**Tech Stack:** Next.js App Router, Supabase (Postgres), TypeScript, Vitest, Tailwind, Lucide icons.

## Global Constraints

- Only `approved`/`changes_requested` are logged; a reset to `pending` writes no row (D174).
- The decision-log insert is best-effort — never let it fail or block the approve/reject action itself (D175, mirrors D170's `markVersionApprovalSeenAction`).
- Reuse canonical utilities — never redeclare. `resolveDisplayNames` (`src/lib/db/profiles.ts`) and `formatRelativeTime` (`src/lib/format/relative-time.ts`) are reused, not reimplemented.
- Icons are Lucide, reused from where they already exist in this codebase (`Check`/`MessageSquareWarning`, already imported by `InlineApprovalBar` for its own buttons) — no new icon vocabulary.
- Colors are the three already established for approval state — amber (pending), emerald (approved), destructive (rejected) — never a fourth.
- Controls in JSX must be shadcn primitives from `src/components/ui/*` — the restructured row uses two separate `Button` components (row-body toggle, explicit restore), never a nested/raw `<button>`.
- Decisions D173–D177 (recorded in `docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md` §7) are the source of truth for *why*; this plan is the *how*.

---

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/0033_node_version_decisions.sql` | New | The append-only log table + index + org-isolation RLS policy |
| `src/lib/db/decisions.ts` | New | `insertDecision`, `getDecisionsByVersionIds` — thin Supabase IO, same shape as sibling `db/generations.ts`/`db/review.ts` (no dedicated unit test, matching that existing convention) |
| `src/lib/approval.ts` | Modify | Adds the shared `VersionDecisionSummary` type |
| `src/lib/actions/approval.ts` | Modify | `setVersionApprovalAction` logs a decision (best-effort) after a successful status update |
| `src/lib/actions/approval.test.ts` | Modify | Tests for the new logging behavior; `stubDb` extended to route by table name |
| `src/app/api/nodes/[id]/versions/route.ts` | Modify | Fetches and returns each version's `decisions` array |
| `src/components/nodes/version-decision-history.tsx` | New | `VersionStatusIcon` + `VersionDecisionThread` — shared by both version-history panels |
| `src/components/nodes/image-gen-version-history.tsx` | Modify | Collapse/expand row redesign; renders the shared components |
| `src/components/nodes/video-gen-version-history.tsx` | Modify | Same |
| `src/lib/video-gen/api.ts` | Modify | `videoGenApi.fetchVersions` threads `decisions` through |
| `src/components/nodes/inline-approval-bar.tsx` | Modify | `ApprovalReadout` gains matching icons (D177) |

---

### Task 1: Migration — `node_version_decisions` table

**Files:**
- Create: `supabase/migrations/0033_node_version_decisions.sql`

**Interfaces:**
- Produces: table `node_version_decisions(id, version_id, org_id, status, note, decided_by_user_id, decided_at)`, an index on `(version_id, decided_at desc)`, and an org-isolation SELECT RLS policy matching `node_versions`' own (migration 0030).

- [ ] **Step 1: Write the migration**

```sql
-- D173: append-only log of every real approve/reject decision, kept ALONGSIDE (never
-- instead of) node_versions' own current-state columns. D159's review_queue_items view,
-- and everything built on it (counts, the review drawer, the navbar inbox), reads only
-- those columns and is untouched by this table.
--
-- D174: only 'approved'/'changes_requested' are logged. A reset to 'pending' ("Undo")
-- clears current state so a version can be re-decided; it is not itself an event worth a
-- history row.

create table node_version_decisions (
  id                 uuid primary key default gen_random_uuid(),
  version_id         uuid not null references node_versions(id) on delete cascade,
  org_id             uuid not null references organizations(id),
  status             text not null check (status in ('approved', 'changes_requested')),
  note               text,
  decided_by_user_id uuid references auth.users(id) on delete set null,
  decided_at         timestamptz not null default now()
);

-- Every read of this table asks "every decision for these version ids, newest first" —
-- src/lib/db/decisions.ts's getDecisionsByVersionIds.
create index node_version_decisions_version_idx
  on node_version_decisions (version_id, decided_at desc);

-- R2.4/R11.5 precedent: migration 0030's "org isolation" policy on node_versions, same
-- shape. Writes go through the service-role client inside setVersionApprovalAction, which
-- already gates on the caller's resolved role (D166) — no write policy needed.
alter table node_version_decisions enable row level security;

create policy "org isolation" on node_version_decisions for select
  using (
    org_id = (select org_id from org_memberships where user_id = auth.uid() limit 1)
  );
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/0033_node_version_decisions.sql
git commit -m "feat(approval): node_version_decisions append-only log table (D173/D174)"
```

---

### Task 2: `src/lib/db/decisions.ts` — insert + batched fetch

**Files:**
- Create: `src/lib/db/decisions.ts`

**Interfaces:**
- Consumes: `createServerSupabase` from `@/lib/supabase/server` (existing).
- Produces: `insertDecision(input): Promise<void>` and `getDecisionsByVersionIds(versionIds: string[]): Promise<Map<string, DecisionRow[]>>`, both exported, plus the exported `DecisionRow` type. Task 4 calls `insertDecision`; Task 5 calls `getDecisionsByVersionIds`.

No dedicated unit test for this file — it is a thin Supabase IO layer with no branching logic to unit-test in isolation, the same shape as this codebase's existing `src/lib/db/generations.ts`'s `getCreditsChargedByVersionIds` and `src/lib/db/review.ts`, neither of which has a direct test file. `insertDecision`'s behavior is exercised through Task 4's tests (which mock the Supabase client at the module boundary, same as every other action test in this codebase).

- [ ] **Step 1: Write the file**

```typescript
import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";

export type DecisionRow = {
  id: string;
  version_id: string;
  org_id: string;
  status: "approved" | "changes_requested";
  note: string | null;
  decided_by_user_id: string | null;
  decided_at: string;
};

// D173/D175: append-only, and deliberately best-effort from the CALLER's perspective —
// setVersionApprovalAction catches and logs any error this throws rather than letting a
// logging failure block or fail the approve/reject action itself.
export async function insertDecision(input: {
  versionId: string;
  orgId: string;
  status: "approved" | "changes_requested";
  note: string | null;
  decidedByUserId: string;
  decidedAt: string;
}): Promise<void> {
  const supabase = createServerSupabase();
  const { error } = await supabase.from("node_version_decisions").insert({
    version_id: input.versionId,
    org_id: input.orgId,
    status: input.status,
    note: input.note,
    decided_by_user_id: input.decidedByUserId,
    decided_at: input.decidedAt,
  });
  if (error) throw error;
}

// D173: batched over every version on a node in ONE query — same shape as
// getCreditsChargedByVersionIds (src/lib/db/generations.ts), grouped client-side into an
// array per version since, unlike credits, more than one decision can exist per version.
export async function getDecisionsByVersionIds(
  versionIds: string[],
): Promise<Map<string, DecisionRow[]>> {
  if (versionIds.length === 0) return new Map();
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("node_version_decisions")
    .select("id, version_id, org_id, status, note, decided_by_user_id, decided_at")
    .in("version_id", versionIds)
    .order("decided_at", { ascending: false });
  if (error) throw error;
  const byVersion = new Map<string, DecisionRow[]>();
  for (const row of (data ?? []) as DecisionRow[]) {
    const list = byVersion.get(row.version_id) ?? [];
    list.push(row);
    byVersion.set(row.version_id, list);
  }
  return byVersion;
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors (this is a new, self-contained file with no other file importing from it yet).

- [ ] **Step 3: Commit**

```bash
git add src/lib/db/decisions.ts
git commit -m "feat(approval): insertDecision + getDecisionsByVersionIds (D173)"
```

---

### Task 3: `VersionDecisionSummary` shared type

**Files:**
- Modify: `src/lib/approval.ts`

**Interfaces:**
- Produces: `export type VersionDecisionSummary = { status: "approved" | "changes_requested"; note: string | null; reviewerName: string | null; decidedAt: string; }`. Task 5 constructs values of this shape in the route's response; Tasks 7/8 type a `decisions?: VersionDecisionSummary[]` field with it; Task 6 imports it for `VersionDecisionThread`'s props.

- [ ] **Step 1: Add the type**

In `src/lib/approval.ts`, after the existing `ApprovalUpdate` type and before `buildApprovalUpdate`, add:

```typescript
// D173: the shape the versions API route returns per logged decision — reused by both
// version-history panels and their shared VersionDecisionThread component, so the field
// names are written down in exactly one place.
export type VersionDecisionSummary = {
  status: "approved" | "changes_requested";
  note: string | null;
  reviewerName: string | null;
  decidedAt: string;
};
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/approval.ts
git commit -m "feat(approval): VersionDecisionSummary shared type (D173)"
```

---

### Task 4: `setVersionApprovalAction` logs a decision (TDD)

**Files:**
- Modify: `src/lib/actions/approval.ts`
- Modify: `src/lib/actions/approval.test.ts`

**Interfaces:**
- Consumes: `insertDecision` from `@/lib/db/decisions` (Task 2).
- Produces: no change to `setVersionApprovalAction`'s signature or return type — this is additive behavior inside the existing function.

- [ ] **Step 1: Write the failing tests**

`src/lib/actions/approval.test.ts`'s existing `stubDb` helper ignores which table `.from()` was called with (it always returns the same mock object). This task's tests need it to behave differently for `node_versions` (existing) vs `node_version_decisions` (new), so `stubDb` itself needs extending first.

Replace the existing `stubDb` function:

```typescript
function stubDb(versionOrgId: string | null) {
  const captured: { update?: Record<string, unknown> } = {};
  mockFrom.mockImplementation(() => ({
    select: () => ({
      eq: () => ({
        maybeSingle: async () =>
          versionOrgId === null
            ? { data: null, error: null }
            : { data: { id: "v1", org_id: versionOrgId }, error: null },
      }),
    }),
    update: (payload: Record<string, unknown>) => {
      captured.update = payload;
      return { eq: async () => ({ error: null }) };
    },
  }));
  return captured;
}
```

with:

```typescript
function stubDb(
  versionOrgId: string | null,
  options: { decisionInsertError?: Error } = {},
) {
  const captured: {
    update?: Record<string, unknown>;
    decisionInsert?: Record<string, unknown>;
  } = {};
  mockFrom.mockImplementation((table: string) => {
    if (table === "node_version_decisions") {
      return {
        insert: (payload: Record<string, unknown>) => {
          captured.decisionInsert = payload;
          return Promise.resolve({
            error: options.decisionInsertError ?? null,
          });
        },
      };
    }
    return {
      select: () => ({
        eq: () => ({
          maybeSingle: async () =>
            versionOrgId === null
              ? { data: null, error: null }
              : { data: { id: "v1", org_id: versionOrgId }, error: null },
        }),
      }),
      update: (payload: Record<string, unknown>) => {
        captured.update = payload;
        return { eq: async () => ({ error: null }) };
      },
    };
  });
  return captured;
}
```

Then append this new `describe` block after the existing `describe("setVersionApprovalAction", ...)` block closes (i.e. at the same level, later in the file):

```typescript
describe("setVersionApprovalAction — decision history (D173-D175)", () => {
  it("logs a decision when approving", async () => {
    mockCaller.mockResolvedValue(caller("senior", "senior-1"));
    const captured = stubDb("org-1");
    await setVersionApprovalAction("v1", { status: "approved" });
    expect(captured.decisionInsert).toMatchObject({
      version_id: "v1",
      org_id: "org-1",
      status: "approved",
      decided_by_user_id: "senior-1",
    });
  });

  it("logs a decision when rejecting, including the note", async () => {
    mockCaller.mockResolvedValue(caller("senior", "senior-1"));
    const captured = stubDb("org-1");
    await setVersionApprovalAction("v1", {
      status: "changes_requested",
      note: "fix it",
    });
    expect(captured.decisionInsert).toMatchObject({
      status: "changes_requested",
      note: "fix it",
    });
  });

  it("does NOT log a decision when resetting to pending — D174", async () => {
    mockCaller.mockResolvedValue(caller("senior", "senior-1"));
    const captured = stubDb("org-1");
    await setVersionApprovalAction("v1", { status: "pending" });
    expect(captured.decisionInsert).toBeUndefined();
  });

  it("does not fail the action if the decision-log insert fails — D175", async () => {
    mockCaller.mockResolvedValue(caller("senior", "senior-1"));
    const captured = stubDb("org-1", {
      decisionInsertError: new Error("log db down"),
    });
    await expect(
      setVersionApprovalAction("v1", { status: "approved" }),
    ).resolves.toBeUndefined();
    // The status update itself still succeeded — a logging failure must never roll it back
    // or surface as an error to the reviewer.
    expect(captured.update).toMatchObject({ approval_status: "approved" });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/actions/approval.test.ts`
Expected: the 10 pre-existing tests still PASS (the `stubDb` change is backward-compatible — it still handles `node_versions` identically, just now branches on the table argument). The 4 new tests FAIL — `captured.decisionInsert` is always `undefined` because `setVersionApprovalAction` doesn't call `insertDecision` yet.

- [ ] **Step 3: Implement**

In `src/lib/actions/approval.ts`, add the import:

```typescript
import { insertDecision } from "@/lib/db/decisions";
```

Replace the body of `setVersionApprovalAction` from the `const update = buildApprovalUpdate(...)` line to the end of the function:

```typescript
    const at = new Date().toISOString();
    const update = buildApprovalUpdate({
      status: input.status,
      by: caller.userId,
      at,
      note,
    });

    const { error } = await supabase
      .from("node_versions")
      .update(update)
      .eq("id", versionId);
    if (error) throw error;

    // D173/D175: append-only decision history, best-effort. A logging failure must never
    // block or fail the approve/reject action the reviewer just performed — the status
    // update above already succeeded and is the source of truth; this is observability.
    if (input.status === "approved" || input.status === "changes_requested") {
      try {
        await insertDecision({
          versionId,
          orgId: caller.orgId,
          status: input.status,
          note,
          decidedByUserId: caller.userId,
          decidedAt: at,
        });
      } catch (e) {
        console.error("Failed to log approval decision history", e);
      }
    }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/actions/approval.test.ts`
Expected: PASS, all 14 tests (10 pre-existing + 4 new).

- [ ] **Step 5: Commit**

```bash
git add src/lib/actions/approval.ts src/lib/actions/approval.test.ts
git commit -m "feat(approval): setVersionApprovalAction logs decision history (D173-D175)"
```

---

### Task 5: Versions route returns each version's decision history

**Files:**
- Modify: `src/app/api/nodes/[id]/versions/route.ts`

**Interfaces:**
- Consumes: `getDecisionsByVersionIds` from `@/lib/db/decisions` (Task 2), `VersionDecisionSummary` from `@/lib/approval` (Task 3, for documentation — the route constructs matching object literals, no explicit type import strictly required since it's an inline object literal, but the shape must match exactly).
- Produces: the route's response gains `decisions: VersionDecisionSummary[]` per version. Tasks 7/9 read this field.

- [ ] **Step 1: Implement**

Replace the full contents of `src/app/api/nodes/[id]/versions/route.ts`:

```typescript
import { listVersions } from "@/lib/db/versions";
import { getCreditsChargedByVersionIds } from "@/lib/db/generations";
import { getDecisionsByVersionIds } from "@/lib/db/decisions";
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
    const versionIds = rows.map((v) => v.id);
    const creditsByVersion = await getCreditsChargedByVersionIds(versionIds);
    // D173: the full decision log for every version on this node, one batched query.
    const decisionsByVersion = await getDecisionsByVersionIds(versionIds);

    // D168: resolve maker and reviewer to CURRENT display names in one round trip,
    // reusing the same helper review/queue.ts already uses for the navbar inbox — never
    // a second, drifting implementation of the same lookup. D173 extends this ONE call to
    // also cover every decision's reviewer, rather than a second name-resolution pass.
    const decisionReviewerIds = [...decisionsByVersion.values()]
      .flat()
      .map((d) => d.decided_by_user_id)
      .filter((id): id is string => !!id);
    const userIds = [
      ...rows.flatMap((v) => [v.operator_user_id, v.approved_by_user_id]),
      ...decisionReviewerIds,
    ].filter((id): id is string => !!id);
    const names = await resolveDisplayNames(effectiveOrgId, userIds);

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
        // R11.3/R11.4: makerName is current display name, else the legacy free-text
        // `operator` fallback, else null. approvedByName has no legacy fallback — there
        // is no reliable historical string for the reviewer (`approved_by` was never
        // meaningfully populated before the real user-reference migration, unlike
        // `operator`), so it resolves straight to null. Never the dead `approved_by`/
        // `operator` columns directly (D168) — those degrade only when there is no user
        // reference to resolve.
        makerName: (v.operator_user_id && names.get(v.operator_user_id)) || v.operator || null,
        approvedByName:
          (v.approved_by_user_id && names.get(v.approved_by_user_id)) || null,
        approvedAt: typeof v.approved_at === "string" ? v.approved_at : null,
        // D173: full decision history, newest first — getDecisionsByVersionIds already
        // orders it, this is a straight map, not a re-sort.
        decisions: (decisionsByVersion.get(v.id) ?? []).map((d) => ({
          status: d.status,
          note: d.note,
          reviewerName: (d.decided_by_user_id && names.get(d.decided_by_user_id)) || null,
          decidedAt: d.decided_at,
        })),
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
Expected: no errors in this file. Errors will appear in `image-gen-version-history.tsx`, `video-gen-version-history.tsx`, and `src/lib/video-gen/api.ts` where a `decisions` field is now present in the API response but not yet in those types — expected until Tasks 7-9 land.

- [ ] **Step 3: Commit**

```bash
git add "src/app/api/nodes/[id]/versions/route.ts"
git commit -m "feat(approval): versions route returns per-version decision history (D173)"
```

---

### Task 6: Shared `VersionStatusIcon` + `VersionDecisionThread`

**Files:**
- Create: `src/components/nodes/version-decision-history.tsx`

**Interfaces:**
- Consumes: `VersionDecisionSummary` from `@/lib/approval` (Task 3), `ApprovalStatus` from `@/lib/approval` (existing), `formatRelativeTime` from `@/lib/format/relative-time` (existing).
- Produces: `VersionStatusIcon({ status }: { status: ApprovalStatus | undefined })` and `VersionDecisionThread({ decisions }: { decisions: VersionDecisionSummary[] })`, both exported. Tasks 7/8 import and render both.

- [ ] **Step 1: Write the file**

```typescript
"use client";

import { Check, MessageSquareWarning } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatRelativeTime } from "@/lib/format/relative-time";
import type { ApprovalStatus, VersionDecisionSummary } from "@/lib/approval";

// D176/D177: the same colored status marker InlineApprovalBar's STATUS_META and the
// navbar inbox tag (review-inbox.tsx) already use — amber/emerald/destructive, never a
// fourth color. Collapsed version-history rows show this instead of the old plain dot.
export function VersionStatusIcon({ status }: { status: ApprovalStatus | undefined }) {
  if (status === "approved") {
    return (
      <Check
        className="size-3 shrink-0 text-emerald-600 dark:text-emerald-400"
        strokeWidth={1.5}
      />
    );
  }
  if (status === "changes_requested") {
    return (
      <MessageSquareWarning className="size-3 shrink-0 text-destructive" strokeWidth={1.5} />
    );
  }
  return <span className="size-1.5 shrink-0 rounded-full bg-amber-500" />;
}

// D173/D177: a version's full decision history, newest first (the versions route already
// orders it — this renders, it does not re-sort). Icons/colors reused from
// InlineApprovalBar's own Approve/Reject buttons, not a new icon vocabulary. Shared by
// both ImageGenVersionHistory and VideoGenVersionHistory rather than duplicated in each.
export function VersionDecisionThread({
  decisions,
}: {
  decisions: VersionDecisionSummary[];
}) {
  if (decisions.length === 0) return null;
  return (
    <div className="mt-1.5 space-y-1.5">
      {decisions.map((d, i) => (
        <div key={i} className="flex items-start gap-1.5">
          {d.status === "approved" ? (
            <Check
              className="mt-0.5 size-3 shrink-0 text-emerald-600 dark:text-emerald-400"
              strokeWidth={1.5}
            />
          ) : (
            <MessageSquareWarning
              className="mt-0.5 size-3 shrink-0 text-destructive"
              strokeWidth={1.5}
            />
          )}
          <p
            className={cn(
              "text-[0.65rem] leading-snug",
              d.status === "approved" ? "text-muted-foreground" : "text-destructive/80",
            )}
          >
            <span className="font-medium">{d.reviewerName ?? "Someone"}</span>{" "}
            {d.status === "approved" ? "approved" : "requested changes"} ·{" "}
            {formatRelativeTime(d.decidedAt)}
            {d.note && <>: {d.note}</>}
          </p>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors in this file (it has no consumers yet, so nothing else should be affected).

- [ ] **Step 3: Commit**

```bash
git add src/components/nodes/version-decision-history.tsx
git commit -m "feat(approval): shared VersionStatusIcon + VersionDecisionThread (D173/D176/D177)"
```

---

### Task 7: `ImageGenVersionHistory` — collapse/expand redesign

**Files:**
- Modify: `src/components/nodes/image-gen-version-history.tsx`

**Interfaces:**
- Consumes: `VersionStatusIcon`, `VersionDecisionThread` from `@/components/nodes/version-decision-history` (Task 6); `VersionDecisionSummary` from `@/lib/approval` (Task 3).
- Produces: `ImageGenVersionSummary` gains `decisions?: VersionDecisionSummary[]`. No prop/export signature changes to `ImageGenVersionHistory` itself (still `{ versions, activeVersionId, onRestore, restoring }`).

- [ ] **Step 1: Replace the file**

Replace the full contents of `src/components/nodes/image-gen-version-history.tsx`:

```typescript
"use client";

import { useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { History } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ImageTokenUsage } from "@/lib/image-gen/types";
import { describeVersionParams } from "@/lib/generations/version-params";
import { imageGenClientModelMap } from "@/lib/image-gen/client-models";
import { formatRelativeTime } from "@/lib/format/relative-time";
import type { VersionDecisionSummary } from "@/lib/approval";
import { VersionStatusIcon, VersionDecisionThread } from "./version-decision-history";

export type ImageGenVersionSummary = {
  id: string;
  output: string | null;   // image URL
  error: string | null;
  modelUsed?: string | null;
  // The raw `node_versions.params_used` record: the model's own params plus the pipeline's
  // bookkeeping. `modelId`/`tokensUsed` are called out because callers read them by name;
  // everything else is read through the model's param specs (lib/generations/version-params).
  paramsUsed: Record<string, unknown> & {
    modelId?: string;
    tokensUsed?: ImageTokenUsage | null;
  };
  createdAt: string;
  decision: "pass" | "fail" | null;
  note: string | null;
  // D29 approval flag (distinct from decision).
  approvalStatus?: "pending" | "approved" | "changes_requested";
  // R11.3/R11.4: resolved display names, else the legacy fallback, else null (D168).
  makerName?: string | null;
  approvedByName?: string | null;
  approvedAt?: string | null;
  // D173: every decision made on this version, newest first.
  decisions?: VersionDecisionSummary[];
  inputsUsed?: {
    baseVersionId?: string | null;
    instruction?: string;
    intent?: string;
  };
  // Real settled credits — null for legacy versions predating the credit system.
  creditsCharged?: number | null;
};

type Props = {
  versions: ImageGenVersionSummary[];
  activeVersionId: string | null;
  onRestore: (versionId: string) => void;
  restoring: boolean;
};

export function ImageGenVersionHistory({
  versions,
  activeVersionId,
  onRestore,
  restoring,
}: Props) {
  if (versions.length === 0) return null;
  const total = versions.length;
  // versionId → "vN" label, so an edit can name the version it was derived from.
  const labelById = new Map(versions.map((v, i) => [v.id, `v${total - i}`]));

  // D176: the active version starts expanded; everything else starts collapsed. Tracks
  // activeVersionId changes (e.g. after a restore) without force-collapsing rows the user
  // opened manually — only ever ADDS the newly-active id to the expanded set.
  const [expandedIds, setExpandedIds] = useState<Set<string>>(
    () => new Set(activeVersionId ? [activeVersionId] : []),
  );
  const seenActiveRef = useRef(activeVersionId);
  if (activeVersionId !== seenActiveRef.current) {
    seenActiveRef.current = activeVersionId;
    if (activeVersionId && !expandedIds.has(activeVersionId)) {
      setExpandedIds(new Set(expandedIds).add(activeVersionId));
    }
  }

  function toggleExpanded(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <History className="size-3.5 text-primary" strokeWidth={1.5} />
          <span className="text-eyebrow">History</span>
        </div>
        <span className="text-xs text-muted-foreground">
          {total} generation{total !== 1 ? "s" : ""}
        </span>
      </div>
      <div className="max-h-52 overflow-y-auto pb-2">
        <ul className="space-y-1">
          {versions.map((v, i) => {
            const isActive = v.id === activeVersionId;
            const isError = Boolean(v.error);
            const isExpanded = expandedIds.has(v.id);
            const label = `v${total - i}`;
            const versionModelId = v.paramsUsed?.modelId ?? v.modelUsed ?? "";
            const modelLabel = versionModelId.split(":")[1] ?? "";
            // YUV-295: what this version was actually generated with. Without it two rows for
            // the same prompt are indistinguishable — and since restoring one now also restores
            // its model and params, the row has to show what restoring would apply.
            const paramSummary = describeVersionParams(
              imageGenClientModelMap[versionModelId]?.params,
              v.paramsUsed ?? {},
            )
              .map((p) => `${p.label}: ${p.value}`)
              .join(" · ");

            return (
              <li key={v.id} className="overflow-hidden rounded-lg border border-border">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => toggleExpanded(v.id)}
                  className={cn(
                    "block h-auto w-full rounded-none border-0 px-3 py-2 text-left font-normal whitespace-normal transition-colors hover:bg-transparent dark:hover:bg-transparent",
                    isActive
                      ? "bg-primary/8"
                      : "cursor-pointer hover:bg-muted dark:hover:bg-muted",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <VersionStatusIcon status={v.approvalStatus} />
                      <span
                        className={cn(
                          "text-sm font-medium",
                          isActive ? "text-primary" : "text-foreground",
                        )}
                      >
                        {label}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {formatRelativeTime(v.createdAt)}
                      </span>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      {v.output && (
                        <div className="size-7 overflow-hidden rounded-sm border border-border">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={v.output} alt="" className="size-full object-cover" />
                        </div>
                      )}
                      {isActive && (
                        <span className="text-[0.65rem] font-semibold uppercase tracking-wide text-primary">
                          Active
                        </span>
                      )}
                      <ChevronDown
                        className={cn(
                          "size-3.5 text-muted-foreground transition-transform",
                          isExpanded && "rotate-180",
                        )}
                        strokeWidth={1.5}
                      />
                    </div>
                  </div>
                </Button>

                {isExpanded && (
                  <div className="border-t border-border px-3 py-2">
                    {modelLabel && (
                      <p className="line-clamp-1 text-[0.7rem] leading-snug text-muted-foreground">
                        {modelLabel}
                      </p>
                    )}

                    {paramSummary && (
                      <p className="mt-0.5 line-clamp-2 text-[0.65rem] leading-snug text-muted-foreground/80">
                        {paramSummary}
                      </p>
                    )}

                    {v.inputsUsed?.baseVersionId && (
                      <p className="mt-0.5 text-[0.65rem] leading-snug text-primary/70">
                        edited from {labelById.get(v.inputsUsed.baseVersionId) ?? "an earlier version"}
                      </p>
                    )}
                    {v.inputsUsed?.instruction && (
                      <p className="mt-0.5 line-clamp-1 text-[0.7rem] leading-snug text-muted-foreground">
                        “{v.inputsUsed.instruction}”
                      </p>
                    )}
                    {v.makerName !== undefined && (
                      <p className="mt-0.5 text-[0.65rem] leading-snug text-muted-foreground/80">
                        Made by {v.makerName ?? "an unknown maker"}
                      </p>
                    )}

                    {/* D173: the full decision thread replaces the old single
                        latest-decision line — the newest thread entry already IS that
                        line, so showing both would repeat the same information twice. */}
                    <VersionDecisionThread decisions={v.decisions ?? []} />

                    {!isActive && !isError && (
                      <div className="mt-2 flex justify-end">
                        <Button
                          type="button"
                          variant="outline"
                          size="xs"
                          disabled={restoring}
                          onClick={() => onRestore(v.id)}
                        >
                          Restore this version
                        </Button>
                      </div>
                    )}
                    {isError && (
                      <p className="mt-2 text-right text-xs text-red-500">Error</p>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors in this file.

- [ ] **Step 3: Lint**

Run: `npx eslint src/components/nodes/image-gen-version-history.tsx`
Expected: no errors.

- [ ] **Step 4: Manual verification**

Run `npm run dev`, open a canvas with an image-gen node that has at least 3 versions: one with no decision yet (pending), one rejected, one approved. Open the node's focus view → History tab. Confirm: every row is collapsed except the active version's; each collapsed row shows a colored status icon (amber dot / emerald check / red flag) instead of the old plain dot; clicking a row body toggles it open/closed (chevron rotates); the expanded pending row shows no decision thread; the expanded rejected/approved rows show a thread entry with the right icon, color, reviewer name, and note; clicking "Restore this version" on a non-active row still restores it and does not also toggle that row's expand state in a confusing way.

- [ ] **Step 5: Commit**

```bash
git add src/components/nodes/image-gen-version-history.tsx
git commit -m "feat(approval): collapse/expand redesign + decision thread for image-gen history (D176)"
```

---

### Task 8: `VideoGenVersionHistory` — collapse/expand redesign

**Files:**
- Modify: `src/components/nodes/video-gen-version-history.tsx`

**Interfaces:**
- Consumes: same as Task 7.
- Produces: `VideoGenVersionSummary` gains `decisions?: VersionDecisionSummary[]`. `hideHeader` prop is preserved unchanged.

- [ ] **Step 1: Replace the file**

Replace the full contents of `src/components/nodes/video-gen-version-history.tsx`:

```typescript
"use client";

import { useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { History } from "lucide-react";
import type { ApprovalStatus, VersionDecisionSummary } from "@/lib/approval";
import { Button } from "@/components/ui/button";
import { describeVersionParams } from "@/lib/generations/version-params";
import { videoGenClientModelMap } from "@/lib/video-gen/client-models";
import { formatRelativeTime } from "@/lib/format/relative-time";
import { VersionStatusIcon, VersionDecisionThread } from "./version-decision-history";

export type VideoGenVersionSummary = {
  id: string;
  output: string | null; // video URL
  error: string | null;
  modelUsed?: string | null;
  paramsUsed: Record<string, unknown>;
  createdAt: string;
  // Real settled credits — null for legacy versions predating the credit system.
  creditsCharged?: number | null;
  // D29 approval flag. The versions API has always returned these; video was the one
  // node type with no control able to act on them (R10.1).
  approvalStatus?: ApprovalStatus;
  note?: string | null;
  // R11.3/R11.4: resolved display names, else null (D168).
  makerName?: string | null;
  approvedByName?: string | null;
  approvedAt?: string | null;
  // D173: every decision made on this version, newest first.
  decisions?: VersionDecisionSummary[];
};

type Props = {
  versions: VideoGenVersionSummary[];
  activeVersionId: string | null;
  onRestore: (versionId: string) => void;
  restoring: boolean;
  hideHeader?: boolean;
};

export function VideoGenVersionHistory({
  versions,
  activeVersionId,
  onRestore,
  restoring,
  hideHeader = false,
}: Props) {
  if (versions.length === 0) return null;
  const total = versions.length;

  // D176: same expand-state rule as ImageGenVersionHistory — see that file's comment.
  const [expandedIds, setExpandedIds] = useState<Set<string>>(
    () => new Set(activeVersionId ? [activeVersionId] : []),
  );
  const seenActiveRef = useRef(activeVersionId);
  if (activeVersionId !== seenActiveRef.current) {
    seenActiveRef.current = activeVersionId;
    if (activeVersionId && !expandedIds.has(activeVersionId)) {
      setExpandedIds(new Set(expandedIds).add(activeVersionId));
    }
  }

  function toggleExpanded(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div>
      {!hideHeader && (
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <History className="size-3.5 text-primary" strokeWidth={1.5} />
            <span className="text-eyebrow">History</span>
          </div>
          <span className="text-xs text-muted-foreground">
            {total} generation{total !== 1 ? "s" : ""}
          </span>
        </div>
      )}
      <div className="max-h-52 overflow-y-auto pb-2">
        <ul className="space-y-1">
          {versions.map((v, i) => {
            const isActive = v.id === activeVersionId;
            const isError = Boolean(v.error);
            const isExpanded = expandedIds.has(v.id);
            const label = `v${total - i}`;
            const modelLabel = (v.modelUsed ?? "").split(":")[1] ?? "";
            // YUV-295: what this version was actually generated with. Without it two rows for
            // the same shot are indistinguishable — and since restoring one now also restores
            // its model and params, the row has to show what restoring would apply.
            const paramSummary = describeVersionParams(
              videoGenClientModelMap[v.modelUsed ?? ""]?.params,
              v.paramsUsed,
            )
              .map((p) => `${p.label}: ${p.value}`)
              .join(" · ");

            return (
              <li key={v.id} className="overflow-hidden rounded-lg border border-border">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => toggleExpanded(v.id)}
                  className={cn(
                    "block h-auto w-full rounded-none border-0 px-3 py-2 text-left font-normal whitespace-normal transition-colors hover:bg-transparent dark:hover:bg-transparent",
                    isActive
                      ? "bg-primary/8"
                      : "cursor-pointer hover:bg-muted dark:hover:bg-muted",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <VersionStatusIcon status={v.approvalStatus} />
                      <span
                        className={cn(
                          "text-sm font-medium",
                          isActive ? "text-primary" : "text-foreground",
                        )}
                      >
                        {label}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {formatRelativeTime(v.createdAt)}
                      </span>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      {v.output && (
                        <div className="size-7 overflow-hidden rounded-sm border border-border">
                          <video
                            src={v.output}
                            className="size-full object-cover"
                            muted
                            playsInline
                          />
                        </div>
                      )}
                      {isActive && (
                        <span className="text-[0.65rem] font-semibold uppercase tracking-wide text-primary">
                          Active
                        </span>
                      )}
                      <ChevronDown
                        className={cn(
                          "size-3.5 text-muted-foreground transition-transform",
                          isExpanded && "rotate-180",
                        )}
                        strokeWidth={1.5}
                      />
                    </div>
                  </div>
                </Button>

                {isExpanded && (
                  <div className="border-t border-border px-3 py-2">
                    {modelLabel && (
                      <p className="line-clamp-1 text-[0.7rem] leading-snug text-muted-foreground">
                        {modelLabel}
                      </p>
                    )}

                    {paramSummary && (
                      <p className="mt-0.5 line-clamp-2 text-[0.65rem] leading-snug text-muted-foreground/80">
                        {paramSummary}
                      </p>
                    )}
                    {v.makerName !== undefined && (
                      <p className="mt-0.5 text-[0.65rem] leading-snug text-muted-foreground/80">
                        Made by {v.makerName ?? "an unknown maker"}
                      </p>
                    )}

                    {/* D173: the full decision thread replaces the old single
                        latest-decision line. */}
                    <VersionDecisionThread decisions={v.decisions ?? []} />

                    {!isActive && !isError && (
                      <div className="mt-2 flex justify-end">
                        <Button
                          type="button"
                          variant="outline"
                          size="xs"
                          disabled={restoring}
                          onClick={() => onRestore(v.id)}
                        >
                          Restore this version
                        </Button>
                      </div>
                    )}
                    {isError && (
                      <p className="mt-2 text-right text-xs text-red-500">Error</p>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors in this file.

- [ ] **Step 3: Lint**

Run: `npx eslint src/components/nodes/video-gen-version-history.tsx`
Expected: no errors.

- [ ] **Step 4: Manual verification**

Same as Task 7 Step 4, but for a video-gen node's focus view. Note: `hideHeader` (checked via `grep -rn hideHeader src/components/nodes/`) is declared on this component's props but is never actually passed `true` by any current caller — every call site uses the default `false` — so there is no header-suppressed state to separately verify; this note exists only so the next person touching this prop doesn't assume a tested path that isn't there.

- [ ] **Step 5: Commit**

```bash
git add src/components/nodes/video-gen-version-history.tsx
git commit -m "feat(approval): collapse/expand redesign + decision thread for video-gen history (D176)"
```

---

### Task 9: Thread `decisions` through `videoGenApi.fetchVersions`

**Files:**
- Modify: `src/lib/video-gen/api.ts`

**Interfaces:**
- Consumes: the `decisions` field Task 5's route now returns.
- Produces: `videoGenApi.fetchVersions`'s return type includes `decisions` per version, matching `VideoGenVersionSummary`.

- [ ] **Step 1: Implement**

In `src/lib/video-gen/api.ts`, in the `fetchVersions` method, the inline `json.versions` type currently ends (after the fields Task 6 of the prior plan added):

```typescript
        approvalStatus?: "pending" | "approved" | "changes_requested";
        note?: string | null;
        makerName?: string | null;
        approvedByName?: string | null;
        approvedAt?: string | null;
      }>;
```

Add `decisions` to that inline type:

```typescript
        approvalStatus?: "pending" | "approved" | "changes_requested";
        note?: string | null;
        makerName?: string | null;
        approvedByName?: string | null;
        approvedAt?: string | null;
        decisions?: Array<{
          status: "approved" | "changes_requested";
          note: string | null;
          reviewerName: string | null;
          decidedAt: string;
        }>;
      }>;
```

And in the `.map((v) => ({ ... }))` return block immediately below it, which currently ends:

```typescript
        approvalStatus: v.approvalStatus,
        note: v.note ?? null,
        makerName: v.makerName ?? null,
        approvedByName: v.approvedByName ?? null,
        approvedAt: v.approvedAt ?? null,
      })),
```

add `decisions: v.decisions ?? [],`:

```typescript
        approvalStatus: v.approvalStatus,
        note: v.note ?? null,
        makerName: v.makerName ?? null,
        approvedByName: v.approvedByName ?? null,
        approvedAt: v.approvedAt ?? null,
        decisions: v.decisions ?? [],
      })),
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors anywhere in the project — this was the last file still missing the `decisions` field, so Tasks 5-9 together should leave the whole project clean.

- [ ] **Step 3: Commit**

```bash
git add src/lib/video-gen/api.ts
git commit -m "feat(approval): thread decision history through videoGenApi.fetchVersions (D173)"
```

---

### Task 10: `ApprovalReadout` gets matching icons (D177)

**Files:**
- Modify: `src/components/nodes/inline-approval-bar.tsx`

**Interfaces:**
- Consumes: `Check`, `MessageSquareWarning` — already imported in this file (line 3) for the Approve/Reject buttons; no new imports needed.
- Produces: no signature change to `InlineApprovalBar` or `ApprovalReadout` — purely visual.

- [ ] **Step 1: Implement**

In `src/components/nodes/inline-approval-bar.tsx`, in the `ApprovalReadout` function, replace:

```typescript
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
```

with:

```typescript
      {/* R9.3: the note is read ON THE NODE, beside the controls that act on it — the
          place the fix actually happens. D177 revises D169's "approval is neutral, no
          icon" call: both outcomes now get a matching icon, reused from this file's own
          Approve/Reject buttons above — not a new icon vocabulary. */}
      {status === "changes_requested" && note.trim() && (
        <p className="mt-2 flex items-start gap-1.5 rounded-r-md border-l-2 border-destructive/40 bg-destructive/5 px-2.5 py-1.5 text-xs leading-relaxed text-destructive">
          <MessageSquareWarning className="mt-0.5 size-3 shrink-0" strokeWidth={1.5} />
          <span>{note}</span>
        </p>
      )}
      {/* D169/D177: who approved, and when — captured since D167, invisible until D169,
          neutral-only until D177. */}
      {status === "approved" && approvedByName && (
        <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Check className="size-3 shrink-0 text-emerald-600 dark:text-emerald-400" strokeWidth={1.5} />
          Approved by {approvedByName} · {formatRelativeTime(approvedAt)}
        </p>
      )}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Lint**

Run: `npx eslint src/components/nodes/inline-approval-bar.tsx`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/nodes/inline-approval-bar.tsx
git commit -m "feat(approval): ApprovalReadout gets a matching icon for both outcomes (D177)"
```

---

### Task 11: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full relevant test suite**

Run: `npx vitest run src/lib/review src/lib/actions/approval.test.ts src/lib/approval.test.ts`
Expected: all PASS (should now include the 4 new decision-history tests from Task 4, total higher than the 48 baseline this plan started from).

- [ ] **Step 2: Full typecheck**

Run: `npx tsc --noEmit`
Expected: no errors anywhere in the repo.

- [ ] **Step 3: Lint every touched file**

Run: `npx eslint src/lib/db/decisions.ts src/lib/approval.ts src/lib/actions/approval.ts "src/app/api/nodes/[id]/versions/route.ts" src/components/nodes/version-decision-history.tsx src/components/nodes/image-gen-version-history.tsx src/components/nodes/video-gen-version-history.tsx src/lib/video-gen/api.ts src/components/nodes/inline-approval-bar.tsx`
Expected: no errors.

- [ ] **Step 4: Encoding check**

This repo's sandbox has a documented precedent (from the prior approval-audit-trail plan) of a PowerShell-based edit introducing a UTF-8 BOM and mojibake corruption. For every file touched by this plan, confirm no BOM (first bytes not `EF BB BF`) and no mojibake (`grep -c 'Â\|â€'` returns 0) — especially `image-gen-version-history.tsx` and `video-gen-version-history.tsx`, which contain the most non-ASCII characters (curly quotes, middle dots).

- [ ] **Step 5: Note the pending manual migration step**

Migration `0032_approval_seen.sql` (from the prior plan) and this plan's `0033_node_version_decisions.sql` both still need to be applied to the hosted Supabase project via dashboard/CLI before this feature works end-to-end — no sandbox agent in this environment has direct database access.

---

## Summary of what this plan does NOT touch

Per the design spec's §7 (Out of scope): no editing or deleting a past decision (append-only), no decision history for prompt/motion-prompt nodes (R3.2 exclusion holds), no change to who can decide or what (still senior/owner only, still only the active version), and no change to `node_versions`' existing columns, the review queue/counts, or the navbar inbox — `review_queue_items` (D159) and everything reading it are untouched.
