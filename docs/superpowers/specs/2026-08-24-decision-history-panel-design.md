# Design — Decision history log + redesigned version-history panel

**Date:** 2026-08-24
**Status:** Approved 2026-08-24. Ready for planning.
**Extends:** `2026-08-24-approval-audit-trail-design.md` (D168–D172, shipped this same day —
staged locally on `staging`, pending push). This document does not re-litigate anything
already shipped there; it fixes a gap the prior spec's own §6 open-questions flagged but
didn't resolve, plus a UI density complaint on the panel that spec's Fix 2 extended.

> **Where this document and the prior audit-trail spec disagree, this document is the
> update** — it changes how the version-history panel renders and adds a table the prior
> spec didn't have.

---

## 1. The gap

D168–D172 made "who approved this, and when" visible — but only the **current** decision.
`setVersionApprovalAction` (`src/lib/actions/approval.ts`) always writes onto the same
`node_versions` row via `activeVersionId`, and `InlineApprovalBar`'s "Undo" button
(`inline-approval-bar.tsx:163-180`) resets an already-decided version back to `pending` so
it can be decided again. Both are reachable in the existing, shipped UI. The result: a
senior can reject with a note, then later Undo and approve the same version — and the
rejection note is gone, silently overwritten. There is no way to see "this was rejected for
X, then approved" — only ever the latest state.

Separately, the version-history panel (`ImageGenVersionHistory`/`VideoGenVersionHistory`)
has grown to up to seven stacked lines per row (label/time, model, params, edited-from,
instruction quote, maker/approver, rejection note) with no way to collapse any of it —
reported as "very clumsy."

## 2. Data model — append-only decision log

New table, additive only, no change to any existing column:

```sql
create table node_version_decisions (
  id               uuid primary key default gen_random_uuid(),
  version_id       uuid not null references node_versions(id) on delete cascade,
  org_id           uuid not null references organizations(id),
  status           text not null check (status in ('approved', 'changes_requested')),
  note             text,
  decided_by_user_id uuid references auth.users(id) on delete set null,
  decided_at       timestamptz not null default now()
);

create index node_version_decisions_version_idx
  on node_version_decisions (version_id, decided_at desc);
```

- **Only real decisions are logged.** A reset to `pending` clears current state but writes
  no row — it is not itself a reviewable event, it is what makes the version re-decidable.
  The log only grows on `approved` or `changes_requested`.
- **Org-scoped, same shape as `node_versions`.** An org-isolation SELECT policy, matching
  migration 0030's policy on `node_versions` (R2.4/R11.5 precedent — read is not secret
  within an org, never crosses one).
- **No dedicated write policy.** Writes go through the service-role client from inside
  `setVersionApprovalAction`, which already gates on the caller's resolved role (D166) —
  same pattern every other write in this feature already uses.

## 3. Write path

`setVersionApprovalAction`, after its existing `node_versions` UPDATE succeeds, inserts one
row into `node_version_decisions` when `input.status !== "pending"`.

**This insert is best-effort, not transactional with the UPDATE.** If it fails, the error is
caught and logged to the server console — the approve/reject the reviewer just performed
must never fail or appear to fail because a supplementary log write had a problem. This
mirrors `markVersionApprovalSeenAction`'s own best-effort framing (D170): the log is
observability, not the source of truth for current state (`node_versions`' own columns
remain that, unchanged).

## 4. Read path

`/api/nodes/[id]/versions/route.ts` gains one more batched query: every
`node_version_decisions` row for the node's version ids, ordered `decided_at desc`, grouped
into a `Map<versionId, DecisionRow[]>` in one pass — same shape as the existing
`getCreditsChargedByVersionIds` batching in this same route. Every `decided_by_user_id`
across every decision is resolved through the same single `resolveDisplayNames` call the
route already makes for maker/approver names (D168) — no new N+1, one extra round trip
total for the whole response.

Each version in the response gains:

```typescript
decisions: Array<{
  status: "approved" | "changes_requested";
  note: string | null;
  reviewerName: string | null; // resolved display name, else null (no legacy fallback —
                                // this table has no pre-migration rows to degrade from)
  decidedAt: string;
}>;
```

## 5. Panel redesign — collapse/expand

Both `ImageGenVersionHistory` and `VideoGenVersionHistory` rows change shape:

- **Collapsed** (the default for every row except the currently-active version, which
  starts expanded): thumbnail, `vN` label, a small colored status icon — emerald check for
  `approved`, destructive flag for `changes_requested`, amber dot for `pending` — and
  relative time. Nothing else.
- **Row body click toggles expand/collapse.** This replaces today's "click anywhere on the
  row to restore" — restoring becomes an explicit button (the existing hover-reveal
  "Restore" text becomes the actual click target, always visible on an expanded row rather
  than hover-only). Separates "look closer" from "revert to this," which today are the same
  accidental gesture.
- **Expanded** reveals everything the row already showed (model, params, edited-from,
  instruction quote — unchanged) **plus** a decision thread: every entry in `decisions`,
  newest-first, each rendered as icon + color + reviewer name + relative time + note (if
  present). Zero decisions (still pending, never decided) renders nothing extra — the
  existing "zero renders nothing" convention this codebase already uses throughout the
  review surfaces (R5.1's pattern, extended here).
- **Auto-expand tracks the active version.** If `activeVersionId` changes (e.g. after a
  restore), the newly-active id is added to the expanded set; previously-expanded rows the
  user opened manually are not force-collapsed.

Icons reused, not invented: `Check` and `MessageSquareWarning` from `lucide-react`, the same
two `InlineApprovalBar` already imports for its own Approve/Reject buttons
(`inline-approval-bar.tsx:3`) — one more import in each version-history file, matching
CLAUDE.md's "Lucide only, 1.5 stroke" rule already followed there.

## 6. Icon/color on the live node control

`ApprovalReadout` (`inline-approval-bar.tsx`, shipped in D169/Task 8) gets the same
treatment: the "Approved by X · time" line gains a small emerald `Check` icon; the
`changes_requested` note block gains a small destructive-toned `MessageSquareWarning` icon.

**This revises D169's original choice** ("approval isn't an alert, keep it neutral,
muted-only") on direct instruction — the earlier design deliberately avoided color there;
this document supersedes that one specific call, not the rest of D169.

## 7. Out of scope

- No editing or deleting a past decision — the log is append-only, by design; it's an audit
  trail, not an editable record.
- No decision history for prompt/motion-prompt nodes — same R3.2 exclusion the rest of this
  feature already observes.
- No change to who can decide, or what: still senior/owner only (D166), still only the
  node's active version (R3.3).
- No change to `node_versions`' existing columns, the review queue/counts, or the navbar
  inbox — this document is entirely about the historical log and the panel that displays it.

## 8. Decisions this document introduces

Recorded in `2026-05-30-creativeos-staging-roadmap.md` §7, continuing from D172.

| # | Decision |
|---|---|
| **D173** | `node_version_decisions` is a new append-only log table, written alongside (not instead of) `node_versions`' existing current-state columns — the log is observability, the columns remain the source of truth for queue/count/inbox derivation, so nothing built on D159's `review_queue_items` view needs to change. |
| **D174** | A reset-to-`pending` writes no log row — only `approved`/`changes_requested` are decisions worth a history entry; "Undo" clears current state so a version can be re-decided, it does not itself get recorded as an event. |
| **D175** | The decision-log insert is best-effort, non-transactional with the status UPDATE — a logging failure must never block or error the approve/reject action itself, mirroring D170's `markVersionApprovalSeenAction` framing. |
| **D176** | Version-history rows collapse by default (except the active version); row-body click toggles expand, restoring becomes an explicit always-visible button on an expanded row rather than a whole-row click target — decouples "inspect" from "revert to this." |
| **D177** | Revises D169: the live node's "Approved by X" line and rejection note both gain a matching Lucide icon (Check / MessageSquareWarning, reused from `InlineApprovalBar`'s own buttons) — approval is no longer rendered as strictly neutral, on explicit instruction. |
