# Stage 4 — Impersonation: Design

**Status:** approved, not yet implemented.
**ADR:** D50, D51, D52, D81, D83, D85 (`2026-05-30-creativeos-staging-roadmap.md` §7).
**Scope source:** `2026-07-21-auth-staging-rollout-plan.md` §"Stage 4 — Impersonation" (the
checklist there is the acceptance bar for this design).

## 1. Context

Stages 1–3 of the auth rollout (org/membership schema, RLS backstop, credit ledger) are live
in production as of 2026-07-30 (`docs/auth-production-migration.md`). Stage 4 is the last
piece: letting a `super_admin` operator view and, when necessary, act inside an agency's
workspace for support purposes — audited, reversible, and never a standing bypass.

D85 already established (and reverted, after testing) the alternative — a blanket
`super_admin` bypass on every org-scoped query. It didn't scale past a couple of agencies and
made an audited impersonation feature pointless. This design implements the audited
alternative that was chosen instead.

`resolveOrgId()` in `src/lib/dal.ts` already carries a comment anticipating this: "Stage 4
layers impersonation on top by reading a cookie here." That is the single hook point this
design builds on.

## 2. Data model

New migration `0027_impersonation.sql`:

```sql
create table impersonation_audit_log (
  id uuid primary key default gen_random_uuid(),
  operator_id uuid not null references auth.users(id),
  target_org_id uuid not null references organizations(id),
  event_type text not null check (event_type in (
    'session_started', 'elevated_mode_entered', 'write_action', 'session_ended'
  )),
  detail jsonb,
  occurred_at timestamptz not null default now()
);

alter table impersonation_audit_log enable row level security;
-- no policies: service-role only, matching org_memberships' Stage-1 pattern for
-- app-layer-enforced tables. No end-user (including super_admin's own session) reads
-- this table directly through PostgREST.
```

One row per event, append-only — matches the shippable checklist's "all three show up in
`impersonation_audit_log`" (enter elevated mode / write / exit are three separate rows, not
three columns on one row). `detail` holds `{ method, path, resourceId? }` for `write_action`
rows; null for the other three event types.

## 3. Cookie & DAL

- HttpOnly, signed cookie `impersonation`, payload `{ operatorId, targetOrgId, elevated,
  expiresAt }`. Signed (HMAC, server secret) so it can't be forged or edited client-side;
  `expiresAt` gives a **2-hour** TTL independent of manual exit.
- `resolveOrgId()` (`src/lib/dal.ts`) becomes impersonation-aware:
  1. If no cookie, or cookie fails signature/expiry check → return `caller.orgId` as today.
  2. If cookie present → re-check the *caller's live* `platformRole === 'super_admin'` (D81 —
     re-checked every request, not just at cookie-set time). If they've been demoted since,
     silently fall back to `caller.orgId` (no error — the session just quietly ends).
  3. Otherwise return `targetOrgId` from the cookie.
- New `resolveImpersonationState()` (cached, same file) exposing `{ isImpersonating,
  elevated, targetOrgName }` for the banner and route guards, built on the same cookie read.

## 4. Write-gating

The actual enforcement point. `withClient` / `withCanvas` / `withNode` / `withMoodboard`
(`src/lib/api/route-helpers.ts`) are the funnel nearly every route already goes through for
org isolation. Two changes:

1. **Org-isolation check switches from `caller.orgId` to `await resolveOrgId()`.** Today these
   helpers compare a resource's `org_id` against `caller.orgId` directly (the real membership
   org) — that's *why* impersonation doesn't work yet even with a cookie set. Swapping in
   `resolveOrgId()` is what makes "viewing as" actually resolve the target org's data.
2. **Write-gating threaded through the same helpers.** Route handlers already receive `req:
   Request` as their first argument (Next.js route handler convention) but today only pass
   `params` into these helpers. Change the call convention to `withClient(req, params,
   handler)` (etc.) and have the helper itself block non-`GET`/`HEAD` methods when
   `isImpersonating && !elevated` — one `403` with `{ error: "Read-only while impersonating —
   enter elevated mode to make changes." }`, before the handler ever runs. This is a mechanical
   one-argument change at each of the ~45 mutating-route call sites, not new logic per file —
   the actual gating logic lives once, in the four helpers.
3. **Routes outside the four helpers.** A grep for mutating handlers not funneled through
   `withClient`/`withCanvas`/`withNode`/`withMoodboard` turns up: `copilot/actions`,
   `nodes/duplicate-batch`, `eval-bootstrap`. These get an explicit
   `assertImpersonationWriteAllowed()` call (same underlying check, exported standalone) at
   the top of their handlers. Webhook routes (`webhooks/*`) are server-to-server
   (`isAuthorizedWebhook`, no user session) and are out of scope — impersonation is a concept
   that only applies to an authenticated operator's session.
4. **Every allowed write while impersonating logs a `write_action` row** — the same code path
   that performs the gate check also fires the audit insert (fire-and-forget, doesn't block
   the response) when the write is permitted.

## 5. UI

- **Entry:** `/admin/orgs/[id]` gets an "Enter as this org" button (next to the existing page
  header). Sets the cookie server-side (a server action), redirects to `/`.
- **Banner:** persistent, rendered in the app shell whenever `resolveImpersonationState()`
  reports `isImpersonating`. Reads: "Viewing as **{Org name}** — [Enter elevated mode] [Exit]".
  While elevated, an "Elevated" badge replaces the button, plus "[Exit]".
- **Enter elevated mode:** server action, flips `elevated: true` on the cookie, logs
  `elevated_mode_entered`. Stays elevated for the rest of the session — no re-prompt per
  action, per your call — until the operator exits impersonation entirely or the 2-hour TTL
  expires.
- **Exit:** server action, logs `session_ended`, clears the cookie, redirects to
  `/admin/orgs/[id]` (back where they started).
- Styling follows the existing design system — banner is a fixed top bar, neutral background
  with the brand purple reserved for the two action buttons only (no large purple fill, per
  the design-system rule).

## 6. Testing

- Unit tests for `resolveOrgId()` / `resolveImpersonationState()`: valid cookie, expired
  cookie, tampered signature, live-role-revoked-mid-session (must silently fall back, not
  throw).
- Unit tests for the route-helper write-gate: GET allowed always, POST/PATCH/DELETE blocked
  when impersonating non-elevated, allowed when elevated, allowed normally when not
  impersonating at all.
- One integration-style test per shippable-checklist item:
  - entering impersonation resolves the target org's data, banner state reflects it
  - a write attempt while non-elevated returns 403
  - enter elevated → write → exit produces exactly the three expected
    `impersonation_audit_log` rows in order
  - revoking `platform_role` mid-session ends impersonation on the very next request
  - Exit clears the cookie and returns the operator to their own org's view

## 7. Out of scope (explicitly, not an oversight)

- Reading `impersonation_audit_log` from any UI (e.g. an `/admin` audit tab) — this design
  only covers writing it. Surfacing it is a natural Stage 5 candidate, not blocking this one.
- Moving a client between orgs (the gap noted in `docs/auth-production-migration.md`) — unrelated.
- Any change to `org_memberships`/RLS policies — impersonation reads the target org's data
  through the existing service-role DB client + app-layer `resolveOrgId()` check (D44), the
  same chokepoint every other org-scoped query already uses. No new RLS policy needed.
