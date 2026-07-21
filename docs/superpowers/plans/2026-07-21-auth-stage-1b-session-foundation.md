# Auth Stage 1B — Session Foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the session/identity infrastructure — cookie-based Supabase auth clients, the cached DAL (`resolveCallerContext`), a super_admin guard, and a `/api/me` endpoint — with nothing wired up to gate or redirect anything yet. The app stays fully open after this sub-plan; enforcement is 1C.

**Architecture:** `@supabase/ssr` gives two new cookie-aware clients (server + browser) that sit alongside the existing service-role client (`src/lib/supabase/server.ts`, untouched — still the DB write path). A new `src/lib/dal.ts`, wrapped in React `cache()`, is the single place that turns a session into a `CallerContext` (userId, platformRole, orgId, orgRole). Its role-mapping logic is pure and unit-tested separately from the Supabase-calling wrapper, so the tricky bits (JWT claim parsing, owner→senior mapping) are verified without a live database.

**Tech Stack:** `@supabase/ssr`, Next.js 16 (`server-only`, `cookies()`), React `cache()`, TypeScript, Vitest, Zod (not needed in this sub-plan — no forms yet).

**Parent:** `docs/superpowers/plans/2026-07-21-auth-stage-1-index.md` · **Spec:** `docs/superpowers/specs/2026-07-21-auth-staging-rollout-plan.md` (Stage 1) · **Follows:** 1A (schema + data migration — done on staging, commits `60692b4`/`668b488`/`449bb9e`)

## Global Constraints

- **Nothing gates anything in 1B.** No `proxy.ts`, no `withClient` change, no page redirects wired in. That is 1C. This sub-plan only builds the infrastructure those will call.
- **`useIdentity()` public API stays frozen and untouched in 1B** (D53) — it is not swapped until 1C. `/api/me` is built here but nothing consumes it yet.
- **API routes:** use `apiError` / `apiOk` from `src/lib/api/route-helpers.ts` — never `NextResponse.json(...)` directly.
- **`platform_role` lives only in `auth.users.app_metadata`** (server-set JWT claim). Never a DB column, never client-writable. Read via the session, not queried from a table.
- **Owner = full access (per pilot).** No `senior`/`designer` distinction is built. A logged-in owner maps to `role: "senior"` (Approve-eligible). `org_role`'s check constraint still accepts all three values; only `owner` rows exist.
- **No new migrations in 1B.** The schema from 1A is sufficient; `org_memberships` reads use the existing service-role client (no RLS, per Stage 1's constraint — Stage 2 territory).
- **TDD for pure logic:** the role-mapping helpers get a failing test written first, per this repo's `superpowers:test-driven-development` convention already used in 1A-adjacent work.

## File Structure

**New files**
| File | Responsibility |
|---|---|
| `src/lib/supabase/ssr-server.ts` | Cookie-based server Supabase client (auth/session reads only — subject to RLS, unlike the service-role client) |
| `src/lib/dal-logic.ts` | Pure helpers: `mapAppMetadataToPlatformRole()`, `orgRoleToIdentityRole()`, plus the `CallerContext`/`PlatformRole`/`OrgRole` types |
| `src/lib/dal-logic.test.ts` | Unit tests for the pure helpers |
| `src/lib/dal.ts` | `resolveCallerContext()`, `resolveOrgId()` — cached, Supabase-calling wrappers around the pure logic |
| `src/lib/auth/require-super-admin.ts` | `requireSuperAdmin()` guard for future admin routes/actions (1D consumes it; not called from anywhere yet) |
| `src/app/api/me/route.ts` | `GET /api/me` → `{ name, role }`, for the future `useIdentity()` swap (1C consumes it) |

**Modified files**
| File | Change |
|---|---|
| `package.json` | Add `@supabase/ssr` |
| `src/lib/supabase/client.ts` | Browser client upgraded to `@supabase/ssr`'s `createBrowserClient` (cookie-aware, so authenticated Realtime carries the caller's JWT once login exists) |

No deletions in 1B.

---

## Task 1: Add `@supabase/ssr` and the cookie auth clients

**Files:**
- Modify: `package.json`
- Create: `src/lib/supabase/ssr-server.ts`
- Modify: `src/lib/supabase/client.ts`

**Interfaces:**
- Produces: `createSSRServerClient(): Promise<SupabaseClient>` (reads/writes auth cookies via `next/headers`); upgraded `createBrowserSupabase(): SupabaseClient`.

- [ ] **Step 1: Install the dependency**

Run: `npm install @supabase/ssr`
Expected: `@supabase/ssr` appears in `package.json` dependencies.

- [ ] **Step 2: Create the SSR server client**

Create `src/lib/supabase/ssr-server.ts`:

```ts
import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

// Cookie-based Supabase client for AUTH/SESSION only (getUser, signIn, signOut).
// Uses the ANON key + the caller's session cookie — subject to RLS, unlike the
// service-role client in ./server.ts (which stays the DB write path). Two clients,
// two jobs: this one knows who the caller is; that one bypasses security to write.
export async function createSSRServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      "Missing Supabase env vars — set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY",
    );
  }
  const cookieStore = await cookies();
  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // set() throws in a Server Component render (read-only cookies). Safe to
          // ignore: proxy.ts (Stage 1C) refreshes the session cookie on the next request.
        }
      },
    },
  });
}
```

- [ ] **Step 3: Upgrade the browser client**

Replace `src/lib/supabase/client.ts` contents:

```ts
import { createBrowserClient } from "@supabase/ssr";

// Browser-safe Supabase singleton. Uses anon key + cookie session (via @supabase/ssr),
// so authenticated Realtime carries the caller's JWT once login exists (Stage 1C).
// Do NOT import "server-only".
let _client: ReturnType<typeof createBrowserClient> | null = null;

export function createBrowserSupabase() {
  if (_client) return _client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      "Missing Supabase browser env vars: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY",
    );
  }
  _client = createBrowserClient(url, anonKey);
  return _client;
}
```

- [ ] **Step 4: Verify the build compiles**

Run: `npm run build`
Expected: build succeeds (types resolve for `@supabase/ssr`; no other file references the old client shape differently).

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/lib/supabase/ssr-server.ts src/lib/supabase/client.ts
git commit -m "feat(auth): add @supabase/ssr cookie clients (server + browser)"
```

---

## Task 2: DAL pure logic — role mapping (TDD)

**Files:**
- Create: `src/lib/dal-logic.ts`
- Create: `src/lib/dal-logic.test.ts`

**Interfaces:**
- Produces:
  - `type PlatformRole = "super_admin" | "member"`
  - `type OrgRole = "owner" | "senior" | "designer"`
  - `type CallerContext = { userId: string; platformRole: PlatformRole; orgId: string; orgRole: OrgRole }`
  - `mapAppMetadataToPlatformRole(appMetadata: unknown): PlatformRole` — fail-closed to `"member"`
  - `orgRoleToIdentityRole(orgRole: OrgRole): "senior" | "designer"` — owner/senior → `"senior"`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/dal-logic.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { mapAppMetadataToPlatformRole, orgRoleToIdentityRole } from "./dal-logic";

describe("mapAppMetadataToPlatformRole", () => {
  it("reads super_admin from app_metadata", () => {
    expect(mapAppMetadataToPlatformRole({ platform_role: "super_admin" })).toBe("super_admin");
  });
  it("defaults to member for anything else (fail closed)", () => {
    expect(mapAppMetadataToPlatformRole({ platform_role: "member" })).toBe("member");
    expect(mapAppMetadataToPlatformRole({})).toBe("member");
    expect(mapAppMetadataToPlatformRole(null)).toBe("member");
    expect(mapAppMetadataToPlatformRole(undefined)).toBe("member");
    expect(mapAppMetadataToPlatformRole({ platform_role: "hacker" })).toBe("member");
    expect(mapAppMetadataToPlatformRole("super_admin")).toBe("member"); // wrong shape entirely
  });
});

describe("orgRoleToIdentityRole", () => {
  it("maps owner to senior (full access, can approve)", () => {
    expect(orgRoleToIdentityRole("owner")).toBe("senior");
  });
  it("maps senior to senior", () => {
    expect(orgRoleToIdentityRole("senior")).toBe("senior");
  });
  it("maps designer to designer", () => {
    expect(orgRoleToIdentityRole("designer")).toBe("designer");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- dal-logic`
Expected: FAIL ("Cannot find module './dal-logic'").

- [ ] **Step 3: Implement the pure helpers**

Create `src/lib/dal-logic.ts`:

```ts
export type PlatformRole = "super_admin" | "member";
export type OrgRole = "owner" | "senior" | "designer";

export type CallerContext = {
  userId: string;
  platformRole: PlatformRole;
  orgId: string;
  orgRole: OrgRole;
};

// Reads the platform role from a JWT's app_metadata. Anything that is not the exact
// string "super_admin" is treated as a plain member — fail closed.
export function mapAppMetadataToPlatformRole(appMetadata: unknown): PlatformRole {
  if (
    appMetadata &&
    typeof appMetadata === "object" &&
    (appMetadata as Record<string, unknown>).platform_role === "super_admin"
  ) {
    return "super_admin";
  }
  return "member";
}

// The frozen Identity.role only distinguishes "can approve" (senior) from "cannot"
// (designer). Owners get full access in the pilot, so they map to senior. (Pilot only
// ever creates owner memberships — see D80/the Stage 1 index doc.)
export function orgRoleToIdentityRole(orgRole: OrgRole): "senior" | "designer" {
  return orgRole === "designer" ? "designer" : "senior";
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- dal-logic`
Expected: PASS, all 7 assertions.

- [ ] **Step 5: Commit**

```bash
git add src/lib/dal-logic.ts src/lib/dal-logic.test.ts
git commit -m "feat(auth): pure role-mapping helpers for the DAL (TDD)"
```

---

## Task 3: DAL — `resolveCallerContext` / `resolveOrgId`

**Files:**
- Create: `src/lib/dal.ts`

**Interfaces:**
- Consumes: `createSSRServerClient` (Task 1), `createServerSupabase` (existing service-role client), `mapAppMetadataToPlatformRole` (Task 2).
- Produces: `resolveCallerContext(): Promise<CallerContext>` — cached per request, redirects to `/login` if unauthenticated or unprovisioned; `resolveOrgId(): Promise<string>` — cached, returns `caller.orgId` (impersonation override arrives in Stage 4).

- [ ] **Step 1: Implement the DAL**

Create `src/lib/dal.ts`:

```ts
import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createSSRServerClient } from "@/lib/supabase/ssr-server";
import { createServerSupabase } from "@/lib/supabase/server";
import {
  mapAppMetadataToPlatformRole,
  type CallerContext,
  type OrgRole,
} from "./dal-logic";

export type { CallerContext } from "./dal-logic";

// The primary auth entry point (from Stage 1C onward). Every route handler / server
// action / protected page will call this at the top. Cached per request (React cache)
// so N callers in one render share one session read + one membership query. Redirects
// to /login if unauthenticated — note /login doesn't exist until Stage 1C, so hitting
// this unauthenticated in 1B correctly redirects toward a page that 404s for now.
export const resolveCallerContext = cache(async (): Promise<CallerContext> => {
  const supabase = await createSSRServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const platformRole = mapAppMetadataToPlatformRole(user.app_metadata);

  // Membership read uses the service-role client. org_memberships has no RLS by design
  // in Stage 1 (app-layer enforces) — see the Stage 1 plan's Global Constraints.
  const db = createServerSupabase();
  const { data: membership, error } = await db
    .from("org_memberships")
    .select("org_id, org_role")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) throw error;
  if (!membership) {
    // Authenticated but unprovisioned — treat as no access.
    redirect("/login?error=no-membership");
  }

  return {
    userId: user.id,
    platformRole,
    orgId: membership.org_id as string,
    orgRole: membership.org_role as OrgRole,
  };
});

// The org whose data the caller should see. In Stage 1C this is just their own org;
// Stage 4 layers impersonation on top by reading a cookie here.
export const resolveOrgId = cache(async (): Promise<string> => {
  const caller = await resolveCallerContext();
  return caller.orgId;
});
```

- [ ] **Step 2: Verify the build compiles**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/dal.ts
git commit -m "feat(auth): DAL resolveCallerContext + resolveOrgId"
```

---

## Task 4: `requireSuperAdmin` guard

**Files:**
- Create: `src/lib/auth/require-super-admin.ts`

**Interfaces:**
- Consumes: `resolveCallerContext` (Task 3).
- Produces: `requireSuperAdmin(): Promise<CallerContext>` — returns the caller if `platformRole === "super_admin"`, else `notFound()`. Not called from anywhere yet (1D wires it into `/admin/*`).

- [ ] **Step 1: Implement the guard**

Create `src/lib/auth/require-super-admin.ts`:

```ts
import "server-only";
import { notFound } from "next/navigation";
import { resolveCallerContext, type CallerContext } from "@/lib/dal";

// Gate for /admin/* pages and admin actions (Stage 1D). Non-super_admins get a 404 (do
// not reveal that an admin surface exists) — matches the withClient 404-not-403 rule
// this repo uses elsewhere (src/lib/api/route-helpers.ts).
export async function requireSuperAdmin(): Promise<CallerContext> {
  const caller = await resolveCallerContext();
  if (caller.platformRole !== "super_admin") notFound();
  return caller;
}
```

- [ ] **Step 2: Verify the build compiles**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/auth/require-super-admin.ts
git commit -m "feat(auth): requireSuperAdmin guard for future admin surfaces"
```

---

## Task 5: `/api/me` endpoint

**Files:**
- Create: `src/app/api/me/route.ts`

**Interfaces:**
- Consumes: `resolveCallerContext` (Task 3), `orgRoleToIdentityRole` (Task 2), `createServerSupabase` (existing), `apiError`/`apiOk` (existing route helpers).
- Produces: `GET /api/me` → `200 { name: string; role: "senior" | "designer" }` when authenticated+provisioned. Nothing consumes this route yet — `useIdentity()` is swapped to call it in Stage 1C.

- [ ] **Step 1: Implement the route**

Create `src/app/api/me/route.ts`:

```ts
import { apiError, apiOk } from "@/lib/api/route-helpers";
import { resolveCallerContext } from "@/lib/dal";
import { orgRoleToIdentityRole } from "@/lib/dal-logic";
import { createServerSupabase } from "@/lib/supabase/server";

// Feeds the future useIdentity() swap (Stage 1C). Returns the display name + the frozen
// Identity.role (owner/senior → "senior" so Approve shows). See dal-logic.
export async function GET() {
  const caller = await resolveCallerContext();
  const db = createServerSupabase();
  const { data, error } = await db
    .from("profiles")
    .select("display_name")
    .eq("user_id", caller.userId)
    .maybeSingle();
  if (error) return apiError("Failed to load profile.", 500);

  return apiOk({
    name: (data?.display_name as string) ?? "User",
    role: orgRoleToIdentityRole(caller.orgRole),
  });
}
```

- [ ] **Step 2: Verify the build compiles**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 3: Manual verification — unauthenticated behavior**

Run: `npm run env:staging` (dev against staging), then in a browser with no Supabase session cookie, visit `http://localhost:3000/api/me`.
Expected: a redirect toward `/login`, which currently **404s** — that's correct for this point in the sequence (no `/login` page exists until 1C; this confirms `resolveCallerContext`'s redirect fires at all, not a bug). Full "logged-in user gets `{name, role}`" verification happens naturally once login exists in 1C.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/me
git commit -m "feat(auth): /api/me endpoint for the future useIdentity swap"
```

---

## Final verification (1B checkpoint)

- [ ] `npm test` — all pass, including the 7 new `dal-logic` assertions
- [ ] `npm run build` — clean build, no type errors
- [ ] `/api/me` unauthenticated → redirects toward `/login` (404 expected for now, per Task 5 Step 3 — not a bug)
- [ ] Nothing else in the app changed behavior: home page, canvas pages, existing identity chip/gate all still work exactly as before (nothing calls the new DAL yet)
- [ ] Five commits made (ssr clients, dal-logic, dal, require-super-admin, /api/me)

**On completion, update the tracker:** set 1B → ✅ in `2026-07-21-auth-stage-1-index.md`, then write sub-plan **1C (Login & Enforcement)** — the "flip the switch" phase where `proxy.ts` activates, `withClient` starts enforcing org checks, and the app actually requires login for the first time.

---

## Self-Review notes (traceability)

- **"Session foundation, no enforcement yet"** → confirmed by Global Constraints + Task 5's manual-verification note explaining the expected 404 is sequencing, not breakage.
- **Owner = full access** → `orgRoleToIdentityRole` (Task 2) maps owner→senior; tested explicitly.
- **`platform_role` fail-closed** → `mapAppMetadataToPlatformRole` tested against wrong-shape input (a bare string, `undefined`, an unrecognized value), not just the happy path.
- **`useIdentity()` frozen, untouched** → no file under `src/hooks` or `src/components/identity` appears in this plan's File Structure.
- **No new migrations, no RLS** → File Structure lists no `supabase/migrations/*` entries; Task 3's DAL explicitly notes why the service-role client is used for the membership read.
- **1D dependency satisfied** → `requireSuperAdmin` (Task 4) exists and is ready for 1D to import, even though nothing calls it yet.
