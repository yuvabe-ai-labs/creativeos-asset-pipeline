# Design — Internal approval workflow (senior review of junior work)

**Date:** 2026-08-21
**Status:** Approved 2026-08-21. Ready for planning.
**Owner:** Arun
**Implements:** `2026-08-19-internal-approval-workflow-prd.md` (the *what* and *why*)
**Flow reference:** `2026-08-19-internal-approval-flow.html`
**Branch:** `worktree-feat+internal-approval-workflow`, branched fresh from `origin/main`.

> **Where this document and the PRD disagree, the PRD is right and this file is stale.**
> This document owns *how*. Requirement numbers (`R1.1`, `R5.5`, …) refer to PRD §6.

---

## 1. The one idea

Every review surface in this feature — the client-list count, the canvas-list count, the
canvas control, the review drawer, and both roles' navbar popovers — is **a filter over one
SQL view**. Not five queries that ought to agree; one derivation read at five zoom levels.

```sql
create view review_queue_items as
select v.org_id, cl.id client_id, cl.name client_name,
       cv.id canvas_id, cv.name canvas_name,
       n.id node_id, n.type node_type,
       n.data ->> 'title' as node_title,   -- rows must be identifiable off-canvas (R6.2, R9.2)
       v.id version_id, v.output,          -- the preview thumbnail source
       v.approval_status, v.note, v.operator_user_id, v.operator,
       v.created_at, v.approved_at
from nodes n
join node_versions v on v.id = n.active_version_id
join canvases      cv on cv.id = n.canvas_id
join clients       cl on cl.id = cv.client_id
where n.type in ('image-gen', 'video-gen');
```

`node_title` and `output` are carried by the view rather than resolved by the caller because
the **navbar popover is org-wide** (R9.6) — it renders rows for canvases that are not loaded
in the browser, so there is no client-side node to read a title or a thumbnail from. The
canvas drawer could resolve both locally; making it do so differently from the popover would
be two code paths for one list shape.

Read what the joins buy, because it is most of the feature:

| Requirement | How the view satisfies it |
|---|---|
| **R3.3** only the active version is queued | `join … on v.id = n.active_version_id` — twenty regenerations expose one row |
| **R3.5** un-generated nodes are absent | the same join is inner; `active_version_id is null` yields no row |
| **R3.2** assets only | `where n.type in ('image-gen','video-gen')` |
| **R3.6 / R9.4** the loop closes with no resubmit | a new version moves the active pointer; the row's `approval_status` reverts to `pending` on its own |
| **R4.2** derived, never assigned | there is no queue table and no assignee column to drift |
| **R5.5** three levels show one number | a client's count is `count(*) group by client_id`; a canvas's is the same rows grouped one level down. They cannot disagree |

R5.5 stops being a convention someone has to remember and becomes structurally
unavailable to violate. That is the whole reason the view exists rather than three
hand-written queries.

## 2. What is already true (verified, not assumed)

Findings from reading the code, several of which correct the PRD:

- **`setVersionApprovalAction` has no role check at all.** It takes `approvedBy` as a
  parameter and writes whatever the client sent. R2.1 is not a tightening; it is the first
  check of any kind.
- **`operator` is not "MVP-era free-text names" — it is effectively empty.** The only writes
  in the repo are the literal string `"duplicate"` (`nodes/duplicate-batch/route.ts:98`,
  `nodes/[id]/duplicate/route.ts:58`). No generation path sets a maker. R11.4's
  legacy-degradation concern is therefore nearly moot, but **R11.1 is more work than the PRD
  implies**: it is a new write on every generation path, not a column swap.
- **`node_versions` is default-deny with *zero* policies** (migration 0017). A browser
  Realtime subscription to it would deliver nothing at all. This is exactly the bug
  migration 0018 had to fix after 0017 silently killed the generation tray.
- **`node_versions` has no `org_id` or `canvas_id`.** Supabase `postgres_changes` needs an
  explicit column filter; `org-generation-updates.ts:10-13` records the hard-won lesson that
  RLS alone silently drops rows.
- **`useIdentity` is server-backed** via `/api/me` and already exposes `orgRole` and `orgId`.
  The "spoofable localStorage" comment atop `src/lib/identity.ts` is stale and will be fixed,
  not designed around.
- **`useCanvasLock` acquires on mount, unconditionally** (`use-canvas-lock.ts:39`). This is
  R7.2's problem in one line.
- **`listOrgMembers` already exists** (`organizations.ts:163`), as does the org-detail page
  with tabs and a reset-password dialog. R1.x extends a surface rather than inventing one.

### 2.1 ADR numbering — this branch takes D159–D167

The PRD proposed D148–D156 believing D147 was the maximum. Both readings were wrong in
different directions:

- On `origin/main` (this branch's base) the maximum is **D148**.
- On the unmerged `feat/video-editor` branch, the reel editor has claimed **D149–D158**.

Numbering this work D149 would collide the moment either branch merged. This branch
therefore takes **D159–D167** and leaves D149–D158 to the reel editor, which is the only
assignment under which the two branches merge safely in *either* order. The ADR log entries
note the reserved gap explicitly so a reader on `main` does not mistake it for lost history.

*(The PRD's warning that D80 and D139 are already duplicated in §7 is what makes this worth
spelling out — the failure mode is live in this repo, not hypothetical.)*

---

## 3. Milestone 1 — the gate

The PRD's §6.1 callout is right: nothing else is demonstrable until an org holds two people
with different roles. M1 delivers that, plus the server-side enforcement that makes the role
mean anything, plus the attribution that makes rejection routable.

### 3.1 Migration `0030_approval_workflow.sql`

One migration. Enforcement needs org tenancy on the version row, and Realtime needs the same
column plus a policy, so splitting them would only mean two migrations that are useless apart.

```sql
-- ── tenancy column, mirroring migration 0014's treatment of `generations` ──
alter table node_versions add column org_id uuid references organizations(id);

update node_versions v set org_id = cl.org_id
  from nodes n
  join canvases cv on cv.id = n.canvas_id
  join clients  cl on cl.id = cv.client_id
 where n.id = v.node_id;

create index node_versions_org_status_idx on node_versions (org_id, approval_status);

-- Trigger, not an application-layer assignment: insertVersion is called from many paths
-- (generation, duplicate, compose) and a missed one would silently drop rows out of every
-- count and every Realtime filter — a failure that looks like "the queue is just wrong".
create function set_node_version_org_id() returns trigger
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

create trigger node_versions_set_org_id
  before insert on node_versions
  for each row execute function set_node_version_org_id();

-- ── RLS: required for Realtime, and R2.4 wants it anyway ──
create policy "org isolation" on node_versions for select
  using (org_id = (select org_id from org_memberships where user_id = auth.uid() limit 1));

alter publication supabase_realtime add table node_versions;   -- guarded, as 0014 does

-- ── attribution (R11.1, R11.2) ──
alter table node_versions
  add column operator_user_id    uuid references auth.users(id) on delete set null,
  add column approved_by_user_id uuid references auth.users(id) on delete set null;
```

The legacy `operator` / `approved_by` text columns are **kept and never written again**.
Reads prefer the uuid's resolved display name and fall back to the legacy string, so old rows
degrade visibly instead of blocking (R11.4).

**Why a trigger rather than filling `org_id` in `insertVersion`:** there are several insert
paths and more will be added. A path that forgets the column produces a version invisible to
every count and every subscription — a bug that presents as "the queue is quietly wrong",
which is the worst possible failure for a feature whose entire value is being trusted.

**Why the SELECT policy is not optional:** without it Realtime delivers zero rows to the
browser. It also satisfies R2.4 (a designer may read every approval state). Scope matches
`generations`: same-org rows only.

### 3.2 Seats (R1.1–R1.6)

`src/lib/db/organizations.ts`:

- `addOrgMember({ orgId, email, displayName, orgRole })` — mirrors `createOrgWithOwner`'s
  create-user → profile → membership sequence, including its best-effort cleanup on partial
  failure, and returns a generated temp password with `must_change_password` set (R1.2).
- `updateMemberRole(orgId, userId, orgRole)` — verifies the membership belongs to the org
  first, the same defense-in-depth `resetMemberPassword` already applies.

`src/lib/actions/admin.ts` gains `addOrgMemberAction` / `updateMemberRoleAction`, both behind
`requireSuperAdmin` (R1.1, R1.3; permissions table §6.12).

UI on the org-detail Members tab: an **Add member** dialog (email, display name, role
`Select`) and a per-row role `Select`. The temp password is surfaced in the same copyable
result treatment org creation already uses. All controls are shadcn primitives per CLAUDE.md.

**R1.4** (an org always retains an owner) is asserted by the PRD to be enforced by an existing
`enforce_last_owner` trigger. **Implementation must verify this trigger exists**; if it does
not, this migration adds it. The requirement is not "add a UI guard" — a client-side check is
not the mechanism.

**R1.5** (a member sees their own role) — `ProfilePopover` already renders the real `orgRole`.
Verify and, if so, close the requirement without new code.

### 3.3 Enforcement (R2.1–R2.5)

`setVersionApprovalAction` changes shape:

```ts
// before: (versionId, { status, approvedBy, note })   ← approvedBy came from the client
// after:  (versionId, { status, note })
```

Dropping the parameter is the point. A server that accepts a caller-supplied identity has not
been secured by also checking a role. Inside:

1. `resolveCallerContext()` — the caller's real org and role.
2. `canSetApproval(caller.orgRole)` — reject `designer` (R2.1, R2.2).
3. Load the version's `org_id`; reject if it is not the caller's org. Tenancy, not just role.
4. Reject `changes_requested` with a blank note — **R6.5 enforced on the server**, not left as
   a UI nicety.
5. Write `approved_by_user_id = caller.userId`. Never a client-supplied value.

`src/lib/approval.ts` gains the pure, unit-tested predicates:

```ts
export function canSetApproval(orgRole: OrgRole): boolean;      // owner | senior
export function requiresNote(status: ApprovalStatus): boolean;  // changes_requested
```

R2.5 (self-approval permitted) needs no code — it is the absence of a maker≠checker check,
and the design deliberately does not add one.

R2.3: the UI keeps hiding controls from a designer, and `InlineApprovalBar`'s `canApprove`
comment changes from `NOT security` to name the server check that now is.

### 3.4 Attribution at generation time (R11.1)

`insertVersion` gains `operatorUserId`. Every generation call site passes the resolved caller.
Display-name resolution lives in a new `src/lib/db/profiles.ts`:

```ts
resolveDisplayNames(orgId, userIds): Promise<Map<string, string>>
```

It joins through `org_memberships` so a reference can never resolve to a name from another
organization (**R11.5**) — the org scope is in the query, not in a caller's discipline.

### 3.5 Video approval (R10.1)

`InlineApprovalBar` is added to `video-gen-focus-view.tsx`, matching `image-gen-focus-view.tsx`.
It lands in M1 because M1 already touches every approval call site to drop `approvedBy`;
doing it here means M3 changes only `canApprove`.

### 3.6 M1 is done when

A real org holds an owner and a designer; the designer logs in as themselves, sees approval
controls hidden, **and receives an error calling the action directly** (success criterion 7).
Generated versions carry a real `operator_user_id`.

---

## 4. Milestone 2 — counts and live updates

### 4.1 Derivation

**Migration `0031_review_queue.sql`** — the §1 view, plus one RPC so list pages cost one query
rather than one per row (the free-tier constraint in PRD §8, which matters because the client
list renders for every org member on every visit):

```sql
create function org_review_counts(p_org_id uuid)
  returns table (client_id uuid, canvas_id uuid, pending int)
language sql stable as $$
  select client_id, canvas_id, count(*)::int
    from review_queue_items
   where org_id = p_org_id and approval_status = 'pending'
   group by client_id, canvas_id;
$$;
```

A second migration rather than folding into `0030`: M1 must be shippable and verifiable on its
own (PRD §6.1 is the gate), and nothing in M1 reads the view.

The client list calls it once and sums per client; the canvas list calls it once and reads per
canvas. Both counts come from the same call, so R5.5 holds at runtime and not merely in the
schema.

`src/lib/db/review.ts` (server-only):

| Function | Serves |
|---|---|
| `getOrgReviewCounts(orgId)` | R5.1, R5.2, R5.3 |
| `listCanvasPendingItems(orgId, canvasId)` | the drawer (R6.1, R6.2) |
| `listOrgReviewInbox(orgId, userId, orgRole)` | the navbar popover (R9.5) |

`src/lib/review/queue.ts` holds the pure logic — `summarizeCounts`, `selectInboxFor` — so the
role-dependent rules are unit-tested without a database, matching how `approval.ts` and
`generation-tray.ts` are already split from their write paths.

**R9.5's one control, two meanings** is a single pure function:

```
designer          → own rows where status = changes_requested
senior | owner    → all rows where status = pending
                  + own rows where status = changes_requested   ← a senior whose own work was rejected
```

### 4.2 The count pill

`src/components/shared/pending-count-pill.tsx` — neutral pill, one amber dot, tabular-nums,
and **renders `null` at zero** (R5.1: no empty badge). One component with three call sites,
which is what keeps R5.10 true: a list where every row is flagged still reads as a list,
because the treatment is quiet by construction rather than by three separate judgements.

Red is not available to this component at all (R5.9) — `changes_requested` owns the
destructive token, and a colour that means "needs review" at one zoom level and "was rejected"
at the next would break the single journey R5.7 describes.

### 4.3 Realtime

`src/lib/realtime/org-version-updates.ts`, a near-copy of `org-generation-updates.ts`:
one shared channel per org, `await supabase.auth.getSession()` **before** subscribing (omitting
this attaches no JWT, RLS evaluates `auth.uid()` as null, and every row is silently dropped —
the documented `profile-credits.tsx` lesson), and `filter: org_id=eq.${orgId}`.

`event: "*"`, because both directions are requirements: INSERT drives R8.2 (a senior watching
sees the count rise), UPDATE drives R8.3 (a junior watching sees their badge change).

**R8.5** — on channel error or close, surfaces hold their last-known counts. They never fall
back to zero. A confidently wrong "nothing to review" is worse than a stale number, because
the first is indistinguishable from being finished.

---

## 5. Milestone 3 — drawer, lock, navbar

### 5.1 The lock (R7.1–R7.4) — D160, D161

Two separate changes that are easy to conflate:

**Approval no longer requires the lock.** All four focus views drop the `editable &&` from
`canApprove={editable && identity?.role === "senior"}`. This is the D33 reversal, and it is
scoped to approval alone: canvas edits, generation, and parse stay single-writer (R7.3).

**Entering to review no longer takes the lock.** `useCanvasLock(canvasId, { acquire })`, with
review mode carried in the URL — `?review=1`, which is what every count pill and every popover
row links to. In review mode the canvas mounts without acquiring, opens the drawer, and leaves
edit surfaces read-only. Opening a canvas normally behaves exactly as it does today.

> **Rejected: lazy acquisition on first edit intent.** It is the more elegant answer and would
> satisfy R7.2 even for a senior who opens the canvas by hand rather than by following a count.
> It is rejected here because it rewrites D33's core behaviour for every user on every canvas,
> while the PRD asks only to decouple *approval*. A lock-model rewrite should not ride along
> inside an approval change. Worth revisiting on its own terms.

### 5.2 The drawer (R6.1–R6.12) — D163

`src/components/canvas/review-drawer/`, built on the gallery drawer's existing shape: a
context provider plus a non-modal panel with no backdrop (R6.10), mounted *under* the focus
view so it survives the sheet opening and closing (R6.11).

- Rows carry preview, node, maker, and time — enough to triage without opening (R6.2).
- Row click reuses the generation tray's `setCenter` + `setFocusedNodeId` (R6.3), which is
  D35's navigation rather than a second implementation of flying to a node.
- **No approve/reject inside the drawer** (R6.4). It routes; it is not a second approval
  surface.
- Rows leave on decision (R6.6) because the list is derived from live state — not because
  anything removes them.
- **No advance control anywhere** (R6.9, R6.12). The senior chooses what to open and in what
  order; nothing moves on their behalf.
- Available to a designer as read-only (R6.7), and opening it never acquires the lock (R6.8).

### 5.3 The navbar (R9.1–R9.8) — D165

`ReviewInbox` in `header-actions.tsx`, beside `HelpMenu` and `AdminNavLink` — app chrome,
because the work it points at spans canvases and clients and no single canvas could host it
(R9.6).

Icon plus amber count badge, opening a Popover list of pointers (R9.1, R9.2). Each row:
thumbnail, node title, `client · canvas · time ago`, linking to
`/clients/{c}/canvases/{v}?review=1&node={id}`.

Both counts state their scope — the popover is org-wide, the canvas control is this canvas —
so a navbar 12 beside a canvas 5 reads as two questions answered rather than a bug (R9.8).

### 5.4 The note reaches the person it is addressed to (R9.3)

A gap the PRD implies and the wireframe's step 7 shows, but which no requirement states
outright: today a designer gets `ApprovalReadout`, which renders **the status label only**.
The rejection note — the entire payload of the return path — is invisible to the one person
who needs it.

`ApprovalReadout` is extended to render the note for `changes_requested`, in the destructive
tone, directly above the regenerate control. R9.3's "the note is read on the node, next to the
controls to regenerate it" is then literally true rather than aspirational.

---

## 6. Error handling

| Case | Behaviour |
|---|---|
| Designer calls the approval action directly | Server rejects on resolved role. The UI never sees it because the control is hidden, which is the point of R2.3's ordering |
| Approval targets a version in another org | Rejected on the `org_id` check, before the role check matters |
| `changes_requested` with a blank note | Rejected server-side (R6.5); the UI also disables submit, as a courtesy |
| Two seniors decide the same item | Last write wins (R4.4). §4.3's live updates make the collision visible rather than silent |
| A senior approves a version regenerated moments earlier | The approval targets a **specific version id**, so it lands on the old version and the new one stays `pending`. Correctness comes from version targeting, not from a lock |
| Realtime drops | Counts hold at last-known (R8.5). Never zero |
| A version row predates the migration | `operator_user_id` is null; the surface falls back to the legacy `operator` string, or "Unknown" (R11.4) |
| A user is deleted | `on delete set null` — the version survives, attribution degrades to the legacy string |

## 7. Testing

Following the repo's existing split — pure logic beside the module, routes and actions tested
against mocks:

| File | Covers |
|---|---|
| `src/lib/review/queue.test.ts` | count summing, R5.5's invariant, `selectInboxFor` for all three roles |
| `src/lib/approval.test.ts` (extended) | `canSetApproval`, `requiresNote` |
| `src/lib/actions/approval.test.ts` | a designer is rejected; a cross-org version is rejected; a blank rejection note is rejected |
| `src/lib/db/review.test.ts` | pure mappers over fixture rows |

The R5.5 invariant is worth a named test rather than an assumption: **the sum of per-canvas
counts for a client equals that client's count**, asserted over generated fixtures.

Success criteria 1–8 in PRD §7 are the manual acceptance pass, run against a real two-seat org.

## 8. Decisions introduced

Recorded in `2026-05-30-creativeos-staging-roadmap.md` §7 as **D159–D167** (see §2.1 for why
this branch skips D149–D158).

| # | Decision |
|---|---|
| **D159** | Every review surface is a filter over one `review_queue_items` view; R5.5's agreement is structural, not conventional |
| **D160** | Approval is decoupled from the D33 canvas lock — it writes only to `node_versions` and needs none. Refines D34 |
| **D161** | A canvas can be entered in a non-acquiring review mode, carried in the URL, so reviewing never evicts an editor. Rejects lazy-acquire-on-edit as out of scope for an approval change |
| **D162** | Review is derived, not assigned: no assignee column, one queue per org. Rejection is the only person-specific routing |
| **D163** | Reviewing is item-by-item, never a sequence: the drawer stays mounted beneath the focus view. Rejects both a queue runner and a drawer that closes on click |
| **D164** | Seats are provisioned by the super-admin on the existing org-detail surface; org self-serve deferred |
| **D165** | One navbar control serves both roles, org-wide; it differs from the canvas drawer only in scope, so the two counts legitimately disagree and each states what it counts |
| **D166** | Approval permission is enforced server-side against the caller's resolved org role, and the action **stops accepting a caller-supplied `approvedBy`** |
| **D167** | `node_versions` gains `org_id` plus an org-isolation SELECT policy — required for Realtime delivery, not merely a backstop. Attribution moves to real user references; legacy text degrades rather than blocks |

## 9. Out of scope

Unchanged from PRD §5, restated because these are the temptations during implementation:
no gating or auto-advance on unapproved assets (D11 stands, the human is still the
scheduler); no batch approve; no review sequence; no out-of-app notification; no approval of
prompt or motion-prompt nodes; no org self-serve seat provisioning; and client-facing
approval remains a separate feature entirely.
