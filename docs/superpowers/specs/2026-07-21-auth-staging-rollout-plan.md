# CreativeOS — Auth Staging Rollout Plan

**Date:** 2026-07-21
**Status:** Approved
**Builds on:** `2026-07-15-auth-multi-tenancy-design.md` (D42–D53) — this doc supersedes/refines
the parts of that design listed in §2 below; the original spec's actor model, DAL shape, and
core data model (organizations / profiles / org_memberships / clients.org_id) stand unchanged.
**ADR decisions:** D77–D83

---

## 1. Why a staged rollout

The auth build touches every read path in the app — it can't ship as one silent PR the way a
node type can. Slicing it into ordered stages means each increment lands on staging as a
working, demoable state: reviewable in isolation, testable without the rest of the build
existing yet, and revertible without unwinding unrelated work. This mirrors the vertical-slice
approach the product roadmap already uses (§4 of `2026-05-30-creativeos-staging-roadmap.md`),
applied to the auth sub-epic specifically.

Each stage below is a mergeable PR (or small PR set) to `staging`, deployed and clickable —
staging has no real users yet, so no feature flags are needed.

---

## 2. What changed since the 2026-07-15 design

The original spec (D49–D53) was design-stage and narrower than what actually needs to ship.
Deltas, each carried by a new ADR decision:

| Area | 2026-07-15 design | This rollout | ADR |
|---|---|---|---|
| Credits | Derived-on-read `SUM(credits_consumed)`, no ledger | Append-only `credit_transactions` ledger, atomic row-locked reservation | D77 (supersedes D47) |
| RLS scope | 2 tables (`generations`, `client_kb_jobs`) | 5 tables (+ `node_files`, `canvases`, `credit_transactions`); standing rule for future tables | D78 (refines D44) |
| Async workers | Not addressed | Job rows carry immutable `org_id`; worker revalidates before processing | D79 (new) |
| `org_memberships` | Join table, convention-only "one org per user" | `UNIQUE(user_id)` + trigger blocking last-owner removal | D80 (refines D49) |
| Impersonation | Cookie override, banner | + audit log, read-only default, explicit elevated-mode gate for writes, live re-check of operator's super_admin status | D81 (refines D52) |
| Onboarding | `scripts/seed-org.ts` first, admin UI later | No script; `/admin/orgs/new` ships in Stage 1 | D82 (new) |

`2026-07-15-auth-multi-tenancy-design.md` keeps its role as the reference for the actor model,
data model, and DAL shape — it is not being rewritten line-by-line. Where this plan's stage
descriptions conflict with that file's §6/§7/§10/§11, this plan wins.

---

## 3. The four stages

### Stage 1 — Auth Foundation, Org Isolation & Admin Onboarding UI

**Scope**
- Schema: `organizations`, `profiles`, `org_memberships` (+ `UNIQUE(user_id)`, last-owner
  trigger — D80), `clients.org_id` (nullable → backfilled to a seeded Yuvabe org → not null)
- Supabase Auth wiring: `@supabase/ssr`, `src/proxy.ts` (session existence check only)
- `src/lib/dal.ts` — `resolveCallerContext()`, wrapped in React `cache()`
- `withClient()` upgrade — org check + 404 on mismatch + super_admin bypass
- Org-scoped `listClients()` / `createClient()`
- `useIdentity()` internals swap (public API frozen — D53)
- `/login`
- `/admin` — org list (name, client count; no usage numbers yet)
- `/admin/orgs/[id]` — name, slug, editable credit limit, member list (no usage breakdown,
  no impersonation entry point yet)
- `/admin/orgs/new` — create org + user + membership in one submission (D82)

**Not in this stage:** RLS, credit ledger, impersonation, usage numbers on admin pages.

**Bootstrap note (not a deliverable):** the first Yuvabe org + super_admin user is created
once via the Supabase dashboard/admin API directly — documented as a setup step, not shipped
code. Every org after that is created through `/admin/orgs/new`.

**Dependencies:** none — this is the foundation.

**Shippable-to-staging checklist**
- [ ] Two orgs seeded (Yuvabe + one test agency via `/admin/orgs/new`); each user sees only
      their own org's clients
- [ ] Existing Yuvabe clients/canvases/history intact and attributed to the Yuvabe org
- [ ] Cross-org client access via direct URL/id returns 404, not 403
- [ ] `useIdentity()` call sites unchanged — no component-level diffs beyond the hook internals
- [ ] Build + existing test suite green

**ADR:** D80, D82 (new/refined this stage); D42, D43, D49–D51, D53 (unchanged from 2026-07-15)

---

### Stage 2 — RLS Backstop + Async Worker Tenant Check

**Scope**
- `org_id` added directly to `generations`, `node_files`, `client_kb_jobs`, `canvases`
  (backfilled via the `clients` join, then not-null + indexed)
- RLS policy added in the **same migration** as each column (D78's standing rule), each
  policy also matching the JWT's `platform_role` claim so super_admin/impersonation sessions
  aren't blocked
- Generation worker revalidates a job's `org_id` against the resource's current `org_id`
  before processing; mismatches are dropped and logged (D79)

**No user-visible change.** This is pure defense-in-depth: it proves that a route, worker, or
webhook that skipped `withClient()` still can't cross an org boundary at the database layer.

**Dependencies:** Stage 1 (needs `clients.org_id` and the caller-context/JWT shape to write
policies against).

**Shippable-to-staging checklist**
- [ ] A hand-crafted cross-org query (bypassing the app layer, using an authenticated
      non-admin session) returns zero rows for another org's `generations`/`canvases`/etc.
- [ ] Realtime subscriptions still deliver the caller's own org's rows unchanged
- [ ] Super_admin/impersonated sessions still see the target org's rows
- [ ] A worker job whose target resource's `org_id` has changed since job creation is
      dropped and logged, not processed
- [ ] No regression in existing generation/KB job flows for the Yuvabe org

**ADR:** D78, D79

---

### Stage 3 — Credit System

**Scope**
- `credit_transactions` ledger (`org_id`, `generation_id`, `amount`, `type` ∈
  {reservation, consumption, refund, adjustment}, `created_at`) + `org_id` + RLS in the same
  migration (D78's rule applies here too)
- `reserveCredits(orgId, generationId, estimatedAmount)` — row-locks the org, sums this-UTC-month
  reservation+consumption rows, rejects over-limit, else inserts a `reservation` row
- Settlement on job success (`consumption` row, settles the reservation to actual cost) and
  refund on failure/cancel (`refund` row, zeroes it out)
- `org_credit_usage` DB view, now reading from the ledger
- Wires real usage numbers into the Stage 1 admin pages (`/admin` org list bar,
  `/admin/orgs/[id]` breakdown) — no new pages

**Dependencies:** Stage 1 (org list/detail pages exist to enrich); independent of Stage 2.

**Shippable-to-staging checklist**
- [ ] Two concurrent generation requests near an org's cap: exactly one is admitted, the
      other is rejected with "monthly generation limit reached"
- [ ] Viewing/editing/approving remain unaffected when an org is at its cap
- [ ] Yuvabe org (`null` limit) always proceeds and still logs a reservation row
- [ ] A failed/cancelled job's reservation is refunded, not left dangling
- [ ] Month boundary confirmed pinned to UTC, not server-local time
- [ ] Admin org list shows live `used / limit` matching the ledger

**ADR:** D77

---

### Stage 4 — Impersonation

**Scope**
- HttpOnly, signed, short-lived impersonation cookie (`{ orgId }`)
- DAL override: `resolveOrgId()` reads the cookie when present, re-checked against the
  operator's **live** super_admin status on every request (D81)
- Persistent "Viewing as [Org] — Exit" banner
- Read-only by default; a separate, explicit "enter elevated support mode" action required
  before any write executes while impersonating
- `impersonation_audit_log` (operator, target org, start/end time, mode, actions) — every
  session and every elevated-mode entry logged
- "Enter as this org" button added to the Stage 1 `/admin/orgs/[id]` page

**Dependencies:** Stage 1 (org-detail page hosts the entry point; DAL shape already exists).
Independent of Stage 2/3.

**Shippable-to-staging checklist**
- [ ] Entering impersonation shows exactly what the target org sees, banner always visible
- [ ] Attempting a write while impersonating (not in elevated mode) is blocked
- [ ] Entering elevated mode, then writing, then exiting — all three show up in
      `impersonation_audit_log`
- [ ] Revoking the operator's super_admin status mid-session ends impersonation on the very
      next request, not just at cookie-set time
- [ ] "Exit" reliably clears the cookie and returns to the super_admin's own view

**ADR:** D81

---

## 4. Sequencing rationale

```
Stage 1 (foundation + onboarding UI)
   │  — nothing else has caller context or an org to test against without this
   ▼
Stage 2 (RLS + worker backstop)              Stage 3 (credit ledger)
   │  — cheapest, most isolated,                 │  — enriches Stage 1's admin
   │    zero new surface area;                    │    pages; independent of Stage 2
   │    ship as soon as ready                      │
   ▼                                               ▼
                    Stage 4 (impersonation)
                    — entry point lives on the Stage 1 org-detail page;
                      highest blast-radius feature (an operator seeing/acting
                      inside another org), so it benefits from Stages 1–3
                      having already proven out on staging first
```

Stage 2 and Stage 3 have no dependency on each other and can be built/reviewed in parallel
once Stage 1 is on staging. Stage 4 depends only on Stage 1's UI surface, but is sequenced
last deliberately — it's the one stage where a bug has the highest cost (cross-org visibility
by design), so it lands once the foundation has had time to prove itself.

---

## 5. Out of scope (this rollout)

Unchanged from `2026-07-15-auth-multi-tenancy-design.md` §12, plus this plan explicitly does
not stage: multiple users per org, invite UI, self-serve signup, SSO, enforced `senior`/
`designer` RBAC (Approve button stays UI-only per the pilot note), signed GCS URLs (its own
follow-up spec, out of this plan entirely), in-product billing, RLS beyond the tables named in
Stage 2/3.

---

## 6. Next step

Each stage above is ready to run through `writing-plans` independently when work on it starts
— this doc is the sequencing layer above four per-stage implementation plans, not a substitute
for them. Start with Stage 1.
