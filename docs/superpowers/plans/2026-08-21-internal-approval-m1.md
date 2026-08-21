# Internal Approval — M1 (Seats, Enforcement, Attribution) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make an organization able to hold a junior and a senior, enforce approval permission on the server against the caller's real org role, and record who made each version — the prerequisite gate without which nothing else in the approval PRD is observable.

**Architecture:** One migration adds `org_id` to `node_versions` (tenancy + the Realtime filter column + an org-isolation SELECT policy) and two real user-reference columns for maker and reviewer. `setVersionApprovalAction` stops accepting a caller-supplied `approvedBy` and resolves the caller server-side instead. Seat provisioning extends the existing super-admin org-detail surface rather than introducing a new one.

**Tech Stack:** Next.js 16 (App Router, server actions), React 19, Supabase (Postgres + RLS + service-role client), Zod v4, Tailwind v4, shadcn/Base UI primitives, Vitest.

## Global Constraints

- **Controls are shadcn primitives only.** Never a raw `<button>`, `<input>`, `<select>`, `<textarea>`. Base UI composes via the `render` prop, **not** `asChild`. Anything inside a field uses `InputGroup`/`InputGroupAddon` from `src/components/ui/input-group.tsx`.
- **API helpers:** use `apiError`/`apiOk` — never `NextResponse.json(...)` directly.
- **Reuse before redeclaring.** Import from `src/lib/<feature>/constants.ts`, `utils.ts`, `src/lib/api/route-helpers.ts`. Two call sites = extract; one = leave inline.
- **Migrations are applied BY HAND** through the Supabase SQL editor (paste + Run). There is no `supabase db push` in this project. An agent must never claim a migration is applied — it can only write the file and log it as pending.
- **Migrations are batched to the end of the feature** (operator decision, 2026-08-21). Write them, commit them, record them in `docs/superpowers/plans/MIGRATIONS-PENDING.md`, and continue as if applied. Never block a task on one. Surface the pending list when the feature is done.
- **Test command:** `npx vitest run <path>`. Full suite: `npx vitest run`. Baseline at branch start: **157 files, 1246 tests, 0 failures.**
- **Lint:** `npm run lint` before every commit. **The base already has 28 errors and 28 warnings** on `origin/main` (canvas hooks, `post-stage.tsx`, `sora.ts`, and others). The bar is therefore **no NEW errors in files this feature touches**, not a clean run — verify with:
  `npm run lint 2>&1 | awk '/^C:/{f=$0} /error/{print f}' | sort -u`
  and confirm no file you edited appears. Do not "fix" unrelated pre-existing errors here; that is a separate change and it would bury this feature's diff.
- **Design system:** Clash Display (`font-display`) + Gilroy only. Purple `#5829c7` sparingly. Amber = pending, `destructive` token = changes_requested. Never hardcode colors outside the documented status-badge exception.
- **ADR numbers for this feature are D159–D167.** Do not use D149–D158 — those belong to the unmerged reel-editor branch. See the design spec §2.1.
- **Commit style:** end every commit message with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

## Reference documents

- Design spec: `docs/superpowers/specs/2026-08-21-internal-approval-workflow-design.md`
- PRD (authority on *what*): `docs/superpowers/specs/2026-08-19-internal-approval-workflow-prd.md`
- ADR log: `docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md` §7

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `supabase/migrations/0030_approval_workflow.sql` | **Create.** org_id + backfill + trigger + index + SELECT policy + realtime publication + two user-reference columns | 1 |
| `docs/auth-production-migration.md` | **Modify.** Record 0030 in the migration ledger, same session it ships | 1 |
| `src/lib/approval.ts` | **Modify.** Add pure `canSetApproval` / `requiresNote` predicates beside `buildApprovalUpdate` | 2 |
| `src/lib/approval.test.ts` | **Modify.** Cover the two new predicates | 2 |
| `src/lib/actions/approval.ts` | **Modify.** Resolve caller server-side; drop `approvedBy`; check role, org, and note | 3 |
| `src/lib/actions/approval.test.ts` | **Create.** Designer rejected, cross-org rejected, blank rejection note rejected | 3 |
| `src/lib/db/versions.ts` | **Modify.** `insertVersion` accepts `operatorUserId` | 4 |
| `src/app/api/nodes/[id]/{image-generate,generate,compose,parse,video-prompt}/route.ts` | **Modify.** Pass `operatorUserId: caller.userId` | 4 |
| `src/lib/generations/complete.ts` | **Modify.** Pass `operatorUserId: generation.user_id` — the async path has no session | 4 |
| `src/lib/db/profiles.ts` | **Create.** `resolveDisplayNames(orgId, userIds)`, org-scoped through `org_memberships` | 5 |
| `src/lib/db/organizations.ts` | **Modify.** `addOrgMember`, `updateMemberRole` | 6 |
| `src/lib/orgs/org-schema.ts` | **Modify.** `AddMemberSchema`, `ORG_ROLES` | 6 |
| `src/lib/actions/admin.ts` | **Modify.** `addOrgMemberAction`, `updateMemberRoleAction` | 7 |
| `src/app/admin/orgs/[id]/add-member-dialog.tsx` | **Create.** Email/name/role dialog, temp-password result | 8 |
| `src/app/admin/orgs/[id]/member-role-select.tsx` | **Create.** Per-row role Select | 8 |
| `src/app/admin/orgs/[id]/org-detail-tabs.tsx` | **Modify.** Wire both into the Members card | 8 |
| `src/components/nodes/inline-approval-bar.tsx` | **Modify.** Drop the `approvedBy` prop path; correct the stale security comment | 3, 9 |
| `src/components/nodes/{image-gen,prompt,video-prompt}-focus-view.tsx` | **Modify.** Drop `approvedBy` from the action call | 3 |
| `src/components/nodes/video-gen-focus-view.tsx` | **Modify.** Add the approval bar (R10.1) | 9 |
| `src/lib/identity.ts` | **Modify.** Fix the stale "spoofable localStorage" comment | 10 |
| ADR log §7 | **Modify.** Append D159–D167 | 10 |

**Task order matters.** Task 1 is schema; Tasks 2–3 are the enforcement core; Task 4 depends on Task 1's columns; Tasks 6–8 are the seat surface and are independent of 2–5; Tasks 9–10 are cleanup.

---

## Task 1: Migration — tenancy, policy, attribution columns

**Files:**
- Create: `supabase/migrations/0030_approval_workflow.sql`
- Modify: `docs/auth-production-migration.md`

**Interfaces:**
- Consumes: nothing.
- Produces: `node_versions.org_id`, `node_versions.operator_user_id`, `node_versions.approved_by_user_id`; the `org isolation` SELECT policy; `node_versions` in the `supabase_realtime` publication.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0030_approval_workflow.sql`:

```sql
-- D166/D167: the schema half of internal maker-checker approval.
--
-- Three things that look separable but are not:
--   1. org_id on node_versions — the approval action must verify a version belongs to
--      the caller's org before writing to it (tenancy, not just role).
--   2. An org-isolation SELECT policy — 0017 enabled RLS on node_versions with ZERO
--      policies (default-deny). Realtime delivers postgres_changes rows through RLS, so
--      without a policy a browser subscription receives NOTHING, silently. This is the
--      exact failure 0018 had to fix after 0017 killed the generation tray.
--   3. Real user references for maker and reviewer — R11.1/R11.2. `operator` and
--      `approved_by` stay as legacy text columns and are never written again; reads
--      prefer the uuid and fall back to the string (R11.4).

-- ── 1. org_id, mirroring 0014's treatment of `generations` ───────────────────
alter table node_versions add column org_id uuid references organizations(id);

-- 3-hop backfill: node -> canvas -> client -> org.
update node_versions v set org_id = cl.org_id
  from nodes n
  join canvases cv on cv.id = n.canvas_id
  join clients  cl on cl.id = cv.client_id
 where n.id = v.node_id
   and v.org_id is null;

-- Serves both the Realtime filter and the pending-count queries in M2.
create index if not exists node_versions_org_status_idx
  on node_versions (org_id, approval_status);

-- A TRIGGER, not an assignment inside insertVersion(): there are six insert call sites
-- today and more will be added. A path that forgets org_id produces a version invisible
-- to every count and every subscription — a bug that presents as "the queue is quietly
-- wrong", which is the worst possible failure for a feature whose value is being trusted.
create or replace function set_node_version_org_id() returns trigger
language plpgsql as $$
begin
  if new.org_id is null then
    select cl.org_id into new.org_id
      from nodes n
      join canvases cv on cv.id = n.canvas_id
      join clients  cl on cl.id = cv.client_id
     where n.id = new.node_id;
  end if;
  return new;
end;
$$;

drop trigger if exists node_versions_set_org_id on node_versions;
create trigger node_versions_set_org_id
  before insert on node_versions
  for each row execute function set_node_version_org_id();

-- ── 2. RLS: required for Realtime delivery, and R2.4 wants it independently ───
-- Same shape and scope as 0014's policies: a member reads their own org's rows only.
-- R2.4: a designer may READ every approval state and note, including on other people's
-- work. Review is not secret; only setting a status is restricted.
drop policy if exists "org isolation" on node_versions;
create policy "org isolation" on node_versions for select
  using (
    org_id = (select org_id from org_memberships where user_id = auth.uid() limit 1)
  );

-- Guarded add — the table's publication state isn't recorded in any prior migration,
-- so this must be safe to run either way (same guard style as 0014).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'node_versions'
  ) then
    alter publication supabase_realtime add table node_versions;
  end if;
end $$;

-- ── 3. Attribution (R11.1, R11.2) ────────────────────────────────────────────
-- on delete set null: deleting a user must not delete the work they made. Attribution
-- degrades to the legacy text column, or to "Unknown" (R11.4).
alter table node_versions
  add column operator_user_id    uuid references auth.users(id) on delete set null,
  add column approved_by_user_id uuid references auth.users(id) on delete set null;

create index if not exists node_versions_operator_user_idx
  on node_versions (operator_user_id)
  where operator_user_id is not null;
```

- [ ] **Step 2: Verify the SQL parses**

There is no local Postgres in this project. Verify by eye against these specific risks, then hand to the operator:

1. `update … from … join` uses Postgres's `UPDATE … FROM` form — the target table `node_versions v` must **not** be repeated in the `from` clause. Confirm it is not.
2. `create policy` is not idempotent, hence the `drop policy if exists` above.
3. `alter publication` fails hard if the table is already a member, hence the `pg_publication_tables` guard.

- [ ] **Step 3: Record the migration in the ledger**

Append to `docs/auth-production-migration.md`, under a new heading after the existing content:

```markdown
## Migration 0030 — approval workflow (2026-08-21)

`supabase/migrations/0030_approval_workflow.sql`. Paste into the Supabase SQL editor → Run.

Adds to `node_versions`: `org_id` (backfilled 3-hop node→canvas→client→org, plus a
BEFORE INSERT trigger), an `(org_id, approval_status)` index, an `org isolation` SELECT
policy, membership of the `supabase_realtime` publication, and the
`operator_user_id` / `approved_by_user_id` user references.

**Why the policy matters:** 0017 left `node_versions` default-deny with zero policies.
Realtime evaluates RLS, so the internal-approval live updates would silently receive
nothing without it — the same failure mode 0018 fixed for the generation tray.

**Verify after running:**

```sql
-- expect zero rows: every version should carry an org
select count(*) from node_versions where org_id is null;

-- expect one row
select policyname from pg_policies
 where tablename = 'node_versions' and policyname = 'org isolation';

-- expect one row
select tablename from pg_publication_tables
 where pubname = 'supabase_realtime' and tablename = 'node_versions';
```
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0030_approval_workflow.sql docs/auth-production-migration.md
git commit -m "feat(approval): migration 0030 — node_versions org_id, RLS policy, attribution

org_id serves three purposes at once: the approval action's tenancy check, the
Realtime postgres_changes filter column, and the M2 pending-count index.

The org-isolation SELECT policy is load-bearing, not a backstop. 0017 enabled RLS
on node_versions with zero policies; Realtime delivers through RLS, so a browser
subscription would receive nothing at all — silently. Same failure 0018 fixed for
the generation tray.

org_id is filled by a BEFORE INSERT trigger rather than by insertVersion(), because
a forgotten call site would produce versions invisible to every count and every
subscription rather than an obvious error.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

- [ ] **Step 5: Log it as pending — do NOT stop**

**Operator decision (2026-08-21): migrations are applied in one batch at the end of the
feature, not per-task.** Write the file, commit it, add it to the pending list below, and
keep going. Treat the schema as if applied.

Append to `docs/superpowers/plans/MIGRATIONS-PENDING.md` (create it if absent):

```markdown
- [ ] `0030_approval_workflow.sql` — node_versions org_id + backfill + trigger,
      `org isolation` SELECT policy, supabase_realtime membership,
      operator_user_id / approved_by_user_id. Verify queries in
      docs/auth-production-migration.md § "Migration 0030".
```

**What this means for the tasks that follow.** Tasks 3, 4 and 9 write to columns this
migration creates, so until it is applied:

- Unit tests still pass — they mock Supabase and never touch a real database.
- `npm run lint` and `tsc` still pass — the columns are untyped strings in the query builder.
- **Manual verification steps will fail** against the live database with
  `column "org_id" does not exist` (or similar). That is expected, not a bug in the code.
  Skip the manual checks in Tasks 8 and 9 and the M1 Acceptance list until the batch runs.

Anything that fails *only* in a manual browser check, and only with a missing-column error,
is the pending migration — do not "fix" the code to work around it.

---

## Task 2: Pure permission predicates

**Files:**
- Modify: `src/lib/approval.ts`
- Modify: `src/lib/approval.test.ts`

**Interfaces:**
- Consumes: `OrgRole` from `@/lib/dal-logic`.
- Produces: `canSetApproval(orgRole: OrgRole): boolean`, `requiresNote(status: ApprovalStatus): boolean`.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/approval.test.ts`:

```ts
import { canSetApproval, requiresNote } from "./approval";

describe("canSetApproval", () => {
  it("permits owner and senior", () => {
    expect(canSetApproval("owner")).toBe(true);
    expect(canSetApproval("senior")).toBe(true);
  });

  it("refuses designer — R2.1, the whole point of the check", () => {
    expect(canSetApproval("designer")).toBe(false);
  });
});

describe("requiresNote", () => {
  it("requires a note for a rejection — R6.5", () => {
    expect(requiresNote("changes_requested")).toBe(true);
  });

  it("does not require one for approval or reset", () => {
    expect(requiresNote("approved")).toBe(false);
    expect(requiresNote("pending")).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/approval.test.ts`
Expected: FAIL — `canSetApproval is not a function` (or an import resolution error).

- [ ] **Step 3: Implement**

Append to `src/lib/approval.ts`:

```ts
import type { OrgRole } from "@/lib/dal-logic";

// R2.1: only owner/senior may set approval_status. This matches the existing
// orgRoleToIdentityRole collapse (owner is treated as senior everywhere), and is the
// PREDICATE ONLY — the enforcement lives in setVersionApprovalAction, which resolves the
// caller server-side. Keeping the rule pure means it is unit-testable without a session.
export function canSetApproval(orgRole: OrgRole): boolean {
  return orgRole === "owner" || orgRole === "senior";
}

// R6.5: a rejection with no explanation is not useful to the maker, so the note is
// required for changes_requested and meaningless for the other two states (buildApprovalUpdate
// already nulls it for them).
export function requiresNote(status: ApprovalStatus): boolean {
  return status === "changes_requested";
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/approval.test.ts`
Expected: PASS, all tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/approval.ts src/lib/approval.test.ts
git commit -m "feat(approval): pure canSetApproval / requiresNote predicates

Kept pure and separate from the action, same split as buildApprovalUpdate — the
role rule is testable without a session, and there is exactly one place it lives.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 3: Server-enforced approval action

> **Blocked on Task 1 being applied to the database.** The action reads `org_id` and writes `approved_by_user_id`.

**Files:**
- Modify: `src/lib/actions/approval.ts`
- Create: `src/lib/actions/approval.test.ts`
- Modify: `src/components/nodes/image-gen-focus-view.tsx:773-777`
- Modify: `src/components/nodes/prompt-focus-view.tsx` (the `setVersionApprovalAction` call)
- Modify: `src/components/nodes/video-prompt-focus-view.tsx` (the `setVersionApprovalAction` call)
- Modify: `src/components/nodes/inline-approval-bar.tsx:19`

**Interfaces:**
- Consumes: `canSetApproval`, `requiresNote` (Task 2); `resolveCallerContext` from `@/lib/dal`; `buildApprovalUpdate` (existing).
- Produces: `setVersionApprovalAction(versionId: string, input: { status: ApprovalStatus; note?: string | null }): Promise<void>` — **note the removed `approvedBy` parameter.**

- [ ] **Step 1: Write the failing tests**

Create `src/lib/actions/approval.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockCaller = vi.fn();
const mockFrom = vi.fn();

vi.mock("@/lib/dal", () => ({ resolveCallerContext: () => mockCaller() }));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: () => ({ from: mockFrom }),
}));
vi.mock("@/lib/actions/with-action", () => ({
  withAction: (_name: string, fn: () => Promise<unknown>) => fn(),
}));

import { setVersionApprovalAction } from "./approval";

// A version row lookup returning the given org, then an update that records its payload.
function stubDb(versionOrgId: string | null, captured: { update?: unknown } = {}) {
  mockFrom.mockImplementation(() => ({
    select: () => ({
      eq: () => ({
        maybeSingle: async () =>
          versionOrgId === null
            ? { data: null, error: null }
            : { data: { id: "v1", org_id: versionOrgId }, error: null },
      }),
    }),
    update: (payload: unknown) => {
      captured.update = payload;
      return { eq: async () => ({ error: null }) };
    },
  }));
  return captured;
}

beforeEach(() => {
  mockFrom.mockReset();
  mockCaller.mockReset();
});

describe("setVersionApprovalAction", () => {
  it("rejects a designer — R2.2, even calling the action directly", async () => {
    mockCaller.mockResolvedValue({
      userId: "u1", orgId: "org-1", orgRole: "designer", platformRole: "member",
    });
    stubDb("org-1");
    await expect(
      setVersionApprovalAction("v1", { status: "approved" }),
    ).rejects.toThrow(/not permitted|approve/i);
  });

  it("rejects a version belonging to another org", async () => {
    mockCaller.mockResolvedValue({
      userId: "u1", orgId: "org-1", orgRole: "senior", platformRole: "member",
    });
    stubDb("org-2");
    await expect(
      setVersionApprovalAction("v1", { status: "approved" }),
    ).rejects.toThrow(/not found/i);
  });

  it("rejects changes_requested with a blank note — R6.5 on the server", async () => {
    mockCaller.mockResolvedValue({
      userId: "u1", orgId: "org-1", orgRole: "senior", platformRole: "member",
    });
    stubDb("org-1");
    await expect(
      setVersionApprovalAction("v1", { status: "changes_requested", note: "   " }),
    ).rejects.toThrow(/note/i);
  });

  it("writes the CALLER's id as reviewer, never a client-supplied value", async () => {
    mockCaller.mockResolvedValue({
      userId: "senior-1", orgId: "org-1", orgRole: "senior", platformRole: "member",
    });
    const captured = stubDb("org-1");
    await setVersionApprovalAction("v1", { status: "approved" });
    expect(captured.update).toMatchObject({
      approval_status: "approved",
      approved_by_user_id: "senior-1",
    });
  });

  it("permits an owner", async () => {
    mockCaller.mockResolvedValue({
      userId: "owner-1", orgId: "org-1", orgRole: "owner", platformRole: "member",
    });
    const captured = stubDb("org-1");
    await setVersionApprovalAction("v1", { status: "approved" });
    expect(captured.update).toMatchObject({ approved_by_user_id: "owner-1" });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/actions/approval.test.ts`
Expected: FAIL — the current action performs no role check, so the designer and cross-org cases resolve instead of throwing.

- [ ] **Step 3: Implement the action**

Replace the whole body of `src/lib/actions/approval.ts`:

```ts
"use server";

import { createServerSupabase } from "@/lib/supabase/server";
import { resolveCallerContext } from "@/lib/dal";
import {
  buildApprovalUpdate,
  canSetApproval,
  requiresNote,
  type ApprovalStatus,
} from "@/lib/approval";
import { withAction } from "@/lib/actions/with-action";

// D29/D166: set the approval flag on a SPECIFIC version (the caller passes the node's
// active version id). Annotates an attempt — never a new attempt — so no new version
// row, mirroring setVersionLabelAction (D18). Distinct from `decision`; never touches it.
//
// The `approvedBy` parameter is GONE by design. It used to arrive from the client, which
// meant the server recorded whatever identity the browser claimed. A role check bolted on
// top of a caller-supplied identity is not enforcement — so the reviewer is now resolved
// from the session and the parameter no longer exists to be spoofed (R2.1).
export async function setVersionApprovalAction(
  versionId: string,
  input: { status: ApprovalStatus; note?: string | null },
) {
  return withAction("setVersionApprovalAction", async () => {
    const caller = await resolveCallerContext();

    // R2.1/R2.2 — the role gate, against the caller's REAL org role. The UI also hides
    // the control from a designer, but that is a courtesy on top of this, never the
    // mechanism (R2.3).
    if (!canSetApproval(caller.orgRole)) {
      throw new Error("You are not permitted to approve or reject work.");
    }

    // R6.5 — enforced here, not just disabled in the UI. A rejection with no explanation
    // is not useful to the maker it routes back to.
    const note = input.note?.trim() || null;
    if (requiresNote(input.status) && !note) {
      throw new Error("A note is required when requesting changes.");
    }

    const supabase = createServerSupabase();

    // Tenancy, not just role: a senior of org A must not be able to annotate org B's
    // work by guessing a version id. 404-shaped message (never "wrong org"), matching
    // the withClient/withNode convention in route-helpers.ts.
    const { data: version, error: readErr } = await supabase
      .from("node_versions")
      .select("id, org_id")
      .eq("id", versionId)
      .maybeSingle();
    if (readErr) throw readErr;
    if (!version || (version as { org_id: string | null }).org_id !== caller.orgId) {
      throw new Error("Version not found.");
    }

    const update = buildApprovalUpdate({
      status: input.status,
      by: caller.userId,
      at: new Date().toISOString(),
      note,
    });

    const { error } = await supabase
      .from("node_versions")
      .update(update)
      .eq("id", versionId);
    if (error) throw error;
  });
}
```

- [ ] **Step 4: Update `buildApprovalUpdate` to write the user reference**

In `src/lib/approval.ts`, change `ApprovalUpdate` and `buildApprovalUpdate` so the
reviewer is written to the new uuid column rather than the legacy text one:

```ts
export type ApprovalUpdate = {
  approval_status: ApprovalStatus;
  approved_by_user_id: string | null;
  approved_at: string | null;
  note: string | null;
};

export function buildApprovalUpdate(input: {
  status: ApprovalStatus;
  by: string | null; // the caller's user id (R11.2), never a display name
  at: string;
  note?: string | null;
}): ApprovalUpdate {
  // Reset to pending clears attribution and feedback — the version is un-reviewed again.
  if (input.status === "pending") {
    return {
      approval_status: "pending",
      approved_by_user_id: null,
      approved_at: null,
      note: null,
    };
  }
  return {
    approval_status: input.status,
    approved_by_user_id: input.by,
    approved_at: input.at,
    // note is feedback for the maker — only meaningful for changes_requested.
    note: input.status === "changes_requested" ? (input.note ?? null) : null,
  };
}
```

Update the existing `buildApprovalUpdate` tests in `src/lib/approval.test.ts`: every
assertion referencing `approved_by` becomes `approved_by_user_id`.

- [ ] **Step 5: Update the three existing call sites**

In `src/components/nodes/image-gen-focus-view.tsx` (~line 773), delete the `approvedBy` line:

```ts
      await setVersionApprovalAction(activeVersionId, {
        status,
        note,
      });
```

Apply the identical edit in `src/components/nodes/prompt-focus-view.tsx` and
`src/components/nodes/video-prompt-focus-view.tsx`.

If `identity` becomes unused in any of those files as a result, leave it — it is still
read for `canApprove`. Run `npm run lint` to confirm no unused-variable error appears.

- [ ] **Step 6: Correct the stale security comment**

In `src/components/nodes/inline-approval-bar.tsx`, line 19:

```ts
  // R2.3: hides the control from a designer as a COURTESY. The real gate is the role
  // check inside setVersionApprovalAction, which resolves the caller server-side —
  // this prop is not, and must never become, the mechanism.
  canApprove: boolean;
```

- [ ] **Step 7: Run the tests**

Run: `npx vitest run src/lib/actions/approval.test.ts src/lib/approval.test.ts`
Expected: PASS.

Then the full suite: `npx vitest run`
Expected: 0 failures. Baseline is 1246 passing; this task adds 5 and modifies existing `buildApprovalUpdate` assertions.

- [ ] **Step 8: Lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add src/lib/actions/approval.ts src/lib/actions/approval.test.ts src/lib/approval.ts src/lib/approval.test.ts src/components/nodes/
git commit -m "feat(approval): enforce approval permission on the server (D166)

setVersionApprovalAction no longer accepts approvedBy. It used to arrive from the
client, so the server recorded whatever identity the browser claimed — a role check
bolted onto a caller-supplied identity is not enforcement. The reviewer is now
resolved from the session and the parameter no longer exists to be spoofed.

Also checks the version's org against the caller's (a senior of org A must not
annotate org B's work by guessing an id, 404-shaped as elsewhere) and requires a
note on changes_requested server-side, not merely in the UI.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 4: Maker attribution on every generation path

> **Blocked on Task 1 being applied.** Writes `operator_user_id`.

**Files:**
- Modify: `src/lib/db/versions.ts:8-40`
- Modify: `src/app/api/nodes/[id]/image-generate/route.ts:314,357`
- Modify: `src/app/api/nodes/[id]/generate/route.ts:96,149`
- Modify: `src/app/api/nodes/[id]/compose/route.ts:76,98`
- Modify: `src/app/api/nodes/[id]/parse/route.ts:51,67`
- Modify: `src/app/api/nodes/[id]/video-prompt/route.ts:102,156`
- Modify: `src/lib/generations/complete.ts:133`

**Interfaces:**
- Consumes: `caller: CallerContext` — already passed to every `withNode` handler by `route-helpers.ts:187`.
- Produces: `insertVersion` accepts `operatorUserId?: string | null`.

- [ ] **Step 1: Widen `insertVersion`**

In `src/lib/db/versions.ts`, add the field to the input type and the insert payload:

```ts
export async function insertVersion(input: {
  nodeId: string;
  inputsUsed?: Record<string, unknown>;
  paramsUsed?: Record<string, unknown>;
  modelUsed?: string | null;
  output?: unknown;
  error?: string | null;
  note?: string | null;
  operator?: string | null;
  // R11.1: the MAKER, as a real user reference. `operator` above is the legacy
  // free-text column — never written for generated versions, kept only so historical
  // rows (which only ever hold the literal "duplicate") still read (R11.4).
  operatorUserId?: string | null;
}): Promise<NodeVersionRow> {
```

and inside the `.insert({ … })` payload, after `operator`:

```ts
      operator: input.operator ?? null,
      operator_user_id: input.operatorUserId ?? null,
```

- [ ] **Step 2: Thread the caller through the five synchronous routes**

Each of these routes is already inside a `withNode(...)` handler whose third argument is
`caller: CallerContext`. For **each** `insertVersion({ … })` call listed in **Files**
above, add one line to the object:

```ts
        operatorUserId: caller.userId,
```

Confirm the handler's signature actually binds `caller` — several handlers destructure
only the parameters they use, so a handler written as `(nodeId, node) => …` must become
`(nodeId, node, caller) => …`.

- [ ] **Step 3: Attribute the asynchronous video path**

`src/lib/generations/complete.ts` runs from the Trigger.dev webhook. **There is no
session there** — `resolveCallerContext()` would throw or redirect. The maker is the
person who started the generation, which `generations.user_id` already records
(`db/generations.ts:51`, documented as "the REAL operator even while impersonating").

At line ~133:

```ts
  const version = await insertVersion({
    nodeId: generation.node_id,
    inputsUsed: generation.inputs_snapshot ?? {},
    paramsUsed: {
      ...(generation.params_snapshot ?? {}),
      durationSeconds: input.durationSeconds,
    },
    modelUsed: generation.model_used,
    output: storedVideoUrl,
    // No session at this boundary (Trigger.dev webhook). generations.user_id is who
    // kicked the job off, captured at insertGeneration — the correct maker for R11.1.
    operatorUserId: generation.user_id,
  });
```

- [ ] **Step 4: Verify every call site is covered**

Run: `npx vitest run`
Expected: 0 failures.

Then confirm no generation path was missed:

```bash
grep -rn "insertVersion({" src/ -A 2 | grep -c "operatorUserId"
```

Expected: `10` — the ten call sites listed in **Files** (five routes × two calls each is
ten, of which the second in each pair is the failure-path insert; plus `complete.ts` makes
eleven total call sites, one of which — `compose/route.ts:98` — is a non-generation
compose row). Read each hit and confirm the count matches what you actually changed
rather than trusting the number.

> **Judgement call, stated rather than hidden:** the failure-path inserts (the second
> `insertVersion` in each route, written when a generation errors) also get
> `operatorUserId`. A failed attempt still has a maker, and R3.5 keeps it out of the
> queue anyway because a failed version does not become active.

- [ ] **Step 5: Lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/db/versions.ts src/app/api/nodes/ src/lib/generations/complete.ts
git commit -m "feat(approval): record the version maker as a real user reference (R11.1)

The PRD described this as migrating operator from free-text names. It is not —
operator was only ever written as the literal \"duplicate\"; no generation path
recorded a maker at all. So this is a new write on every path, which is what makes
R4.3 (route a rejection back to the person who made it) resolvable.

The Trigger.dev completion path has no session, so it takes generations.user_id,
already captured at insertGeneration and already the real operator under
impersonation.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 5: Org-scoped display-name resolution

**Files:**
- Create: `src/lib/db/profiles.ts`
- Create: `src/lib/db/profiles.test.ts`

**Interfaces:**
- Consumes: `createServerSupabase`.
- Produces: `resolveDisplayNames(orgId: string, userIds: string[]): Promise<Map<string, string>>`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/db/profiles.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFrom = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: () => ({ from: mockFrom }),
}));

import { resolveDisplayNames } from "./profiles";

beforeEach(() => mockFrom.mockReset());

describe("resolveDisplayNames", () => {
  it("returns an empty map for no ids without querying", async () => {
    const out = await resolveDisplayNames("org-1", []);
    expect(out.size).toBe(0);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("resolves only ids that are members of the given org — R11.5", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "org_memberships") {
        return {
          select: () => ({
            eq: () => ({
              // "outsider" is deliberately absent: not a member of org-1
              in: async () => ({ data: [{ user_id: "insider" }], error: null }),
            }),
          }),
        };
      }
      return {
        select: () => ({
          in: async () => ({
            data: [{ user_id: "insider", display_name: "Ruby" }],
            error: null,
          }),
        }),
      };
    });

    const out = await resolveDisplayNames("org-1", ["insider", "outsider"]);
    expect(out.get("insider")).toBe("Ruby");
    expect(out.has("outsider")).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/db/profiles.test.ts`
Expected: FAIL — module `./profiles` not found.

- [ ] **Step 3: Implement**

Create `src/lib/db/profiles.ts`:

```ts
import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";

// R11.3/R11.5: resolve user ids to CURRENT display names, scoped to one org.
//
// The org filter is in the QUERY, not in the caller's discipline. Attribution must never
// resolve to a name from another organization, and the way to guarantee that is to make
// a foreign id simply absent from the result rather than to trust every call site to
// check. Callers render a missing id as the legacy `operator` string, or "Unknown" (R11.4).
//
// Two queries + a JS join, not a PostgREST embed: org_memberships and profiles both
// reference auth.users but neither has a direct FK to the other, so there is nothing for
// PostgREST to auto-embed across. Same shape as listOrgMembers and resolveCallerContext.
export async function resolveDisplayNames(
  orgId: string,
  userIds: string[],
): Promise<Map<string, string>> {
  const unique = [...new Set(userIds.filter(Boolean))];
  if (unique.length === 0) return new Map();

  const supabase = createServerSupabase();

  const { data: members, error: memErr } = await supabase
    .from("org_memberships")
    .select("user_id")
    .eq("org_id", orgId)
    .in("user_id", unique);
  if (memErr) throw memErr;

  const allowed = (members ?? []).map((m: { user_id: string }) => m.user_id);
  if (allowed.length === 0) return new Map();

  const { data: profiles, error: profErr } = await supabase
    .from("profiles")
    .select("user_id, display_name")
    .in("user_id", allowed);
  if (profErr) throw profErr;

  return new Map(
    ((profiles ?? []) as { user_id: string; display_name: string }[]).map((p) => [
      p.user_id,
      p.display_name,
    ]),
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/db/profiles.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/profiles.ts src/lib/db/profiles.test.ts
git commit -m "feat(approval): org-scoped display-name resolution (R11.3, R11.5)

The org filter lives in the query, not in the caller's discipline — a foreign user
id is simply absent from the result rather than relying on every call site to check
that it did not cross an org boundary.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 6: Seat provisioning — data layer

**Files:**
- Modify: `src/lib/db/organizations.ts`
- Modify: `src/lib/orgs/org-schema.ts`

**Interfaces:**
- Consumes: `generateTempPassword` (existing, same file); `createServerSupabase`.
- Produces:
  - `addOrgMember(input: { orgId: string; email: string; displayName: string; orgRole: OrgRole }): Promise<{ userId: string; tempPassword: string }>`
  - `updateMemberRole(orgId: string, userId: string, orgRole: OrgRole): Promise<void>`
  - `ORG_ROLES: readonly OrgRole[]`, `AddMemberSchema` (Zod).

- [ ] **Step 1: Add the schema**

Append to `src/lib/orgs/org-schema.ts`:

```ts
// The three roles the org_memberships check constraint permits (migration 0012).
// Single source for the add-member form, the role Select, and the action's validation.
export const ORG_ROLES = ["owner", "senior", "designer"] as const;

export const AddMemberSchema = z.object({
  email: z.email({ error: "Enter a valid email." }).trim(),
  displayName: z.string().min(2, { error: "Display name is required." }).trim(),
  orgRole: z.enum(ORG_ROLES, { error: "Pick a role." }),
});

export type AddMemberFields = z.infer<typeof AddMemberSchema>;
```

- [ ] **Step 2: Implement `addOrgMember`**

Append to `src/lib/db/organizations.ts`. This mirrors `createOrgWithOwner`'s sequence and
its best-effort cleanup — deliberately, so the two seat-creation paths behave identically:

```ts
// R1.1/R1.2: add a SECOND (third, fourth…) seat to an existing org. Mirrors
// createOrgWithOwner's create-user -> profile -> membership sequence and its best-effort
// cleanup, because these are the same operation differing only in whether the org already
// exists. Returns the temp password for out-of-band sharing; must_change_password forces
// the member to pick their own on first login, same as a freshly onboarded owner.
//
// Note the unique index is `one_org_per_user` — one ORG PER USER, not one user per org.
// Multiple seats have always been legal here (D80); nothing but a provisioning path was
// missing.
export async function addOrgMember(input: {
  orgId: string;
  email: string;
  displayName: string;
  orgRole: OrgRole;
}): Promise<{ userId: string; tempPassword: string }> {
  const supabase = createServerSupabase();

  const { data: org, error: orgErr } = await supabase
    .from("organizations")
    .select("id")
    .eq("id", input.orgId)
    .maybeSingle();
  if (orgErr) throw orgErr;
  if (!org) throw new Error("Agency not found.");

  const tempPassword = generateTempPassword();
  const { data: created, error: userErr } = await supabase.auth.admin.createUser({
    email: input.email,
    password: tempPassword,
    email_confirm: true,
    app_metadata: { platform_role: "member", must_change_password: true },
  });
  if (userErr || !created.user) {
    throw userErr ?? new Error("Failed to create user.");
  }
  const userId = created.user.id;

  const { error: profileErr } = await supabase
    .from("profiles")
    .insert({ user_id: userId, display_name: input.displayName });
  if (profileErr) {
    await supabase.auth.admin.deleteUser(userId);
    throw profileErr;
  }

  const { error: memberErr } = await supabase
    .from("org_memberships")
    .insert({ user_id: userId, org_id: input.orgId, org_role: input.orgRole });
  if (memberErr) {
    await supabase.auth.admin.deleteUser(userId);
    throw memberErr;
  }

  return { userId, tempPassword };
}

// R1.3. Verifies the membership belongs to THIS org before touching it — the same
// defense-in-depth resetMemberPassword applies against a tampered orgId/userId pair.
//
// R1.4 (an org must always retain an owner) is NOT enforced here: the
// `org_memberships_last_owner` trigger from migration 0012 already blocks demoting the
// final owner, and a database constraint is the right place for an invariant that must
// hold regardless of which code path attempts the write. The action surfaces the
// trigger's error rather than duplicating the rule.
export async function updateMemberRole(
  orgId: string,
  userId: string,
  orgRole: OrgRole,
): Promise<void> {
  const supabase = createServerSupabase();

  const { data: membership, error: memErr } = await supabase
    .from("org_memberships")
    .select("user_id")
    .eq("org_id", orgId)
    .eq("user_id", userId)
    .maybeSingle();
  if (memErr) throw memErr;
  if (!membership) throw new Error("Member not found in this agency.");

  const { error } = await supabase
    .from("org_memberships")
    .update({ org_role: orgRole })
    .eq("org_id", orgId)
    .eq("user_id", userId);
  if (error) throw error;
}
```

Add the `OrgRole` import at the top of the file:

```ts
import type { OrgRole } from "@/lib/dal-logic";
```

- [ ] **Step 3: Verify nothing regressed**

Run: `npx vitest run`
Expected: 0 failures.

- [ ] **Step 4: Lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/organizations.ts src/lib/orgs/org-schema.ts
git commit -m "feat(orgs): addOrgMember / updateMemberRole (R1.1-R1.3)

createOrgWithOwner was the only path in the repo calling auth.admin.createUser, and
it hardcodes org_role: owner — so an org could hold exactly one person and no role
but owner. The schema always permitted more (one_org_per_user constrains one ORG PER
USER); only the provisioning path was missing.

Role demotion deliberately does not re-implement the last-owner rule — migration
0012's org_memberships_last_owner trigger already enforces it, and an invariant that
must hold regardless of code path belongs in the database.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 7: Seat provisioning — server actions

**Files:**
- Modify: `src/lib/actions/admin.ts`

**Interfaces:**
- Consumes: `addOrgMember`, `updateMemberRole` (Task 6); `AddMemberSchema` (Task 6); `requireSuperAdmin`.
- Produces:
  - `addOrgMemberAction(orgId: string, formData: FormData): Promise<AddMemberState>` where `AddMemberState = { error?: string; result?: { email: string; tempPassword: string } } | undefined`
  - `updateMemberRoleAction(orgId: string, userId: string, orgRole: string): Promise<{ error?: string }>`

- [ ] **Step 1: Implement both actions**

Append to `src/lib/actions/admin.ts`:

```ts
export type AddMemberState =
  | { error?: string; result?: { email: string; tempPassword: string } }
  | undefined;

// R1.1/R1.2. Super-admin only (§6.12) — org owners provisioning their own seats is
// deferred, not rejected (PRD §10 Q1). Deliberately NOT wrapped in withAction(), for the
// same reason as this file's other actions: see the note at the top of the file.
export async function addOrgMemberAction(
  orgId: string,
  formData: FormData,
): Promise<AddMemberState> {
  await requireSuperAdmin();

  const parsed = AddMemberSchema.safeParse({
    email: formData.get("email"),
    displayName: formData.get("displayName"),
    orgRole: formData.get("orgRole"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  try {
    const { tempPassword } = await addOrgMember({
      orgId,
      email: parsed.data.email,
      displayName: parsed.data.displayName,
      orgRole: parsed.data.orgRole,
    });
    revalidatePath(`/admin/orgs/${orgId}`);
    return { result: { email: parsed.data.email, tempPassword } };
  } catch (e) {
    // Surface the real message: "a user with this email already exists" is the common
    // case and is actionable, unlike a generic failure string.
    return { error: e instanceof Error ? e.message : "Failed to add member." };
  }
}

// R1.3. The last-owner rule is enforced by migration 0012's trigger; its error message
// is surfaced verbatim rather than pre-checked here, so the constraint stays the single
// source of the rule (R1.4).
export async function updateMemberRoleAction(
  orgId: string,
  userId: string,
  orgRole: string,
): Promise<{ error?: string }> {
  await requireSuperAdmin();

  const parsed = z.enum(ORG_ROLES).safeParse(orgRole);
  if (!parsed.success) return { error: "Invalid role." };

  try {
    await updateMemberRole(orgId, userId, parsed.data);
    revalidatePath(`/admin/orgs/${orgId}`);
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to change role." };
  }
}
```

Extend the existing imports at the top of the file:

```ts
import * as z from "zod";
import {
  createOrgWithOwner,
  updateOrgCreditLimit,
  resetMemberPassword,
  generateTempPassword,
  addOrgMember,
  updateMemberRole,
} from "@/lib/db/organizations";
import {
  CreateOrgSchema,
  AddMemberSchema,
  ORG_ROLES,
  parseCreditLimit,
  parseResetPassword,
} from "@/lib/orgs/org-schema";
```

- [ ] **Step 2: Check the with-action coverage test**

This repo has `src/lib/actions/with-action-coverage.test.ts`, which asserts every server
action is either wrapped in `withAction()` or explicitly allowlisted. The two new actions
are `/admin` platform administration and belong on the allowlist beside the existing three.

Run: `npx vitest run src/lib/actions/with-action-coverage.test.ts`

If it fails naming `addOrgMemberAction` / `updateMemberRoleAction`, add both to the
`ALLOWLIST` in that file with a comment matching the existing entries' rationale (D85:
administering the platform via /admin is not acting as an org via impersonation).

- [ ] **Step 3: Run the suite**

Run: `npx vitest run`
Expected: 0 failures.

- [ ] **Step 4: Lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/actions/admin.ts src/lib/actions/with-action-coverage.test.ts
git commit -m "feat(orgs): addOrgMemberAction / updateMemberRoleAction (D164)

Super-admin only for the pilot; org self-serve is deferred (PRD §10 Q1). Both sit
on the withAction allowlist beside this file's existing actions for the D85 reason
already documented there.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 8: Seat provisioning — UI

**Files:**
- Create: `src/app/admin/orgs/[id]/add-member-dialog.tsx`
- Create: `src/app/admin/orgs/[id]/member-role-select.tsx`
- Modify: `src/app/admin/orgs/[id]/org-detail-tabs.tsx:101-124`

**Interfaces:**
- Consumes: `addOrgMemberAction`, `updateMemberRoleAction` (Task 7); `ORG_ROLES` (Task 6).
- Produces: `<AddMemberDialog orgId />`, `<MemberRoleSelect orgId userId role />`.

- [ ] **Step 1: Build the add-member dialog**

Create `src/app/admin/orgs/[id]/add-member-dialog.tsx`. It mirrors
`reset-password-dialog.tsx` exactly — plain `Button`s rather than Close primitives, so a
click cannot dismiss the dialog before the async call resolves or before the shown-once
password can render:

```tsx
"use client";

import { useState } from "react";
import { addOrgMemberAction } from "@/lib/actions/admin";
import { ORG_ROLES } from "@/lib/orgs/org-schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
} from "@/components/ui/alert-dialog";

// R1.1/R1.2: one step creates the auth user, the profile and the membership, and returns
// a temp password to share out of band — the same shape createOrgWithOwner uses for an
// org's first seat.
export function AddMemberDialog({ orgId }: { orgId: string }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [orgRole, setOrgRole] = useState<string>("designer");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ email: string; tempPassword: string } | null>(null);

  function resetState() {
    setEmail("");
    setDisplayName("");
    setOrgRole("designer");
    setSaving(false);
    setError(null);
    setResult(null);
  }

  function onOpenChange(next: boolean) {
    if (saving) return;
    setOpen(next);
    if (!next) resetState();
  }

  async function submit() {
    setSaving(true);
    setError(null);
    const fd = new FormData();
    fd.set("email", email);
    fd.set("displayName", displayName);
    fd.set("orgRole", orgRole);
    const res = await addOrgMemberAction(orgId, fd);
    setSaving(false);
    if (res?.error) {
      setError(res.error);
      return;
    }
    setResult(res?.result ?? null);
  }

  return (
    <>
      <Button type="button" size="sm" onClick={() => setOpen(true)}>
        Add member
      </Button>
      <AlertDialog open={open} onOpenChange={onOpenChange}>
        <AlertDialogContent>
          {result ? (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>Added {result.email}</AlertDialogTitle>
                <AlertDialogDescription>
                  Share this password with them out-of-band (Slack, email). Shown once —
                  they&apos;ll be asked to choose their own on first login.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <p className="rounded-lg border bg-muted/40 px-3 py-2 font-mono text-sm">
                {result.tempPassword}
              </p>
              <AlertDialogFooter>
                <Button type="button" onClick={() => onOpenChange(false)}>
                  Done
                </Button>
              </AlertDialogFooter>
            </>
          ) : (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>Add a member</AlertDialogTitle>
                <AlertDialogDescription>
                  Creates their login and adds them to this agency with the role you pick.
                </AlertDialogDescription>
              </AlertDialogHeader>

              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="member-email">Email</Label>
                  <Input
                    id="member-email"
                    autoFocus
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="ruby@aurora.studio"
                    disabled={saving}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="member-name">Display name</Label>
                  <Input
                    id="member-name"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Ruby"
                    disabled={saving}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="member-role">Role</Label>
                  <Select value={orgRole} onValueChange={setOrgRole} disabled={saving}>
                    <SelectTrigger id="member-role">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ORG_ROLES.map((r) => (
                        <SelectItem key={r} value={r}>
                          {r}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <span className="text-xs text-muted-foreground/70">
                    Only owners and seniors can approve work.
                  </span>
                </div>
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}

              <AlertDialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  disabled={saving}
                  onClick={() => onOpenChange(false)}
                >
                  Cancel
                </Button>
                <Button type="button" disabled={saving} onClick={() => void submit()}>
                  {saving ? "Adding…" : "Add member"}
                </Button>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
```

- [ ] **Step 2: Build the role select**

Create `src/app/admin/orgs/[id]/member-role-select.tsx`:

```tsx
"use client";

import { useState } from "react";
import { toast } from "sonner";
import { updateMemberRoleAction } from "@/lib/actions/admin";
import { ORG_ROLES } from "@/lib/orgs/org-schema";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";

// R1.3. Optimistic, with a revert on failure — the common failure is migration 0012's
// last-owner trigger refusing to demote an org's final owner (R1.4), and the operator
// needs to see the role snap back rather than be left believing the change stuck.
export function MemberRoleSelect({
  orgId,
  userId,
  role,
}: {
  orgId: string;
  userId: string;
  role: string;
}) {
  const [value, setValue] = useState(role);
  const [saving, setSaving] = useState(false);

  async function change(next: string) {
    const previous = value;
    setValue(next);
    setSaving(true);
    const res = await updateMemberRoleAction(orgId, userId, next);
    setSaving(false);
    if (res?.error) {
      setValue(previous);
      toast.error("Couldn't change role", { description: res.error });
    }
  }

  return (
    <Select value={value} onValueChange={(v) => void change(v)} disabled={saving}>
      <SelectTrigger size="sm" className="w-32">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {ORG_ROLES.map((r) => (
          <SelectItem key={r} value={r}>
            {r}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
```

> Verified: `SelectTrigger` in this project's vendored `src/components/ui/select.tsx`
> accepts `size?: "sm" | "default"` (line 37). No fallback needed.

- [ ] **Step 3: Wire both into the Members card**

In `src/app/admin/orgs/[id]/org-detail-tabs.tsx`, add the imports:

```tsx
import { AddMemberDialog } from "./add-member-dialog";
import { MemberRoleSelect } from "./member-role-select";
```

Then replace the Members `<Card>` (lines ~101–124) with:

```tsx
        <Card className="p-6 shadow-card">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-eyebrow">Members</h2>
            <AddMemberDialog orgId={org.id} />
          </div>
          <ul className="flex flex-col gap-2">
            {members.map((m) => (
              <li
                key={m.user_id}
                className="flex items-center justify-between border-b py-2 text-sm last:border-b-0"
              >
                <div className="flex flex-col">
                  <span className="font-medium">{m.display_name}</span>
                  <span className="text-xs text-muted-foreground/70">{m.email}</span>
                </div>
                <div className="flex items-center gap-3">
                  <MemberRoleSelect orgId={org.id} userId={m.user_id} role={m.org_role} />
                  <ResetPasswordDialog
                    orgId={org.id}
                    userId={m.user_id}
                    displayName={m.display_name}
                  />
                </div>
              </li>
            ))}
          </ul>
        </Card>
```

- [ ] **Step 4: Build and lint**

Run: `npm run lint`
Expected: no errors.

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors. (If the project has no such script, this is still the fastest way to
catch a wrong Select prop before a manual test.)

- [ ] **Step 5: Manual verification**

Start the app (`npm run dev:next`), sign in as a super-admin, open
`/admin/orgs/<an org id>`, and confirm:

1. **Add member** opens, accepts email + name + role, and returns a temp password once.
2. The new member appears in the list with the chosen role.
3. Changing a role via the Select persists across a reload.
4. Demoting the **only** owner fails and the Select snaps back with a toast (R1.4 — this
   is the trigger from migration 0012 doing its job; a success here is a bug).

- [ ] **Step 6: Commit**

```bash
git add "src/app/admin/orgs/[id]/"
git commit -m "feat(orgs): add-member dialog and per-row role select (R1.1-R1.4)

Extends the existing org-detail Members card rather than adding a surface. Both
controls are shadcn primitives; the dialog mirrors reset-password-dialog's
plain-Button convention so a click cannot dismiss it before the shown-once password
renders.

The role select reverts optimistically on failure — the expected failure is the
last-owner trigger refusing to demote an org's final owner, and the operator needs
to see that rather than believe the change stuck.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 9: Video assets become approvable

**Files:**
- Modify: `src/components/nodes/video-gen-focus-view.tsx`

**Interfaces:**
- Consumes: `setVersionApprovalAction` (Task 3's signature — **no `approvedBy`**); `InlineApprovalBar`; `useIdentity`.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Read the image-gen reference implementation**

Open `src/components/nodes/image-gen-focus-view.tsx` and read these four pieces, which are
the complete pattern to mirror:

- state: `approvalStatus`, `approvalNote`, `approvalSaving` (~lines 187-190)
- hydration from the active version (~lines 257, 575)
- the `saveApproval` handler (~lines 769-788)
- the `<InlineApprovalBar>` render (~lines 1142-1148)

- [ ] **Step 2: Add the same four pieces to the video focus view**

`video-gen-focus-view.tsx` currently renders `ApprovalBadge` on the node but has **no
approval control anywhere** — a video shows "Pending" forever with nothing able to change
it (PRD §2.2). Add:

```tsx
  const [approvalStatus, setApprovalStatus] = useState<ApprovalStatus>("pending");
  const [approvalNote, setApprovalNote] = useState("");
  const [approvalSaving, setApprovalSaving] = useState(false);
```

Hydrate them wherever this file already reads the active version into local state (search
for where `activeVersionId` is set), matching image-gen:

```tsx
      setApprovalStatus(active?.approvalStatus ?? "pending");
      setApprovalNote(active?.note ?? "");
```

The handler:

```tsx
  async function saveApproval(status: ApprovalStatus, note: string | null) {
    if (!activeVersionId) return;
    setApprovalSaving(true);
    try {
      await setVersionApprovalAction(activeVersionId, { status, note });
      setApprovalStatus(status);
      setApprovalNote(note ?? "");
      // Push into the store so the on-canvas badge refreshes immediately — without this
      // the badge stays stale until a full reload re-hydrates from the DB.
      onPatch({ approvalStatus: status });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save approval");
    } finally {
      setApprovalSaving(false);
    }
  }
```

> The `catch` surfaces the server's message rather than a fixed string, because after
> Task 3 the realistic failures are "you are not permitted…" and "a note is required…",
> both of which the user needs to read.

And the render, placed where the other focus views put it (below the eval bar, inside the
result branch):

```tsx
                        <InlineApprovalBar
                          status={approvalStatus}
                          note={approvalNote}
                          saving={approvalSaving}
                          canApprove={editable && identity?.role === "senior"}
                          onSet={saveApproval}
                        />
```

> `canApprove` keeps `editable &&` **for now** — removing it is R7.1 and belongs to M3,
> where it changes in all four focus views together. Do not do it here.

Add the imports this needs:

```tsx
import { InlineApprovalBar } from "./inline-approval-bar";
import { setVersionApprovalAction } from "@/lib/actions/approval";
import type { ApprovalStatus } from "@/lib/approval";
```

(`useIdentity`, `toast`, and `onPatch` are already present in this file — confirm before
adding duplicates.)

- [ ] **Step 3: Lint and typecheck**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 4: Manual verification**

Open a canvas with a generated video, open the video node's focus view as an
owner/senior, and confirm the approval bar renders and that approving updates the
on-canvas badge without a reload.

- [ ] **Step 5: Commit**

```bash
git add src/components/nodes/video-gen-focus-view.tsx
git commit -m "feat(approval): video assets can be approved (R10.1)

video-gen-node rendered ApprovalBadge but the focus view had no InlineApprovalBar,
so a video read \"Pending\" forever with no control anywhere able to change it.
Without this R3.2 cannot hold — video would be permanently unapprovable.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 10: Record the decisions; correct the stale identity comment

**Files:**
- Modify: `docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md` (§7)
- Modify: `src/lib/identity.ts:1-4`

- [ ] **Step 1: Append the M1 decisions to the ADR log**

Open the roadmap, find the end of §7, and append entries in the file's existing house
style (`### D<n> — <title> *(recorded <date>; originated → <spec>)*` followed by
Decision / Why / Rejected paragraphs). Append **only the four M1 decisions now** —
D159, D161, D162, D163, D165 describe work that does not exist yet and would be a lie
until M2/M3 land.

Add exactly these four:

```markdown
### D159 — Every review surface is one derived view, not three queries that agree *(recorded 2026-08-21; originated → `2026-08-21-internal-approval-workflow-design.md`)*

**Decision:** Client counts, canvas counts, the review drawer and both roles' navbar lists
are all filters over a single `review_queue_items` view joining `nodes` to its active
`node_versions` row.

**Why:** The PRD's R5.5 requires the three levels to show the same underlying number. Three
independently written queries can drift; one derivation cannot. Joining on
`active_version_id` also delivers R3.3 and R3.5 for free — a node with twenty regenerations
exposes one row, and a node that never generated exposes none.

**Rejected:** A materialised queue table with an assignee column. It reintroduces exactly
the sync problem the derivation avoids, and D150's "review is derived, not assigned" already
settled the question.

*(Numbering note: this feature takes D159–D167. D149–D158 are claimed by the reel-editor
work on an unmerged branch — see the design spec §2.1.)*

### D164 — Seats are provisioned by the super-admin on the existing org-detail surface *(recorded 2026-08-21; originated → `2026-08-21-internal-approval-workflow-design.md`)*

**Decision:** `addOrgMember` / `updateMemberRole` extend the `/admin/orgs/[id]` Members
card. Org owners cannot provision their own seats.

**Why:** `createOrgWithOwner` hardcoded `org_role: 'owner'` and was the only caller of
`auth.admin.createUser` in the repo, so an org could hold exactly one person. The schema
always permitted more — `one_org_per_user` constrains one *org per user*, not one user per
org — so this is a provisioning path and a screen, not a data-model change.

**Rejected:** Org self-serve invites. Right eventually, but it puts a whole invite/accept
lifecycle in front of a pilot that needs two seats in one org (PRD §10 Q1 — deferred, not
rejected on the merits).

### D166 — Approval permission is enforced server-side, and the action stops accepting a caller-supplied reviewer *(recorded 2026-08-21; supersedes the cosmetic-only gate D29 §3 deferred; originated → `2026-08-21-internal-approval-workflow-design.md`)*

**Decision:** `setVersionApprovalAction` resolves the caller via `resolveCallerContext()`,
refuses `designer`, verifies the version belongs to the caller's org, requires a note on
`changes_requested`, and writes the caller's own id as reviewer. The `approvedBy` parameter
is removed.

**Why:** Removing the parameter matters as much as adding the check. The action previously
recorded whatever identity the browser sent; a role check layered on top of a
caller-supplied identity is not enforcement, it is decoration with a second step. D29
deferred this for want of real auth, which now exists.

**Rejected:** Keeping `approvedBy` and validating it against the session. It leaves a
spoofable parameter in the signature for no benefit — if it must equal the session's user,
it should not be a parameter.

### D167 — `node_versions` gains `org_id` and an org-isolation SELECT policy; attribution becomes real user references *(recorded 2026-08-21; executes D29 §5.2; originated → `2026-08-21-internal-approval-workflow-design.md`)*

**Decision:** Migration 0030 adds `org_id` (backfilled, trigger-maintained), an `org
isolation` SELECT policy, membership of the `supabase_realtime` publication, and
`operator_user_id` / `approved_by_user_id`. Legacy `operator` / `approved_by` text columns
are kept and never written again.

**Why:** The policy is load-bearing rather than a backstop. 0017 enabled RLS on
`node_versions` with zero policies, and Realtime delivers `postgres_changes` through RLS —
so the live updates the workflow needs would have received nothing at all, silently. This is
the same failure 0018 had to fix after 0017 killed the generation tray. `org_id` separately
serves the action's tenancy check and the pending-count index.

**Why the trigger, not the application:** there are six `insertVersion` call sites and more
will follow. A path that forgot `org_id` would produce versions invisible to every count and
every subscription — a failure that presents as "the queue is quietly wrong" rather than as
an error.

**Rejected:** Reusing `operator` for the user id. It holds legacy values (`"duplicate"`)
and is typed `text`; overloading it would make "is this a name or an id?" a per-row guess.
```

- [ ] **Step 2: Correct the stale identity comment**

`src/lib/identity.ts` opens by describing itself as spoofable localStorage. That stopped
being true when auth landed — `useIdentity` fetches `/api/me`, which reads the session
server-side. Leaving it is actively misleading now that a real security decision (D166)
sits next to it. Replace lines 1–4's comment:

```ts
// The caller's display name and approval role. SOURCED FROM THE SESSION — useIdentity()
// fetches /api/me, which resolves the caller server-side via resolveCallerContext(); the
// `role` here is the collapse of the real org_role (owner|senior -> "senior").
//
// This was localStorage-backed and spoofable under D29's soft identity. It is not any
// more, and the shape never changed — only the source did, exactly as D29 §5 predicted.
//
// It is still NOT the security boundary: approval permission is enforced in
// setVersionApprovalAction against the caller's resolved org role (D166). Use this to
// decide what to RENDER, never what to permit.
export type Identity = { name: string; role: "senior" | "designer" };
```

- [ ] **Step 3: Verify the parse functions are still used**

`parseIdentity` / `serializeIdentity` may now be dead code. Check:

```bash
grep -rn "parseIdentity\|serializeIdentity\|IDENTITY_KEY" src/ --include=*.ts --include=*.tsx
```

If the only hits are `identity.ts` itself and `identity.test.ts`, **leave them and say so
in the commit message.** Deleting them is a separate cleanup, and removing exports during
a security change makes the diff harder to review for the thing that actually matters.

- [ ] **Step 4: Run the full suite**

Run: `npx vitest run`
Expected: 0 failures.

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md src/lib/identity.ts
git commit -m "docs(approval): record D159/D164/D166/D167; correct stale identity comment

Only the four decisions M1 actually implements are recorded. D161/D162/D163/D165
describe the drawer, lock decoupling and navbar, which do not exist yet — recording
them now would make the log describe code that isn't there.

identity.ts still described itself as spoofable localStorage. That stopped being true
when auth landed, and leaving it was actively misleading with a real permission
decision now sitting beside it.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## M1 Acceptance

Run through this as a whole before declaring M1 done. It maps to PRD §7 criteria 1 and 7.

> **Everything below the first line requires migration 0030 to be applied.** Under the
> batched-migration decision it will not be, until the operator runs the batch — so this
> list is the post-migration acceptance pass, run once at the end of the feature, not at
> the end of M1.

- [ ] Migration 0030 applied; all three verify queries return as documented.
- [ ] An org contains an owner **and** a designer, each able to log in as themselves (PRD §7.1).
- [ ] The designer sees **no** approval control in an image-gen focus view.
- [ ] The designer sees the approval **state and note** (R2.4) — review is not secret.
- [ ] Calling `setVersionApprovalAction` as the designer fails with a permission error (PRD §7.7). Verify by temporarily invoking it from a client component, or by a unit test standing in for the direct call.
- [ ] A senior can approve; `node_versions.approved_by_user_id` holds the senior's uuid.
- [ ] Rejecting with a blank note fails; rejecting with a note succeeds.
- [ ] A newly generated image version has `operator_user_id` set to the generating user.
- [ ] A newly completed **video** version has `operator_user_id` set (the async path).
- [ ] A video focus view shows an approval control (R10.1).
- [ ] `npx vitest run` — 0 failures.
- [ ] `npm run lint` — clean.

**M1 does not deliver** counts, the drawer, the navbar inbox, realtime, or lock
decoupling. Those are M2 and M3 and get their own plans; do not start them here.

---

## Self-Review Notes

**Spec coverage.** Design §3 (M1) maps: §3.1→T1, §3.2→T6/T7/T8, §3.3→T2/T3, §3.4→T4/T5,
§3.5→T9, §2.1 numbering→T10. Design §4 (M2) and §5 (M3) are deliberately out of this plan.

**Two spec claims resolved during planning, both now settled:**
- The spec said "verify `enforce_last_owner` exists." **It does** — migration 0012 defines
  the function and the `org_memberships_last_owner` trigger. R1.4 therefore needs no new
  code, and Task 6 documents why the app layer does not re-implement it.
- The spec said `insertVersion` needs a caller on every path. **`complete.ts` has no
  session** (Trigger.dev webhook), which is why Task 4 Step 3 takes `generations.user_id`
  instead. This was not in the spec and is the one real design addition made here.

**Deferred to M3 on purpose:** `canApprove` keeps `editable &&` in all four focus views.
Task 9 says so explicitly at the call site so nobody "helpfully" removes it early and
splits R7.1 across two milestones.
