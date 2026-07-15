# Auth & Multi-Tenancy Design
**Date:** 2026-07-15
**Status:** Approved
**Supersedes:** D14 (no-auth posture), D29 (localStorage identity)
**ADR decisions:** D41–D47 (PRD), D48–D52 (this doc)

---

## 1. Summary

CreativeOS currently has no login — every visitor sees every client. This spec implements the auth half of the pilot PRD: Supabase Auth (email + password, invite-only), a three-table tenant model (organizations / profiles / org_memberships), org isolation enforced at existing chokepoints, and a super_admin tier for Yuvabe operators with cross-org visibility, credit management, and impersonation.

The design is granular by intent: schema is multi-seat-ready from day one (org_memberships is a join table, not a column), but the pilot builds only what is needed for one user per org.

---

## 2. Actors & Role Model

Three distinct actor types:

| Actor | `platform_role` | `org_role` | What they can do |
|---|---|---|---|
| Yuvabe operator | `super_admin` | `owner` (Yuvabe org) | Everything — cross-org dashboard, credit management, impersonation, create orgs |
| Agency POC (invited) | `member` | `owner` | Their org's clients, canvases, generations; can approve versions |
| Future teammate | `member` | `senior` or `designer` | Scoped by org_role (senior sees Approve; designer does not) |

Two role axes that never collide:
- `platform_role` — who you are on the platform (lives in `auth.users.app_metadata`, JWT-baked, server-set only)
- `org_role` — how you work within your org (lives in `org_memberships`, mutable, per-membership)

---

## 3. Data Model

### New tables

```sql
-- Tenant boundary
create table organizations (
  id                    uuid primary key default gen_random_uuid(),
  name                  text not null,
  slug                  text not null unique,
  monthly_credit_limit  numeric,           -- null = unlimited (Yuvabe's own org)
  created_at            timestamptz not null default now()
);

-- App's extension of auth.users (display info only)
create table profiles (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  display_name  text not null,
  created_at    timestamptz not null default now()
);

-- Membership bridge — multi-seat-ready from day one
create table org_memberships (
  user_id   uuid not null references auth.users(id) on delete cascade,
  org_id    uuid not null references organizations(id) on delete cascade,
  org_role  text not null check (org_role in ('owner', 'senior', 'designer')),
  joined_at timestamptz not null default now(),
  primary key (user_id, org_id)
);
```

### Existing table change

```sql
alter table clients add column org_id uuid not null references organizations(id);
```

`platform_role` lives in `auth.users.app_metadata` (JWT claim, not a DB column) — readable in the DAL from the session without a DB query.

### Why this shape

- `platform_role` in `app_metadata` → immutable from the client, baked into JWT, no DB hit to check super_admin
- `org_role` in `org_memberships` → mutable (owner can change teammate roles later), per-org (same user could have different roles in different orgs)
- `org_memberships` as a join table → pilot has 1 row per user; multi-seat = insert more rows, zero schema change
- `clients.org_id` → entire FK tree (canvases → nodes → versions → generations → KB) inherits org scope by cascade; no other table changes

---

## 4. Auth Flow

**Login:** Supabase Auth, email + password, invite-only. No self-serve signup page. `/login` is the only public route.

**Session:** `@supabase/ssr` cookie-based sessions. Supabase handles JWT issuance, refresh, and cookie management.

**`src/proxy.ts` (Next.js 16 — renamed from middleware):**
```
Every request:
  supabase.auth.getUser() from cookie   ← always getUser(), never getSession()
  No user → redirect /login (pages) or return 401 (API routes)
  User exists → NextResponse.next()     ← no org logic here

Excluded via matcher:
  /login
  /api/webhooks/*   (shared-secret server-to-server, no user session)
```

Proxy does optimistic checks only — no DB queries, no org resolution. Per Next.js 16 docs.

---

## 5. Data Access Layer (DAL)

**`src/lib/dal.ts`** — new file, server-only, wraps React `cache()` so multiple callers in one render pass share one DB hit.

```typescript
import "server-only"
import { cache } from "react"

export type CallerContext = {
  userId: string
  platformRole: "super_admin" | "member"
  orgId: string
  orgRole: "owner" | "senior" | "designer"
}

// Primary entry point for all route handlers and server actions
export const resolveCallerContext = cache(async (): Promise<CallerContext> => {
  // 1. Read Supabase session (getUser() — validates JWT server-side)
  // 2. Read platform_role from session.user.app_metadata (no DB hit)
  // 3. Query org_memberships for this user's org + org_role (1 DB hit, cached)
  // 4. Return CallerContext or redirect/throw 401
})

// Super-admin impersonation override
// When impersonation cookie is set, orgId comes from cookie instead of memberships
export const resolveOrgId = cache(async (): Promise<string> => { ... })
```

Every route handler and server action calls `resolveCallerContext()` at the top. Super_admin routes additionally assert `platformRole === "super_admin"`.

---

## 6. Enforcement

### Layer 1 — Proxy (`src/proxy.ts`)
Session existence check. No org logic. Redirect/401 if no user.

### Layer 2 — `withClient()` upgrade (`src/lib/api/route-helpers.ts`)
```
Current:  resolve client by id → 404 if not found
New:      resolve client → check client.org_id === caller.orgId → 404 on mismatch
          super_admin bypass: platformRole === "super_admin" skips org check
```
Covers every route under `/api/clients/[id]/*`. Because the entire FK tree roots at `clients`, this one check protects canvases, nodes, versions, generations, KB, files.

Returns 404 (not 403) on org mismatch — never confirm another org's resources exist.

### Layer 3 — List queries
```
listClients()   → .eq("org_id", orgId) for members; no filter for super_admin
createClient()  → injects org_id from CallerContext; cannot create in another org
```

### Layer 4 — Server actions (`src/lib/actions/*.ts`)
`resolveCallerContext()` at the top of every action. Existing actions get caller context added and passed down to their DB calls.

### Layer 5 — RLS (browser-exposed tables only)
Per D43: RLS only on `generations` and `client_kb_jobs` — the only tables the browser reads directly via Supabase Realtime. All other tables: RLS off, service-role only, app-layer enforces.

```sql
-- generations
create policy "org isolation" on generations for select
  using (
    client_id in (
      select id from clients where org_id = (
        select org_id from org_memberships
        where user_id = auth.uid() limit 1
      )
    )
  );
-- same shape for client_kb_jobs
```

### Layer 6 — Credit cap
```typescript
// src/lib/db/organizations.ts
async function assertOrgWithinBudget(orgId: string): Promise<void>
```
Called before any model-running request (image, video, prompt). Derives month-to-date usage as `SUM(credits_consumed)` over succeeded generations this calendar month for the org's client tree. Throws "monthly generation limit reached" if `usage >= limit`. No-op if `limit` is null (Yuvabe org). Viewing, editing, and approving keep working.

---

## 7. Super Admin Surfaces

All routes under `/admin/*` are gated: `platformRole !== "super_admin"` → 404.

### `/admin` — org list
- All organizations, month-to-date usage vs limit, client count
- Warning indicator for orgs at or near limit
- Powered by `org_credit_usage` DB view (one query)
- "+ New Org" button

### `/admin/orgs/[id]` — org detail
- Org name, slug, credit limit (inline editable)
- Member list (pilot: always 1 row)
- Month-to-date credit breakdown
- "Enter as this org" → impersonation

### `/admin/orgs/new` — create org + seed user
Single form replacing the manual seed script:
- Org name, slug
- User email, display name, temporary password
- Credit limit (blank = unlimited)

One submission: creates org row + Supabase Auth user + sets `app_metadata.platform_role = "member"` + inserts profiles row + inserts org_memberships row with `org_role = "owner"`.

### Impersonation
```
super_admin clicks "Enter as [Agency A]"
  → server sets HttpOnly impersonation cookie: { orgId }
  → resolveCallerContext() / resolveOrgId() detects cookie
  → returns orgId from cookie instead of membership table
  → super_admin sees exactly what Agency A sees
  → persistent banner: "Viewing as Agency A — Exit"
  → "Exit" clears the cookie, returns to super_admin view
```
Super_admin stays logged in throughout. No actual session swap.

---

## 8. `useIdentity()` Swap

The hook's public API is unchanged — zero call-site changes:

```typescript
// Return type unchanged
export function useIdentity(): {
  identity: Identity | null   // name from profiles.display_name, role from org_memberships.org_role
  hydrated: boolean
  // setIdentity removed — login owns identity now
}
```

Internals swap from localStorage to Supabase session + profiles + org_memberships. The `Identity` type shape is unchanged (`{ name: string; role: "senior" | "designer" }`). `org_role = "owner"` maps to `role: "senior"` for the Identity object — owners can approve, same as seniors. This is cosmetic (D29); the Approve button visibility depends on `identity.role === "senior"`, and owners should see it.

The identity gate (`identity-gate.tsx`) is replaced by the login redirect — no more "who are you?" dialog. The identity chip becomes logged-in user's display_name + sign out button.

---

## 9. Migration

Single migration file, run in order:

```sql
-- 1. New tables (organizations, profiles, org_memberships)
-- 2. Seed Yuvabe org
insert into organizations (name, slug) values ('Yuvabe Studios', 'yuvabe');
-- 3. Add org_id to clients (nullable first for backfill)
alter table clients add column org_id uuid references organizations(id);
-- 4. Backfill all existing clients → Yuvabe org
update clients set org_id = (select id from organizations where slug = 'yuvabe');
-- 5. Lock it down
alter table clients alter column org_id set not null;
-- 6. RLS on the two browser-exposed tables
-- 7. org_credit_usage view
create view org_credit_usage as
  select
    o.id as org_id, o.name as org_name,
    date_trunc('month', now()) as month,
    coalesce(sum(g.credits_consumed), 0) as usage,
    o.monthly_credit_limit as credit_limit
  from organizations o
  left join clients c on c.org_id = o.id
  left join nodes n on n.canvas_id in (
    select id from canvases where client_id = c.id
  )
  left join generations g on g.node_id = n.id
    and g.status = 'succeeded'
    and date_trunc('month', g.created_at) = date_trunc('month', now())
  group by o.id, o.name, o.monthly_credit_limit;
```

Existing Yuvabe data (clients, canvases, history) is fully preserved.

---

## 10. Seed Script

**`scripts/seed-org.ts`** — replaces manual SQL for onboarding new agencies.

```
Usage:
  npx tsx scripts/seed-org.ts \
    --name "Agency A" \
    --email "poc@agencya.com" \
    --display-name "John Smith" \
    --credit-limit 1000

Steps:
  1. Insert organizations row
  2. Create Supabase Auth user via admin API (email + temp password)
  3. Set app_metadata.platform_role = "member" via admin API
  4. Insert profiles row (display_name)
  5. Insert org_memberships row (org_role = "owner")
  6. Print credentials to stdout

Onboarding a new agency = one command, no redeploy, no hand-written SQL.
```

---

## 11. New Files & Changed Files

### New
| File | Purpose |
|---|---|
| `src/proxy.ts` | Next.js 16 proxy — session existence check, redirect to /login |
| `src/lib/dal.ts` | DAL — `resolveCallerContext()`, `resolveOrgId()`, React `cache()` |
| `src/lib/db/organizations.ts` | org CRUD, `assertOrgWithinBudget()` |
| `src/app/login/page.tsx` | Login page (email + password form → Supabase Auth) |
| `src/app/admin/page.tsx` | Super admin org list |
| `src/app/admin/orgs/[id]/page.tsx` | Org detail + impersonation |
| `src/app/admin/orgs/new/page.tsx` | Create org + seed user form |
| `supabase/migrations/0013_auth_multi_tenancy.sql` | Full migration |
| `scripts/seed-org.ts` | CLI onboarding script |

### Changed
| File | Change |
|---|---|
| `src/lib/api/route-helpers.ts` | `withClient()` adds org check + super_admin bypass |
| `src/lib/db/clients.ts` | `listClients()` + `createClient()` org-scoped |
| `src/lib/actions/*.ts` | All actions call `resolveCallerContext()` at top |
| `src/hooks/use-identity.ts` | Internals swap to Supabase session + profiles |
| `src/components/identity/identity-gate.tsx` | Replaced by login redirect |
| `src/components/identity/identity-chip.tsx` | Shows display_name + sign out |
| `src/lib/supabase/server.ts` | Upgrade to `@supabase/ssr` cookie client |

### Dependencies
- Add `@supabase/ssr` (replaces bare `@supabase/supabase-js` for SSR cookie sessions)

---

## 12. Out of Scope (Pilot)

- Multiple users per org (schema-ready; not built)
- Invite UI (org owner inviting teammates)
- Self-serve signup
- SSO / Google login
- Enforced RBAC beyond the Approve button (org_role stays cosmetic for senior/designer)
- Signed GCS URLs / media proxy (step 2)
- RLS beyond the two realtime tables
- In-product billing

---

## 13. ADR Decisions

Appended to `docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md §7`:

- **D48** — `org_memberships` join table from day one (not `profiles.org_id` column). Multi-seat = insert rows, no migration.
- **D49** — `platform_role` in `auth.users.app_metadata` (JWT claim, server-set only). `org_role` in `org_memberships` (mutable, per-membership). Two axes, no collision.
- **D50** — Next.js 16 `proxy.ts` for optimistic session check only; full context resolution in DAL (`src/lib/dal.ts`) wrapped in React `cache()`.
- **D51** — Super_admin impersonation via HttpOnly cookie (`orgId` override in DAL); no session swap; persistent banner.
- **D52** — `useIdentity()` public API frozen; internals swap from localStorage to Supabase session + profiles. Call sites unchanged.
