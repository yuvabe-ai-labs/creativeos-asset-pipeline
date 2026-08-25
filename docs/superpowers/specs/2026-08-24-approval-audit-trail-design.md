# Design — Approval audit trail & designer-side approval signal

**Date:** 2026-08-24
**Status:** Approved 2026-08-24. Ready for planning.
**Extends:** `2026-08-19-internal-approval-workflow-prd.md` and
`2026-08-21-internal-approval-workflow-design.md` (D148–D167, PR #64, already merged to
`staging`). This document does not re-litigate anything already shipped there.

> **Where this document and the internal-approval PRD disagree on the base workflow, the
> PRD is right.** This document only adds the three gaps identified below.

---

## 1. The gap

D167 (migration `0030_approval_workflow.sql`) added `approved_by_user_id` and `approved_at`
to `node_versions`, and `setVersionApprovalAction` writes both correctly
(`src/lib/approval.ts:26-58`). The data has been correct since PR #64 merged. Three things
built on top of it are not:

1. **The one UI wired to show an approver reads the wrong column.**
   `src/app/api/nodes/[id]/versions/route.ts:35` — `approvedBy: typeof v.approved_by ===
   "string" ? v.approved_by : null` — reads the **legacy free-text `approved_by` column**,
   which migration 0030's own comment says is "never written again." Every version approved
   since PR #64 shows `approvedBy: null` in this response, even though
   `approved_by_user_id` on the same row is populated.

2. **Nothing renders it even where the wiring exists.** `ImageGenVersionHistory` (and the
   video-gen equivalent) already type `approvedBy?: string | null` and `approvedAt?: string
   | null` as props — and never reference either in their JSX. `ApprovalBadge` and
   `InlineApprovalBar`/`ApprovalReadout` (`src/components/nodes/approval-badge.tsx`,
   `inline-approval-bar.tsx`) render status and the rejection note, never who decided or
   when. Nowhere in the product can anyone currently see "who approved this, and when" —
   despite the PRD's own R11.2 requiring the reference to exist for exactly this purpose.

3. **A designer gets a signal for rejection, never for approval.** `selectInboxFor`
   (`src/lib/review/queue.ts:57-67`) is intentionally rejection-only for `designer`: `if
   (role === "designer") return items.filter(mineRejected)`. This matches R9.5 as written,
   but leaves the maker with literally no notification path for the outcome they're waiting
   on most often — approval. The flow reference's own step 2 caption says it plainly:
   *"Approved — leaves every queue."* Nothing replaces it on the maker's side.

None of this is a regression — it's scope the original PRD didn't ask for. This document
specs it as an addition.

## 2. Fix 1 — resolve real attribution in the versions route

`src/app/api/nodes/[id]/versions/route.ts` gains org-scoped name resolution, reusing
`resolveDisplayNames` (`src/lib/db/profiles.ts`) — the same function `review/queue.ts`
already uses for `makerName`. Not a new helper: the canonical-sources rule in `AGENTS.md`
applies.

- Collect `operator_user_id` and `approved_by_user_id` across the returned rows, resolve
  once via `resolveDisplayNames(orgId, ids)`.
- Response gains `makerName` (falls back to the legacy `operator` string, else `null` —
  R11.4's existing degradation rule) and replaces the dead `approvedBy` with
  `approvedByName` resolved the same way, alongside the existing `approvedAt`.
- `orgId` isn't currently read in this route; resolve it the same way other org-scoped node
  routes do (via the node's org chain — see `route-helpers.ts`'s `NodeWithOrgChain` cast
  used elsewhere for the same join).

## 3. Fix 2 — surface it in two places

**Per-version history** (`ImageGenVersionHistory`, `VideoGenVersionHistory` — prompt nodes
stay excluded, matching R3.2). Each row already shows label/time/model/params; it gains a
second line when the version has left `pending`:

- `changes_requested`: existing note text, now prefixed with the reviewer's name — *"Vanchi
  requested changes: Skin tone reads orange…"*
- `approved`: *"Approved by Vanchi · 2h ago"*

This turns the history panel into the actual audit trail you asked for: every version already
appears there in order, so make-reviewed-decided is legible per row without a new surface.

**Live node** (`ApprovalBadge` stays a pure status pill — unchanged). `InlineApprovalBar`'s
`ApprovalReadout` (what a non-approving viewer, i.e. a designer, sees) gains one line under
the status row when `status === "approved"`: *"Approved by {name} · {relative time}"*,
sourced from the same two fields, styled as muted text (not the destructive-toned note
block that rejection uses — approval isn't an alert).

## 4. Fix 3 — designer-side approval signal

**Mechanism: dismiss-on-view** (per your confirmed choice — matches how a notification
normally behaves, and needs no new "clear all" control).

- **Schema.** New nullable column `node_versions.approved_seen_at timestamptz`. One
  migration, additive, no backfill needed (existing approved rows are simply already
  "seen" — see §6 open question).
- **New server action** `markVersionApprovalSeenAction(versionId)`
  (`src/lib/actions/approval.ts`, sibling of `setVersionApprovalAction`):
  - Resolves caller server-side via `resolveCallerContext()` — never client-asserted,
    matching D166's pattern for the approval action itself.
  - Writes `approved_seen_at = now()` **only if** the row's `operator_user_id` equals the
    caller's `userId` and `approval_status = 'approved'` and `approved_seen_at is null`.
    Anyone else calling it (wrong maker, wrong status) is a no-op, not an error — this is a
    read receipt, not a security boundary.
- **Trigger point.** Fired once, fire-and-forget, from the node's focus view on mount, when
  the active version's `approvalStatus === "approved"` and the viewer is its maker. Same
  place `?review=1` already lands a reviewer (R9.3) — this is the maker's mirror of that.
- **Inbox filter.** `inboxFilterFor`/`selectInboxFor` (`src/lib/review/queue.ts`) gain one
  more clause, applied for *every* role (not designer-only — a senior whose own asset was
  approved by another senior/owner should see it too, matching R9.5's existing "senior sees
  their own rejections" precedent):

  ```
  mineApprovedUnseen =
    approval_status = 'approved'
    AND operator_user_id = me
    AND approved_by_user_id IS NOT NULL AND approved_by_user_id != me   -- self-approval never notifies
    AND approved_seen_at IS NULL
  ```

  `designer` inbox becomes `mineRejected OR mineApprovedUnseen`; `senior`/`owner` becomes
  `pending OR mineRejected OR mineApprovedUnseen`.
- **Popover.** `ReviewInbox` gets a second tag next to the existing "Sent back" chip —
  "Approved" — on the same row shape (`InboxItem` gains no new fields beyond what §2
  already added: `approvalStatus` is already on the type). No new component.

## 5. Out of scope

- No push/email — R8.4 (in-app only) still stands.
- `PendingCountPill` / the canvas review drawer are senior-facing pending-work counters and
  are untouched — this document is entirely about the *maker's* side and the audit display.
- No change to the rejection flow, which already works correctly end to end.
- Consolidating `ImageGenVersionHistory` and `VideoGenVersionHistory` into one shared
  component — raised during design, not requested. They gain the same two lines
  independently; a shared component is a separate refactor if the duplication becomes a
  real maintenance cost.

## 6. Open questions

**Existing approved rows with no `approved_seen_at`.** Every version approved before this
ships would, unfiltered, look "unseen" and flood every maker's inbox retroactively on
deploy. The migration should backfill `approved_seen_at = approved_at` for every row where
`approval_status = 'approved'` at migration time — i.e., "already approved" is treated as
"already seen," and the dismiss-on-view mechanism only governs approvals that happen after
this ships. Recorded here rather than left as a runtime surprise.

**`restore-version` moves the active pointer only — it never touches `approval_status`,
`note`, or `approved_seen_at` on the version it restores** (`src/app/api/nodes/[id]/restore-version/route.ts:32`
calls `setActiveVersion` alone). Two consequences worth being aware of, neither a new bug
and neither proposed for a fix here:

- Restoring an old **rejected** version brings its old `changes_requested` status and note
  back exactly as they were, re-entering both the senior's queue and the designer's own
  "sent back" inbox with no new decision having been made. A faithful reading of R3.3 (only
  the active version is ever in the queue), but easy to mistake for a bug.
- Restoring away from an **approved-but-unseen** version makes that outstanding
  notification vanish from the designer's inbox — `review_queue_items` only joins the
  active row, and `approved_seen_at` lives on the (now inactive) version row, unset. It
  resurfaces correctly if the maker restores back to that version later, since the flag was
  never cleared; until then it's effectively invisible.

## 7. Decisions this document introduces

Recorded in `2026-05-30-creativeos-staging-roadmap.md` §7, continuing from D167.

| # | Decision |
|---|---|
| **D168** | The versions API route resolves `operator_user_id`/`approved_by_user_id` through the existing `resolveDisplayNames`, replacing the dead legacy-text `approvedBy` field that migration 0030 stopped writing. |
| **D169** | Per-version history (image-gen, video-gen) renders the reviewer and decision time per row, turning the existing version list into the approval audit trail — no new surface. |
| **D170** | A maker's approval notification is a **dismiss-on-view read receipt** (`approved_seen_at`), not a queue table or an expiry timer — extends D150's "derived, no assignee" philosophy with the one column needed for the one case (approval) that has no natural state-changing exit the way rejection has (regenerate). |
| **D171** | Self-approval never notifies (`approved_by_user_id != operator_user_id` is required to enter the unseen-approved set) — a senior approving their own work already knows. |
| **D172** | Approval rows that predate this feature are backfilled `approved_seen_at = approved_at` at migration time, so the deploy does not retroactively flood every maker's inbox with historical approvals. |
